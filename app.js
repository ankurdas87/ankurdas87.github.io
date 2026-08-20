document.querySelector('.menu-btn')?.addEventListener('click',()=>{const n=document.querySelector('.navlinks');n.style.display=n.style.display==='flex'?'none':'flex';n.style.position='absolute';n.style.right='14px';n.style.top='70px';n.style.flexDirection='column';n.style.padding='16px';n.style.background='#fff';n.style.border='1px solid #e5e8ec';n.style.borderRadius='16px';n.style.boxShadow='0 20px 50px rgba(0,0,0,.12)'});
const SUPABASE_URL='https://eehwantbgoslbhymoirz.supabase.co';
const SUPABASE_KEY='sb_publishable_HuGhh5or8zAABenkpiAXvw_mrUD8LBl';
const supabaseClient=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY);
const ADMIN_UID='4b35248f-fa11-4b0a-8fbd-7e1567c8915b';
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const params=new URLSearchParams(location.search);const cat=params.get('category');const categoryEl=document.querySelector('#category');if(categoryEl&&cat)categoryEl.value=cat;
function showResult(selector,html,error=false){const r=document.querySelector(selector);if(!r)return;r.hidden=false;r.innerHTML=html;if(error)r.style.borderColor='#d9534f';}

document.querySelector('#helpForm')?.addEventListener('submit',async e=>{
  e.preventDefault();

  if(!supabaseClient){
    showResult('#formResult','Supabase could not be loaded. Please refresh and try again.',true);
    return;
  }

  const f=new FormData(e.target);
  const file=f.get('file');

  const args={
    p_student_name:String(f.get('name')||'').trim(),
    p_email:String(f.get('email')||'').trim(),
    p_whatsapp:String(f.get('whatsapp')||'').trim(),
    p_category:String(f.get('category')||'').trim(),
    p_subject:String(f.get('subject')||'').trim(),
    p_description:String(f.get('message')||'').trim(),
    p_priority:String(f.get('priority')||'normal').trim().toLowerCase()
  };

  showResult('#formResult','Submitting your request...');

  const {data,error}=await supabaseClient.rpc('submit_help_request',args);

  if(error){
    console.error(error);
    showResult('#formResult','<b>Unable to submit the request.</b><br>'+esc(error.message),true);
    return;
  }

  const id=Array.isArray(data)?data[0]:data;

  if(!id){
    showResult('#formResult','<b>Request submitted, but the Request ID could not be retrieved.</b>',true);
    return;
  }

  if(file instanceof File && file.size>0){

    const allowedTypes=['application/pdf','image/jpeg','image/png'];

    if(!allowedTypes.includes(file.type)){
      showResult('#formResult','<b>Request submitted, but the attachment type is not supported.</b><br>Please use PDF, JPG, JPEG or PNG.',true);
      return;
    }

    const maxSize=10*1024*1024;

    if(file.size>maxSize){
      showResult('#formResult','<b>Request submitted, but the attachment is too large.</b><br>Maximum file size is 10 MB.',true);
      return;
    }

    const safeName=file.name
      .replace(/[^a-zA-Z0-9._-]/g,'_')
      .replace(/_+/g,'_');

    const filePath=`${id}/${Date.now()}_${safeName}`;

    const {error:uploadError}=await supabaseClient
      .storage
      .from('helpdesk-attachments')
      .upload(filePath,file,{
        contentType:file.type,
        upsert:false
      });

    if(uploadError){
      console.error(uploadError);
      showResult(
        '#formResult',
        '<b>Request submitted, but the attachment could not be uploaded.</b><br>'+
        esc(uploadError.message)+
        '<br><small>Your Request ID is <strong>'+esc(id)+'</strong>.</small>',
        true
      );
      return;
    }

    const {data:attachResult,error:updateError}=await supabaseClient
  .rpc('attach_help_request_file',{
    p_request_id:id,
    p_attachment_path:filePath,
    p_attachment_name:file.name
  });

    if(updateError){
      console.error(updateError);
      showResult(
        '#formResult',
        '<b>Request submitted and file uploaded, but the attachment information could not be linked to the request.</b><br>'+
        esc(updateError.message)+
        '<br><small>Your Request ID is <strong>'+esc(id)+'</strong>.</small>',
        true
      );
      return;
    }
    if(!attachResult){
  showResult(
    '#formResult',
    '<b>Request submitted and file uploaded, but the attachment could not be linked to this Request ID.</b><br>'+
    '<small>Your Request ID is <strong>'+esc(id)+'</strong>.</small>',
    true
  );
  return;
}
  }

  showResult(
    '#formResult',
    '<b>Request submitted successfully.</b><br>'+
    'Your Request ID is <strong>'+esc(id)+'</strong>.<br>'+
    'Keep this ID to check the status.'
  );

  e.target.reset();
});

