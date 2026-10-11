// Optional DOM / interaction test (not a real mobile browser): jsdom@26.1.0.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const importer=fs.readFileSync(path.join(__dirname,'../photo-import.js'),'utf8');
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
const tsv=header+[[20,'STS'],[260,'03/04/2026'],[460,'OIL'],[660,'1001.25'],[850,'1000.00']].map(([x,text])=>[5,1,1,1,1,1,x,40,text.length*7,20,96,text].join('\t')).join('\n');
function app(draft) {
 const dom=new JSDOM(html,{url:'https://vef.example.test/',runScripts:'outside-only'}),w=dom.window;
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.HTMLCanvasElement.prototype.getContext=function(){const c=this;return {drawImage(...args){if(args.length===9){c.left=args[1];c.top=args[2];}},getImageData(){const data=new Uint8ClampedArray(c.width*c.height*4);data.fill(255);return {width:c.width,height:c.height,data};},putImageData(){}};};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let terminated=0,recognized=0;
 let psm='6',column=0;
 const headerWords=[[20,10,'PORT'],[70,10,'TERMINAL'],[230,10,'B/L'],[260,10,'DATE'],[460,10,'CARGO'],[660,0,"SHIP'S"],[660,30,'FIGURES'],[850,0,'B/L'],[850,30,'FIGURES'],[0,10,'VOY'],[950,10,'Qualified']];
 const dataWords=[[20,'STS'],[260,'03/04/2026'],[460,'OIL'],[660,'1001.25'],[850,'1000.00']];
 const detectionTSV=header+headerWords.map(([x,y,text])=>[5,1,1,1,1,1,x,y,text.length*5,15,96,text].join('\t')).join('\n')+'\n'+dataWords.map(([x,text])=>[5,1,1,1,1,1,x,90,text.length*7,20,96,text].join('\t')).join('\n');
 w.Tesseract={createWorker:async()=>({setParameters:async p=>{psm=p.tessedit_pageseg_mode;if(psm==='6')column=0;},recognize:async canvas=>{recognized++;if(psm==='11')return {data:{tsv:w.badHeader?header:detectionTSV}};const entry=dataWords[column++];return {data:{tsv:header+[5,1,1,1,1,1,entry[0]-(canvas.left||0),90-(canvas.top||0),entry[1].length*7,20,96,entry[1]].join('\t')}};},terminate:async()=>{terminated++;}})};
 if(draft) w.localStorage.setItem('vef-calculator-current-v2',draft);
 w.eval(importer);w.eval(script);
 return {dom,w,get terminated(){return terminated;},get recognized(){return recognized;}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
(async()=>{
 const a=app(),w=a.w,d=w.document;
 assert.equal(d.querySelector('#photoCamera').getAttribute('capture'),'environment');
 assert.equal(d.querySelector('#photoFile').hasAttribute('capture'),false);
 w.eval(d.querySelector('button[onclick="VEFPhotoImport.open()"]').getAttribute('onclick'));assert.equal(d.querySelector('#photoDialog').open,true);
 const file=d.querySelector('#photoFile');Object.defineProperty(file,'files',{value:[new w.File(['x'],'photo.png',{type:'image/png'})]});file.dispatchEvent(new w.Event('change'));
 const img=d.querySelector('#photoImage');Object.defineProperties(img,{naturalWidth:{value:1000},naturalHeight:{value:150}});img.dispatchEvent(new w.Event('load'));
 await tick();
 assert.equal(a.recognized,6);assert.equal(a.terminated,1);
 assert.equal(d.querySelector('#photoAdvanced').open,false);
 assert.ok(d.querySelector('#photo-port-start').value,'Automatically assigned columns');
 assert.equal(d.querySelectorAll('#photoRows input:checked').length,0);
 assert.equal(d.querySelector('#photoAppend').disabled,true);
 const checkbox=d.querySelector('#photoRows input');assert.ok(checkbox);checkbox.click();assert.equal(d.querySelector('#photoAppend').disabled,false);
 d.querySelector('#photoAppend').click();assert.equal(d.querySelector('#photoDialog').open,false);
 let rows=d.querySelectorAll('#tableBody tr');assert.equal(rows.length,2);assert.equal(rows[1].querySelector('.ship').value,'1001.25');assert.equal(rows[1].querySelector('.manual-exclude').checked,false);
 assert.equal(d.querySelector('#finalVEF').textContent,'-');assert.equal(d.querySelector('#totalShip').textContent,'-');
 rows[1].querySelector('.ship').value='1002';rows[1].querySelector('.ship').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelector('#finalVEF').textContent,'-');
 const draft=w.localStorage.getItem('vef-calculator-current-v2');
 w.saveCurrentCalculation();const savedPhoto=JSON.parse(w.localStorage.getItem('vef-calculator-history-v2'))[0];
 w.newCalculation();const current=w.localStorage.getItem('vef-calculator-current-v2');
 w.exportHistoryCalculation(savedPhoto.id);
 assert.equal(w.localStorage.getItem('vef-calculator-current-v2'),current);
 assert.match(d.querySelector('#validationSummary').textContent,/Open this saved calculation/);
 w.applyCalculationState(JSON.parse(draft).data,JSON.parse(draft).id);
 const restored=app(draft);
 assert.equal(restored.w.document.querySelector('#finalVEF').textContent,'-');
 restored.w.eval(restored.w.document.querySelector('button[onclick="calculateVEF(true)"]').getAttribute('onclick'));assert.equal(restored.w.document.querySelector('#finalVEF').textContent,'1.0020');
 assert.equal(JSON.parse(restored.w.localStorage.getItem('vef-calculator-current-v2')).data.photoReviewPending,false);
 // Cancel has no effect on the main table and releases the photo.
 w.VEFPhotoImport.open();d.querySelector('#photoCancel').click();assert.equal(d.querySelectorAll('#tableBody tr').length,2);assert.equal(img.hasAttribute('src'),false);
 // Separate camera input dispatch shares the same local recognition route.
 w.VEFPhotoImport.open();const camera=d.querySelector('#photoCamera');
 Object.defineProperty(camera,'files',{value:[new w.File(['x'],'camera.png',{type:'image/png'})]});camera.dispatchEvent(new w.Event('change'));
 img.dispatchEvent(new w.Event('load'));await tick();assert.equal(d.querySelector('#photoRead').disabled,false);assert.equal(a.recognized,12);
 d.querySelector('#photoCancel').click();assert.equal(d.querySelectorAll('#tableBody tr').length,2);
 // Unrecognizable headers expose optional correction without importing / inventing values.
 const fallback=app(),fw=fallback.w,fd=fw.document;fw.badHeader=true;fw.VEFPhotoImport.open();
 const ff=fd.querySelector('#photoFile');Object.defineProperty(ff,'files',{value:[new fw.File(['x'],'unknown.png',{type:'image/png'})]});ff.dispatchEvent(new fw.Event('change'));
 const fi=fd.querySelector('#photoImage');Object.defineProperties(fi,{naturalWidth:{value:1000},naturalHeight:{value:150}});fi.dispatchEvent(new fw.Event('load'));await tick();
 assert.match(fd.querySelector('#photoStatus').textContent,/Automatic table detection could not/);assert.equal(fd.querySelector('#photoAdvanced').open,true);assert.equal(fd.querySelectorAll('#photoRows input').length,0);assert.equal(fd.querySelector('#photoAppend').disabled,true);
 for(const [field,bounds] of Object.entries({port:[0,25],date:[25,45],cargo:[45,65],ship:[65,82],bl:[82,100]}))for(const [i,edge] of ['start','end'].entries()){const input=fd.querySelector('#photo-'+field+'-'+edge);input.value=bounds[i];input.dispatchEvent(new fw.Event('input'));}
 fd.querySelector('#photoRead').click();await tick();assert.equal(fallback.recognized,6);assert.ok(fd.querySelector('#photoRows input'));assert.equal(fd.querySelectorAll('#photoRows input:checked').length,0);
 fw.badHeader=false;fd.querySelector('#photoAuto').click();await tick();assert.equal(fallback.recognized,12);assert.equal(fd.querySelector('#photoAdvanced').open,false);
 fallback.dom.window.close();
 a.dom.window.close();restored.dom.window.close();console.log('PASS: DOM file / camera controls → OCR preview → explicit selection → editable append → edit / reload gate → Calculate; cancellation cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
