/* Local equipment tags preserve the scanner's plain Asset ID payload. */
(function(){
 'use strict';
 function image(assetId,size=120,doc=document){
  const qr=window.MCPAQRCore.create(String(assetId),{errorCorrectionLevel:'M'}),margin=4,total=qr.modules.size+margin*2;
  const canvas=doc.createElement('canvas');canvas.width=canvas.height=Math.max(size,total*4);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';
  const edge=n=>Math.floor(n*canvas.width/total);
  for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.get(y,x))ctx.fillRect(edge(x+margin),edge(y+margin),edge(x+margin+1)-edge(x+margin),edge(y+margin+1)-edge(y+margin));
  const img=doc.createElement('img');img.alt='Equipment QR code';img.width=img.height=120;img.src=canvas.toDataURL('image/png');return img;
 }
 function loaded(img){return new Promise((resolve,reject)=>{
  if(img.complete){img.naturalWidth?resolve():reject(Error('QR image could not load.'));return;}
  const timer=setTimeout(()=>{cleanup();reject(Error('QR image loading timed out.'));},5000);
  const cleanup=()=>{clearTimeout(timer);img.removeEventListener('load',ready);img.removeEventListener('error',failed);};
  const ready=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(Error('QR image could not load.'));};
  img.addEventListener('load',ready,{once:true});img.addEventListener('error',failed,{once:true});
 });}
 async function print(assetId){
  const popup=window.open('','_blank','width=400,height=400');
  if(!popup){window.alert('Allow this equipment tag window to print.');return;}
  popup.opener=null;
  try{
   const doc=popup.document;doc.open();doc.write('<!doctype html><html><head><title>Equipment tag</title><style>@page{margin:2mm}body{font-family:system-ui;text-align:center;margin:0;padding:8px;background:white;color:#111}img{display:block;width:30mm;height:30mm;margin:4px auto}.asset-id{font-size:11px;font-weight:800;overflow-wrap:anywhere}.company-name{font-size:8px;font-weight:700}</style></head><body></body></html>');doc.close();
   doc.title='Print Tag - '+assetId;
   const company=doc.createElement('div');company.className='company-name';company.textContent='BuildRight Corp.';
   const img=image(assetId,256,doc),label=doc.createElement('div');label.className='asset-id';label.textContent=assetId;
   doc.body.append(company,img,label);await loaded(img);
   popup.addEventListener('afterprint',()=>popup.close(),{once:true});popup.focus();popup.print();
  }catch{if(!popup.closed)popup.document.body.textContent='QR tag could not be prepared. Close this window and retry.';}
 }
 Object.defineProperty(window,'MCPAEquipmentQR',{value:Object.freeze({image,print}),writable:false,configurable:false});
})();
