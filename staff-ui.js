(()=>{
  'use strict';

  function initStaffSignupUI(){
    const reg=document.getElementById('staffRegisterForm');
    if(!reg)return;

    const steps=[...reg.querySelectorAll('.signup-step')];
    const progress=[...reg.querySelectorAll('.progress-item')];

    function showStep(n){
      steps.forEach(el=>{
        const active=Number(el.dataset.step)===n;
        el.hidden=!active;
        el.style.display=active?'block':'none';
      });
      progress.forEach(el=>el.classList.toggle('active',Number(el.dataset.progress)<=n));
      reg.dataset.currentStep=String(n);
    }

    function validate(names){
      for(const name of names){
        const field=reg.elements.namedItem(name);
        if(!field)continue;
        if(!field.checkValidity()){
          field.reportValidity();
          field.focus();
          return false;
        }
      }
      return true;
    }

    function buildReview(){
      const f=new FormData(reg);
      const box=document.getElementById('registerReview');
      if(!box)return;
      box.replaceChildren();
      [
        ['First Name',f.get('first_name')],
        ['Last Name',f.get('last_name')],
        ['Designation',f.get('designation')],
        ['Official Email',f.get('email')],
        ['Phone Number',f.get('phone')],
        ['Password','Hidden for security']
      ].forEach(([label,value])=>{
        const item=document.createElement('div');
        const caption=document.createElement('span');
        const text=document.createElement('strong');
        item.className='review-item';
        caption.textContent=label;
        text.textContent=String(value??'');
        item.append(caption,text);
        box.appendChild(item);
      });
    }

    const next1=document.getElementById('registerNext1');
    const next2=document.getElementById('registerNext2');

    if(next1){
      next1.onclick=(e)=>{
        e.preventDefault();
        e.stopPropagation();
        if(validate(['first_name','last_name','designation','email','phone']))showStep(2);
      };
    }

    if(next2){
      next2.onclick=(e)=>{
        e.preventDefault();
        e.stopPropagation();
        if(!validate(['password','confirm_password']))return;
        const p=reg.elements.namedItem('password');
        const c=reg.elements.namedItem('confirm_password');
        if(p&&c&&p.value!==c.value){
          c.setCustomValidity('Passwords do not match.');
          c.reportValidity();
          c.setCustomValidity('');
          c.focus();
          return;
        }
        buildReview();
        showStep(3);
      };
    }

    reg.querySelectorAll('[data-prev]').forEach(btn=>{
      btn.onclick=(e)=>{
        e.preventDefault();
        showStep(Number(btn.dataset.prev));
      };
    });

    document.querySelectorAll('.password-eye').forEach(btn=>{
      btn.onclick=(e)=>{
        e.preventDefault();
        const input=btn.parentElement?.querySelector('input');
        if(!input)return;
        const showing=input.type==='text';
        input.type=showing?'password':'text';
        btn.textContent=showing?'Show':'Hide';
        btn.setAttribute('aria-label',showing?'Show password':'Hide password');
      };
    });

    showStep(1);
  }

  function cleanDashboardPlaceholderLabels(){
    document.querySelectorAll('.dash-view[data-view="documents"] .document-grid button').forEach(btn=>{
      if(btn.textContent.includes('Upload · Phase 2'))btn.textContent='Upload';
    });
    const edit=document.querySelector('.dash-view[data-view="profile"] .profile-card-head .outline-action');
    if(edit&&edit.textContent.includes('Phase 2'))edit.textContent='Edit Profile';
  }

  function getClient(){
    if(!window.supabase||typeof SUPABASE_URL==='undefined'||typeof SUPABASE_KEY==='undefined')return null;
    if(typeof supabaseClient!=='undefined'&&supabaseClient)return supabaseClient;
    if(!window.__blcStaffUiClient)window.__blcStaffUiClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    return window.__blcStaffUiClient;
  }

  function safeFileName(name){
    const dot=name.lastIndexOf('.');
    const ext=dot>=0?name.slice(dot).toLowerCase():'';
    const base=(dot>=0?name.slice(0,dot):name).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'cv';
    return base+ext;
  }

  function setCvButton(button,label,disabled=false){
    if(!button)return;
    button.textContent=label;
    button.disabled=disabled;
  }

  async function refreshCvState(sb,button){
    const {data:{user}}=await sb.auth.getUser();
    if(!user)return;
    const {data,error}=await sb.from('staff_documents').select('id,original_file_name,file_path').eq('staff_id',user.id).eq('document_type','cv').maybeSingle();
    if(error){setCvButton(button,'Upload');return;}
    if(data){
      button.dataset.uploaded='true';
      setCvButton(button,'Replace');
      const card=button.closest('article');
      const p=card?.querySelector('p');
      if(p)p.textContent=(data.original_file_name||'CV / Resume')+' · Uploaded securely';
    }else{
      delete button.dataset.uploaded;
      setCvButton(button,'Upload');
    }
  }

  function initCvUpload(){
    const documentsView=document.querySelector('.dash-view[data-view="documents"]');
    const button=documentsView?.querySelector('.document-grid article:first-child button');
    if(!button)return;

    button.disabled=false;
    const input=document.createElement('input');
    input.type='file';
    input.accept='application/pdf,image/jpeg,image/png';
    input.hidden=true;
    input.setAttribute('aria-label','Choose CV or Resume');
    documentsView.appendChild(input);

    const sb=getClient();
    if(!sb){setCvButton(button,'Upload',true);return;}

    refreshCvState(sb,button);

    button.addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];
      if(!file)return;
      if(!['application/pdf','image/jpeg','image/png'].includes(file.type)){
        alert('Please choose a PDF, JPG or PNG file.');input.value='';return;
      }
      if(file.size>10485760){
        alert('The file must be 10 MB or smaller.');input.value='';return;
      }

      setCvButton(button,'Uploading…',true);
      const {data:{user},error:userError}=await sb.auth.getUser();
      if(userError||!user){alert('Your staff session has expired. Please sign in again.');setCvButton(button,'Upload');input.value='';return;}

      const {data:oldRecord}=await sb.from('staff_documents').select('id,file_path').eq('staff_id',user.id).eq('document_type','cv').maybeSingle();
      const filePath=`${user.id}/cv/${Date.now()}-${safeFileName(file.name)}`;
      const {error:uploadError}=await sb.storage.from('staff-documents').upload(filePath,file,{upsert:false,contentType:file.type});
      if(uploadError){alert('CV upload failed: '+uploadError.message);setCvButton(button,oldRecord?'Replace':'Upload');input.value='';return;}

      let dbError;
      if(oldRecord){
        ({error:dbError}=await sb.from('staff_documents').update({document_title:'CV / Resume',file_path:filePath,original_file_name:file.name,file_size:file.size,mime_type:file.type,updated_at:new Date().toISOString()}).eq('id',oldRecord.id));
      }else{
        ({error:dbError}=await sb.from('staff_documents').insert({staff_id:user.id,document_type:'cv',document_title:'CV / Resume',file_path:filePath,original_file_name:file.name,file_size:file.size,mime_type:file.type}));
      }

      if(dbError){
        await sb.storage.from('staff-documents').remove([filePath]);
        alert('The file could not be saved to your staff record: '+dbError.message);
        setCvButton(button,oldRecord?'Replace':'Upload');input.value='';return;
      }

      if(oldRecord?.file_path&&oldRecord.file_path!==filePath)await sb.storage.from('staff-documents').remove([oldRecord.file_path]);
      await refreshCvState(sb,button);
      input.value='';
      alert(oldRecord?'CV / Resume replaced successfully.':'CV / Resume uploaded successfully.');
    });
  }

  function init(){
    initStaffSignupUI();
    cleanDashboardPlaceholderLabels();
    initCvUpload();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
