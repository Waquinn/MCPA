/* Documentation-only authoring. Native editable mxCells, with explicit routes. */
const fs=require('node:fs'),path=require('node:path');
const OUT=path.resolve(__dirname,'..');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/\n/g,'&#xa;');
const base='whiteSpace=wrap;html=0;fontFamily=Arial;fontColor=#000000;strokeColor=#000000;fillColor=#ffffff;strokeWidth=1.5;align=center;verticalAlign=middle;spacing=5;';
const styles={process:'rounded=0;',io:'shape=parallelogram;perimeter=parallelogramPerimeter;size=0.12;',decision:'shape=rhombus;perimeter=rhombusPerimeter;spacing=0;',term:'shape=ellipse;perimeter=ellipsePerimeter;',off:'shape=offPageConnector;spacingBottom=8;',circle:'shape=ellipse;perimeter=ellipsePerimeter;',text:'strokeColor=none;fillColor=none;align=left;spacing=0;verticalAlign=top;',entity:'rounded=0;fontStyle=1;',dfd:'rounded=1;arcSize=18;'};
function wrapWords(text,max=35){const lines=[];let line='';for(const word of text.replace(/\n/g,' ').split(/\s+/)){if(line.length&&line.length+word.length+1>max){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines.join('\n');}
class Sheet{
 constructor(id,title,subtitle,w=816,h=1248){Object.assign(this,{id,title,w,h,nodes:[],edges:[]});this.text('brand','SITETRACE (MCPA) | SYSTEM DOCUMENTATION',40,23,w-80,20,12);this.text('title',title,40,48,w-80,32,22);this.text('subtitle',subtitle,40,87,w-80,22,12);}
 node(id,label,x,y,w=300,h=62,type='process',font=14){if(type==='io')label=wrapWords(label);const n={id,label,x,y,w,h,type,font};this.nodes.push(n);return n;}
 text(id,label,x,y,w,h,font=13,extra=''){const n=this.node(id,label,x,y,w,h,'text',font);n.extra=extra;return n;}
 get(id){const n=this.nodes.find(n=>n.id===id);if(!n)throw Error('Missing '+this.id+'/'+id);return n;}
 edge(a,b,label='',opts={}){const from=this.get(a),to=this.get(b),side=opts.side||'down';let start,end;
  if(side==='right'){start={x:from.x+from.w,y:from.y+from.h/2};end={x:to.x,y:to.y+to.h/2};}
  else if(side==='left'){start={x:from.x,y:from.y+from.h/2};end={x:to.x+to.w,y:to.y+to.h/2};}
  else{start={x:from.x+from.w/2,y:from.y+from.h};end={x:to.x+to.w/2,y:to.y};}
  const pts=opts.points||((start.x!==end.x&&start.y!==end.y)?[{x:start.x,y:(start.y+end.y)/2},{x:end.x,y:(start.y+end.y)/2}]:[]);
  this.edges.push({id:'edge_'+(this.edgeSequence=(this.edgeSequence||0)+1),from:a,to:b,label,side,start,end,points:pts,labelAt:opts.labelAt,font:opts.font||12,arrow:opts.arrow!==false});return this;
 }
 line(id,points){this.edges.push({id,points:points.slice(1,-1),start:points[0],end:points.at(-1),arrow:false,label:'',font:12});}
 loop(a,b,gutter,label='No'){
  const from=this.get(a),to=this.get(b),number=String(this.connectorCounter=(this.connectorCounter||0)+1);
  const outgoing='connector'+number+'out',incoming='connector'+number+'in';
  this.node(outgoing,number,Math.min(this.w-40,from.x+from.w+24),from.y+from.h/2-15,30,30,'circle',12);
  this.node(incoming,number,Math.max(8,to.x-42),to.y+to.h/2-15,30,30,'circle',12);
  this.edge(a,outgoing,'',{side:'right'});this.edge(incoming,b,'',{side:'right'});
  this.text('branchlabel'+number,label,from.x+from.w+3,from.y+from.h/2-27,35,18,11);
 }
 lane(prefix,x,title,items,{y=158,gap=25,width=300}={}){this.text(prefix+'heading',title,x,121,width,25,14,'fontStyle=1;');let previous;const ids=[];
  for(const item of items){const [id,type,label,extra={}]=item,h=extra.h||({decision:104,term:42,off:48,circle:36,io:78}[type]||64),w=extra.w||({off:48,circle:36,term:220}[type]||width);const n=this.node(id,label,x+(width-w)/2,y,w,h,type,extra.font||14);if(previous&&!extra.break)this.edge(previous,id,extra.incoming||(this.get(previous).type==='decision'?'Yes':''));ids.push(id);previous=id;y+=h+(extra.gap??gap);}
  return ids;
 }
 footer(page,total=13){this.text('pagenum',`Page ${page} of ${total}`,40,91,this.w-80,18,12);}
 store(id,label,x,y,w=565,h=73,font=18){this.node(id,label,x+65,y,w-65,h,'text',font).extra='verticalAlign=middle;spacingLeft=15;';this.node(id+'tag',id,x,y,65,h,'process',font);this.line(id+'top',[{x:x+65,y},{x:x+w,y}]);this.line(id+'bottom',[{x:x+65,y:y+h},{x:x+w,y:y+h}]);return id;}
 xml(){const nodes=this.nodes.map(n=>`<mxCell id="${esc(n.id)}" value="${esc(n.label)}" style="${esc(base+styles[n.type]+'fontSize='+n.font+';'+(n.extra||''))}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`).join('');
  const edges=this.edges.map(e=>{const side=e.side;let exits=side==='right'?'exitX=1;exitY=0.5;entryX=0;entryY=0.5;':side==='left'?'exitX=0;exitY=0.5;entryX=1;entryY=0.5;':side==='loop'?'exitX=1;exitY=0.5;entryX=1;entryY=0.5;':'exitX=0.5;exitY=1;entryX=0.5;entryY=0;';const pts=e.points.map(p=>`<mxPoint x="${p.x}" y="${p.y}"/>`).join('');return `<mxCell id="${esc(e.id)}" value="${esc(e.label)}" style="edgeStyle=none;rounded=0;html=0;strokeColor=#000000;strokeWidth=1.25;endArrow=${e.arrow?'classic':'none'};endFill=1;fontFamily=Arial;fontSize=${e.font};fontColor=#000000;labelBackgroundColor=#ffffff;${e.from||e.to?exits:''}" edge="1" parent="1"${e.from?' source="'+esc(e.from)+'"':''}${e.to?' target="'+esc(e.to)+'"':''}><mxGeometry relative="1" as="geometry"><mxPoint x="${e.start.x}" y="${e.start.y}" as="sourcePoint"/><mxPoint x="${e.end.x}" y="${e.end.y}" as="targetPoint"/>${pts?'<Array as="points">'+pts+'</Array>':''}${e.labelAt?'<mxPoint x="'+e.labelAt.x+'" y="'+e.labelAt.y+'" as="offset"/>':''}</mxGeometry></mxCell>`;}).join('');
  return `<diagram id="${esc(this.id)}" name="${esc(this.title)}"><mxGraphModel dx="${this.w}" dy="${this.h}" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${this.w}" pageHeight="${this.h}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${edges}${nodes}</root></mxGraphModel></diagram>`;
 }
}
const {pages:flows}=require('./professional-flowchart.cjs')({Sheet});
const {d0,d1}=require('./plain-dfds.cjs')({Sheet});

// Accurate perimeter ports for routed DFD context arrows.
const originalXml=Sheet.prototype.xml;
Sheet.prototype.xml=function(){let xml=originalXml.call(this);for(const e of this.edges.filter(e=>e.side==='detached')){const a=e.from?this.get(e.from):null,b=e.to?this.get(e.to):null;const ports=(a?`exitX=${(e.start.x-a.x)/a.w};exitY=${(e.start.y-a.y)/a.h};`:'')+(b?`entryX=${(e.end.x-b.x)/b.w};entryY=${(e.end.y-b.y)/b.h};`:'');xml=xml.replace(new RegExp('(<mxCell id="'+e.id+'"[^>]*style=")([^"]*)'),(_,open,style)=>open+style.replace(/(?:exitX|exitY|entryX|entryY)=[^;]+;/g,'')+ports+(e.exactPorts?'exitPerimeter=0;entryPerimeter=0;':''));}return xml;};
const packages=[{stem:'MCPA_System_Flowchart',pages:flows},{stem:'MCPA_DFD_Level_0',pages:[d0]},{stem:'MCPA_DFD_Level_1',pages:[d1]}];
for(const item of packages.filter(item=>(!process.argv.includes('--dfd-only')||item.stem.startsWith('MCPA_DFD_'))&&(!process.argv.includes('--flow-only')||item.stem==='MCPA_System_Flowchart'))){const xml='<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" compressed="false" pages="'+item.pages.length+'">'+item.pages.map(p=>p.xml()).join('')+'</mxfile>\n';fs.writeFileSync(path.join(OUT,item.stem+'.drawio'),xml);}
fs.writeFileSync(path.join(OUT,'validation/diagram-model.json'),JSON.stringify(packages,null,2));
console.log(process.argv.includes('--dfd-only')?'Updated both editable DFDs.':'Created 13 editable long-bond flowchart pages and both editable DFDs.');
