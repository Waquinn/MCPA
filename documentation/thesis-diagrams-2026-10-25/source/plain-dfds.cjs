/* Plain reference-style DFDs: symbols and labeled data flows only. */
module.exports=function({Sheet}){
 function sheet(id,title,w,h){const p=new Sheet(id,title,'',w,h);p.nodes=[];p.text('title',title,18,16,w-36,42,30,'fontStyle=1;');return p;}
 function node(p,id,label,x,y,w,h,type='process',font=23){const n=p.node(id,label,x,y,w,h,type,font);n.extra='fontStyle=1;strokeWidth=1.5;';return n;}
 function flow(p,id,from,to,start,end,points,label,lx,ly,lw=450,font=20){p.edges.push({id,from,to,start,end,points,label:'',side:'detached',arrow:true,font});if(label)p.text(id+'label',label,lx,ly,lw,34,font,'fontStyle=1;align=center;verticalAlign=middle;fillColor=none;labelBackgroundColor=#ffffff;');}
 const d0=sheet('dfd0','Data Flow Diagram Level 0',1920,1440);
 node(d0,'system','MCPA /\nSITETRACE',790,550,340,340,'circle',32);
 node(d0,'admin','ADMIN',815,185,290,82,'entity',29);
 node(d0,'engineers','ENGINEERS/ARCHITECTS',735,1180,450,84,'entity',27);
 flow(d0,'aIn','admin','system',{x:890,y:267},{x:910,y:560},[{x:890,y:410},{x:910,y:410}],'ACCESS / ASSET / PROJECT / REVIEW DATA',275,350,580,20);
 flow(d0,'aOut','system','admin',{x:1020,y:560},{x:1035,y:267},[{x:1020,y:410},{x:1035,y:410}],'RECORDS / HISTORY / REPORTS',1065,350,560,20);
 flow(d0,'aStock','admin','system',{x:815,y:225},{x:865,y:575},[{x:600,y:225},{x:600,y:485},{x:865,y:485}],'STOCK / ISSUANCE / PURCHASE DATA',245,447,600,20);
 flow(d0,'eIn','engineers','system',{x:735,y:1202},{x:810,y:650},[{x:570,y:1202},{x:570,y:650}],'CREDENTIALS / REQUESTS / CUSTODY FINDINGS',75,605,690,20);
 flow(d0,'eOut','system','engineers',{x:1110,y:780},{x:1185,y:1202},[{x:1350,y:780},{x:1350,y:1202}],'PROJECT / REQUEST / CUSTODY RECORDS',1155,805,690,20);
 flow(d0,'eMaterials','system','engineers',{x:1015,y:878},{x:1185,y:1242},[{x:1015,y:1020},{x:1440,y:1020},{x:1440,y:1242}],'MATERIAL / RETIREMENT RECORDS',1035,990,675,20);

 const d1=sheet('dfd1','Data Flow Diagram Level 1',2400,3000);
 const actors=[['admin','ADMIN',170],['engineers','ENGINEERS/ARCHITECTS',1550]];
 actors.forEach(([id,label,y])=>node(d1,id,label,1870,y,460,82,'entity',25));
 const rows=[
  ['P1','LOGIN &\nCONFIGURE\nACCOUNTS','01 | USER ACCOUNTS',['admin','engineers'],'CREDENTIALS / ACCOUNT CONFIGURATION','ACCESS / ACCOUNT RESULTS','ACCOUNT DATA','SAVED USER DETAILS'],
  ['P2','REGISTER\nEQUIPMENT','02 | EQUIPMENT',['admin','engineers'],'EQUIPMENT / IMPORT / PHOTO DATA','EQUIPMENT DETAILS / QR / RESULTS','EQUIPMENT DATA','SAVED EQUIPMENT'],
  ['P3','MANAGE\nPROJECTS','03 | PROJECTS',['admin','engineers'],'PROJECT / ASSIGNMENT / PROGRESS DATA','PROJECT DETAILS / HISTORY','PROJECT DATA','SAVED PROJECTS'],
  ['P4','PROCESS\nEQUIPMENT\nMOVEMENTS','04 | REQUESTS & MOVEMENTS',['admin','engineers'],'ALLOCATION / RELEASE / INSPECTION DECISIONS','REQUEST / CUSTODY / CASE STATUS','MOVEMENT DATA','SAVED MOVEMENTS'],
  ['P5','RETIRE\nEQUIPMENT','05 | RETIREMENTS',['admin','engineers'],'PROPOSAL / SECOND-ADMIN DECISION','SOLD / DISPOSED HISTORY','RETIREMENT DATA','SAVED RETIREMENTS'],
  ['P6','MANAGE\nCONSUMABLES','06 | CONSUMABLES & PROCUREMENT',['admin'],'ITEM / STOCK / PROCUREMENT / DELIVERY DATA','STOCK / DELIVERY / REQUEST HISTORY','STOCK / RECEIPT DATA','SAVED STOCK RECORDS'],
  ['P7','ISSUE\nMATERIALS','07 | MATERIAL REQUESTS & ISSUES',['admin','engineers'],'REVIEW / MATERIAL ISSUANCE QUANTITIES','REQUEST / ISSUANCE RECORDS','REQUEST / ISSUE DATA','SAVED MATERIAL ISSUES'],
  ['P8','RECORD\nPURCHASES','08 | PURCHASES',['admin'],'SUPPLIER / PURCHASE / RECEIPT DATA','PURCHASE DETAILS / RECEIPT / HISTORY','PURCHASE DATA','SAVED PURCHASES'],
  ['P9','SHOW\nREPORTS','09 | NOTIFICATIONS & SNAPSHOTS',['admin','engineers'],'SEARCH / REPORT / NOTIFICATION CRITERIA','RECORDS / NOTIFICATIONS / REPORTS','NOTICE / SNAPSHOT DATA','SAVED MONITORING DATA']
 ];
 const fieldFlows={
  P1:['CREDENTIALS / PASSWORD SETUP DATA','ACCESS / PROFILE CONFIRMATION'],
  P2:['EQUIPMENT SEARCH CRITERIA','AUTHORIZED EQUIPMENT DETAILS'],
  P3:['PROJECT VIEW CRITERIA','ASSIGNED PROJECT / PROGRESS DATA'],
  P4:['REQUEST / TRANSFER / RETURN / CASE FINDINGS','REQUEST / TRANSFER / RETURN / CASE STATUS'],
  P5:['RETIREMENT SEARCH / ISSUE REPORT','PERMITTED RETIREMENT HISTORY'],
  P7:['MATERIAL REQUEST / PROJECT DETAILS','OWN REQUEST / ISSUANCE HISTORY'],
  P9:['SEARCH / NOTIFICATION CRITERIA','AUTHORIZED RECORDS / NOTIFICATIONS']
 };
 rows.forEach(([id,label,store,roles,input,output,write,read],i)=>{
  const y=150+i*310,sy=y+195;
  node(d1,id,label,535,y,235,118,'dfd',22);
  const storeId='D'+(i+1);node(d1,storeId,store,125,sy,520,37,'text',18).extra='fontStyle=1;align=left;verticalAlign=middle;spacingLeft=8;';
  d1.line(storeId+'top',[{x:125,y:sy},{x:645,y:sy}]);d1.line(storeId+'bottom',[{x:125,y:sy+37},{x:645,y:sy+37}]);
  flow(d1,id+'write',id,storeId,{x:535,y:y+28},{x:230,y:sy},[{x:230,y:y+28}],write,245,y-4,275,17);
  flow(d1,id+'read',storeId,id,{x:125,y:sy+24},{x:535,y:y+89},[{x:90,y:sy+24},{x:90,y:y+89}],read,150,y+57,355,17);
  roles.forEach((role,j)=>{
   const ai=actors.findIndex(a=>a[0]===role),ay=actors[ai][2],inRail=1390+ai*180,outRail=inRail+42;
   const inY=y+22+j*28,outY=y+82+j*25;
   flow(d1,id+role+'in',role,id,{x:1870,y:ay+22},{x:770,y:inY},[{x:inRail,y:ay+22},{x:inRail,y:inY}],'',0,0);
   flow(d1,id+role+'out',id,role,{x:770,y:outY},{x:1870,y:ay+61},[{x:outRail,y:outY},{x:outRail,y:ay+61}],'',0,0);
   const labels=role==='admin'?[input,output]:fieldFlows[id];
   d1.text(id+role+'inLabel',labels[0],825,inY-12,550,24,17,'fontStyle=1;align=center;verticalAlign=middle;fillColor=none;labelBackgroundColor=#ffffff;');
   d1.text(id+role+'outLabel',labels[1],825,outY-12,550,24,17,'fontStyle=1;align=center;verticalAlign=middle;fillColor=none;labelBackgroundColor=#ffffff;');
  });
 });
 const links=[['D2','P4','ASSET AVAILABILITY',40,25],['D3','P4','PROJECT / DESTINATION DATA',65,85],['D2','P5','ASSET / CUSTODY DATA',40,25],['D6','P7','AVAILABLE STOCK',40,25],['P7','D6','ISSUANCE STOCK DEDUCTION',65,85],['D6','P8','PROCUREMENT REFERENCE',40,25],['D2','P9','CURRENT EQUIPMENT DATA',40,25],['D4','P9','MOVEMENT / ACTIVITY DATA',65,85]];
 links.forEach(([from,to,label,rail,offset],i)=>{const a=d1.get(from),b=d1.get(to),start={x:a.x,y:a.y+a.h/2},end={x:b.x,y:b.y+b.h/2};const towardStore=to.startsWith('D');const ly=towardStore?a.y+160:b.y+(offset<50?125:160);flow(d1,'related'+i,from,to,start,end,[{x:rail,y:start.y},{x:rail,y:end.y}],label,140,ly,510,17);});
 return {d0,d1};
};
