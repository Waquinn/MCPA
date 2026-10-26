const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=process.cwd(),out=path.resolve(__dirname,'../validation');
(async()=>{
 const canvas=require(path.join(root,'tests/node_modules/@napi-rs/canvas'));
 for(const key of ['DOMMatrix','ImageData','Path2D'])globalThis[key]=canvas[key];
 const pdfjs=await import(pathToFileURL(path.join(root,'tests/node_modules/pdfjs-dist/legacy/build/pdf.mjs')));
 const report=[];
 for(const [name,file]of [['main','C:/Users/Roland Carl/Downloads/00_Main.drawio.pdf'],['authentication','C:/Users/Roland Carl/Downloads/01_Authentication.drawio.pdf']]){
  const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(file)),useSystemFonts:true,disableFontFace:true}).promise;
  const pages=[];
  for(let i=1;i<=doc.numPages;i++){
   const p=await doc.getPage(i),content=await p.getTextContent(),view=p.getViewport({scale:1.1});
   pages.push({page:i,width:p.view[2],height:p.view[3],text:content.items.map(x=>x.str).join(' ')});
   if(i<=2){const c=canvas.createCanvas(Math.ceil(view.width),Math.ceil(view.height));await p.render({canvasContext:c.getContext('2d'),viewport:view}).promise;fs.writeFileSync(path.join(out,'reference-'+name+'-'+i+'.png'),c.toBuffer('image/png'));}
  }
  report.push({name,pages});await doc.destroy();
 }
 fs.writeFileSync(path.join(out,'reference-analysis.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
