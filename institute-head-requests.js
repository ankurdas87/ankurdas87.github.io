(() => {
 'use strict';
 const $ = s => document.querySelector(s);
 const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const client = () => typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
 const date = v => v ? new Date(v).toLocaleString('en-IN') : '—';
 const label = s => ({submitted:'Pending',approved:'Approved',accepted:'Accepted',rejected:'Rejected',returned:'Returned'}[s] || s);
 const name = p => [p?.first_name,p?.last_name].filter(Boolean).join(' ') || p?.username || 'Staff Member';
 const principalName = p => {
  const profileName = String(p?.full_name || p?.display_name || p?.name || [p?.first_name,p?.last_name].filter(Boolean).join(' ') || '').trim();
  if (p?.username === 'BLC@Principal' && (!profileName || /^principal$/i.test(profileName))) return 'Dr. Pratap Chandra Dash';
  return profileName || 'Signer name unavailable';
 };
 const recordedSignerName = (saved, profile) => {
  const recorded = String(saved || '').trim();
  return recorded && !/^(principal|blc@principal)$/i.test(recorded) ? recorded : principalName(profile);
 };
 const principalFallback = {first_name:'Dr. Pratap',last_name:'Chandra Dash',username:'BLC@Principal',designation:'Principal-cum-Secretary'};
 const signatureDate = v => {
  if (!v) return 'Date and time added on signing';
  const signedAt = new Date(v);
  if (Number.isNaN(signedAt.getTime())) return 'Signing time unavailable';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-IN', {
   timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',
   hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true
  }).formatToParts(signedAt).map(({type,value})=>[type,value]));
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod.toUpperCase()}`;
 };
 function eSignSeal(person, when, extra='') {
  const who = principalName(person), designation = String(person?.designation || 'Principal-cum-Secretary').trim();
  return `<div class="hr-esign-seal ${extra}" role="img" aria-label="Portal e-signature for ${esc(who)}, ${esc(designation)}, ${esc(signatureDate(when))}">
   <div class="hr-seal-label"><svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><rect x="1" y="1" width="16" height="16" rx="2"/><path d="m4 9 3 3 7-7"/></svg><span>Digitally Signed</span></div>
   <div class="hr-seal-body"><svg class="hr-seal-watermark" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M 22 36 L 76 84 L 278 10"/></svg><strong>${esc(who)}</strong><span>${esc(designation)}</span><time>${esc(signatureDate(when))}</time></div>
   </div>`;
 }
 let records = [], notifications = [], selected = null, busy = false, loading = false, detailToken = 0, esignApplied = false, signatureBusy = false;
 const requestRoot = $('.ih-view[data-view="requests"]');
 const notificationRoot = $('.ih-view[data-view="notifications"]');
 if (!requestRoot || !notificationRoot) return;
 requestRoot.classList.remove('ref-placeholder');
 notificationRoot.classList.remove('ref-placeholder');
 requestRoot.innerHTML = `<div class="hr-workspace"><header class="hr-heading"><div><small>OFFICE OF THE PRINCIPAL-CUM-SECRETARY</small><h1>Requests & Applications</h1><p>Review staff submissions and record your official decision.</p></div><button type="button" data-hr-refresh>Refresh</button></header>
 <div class="hr-stats" id="hrStats"></div><div class="hr-tools"><input id="hrSearch" aria-label="Search requests" placeholder="Search title, staff, username or Application No."><select id="hrStatus" aria-label="Filter by status"><option value="all">All requests</option><option value="submitted">Pending</option><option value="approved">Approved</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="returned">Returned</option></select><select id="hrType" aria-label="Filter by type"><option value="all">All types</option><option value="application">Applications</option><option value="notice">Notices</option><option value="document">Documents</option></select></div><p id="hrError" class="hr-error" role="alert" hidden></p><div id="hrList" class="hr-list"><div class="hr-empty">Open this section to load submitted requests.</div></div></div>`;
 notificationRoot.innerHTML = `<div class="hr-workspace"><header class="hr-heading"><div><small>EXECUTIVE OFFICE</small><h1>Notifications</h1><p>New staff submissions addressed to BLC@Principal.</p></div><button type="button" id="hrReadAll">Mark all as read</button></header><div class="hr-tools"><select id="hrNotificationFilter" aria-label="Filter notifications"><option value="all">All notifications</option><option value="unread">Unread</option></select><button type="button" data-hr-refresh>Refresh</button></div><p class="hr-error" id="hrNotificationError" role="alert" hidden></p><div class="hr-list" id="hrNotifications"></div></div>`;
 const overlay = document.createElement('div');
 overlay.id = 'hrModal'; overlay.className = 'hr-overlay'; overlay.hidden = true;
 overlay.innerHTML = '<section class="hr-modal" role="dialog" aria-modal="true" aria-labelledby="hrModalTitle"><header class="hr-modal-top"><span>BARPETA LAW COLLEGE · OFFICIAL REQUEST</span><button type="button" id="hrClose" aria-label="Close request">×</button></header><div id="hrDetail"></div></section>';
 document.body.appendChild(overlay);
 const esignOverlay = document.createElement('div');
 esignOverlay.id = 'hrEsignAuth'; esignOverlay.className = 'hr-overlay'; esignOverlay.hidden = true;
 document.body.appendChild(esignOverlay);
 let previousFocus;
 function close() { if (busy || signatureBusy) return; detailToken++; overlay.hidden = true; overlay.inert = false; esignOverlay.hidden = true; selected = null; previousFocus?.focus(); }
 function closeEsign() { if (busy || signatureBusy) return; overlay.inert = false; esignOverlay.hidden = true; $('#hrApplyEsign')?.focus(); }
 function openEsign() {
  const head = selected?.head || principalFallback;
  esignOverlay.innerHTML = `<section class="hr-esign-modal" role="dialog" aria-modal="true" aria-labelledby="hrEsignTitle">
   <header class="hr-esign-modal-head"><div><small>BARPETA LAW COLLEGE · PORTAL E-SIGNATURE</small><h2 id="hrEsignTitle">Verify before signing</h2></div><button type="button" id="hrEsignClose" aria-label="Close e-signature verification">×</button></header>
   <div class="hr-esign-modal-body"><div class="hr-esign-visual"><span class="hr-esign-step">SIGNATURE</span>${eSignSeal(head,null,'hr-esign-seal-preview')}</div>
   <div class="hr-esign-steps"><div class="hr-auth-step is-active"><span>01</span><div><b>Registered portal email</b><small>Send a fresh code to the email used by your Institute Head account.</small><p id="hrSignatureEmail" class="hr-auth-email">Checking signed-in account…</p><button type="button" id="hrSendEsignOtp">Send email code</button></div></div><div class="hr-auth-step"><span>02</span><div><b>Verify the email code</b><small>Enter the 6-digit code within 10 minutes, then record your decision.</small><label for="hrEsignOtp">6-DIGIT EMAIL CODE</label><input id="hrEsignOtp" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" maxlength="6" placeholder="000000" disabled><button type="button" id="hrVerifyEsignOtp" disabled>Verify code</button><p id="hrEsignMessage" class="hr-auth-note" role="status" aria-live="polite"></p></div></div></div></div>
   <footer class="hr-esign-modal-foot"><span>Verification uses your registered portal email.</span><button type="button" id="hrEsignCloseBottom">Close</button></footer>
  </section>`;
  overlay.inert = true; esignOverlay.hidden = false; $('#hrEsignClose')?.focus();
  $('#hrEsignClose')?.addEventListener('click',closeEsign); $('#hrEsignCloseBottom')?.addEventListener('click',closeEsign);
  let challengeId = null, expectedUserId = null, registeredEmail = null;
  const status = (message, isError=false) => {const box=$('#hrEsignMessage');if(box){box.textContent=message;box.classList.toggle('bad',isError)}};
  client().auth.getUser().then(({data:{user},error})=>{
   if (esignOverlay.hidden) return;
   if (error || !user?.email) {status('Your registered portal email is unavailable. Sign in again.',true);$('#hrSendEsignOtp').disabled=true;return;}
   expectedUserId=user.id;registeredEmail=user.email;
   const [local,domain]=registeredEmail.split('@');
   $('#hrSignatureEmail').textContent=local.slice(0,2)+'•••@'+domain;
  }).catch(()=>status('Unable to check your signed-in account.',true));
  $('#hrSendEsignOtp').addEventListener('click',async()=>{
   if(signatureBusy||!selected||!registeredEmail)return;
   esignApplied=false;
   if($('#hrEsignState'))$('#hrEsignState').textContent='Not verified';
   $('#hrEsignPanel')?.classList.remove('hr-esign-applied');
   signatureBusy=true;$('#hrSendEsignOtp').disabled=true;status('Sending your email code…');
   try{
    challengeId=await rpc('begin_institute_head_signature',{p_request_id:selected.request.id});
    const {error}=await client().auth.signInWithOtp({email:registeredEmail,options:{shouldCreateUser:false}});
    if(error)throw error;
    $('#hrEsignOtp').disabled=false;$('#hrVerifyEsignOtp').disabled=false;$('#hrEsignOtp').focus();
    status('Code sent to your registered email. It expires in 10 minutes.');
   }catch(err){challengeId=null;status('Code could not be sent: '+err.message,true)}
   finally{signatureBusy=false;$('#hrSendEsignOtp').disabled=false}
  });
  $('#hrVerifyEsignOtp').addEventListener('click',async()=>{
   if(signatureBusy||!challengeId||!registeredEmail||!selected)return;
   const token=$('#hrEsignOtp').value.trim();
   if(!/^\d{6}$/.test(token)){status('Enter the full 6-digit email code.',true);return;}
   signatureBusy=true;$('#hrVerifyEsignOtp').disabled=true;status('Verifying your code…');
   try{
    const {data,error}=await client().auth.verifyOtp({email:registeredEmail,token,type:'email'});
    if(error || !data?.session || data.user?.id!==expectedUserId)throw error||new Error('Verification did not match your signed-in account.');
    await rpc('confirm_institute_head_signature',{p_challenge_id:challengeId});
    esignApplied=true;
    $('#hrEsignState').textContent='Portal email verified';
    $('#hrEsignPanel').classList.remove('hr-esign-required');
    $('#hrEsignPanel').classList.add('hr-esign-applied');
    $('#hrEsignError').hidden=true;
    status('Email verification completed. You may now record your decision.');
    signatureBusy=false;closeEsign();return;
   }catch(err){status(err.message||'The code was invalid or expired.',true)}
   finally{signatureBusy=false;$('#hrVerifyEsignOtp').disabled=false}
  });
 }
 function error(message) { for (const id of ['#hrError','#hrNotificationError']) { $(id).textContent = message; $(id).hidden = !message; } }
 async function rpc(fn,args) { const c=client(); if(!c) throw new Error('Secure session unavailable.'); const r=await c.rpc(fn,args);if(r.error)throw r.error;return r.data; }
 function badge() {
  const count=notifications.filter(n=>!n.is_read).length;
  document.querySelectorAll('[data-ih-view="notifications"]').forEach(b=>{
   let e=b.querySelector('.hr-badge');if(!count){e?.remove();return}
   if(!e){e=document.createElement('span');e.className='hr-badge';b.appendChild(e)}e.textContent=count>99?'99+':count;
  });
 }
 function render() {
  $('#hrStats').innerHTML = [['Total',records.length],['Pending',records.filter(r=>r.status==='submitted').length],['Approved / Accepted',records.filter(r=>['approved','accepted'].includes(r.status)).length],['Rejected',records.filter(r=>r.status==='rejected').length]].map(([k,v])=>`<article><small>${k}</small><strong>${v}</strong></article>`).join('');
  const q=$('#hrSearch').value.trim().toLowerCase(),status=$('#hrStatus').value,type=$('#hrType').value;
  const rows=records.filter(r=>(status==='all'||r.status===status)&&(type==='all'||r.request_type===type)&&(!q||[r.title,r.request_details,name(r),r.username,r.application_number].join(' ').toLowerCase().includes(q)));
  $('#hrList').innerHTML=rows.length?rows.map(r=>`<article class="hr-card"><div class="hr-card-content"><div class="hr-meta"><span>${esc(r.request_type)}</span><em class="hr-status ${esc(r.status)}">${esc(label(r.status))}</em></div><h3>${esc(r.title)}</h3><p>${esc(name(r))} · ${esc(r.username)} · ${esc(r.designation)}</p><small>${esc(r.application_number||'')} · ${date(r.submitted_at)}</small></div><button type="button" data-hr-open="${esc(r.id)}">Review Request →</button></article>`).join(''):'<div class="hr-empty"><strong>No matching requests</strong><p>Submitted applications, notices and documents will appear here.</p></div>';
 }
 function renderNotifications() {
  const rows=notifications.filter(n=>$('#hrNotificationFilter').value!=='unread'||!n.is_read);
  $('#hrNotifications').innerHTML=rows.length?rows.map(n=>`<article class="hr-card ${n.is_read?'':'hr-unread'}"><div class="hr-card-content"><div class="hr-meta"><span>${n.is_read?'Read':'New submission'}</span><small>${date(n.created_at)}</small></div><h3>${esc(n.title)}</h3><p>${esc(n.message)}</p></div><button type="button" data-hr-open="${esc(n.request_id)}">Open Request →</button></article>`).join(''):'<div class="hr-empty">No notifications to show.</div>';badge();
 }
 async function refresh() {
  if(loading||document.hidden||$('#ihPanel')?.hidden)return;
  const c=client();if(!c)return;loading=true;
  try {
   const {data:{user},error:authError}=await c.auth.getUser();if(authError)throw authError;if(!user)return;
   const [rows,ns]=await Promise.all([rpc('get_institute_head_requests'),c.from('institute_head_request_notifications').select('*').eq('head_id',user.id).order('created_at',{ascending:false})]);
   if(ns.error)throw ns.error;records=rows||[];notifications=ns.data||[];error('');render();renderNotifications();
  } catch(e) { error('Requests could not be loaded. '+(e.message||'Please try Refresh.')); }
  finally{loading=false}
 }
 async function open(id) {
  const token=++detailToken;previousFocus=overlay.hidden?document.activeElement:previousFocus;
  selected=null;overlay.hidden=false;$('#hrDetail').innerHTML='<h2 id="hrModalTitle">Loading request…</h2>';$('#hrClose').focus();
  try {
   const data=await rpc('get_institute_head_request',{p_request_id:id});if(token!==detailToken)return;
   selected=data;showDetail();
   await rpc('mark_institute_head_request_notifications_read',{p_request_id:id});
   notifications.filter(n=>n.request_id===id).forEach(n=>n.is_read=true);renderNotifications();
  }catch(e){if(token===detailToken){$('#hrDetail').innerHTML='<h2 id="hrModalTitle">Request unavailable</h2><p class="hr-error">'+esc(e.message)+'</p>';}}
 }
 function showDetail() {
  const {request:r,staff:p,application:a}=selected,head=selected.head||principalFallback;
  esignApplied=false;
  const principalRecorded=r.principal_esign_applied===true;
   const principalSignature=principalRecorded?`<section class="hr-principal-signature"><div class="hr-recorded-seal">${eSignSeal({full_name:recordedSignerName(r.principal_esign_name,head),designation:head.designation||'Principal-cum-Secretary'},r.principal_esign_at||r.decided_at)}</div><div class="hr-recorded-seal-meta"><small>E-SIGNATURE RECORD</small><strong>${esc(label(r.status))}</strong><span>${esc(signatureDate(r.principal_esign_at||r.decided_at))} · ${esc(head.designation||'Principal-cum-Secretary')}</span></div></section>`:'';
  $('#hrDetail').innerHTML=`<div class="hr-detail-heading"><div><small>${esc(r.request_type)}</small><h2 id="hrModalTitle">${esc(r.title)}</h2></div><em class="hr-status ${esc(r.status)}">${esc(label(r.status))}</em></div><div class="hr-detail-meta"><div><small>SUBMITTED BY</small><strong>${esc(name(p))}</strong><span>${esc(p.username)} · ${esc(p.designation)}</span></div><div><small>ADDRESSED TO</small><strong>BLC@Principal</strong><span>${date(r.submitted_at)}</span></div></div><section class="hr-purpose"><small>REQUEST DETAILS</small><p>${esc(r.request_details)}</p></section>
  ${a?'<div class="hr-attachment"><div><small>ATTACHED APPLICATION</small><strong>'+esc(a.application_number||'Application')+'</strong><span>'+esc(a.application_title)+'</span></div><button type="button" id="hrAttachment">Open Application ↗</button></div>':r.file_path?'<div class="hr-attachment"><div><small>SUPPORTING FILE</small><strong>'+esc(r.original_file_name||'Document')+'</strong></div><button type="button" id="hrAttachment">Open File ↗</button></div>':''}
   ${r.status==='submitted'?`<form id="hrDecisionForm" class="hr-decision"><small>INSTITUTE HEAD DECISION</small><div class="hr-esign-panel" id="hrEsignPanel"><div class="hr-esign-preview"><div class="hr-pending-seal">${eSignSeal(head,null,'hr-esign-seal-small')}</div><div><small>PRINCIPAL E-SIGNATURE</small><strong>${esc(principalName(head))}</strong><span>Fresh portal email code required</span></div><em id="hrEsignState">Not verified</em></div><button type="button" class="hr-esign-action" id="hrApplyEsign">Verify portal email to sign</button><p id="hrEsignError" class="hr-error" role="alert" hidden></p></div><label for="hrDecision">Decision</label><select id="hrDecision" required><option value="">Select decision</option><option value="approved">Approved — permission granted</option><option value="accepted">Accepted — submission accepted</option><option value="rejected">Rejected — submission declined</option></select><label for="hrRemark">Official remark <span>(required for rejection)</span></label><textarea id="hrRemark" maxlength="2000" rows="3" placeholder="Add your remarks for the staff member"></textarea><p id="hrDecisionError" class="hr-error" role="alert"></p><button type="submit" class="hr-primary" id="hrDecisionSubmit">Record Decision & Notify Staff</button></form>`:`<section class="hr-decision"><small>RECORDED DECISION</small><h3>${esc(label(r.status))}</h3><p>${esc(r.decision_remark||'No remark recorded.')}</p><small>${date(r.decided_at)} · ${esc(head.designation||'Principal-cum-Secretary')}</small>${principalSignature}</section>`}`;
  $('#hrAttachment')?.addEventListener('click',attachment);
  $('#hrDecisionForm')?.addEventListener('submit',decide);
  $('#hrApplyEsign')?.addEventListener('click',openEsign);
  $('#hrDecision')?.addEventListener('change',()=>$('#hrRemark').required=$('#hrDecision').value==='rejected');
 }
 async function attachment() {
  const {request:r,staff:p,application:a}=selected;
  if(a?.application_mode==='written'){
   let x;try{x=JSON.parse(a.application_content||'{}')}catch{x={body:a.application_content||''}}
   const head=selected.head||principalFallback;
   const principalRecorded=r.principal_esign_applied===true;
   const principalSignature=principalRecorded?`<div class="hr-letter-principal-sign"><div class="hr-letter-principal-seal">${eSignSeal({first_name:recordedSignerName(r.principal_esign_name,head),designation:head.designation||'Principal-cum-Secretary'},r.principal_esign_at||r.decided_at,'hr-esign-seal-letter')}<span class="hr-letter-decision-stamp">${esc(label(r.status))} · ${date(r.principal_esign_at||r.decided_at)}</span></div></div>`:'';
   $('#hrDetail').innerHTML=`<button type="button" id="hrBack">← Back to Request</button><article class="hr-letter"><small>${esc(a.application_number)}</small><h2 id="hrModalTitle">${esc(a.application_title)}</h2><p class="hr-letter-date">Date: ${esc(x.date||'—')}</p><p>To,<br><b>The Principal-cum-Secretary</b><br>Barpeta Law College<br>Barpeta, Assam</p><p><b>Subject:</b> ${esc(x.subject||a.application_title)}</p><p>Respected Sir,</p><div class="hr-letter-body">${esc(x.body||'')}</div><div class="hr-letter-signature-row">${principalSignature}<div class="hr-letter-staff-sign"><div class="hr-auto-sign">${esc(name(p))}</div><span>Yours faithfully,</span><strong>${esc(name(p))}</strong><em>${esc(p.designation||'Staff')}</em></div></div></article>`;$('#hrBack').onclick=showDetail;return;
  }
  const win=window.open('about:blank','_blank');if(win)win.opener=null;
  try{const path=a?.uploaded_file_path||r.file_path;if(!path)throw new Error('No file attached.');
   const {data,error}=await client().storage.from('staff-requests').createSignedUrl(path,300);if(error)throw error;
   if(!data?.signedUrl)throw new Error('File unavailable.');if(win)win.location.href=data.signedUrl;else throw new Error('Allow pop-ups, then open the file again.');
  }catch(e){win?.close();alert('Attachment could not be opened: '+e.message)}
 }
 async function decide(e) {
  e.preventDefault();if(busy||!selected)return;
  const id=selected.request.id,decision=$('#hrDecision').value,remark=$('#hrRemark').value.trim();
  if(!['approved','accepted','rejected'].includes(decision))return;
   if(!esignApplied){const box=$('#hrEsignError');if(box){box.textContent='Verify a fresh code from your registered portal email before recording a decision.';box.hidden=false}$('#hrEsignPanel')?.classList.add('hr-esign-required');$('#hrApplyEsign')?.focus();return}
  if(decision==='rejected'&&!remark){$('#hrDecisionError').textContent='Please give a reason for rejection.';return}
  if(!confirm('Record this request as '+label(decision)+' and notify the staff member? This decision will be final.'))return;
  busy=true;$('#hrDecisionSubmit').disabled=true;$('#hrClose').disabled=true;$('#hrDecisionError').textContent='';
  try{await rpc('decide_institute_head_request',{p_request_id:id,p_decision:decision,p_remark:remark||null,p_esign:true});selected=await rpc('get_institute_head_request',{p_request_id:id});showDetail();await refresh();}
   catch(err){if(/verify|code|expired/i.test(err.message||'')){esignApplied=false;if($('#hrEsignState'))$('#hrEsignState').textContent='Verification required';}if($('#hrDecisionError'))$('#hrDecisionError').textContent=err.message;else alert(err.message)}
  finally{busy=false;$('#hrClose').disabled=false;if($('#hrDecisionSubmit'))$('#hrDecisionSubmit').disabled=false}
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-hr-open]');if(b&&!busy)open(b.dataset.hrOpen);
  if(e.target.closest('[data-hr-refresh]'))refresh();
  if(e.target.closest('[data-ih-view="requests"],[data-ih-view="notifications"]'))refresh();
  if(e.target.id==='hrClose'||e.target===overlay)close();
  if(e.target.id==='hrEsignClose'||e.target.id==='hrEsignCloseBottom'||e.target===esignOverlay)closeEsign();
 });
 overlay.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();close()}
  if(e.key==='Tab'){const items=[...overlay.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
   const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 });
 esignOverlay.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeEsign()}
  if(e.key==='Tab'){
   const items=[...esignOverlay.querySelectorAll('button,input')].filter(x=>!x.disabled);
   const first=items[0],last=items.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 });
 $('#hrSearch').addEventListener('input',render);
 $('#hrStatus').addEventListener('change',render);$('#hrType').addEventListener('change',render);
 $('#hrNotificationFilter').addEventListener('change',renderNotifications);
 $('#hrReadAll').onclick=async()=>{try{await rpc('mark_institute_head_request_notifications_read');await refresh()}catch(e){error(e.message)}};
 const panel=$('#ihPanel');if(panel)new MutationObserver(()=>{if(!panel.hidden)refresh()}).observe(panel,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 setInterval(refresh,30000);refresh();
})();
