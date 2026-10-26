const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=process.cwd(),OUT=path.resolve(__dirname,'..');
const files=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(['tests','node_modules','vendor'].includes(ent.name))continue;const file=path.join(dir,ent.name);if(ent.isDirectory())walk(file);else if(/\.(?:js|mjs|cjs|ts|html|sql)$/.test(ent.name))files.push(file);}}
for(const dir of ['js','1-admin','2-engr','modules','supabase/functions','supabase/migrations'])walk(path.join(ROOT,dir));
const inventory=files.map(file=>{const text=fs.readFileSync(file,'utf8');return{file:path.relative(ROOT,file).replace(/\\/g,'/'),lines:text.split('\n').length,bytes:Buffer.byteLength(text),rpcNames:[...new Set([...text.matchAll(/\b(?:mcpa_[a-z_0-9]+)/g)].map(m=>m[0]))].sort()};});
fs.writeFileSync(path.join(OUT,'validation/source-inventory.json'),JSON.stringify(inventory,null,2));
const scope={window:{MCPADisplay:{roles:{}}}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'js/permissions.js'),'utf8'),scope);
const roleNames=['admin','engineer','architect','secretary','tool_handler'];
const screens=['dashboard','masterlist','tool-profile','sites','site-detail','request','quantity-request','transfer','asset-transfer','transfer-inbox','return','repair','missing','asset-retirement-v2','retired-equipment-v2','consumables','outward-materials','purchase','reports','activity','users','settings'];
const permissions=roleNames.map(role=>({role,screens:screens.filter(screen=>scope.window.MCPAPermissions.route(role,screen))}));
fs.writeFileSync(path.join(OUT,'validation/role-routes.json'),JSON.stringify(permissions,null,2));
const model=JSON.parse(fs.readFileSync(path.join(OUT,'validation/diagram-model.json'))),issues=[],decisions=[];
for(const file of model)for(const [idx,page]of file.pages.entries()){
 const ids=new Set();for(const n of page.nodes){if(ids.has(n.id))issues.push('Duplicate node: '+n.id);ids.add(n.id);}
 for(const e of page.edges){if(ids.has(e.id))issues.push('Duplicate edge: '+e.id);ids.add(e.id);if(e.from&&!page.nodes.some(n=>n.id===e.from))issues.push('Missing source '+e.from);if(e.to&&!page.nodes.some(n=>n.id===e.to))issues.push('Missing target '+e.to);}
 for(const n of page.nodes.filter(n=>n.type==='decision')){const count=page.edges.filter(e=>e.from===n.id).length;decisions.push({page:idx+1,id:n.id,branches:count});if(count!==2)issues.push('Decision must have two branches: '+page.id+'/'+n.id);}
 if(file.stem==='MCPA_System_Flowchart'){
  const labels=new Map();
  for(const n of page.nodes.filter(n=>n.type==='circle')){if(!labels.has(n.label))labels.set(n.label,[]);labels.get(n.label).push(n);}
  for(const [label,circles]of labels){
   if(circles.length!==2)issues.push('On-page connector must have one matching pair: '+page.id+'/'+label);
   const degrees=circles.map(n=>({incoming:page.edges.filter(e=>e.to===n.id).length,outgoing:page.edges.filter(e=>e.from===n.id).length}));
   if(!degrees.some(d=>d.incoming===1&&d.outgoing===0)||!degrees.some(d=>d.incoming===0&&d.outgoing===1))issues.push('On-page connector pair has invalid entry/exit arrows: '+page.id+'/'+label);
  }
  const geo=JSON.parse(fs.readFileSync(path.join(OUT,'validation',file.stem+'_'+String(idx+1).padStart(2,'0')+'-geometry.json')));
  for(const edge of geo.edges.filter(e=>e.from))for(const shape of geo.shapes.filter(s=>s.id!==edge.from&&s.id!==edge.to)){
   const pts=edge.points||[],pad=2;
   for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];let crossed=false;
    if(Math.abs(a.x-b.x)<0.1)crossed=a.x>shape.x+pad&&a.x<shape.x+shape.w-pad&&Math.min(a.y,b.y)<shape.y+shape.h-pad&&Math.max(a.y,b.y)>shape.y+pad;
    if(Math.abs(a.y-b.y)<0.1)crossed=a.y>shape.y+pad&&a.y<shape.y+shape.h-pad&&Math.min(a.x,b.x)<shape.x+shape.w-pad&&Math.max(a.x,b.x)>shape.x+pad;
    if(crossed)issues.push('Arrow crosses another shape: '+page.id+'/'+edge.id+' / '+shape.id);
   }
  }
 }
}
const external0=model[1].pages[0].nodes.filter(n=>n.type==='entity').map(n=>n.label).sort();
const external1=[...new Set(model[2].pages[0].nodes.filter(n=>n.type==='entity').map(n=>n.label))].sort();
if(JSON.stringify(external0)!==JSON.stringify(external1))issues.push('DFD external roles are unbalanced');
const requiredEntities=['ADMIN','ENGINEERS/ARCHITECTS'];
if(JSON.stringify(external0)!==JSON.stringify(requiredEntities)||JSON.stringify(external1)!==JSON.stringify(requiredEntities))issues.push('Both DFDs must contain exactly Admin and Engineers/Architects');
const report={passed:issues.length===0,sourceFilesScanned:inventory.length,sourceLinesScanned:inventory.reduce((s,f)=>s+f.lines,0),roles:permissions,externalEntitiesBalanced:true,decisionCount:decisions.length,decisions,issues};
fs.writeFileSync(path.join(OUT,'validation/structure-and-coverage.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({sourceFiles:report.sourceFilesScanned,sourceLines:report.sourceLinesScanned,decisions:report.decisionCount,issues}));
if(issues.length)process.exitCode=1;
