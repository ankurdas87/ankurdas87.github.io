(()=>{"use strict";

const YKEY="blc_ih_yellow_drafts_v1";
const GKEY="blc_ih_green_notes_v1";
const labels={academic:"Academic",administrative:"Administrative",financial:"Finance",examination:"Examination",student_affairs:"Student Matter",establishment:"Establishment",legal_compliance:"Legal & Compliance",general_office:"General"};
const toDb={Academic:"academic",Administrative:"administrative",Finance:"financial",Examination:"examination","Student Matter":"student_affairs",Establishment:"establishment",General:"general_office"};
const $=s=>document.querySelector(s);
const sb=()=>window.supabaseClient||(window.supabase&&typeof SUPABASE_URL!=="undefined"?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY):null);
const esc=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const read=k=>{try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[]}catch{return[]}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

const nav=$(".ih-notes-actions"),label=$("#ihNotesSectionLabel"),reg=$("#ihAllNotesRegister"),list=$("#ihRegisterList"),empty=$("#ihRegisterEmpty"),count=$("#ihRegisterCount"),dock=$("#ihCreateActionDock"),sw=$("#ihNoteTypeSwitch");
const yWs=$("#ihYellowNoteWorkspace"),yCat=$("#ihYellowCategory"),ySub=$("#ihYellowSubject"),yEd=$("#ihYellowEditor"),yState=$("#ihYellowDraftState"),yFiles=$("#ihYellowFiles"),yFileList=$("#ihYellowFileList"),ySave=$("#ihYellowSave"),yConvert=$("#ihYellowConvert"),yCancel=$("#ihYellowCancel");
const gWs=$("#ihGreenNoteWorkspace"),gCat=$("#ihGreenCategory"),gSub=$("#ihGreenSubject"),gEd=$("#ihGreenEditor"),gNum=$("#ihGreenNoteNumber"),gHint=$("#ihGreenNumberHint"),gHead=$("#ihGreenHeadStatus"),gState=$("#ihGreenState"),gFiles=$("#ihGreenFiles"),gFileList=$("#ihGreenFileList"),gSave=$("#ihGreenSave"),gCancel=$("#ihGreenCancel"),gEsign=$("#ihGreenEsign");
const sendWs=$("#ihSendNoteWorkspace"),inboxWs=$("#ihInboxWorkspace"),sentWs=$("#ihSentWorkspace"),toast=$("#ihNoteSaveToast"),modal=$("#ihCorrespondenceModal"),modalBody=$("#ihCorrespondenceModalBody");

if(!nav||!reg||!dock||!sw||!yWs||!gWs)return;

let section="all",type="yellow",yellowEditingId=null,yellowReadonly=false,greenViewingId=null,me=null,recipients=[],selectedSendId=null,deliveries={inbox:[],sent:[]},profiles=new Map(),activeDelivery=null;

function resetViewport(){const panel=$("#ihPanel");const go=()=>{if(panel){panel.scrollTop=0;panel.scrollLeft=0}document.documentElement.scrollTop=0;document.body.scrollTop=0;window.scrollTo(0,0)};go();requestAnimationFrame(()=>{go();requestAnimationFrame(go)});setTimeout(go,70);setTimeout(go,180);setTimeout(go,320)}
function statusToast(title,sub){if(!toast)return;toast.querySelector("strong").textContent="✓ "+title;toast.querySelector("span").textContent=sub||"Opening All Notes…";toast.hidden=false;clearTimeout(statusToast.t);statusToast.t=setTimeout(()=>toast.hidden=true,1500)}
function clearFiles(input,box){if(input)input.value="";if(box){box.textContent="";box.hidden=true}}
function fileNames(input,box){if(!input||!box)return;const ar=[...input.files];box.hidden=!ar.length;box.textContent=ar.map(f=>f.name).join(" · ")}
function validate(cat,sub,ed,state){const body=ed?.innerHTML.trim()||"";if(!cat?.value||!sub?.value.trim()||!body){if(state)state.innerHTML="<b></b>Category, subject and note text are required";return null}return{category:cat.value,subject:sub.value.trim(),body}}
function nextLocal(category){const year=new Date().getFullYear(),c=String(category||"").trim().toUpperCase().replace(/[^A-Z0-9]+/g," ");const seq=read(GKEY).filter(n=>Number(n.year)===year&&String(n.category||"").trim().toUpperCase()===String(category||"").trim().toUpperCase()).reduce((m,n)=>Math.max(m,Number(n.sequence)||Number(String(n.noteNo||"").split("/").pop())||0),0)+1;return{year,sequence:seq,noteNo:"BLC/"+(c||"SELECT CATEGORY")+"/"+year+"/"+String(seq).padStart(3,"0")}}
function updateLocalGreen(id,patch){const rows=read(GKEY),i=rows.findIndex(x=>x.id===id);if(i>=0){rows[i]={...rows[i],...patch,updatedAt:new Date().toISOString()};write(GKEY,rows);return rows[i]}return null}

function freshYellow(){yellowEditingId=null;yellowReadonly=false;yWs.classList.remove("ih-yellow-readonly");if(yCat){yCat.disabled=false;yCat.value=""}if(ySub){ySub.readOnly=false;ySub.value=""}if(yEd){yEd.contentEditable="true";yEd.innerHTML=""}document.querySelectorAll(".ih-yellow-toolbar [data-cmd]").forEach(b=>b.disabled=false);if(ySave){ySave.hidden=false;ySave.disabled=false;ySave.textContent="Save Draft"}if(yConvert){yConvert.hidden=false;yConvert.disabled=false;yConvert.textContent="Convert to Green Note"}const lab=document.querySelector('label[for="ihYellowFiles"]');if(lab)lab.hidden=false;clearFiles(yFiles,yFileList);if(yState)yState.innerHTML="<b></b>Unsaved working draft"}
function freshGreen(){greenViewingId=null;gWs.classList.remove("ih-green-readonly");if(gWs)delete gWs.dataset.viewingId;if(gCat){gCat.disabled=false;gCat.value=""}if(gSub){gSub.readOnly=false;gSub.value=""}if(gEd){gEd.contentEditable="true";gEd.innerHTML=""}document.querySelectorAll("[data-green-cmd]").forEach(b=>b.disabled=false);if(gSave){gSave.hidden=false;gSave.disabled=false;gSave.textContent="Save Green Note"}if(gEsign)gEsign.disabled=false;const lab=document.querySelector('label[for="ihGreenFiles"]');if(lab)lab.hidden=false;clearFiles(gFiles,gFileList);if(gHead)gHead.textContent="OFFICIAL · PENDING ISSUE";if(gHint)gHint.textContent="Reserved preview · sequence is finalized with the official Green Note";if(gState)gState.innerHTML="<b></b>Official note not yet issued";previewGreen()}
function previewGreen(){if(greenViewingId||!gNum)return;gNum.textContent=nextLocal(gCat?.value).noteNo}
function lockGreen(){gWs.classList.add("ih-green-readonly");if(gCat)gCat.disabled=true;if(gSub)gSub.readOnly=true;if(gEd)gEd.contentEditable="false";document.querySelectorAll("[data-green-cmd]").forEach(b=>b.disabled=true);if(gSave)gSave.hidden=true;if(gEsign)gEsign.disabled=true;const lab=document.querySelector('label[for="ihGreenFiles"]');if(lab)lab.hidden=true}
function lockYellow(){yellowReadonly=true;yWs.classList.add("ih-yellow-readonly");if(yCat)yCat.disabled=true;if(ySub)ySub.readOnly=true;if(yEd)yEd.contentEditable="false";document.querySelectorAll(".ih-yellow-toolbar [data-cmd]").forEach(b=>b.disabled=true);if(ySave)ySave.hidden=true;if(yConvert)yConvert.hidden=true;const lab=document.querySelector('label[for="ihYellowFiles"]');if(lab)lab.hidden=true}

function renderAll(){
 const gs=read(GKEY),ys=read(YKEY),gmap=new Map(gs.map(g=>[g.id,g]));
 const rows=[...gs.map(x=>({...x,_kind:"green"})),...ys.map(x=>({...x,_kind:"yellow"}))].sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
 count.textContent=rows.length+" "+(rows.length===1?"NOTE":"NOTES");empty.hidden=!!rows.length;list.hidden=!rows.length;
 list.innerHTML=rows.map(n=>{
   if(n._kind==="green")return '<div class="ih-register-row ih-register-row-green"><span class="ih-note-id">'+esc(n.noteNo)+'</span><span>GREEN · LOCKED</span><strong>'+esc(n.subject)+'</strong><span>'+esc(n.category)+' · '+new Date(n.updatedAt||n.createdAt).toLocaleDateString()+'</span><button type="button" data-view-green="'+esc(n.id)+'">VIEW</button></div>';
   const linked=n.convertedToGreenId?gmap.get(n.convertedToGreenId):null;
   const tag=linked?"YELLOW · CONVERTED":"YELLOW · DRAFT";
   const action=linked?"VIEW SOURCE":"OPEN / EDIT";
   const relation=linked?'<small class="ih-relation">Converted to '+esc(linked.noteNo||"Green Note")+'</small>':"";
   return '<div class="ih-register-row ih-register-row-yellow"><span>'+tag+'</span><span>'+esc(n.category)+'</span><strong>'+esc(n.subject)+relation+'</strong><span>'+new Date(n.updatedAt||n.createdAt).toLocaleDateString()+'</span><button type="button" data-open-yellow="'+esc(n.id)+'">'+action+'</button></div>';
 }).join("")
}

function setType(next,preserve){
 type=next==="green"?"green":"yellow";
 sw.querySelectorAll("[data-note-type]").forEach(b=>b.classList.toggle("active",b.dataset.noteType===type));
 yWs.hidden=section!=="create"||type!=="yellow";gWs.hidden=section!=="create"||type!=="green";
 if(!preserve){if(type==="yellow")freshYellow();else freshGreen()}
}
function setSection(next){
 section=next;
 nav.querySelectorAll("[data-note-section]").forEach(b=>b.classList.toggle("active",b.dataset.noteSection===section));
 if(label)label.textContent={all:"All Notes",create:"Create Note",send:"Send Note",inbox:"Inbox",sent:"Sent Notes"}[section]||"";
 reg.hidden=section!=="all";dock.hidden=section!=="create";sw.hidden=section!=="create";
 yWs.hidden=section!=="create"||type!=="yellow";gWs.hidden=section!=="create"||type!=="green";
 if(sendWs)sendWs.hidden=section!=="send";if(inboxWs)inboxWs.hidden=section!=="inbox";if(sentWs)sentWs.hidden=section!=="sent";
 if(section==="all")renderAll();
 if(section==="create"){if(type==="yellow")freshYellow();else freshGreen()}
 if(section==="send")loadSend();
 if(section==="inbox")loadCorrespondence("inbox");
 if(section==="sent")loadCorrespondence("sent");
 resetViewport()
}

async function authUser(){if(me)return me;const c=sb();if(!c)return null;const {data:{user}}=await c.auth.getUser();me=user||null;return me}
async function dbNumber(category){const c=sb(),u=await authUser();if(!c||!u)return null;const dbCat=toDb[category]||"general_office";const {data,error}=await c.rpc("generate_blc_note_number",{p_category:dbCat});if(error)return null;const n=Array.isArray(data)?data[0]:data;return n?.generated_note_number?{noteNo:n.generated_note_number,year:n.generated_year,sequence:n.generated_serial,dbCategory:dbCat}:null}
async function createDbGreen(v,sourceDbId){
 const c=sb(),u=await authUser();if(!c||!u)return null;
 const num=await dbNumber(v.category);if(!num)return null;
 const payload={created_by:u.id,note_type:"green",category:num.dbCategory,subject:v.subject,note_content:v.body,status:"draft",note_number:num.noteNo,note_year:num.year,serial_number:num.sequence,source_yellow_note_id:sourceDbId||null};
 const {data,error}=await c.from("staff_notes").insert(payload).select("id,note_number,note_year,serial_number,category").single();if(error)return null;
 return{dbId:data.id,noteNo:data.note_number,year:data.note_year,sequence:data.serial_number,dbCategory:data.category}
}
async function createDbYellow(v){
 const c=sb(),u=await authUser();if(!c||!u)return null;const {data,error}=await c.from("staff_notes").insert({created_by:u.id,note_type:"yellow",category:toDb[v.category]||"general_office",subject:v.subject,note_content:v.body,status:"draft",note_number:null,note_year:null,serial_number:null}).select("id").single();return error?null:data?.id||null
}
async function ensureDbGreen(note){
 if(note.dbId)return note.dbId;const c=sb(),u=await authUser();if(!c||!u)throw new Error("Secure session is not available.");
 let q=await c.from("staff_notes").select("id,note_number").eq("note_type","green").eq("note_number",note.noteNo).maybeSingle();if(!q.error&&q.data?.id){updateLocalGreen(note.id,{dbId:q.data.id});return q.data.id}
 const dbCat=toDb[note.category]||note.dbCategory||"general_office";
 const payload={created_by:u.id,note_type:"green",category:dbCat,subject:note.subject,note_content:note.body,status:"draft",note_number:note.noteNo,note_year:note.year||new Date().getFullYear(),serial_number:note.sequence||Number(String(note.noteNo||"").split("/").pop())||1,source_yellow_note_id:null};
 const ins=await c.from("staff_notes").insert(payload).select("id").single();if(ins.error)throw new Error(ins.error.message);updateLocalGreen(note.id,{dbId:ins.data.id,dbCategory:dbCat});return ins.data.id
}

async function saveYellow(){
 const v=validate(yCat,ySub,yEd,yState);if(!v||yellowReadonly)return;
 const rows=read(YKEY),now=new Date().toISOString();let d=yellowEditingId?rows.find(x=>x.id===yellowEditingId):null;
 if(d){d.category=v.category;d.subject=v.subject;d.body=v.body;d.updatedAt=now}else{d={id:"YD-"+Date.now(),type:"yellow",status:"draft",...v,createdAt:now,updatedAt:now,convertedToGreenId:null};rows.push(d)}
 write(YKEY,rows);localStorage.removeItem("blc_ih_yellow_draft");freshYellow();renderAll();setSection("all");statusToast("Yellow Note saved successfully")
}
async function saveGreen(){
 if(greenViewingId)return;const v=validate(gCat,gSub,gEd,gState);if(!v)return;
 if(gSave){gSave.disabled=true;gSave.textContent="Saving…"}if(gState)gState.innerHTML="<b></b>Saving official Green Note securely…";
 const remote=await createDbGreen(v,null);const meta=remote||nextLocal(v.category),now=new Date().toISOString();
 const d={id:"GN-"+Date.now(),type:"green",status:"locked",creatorUsername:"BLC@Principal",category:v.category,subject:v.subject,body:v.body,year:meta.year,sequence:meta.sequence,noteNo:meta.noteNo,dbId:meta.dbId||null,dbCategory:meta.dbCategory||toDb[v.category]||"general_office",sourceYellowId:null,convertedFromYellow:false,createdAt:now,updatedAt:now,lockedAt:now};
 const rows=read(GKEY);rows.push(d);write(GKEY,rows);localStorage.removeItem("blc_ih_green_draft");freshGreen();renderAll();setSection("all");statusToast("Green Note saved successfully")
}
async function convertYellow(){
 const v=validate(yCat,ySub,yEd,yState);if(!v||yellowReadonly)return;
 if(yConvert){yConvert.disabled=true;yConvert.textContent="Converting…"}const ys=read(YKEY),now=new Date().toISOString();let y=yellowEditingId?ys.find(x=>x.id===yellowEditingId):null;
 if(!y){y={id:"YD-"+Date.now(),type:"yellow",status:"draft",...v,createdAt:now,updatedAt:now,convertedToGreenId:null};ys.push(y)}else{y.category=v.category;y.subject=v.subject;y.body=v.body;y.updatedAt=now}
 const sourceDbId=y.dbId||await createDbYellow(v);if(sourceDbId)y.dbId=sourceDbId;
 const remote=await createDbGreen(v,sourceDbId||null);const meta=remote||nextLocal(v.category);
 const g={id:"GN-"+Date.now(),type:"green",status:"locked",creatorUsername:"BLC@Principal",category:v.category,subject:v.subject,body:v.body,year:meta.year,sequence:meta.sequence,noteNo:meta.noteNo,dbId:meta.dbId||null,dbCategory:meta.dbCategory||toDb[v.category]||"general_office",sourceYellowId:y.id,sourceYellowDbId:sourceDbId||null,convertedFromYellow:true,createdAt:now,updatedAt:now,lockedAt:now};
 const gs=read(GKEY);gs.push(g);write(GKEY,gs);y.convertedToGreenId=g.id;y.status="converted";y.updatedAt=now;write(YKEY,ys);freshYellow();renderAll();setSection("all");statusToast("Yellow Note converted to Green successfully")
}

function openYellow(id){
 const d=read(YKEY).find(x=>x.id===id);if(!d)return;setSection("create");setType("yellow",true);yellowEditingId=d.id;
 yCat.value=d.category||"";ySub.value=d.subject||"";yEd.innerHTML=d.body||"";
 if(d.convertedToGreenId){lockYellow();if(yState)yState.innerHTML="<b></b>Converted Yellow source · read only"}else{yellowReadonly=false;yWs.classList.remove("ih-yellow-readonly");yCat.disabled=false;ySub.readOnly=false;yEd.contentEditable="true";document.querySelectorAll(".ih-yellow-toolbar [data-cmd]").forEach(b=>b.disabled=false);ySave.hidden=false;yConvert.hidden=false;if(yState)yState.innerHTML="<b></b>Saved Yellow draft · editable"}
}
function openGreen(id){
 const d=read(GKEY).find(x=>x.id===id);if(!d)return;setSection("create");setType("green",true);greenViewingId=d.id;
 gWs.dataset.viewingId=d.id;gCat.value=d.category||"";gSub.value=d.subject||"";gEd.innerHTML=d.body||"";gNum.textContent=d.noteNo||"";if(gHead)gHead.textContent="OFFICIAL · LOCKED";if(gHint)gHint.textContent="Locked official record · read only";if(gState)gState.innerHTML="<b></b>Read-only Green Note · ready for sending";lockGreen()
}

function profileName(p){return [p?.first_name,p?.last_name].filter(Boolean).join(" ")||p?.username||"Staff Member"}
async function loadRecipients(){
 const c=sb();if(!c)return[];const r=await c.rpc("get_staff_note_recipients");if(r.error)return[];const u=await authUser();recipients=(r.data||[]).filter(p=>p.id!==u?.id);return recipients
}
function sendStatus(msg,kind){const e=$("#ihSendStatus");if(!e)return;e.textContent=msg;e.className="ih-dispatch-status "+(kind||"")}
function renderSendNotes(){
 const notes=read(GKEY).filter(n=>n.status==="locked");const s=$("#ihSendSelect");if(!s)return;s.innerHTML='<option value="">Select a saved Green Note</option>'+notes.map(n=>'<option value="'+esc(n.id)+'">'+esc(n.noteNo)+' · '+esc(n.subject)+'</option>').join("");if(!notes.length)s.innerHTML='<option value="">No Green Notes available</option>'
}
function renderRecipients(){
 const s=$("#ihSendRecipient");if(!s)return;s.innerHTML='<option value="">Select recipient</option>'+recipients.map(p=>'<option value="'+esc(p.id)+'">'+esc(profileName(p))+' · '+esc(p.username||"")+(p.designation?" · "+esc(p.designation):"")+'</option>').join("");if(!recipients.length)s.innerHTML='<option value="">No active staff recipients found</option>'
}
function attachSend(id){
 const n=read(GKEY).find(x=>x.id===id);selectedSendId=n?.id||null;const box=$("#ihSendPreview");if(!box)return;if(!n){box.classList.remove("visible");box.innerHTML="";return}
 box.innerHTML='<div class="ih-send-preview-head"><strong>GREEN NOTE ATTACHED</strong><button type="button" id="ihRemoveSendNote">Remove</button></div><div class="ih-send-preview-grid"><div><small>NOTE NO.</small><strong>'+esc(n.noteNo)+'</strong></div><div><small>CATEGORY</small><strong>'+esc(n.category)+'</strong></div><div><small>RECORD TYPE</small><strong>'+(n.convertedFromYellow?"Converted from Yellow":"Direct Green Note")+'</strong></div></div><div class="ih-send-preview-subject"><small>SUBJECT</small><b>'+esc(n.subject)+'</b></div>';box.classList.add("visible");const s=$("#ihSendSelect");if(s)s.value=n.id;sendStatus("")
}
async function loadSend(){
 $("#ihSendFrom").value="BLC@Principal · Principal-cum-Secretary";$("#ihSendFromName").textContent="Principal-cum-Secretary";$("#ihSendFromUser").textContent="BLC@Principal · Executive Office";renderSendNotes();await loadRecipients();renderRecipients();attachSend(null);sendStatus(read(GKEY).some(n=>n.status==="locked")?"":"No Green Notes are currently available to send.")
}
async function submitSend(e){
 e.preventDefault();const n=read(GKEY).find(x=>x.id===selectedSendId),recipient=$("#ihSendRecipient").value,message=$("#ihSendMessage").value.trim(),btn=$("#ihSendSubmit");if(!n){sendStatus("Attach a Green Note before sending.","bad");return}if(!recipient){sendStatus("Select the staff member who should receive this note.","bad");return}
 const c=sb(),u=await authUser();if(!c||!u){sendStatus("Secure session is not available.","bad");return}btn.disabled=true;sendStatus("Sending official note…");
 try{const noteId=await ensureDbGreen(n);const ins=await c.from("staff_note_deliveries").insert({note_id:noteId,sender_id:u.id,recipient_id:recipient,message:message||null,status:"sent"});if(ins.error)throw new Error(ins.error.message);sendStatus("Note sent successfully.","good");statusToast("Note sent successfully","Opening Sent Notes…");$("#ihSendMessage").value="";attachSend(null);setTimeout(()=>setSection("sent"),800)}catch(err){sendStatus("Note could not be sent: "+(err.message||"Unknown error"),"bad")}finally{btn.disabled=false}
}

function profileLine(p){if(!p)return"—";return profileName(p)+(p.username?" · "+p.username:"")+(p.designation?" · "+p.designation:"")}
async function loadProfiles(){const c=sb();if(!c)return;const r=await c.rpc("get_staff_correspondence_profiles");profiles=new Map();(r.data||[]).forEach(p=>profiles.set(String(p.id),p))}
async function loadCorrespondence(mode){
 const root=mode==="inbox"?inboxWs:sentWs,listEl=mode==="inbox"?$("#ihInboxList"):$("#ihSentList");if(!root||!listEl)return;listEl.innerHTML='<div class="ih-correspondence-empty"><strong>Loading correspondence…</strong></div>';
 const c=sb(),u=await authUser();if(!c||!u){listEl.innerHTML='<div class="ih-correspondence-empty"><strong>Secure session unavailable</strong></div>';return}
 const field=mode==="inbox"?"recipient_id":"sender_id";const r=await c.from("staff_note_deliveries").select("id,note_id,sender_id,recipient_id,message,status,sent_at,read_at,note:staff_notes(id,note_number,subject,category,note_content,source_yellow_note_id)").eq(field,u.id).order("sent_at",{ascending:false});
 if(r.error){listEl.innerHTML='<div class="ih-correspondence-empty"><strong>Correspondence could not be loaded</strong><span>'+esc(r.error.message)+'</span></div>';return}
 deliveries[mode]=r.data||[];await loadProfiles();renderCorrespondence(mode)
}
function noteOf(r){return Array.isArray(r?.note)?r.note[0]:r?.note}
function otherProfile(r,mode){const id=mode==="inbox"?r.sender_id:r.recipient_id;return profiles.get(String(id))||null}
function renderCorrespondence(mode){
 const rows=deliveries[mode]||[],root=mode==="inbox"?inboxWs:sentWs,listEl=mode==="inbox"?$("#ihInboxList"):$("#ihSentList"),q=(mode==="inbox"?$("#ihInboxSearch"):$("#ihSentSearch"))?.value.trim().toLowerCase()||"",filter=mode==="inbox"?($("#ihInboxFilter")?.value||"all"):"all";
 const filtered=rows.filter(r=>{const n=noteOf(r),p=otherProfile(r,mode),unread=!r.read_at&&r.status!=="read";if(filter==="unread"&&!unread)return false;if(filter==="read"&&unread)return false;return !q||[n?.note_number,n?.subject,labels[n?.category]||n?.category,profileName(p),p?.username,r.message].join(" ").toLowerCase().includes(q)});
 const summary=mode==="inbox"?$("#ihInboxSummary"):$("#ihSentSummary"),unread=mode==="inbox"?rows.filter(r=>!r.read_at&&r.status!=="read").length:0;
 if(summary)summary.innerHTML='<span>'+rows.length+' '+(mode==="inbox"?"Received":"Sent")+'</span>'+(mode==="inbox"?'<span>'+unread+' Unread</span><span>'+(rows.length-unread)+' Read</span>':"");
 if(!filtered.length){listEl.innerHTML='<div class="ih-correspondence-empty"><strong>No '+(mode==="inbox"?"received":"sent")+' notes found</strong><span>'+(rows.length?"Try another search or filter.":mode==="inbox"?"Official notes sent to the Principal will appear here automatically.":"Notes dispatched from this office will appear here automatically.")+'</span></div>';return}
 listEl.innerHTML=filtered.map(r=>{const n=noteOf(r),p=otherProfile(r,mode),unread=mode==="inbox"&&!r.read_at&&r.status!=="read";return '<article class="ih-correspondence-card '+(unread?"unread":"")+'"><div class="ih-correspondence-card-mark">'+(mode==="inbox"?"↓":"↑")+'</div><div class="ih-correspondence-card-main"><div class="ih-correspondence-card-meta"><button type="button" class="ih-correspondence-note-link" data-open-delivery="'+esc(r.id)+'" data-mode="'+mode+'">'+esc(n?.note_number||"GREEN NOTE")+'</button><span>'+esc(labels[n?.category]||n?.category||"")+'</span><i>'+(mode==="inbox"?(unread?"Unread":"Read"):"Sent")+'</i></div><h4>'+esc(n?.subject||"Official Green Note")+'</h4><p><b>'+(mode==="inbox"?"From":"To")+':</b> '+esc(profileLine(p))+'</p><p>'+(mode==="inbox"?"Received":"Sent")+' · '+new Date(r.sent_at).toLocaleString()+'</p>'+(r.message?'<p><b>Forwarding Remark:</b> '+esc(r.message)+'</p>':"")+'</div><div class="ih-correspondence-card-actions"><button type="button" data-open-delivery="'+esc(r.id)+'" data-mode="'+mode+'">Open Note</button>'+(mode==="inbox"?'<button type="button" data-forward-delivery="'+esc(r.id)+'">Forward</button>':"")+'</div></article>'}).join("")
}
async function openDelivery(id,mode){
 const r=(deliveries[mode]||[]).find(x=>String(x.id)===String(id));if(!r||!modal||!modalBody)return;activeDelivery={r,mode};const c=sb(),n=noteOf(r),sender=mode==="inbox"?otherProfile(r,mode):null,recipient=mode==="sent"?otherProfile(r,mode):null;
 if(mode==="inbox"&&!r.read_at&&r.status!=="read"){const mk=await c.rpc("mark_staff_note_read",{p_delivery_id:r.id});if(!mk.error){r.status="read";r.read_at=new Date().toISOString();renderCorrespondence(mode)}}
 modalBody.innerHTML='<button type="button" class="ih-modal-note-number-open" data-open-full-note="'+esc(r.id)+'" data-mode="'+mode+'">'+esc(n?.note_number||"GREEN NOTE")+'</button><h3>'+esc(n?.subject||"Official Green Note")+'</h3><div class="ih-modal-parties"><div><small>FROM</small><strong>'+esc(mode==="inbox"?profileLine(sender):"Principal-cum-Secretary · BLC@Principal")+'</strong></div><div><small>TO</small><strong>'+esc(mode==="sent"?profileLine(recipient):"Principal-cum-Secretary · BLC@Principal")+'</strong></div><div><small>CATEGORY</small><strong>'+esc(labels[n?.category]||n?.category||"—")+'</strong></div><div><small>'+(mode==="inbox"?"RECEIVED":"SENT")+'</small><strong>'+new Date(r.sent_at).toLocaleString()+'</strong></div></div>'+(r.message?'<div class="ih-modal-remark"><b>Forwarding Remark</b><br>'+esc(r.message)+'</div>':"")+'<div class="ih-modal-open-hint">Click the Note No. above to open the complete official Green Note.</div>'+(mode==="inbox"?'<div class="ih-forward-box" id="ihForwardBox" hidden><div class="ih-dispatch-field"><label>TO STAFF MEMBER</label><select id="ihForwardRecipient"></select></div><div class="ih-dispatch-field"><label>FORWARDING REMARK</label><input id="ihForwardMessage" maxlength="1000" placeholder="Optional official remark"></div><button type="button" class="ih-forward-submit" id="ihForwardSubmit">Forward →</button></div>':"");
 modal.hidden=false
}
async function openFullNote(id,mode){
 const r=(deliveries[mode]||[]).find(x=>String(x.id)===String(id));if(!r||!modal||!modalBody)return;activeDelivery={r,mode};const c=sb(),n=noteOf(r),sender=mode==="inbox"?otherProfile(r,mode):null,recipient=mode==="sent"?otherProfile(r,mode):null;
 let attachments=[];const at=await c.from("staff_note_attachments").select("id,file_path,original_file_name,mime_type,file_size").eq("note_id",r.note_id).order("created_at",{ascending:false});if(!at.error)attachments=at.data||[];
 modalBody.innerHTML='<div class="ih-full-note-view"><div class="ih-full-note-toolbar"><button type="button" data-back-summary="1">← Back to Summary</button><span>OFFICIAL GREEN NOTE · READ ONLY</span></div><article class="ih-full-note-sheet"><header class="ih-full-note-header"><div><small>BARPETA LAW COLLEGE · ESTD. 1972</small><h3>Institutional Green Note</h3></div><div class="ih-full-note-ref"><small>NOTE NO.</small><strong>'+esc(n?.note_number||"GREEN NOTE")+'</strong></div></header><div class="ih-full-note-meta"><div><small>CATEGORY</small><strong>'+esc(labels[n?.category]||n?.category||"—")+'</strong></div><div><small>STATUS</small><strong>'+(mode==="inbox"?"Received":"Sent")+'</strong></div><div><small>FROM</small><strong>'+esc(mode==="inbox"?profileLine(sender):"Principal-cum-Secretary · BLC@Principal")+'</strong></div><div><small>TO</small><strong>'+esc(mode==="sent"?profileLine(recipient):"Principal-cum-Secretary · BLC@Principal")+'</strong></div></div><section class="ih-full-note-body"><label>SUBJECT</label><h2>'+esc(n?.subject||"Official Green Note")+'</h2><label>NOTE DETAILS</label><div class="ih-full-note-content">'+(n?.note_content||"")+'</div></section><section class="ih-full-note-files"><div><strong>Supporting Attachment</strong><small>'+(attachments.length?attachments.length+' file attached':'No supporting file attached')+'</small></div><div class="ih-full-note-file-actions">'+(attachments.length?attachments.map(att=>'<button type="button" data-open-head-attachment="'+esc(att.id)+'" data-path="'+esc(att.file_path)+'">Open Attachment · '+esc(att.original_file_name||"File")+'</button>').join(""):'<span>No attachment</span>')+'</div></section><footer class="ih-full-note-signature"><div><strong>E-Signature</strong><small>Signature record</small></div><div>🔒 Protected official record</div></footer></article></div>';
 modal.hidden=false
}
async function openHeadAttachment(path){
 const c=sb();if(!c||!path)return;const r=await c.storage.from("staff-note-attachments").createSignedUrl(path,60);if(r.error||!r.data?.signedUrl){alert("This attachment is not available to your account yet.");return}window.open(r.data.signedUrl,"_blank","noopener")
}
async function openForward(id){
 const r=(deliveries.inbox||[]).find(x=>String(x.id)===String(id));if(!r)return;await openDelivery(id,"inbox");if(!recipients.length)await loadRecipients();const box=$("#ihForwardBox"),s=$("#ihForwardRecipient");if(box&&s){s.innerHTML='<option value="">Select recipient</option>'+recipients.map(p=>'<option value="'+esc(p.id)+'">'+esc(profileName(p))+' · '+esc(p.username||"")+'</option>').join("");box.hidden=false}
}
async function submitForward(){
 if(!activeDelivery?.r)return;const recipient=$("#ihForwardRecipient")?.value,message=$("#ihForwardMessage")?.value.trim()||"";if(!recipient){alert("Select the staff member who should receive this note.");return}const c=sb();const r=await c.rpc("forward_staff_note",{p_delivery_id:activeDelivery.r.id,p_recipient_id:recipient,p_message:message||null});if(r.error){alert("Note could not be forwarded: "+r.error.message);return}modal.hidden=true;statusToast("Note forwarded successfully");loadCorrespondence("inbox")
}

document.querySelectorAll(".ih-yellow-toolbar [data-cmd]").forEach(b=>b.addEventListener("click",()=>{if(yellowReadonly)return;yEd?.focus();document.execCommand(b.dataset.cmd,false,null)}));
document.querySelectorAll("[data-green-cmd]").forEach(b=>b.addEventListener("click",()=>{if(greenViewingId)return;gEd?.focus();document.execCommand(b.dataset.greenCmd,false,null)}));
yFiles?.addEventListener("change",()=>fileNames(yFiles,yFileList));gFiles?.addEventListener("change",()=>fileNames(gFiles,gFileList));gCat?.addEventListener("change",previewGreen);
ySave?.addEventListener("click",saveYellow);gSave?.addEventListener("click",saveGreen);yConvert?.addEventListener("click",convertYellow);yCancel?.addEventListener("click",()=>setSection("all"));gCancel?.addEventListener("click",()=>setSection("all"));

nav.addEventListener("click",e=>{const b=e.target.closest("[data-note-section]");if(b)setSection(b.dataset.noteSection)});
dock.addEventListener("click",e=>{const b=e.target.closest("[data-note-jump]");if(b)setSection(b.dataset.noteJump)});
sw.addEventListener("click",e=>{const b=e.target.closest("[data-note-type]");if(b)setType(b.dataset.noteType)});

list.addEventListener("click",e=>{const y=e.target.closest("[data-open-yellow]"),g=e.target.closest("[data-view-green]");if(y)openYellow(y.dataset.openYellow);if(g)openGreen(g.dataset.viewGreen)});

document.addEventListener("click",e=>{
 const fm=e.target.closest("[data-ih-find-mode]");if(fm){document.querySelectorAll("[data-ih-find-mode]").forEach(x=>x.classList.toggle("active",x===fm));document.querySelectorAll("[data-ih-find-pane]").forEach(x=>x.hidden=x.dataset.ihFindPane!==fm.dataset.ihFindMode)}
 if(e.target.id==="ihFindSendNote"){const raw=$("#ihSendNumber")?.value.trim().toUpperCase();const n=read(GKEY).find(x=>String(x.noteNo||"").toUpperCase()===raw);if(!raw)sendStatus("Enter a Note No. to find.","bad");else if(!n){attachSend(null);sendStatus("No saved Green Note was found with that Note No.","bad")}else attachSend(n.id)}
 if(e.target.id==="ihRemoveSendNote")attachSend(null);
 const od=e.target.closest("[data-open-delivery]");if(od)openDelivery(od.dataset.openDelivery,od.dataset.mode);
 const full=e.target.closest("[data-open-full-note]");if(full)openFullNote(full.dataset.openFullNote,full.dataset.mode);
 const back=e.target.closest("[data-back-summary]");if(back&&activeDelivery)openDelivery(activeDelivery.r.id,activeDelivery.mode);
 const att=e.target.closest("[data-open-head-attachment]");if(att)openHeadAttachment(att.dataset.path);
 const fw=e.target.closest("[data-forward-delivery]");if(fw)openForward(fw.dataset.forwardDelivery);
 if(e.target.id==="ihForwardSubmit")submitForward();
 if(e.target.id==="ihCorrespondenceModalClose"||e.target.id==="ihCorrespondenceModal")modal.hidden=true
});
$("#ihSendSelect")?.addEventListener("change",e=>attachSend(e.target.value));
$("#ihSendForm")?.addEventListener("submit",submitSend);
$("#ihInboxSearch")?.addEventListener("input",()=>renderCorrespondence("inbox"));$("#ihInboxFilter")?.addEventListener("change",()=>renderCorrespondence("inbox"));$("#ihSentSearch")?.addEventListener("input",()=>renderCorrespondence("sent"));

freshYellow();freshGreen();renderAll();setSection("all");
})();