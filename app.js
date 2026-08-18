document.querySelector('.menu-btn')?.addEventListener('click',()=>{const n=document.querySelector('.navlinks');n.style.display=n.style.display==='flex'?'none':'flex';n.style.position='absolute';n.style.right='14px';n.style.top='70px';n.style.flexDirection='column';n.style.padding='16px';n.style.background='#fff';n.style.border='1px solid #e5e8ec';n.style.borderRadius='16px';n.style.boxShadow='0 20px 50px rgba(0,0,0,.12)'});

const SUPABASE_URL='https://eehwantbgoslbhymoirz.supabase.co';
const SUPABASE_KEY='sb_publishable_HuGhh5or8zAABenkpiAXvw_mrUD8LBl';
const supabaseClient=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY);

const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const params=new URLSearchParams(location.search);
const cat=params.get('category');
const categoryEl=document.querySelector('#category');
if(categoryEl&&cat)categoryEl.value=cat;

function showResult(selector,html,error=false){const r=document.querySelector(selector);if(!r)return;r.hidden=false;r.innerHTML=html;r.style.borderColor=error?'#d9534f':'';}

// Student Help Desk submission
 document.querySelector('#helpForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!supabaseClient){showResult('#formResult','Supabase could not be loaded. Please refresh and try again.',true);return;}
  const f=new FormData(e.target);
  const payload={
   student_name:String(f.get('name')||'').trim(),
   email:String(f.get('email')||'').trim(),
   whatsapp:String(f.get('whatsapp')||'').trim(),
   category:String(f.get('category')||'').trim(),
   subject:String(f.get('subject')||'').trim(),
   description:String(f.get('message')||'').trim(),
   priority:String(f.get('priority')||'Normal').trim(),
   status:'Received'
  };
  const {data,error}=await supabaseClient.from('help_requests').insert(payload).select('request_id').single();
  if(error){console.error(error);showResult('#formResult','<b>Unable to submit the request.</b><br>'+esc(error.message),true);return;}
  const id=data?.request_id||'Request ID unavailable';
  showResult('#formResult','<b>Request submitted successfully.</b><br>Your Request ID is <strong>'+esc(id)+'</strong>.<br>Keep this ID to check the status.');
  e.target.reset();
 });

// Secure request tracking through the database RPC function
 document.querySelector('#trackForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!supabaseClient){showResult('#trackResult','Supabase could not be loaded. Please refresh and try again.',true);return;}
  const id=String(new FormData(e.target).get('requestId')||'').trim().toUpperCase();
  const {data,error}=await supabaseClient.rpc('track_help_request',{p_request_id:id});
  if(error){console.error(error);showResult('#trackResult','<b>Unable to check this request.</b><br>'+esc(error.message),true);return;}
  const req=Array.isArray(data)?data[0]:data;
  if(!req){showResult('#trackResult','No request was found for <strong>'+esc(id)+'</strong>.');return;}
  showResult('#trackResult','<b>'+esc(req.request_id)+'</b><br>Category: '+esc(req.category)+'<br>Subject: '+esc(req.subject)+'<br>Priority: <strong>'+esc(req.priority)+'</strong><br>Status: <strong>'+esc(req.status)+'</strong><br>Submitted: '+new Date(req.created_at).toLocaleString()+(req.updated_at?' <br>Last updated: '+new Date(req.updated_at).toLocaleString():'') );
 });

async function renderAdmin(){
 const list=document.querySelector('#adminList');
 if(!list||!supabaseClient)return;
 const {data,error}=await supabaseClient.from('help_requests').select('id,request_id,student_name,email,whatsapp,category,subject,description,priority,status,admin_notes,created_at,updated_at').order('created_at',{ascending:false});
 if(error){showResult('#adminList','<b>Unable to load requests.</b><br>'+esc(error.message),true);return;}
 const rs=data||[];
 const by=s=>rs.filter(r=>r.status===s).length;
 document.querySelector('#statNew')&&(document.querySelector('#statNew').textContent=by('Received')+by('New'));
 document.querySelector('#statActive')&&(document.querySelector('#statActive').textContent=by('In Progress')+by('Awaiting Information'));
 document.querySelector('#statDone')&&(document.querySelector('#statDone').textContent=by('Resolved')+by('Closed'));
 document.querySelector('#statTotal')&&(document.querySelector('#statTotal').textContent=rs.length);
 list.innerHTML=rs.length?rs.map(r=>`<div class="feature" style="margin:10px 0;padding:18px"><b>${esc(r.request_id)}</b> · ${esc(r.category)} · <strong>${esc(r.status)}</strong><p style="margin:6px 0;color:#66737e"><b>${esc(r.student_name)}</b> — ${esc(r.subject||'No subject')}<br>${esc(r.description)}</p><small>${new Date(r.created_at).toLocaleString()} · Priority: ${esc(r.priority)}${r.admin_notes?' · Admin note: '+esc(r.admin_notes):''}</small><div style="margin-top:10px"><button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="In Progress">In Progress</button> <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="Awaiting Information">Awaiting Info</button> <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="Resolved">Resolved</button> <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="Closed">Closed</button></div></div>`).join(''):'<p style="color:#6b7883">No help requests yet.</p>';
 list.querySelectorAll('.statusBtn').forEach(b=>b.addEventListener('click',async()=>{
   const {error}=await supabaseClient.from('help_requests').update({status:b.dataset.status}).eq('id',b.dataset.id);
   if(error){alert('Unable to update request: '+error.message);return;}
   renderAdmin();
 }));
}

async function initAdmin(){
 if(!document.querySelector('#adminList')||!supabaseClient)return;
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(!session){
   document.querySelector('#adminList').innerHTML='<div class="notice"><b>Admin login required.</b><br>Please sign in to the Supabase account before viewing requests.</div>';
   document.querySelector('#statNew')&&(document.querySelector('#statNew').textContent='—');
   document.querySelector('#statActive')&&(document.querySelector('#statActive').textContent='—');
   document.querySelector('#statDone')&&(document.querySelector('#statDone').textContent='—');
   document.querySelector('#statTotal')&&(document.querySelector('#statTotal').textContent='—');
   return;
 }
 renderAdmin();
}
initAdmin();

document.querySelector('#clearDemo')?.addEventListener('click',async()=>{alert('Demo data clearing is disabled because Help Desk requests are now stored securely in Supabase.');});
