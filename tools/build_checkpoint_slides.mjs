import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const ROOT=process.cwd();
const RUNTIME='C:/Users/mohdz/.cache/codex-runtimes/codex-primary-runtime/dependencies';
process.env.RUNTIME_NODE_MODULES=RUNTIME+'/node/node_modules';
const SKILL='C:/Users/mohdz/.codex/plugins/cache/openai-primary-runtime/presentations/26.1020.11127/skills/presentations';
const {Presentation,PresentationFile}=await import(pathToFileURL(RUNTIME+'/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs').href);
const {finalizePresentation}=await import(pathToFileURL(SKILL+'/container_tools/artifact_tool_utils.mjs').href);
const input=JSON.parse(await fs.readFile(path.join(ROOT,'tools/checkpoint-content.json'),'utf8'));
const build=path.join(ROOT,'deliverables/.build/slides');
const output=path.join(ROOT,'deliverables/week-5-checkpoint');
const qa=path.join(ROOT,'deliverables/.build/demo-qa');
await fs.mkdir(build,{recursive:true});await fs.mkdir(output,{recursive:true});
const deck=Presentation.create({slideSize:{width:1280,height:720}});
deck.theme.defaultFont='Segoe UI';
const C={navy:'#152e48',ink:'#172b3a',orange:'#a94110',muted:'#526171',line:'#c7d2dd',paper:'#f3f5f7'};
function text(slide,value,x,y,w,h,size=26,color=C.ink,bold=false){const s=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});s.text=value;s.text.style={typeface:'Segoe UI',fontSize:size,color,bold};s.text.insets=0;return s;}
function rowText(slide,values,start=190,gap=84,size=27){for(let i=0;i<values.length;i++)text(slide,values[i],70,start+i*gap,1130,66,size);}
function box(slide,title,fields,x,y,w,h){const s=slide.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill:'#ffffff',line:{fill:C.line,width:1.5}});text(slide,title,x+16,y+12,w-32,33,24,C.navy,true);text(slide,fields,x+16,y+52,w-32,h-60,19,C.muted);return s;}
function connect(slide,a,b,from='right',to='left'){return slide.shapes.connect(a,b,{fromSide:from,toSide:to,kind:'elbow',line:{fill:C.muted,width:1.5}});}
function table(slide,values,widths,y=180,height=350){const t=slide.tables.add({rows:values.length,columns:values[0].length,left:70,top:y,width:1140,height,values,columnWidths:widths});t.cells.block({row:0,column:0,rowCount:values.length,columnCount:values[0].length}).assign({fill:'#ffffff',textStyle:{typeface:'Segoe UI',fontSize:23,color:C.ink},margins:{left:14,right:14,top:14,bottom:14}});t.cells.block({row:0,column:0,rowCount:1,columnCount:values[0].length}).assign({fill:C.navy,textStyle:{typeface:'Segoe UI',fontSize:23,color:'#ffffff',bold:true}});t.borders.assign({fill:C.line,width:1,style:'solid'});return t;}
for(const [i,content] of input.slides.entries()){
  const s=deck.slides.add();s.background.fill=content.kind==='cover'?C.navy:'#ffffff';
  s.speakerNotes.text=content.notes;
  if(content.kind==='cover'){
    text(s,'ParcelTrack Lite',75,135,1100,100,74,'#ffffff',true);
    text(s,'Week 5 checkpoint',78,265,1000,60,36,'#ffffff');
    text(s,'Naszrul / Zikri / Syauqi',80,393,900,45,28,'#d9e4ed');
    text(s,'22 October 2026',80,455,900,45,26,'#d9e4ed');
    text(s,'Frontend prototype and implementation plan',80,600,1100,42,25,'#ffffff');
  }else{
    text(s,content.title,65,52,1150,80,43,C.navy,true);
    text(s,String(i+1).padStart(2,'0'),1160,655,65,30,18,C.muted);
    if(content.kind==='allocation'){
      table(s,[['Owner','Module','Main responsibility'],['Naszrul','M1','Login and User Management'],['Zikri','M2','Parcel Registration and Public Tracking'],['Syauqi','M3','Delivery Update and Admin Dashboard']],[150,150,840],185,340);
      text(s,'Shared data model, API contracts, integration and test evidence',75,570,1110,65,27,C.muted);
    }else if(content.kind==='stack'){
      const a=box(s,'React + TypeScript','Seller, Rider, Admin\nand public interfaces',75,200,270,170);
      const b=box(s,'FastAPI','Shared authenticated APIs\nSQLAlchemy + Alembic',505,200,285,170);
      const c=box(s,'PostgreSQL','Private database\nRow level security',945,200,265,170);
      connect(s,a,b);connect(s,b,c);
      text(s,'Planned deployment: Docker Compose on AWS EC2 with HTTPS',75,440,1120,64,30,C.navy,true);
      text(s,'Prototype today: React and synthetic browser data',75,530,1110,50,28,C.muted);
      text(s,'FastAPI/PostgreSQL variation: lecturer acceptance unverified',75,600,1110,45,24,C.orange);
    }else if(content.kind==='erd'){
      const u=box(s,'User','id (PK) / role\nusername / password_hash\nis_active / session_version',65,180,270,185);
      const p=box(s,'Parcel','id (PK) / tracking_number\nseller_id / assigned_rider_id\nrecipient fields / weight\ncurrent_status / version',490,180,295,235);
      const h=box(s,'ParcelStatusHistory','parcel_id / changed_by_id\nstatus / changed_at',945,160,275,150);
      const proof=box(s,'DeliveryProof','parcel_id (unique FK)\nprivate storage key / metadata',945,390,275,150);
      const audit=box(s,'AuditEvent','actor_id / target_user_id / parcel_id (nullable FKs)\nevent_type / outcome / occurred_at / safe_details',65,490,720,130);
      connect(s,u,p);connect(s,p,h);connect(s,p,proof);connect(s,u,audit,'bottom','top');connect(s,p,audit,'bottom','top');
      text(s,'Seller: 1 to many\nRider: 0..1 to many',350,185,135,70,18,C.muted);
      text(s,'1 to many',805,170,135,28,18,C.muted);text(s,'1 to 0..1',805,495,130,28,18,C.muted);
      text(s,'Conceptual design. Session and rate-limit infrastructure omitted.',70,650,1050,34,21,C.muted);
    }else if(content.kind==='screenshot'){
      let y=195;for(const line of content.body){text(s,line,65,y,300,95,26,line.startsWith('Owner')?C.orange:C.ink,line.startsWith('Owner'));y+=105;}
      const imageName=i===4?'m1-login-panel.png':i===5?'m2-detail-panel.png':i===6?'m3-detail-panel.png':content.image;
      s.images.add({blob:new Uint8Array(await fs.readFile(path.join(qa,imageName))),contentType:'image/png',alt:content.title+' frontend prototype screenshot',fit:'contain',position:{left:395,top:i===6?300:165,width:820,height:i===6?310:455}});
      if(i===6)s.images.add({blob:new Uint8Array(await fs.readFile(path.join(qa,'m3-counts-panel.png'))),contentType:'image/png',alt:'Five status counts in the Admin prototype',fit:'contain',position:{left:395,top:170,width:820,height:110}});
      text(s,'Frontend prototype / synthetic data / backend enforcement planned',395,632,800,40,20,C.muted);
    }else if(content.kind==='security'){
      table(s,[['Policy','Requirement for the final system'],['P1','Server role checks, ownership and Rider disablement'],['P2','10+ character passwords, hashing and compromise reporting'],['P3','Minimal public data and 12-month delivery-data retention'],['P4','Secrets outside source, synthetic tests and generic errors'],['P5','Safe audit events and incident reporting within one hour']],[125,1015],165,425);
      text(s,'Server controls are planned. Prototype checks do not prove security.',75,620,1100,45,25,C.orange);
    }else if(content.kind==='progress'){
      rowText(s,content.body,175,98,28);
      text(s,'Challenges: shared contracts, stack acceptance and AWS access',75,600,1110,45,25,C.orange);
    }else if(content.kind==='roadmap'){
      table(s,[['Teaching week','Proposed milestone'],['6','PH1: shared foundation and test harness'],['7','PH2: real authenticated module slices'],['8-9','PH3: full functionality and early AWS smoke'],['10-12','PH4-PH5: security regression and AWS operations'],['13-14','PH6: evidence, rehearsal and final submission']],[210,930],170,430);
      text(s,'Proposed schedule. Confirm the Week 14 calendar date.',75,630,1100,35,24,C.muted);
    }else if(content.kind==='demo'){
      rowText(s,content.body,170,79,28);
      text(s,'github.com/Naszrul-NZL/ParcelTrack-Lite',75,610,1120,45,25,C.orange);
    }
  }
}
const notes=input.slides.map((s,i)=>`## Slide ${i+1} ${s.title}\n\n${s.notes}\n`).join('\n');
await fs.writeFile(path.join(output,'speaking-notes.md'),'# ParcelTrack Lite Week 5 speaking notes\n\nSuggested rehearsal: about 7 minutes of slides plus a 5-minute live demo. Adjust to the lecturer’s allotted time.\n\n'+notes);
const candidate=path.join(build,'candidate.pptx');await(await PresentationFile.exportPptx(deck)).save(candidate);
console.log('Draft exported');
for(const [i,s]of deck.slides.items.entries()) {const png=await deck.export({slide:s,format:'png',scale:1});await fs.writeFile(path.join(build,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));console.log('Rendered '+(i+1));}
const finalDirectory=await fs.mkdtemp(path.join(ROOT,'deliverables/.build/final-slides-'));
const finalPath=path.join(finalDirectory,'ParcelTrack-Lite-Week-5.pptx');
const result=await finalizePresentation({workspaceDir:ROOT,candidatePath:candidate,finalPath,pythonExecutable:RUNTIME+'/python/python.exe',integrityValidatorPath:SKILL+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:SKILL+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...[2,9,11].flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:[2,9,11],fontPolicy:{basis:'design',families:['Segoe UI']},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation-'+path.basename(finalDirectory)+'.json')});
console.log(JSON.stringify(result));
await fs.copyFile(finalPath,path.join(output,'ParcelTrack-Lite-Week-5.pptx'));
