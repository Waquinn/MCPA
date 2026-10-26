const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const OUT=path.resolve(__dirname,'..'),model=JSON.parse(fs.readFileSync(path.join(OUT,'validation/diagram-model.json'))),pages=model.find(f=>f.stem==='MCPA_System_Flowchart').pages;
const issues=[],refs=new Map();let arrows=0,segments=0,decisions=0,localPairs=0;
const near=(a,b)=>Math.abs(a-b)<=1;
for(const [i,p]of pages.entries()){
 const local=new Map(),map=new Map(p.nodes.map(n=>[n.id,n]));
 for(const n of p.nodes){
  const ins=p.edges.filter(e=>e.to===n.id),outs=p.edges.filter(e=>e.from===n.id);
  if(!['text','term','circle','off'].includes(n.type)&&(!ins.length||!outs.length))issues.push({page:i+1,kind:'orphan-process',id:n.id});
  if(n.type==='decision'){
   decisions++;if(outs.length!==2)issues.push({page:i+1,kind:'decision-branches',id:n.id});
   const labels=outs.map(e=>e.branch||e.label).sort();if(JSON.stringify(labels)!==JSON.stringify(['No','Yes']))issues.push({page:i+1,kind:'decision-labels',id:n.id,labels});
   for(const e of outs){const bottom=near(e.start.x,n.x+n.w/2)&&near(e.start.y,n.y+n.h),right=near(e.start.x,n.x+n.w)&&near(e.start.y,n.y+n.h/2);if(!bottom&&!right)issues.push({page:i+1,kind:'decision-exit-port',id:n.id,edge:e.id});}
   for(const e of ins){const top=near(e.end.x,n.x+n.w/2)&&near(e.end.y,n.y),left=near(e.end.x,n.x)&&near(e.end.y,n.y+n.h/2);if(!top&&!left)issues.push({page:i+1,kind:'decision-entry-port',id:n.id,edge:e.id});}
  }
  if(n.type==='circle'){if(!/^\d+$/.test(n.label))issues.push({page:i+1,kind:'local-code',id:n.id});if(!local.has(n.label))local.set(n.label,[]);local.get(n.label).push({node:n,in:ins.length,out:outs.length});}
  if(n.type==='off'){if(!n.offCode||!n.offDirection)issues.push({page:i+1,kind:'unmapped-page-reference',id:n.id});if(!refs.has(n.offCode))refs.set(n.offCode,[]);refs.get(n.offCode).push({page:i+1,direction:n.offDirection,referencePage:n.referencePage,in:ins.length,out:outs.length});}
 }
 for(const [label,pair]of local){localPairs++;if(pair.length!==2||!pair.some(x=>x.in===1&&x.out===0)||!pair.some(x=>x.in===0&&x.out===1))issues.push({page:i+1,kind:'local-pair',label});}
 const geo=JSON.parse(fs.readFileSync(path.join(OUT,'validation',`MCPA_System_Flowchart_${String(i+1).padStart(2,'0')}-geometry.json`)));
 for(const e of geo.edges){arrows++;for(let j=1;j<(e.points||[]).length;j++){segments++;const a=e.points[j-1],b=e.points[j],dx=b.x-a.x,dy=b.y-a.y;if(dx<-.15||dy<-.15)issues.push({page:i+1,kind:'reverse-rendered-arrow',edge:e.id,dx,dy});if(Math.abs(dx)>.15&&Math.abs(dy)>.15)issues.push({page:i+1,kind:'diagonal-rendered-arrow',edge:e.id,dx,dy});}}
 for(const e of p.edges){for(let j=1,points=[e.start,...e.points,e.end];j<points.length;j++){const a=points[j-1],b=points[j];if(b.x<a.x-.01||b.y<a.y-.01)issues.push({page:i+1,kind:'reverse-model-arrow',edge:e.id});}}
}
for(const [code,pair]of refs){const from=pair.find(n=>n.direction==='departure'),to=pair.find(n=>n.direction==='arrival');if(pair.length!==2||!from||!to||from.referencePage!==to.page||to.referencePage!==from.page||from.in!==1||from.out!==0||to.in!==0||to.out!==1)issues.push({kind:'cross-page-reference',code,pair});}
if(refs.has('W'))issues.push({kind:'generic-W-reference'});
// DFD files are never written by --flow-only. Preserve and report editor saves
// observed during this task instead of overwriting unrelated document edits.
const baseline=JSON.parse(fs.readFileSync(path.join(OUT,'validation/flow-redo-start.json'))),dfdEditsObserved=[];for(const f of baseline.files){const now=crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,f.file))).digest('hex');if(now!==f.sha256)dfdEditsObserved.push({file:f.file,startingSha256:f.sha256,currentSha256:now});}
const report={passed:issues.length===0,pages:pages.length,arrows,renderedSegments:segments,decisions,onPagePairs:localPairs,offPageRoutes:refs.size,routeMap:Object.fromEntries(refs),unrelatedDfdEditorSavesPreserved:dfdEditsObserved,issues};
fs.writeFileSync(path.join(OUT,'validation/professional-flow-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(issues.length)process.exitCode=1;
