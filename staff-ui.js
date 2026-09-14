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

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initStaffSignupUI,{once:true});
  }else{
    initStaffSignupUI();
  }
})();
