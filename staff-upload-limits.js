(()=>{'use strict';
const KB=1024,limits={notes:150*KB,qualifications:250*KB,documents:250*KB};
function kind(input){if(input?.id==='noteAttachment')return 'notes';if(input?.name==='certificate'||input?.closest('.qual-modal'))return 'qualifications';if(input?.closest('.dash-view[data-view="documents"]'))return 'documents';return null}
function label(k){return k==='notes'?'150 KB':k==='qualifications'?'250 KB':'250 KB'}
function reject(input,k){const f=input.files?.[0];if(!f||f.size<=limits[k])return false;alert(`${k==='notes'?'Note attachment':k==='qualifications'?'Qualification certificate / marksheet':'Professional document'} must be ${label(k)} or smaller. Please reduce the file size without making the document unreadable and upload it again.`);input.value='';if(k==='notes'){const list=document.querySelector('#noteFileList');if(list)list.textContent='No file attached'}return true}
document.addEventListener('change',e=>{const input=e.target;if(!(input instanceof HTMLInputElement)||input.type!=='file')return;const k=kind(input);if(k)reject(input,k)},true);
function updateText(root=document){root.querySelectorAll?.('.note-attachment-copy small').forEach(el=>el.textContent='PDF, JPG, PNG, DOC or DOCX · Maximum 150 KB');root.querySelectorAll?.('.qual-upload-zone small').forEach(el=>{if(/maximum|optional/i.test(el.textContent))el.textContent='Optional · PDF, JPG or PNG · Maximum 250 KB'});root.querySelectorAll?.('.dash-view[data-view="documents"] .document-grid article p').forEach(el=>{if(/PDF document/i.test(el.textContent))el.textContent='PDF, JPG or PNG · Maximum 250 KB.'})}
const obs=new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes)if(n.nodeType===1)updateText(n)});
function boot(){updateText();obs.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();