const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const ROOT=process.cwd(),OUT=path.resolve(__dirname,'..'),U=require(path.join(ROOT,'SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/drawio-style-utils.cjs'));
const {WebSocket}=require(path.join(ROOT,'documentation/user-manuals/source/cdp-socket.cjs'));
const model=JSON.parse(fs.readFileSync(path.join(OUT,'validation/diagram-model.json'))),pause=ms=>new Promise(r=>setTimeout(r,ms));let browser,socket;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-thesis-diagrams-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0].trim();break;}await pause(100);}if(!port)throw Error('Chrome did not start');
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let count=0;const pending=new Map();socket.addEventListener('message',e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(p){pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}});
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++count,timer=setTimeout(()=>reject(Error('Timeout '+method)),60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.result.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
 await cmd('Page.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['http://*','https://*']});
 const onlyDfd=process.argv.includes('--dfd-only');
 const onlyFlow=process.argv.includes('--flow-only');
 const selected=file=>(!onlyDfd||file.stem.startsWith('MCPA_DFD_'))&&(!onlyFlow||file.stem==='MCPA_System_Flowchart');
 const report={nativeXmlRenderer:true,outboundHttpBlocked:true,applicationOrDatabaseCalls:0,files:[],issues:[]};
 if(onlyDfd||onlyFlow){const previous=JSON.parse(fs.readFileSync(path.join(OUT,'validation/render-report.json'))),ids=new Set(model.filter(selected).map(f=>f.stem));report.files=previous.files.filter(f=>!ids.has(f.file));report.issues=previous.issues.filter(f=>!ids.has(f.file));}
 for(const file of model.filter(selected)){const parsed=U.parseFile(path.join(OUT,file.stem+'.drawio')),svgs=[];
  for(let i=0;i<parsed.diagrams.length;i++){
   const page=parsed.diagrams[i],w=Number(page.model.pageWidth),h=Number(page.model.pageHeight);
   await cmd('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
   await cmd('Page.navigate',{url:pathToFileURL(path.join(__dirname,'renderer.html')).href});
   for(let n=0;n<100;n++){if(await evaluate('typeof render==="function"&&typeof mxGraph==="function"'))break;await pause(50);}
   const xml='<mxGraphModel '+U.attributes(page.model)+'><root>'+U.serialize({attrs:{},diagrams:[page]}).match(/<root>([\s\S]*?)<\/root>/)[1]+'</root></mxGraphModel>';
   const result=await evaluate('render('+JSON.stringify(xml)+','+w+','+h+')');svgs.push(result.svg);
   fs.writeFileSync(path.join(OUT,'validation',file.stem+'_'+String(i+1).padStart(2,'0')+'.svg'),result.svg);
   fs.writeFileSync(path.join(OUT,'validation',file.stem+'_'+String(i+1).padStart(2,'0')+'-geometry.json'),JSON.stringify(result,null,2));
   if(result.issues.length)report.issues.push({file:file.stem,page:i+1,issues:result.issues});
  }
  const paperName=page=>'paper'+page.w+'x'+page.h;
  const w=file.pages[0].w,h=file.pages[0].h;
  const papers=new Map(file.pages.map(page=>[paperName(page),page]));
  const paperCss=[...papers].map(([name,page])=>'@page '+name+'{size:'+page.w/96+'in '+page.h/96+'in;margin:0}.sheet.'+name+'{page:'+name+';width:'+page.w/96+'in;height:'+page.h/96+'in}').join('');
  await cmd('Page.navigate',{url:'about:blank'});const {frameTree}=await cmd('Page.getFrameTree');
  await cmd('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<!doctype html><html><head><meta charset="utf-8"><title>'+file.stem+'</title><style>'+paperCss+'html,body{margin:0;background:white}.sheet{break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.sheet svg{display:block;width:100%;height:100%}</style></head><body>'+svgs.map((svg,i)=>'<section class="sheet '+paperName(file.pages[i])+'">'+svg+'</section>').join('')+'</body></html>'});
  await evaluate('document.fonts.ready');await cmd('Emulation.setEmulatedMedia',{media:'print'});
  const pdf=await cmd('Page.printToPDF',{printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,generateTaggedPDF:true});
  const bytes=Buffer.from(pdf.data,'base64');fs.writeFileSync(path.join(OUT,file.stem+'.pdf'),bytes);
  report.files.push({file:file.stem,pages:svgs.length,paperInches:[w/96,h/96],pageSizesInches:file.pages.map(page=>[page.w/96,page.h/96]),bytes:bytes.length});console.log('Exported '+file.stem+': '+svgs.length+' page(s).');
 }
 report.passed=report.issues.length===0;fs.writeFileSync(path.join(OUT,'validation/render-report.json'),JSON.stringify(report,null,2));
 console.log('Text / shape issues: '+report.issues.reduce((sum,p)=>sum+p.issues.length,0));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();});
