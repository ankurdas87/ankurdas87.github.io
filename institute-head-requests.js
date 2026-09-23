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
 const signatureDate = v => v ? date(v) : 'Date/time added on signing';
 function eSignSeal(person, when, extra='') {
  const who = principalName(person), designation = person?.designation || 'Principal-cum-Secretary';
  const id = (extra || 'recorded').replace(/[^a-z0-9_-]/gi, '');
  return `<div class="hr-esign-seal ${extra}" role="img" aria-label="Verified e-signature for ${esc(who)}">
   <svg class="hr-seal-ring-text" viewBox="0 0 180 180" aria-hidden="true" focusable="false">
    <defs><path id="hr-seal-top-${id}" d="M 25,91 A 65,65 0 0,1 155,91"/><path id="hr-seal-bottom-${id}" d="M 25,91 A 65,65 0 0,0 155,91"/></defs>
    <text><textPath href="#hr-seal-top-${id}" startOffset="50%" text-anchor="middle">BARPETA LAW COLLEGE</textPath></text>
    <text><textPath href="#hr-seal-bottom-${id}" startOffset="50%" text-anchor="middle">VERIFIED E-SIGNATURE</textPath></text>
   </svg>
   <div class="hr-seal-core"><span class="hr-seal-tick" aria-hidden="true">✓</span><small>Digitally Signed by</small><strong>${esc(who)}</strong><span>${esc(designation)}</span><em>${esc(signatureDate(when))}</em></div>
  </div>`;
 }
 let records = [], notifications = [], selected = null, busy = false, loading = false, detailToken = 0, esignApplied = false;
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
 function close() { if (busy) return; detailToken++; overlay.hidden = true; overlay.inert = false; esignOverlay.hidden = true; selected = null; previousFocus?.focus(); }
 function closeEsign() { if (busy) return; overlay.inert = false; esignOverlay.hidden = true; $('#hrApplyEsign')?.focus(); }
 function openEsign() {
  const head = selected?.head || principalFallback;
  esignOverlay.innerHTML = `<section class="hr-esign-modal" role="dialog" aria-modal="true" aria-labelledby="hrEsignTitle">
   <header class="hr-esign-modal-head"><div><small>BARPETA LAW COLLEGE · OFFICIAL E-SIGNATURE</small><h2 id="hrEsignTitle">E-signature preview</h2></div><button type="button" id="hrEsignClose" aria-label="Close e-signature preview">×</button></header>
   <div class="hr-esign-modal-body"><div class="hr-esign-visual"><span class="hr-esign-step">SIGNATURE PREVIEW</span>${eSignSeal(head,null,'hr-esign-seal-preview')}<p>Preview of the portal signature seal. Confirming uses your signed-in portal account; it does not verify Aadhaar.</p></div>
   <div class="hr-esign-steps"><div class="hr-auth-step is-active"><span>01</span><div><b>Signer identity</b><small>Identity verification is not active in this design preview.</small><label for="hrAadhaarNumber">AADHAAR / UIDAI NUMBER</label><input id="hrAadhaarNumber" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="12-digit number — preview only" disabled><p class="hr-auth-note">Preview only. Do not enter personal identification numbers.</p></div></div><div class="hr-auth-step"><span>02</span><div><b>OTP verification</b><small>Portal email verification will be connected separately.</small><label for="hrEsignOtp">6-DIGIT OTP</label><input id="hrEsignOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" disabled><p class="hr-auth-note">No code is sent by this preview.</p></div></div><div class="hr-auth-success" hidden><span>✓</span><div><b>Signature preview ready. Authentication is not connected.</b><small>No identity verification has been performed in this preview.</small></div></div></div></div>
   <footer class="hr-esign-modal-foot"><span>Portal signature confirmation only. Aadhaar and OTP authentication are not connected.</span><button type="button" id="hrConfirmPortalSignature">Confirm portal signature</button><button type="button" id="hrEsignCloseBottom">Close Preview</button></footer>
  </section>`;
  overlay.inert = true; esignOverlay.hidden = false; $('#hrEsignClose')?.focus();
  $('#hrEsignClose')?.addEventListener('click',closeEsign); $('#hrEsignCloseBottom')?.addEventListener('click',closeEsign);
  $('#hrConfirmPortalSignature')?.addEventListener('click',()=>{
   esignApplied=true;
   $('#hrEsignState').textContent='Confirmed in portal';
   $('#hrEsignPanel').classList.remove('hr-esign-required');
   $('#hrEsignPanel').classList.add('hr-esign-applied');
   $('#hrEsignError').hidden=true;
   closeEsign();
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
  const principalSignature=principalRecorded?`<section class="hr-principal-signature"><div class="hr-recorded-seal">${eSignSeal({full_name:recordedSignerName(r.principal_esign_name,head),designation:head.designation||'Principal-cum-Secretary'},r.principal_esign_at||r.decided_at)}</div><div class="hr-recorded-seal-meta"><small>E-SIGNATURE RECORD</small><strong>${esc(label(r.status))}</strong><span>${date(r.principal_esign_at||r.decided_at)} · Principal-cum-Secretary</span></div></section>`:'';
  $('#hrDetail').innerHTML=`<div class="hr-detail-heading"><div><small>${esc(r.request_type)}</small><h2 id="hrModalTitle">${esc(r.title)}</h2></div><em class="hr-status ${esc(r.status)}">${esc(label(r.status))}</em></div><div class="hr-detail-meta"><div><small>SUBMITTED BY</small><strong>${esc(name(p))}</strong><span>${esc(p.username)} · ${esc(p.designation)}</span></div><div><small>ADDRESSED TO</small><strong>BLC@Principal</strong><span>${date(r.submitted_at)}</span></div></div><section class="hr-purpose"><small>REQUEST DETAILS</small><p>${esc(r.request_details)}</p></section>
  ${a?'<div class="hr-attachment"><div><small>ATTACHED APPLICATION</small><strong>'+esc(a.application_number||'Application')+'</strong><span>'+esc(a.application_title)+'</span></div><button type="button" id="hrAttachment">Open Application ↗</button></div>':r.file_path?'<div class="hr-attachment"><div><small>SUPPORTING FILE</small><strong>'+esc(r.original_file_name||'Document')+'</strong></div><button type="button" id="hrAttachment">Open File ↗</button></div>':''}
  ${r.status==='submitted'?`<form id="hrDecisionForm" class="hr-decision"><small>INSTITUTE HEAD DECISION</small><div class="hr-esign-panel" id="hrEsignPanel"><div class="hr-esign-preview"><div class="hr-pending-seal">${eSignSeal(head,null,'hr-esign-seal-small')}</div><div><small>PRINCIPAL E-SIGNATURE</small><strong>${esc(principalName(head))}</strong><span>Principal signature confirmation required</span></div><em id="hrEsignState">Not applied</em></div><button type="button" class="hr-esign-action" id="hrApplyEsign">Open e-signature authentication</button><p id="hrEsignError" class="hr-error" role="alert" hidden></p></div><label for="hrDecision">Decision</label><select id="hrDecision" required><option value="">Select decision</option><option value="approved">Approved — permission granted</option><option value="accepted">Accepted — submission accepted</option><option value="rejected">Rejected — submission declined</option></select><label for="hrRemark">Official remark <span>(required for rejection)</span></label><textarea id="hrRemark" maxlength="2000" rows="3" placeholder="Add your remarks for the staff member"></textarea><p id="hrDecisionError" class="hr-error" role="alert"></p><button type="submit" class="hr-primary" id="hrDecisionSubmit">Record Decision & Notify Staff</button></form>`:`<section class="hr-decision"><small>RECORDED DECISION</small><h3>${esc(label(r.status))}</h3><p>${esc(r.decision_remark||'No remark recorded.')}</p><small>${date(r.decided_at)} · Principal-cum-Secretary</small>${principalSignature}</section>`}`;
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
  if(!esignApplied){const box=$('#hrEsignError');if(box){box.textContent='Principal e-signature is mandatory before recording a decision.';box.hidden=false}$('#hrEsignPanel')?.classList.add('hr-esign-required');$('#hrApplyEsign')?.focus();return}
  if(decision==='rejected'&&!remark){$('#hrDecisionError').textContent='Please give a reason for rejection.';return}
  if(!confirm('Record this request as '+label(decision)+' and notify the staff member? This decision will be final.'))return;
  busy=true;$('#hrDecisionSubmit').disabled=true;$('#hrClose').disabled=true;$('#hrDecisionError').textContent='';
  try{await rpc('decide_institute_head_request',{p_request_id:id,p_decision:decision,p_remark:remark||null,p_esign:true});selected=await rpc('get_institute_head_request',{p_request_id:id});showDetail();await refresh();}
  catch(err){if($('#hrDecisionError'))$('#hrDecisionError').textContent=err.message;else alert(err.message)}
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
