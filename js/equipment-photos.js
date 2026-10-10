/* Private equipment photos: immutable uploads and short-lived, authorized display URLs. */
(function () {
  'use strict';
  const bucket = 'equipment-photos', prefix = 'storage://' + bucket + '/';
  const maxBytes = 5 * 1024 * 1024, types = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const cache = new Map(), inFlight = new Map();
  let sessionKey = null;
  function identity(admin = false) {
    const user = window.MCPAAuth?.requireLive();
    if (!user || (admin && user.role !== 'admin')) throw new Error('Only an active Admin account can save equipment photos.');
    if (sessionKey !== user.id) { cache.clear(); inFlight.clear(); sessionKey = user.id; }
    return user;
  }
  function pathFromReference(reference) {
    if (typeof reference !== 'string' || !reference.startsWith(prefix)) return null;
    const path = reference.slice(prefix.length);
    return /^[A-Za-z0-9_-]{1,120}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/i.test(path) ? path : null;
  }
  async function validate(file) {
    if (!file || !types[file.type]) throw new Error('Choose a JPEG, PNG, or WebP photo.');
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) throw new Error('Choose a photo between 1 byte and 5 MB.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) throw new Error('The selected file is not a valid JPEG, PNG, or WebP photo.');
    return file;
  }
  async function prepare(file, assetId, previous = null) {
    const user = identity(true);
    await validate(file);
    if (!assetId || !String(assetId).trim()) throw new Error('Save the photo with a valid equipment ID.');
    // Reuse the staged upload after a metadata error; keep the existing photo untouched.
    if (previous?.file === file && previous.assetId === assetId && previous.ownerId === user.id) return previous;
    // Storage paths use safe identifiers; unusual legacy IDs still associate
    // through equipment.image_url without depending on URL percent decoding.
    const folder = /^[A-Za-z0-9_-]{1,120}$/.test(String(assetId)) ? String(assetId) : 'asset-' + crypto.randomUUID();
    const path = folder + '/' + crypto.randomUUID() + '.' + types[file.type];
    let result;
    try { result = await window.EquipmentTracking.client().storage.from(bucket).upload(path, file, {contentType:file.type,cacheControl:'3600',upsert:false}); }
    catch (_) { throw new Error('Photo upload could not complete. Your item has not been saved. Check your connection and retry.'); }
    if (result.error) throw new Error('Photo upload failed. Check your connection and that equipment photo storage is installed, then retry. Your item has not been saved.');
    if (identity(true).id !== user.id) throw new Error('Your account changed during the upload. Sign in again before saving the item.');
    return {file, assetId, ownerId:user.id, path, reference:prefix + path};
  }
  async function resolve(reference) {
    const path = pathFromReference(reference);
    if (!path) return null;
    const user = identity();
    const key = user.id + ':' + path;
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now()) return saved.url;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      const {data,error} = await window.EquipmentTracking.client().storage.from(bucket).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw new Error('The saved photo could not load.');
      if (identity().id !== user.id) throw new Error('Your account changed while loading the photo.');
      cache.set(key,{url:data.signedUrl,expires:Date.now() + 50 * 60 * 1000});
      return data.signedUrl;
    })();
    inFlight.set(key,pending);
    try { return await pending; } finally { inFlight.delete(key); }
  }
  function hydrate(root = document) {
    const targets = [...(root.matches?.('[data-equipment-photo]') ? [root] : []), ...root.querySelectorAll('[data-equipment-photo]')];
    targets.forEach(target => {
      const reference = target.dataset.equipmentPhoto;
      resolve(reference).then(url => {
        if (!url || !target.isConnected || target.dataset.equipmentPhoto !== reference) return;
        let img = target.querySelector('img');
        if (!img) { img = document.createElement('img'); img.alt = target.dataset.photoAlt || 'Equipment photo'; img.loading='lazy'; img.decoding='async'; target.append(img); }
        if (img.src !== url) img.src = url;
        target.removeAttribute('title');
      }).catch(() => { if (target.isConnected) target.title = 'Photo unavailable. The equipment details remain available.'; });
    });
  }
  window.EquipmentPhotos = {bucket, maxBytes, validate, prepare, resolve, pathFromReference, hydrate};
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {if (node.nodeType === 1) hydrate(node);} )));
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pagehide',() => observer.disconnect(),{once:true});
  }
  // Refresh expiring signed images while a details page stays open.
  const interval = setInterval(() => { if (!document.hidden && window.MCPAAuth?.profile && !window.MCPAAuth.isDemo) hydrate(); },60000);
  window.addEventListener('pagehide',() => clearInterval(interval),{once:true});
})();