document.querySelector('#trackForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!supabaseClient){showResult('#trackResult','Supabase could not be loaded. Please refresh and try again.',true);return;}const id=String(new FormData(e.target).get('requestId')||'').trim().toUpperCase();const {data,error}=await supabaseClient.rpc('track_help_request',{p_request_id:id});if(error){console.error(error);showResult('#trackResult','<b>Unable to check this request.</b><br>'+esc(error.message),true);return;}const req=Array.isArray(data)?data[0]:data;if(!req){showResult('#trackResult','No request was found for <strong>'+esc(id)+'</strong>.');return;}showResult('#trackResult','<b>'+esc(req.request_id)+'</b><br>Category: '+esc(req.category)+'<br>Subject: '+esc(req.subject)+'<br>Priority: <strong>'+esc(req.priority)+'</strong><br>Status: <strong>'+esc(req.status)+'</strong><br>Submitted: '+new Date(req.created_at).toLocaleString()+(req.updated_at?' <br>Last updated: '+new Date(req.updated_at).toLocaleString():'') );});

async function renderAdmin(){
  const list=document.querySelector('#adminList');
  if(!list||!supabaseClient)return;

  const {data,error}=await supabaseClient
    .from('help_requests')
    .select('id,request_id,student_name,email,whatsapp,category,subject,description,priority,status,admin_notes,attachment_path,attachment_name,created_at,updated_at')
    .order('created_at',{ascending:false});

  if(error){
    showResult('#adminList','<b>Unable to load requests.</b><br>'+esc(error.message),true);
    return;
  }

  const rs=data||[];

  const by=s=>rs.filter(r=>r.status===s).length;

  document.querySelector('#statNew')&&(document.querySelector('#statNew').textContent=by('new'));
  document.querySelector('#statActive')&&(document.querySelector('#statActive').textContent=by('in_review')+by('waiting_for_student'));
  document.querySelector('#statDone')&&(document.querySelector('#statDone').textContent=by('resolved')+by('closed'));
  document.querySelector('#statTotal')&&(document.querySelector('#statTotal').textContent=rs.length);

  list.innerHTML=rs.length?rs.map(r=>`
    <div class="feature admin-request-card" data-request-id="${esc(r.id)}" style="margin:10px 0;padding:18px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <b>${esc(r.request_id)}</b> · ${esc(r.category)} · <strong>${esc(r.status)}</strong>
        </div>
        <span style="font-size:12px;color:#66737e">Click to view details →</span>
      </div>

      <p style="margin:6px 0;color:#66737e">
        <b>${esc(r.student_name)}</b> — ${esc(r.subject||'No subject')}<br>
        ${esc(r.description)}
      </p>

      <small>
        ${new Date(r.created_at).toLocaleString()} ·
        Priority: ${esc(r.priority)}
        ${r.attachment_name?' · 📎 Attachment: '+esc(r.attachment_name):''}
        ${r.admin_notes?' · Admin note: '+esc(r.admin_notes):''}
      </small>

      <div style="margin-top:10px">
        <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="in_review" type="button">In Review</button>
        <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="waiting_for_student" type="button">Waiting for Student</button>
        <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="resolved" type="button">Resolved</button>
        <button class="btn ghost statusBtn" data-id="${esc(r.id)}" data-status="closed" type="button">Closed</button>
      </div>
    </div>
  `).join(''):'<p style="color:#6b7883">No help requests yet.</p>';

  /* Request details modal */
  const openRequest=async r=>{

    let attachmentHtml='<p style="color:#66737e">No attachment was submitted.</p>';

    if(r.attachment_path){

      attachmentHtml=`
        <div style="padding:16px;border:1px solid #e5e8ec;border-radius:14px;background:#fafbfc">
          <strong>📎 ${esc(r.attachment_name||'Attached file')}</strong>
          <div style="margin-top:10px">
            <button class="btn primary" id="viewAttachmentBtn" type="button">View Attachment →</button>
          </div>
        </div>
      `;
    }

    const overlay=document.createElement('div');

    overlay.id='requestDetailsModal';

    overlay.style.cssText=`
      position:fixed;
      inset:0;
      z-index:9999;
      background:rgba(15,23,42,.62);
      padding:24px;
      overflow:auto;
      display:flex;
      align-items:center;
      justify-content:center;
    `;

    overlay.innerHTML=`
      <div style="
        width:min(760px,100%);
        max-height:90vh;
        overflow:auto;
        background:#fff;
        border-radius:22px;
        padding:28px;
        box-shadow:0 30px 80px rgba(0,0,0,.25);
      ">

        <div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start">
          <div>
            <p class="kicker" style="margin-bottom:6px">REQUEST DETAILS</p>
            <h2 style="margin:0">${esc(r.request_id)}</h2>
          </div>

          <button id="closeRequestModal" type="button" class="btn ghost">Close</button>
        </div>

        <div style="margin-top:24px;display:grid;gap:16px">

          <div>
            <strong>Student</strong>
            <p style="margin:5px 0">${esc(r.student_name)}</p>
          </div>

          <div>
            <strong>Email</strong>
            <p style="margin:5px 0">${esc(r.email)}</p>
          </div>

          <div>
            <strong>WhatsApp</strong>
            <p style="margin:5px 0">${esc(r.whatsapp)}</p>
          </div>

          <div>
            <strong>Category</strong>
            <p style="margin:5px 0">${esc(r.category)}</p>
          </div>

          <div>
            <strong>Subject</strong>
            <p style="margin:5px 0">${esc(r.subject||'No subject')}</p>
          </div>

          <div>
            <strong>Priority</strong>
            <p style="margin:5px 0">${esc(r.priority)}</p>
          </div>

          <div>
            <strong>Status</strong>
            <p style="margin:5px 0">${esc(r.status)}</p>
          </div>

          <div>
            <strong>Submitted</strong>
            <p style="margin:5px 0">${new Date(r.created_at).toLocaleString()}</p>
          </div>

          <div>
            <strong>Last updated</strong>
            <p style="margin:5px 0">${r.updated_at?new Date(r.updated_at).toLocaleString():'—'}</p>
          </div>

          <div>
            <strong>Student's query</strong>
            <div style="
              margin-top:7px;
              padding:16px;
              background:#f7f8fa;
              border-radius:14px;
              white-space:pre-wrap;
              line-height:1.6;
            ">${esc(r.description)}</div>
          </div>

          <div>
            <strong>Attachment</strong>
            <div style="margin-top:7px">
              ${attachmentHtml}
            </div>
          </div>

          ${r.admin_notes?`
            <div>
              <strong>Admin notes</strong>
              <div style="
                margin-top:7px;
                padding:16px;
                background:#f7f8fa;
                border-radius:14px;
                white-space:pre-wrap;
              ">${esc(r.admin_notes)}</div>
            </div>
          `:''}

        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#closeRequestModal')?.addEventListener('click',()=>{
      overlay.remove();
    });

    overlay.addEventListener('click',e=>{
      if(e.target===overlay)overlay.remove();
    });

    overlay.querySelector('#viewAttachmentBtn')?.addEventListener('click',async()=>{
      const btn=overlay.querySelector('#viewAttachmentBtn');

      btn.disabled=true;
      btn.textContent='Opening attachment...';

      const {data:signed,error:signedError}=await supabaseClient
        .storage
        .from('helpdesk-attachments')
        .createSignedUrl(r.attachment_path,300);

      if(signedError){
        console.error(signedError);
        alert('Unable to open the attachment: '+signedError.message);
        btn.disabled=false;
        btn.textContent='View Attachment →';
        return;
      }

      if(signed?.signedUrl){
        window.open(signed.signedUrl,'_blank','noopener,noreferrer');
      }

      btn.disabled=false;
      btn.textContent='View Attachment →';
    });
  };

  /* Open request when the card itself is clicked */
  list.querySelectorAll('.admin-request-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const request=rs.find(r=>r.id===card.dataset.requestId);
      if(request)openRequest(request);
    });
  });

  /* Status buttons */
  list.querySelectorAll('.statusBtn').forEach(b=>{
    b.addEventListener('click',async e=>{
      e.stopPropagation();

      const {error}=await supabaseClient
        .from('help_requests')
        .update({status:b.dataset.status})
        .eq('id',b.dataset.id);

      if(error){
        alert('Unable to update request: '+error.message);
        return;
      }

      renderAdmin();
    });
  });
}

async function initAdmin(){const login=document.querySelector('#adminLogin');const panel=document.querySelector('#adminPanel');if(!login&&!panel)return;if(!supabaseClient)return;const {data:{session}}=await supabaseClient.auth.getSession();const apply=async s=>{const allowed=!!s&&s.user?.id===ADMIN_UID;if(login)login.hidden=allowed;if(panel)panel.hidden=!allowed;if(allowed)await renderAdmin();};await apply(session);document.querySelector('#adminLoginForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const {data,error}=await supabaseClient.auth.signInWithPassword({email:String(f.get('email')).trim(),password:String(f.get('password'))});if(error){showResult('#loginResult','<b>Sign in failed.</b><br>'+esc(error.message),true);return;}if(data.user?.id!==ADMIN_UID){await supabaseClient.auth.signOut();showResult('#loginResult','This account is not authorized for the admin dashboard.',true);return;}showResult('#loginResult','Signed in successfully.');await apply(data.session);});document.querySelector('#adminLogout')?.addEventListener('click',async()=>{await supabaseClient.auth.signOut();location.reload();});}
initAdmin();
