/* BASIC UI only: no persistence, network calls or report generation. */
'use strict';
const MAX_VOYAGES = 20;
const voyages = document.getElementById('voyages');
let nextId = 0;
let resetAction = null;
const today = () => { const d = new Date(); return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear(); };
function hasData() {
  return !!document.getElementById('vesselName').value.trim() || !!document.getElementById('imoNumber').value.trim() || document.getElementById('calculationDate').value !== today() || [...voyages.querySelectorAll('input')].some(i=>i.value !== '');
}
function refresh(showValidation=false) {
  document.querySelectorAll('.manual-date,.port,.cargo').forEach(normalizeField);
  calculateVEF(showValidation);
  voyages.querySelectorAll('.voyage').forEach((card,index)=>{
    card.querySelector('.voyage-number').textContent=index+1;
    card.querySelector('.port-preview').textContent=card.querySelector('.port').value.trim() || 'Not entered';
    const result=card.querySelector('.qualified').textContent;
    const badge=card.querySelector('.status-badge');
    badge.textContent=result==='YES'?'Qualified':result==='NO'?'Excluded':'Incomplete';
    badge.className='status-badge'+(result==='YES'?' yes':result==='NO'?' no':'');
    card.querySelector('.remove-voyage').setAttribute('aria-label','Remove voyage '+(index+1));
    card.querySelectorAll('.ship,.bl').forEach(input=>input.setAttribute('aria-invalid',String(!card.classList.contains('pristine') && input.classList.contains('invalid-input'))));
  });
  const count=voyages.children.length;
  document.getElementById('voyageCount').textContent=count+' / '+MAX_VOYAGES;
  document.getElementById('addVoyage').disabled=count>=MAX_VOYAGES;
  document.getElementById('limitMessage').hidden=count<MAX_VOYAGES;
  const invalidIMO=document.getElementById('imoNumber').classList.contains('invalid-input');
  document.getElementById('imoError').hidden=!invalidIMO;
  document.getElementById('imoNumber').setAttribute('aria-invalid',String(invalidIMO));
  if (!showValidation) document.getElementById('validationSummary').textContent='';
  validateDates(showValidation);
}
function addVoyage(focus=true) {
  if(voyages.children.length>=MAX_VOYAGES)return;
  const fragment=document.getElementById('voyageTemplate').content.cloneNode(true);
  const card=fragment.querySelector('.voyage');
  card.classList.add('pristine');
  const id=++nextId;
  card.querySelectorAll('input').forEach((input,index)=>{input.id='voyage-'+id+'-'+index;input.parentElement.htmlFor=input.id;});
  card.querySelector('.row-status').id='voyage-'+id+'-status';
  card.querySelectorAll('.ship,.bl').forEach(input=>input.setAttribute('aria-describedby','voyage-'+id+'-status'));
  if(focus) voyages.querySelectorAll('.voyage').forEach(c=>c.open=false);
  voyages.appendChild(fragment);
  refresh();
  if(focus)card.querySelector('.port').focus();
}
function confirmAction(action,heading,buttonText) {
  resetAction=action;
  document.getElementById('confirmHeading').textContent=heading;
  document.getElementById('confirmReset').textContent=buttonText;
  document.getElementById('confirmText').textContent=heading.startsWith('Remove')?'This voyage and its entered data will be removed.':'All entered data will be removed. This version does not save calculations.';
  document.getElementById('confirmDialog').showModal();
  document.getElementById('cancelReset').focus();
}
function clearCalculation() {
  voyages.replaceChildren();
  document.getElementById('vesselName').value='';
  document.getElementById('imoNumber').value='';
  document.getElementById('calculationDate').value=today();
  addVoyage(false);
  document.getElementById('actionStatus').textContent='A new calculation is ready.';
  document.getElementById('vesselName').focus();
}
document.getElementById('addVoyage').addEventListener('click',()=>{document.getElementById('actionStatus').textContent='';addVoyage();});
voyages.addEventListener('input',event=>{event.target.closest('.voyage')?.classList.remove('pristine');document.getElementById('actionStatus').textContent='';refresh();});
voyages.addEventListener('click',event=>{
  const button=event.target.closest('.remove-voyage');if(!button)return;
  const card=button.closest('.voyage');
  const remove=()=>{card.remove();if(!voyages.children.length)addVoyage(false);refresh();document.getElementById('addVoyage').focus();};
  if([...card.querySelectorAll('input')].some(input=>input.value))confirmAction(remove,'Remove this voyage?','Remove voyage');else remove();
});
document.getElementById('imoNumber').addEventListener('input',()=>refresh());
document.getElementById('calculationDate').addEventListener('input',()=>refresh());
document.getElementById('calculate').addEventListener('click',()=>{
  voyages.querySelectorAll('.voyage').forEach(c=>c.classList.remove('pristine'));
  refresh(true);
  const invalidDate = document.querySelector('.manual-date[aria-invalid="true"]');
  if (invalidDate) {
    const card = invalidDate.closest('.voyage');
    if (card) card.open = true;
    invalidDate.focus();
    invalidDate.reportValidity();
    document.getElementById('actionStatus').textContent='Correct invalid dates before calculating.';
    return;
  }
  document.getElementById('actionStatus').textContent='VEF '+document.getElementById('finalVEF').textContent+' · '+document.getElementById('qualifiedCount').textContent+' qualified voyages.';
  document.getElementById('resultHeading').scrollIntoView({behavior:'auto',block:'start'});
});
['newCalculation','clearCalculation'].forEach(id=>document.getElementById(id).addEventListener('click',()=>hasData()?confirmAction(clearCalculation,'Start a new calculation?','Clear calculation'):clearCalculation()));
document.getElementById('cancelReset').addEventListener('click',()=>{resetAction=null;document.getElementById('confirmDialog').close();});
document.getElementById('confirmReset').addEventListener('click',()=>{const action=resetAction;resetAction=null;document.getElementById('confirmDialog').close();if(action)action();});
document.getElementById('confirmDialog').addEventListener('cancel',()=>{resetAction=null;});
window.addEventListener('beforeunload',event=>{if(hasData()){event.preventDefault();event.returnValue='';}});
document.getElementById('calculationDate').value=today();
addVoyage(false);
