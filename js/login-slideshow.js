/* Decorative media only. Authentication explicitly starts/stops this controller. */
(function () {
  'use strict';
  const host = document.getElementById('login-screen');
  const stage = document.getElementById('login-slideshow');
  const button = host?.querySelector('[data-login-motion]');
  if (!stage || !button) return;
  // Resolve from this script, including /MCPA/ and /MCPA/2-engr/ entry points.
  const directory = new URL('../images/login-slideshow/', document.currentScript.src);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 900px), (max-width: 1200px) and (max-aspect-ratio: 3/2)');
  const HOLD = 5500, FADE = 1350;
  const firstLayer = stage.querySelector('.login-slide');
  const layers = [firstLayer, firstLayer.cloneNode(true)];
  layers[1].style.opacity = '0';
  layers[1].querySelector('picture').replaceWith(document.createElement('img'));
  layers[1].querySelector('img').className = 'login-photo';
  layers[1].querySelector('img').alt = '';
  stage.append(layers[1]);
  const mobilePhoto = stage.querySelector('.login-mobile-photo');
  for (const image of [...layers.map(layer => layer.querySelector('img')), mobilePhoto]) {
    image.addEventListener('error', () => { image.style.visibility = 'hidden'; });
    if (image.complete && !image.naturalWidth) image.style.visibility = 'hidden';
  }
  const cache = new Map();
  let visible = true, manuallyPaused = false, ready = false, slot = 0, index = 0;
  let timer = null, due = 0, remaining = HOLD, generation = 0, advancing = false;
  let progress = null;
  let fade = null;
  const running = () => visible && ready && !host.hidden && !host.classList.contains('hidden') && !document.hidden && !compact.matches && !manuallyPaused && !reducedMotion.matches;
  const url = (number, extension) => new URL(`project-${number + 1}.${extension}`, directory).href;
  function load(number) {
    if (cache.has(number)) return cache.get(number);
    const pending = (async () => {
      for (const extension of ['webp', 'png']) {
        const image = new Image();
        image.decoding = 'async';
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Image timeout')); }, 10000);
            image.onload = () => { clearTimeout(timeout); resolve(); };
            image.onerror = () => { clearTimeout(timeout); reject(new Error('Image unavailable')); };
            image.src = url(number, extension);
          });
          await image.decode();
          return image;
        } catch (_) { /* Try the preserved PNG, then skip this photograph. */ }
      }
      return null;
    })();
    cache.set(number, pending);
    return pending;
  }
  function prepare(layer, image, number) {
    // Insert the actual decoded node. Reassigning its URL to a different async
    // image can start another decode and leave a blank frame during a crossfade.
    // Replacing the initial picture also removes sources that override PNG fallback.
    image.className = 'login-photo';
    image.alt = '';
    layer.querySelector('.login-scene').replaceChildren(image);
    layer.dataset.project = String(number + 1);
  }
  function updateCounter() {
    host.querySelector('[data-login-number]').textContent = String(index + 1).padStart(2, '0');
    host.querySelector('[data-login-counter]').setAttribute('aria-label', `Photograph ${index + 1} of 9`);
  }
  function startProgress() {
    progress?.cancel();
    progress = host.querySelector('[data-login-progress]').animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: HOLD, easing: 'linear', fill: 'forwards' }
    );
  }
  function schedule() {
    if (!running() || timer !== null || advancing) return;
    due = performance.now() + remaining;
    timer = setTimeout(() => { timer = null; remaining = 0; advance(); }, remaining);
  }
  async function advance() {
    const revision = generation;
    advancing = true;
    try {
      for (let step = 1; step <= 9; step++) {
        const next = (index + step) % 9;
        const image = await load(next);
        if (revision !== generation || !running()) return;
        if (!image) continue;
        const previous = layers[slot];
        slot = 1 - slot;
        const incoming = layers[slot];
        prepare(incoming, image, next);
        // A delayed finish event from the last fade must not hide a reused layer.
        // This can happen when the browser suspends or defers animation frames.
        if (fade) { fade.onfinish = null; fade.cancel(); }
        previous.style.zIndex = '0';
        previous.style.opacity = '1';
        incoming.style.zIndex = '1';
        incoming.style.opacity = '1';
        // Fade over an opaque outgoing image, avoiding a dark dip midway.
        const transition = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, easing: 'ease-in-out' });
        fade = transition;
        transition.onfinish = () => {
          if (fade === transition) {
            previous.style.opacity = '0'; incoming.style.opacity = '1';
            // A completed Animation can restart from zero when paused then played.
            // Retire it so visibility changes only resume an unfinished crossfade.
            transition.onfinish = null;
            fade = null;
          }
        };
        index = next;
        stage.dataset.project = String(index + 1);
        updateCounter();
        startProgress();
        remaining = HOLD;
        // Keep only the displayed and upcoming decoded images in our cache.
        for (const key of cache.keys()) if (key !== index) cache.delete(key);
        load((index + 1) % 9);
        return;
      }
      remaining = HOLD; // Solid charcoal remains usable even if every photo fails.
    } finally {
      advancing = false;
      schedule();
    }
  }
  function sync() {
    button.hidden = compact.matches || reducedMotion.matches || !ready;
    button.querySelector('[data-login-motion-label]').textContent = manuallyPaused ? 'Play' : 'Pause';
    button.setAttribute('aria-label', manuallyPaused ? 'Play slideshow' : 'Pause slideshow');
    button.querySelector('[data-login-motion-icon]').setAttribute('d', manuallyPaused ? 'M3 1l8 5-8 5z' : 'M2 1h3v10H2zm5 0h3v10H7z');
    stage.dataset.paused = String(!running());
    if (running()) {
      if (!progress) startProgress();
      else if (progress.playState === 'paused') progress.play();
      if (fade?.playState === 'paused') fade.play();
      load((index + 1) % 9);
      schedule();
    } else {
      if (timer !== null) { clearTimeout(timer); timer = null; remaining = Math.max(0, due - performance.now()); }
      if (reducedMotion.matches) {
        progress?.cancel(); progress = null;
        if (fade) { fade.onfinish = null; fade.cancel(); fade = null; }
        layers[slot].style.opacity = '1';
        layers[1 - slot].style.opacity = '0';
      } else {
        progress?.pause();
        fade?.pause();
      }
    }
  }
  button.addEventListener('click', () => { manuallyPaused = !manuallyPaused; sync(); });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  compact.addEventListener('change', sync);
  // Also cover direct host hiding and back/forward-cache restoration.
  new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('pagehide', () => { visible = false; ++generation; sync(); });
  window.addEventListener('pageshow', () => { visible = !host.classList.contains('hidden'); sync(); });
  window.MCPALoginSlideshow = {
    show() { visible = true; sync(); },
    hide() { visible = false; ++generation; sync(); }
  };
  // The HTML already displays the high-priority first photo while JS initializes.
  (async () => {
    for (let first = 0; first < 9; first++) {
      const image = await load(first);
      if (!image) continue;
      prepare(layers[0], image, first);
      // One deterministic image for this visit, independent of desktop slides and
      // authentication rerenders. Use the first successful source after failures.
      mobilePhoto.closest('picture').querySelector('source')?.remove();
      mobilePhoto.src = image.src;
      mobilePhoto.style.visibility = 'visible';
      mobilePhoto.dataset.project = String(first + 1);
      index = first;
      stage.dataset.project = String(first + 1);
      updateCounter();
      break;
    }
    ready = Boolean(stage.dataset.project);
    stage.dataset.unavailable = String(!ready);
    sync();
  })();
})();
