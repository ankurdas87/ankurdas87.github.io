(()=>{
'use strict';
function placeSignature(){
  const wrap=document.querySelector('[data-view="create-note"] .rich-note-wrap');
  const editor=document.querySelector('[data-view="create-note"] #noteContent');
  const signature=document.querySelector('[data-view="create-note"] .note-signature');
  if(!wrap||!editor||!signature)return false;
  if(signature.parentElement!==wrap||signature.previousElementSibling!==editor)editor.insertAdjacentElement('afterend',signature);
  return true;
}
function init(){
  if(placeSignature())return;
  const host=document.querySelector('.dash-content');
  if(!host)return;
  const observer=new MutationObserver(()=>{if(placeSignature())observer.disconnect();});
  observer.observe(host,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();