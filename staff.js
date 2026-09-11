(()=>{
if(!window.supabase||typeof SUPABASE_URL==='undefined')return;
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const result=(s,msg,bad=false)=>{const e=$(s);if(!e)return;e.hidden=false;e.textContent=msg;e.style.borderColor=bad?'#d9534f':'';};
const login=$('#staffLoginForm'),reg=$('#staffRegisterForm');
$('#showStaffLogin')?.addEventListener('click',()=>{login.hidden=false;reg.hidden=true;});
$('#showStaffRegister')?.addEventListener('click',()=>{login.hidden=true;reg.hidden=false;});
reg?.addEventListener('submit',async e=>{
 e.preventDefault();const f=new FormData(e.target),p=String(f.get('password')),c=String(f.get('confirm_password'));
 if(p!==c){result('#staffRegisterResult','Passwords do not match.',true);return;}
 result('#staffRegisterResult','Creating your staff account...');
 const email=String(f.get('email')).trim().toLowerCase();
 const {data,error}=await sb.auth.signUp({email,password:p,options:{data:{role:'staff',first_name:String(f.get('first_name')).trim(),last_name:String(f.get('last_name')).trim(),designation:String(f.get('designation')).trim(),phone:String(f.get('phone')).trim()}}});
 if(error){result('#staffRegisterResult',error.message,true);return;}
 if(!data.user){result('#staffRegisterResult','Account could not be created.',true);return;}
 const {data:profile}=await sb.from('staff_profiles').select('username').eq('id',data.user.id).maybeSingle();
 result('#staffRegisterResult',profile?.username?'Account created. Your Staff Username is '+profile.username+'. Keep it safely.':'Account created. Your staff username is being prepared.');
});
login?.addEventListener('submit',async e=>{e.preventDefault();result('#staffLoginResult','Username sign-in is being connected securely. Please use this page after final Supabase setup.');});
$('#staffLogout')?.addEventListener('click',async()=>{await sb.auth.signOut();location.reload();});
})();