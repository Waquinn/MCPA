/* Source-based system flowchart. All drawn arrows move down and/or right.
 * Numbered circles carry local jumps; lettered pentagons identify exact pages. */
module.exports=function({Sheet}){
 const pages=[];
 const codes='ABCDEFGHIJKL';
 function make(number,title,w=816,h=1248){const p=new Sheet('flow'+String(number).padStart(2,'0'),title,'',w,h);p.nodes=[];p.text('title',title,36,22,w-72,36,22);p.text('pagenum','Page '+number+' of 13',36,67,w-72,18,12);p.number=number;p.localSequence=0;pages.push(p);return p;}
 function n(p,id,type,label,x,y,w=300,h=64,font=14){
  if(type==='process'&&w<=320){const lines=[];let line='';for(const word of label.replace(/\n/g,' ').split(/\s+/)){if(line&&line.length+word.length+1>35){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);label=lines.join('\n');}
  return p.node(id,label,x,y,w,h,type,font);
 }
 function off(p,id,code,direction,otherPage,x,y,w=76){const label=code+'\n'+(direction==='departure'?'TO':'FROM')+' P'+String(otherPage).padStart(2,'0');const q=n(p,id,'off',label,x,y,w,62,12);Object.assign(q,{offCode:code,offDirection:direction,referencePage:otherPage});return q;}
 function edge(p,from,to,label='',side='down'){p.edge(from,to,label,{side});if(label)p.edges.at(-1).branch=label;}
 function label(p,id,text,x,y,w=32){p.text(id,text,x,y,w,18,11,'fillColor=none;labelBackgroundColor=#ffffff;align=center;');}
 function circle(p,id,value,x,y){return n(p,id,'circle',String(value),x,y,32,32,12);}
 function jump(p,from,to,answer='',options={}){
  const a=p.get(from),b=p.get(to),value=++p.localSequence,out='local'+value+'out',into='local'+value+'in';
  if(options.outBelow){circle(p,out,value,a.x+a.w/2-16,a.y+a.h+18);edge(p,from,out,answer);}
  else{circle(p,out,value,a.x+a.w+24,a.y+a.h/2-16);edge(p,from,out,'','right');if(answer){p.edges.at(-1).branch=answer;label(p,out+'label',answer,a.x+a.w+1,a.y+a.h/2-27);}}
  if(b.type==='term'){
   b.incomingSlots=(b.incomingSlots||0)+1;if(b.incomingSlots>1)throw Error('Give a separate completion path to '+p.title+'/'+to);
   circle(p,into,value,b.x-42,b.y+b.h/2-16);edge(p,into,to,'','right');
  }else if(options.inAbove){circle(p,into,value,b.x+b.w/2-16,b.y-54);edge(p,into,to);}
  else{
   const slot=b.localEntrySlots=(b.localEntrySlots||0)+1,ratio=['io','process'].includes(b.type)?(slot===1?0.25:0.75):0.5;
   if(slot>2)throw Error('Too many local entries for '+p.title+'/'+b.id);
   const cy=b.y+b.h*ratio,x=Math.max(3,b.x-42),boundaryX=b.x+(b.type==='io'?b.w*0.12*(1-ratio):0);circle(p,into,value,x,cy-16);
   p.edges.push({id:'localEntryArrow'+value,from:into,to,start:{x:x+32,y:cy},end:{x:boundaryX,y:cy},points:[],label:'',side:'detached',exactPorts:true,arrow:true,font:12});
  }
  return value;
 }
 function stack(p,x,y,items,bottom=1060){
  const heights=items.map(a=>a[3]?.h||({io:76,decision:100,term:46}[a[1]]||64));
  const room=bottom-y-heights.reduce((s,v)=>s+v,0),gap=Math.min(20,Math.floor(room/Math.max(1,items.length-1)));
  if(gap<18)throw Error('Flow content cannot fit with readable decision labels: '+p.title);
  let prev;for(let i=0;i<items.length;i++){const [id,type,text,opts={}]=items[i];n(p,id,type,text,x,y,300,heights[i],opts.font||14);if(prev)edge(p,prev,id,opts.incoming||(p.get(prev).type==='decision'?'Yes':''));prev=id;y+=heights[i]+gap;}
  return {first:items[0][0],last:items.at(-1)[0],bottom:y-gap};
 }
 function modulePage(number,title,choice,leftTitle,rightTitle,left,right){
  const p=make(number,title);off(p,'moduleEntry',codes[number-2],'arrival',1,157,150);
  p.text('leftheading',leftTitle,45,119,345,25,14,'fontStyle=1;');p.text('rightheading',rightTitle,455,119,325,25,14,'fontStyle=1;');
  n(p,'action','decision',choice,45,242,300,100);edge(p,'moduleEntry','action');
  const L=stack(p,45,390,left),R=stack(p,455,230,right);edge(p,'action',L.first,'Yes');
  jump(p,'action',R.first,'No',{inAbove:true});
  n(p,'moduleComplete','term','RETURN TO MAIN MENU\n(Page 1)',85,L.bottom+20,220,52,12);
  p.left=L;p.right=R;return p;
 }
 function finish(p,id){
  const a=p.get(id),target=id===p.left.last?'moduleComplete':id+'Complete';
  if(target!=='moduleComplete')n(p,target,'term','RETURN TO MAIN MENU\n(Page 1)',a.x+40,a.y+a.h+20,220,52,12);
  edge(p,id,target);
 }
 function retry(p,decision,target,answer='No'){jump(p,decision,target,answer);}
 function sideProcess(p,id,text,x=455,y=1030){return n(p,id,'process',text,x,y,300,64,14);}
 function call(p,from,id,code,toPage){const a=p.get(from),o=off(p,id,code,'departure',toPage,a.x+a.w/2-38,a.y+a.h+28);edge(p,from,id);return o;}

 // Page 1 mirrors the references' explicit module selection, compacted onto
 // one landscape long-bond sheet instead of consuming extra main-menu pages.
 {
  const p=make(1,'Main system navigation',1248,816);
  n(p,'start','term','START',36,99,130,34,14);
  n(p,'choose','process','Open SiteTrace. Use authentication / account work or select a\npermitted operation from the authorized workspace.',240,86,650,60,14);
  edge(p,'start','choose','','right');circle(p,'beginOut',1,930,100);edge(p,'choose','beginOut','','right');circle(p,'beginIn',1,139,174);
  const menu=[
   ['Authentication /\naccounts?',2],['Equipment register /\nprofile / import?',3],['Projects / construction\nprogress?',4],['Named-asset\nrequests?',5],
   ['Equipment quantity\nrequests / allocation?',6],['Release / transfers /\nphysical receipt?',7],['Return submission /\nAdmin inspection?',8],['Repairs / missing\nequipment?',9],
   ['Asset retirement /\npurchases?',10],['Consumables /\ninbound stock?',11],['Outward materials /\nissuance?',12],['Monitoring / account\npreferences / exit?',13]
  ];
  const xs=[40,445,850],ys=[230,365,500,635];
  for(let i=0;i<menu.length;i++){
   const col=Math.floor(i/4),row=i%4,x=xs[col],y=ys[row],id='menu'+i;
   n(p,id,'decision',menu[i][0],x,y,230,82,13);off(p,'call'+i,codes[i],'departure',menu[i][1],x+282,y+10,72);
   edge(p,id,'call'+i,'','right');p.edges.at(-1).branch='Yes';label(p,id+'yes','Yes',x+233,y+14);
   if(row)edge(p,'menu'+(i-1),id,'No');
  }
  edge(p,'beginIn','menu0');
  for(let col=0;col<2;col++){const value=col+2;circle(p,'nextOut'+col,value,xs[col]+99,760);edge(p,'menu'+(col*4+3),'nextOut'+col,'No');circle(p,'nextIn'+col,value,xs[col+1]+99,174);edge(p,'nextIn'+col,'menu'+((col+1)*4));}
  circle(p,'againOut',4,949,760);edge(p,'menu11','againOut','No');circle(p,'againIn',4,549,35);edge(p,'againIn','choose');
  p.localSequence=4;
 }
 // 2. Active profile is a real gate; revalidation no longer implies expiry.
 {
  const p=modulePage(2,'Authentication and account management','Sign-in / password\naction?','ALL ROLES: AUTHENTICATION','ADMIN: PEOPLE & ACCESS',[
   ['login','io','Sign in / restore a session; read feedback, or request a password reset.'],
   ['auth','process','Verify Auth credentials / session. For invitation or reset, set a password and sign in again.',{h:80,font:13}],
   ['session','decision','Authenticated\nsession available?'],
   ['profile','process','Read the authorized company profile.'],
   ['active','decision','Active, authorized\ncompany profile?'],
   ['open','process','Build the permitted role workspace; open the requested route / home.'],
   ['home','io','Display the authorized workspace.']
  ],[
   ['people','io','Search people; choose edit access, invitation / retry, or an enabled development account.'],
   ['admin','decision','Active Admin and\ncapability valid?'],
   ['save','process','Save role / account status, or call the secured account service.'],
   ['saved','decision','Account operation\ncompleted?'],
   ['audit','io','Show access / invitation status and audit; unfinished jobs retain retry identity.']
  ]);
  retry(p,'session','login');retry(p,'active','login');retry(p,'admin','people');retry(p,'saved','save');finish(p,'home');finish(p,'audit');
 }
 // 3. Profile/export and import are separate selected actions.
 {
  const p=modulePage(3,'Equipment register, profile and import','Register / profile\naction?','EQUIPMENT TRACKING','ADMIN: CSV / XLSX IMPORT',[
   ['view','io','Search / filter equipment; open its profile, photo, status and history.'],
   ['edit','decision','Admin creating or\nediting equipment?'],
   ['details','io','Enter equipment / tracking details; optionally select an equipment photo.'],
   ['valid','decision','Fields, Office setup\nand edit rules valid?'],
   ['save','process','Save metadata and any staged photo; new inventory starts unassigned at Office.'],
   ['result','io','Display Asset ID / profile / QR; print a tag or export permitted inventory PDF.']
  ],[
   ['file','io','Download template; choose CSV / XLSX, worksheet and mapped columns.'],
   ['preview','process','Validate every row; show errors and the projected record count.'],
   ['validImport','decision','All rows valid and\nbatch confirmed?'],
   ['import','process','Import atomically with a stable operation ID; expand Individual units; retain grouped Bulk.',{h:80,font:13}],
   ['receipt','decision','Import receipt\nverified?'],
   ['results','io','Show imported Asset IDs; export results CSV and refresh inventory.']
  ]);
  retry(p,'edit','result');retry(p,'valid','details');retry(p,'validImport','file');retry(p,'receipt','import');finish(p,'result');finish(p,'results');
 }
 // 4. Archive/restore is a selected action, not a mandatory consequence of edit.
 {
  const p=modulePage(4,'Projects, construction progress and history','Project register\naction?','PROJECT REGISTER','ADMIN: CONSTRUCTION UPDATES',[
   ['list','io','Search authorized projects; open project / equipment accountability.'],
   ['edit','decision','Admin changing a\nproject record?'],
   ['patch','io','Enter selected metadata / assignment changes, or choose archive / restore.'],
   ['valid','decision','Selected change and\nrecord version valid?'],
   ['save','process','Save the selected change and history; preserve equipment assignments.'],
   ['result','io','Display project, stage, equipment, custody and recorded timeline.']
  ],[
   ['progress','io','Open construction stage, weighted work areas and update history.'],
   ['update','io','Enter a work update / milestone, or a correction to a recorded update.'],
   ['validUpdate','decision','Stage, progress and\nversion valid?'],
   ['saveUpdate','process','Save the update / correction and weighted progress; retain earlier history.'],
   ['timeline','io','Display construction progress and the permanent project timeline.']
  ]);
  retry(p,'edit','result');retry(p,'valid','patch');retry(p,'validUpdate','update');finish(p,'result');finish(p,'timeline');
 }
 // 5. Each release continuation has its own matching cross-page reference.
 {
  const p=modulePage(5,'Named-asset requests, approval and cancellation','Submit / manage\nan own request?','ENGINEER / ARCHITECT','ADMIN: REQUEST REVIEW',[
   ['select','io','Choose eligible Individual Asset IDs, assigned destination and request dates.'],
   ['valid','decision','Assets and request\ndetails valid?'],
   ['submit','process','Create the pending request; record activity and notifications.'],
   ['history','io','Track own request status, decision and linked handover.'],
   ['cancel','decision','Withdraw pending /\ncancel reservation?'],
   ['adjust','process','Check ownership / current state; record reason and release only the permitted reservation.']
  ],[
   ['review','io','Open pending request; inspect requester, project and exact requested Asset IDs.'],
   ['approve','decision','Approve the\nrequest?'],
   ['reserve','process','Recheck stock and locks atomically; reserve the exact approved Asset IDs.'],
   ['committed','decision','Reservation\ncommitted?'],
   ['approved','io','Show approved request. Custody is unchanged until physical receipt.']
  ]);
  retry(p,'valid','select');retry(p,'cancel','moduleComplete');retry(p,'committed','review');finish(p,'adjust');
  sideProcess(p,'reject','Record rejection and required reason; retain history and notify the requester.');retry(p,'approve','reject');finish(p,'reject');call(p,'approved','releaseCall','X',7);
 }
 {
  const p=modulePage(6,'Equipment quantity requests and allocation','Submit a quantity\nrequest?','ENGINEER / ARCHITECT','ADMIN: EXACT ASSET ALLOCATION',[
   ['catalog','io','Browse compatible types, available / reserved units and assigned projects.'],
   ['quantity','io','Choose Individual type, quantity (1-100), project and optional purpose.'],
   ['valid','decision','Eligible type and\nquantity available?'],
   ['submit','process','Submit with a stable operation ID; keep an uncertain operation for safe retry.'],
   ['history','io','View request history, decision and assigned permanent Asset IDs.']
  ],[
   ['review','io','Open pending request; obtain eligible assets and an allocation suggestion.'],
   ['choose','io','Use the suggestion or select the exact number of eligible physical Asset IDs.'],
   ['approve','decision','Approve the full\nrequested quantity?'],
   ['reserve','process','Recheck and reserve exact units atomically; create the linked approved movement request.',{h:80,font:13}],
   ['committed','decision','Allocation\ncommitted?'],
   ['allocated','io','Display allocated Asset IDs and linked request; release remains a separate action.']
  ]);
  retry(p,'valid','quantity');retry(p,'committed','review');finish(p,'history');sideProcess(p,'reject','Reject with a required reason; retain request and operation history.');retry(p,'approve','reject');finish(p,'reject');call(p,'allocated','releaseCall','Y',7);
 }

 // 7. Sender submission does not change custody; physical receipt is distinct.
 {
  const p=modulePage(7,'Release, transfers and physical receipt','Release / receipt\nrather than field send?','ADMIN RELEASE / NAMED RECIPIENT','ENGINEER / ARCHITECT: FIELD TRANSFER',[
   ['handover','io','Admin opens approved release; Tool Handler enters an allowed classic transfer; recipient opens a pending handover.',{h:92}],
   ['release','decision','Create / release\nhandover now?'],
   ['send','process','Validate permitted release / classic transfer, recipient, assets and locks; create a pending handover.',{h:80,font:13}],
   ['inspect','io','Recipient verifies every physical Asset ID, tests condition and records notes / evidence.'],
   ['received','decision','All exact items\nreceived and tested?'],
   ['accept','process','Accept custody / destination; record history; damaged items enter repair.']
  ],[
   ['batch','io','Scan / enter eligible Individual Asset IDs in own custody; choose recipient and their project.'],
   ['details','io','Add transfer notes and optional photographs for the selected assets.'],
   ['valid','decision','Assets, recipient\nand project valid?'],
   ['pending','process','Submit pending transfer; the sender remains accountable until acceptance.'],
   ['verify','io','Named recipient opens Accept equipment; physically receives and tests every listed unit.'],
   ['all','decision','Every item physically\nreceived and tested?'],
   ['commit','process','Save tested acceptance / condition; change holder and site; retain evidence and history.']
  ]);
  retry(p,'release','inspect');retry(p,'valid','batch');finish(p,'accept',{outBelow:false});finish(p,'commit');
  n(p,'followup','process','Retain custody / pending status. Use permitted refusal or sender cancel / reopen; record follow-up.',45,1080,300,70,13);
  retry(p,'received','followup');retry(p,'all','followup');finish(p,'followup',{outBelow:false});
  off(p,'fromRequest','X','arrival',5,455,1020,88);jump(p,'fromRequest','handover','',{outBelow:true});
  off(p,'fromQuantity','Y','arrival',6,640,1020,88);jump(p,'fromQuantity','release','',{outBelow:true});
 }
 {
  const p=modulePage(8,'Return submission and Admin inspection','Submitting a\nreturn batch?','ENGINEER / ARCHITECT: RETURN','ADMIN: PER-ASSET INSPECTION',[
   ['assets','io','Scan / select exact Individual Asset IDs in own eligible custody.'],
   ['destination','io','Choose configured Office; add return notes and optional evidence photographs.'],
   ['valid','decision','Custody, assets\nand Office valid?'],
   ['submit','process','Create inspection batch and movement locks; retain original custodian accountability.'],
   ['status','io','Track pending / missing / disputed findings until physical receipt is verified.']
  ],[
   ['batch','io','Open return batch; inspect each physical Asset ID and its evidence.'],
   ['finding','io','Record Good / Damaged / Missing / Disputed, physical receipt and required notes.'],
   ['validFinding','decision','Selected findings\nvalid and current?'],
   ['save','process','Good -> Office / available; Damaged -> Office / repair. Clear holder only for accepted items.',{h:80,font:13}],
   ['unresolved','process','Retain custody / reservations for unresolved items; save inspector and evidence.'],
   ['complete','decision','All items physically\nreceived?'],
   ['history','io','Show completed batch and permanent inspection / asset history.']
  ]);
  retry(p,'valid','assets');retry(p,'validFinding','finding');retry(p,'complete','batch');finish(p,'status');finish(p,'history');
 }
 {
  const p=modulePage(9,'Repair and missing-equipment cases','Repair case\nrather than missing?','CUSTODIAN REPORT / ADMIN REPAIR','CUSTODIAN REPORT / ADMIN RECOVERY',[
   ['report','io','Custodian records damaged equipment, fault details and relevant notes.'],
   ['valid','decision','Reporter and asset\nstate permitted?'],
   ['case','process','Create repair case; equipment becomes unavailable for requests.'],
   ['review','io','Admin reviews fault / case; starts repair and records completion notes / destination.'],
   ['complete','decision','Completion valid for\ncurrent repair?'],
   ['restore','process','Record completed repair; return asset to Available at the selected site.']
  ],[
   ['missing','io','Custodian records missing equipment, last known place and circumstances.'],
   ['validMissing','decision','Reporter and asset\nstate permitted?'],
   ['register','process','Create missing case; mark unavailable and retain accountability.'],
   ['found','io','Admin records actual recovery, inspected condition, destination and notes.'],
   ['validRecovery','decision','Recovery valid for\nthis open case?'],
   ['recover','process','Good -> Available; Damaged -> repair case. Preserve recovery and custody history.']
  ]);
  retry(p,'valid','report');retry(p,'complete','review');retry(p,'validMissing','missing');retry(p,'validRecovery','found');finish(p,'restore');finish(p,'recover');
 }
 {
  const p=modulePage(10,'Asset retirement and purchase records','Equipment retirement\naction?','ADMIN: TWO-PERSON RETIREMENT','ADMIN / SECRETARY: PURCHASE LEDGER',[
   ['proposal','io','Select eligible unheld Individual asset; enter Sold / Disposed, reason, date and evidence.'],
   ['eligible','decision','No custody or\nunresolved movement?'],
   ['propose','process','Save proposed retirement; notify Admins; retain permanent Asset ID and history.'],
   ['review','io','A different active Admin reviews the proposal, evidence and current asset eligibility.'],
   ['approve','decision','Approve the\nretirement?'],
   ['retire','process','Recheck eligibility; record approval; mark asset retired / unavailable.'],
   ['history','io','View permitted sold / disposed history; record an issue report when needed.']
  ],[
   ['purchase','io','Enter supplier, reference, date, lines / totals and optional procurement link.'],
   ['receipt','io','Optionally select a private PDF / image purchase receipt.'],
   ['valid','decision','Purchase, receipt\nand version valid?'],
   ['save','process','Save ledger entry and change history; purchase recording does not receive stock.'],
   ['result','io','View authorized purchase / receipt access, history and purchase PDF.']
  ]);
  retry(p,'eligible','proposal');retry(p,'valid','purchase');finish(p,'history');finish(p,'result');
  sideProcess(p,'reject','Record rejection and decision notes; keep the proposal history without retiring the asset.');retry(p,'approve','reject');finish(p,'reject');
 }
 {
  const p=modulePage(11,'Consumables, procurement and inbound stock','Catalog / direct\nstock action?','ADMIN / SECRETARY: CATALOG & STOCK','ADMIN / SECRETARY: PROCUREMENT',[
   ['catalog','io','View category / SKU / specification, stock balance, minimum and history.'],
   ['choose','io','Choose catalog edit, stock usage / restock / count correction, or archive / restore.'],
   ['valid','decision','Selected action\nvalid and permitted?'],
   ['save','process','Save only the selected action and stock / archive history; protect units and open obligations.',{h:80,font:13}],
   ['balance','io','Display current balance, low-stock status and retained transaction history.']
  ],[
   ['request','io','Choose item and quantity; enter requester, needed date and procurement purpose.'],
   ['validRequest','decision','Valid with no\nconflicting open request?'],
   ['pending','process','Create procurement request; available stock is unchanged.'],
   ['delivery','io','Record actual delivered quantity and required delivery reference / notes.'],
   ['within','decision','Quantity within\noutstanding request?'],
   ['receive','process','Receive stock atomically; update quantity and history; retain Partial until fully received.'],
   ['status','io','Show receipt / delivery history; cancel only an outstanding remainder when selected.']
  ]);
  retry(p,'valid','choose');retry(p,'validRequest','request');retry(p,'within','delivery');finish(p,'balance');finish(p,'status');
 }
 {
  const p=modulePage(12,'Outward material requests and issuance','Submit a material\nrequest?','ENGINEER / ARCHITECT: REQUEST','ADMIN: REVIEW & PHYSICAL ISSUANCE',[
   ['items','io','Choose assigned project, material items, units / quantities and optional purpose.'],
   ['valid','decision','Items, quantities\nand project valid?'],
   ['submit','process','Submit with a stable operation ID; recover an interrupted submission before changing it.'],
   ['history','io','View review decision, approved / issued quantities and own issuance history.']
  ],[
   ['review','io','Open request; review quantities, project and requester accountability.'],
   ['approve','decision','Approve material\nquantities?'],
   ['approved','process','Save approved quantities; approval alone does not deduct stock.'],
   ['issue','io','Enter quantities physically issued now; approved remainder may be issued later.'],
   ['within','decision','Within stock and\nunissued approval?'],
   ['save','process','Deduct stock atomically; retain issue history; mark Partial or Issued.'],
   ['analytics','io','View dated issuance analytics / accountability; export CSV. Consumption stays separate.']
  ]);
  retry(p,'valid','items');retry(p,'within','issue');finish(p,'history');finish(p,'analytics');
  sideProcess(p,'reject','Record required rejection note; retain request history; no stock deduction.');retry(p,'approve','reject');finish(p,'reject');
 }
 {
  const p=modulePage(13,'Monitoring, preferences, demonstration and exit','Monitoring / report\naction?','AUTHORIZED MONITORING & EXPORTS','MY ACCOUNT / SESSION / OFFLINE DEMO',[
   ['monitor','io','View role-scoped dashboard, search, activity and own notifications / overdue records.'],
   ['open','process','Open permitted records; mark own notices read; refresh authorized data.'],
   ['admin','decision','Admin report\nrequested?'],
   ['period','io','Select current inventory, saved snapshot or activity, with a valid reporting period.'],
   ['loaded','decision','Data loaded for\nselected period?'],
   ['export','io','Preview / export the permitted report PDF. Historical inventory uses saved snapshots.']
  ],[
   ['account','io','View identity / theme. Failed session / profile revalidation closes the workspace to sign-in.'],
   ['exit','decision','Exit the\nworkspace now?'],
   ['signout','process','Clear workspace / listeners; request local Auth sign-out.'],
   ['confirmed','decision','Sign-out\nconfirmed?'],
   ['signin','io','Show signed-out sign-in screen and relevant feedback.'],
   ['demo','decision','Try an offline\ndemonstration?'],
   ['sample','process','Choose Admin / Engineer / Architect sample; use browser-only demo records.'],
   ['leaveDemo','io','Exit demo; clear demo role / workspace, retain sample records and show sign-in.']
  ]);
  // Two distinct terminals keep returning to a live menu separate from ending a session.
  n(p,'continueWork','term','RETURN TO MAIN MENU\n(Page 1)',85,1158,220,52,12);
  n(p,'sessionEnd','term','END',495,p.right.bottom+20,220,52,14);
  retry(p,'admin','moduleComplete');retry(p,'loaded','period');finish(p,'export');retry(p,'exit','continueWork');retry(p,'confirmed','signout');
  retry(p,'demo','sessionEnd');edge(p,'leaveDemo','sessionEnd');
 }
 return {pages,make,modulePage,n,edge,off,circle,jump,retry,finish,sideProcess,call,stack};
};
