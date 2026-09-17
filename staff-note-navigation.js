(()=>{'use strict';
const STYLE='staff-note-navigation.css';let origin=null;
function css(){if(document.querySelector(`link[href="${STYLE}"]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=STYLE;document.head.appendChild(l)}
function ensure(){const heading=document.querySelector('[data-view="create-note"] .notes-heading');if(!heading)return null;let b=document.querySelector('#noteContextBack');if(b)return b;b=document.createElement('button');b.type='button';b.id='noteContextBack';b.className='note-context-back';b.innerHTML='<span class="note-back-arrow">←</span><span class="note-back-label">All Notes</span>';heading.parentNode.insertBefore(b,heading);b.addEventListener('click',()=>{if(origin==='all-notes'){document.querySelector('[data-dash-view="all-notes"]')?.click()}origin=null;hide()});return b}
function show(from='all-notes'){origin=from;const b=ensure();if(!b)return;b.querySelector('.note-back-label').textContent=from==='all-notes'?'All Notes':'Back';b.classList.add('visible')}
function hide(){document.querySelector('#noteContextBack')?.classList.remove('visible')}
css();window.BLCNoteNavigation={show,hide,getOrigin:()=>origin};
})();