const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const ROOT=process.cwd(),OUT=path.resolve(__dirname,'..');
(async()=>{
 const canvas=require(path.join(ROOT,'tests/node_modules/@napi-rs/canvas'));for(const key of ['DOMMatrix','ImageData','Path2D'])globalThis[key]=canvas[key];
 const pdfjs=await import(pathToFileURL(path.join(ROOT,'tests/node_modules/pdfjs-dist/legacy/build/pdf.mjs')));
 const model=JSON.parse(fs.readFileSync(path.join(OUT,'validation/diagram-model.json'))),report={files:[],sourceChanges:[]},images=[];
 for(const file of model){const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path.join(OUT,file.stem+'.pdf'))),useSystemFonts:true,disableFontFace:true}).promise;
  if(doc.numPages!==file.pages.length)throw Error('Unexpected PDF page count: '+file.stem);
  const pages=[];
  for(let i=1;i<=doc.numPages;i++){
   const p=await doc.getPage(i),W=p.view[2]-p.view[0],H=p.view[3]-p.view[1],expected=file.pages[i-1];
   if(Math.abs(W-expected.w/96*72)>0.6||Math.abs(H-expected.h/96*72)>0.6)throw Error('Wrong paper dimensions: '+file.stem+'/'+i);
   const content=await p.getTextContent();if(!content.items.length)throw Error('PDF text is not searchable');
   const scale=file.stem==='MCPA_System_Flowchart'?1.6:1000/W,view=p.getViewport({scale});const c=canvas.createCanvas(Math.ceil(view.width),Math.ceil(view.height));await p.render({canvasContext:c.getContext('2d'),viewport:view}).promise;
   const preview=path.join(OUT,'validation',file.stem+'_'+String(i).padStart(2,'0')+'.png');fs.writeFileSync(preview,c.toBuffer('image/png'));
   if(file.stem==='MCPA_System_Flowchart')images.push({file:preview,page:i});
   pages.push({page:i,widthPoints:W,heightPoints:H,widthInches:W/72,heightInches:H/72,textItems:content.items.length});
  }
  report.files.push({file:file.stem+'.pdf',pageCount:doc.numPages,pages});await doc.destroy();
 }
 const thumbW=340,thumbH=545,sheet=canvas.createCanvas(4*thumbW,4*thumbH),ctx=sheet.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,sheet.width,sheet.height);
 for(const [idx,item]of images.entries()){const im=await canvas.loadImage(item.file),x=(idx%4)*thumbW,y=Math.floor(idx/4)*thumbH,scale=Math.min(328/im.width,502/im.height);ctx.fillStyle='black';ctx.font='14px Arial';ctx.fillText('Page '+item.page,x+10,y+20);ctx.drawImage(im,x+6,y+30,im.width*scale,im.height*scale);}
 fs.writeFileSync(path.join(OUT,'validation/flowchart-contact-sheet.png'),sheet.toBuffer('image/png'));
 const baseline=JSON.parse(fs.readFileSync(path.join(OUT,'validation/source-baseline.json')));for(const item of baseline.files){const source=path.join(ROOT,item.file);if(!fs.existsSync(source)||crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')!==item.sha256)report.sourceChanges.push(item.file);}
 report.passed=report.sourceChanges.length===0;report.flowchartWithin13LongBondPages=report.files[0].pageCount<=13&&report.files[0].pages.every(p=>(Math.abs(p.widthInches-8.5)<0.01&&Math.abs(p.heightInches-13)<0.01)||(Math.abs(p.widthInches-13)<0.01&&Math.abs(p.heightInches-8.5)<0.01));report.baselineFilesVerified=baseline.files.length;
 fs.writeFileSync(path.join(OUT,'validation/pdf-and-source-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({files:report.files.map(f=>({file:f.file,pages:f.pageCount,paper:[f.pages[0].widthInches,f.pages[0].heightInches]})),sourceChanges:report.sourceChanges,baselineFiles:baseline.files.length}));
 if(!report.passed||!report.flowchartWithin13LongBondPages)throw Error('PDF / source validation failed');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
