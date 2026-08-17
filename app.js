document.querySelector('.menu-btn')?.addEventListener('click',()=>{const n=document.querySelector('.navlinks');n.style.display=n.style.display==='flex'?'none':'flex';n.style.position='absolute';n.style.right='14px';n.style.top='70px';n.style.flexDirection='column';n.style.padding='16px';n.style.background='#fff';n.style.border='1px solid #e5e8ec';n.style.borderRadius='16px';n.style.boxShadow='0 20px 50px rgba(0,0,0,.12)'});

const storeKey='ankurHelpdeskRequests';
const getRequests=()=>JSON.parse(localStorage.getItem(storeKey)||'[]');
const setRequests=r=>localStorage.setItem(storeKey,JSON.stringify(r));

const params=new URLSearchParams(location.search);
const cat=params.get('category');
const categoryEl=document.querySelector('#category');
if(categoryEl && cat) categoryEl.value=cat;

document.querySelector('#helpForm')?.addEventListener('submit',e=>{
 e.preventDefault();
 const f=new FormData(e.target);
 const requests=getRequests();
 const id='BLC-'+new Date().getFullYear()+'-'+String(requests.length+1).padStart(4,'0');
 const req={id,name:f.get('name'),studentId:f.get('id'),category:f.get('category'),email:f.get('email'),whatsapp:f.get('whatsapp'),message:f.get('message'),file:f.get('file')?.name||'',status:'Received',created:new Date().toISOString(),history:[{at:new Date().toISOString(),status:'Received',note:'Request submitted.'}]};
 requests.unshift(req); setRequests(requests);
 const r=document.querySelector('#formResult'); r.hidden=false; r.innerHTML='<b>Request submitted successfully.</b><br>Your Request ID is <strong>'+id+'</strong>.<br>Keep this ID to check the status.';
 e.target.reset();
});

document.querySelector('#trackForm')?.addEventListener('submit',e=>{
 e.preventDefault(); const id=new FormData(e.target).get('requestId').trim().toUpperCase(); const req=getRequests().find(x=>x.id===id); const r=document.querySelector('#trackResult'); r.hidden=false;
 r.innerHTML=req?('<b>'+req.id+'</b><br>Category: '+req.category+'<br>Status: <strong>'+req.status+'</strong><br>Submitted: '+new Date(req.created).toLocaleString()):'No request found in this browser demo. In the production version, request IDs will be checked against the secure server.';
});

function renderAdmin(){
 const rs=getRequests();
 const by=s=>rs.filter(r=>r.status===s).length;
 document.querySelector('#statNew')&&(document.querySelector('#statNew').textContent=by('Received')+by('New'));
 document.querySelector('#statActive')&&(document.querySelector('#statActive').textContent=by('In Progress')+by('Awaiting Information'));
 document.querySelector('#statDone')&&(document.querySelector('#statDone').textContent=by('Resolved')+by('Closed'));
 document.querySelector('#statTotal')&&(document.querySelector('#statTotal').textContent=rs.length);
 const list=document.querySelector('#adminList'); if(!list)return;
 list.innerHTML=rs.length?rs.map(r=>`<div class="feature" style="margin:10px 0;padding:18px"><b>${r.id}</b> · ${r.category} · <strong>${r.status}</strong><p style="margin:6px 0;color:#66737e">${r.name} — ${r.message}</p><small>${new Date(r.created).toLocaleString()} ${r.file?' · Attachment: '+r.file:''}</small><div style="margin-top:10px"><button class="btn ghost statusBtn" data-id="${r.id}" data-status="In Progress">In Progress</button> <button class="btn ghost statusBtn" data-id="${r.id}" data-status="Resolved">Resolved</button></div></div>`).join(''):'<p style="color:#6b7883">No requests yet. Submit one from the Digital Help Desk to see the prototype workflow.';
 list.querySelectorAll('.statusBtn').forEach(b=>b.addEventListener('click',()=>{const rs=getRequests();const r=rs.find(x=>x.id===b.dataset.id);if(r){r.status=b.dataset.status;r.history.push({at:new Date().toISOString(),status:r.status,note:'Status updated from demo dashboard.'});setRequests(rs);renderAdmin();}}));
}
renderAdmin();
document.querySelector('#clearDemo')?.addEventListener('click',()=>{if(confirm('Clear all demo requests from this browser?')){localStorage.removeItem(storeKey);renderAdmin();}});
