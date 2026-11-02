const assert=require('node:assert/strict'),jsQR=require('jsqr');
exports.verify=async({fixture:f,evaluate,wait,go,click,fill,submit,pass,capture})=>{
 const attacks=['NORMAL-QR-001',"Q');window.__assetInjection=1;//",'<img src=x onerror=window.__assetInjection=2>','ABC" autofocus onfocus="window.__assetInjection=3'];
 for(let n=0;n<attacks.length;n++)await f.query(f.actors.handler,"insert into equipment(id,asset_id,name,category,condition,tracking_type,quantity,status) values($3,$1,$2,'Power Tools','Good','Individual',1,'AVAILABLE')",[attacks[n],'Safe synthetic asset '+n,require('node:crypto').randomUUID()]);
 await go('masterlist');await wait('typeof initMasterlist==="function"');await evaluate('initMasterlist()');
 const pixels=selector=>evaluate(`(()=>{const img=document.querySelector(${JSON.stringify(selector)}),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);return {pixels:Array.from(x.getImageData(0,0,c.width,c.height).data),width:c.width,height:c.height};})()`);
 for(let n=0;n<attacks.length;n++){
  const id=attacks[n];await evaluate(`document.querySelector('#searchEquipment').value=${JSON.stringify(id)};document.querySelector('#searchEquipment').dispatchEvent(new Event('input',{bubbles:true}));`);
  await wait(`Array.from(document.querySelectorAll('tr .tool-id-chip')).some(e=>e.textContent===${JSON.stringify(id)})`);
  assert.equal(await evaluate('document.querySelectorAll("tr [onclick],tr [onfocus],tr img[src=x]").length'),0);
  await evaluate(`Array.from(document.querySelectorAll('tr')).find(r=>r.querySelector('.tool-id-chip')?.textContent===${JSON.stringify(id)}).querySelector('[data-equipment-action=view]').click()`);
  await wait('document.querySelector("#qrContainerProfile img")?.naturalWidth>0');
  assert.equal(await evaluate('document.querySelector("#tool-profile-content h1, #screen-tool-profile h1, [id=toolProfileContent] h1")?.textContent.includes('+JSON.stringify(id)+') || document.body.innerText.includes('+JSON.stringify(id)+')'),true);
  const p=await pixels('#qrContainerProfile img');assert.equal(jsQR(new Uint8ClampedArray(p.pixels),p.width,p.height)?.data,id);
  assert.match(await evaluate('document.querySelector("#qrContainerProfile img").src'),/^data:image\/png;base64,/);
  assert.equal(await evaluate('document.querySelectorAll("[data-equipment-action][onclick]").length'),0);
  // Exercise the real Print Tag click handler with a same-origin print-document adapter.
  await evaluate(`(()=>{window.__savedOpen=window.open;window.__printed=0;const frame=document.createElement('iframe');frame.id='print-test';frame.hidden=true;document.body.append(frame);window.open=()=>{const popup={document:frame.contentDocument,opener:null,closed:false,addEventListener(){},focus(){},print(){window.__printed++},close(){}};window.__printPopup=popup;return popup;};document.querySelector('[data-equipment-action=print]').click();})()`);
  await wait('window.__printed===1||window.__printPopup?.document?.body?.textContent.includes("could not be prepared")');
  assert.equal(await evaluate('window.__printed'),1,await evaluate('JSON.stringify({exists:!!window.__printPopup,body:window.__printPopup?.document?.body?.innerHTML})'));
  const printed=await evaluate(`(()=>{const d=window.__printPopup.document;const img=d.querySelector('img'),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);return {label:d.querySelector('.asset-id').textContent,title:d.title,handlers:d.querySelectorAll('[onload],[onerror],script').length,width:c.width,height:c.height,pixels:Array.from(x.getImageData(0,0,c.width,c.height).data),css:d.querySelector('style').textContent};})()`);
  assert.equal(printed.label,id);assert.equal(printed.title,'Print Tag - '+id);assert.equal(printed.handlers,0);assert.match(printed.css,/width:30mm;height:30mm/);assert.equal(jsQR(new Uint8ClampedArray(printed.pixels),printed.width,printed.height)?.data,id);
  await evaluate('window.open=window.__savedOpen;document.querySelector("#print-test").remove();document.querySelector("[data-equipment-action=edit]").click()');
  await wait('document.querySelector("#equipmentModal").open');assert.equal(await evaluate('document.querySelector("#equipmentType").value'),'Safe synthetic asset '+n);
  await evaluate('document.querySelector("#equipmentModal").dispatchEvent(new Event("cancel",{cancelable:true}))');await wait('!document.querySelector("#equipmentModal").open');
  assert.equal(await evaluate('window.__assetInjection||0'),0);
  await go('masterlist');
 }
 pass('HIGH 1 real DOM safely renders normal, quote, markup and event-syntax Asset IDs; Admin views Tool Handler records and View/Edit/Print work');
 pass('MEDIUM 4 screen and print PNGs decode to exact Asset IDs with local QR; 30mm print, load completion and text bindings verified');
 await capture('safe-equipment-qr');
 // Mount the shipped QR composer with a synthetic authorized directory and transport.
 await evaluate(`(async()=>{const {mountMovementComposer}=await import('./js/upgrades/custody-lifecycle/composer.mjs');const {recipientLabel}=await import('./js/upgrades/transfer-review/transfer.mjs');const root=document.createElement('section');root.id='composer-test';document.querySelector('#content').replaceChildren(root);const snapshot={profile:{id:'sender',role:'engineer'},assets:[{id:'QR-SAFE',name:'QR safe asset',individual:true,status:'IN_USE',movementLock:null}],recipients:[{id:'uuid-a',name:'Same Name',role:'engineer'},{id:'uuid-b',name:'Same Name',role:'engineer'}],sites:[{id:'site-a',name:'Project A',assignedEngineerId:'uuid-a'},{id:'site-b',name:'Project B',assignedEngineerId:'uuid-b'}],transfers:[],returns:[],evidence:[]};window.__expectedRecipientLabels=snapshot.recipients.map(p=>recipientLabel(p,snapshot));window.__composer=await mountMovementComposer(root,{intent:'transfer',api:{snapshot:async()=>snapshot,lookup:async id=>({id,name:'QR safe asset'}),mutate:async(action,payload)=>{window.__qrSubmission={action,payload};return {id:'TRF-LOCAL'};}}});})()`);
 assert.deepEqual(await evaluate('[...document.querySelector("#composer-test [name=recipient]").options].slice(1).map(o=>o.textContent)'),await evaluate('window.__expectedRecipientLabels'));
 await fill('#composer-test [name=recipient]','uuid-b');await fill('#composer-test [name=destination]','site-b');
 assert.match(await evaluate('document.querySelector("[data-destination-help]").textContent'),/Same Name.*Engr.*Project B.*uuid-b.*Project B/);
 await fill('#composer-test [data-reference]','QR-SAFE');await click('#composer-test [data-add]');await wait('document.querySelector("#composer-test [data-selected] li")');await submit('#composer-test [data-composer]');await wait('!!window.__qrSubmission');
 assert.deepEqual(await evaluate('window.__qrSubmission'),{action:'createTransfer',payload:{assetIds:['QR-SAFE'],destinationId:'site-b',notes:'',receiverId:'uuid-b',evidenceIds:[]}});
 pass('MEDIUM 3 QR composer duplicate-name/role labels match primary form; project confirmation and submitted UUID are exact');
 await evaluate('window.__composer.destroy()');
 // All shared presentation paths receive the same record-aware semantics.
 const shared=await evaluate(`(()=>{const t={id:'T',status:'received',toolIds:['A','B'],inspections:[{toolId:'A',condition:'good',tested:true,physicallyReceived:true},{toolId:'B',condition:'lost'}]},data={transfers:[t]},d=MCPADisplay;return {status:d.status(t.status,'transfer',t),activity:d.activity({action:'transfer_received',entityId:'T'},data).title,notice:d.notification({kind:'movement',data:{action:'receiveTransfer',entityId:'T'}},data).title,unknown:d.status('received','transfer')};})()`);
 assert.match(shared.status,/Missing equipment/);assert.match(shared.activity,/Missing equipment/);assert.match(shared.notice,/Missing equipment/);assert.equal(shared.unknown,'Receipt recorded');pass('MEDIUM 2 shared movement/activity/notification labels preserve missing and unknown historical receipts');
};
