(()=>{'use strict';
const staff=!!document.querySelector('#staffPanel');
const panel=()=>document.querySelector(staff?'#staffPanel':'#ihPanel');
const targets=staff?['.dash-nav [data-dash-view="create-note"]','.dash-nav [data-dash-view="inbox"]']:['.ref-nav [data-ih-view="notes"]','.ih-notes-actions [data-note-section="inbox"]'];
let client=null,lastCount=0,sequence=0,observer=null;
function api(){
 if(client)return client;
 if(typeof window.supabase==='undefined'||typeof SUPABASE_URL==='undefined'||typeof SUPABASE_KEY==='undefined')return null;
 client=(typeof supabaseClient!=='undefined'&&supabaseClient)?supabaseClient:window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 return client;
}
function render(count){
 lastCount=count;
 for(const selector of targets){
  const button=document.querySelector(selector);
  if(!button)continue;
  let badge=button.querySelector(':scope > .note-unread-badge');
  if(!count){badge?.remove();button.removeAttribute('data-note-unread');continue}
  if(!badge){badge=document.createElement('span');badge.className='note-unread-badge';button.appendChild(badge)}
  badge.textContent=count>99?'99+':String(count);
  badge.setAttribute('aria-label',count+' unread '+(count===1?'note':'notes'));
  button.dataset.noteUnread=String(count);
 }
}
async function refresh(){
 const run=++sequence,view=panel();
 if(!view||view.hidden){render(0);return}
 const c=api();if(!c)return;
 try{
  const {data:{user},error:authError}=await c.auth.getUser();
  if(run!==sequence)return;
  if(authError||!user){render(0);return}
  const {data,error}=await c.from('staff_note_deliveries').select('status').eq('recipient_id',user.id).is('read_at',null);
  if(run!==sequence||error)return;
  render((data||[]).filter(row=>row.status!=='read').length);
 }catch(e){console.error('Note inbox count unavailable',e)}
}
function start(){
 if(!targets.every(selector=>document.querySelector(selector))){
  observer=new MutationObserver(()=>{
   if(lastCount)render(lastCount);
   if(targets.every(selector=>document.querySelector(selector))){observer.disconnect();observer=null}
  });
  observer.observe(document.body,{childList:true,subtree:true});
 }
 const view=panel();if(view)new MutationObserver(()=>refresh()).observe(view,{attributes:true,attributeFilter:['hidden']});
 const c=api();
 c?.auth.onAuthStateChange(()=>setTimeout(refresh,0));
 window.addEventListener('blc-note-inbox-changed',refresh);
 window.addEventListener('blc-note-delivery-changed',refresh);
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 document.addEventListener('click',event=>{if(event.target.closest(targets.join(',')))refresh()});
 setInterval(()=>{if(!document.hidden)refresh()},15000);
 refresh();
}
window.BLCNoteInboxBadge={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();