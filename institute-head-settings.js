(()=>{
 'use strict';
 const root=document.querySelector('.ih-view[data-view="settings"]');
 if(!root)return;
 const $=s=>root.querySelector(s);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const client=()=>typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
 let email='',loading=false,sending=false;
 root.classList.remove('ref-placeholder');
 root.innerHTML=`<div class="ih-settings">
  <header class="ih-settings-heading"><div><small>OFFICE OF THE PRINCIPAL-CUM-SECRETARY</small><h1>Settings</h1><p>Manage access to your Institute Head account and review its registered identity.</p></div><button type="button" id="ihSettingsRefresh">Refresh details</button></header>
  <p id="ihSettingsMessage" class="ih-settings-message" role="status" aria-live="polite" hidden></p>
  <div class="ih-settings-grid"><div class="ih-settings-column">
   <section class="ih-settings-card"><div class="ih-settings-card-title"><span aria-hidden="true">01</span><div><h2>Account & Security</h2><p>Recovery and access controls for the Principal’s Portal.</p></div></div>
    <button type="button" class="ih-settings-action" id="ihSettingsReset"><span><strong>Reset password by email</strong><small>Send a secure reset link to your registered account email.</small></span><b aria-hidden="true">→</b></button>
    <p class="ih-settings-help">Your Institute Head username and registered email are managed by the college administrator.</p>
   </section>
   <section class="ih-settings-card"><div class="ih-settings-card-title"><span aria-hidden="true">02</span><div><h2>Current Session</h2><p>End access on this device when you finish working.</p></div></div>
    <button type="button" class="ih-settings-action ih-settings-signout" id="ihSettingsSignout"><span><strong>Sign Out</strong><small>Close your current Principal’s Portal session.</small></span><b aria-hidden="true">→</b></button>
   </section>
  </div><div class="ih-settings-column">
   <section class="ih-settings-card"><div class="ih-settings-card-title"><span aria-hidden="true">ID</span><div><h2>Account Information</h2><p>The identity linked to your signed decisions.</p></div></div><dl id="ihSettingsIdentity" class="ih-settings-fields"><div><dt>Account</dt><dd>Loading…</dd></div></dl></section>
   <section class="ih-settings-card"><div class="ih-settings-card-title"><span aria-hidden="true">✓</span><div><h2>Portal Protection</h2><p>How this account and its decisions are verified.</p></div></div><dl class="ih-settings-fields"><div><dt>Sign in</dt><dd>Username and password</dd></div><div><dt>Login verification</dt><dd>Email OTP</dd></div><div><dt>Decision signature</dt><dd>Portal email code</dd></div></dl></section>
  </div></div>
 </div>`;
 const message=(value,bad=false)=>{const n=$('#ihSettingsMessage');n.textContent=value;n.hidden=!value;n.classList.toggle('is-error',bad)};
 async function load(){
  if(loading||root.offsetParent===null)return;
  const c=client();if(!c){message('Secure session unavailable. Please sign in again.',true);return}
  loading=true;$('#ihSettingsRefresh').disabled=true;
  try{
   const {data:{user},error:authError}=await c.auth.getUser();if(authError)throw authError;
   if(!user)throw new Error('Please sign in again to view your settings.');
   const {data:p,error}=await c.from('institute_head_profiles').select('first_name,last_name,username,designation,email,account_status').eq('id',user.id).maybeSingle();
   if(error)throw error;
   if(!p||p.username!=='BLC@Principal'||p.account_status!=='active')throw new Error('This account is not authorized for Institute Head settings.');
   email=String(p.email||user.email||'').trim();
   const rows=[['Name',[p.first_name,p.last_name].filter(Boolean).join(' ')||'Dr. Pratap Chandra Dash'],['Username',p.username],['Designation',p.designation||'Principal-cum-Secretary'],['Registered email',email||'Unavailable'],['Account status',p.account_status]];
   $('#ihSettingsIdentity').innerHTML=rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
   message('');
  }catch(err){message('Account details could not be loaded. '+(err.message||'Please try again.'),true)}
  finally{loading=false;$('#ihSettingsRefresh').disabled=false}
 }
 $('#ihSettingsRefresh').addEventListener('click',load);
 $('#ihSettingsSignout').addEventListener('click',()=>document.querySelector('#ihLogout')?.click());
 $('#ihSettingsReset').addEventListener('click',async()=>{
  if(sending)return;
  if(!email){await load();if(!email)return}
  if(!confirm('Send a password reset link to the registered Institute Head email?'))return;
  const c=client();if(!c){message('Secure session unavailable. Please sign in again.',true);return}
  sending=true;const button=$('#ihSettingsReset');button.disabled=true;message('Sending password reset link…');
  try{
   const {error}=await c.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
   if(error)throw error;
   message('Password reset link sent to your registered email. Open it to set a new password.');
  }catch(err){message('The reset link could not be sent. '+(err.message||'Please try again.'),true)}
  finally{sending=false;button.disabled=false}
 });
 document.addEventListener('click',e=>{if(e.target.closest('[data-ih-view="settings"]'))requestAnimationFrame(load)});
 const panel=document.getElementById('ihPanel');
 if(panel)new MutationObserver(()=>{if(!panel.hidden&&root.classList.contains('active'))load()}).observe(panel,{attributes:true,attributeFilter:['hidden']});
})();
