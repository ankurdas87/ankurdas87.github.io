(()=>{
if(!window.supabase||typeof SUPABASE_URL==='undefined'||typeof SUPABASE_KEY==='undefined')return;
const sb=(typeof supabaseClient!=='undefined'&&supabaseClient)?supabaseClient:window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
let pendingEmail='';
const result=(s,msg,bad=false)=>{const e=$(s);if(!e)return;e.hidden=false;e.textContent=msg;e.style.borderColor=bad?'#d9534f':'';};
const login=$('#staffLoginForm'),reg=$('#staffRegisterForm'),otpBox=$('#staffOtpBox');
$('#showStaffLogin')?.addEventListener('click',()=>{login.hidden=false;reg.hidden=true;otpBox.hidden=true;});
$('#showStaffRegister')?.addEventListener('click',()=>{login.hidden=true;reg.hidden=false;otpBox.hidden=true;});

function renderProfile(p){
 const box=$('#staffProfile');
 box.replaceChildren();
 [['Staff Username',p.username],['Designation',p.designation],['Email',p.email],['Phone',p.phone]].forEach(([label,value])=>{
  const row=document.createElement('p');
  const strong=document.createElement('b');
  strong.textContent=label+': ';
  row.append(strong,document.createTextNode(value||''));
  box.appendChild(row);
 });
}

async function showStaffPanel(){
 const {data:{user}}=await sb.auth.getUser(); if(!user)return;
 const {data:p,error}=await sb.from('staff_profiles').select('first_name,last_name,designation,email,phone,username,account_status').eq('id',user.id).maybeSingle();
 if(error||!p||p.account_status!=='active'){await sb.auth.signOut();return;}
 $('#staffAuth').hidden=true; $('#staffPanel').hidden=false;
 $('#staffWelcome').textContent='Welcome, '+p.first_name+' '+p.last_name;
 renderProfile(p);
}

reg?.addEventListener('submit',async e=>{
 e.preventDefault(); const f=new FormData(e.target),p=String(f.get('password')),c=String(f.get('confirm_password'));
 if(p!==c){result('#staffRegisterResult','Passwords do not match.',true);return;}
 result('#staffRegisterResult','Creating your staff account...');
 const email=String(f.get('email')).trim().toLowerCase();
 const {data,error}=await sb.auth.signUp({email,password:p,options:{data:{role:'staff',first_name:String(f.get('first_name')).trim(),last_name:String(f.get('last_name')).trim(),designation:String(f.get('designation')).trim(),phone:String(f.get('phone')).trim()}}});
 if(error){result('#staffRegisterResult',error.message,true);return;}
 if(!data.user){result('#staffRegisterResult','Account could not be created.',true);return;}
 const {data:profile}=await sb.from('staff_profiles').select('username').eq('id',data.user.id).maybeSingle();
 result('#staffRegisterResult',profile?.username?'Account created. Your Staff Username is '+profile.username+'. Please check your email if confirmation is required.':'Account created. Please check your email to complete registration.');
});

login?.addEventListener('submit',async e=>{
 e.preventDefault(); const f=new FormData(e.target); const username=String(f.get('username')).trim(); const password=String(f.get('password'));
 result('#staffLoginResult','Checking your staff credentials...');
 const {data:email,error:lookupError}=await sb.rpc('get_staff_login_email',{p_username:username});
 if(lookupError||!email){result('#staffLoginResult','Invalid staff username or password.',true);return;}
 const {error:passwordError}=await sb.auth.signInWithPassword({email,password});
 if(passwordError){result('#staffLoginResult','Invalid staff username or password.',true);return;}
 await sb.auth.signOut();
 pendingEmail=email;
 const {error:otpError}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
 if(otpError){pendingEmail='';result('#staffLoginResult','Password accepted, but the email verification code could not be sent: '+otpError.message,true);return;}
 login.hidden=true; reg.hidden=true; otpBox.hidden=false;
 result('#staffOtpResult','Password verified. A verification code has been sent to your registered email.');
});

$('#staffOtpForm')?.addEventListener('submit',async e=>{
 e.preventDefault(); if(!pendingEmail){result('#staffOtpResult','Please start the sign-in process again.',true);return;}
 const token=String(new FormData(e.target).get('otp')).trim();
 const {data,error}=await sb.auth.verifyOtp({email:pendingEmail,token,type:'email'});
 if(error||!data.session){result('#staffOtpResult','Invalid or expired verification code.',true);return;}
 pendingEmail=''; await showStaffPanel();
});

$('#staffLogout')?.addEventListener('click',async()=>{await sb.auth.signOut();location.reload();});
(async()=>{const {data:{session}}=await sb.auth.getSession();if(session)await showStaffPanel();})();
})();