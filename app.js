document.querySelector('.menu-btn')?.addEventListener('click',()=>{const n=document.querySelector('.navlinks');n.style.display=n.style.display==='flex'?'none':'flex';n.style.position='absolute';n.style.right='14px';n.style.top='70px';n.style.flexDirection='column';n.style.padding='16px';n.style.background='#fff';n.style.border='1px solid #e5e8ec';n.style.borderRadius='16px';n.style.boxShadow='0 20px 50px rgba(0,0,0,.12)'});

const SUPABASE_URL='https://eehwantbgoslbhymoirz.supabase.co';
const SUPABASE_KEY='sb_publishable_HuGhh5or8zAABenkpiAXvw_mrUD8LBl';
const supabaseClient=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY);
const ADMIN_UID='4b35248f-fa11-4b0a-8fbd-7e1567c8915b';

const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const params=new URLSearchParams(location.search);
const cat=params.get('category');
const categoryEl=document.querySelector('#category');
if(categoryEl&&cat)categoryEl.value=cat;
function showResult(selector,html,error=false){const r=document.querySelector(selector);if(!r)return;r.hidden=false;r.innerHTML=html;if(error)r.style.borderColor='#d9534f';}

// Public Help Desk submission through the restricted database function.
document.querySelector('#helpForm')?.addEventListener('submit',async e=>{
 e.preventDefault();
 if(!supabaseClient){showResult('#formResult','Supabase could not be loaded. Please refresh and try again.',true);return;}
 const f=new FormData(e.target);
 const args={
  p_student_name:String(f.get('name')||'').trim(),
  p_email:String(f.get('email')||'').trim(),
  p_whatsapp:String(f.get('whatsapp')||'').trim(),
  p_category:String(f.get('category')||'').trim(),
  p_subject:String(f.get('subject')||'').trim(),
  p_description:String(f.get('message')||'').trim(),
  p_priority:String(f.get('priority')||'Normal').trim()
 };
 const {data,error}=await supabaseClient.rpc('submit_help_request',args);
 if(error){console.error(error);showResult('#formResult','<b>Unable to submit the request.</b><br>'+esc(error.message),true);return;}
 const id=Array.isArray(data)?data[0]:data;
 showResult('#formResult','<b>Request submitted successfully.</b><br>Your Request ID is <strong>'+esc(id||'Request ID unavailable')+'</strong>.<br>Keep this ID to check the status.');
 e.target.reset();
});

// Public tracking through the restricted database function.
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
 const list=document.querySelector('#adminList');if(!list||!supabaseClient)return;
 const {data,error}=await supabaseClient.from('help_requests').select('id,request_id,student_name,email,whatsapp,category,subject,description,priority,status,admin_notes,created_at,updated_at').order('created_at',{ascending:false});
 if(error){showResult('#adminList','<b>Unable to load requests.</b><br>'+esc(error.message),true);return;}
 const rs=data||[];const by=s=>rs.filter(r=>r.status===s).length;
 document.querySelector('#statNew')&&(document.querySelector('#statNew').textContent=by('Received')+by('New'));
 document.querySelector('#statActive')&&(document.querySelector('#statActive').textContent=by('In Progress')+by('Awaiting Information'));
 document.querySelector('#statDone')&&(document.querySelector('#statDone').textContent=by('Resolved')+by('Closed'));
 document.querySelector('#statTotal')&&(document.querySelector('#statTotal').textContent=rs.length);
 list.innerHTML=rs.length?rs.map(r=>`<div class="feature" style="margin:10px 0;padding:18px"><b>${esc(r.request_id)}</b> · ${esc(r.category)} · <strong>${esc(r.status)}</strong><p style="margin:6px 0;color:#66737e"><b>${esc(r.student_name)}</b> — ${esc(r.subject||'No subject')}<br>${esc(r.description)}</p><small>${new Date(r.created_at).toLocaleString()} · Priority: ${esc(r.priority)}${r.admin_notes?' · Admin note: '+esc(r.admin_notes):''}</small><div style="margin-top:10px"><button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="In Progress">In Progress</button> <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="Awaiting Information">Awaiting Info</button> <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="Resolved">Resolved</button> <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="Closed">Closed</button></div></div>`).join(''):'<p style="color:#6b7883">No help requests yet.</p>';
 list.querySelectorAll('.statusBtn').forEach(b=>b.addEventListener('click',async()=>{const {error}=await supabaseClient.from('help_requests').update({status:b.dataset.status}).eq('id',b.dataset.id);if(error){alert('Unable to update request: '+error.message);return;}renderAdmin();}));
}

async function initAdmin(){
 const login=document.querySelector('#adminLogin');const panel=document.querySelector('#adminPanel');if(!login&&!panel)return;
 if(!supabaseClient)return;
 const {data:{session}}=await supabaseClient.auth.getSession();
 const apply=async s=>{const allowed=!!s&&s.user?.id===ADMIN_UID;if(login)login.hidden=allowed;if(panel)panel.hidden=!allowed;if(allowed)await renderAdmin();};
 await apply(session);
 document.querySelector('#adminLoginForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {data,error}=await supabaseClient.auth.signInWithPassword({email:String(f.get('email')).trim(),password:String(f.get('password'))});if(error){showResult('#loginResult','<b>Sign in failed.</b><br>'+esc(error.message),true);return;}if(data.user?.id!==ADMIN_UID){await supabaseClient.auth.signOut();showResult('#loginResult','This account is not authorized for the admin dashboard.',true);return;}showResult('#loginResult','Signed in successfully.');await apply(data.session);});
 document.querySelector('#adminLogout')?.addEventListener('click',async()=>{await supabaseClient.auth.signOut();location.reload();});
}
initAdmin();
