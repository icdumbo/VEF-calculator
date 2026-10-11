// Optional DOM routing test: jsdom@26.1.0; PDF / OCR APIs are mocked.
const {JSDOM}=require('jsdom'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const dom=new JSDOM(html,{url:'https://vef.example.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
const item=(str,x,y,width=str.length*5)=>({str,width,height:10,transform:[10,0,0,10,x,1000-y-10]});
const items=[item('VOY',10,40),item('PORT / TERMINAL',50,40),item('B/L DATE',190,40),item('CARGO',300,40),item("SHIP'S",410,20),item('FIGURES',407,60),item('B/L',520,20),item('FIGURES',510,60),item('Qualified',700,40),item('Difference',620,40)];
for(let i=0;i<20;i++)items.push(item(String(i+1),10,85+i*20),item('STS',60,85+i*20),item('03/04/2026',190,85+i*20),item('OIL',300,85+i*20),item('1001.000',407,85+i*20),item('1000.000',510,85+i*20),item('NO',710,85+i*20));
items.push(item('TOTALS:',300,500));
let ocrCalls=0,destroyed=0;
w.URL.createObjectURL=()=> 'blob:pdf-test';w.URL.revokeObjectURL=()=>{};
w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob(['preview'],{type:'image/png'}));};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
w.pdfjsLib={getDocument(options){assert.equal(options.isEvalSupported,false);return {destroy:async()=>{destroyed++;},promise:Promise.resolve({numPages:2,getPage:async n=>({
 getViewport:({scale})=>({width:800*scale,height:1000*scale,scale,transform:[scale,0,0,-scale,0,1000*scale]}),
 getTextContent:async()=>({items:n===1?items:[]}),render:()=>({promise:Promise.resolve(),cancel(){}})
})})};}};
w.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{
 const value=['STS','03/04/2026','OIL','1001.25','1000.00'][ocrCalls++%5];
 return {data:{tsv:'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'+[5,1,1,1,1,1,10,40,value.length*6,20,96,value].join('\t')}};
}})};
w.eval(fs.readFileSync(path.join(__dirname,'../photo-import.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../pdf-import.js'),'utf8'));w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const tick=()=>new Promise(r=>setTimeout(r,20));
async function select(){w.VEFPhotoImport.open('pdf');const input=d.querySelector('#pdfFile');Object.defineProperty(input,'files',{configurable:true,value:[{name:'synthetic.pdf',type:'application/pdf',size:100,arrayBuffer:async()=>new ArrayBuffer(10)}]});input.dispatchEvent(new w.Event('change'));await tick();}
(async()=>{
 await select();assert.equal(d.querySelectorAll('#pdfPage option').length,2);assert.match(d.querySelector('#photoStatus').textContent,/without OCR/);
 d.querySelector('#photoNumbers').value='dot';d.querySelector('#photoRead').click();await tick();assert.equal(ocrCalls,0);
 const checks=d.querySelectorAll('#photoRows input');assert.equal(checks.length,20);assert.equal(d.querySelectorAll('#photoRows input:checked').length,0);
 checks.forEach(input=>input.click());d.querySelector('#photoAppend').click();
 const rows=d.querySelectorAll('#tableBody tr');assert.equal(rows.length,21);assert.equal(rows[1].querySelector('.ship').value,'1001');assert.equal(rows[1].querySelector('.manual-exclude').checked,false);assert.equal(rows[1].querySelector('.qualified').textContent,'-');assert.equal(d.querySelector('#finalVEF').textContent,'-');
 assert.equal(JSON.parse(w.localStorage.getItem('vef-calculator-current-v2')).data.photoReviewPending,true);assert.equal(destroyed,1);
 w.calculateVEF(true);assert.equal(d.querySelector('#finalVEF').textContent,'1.0010');
 assert.equal(Array.from(d.querySelectorAll('#tableBody tr .qualified')).filter(cell=>cell.textContent==='YES').length,20,'Document NO values are not final decisions');
 await select();d.querySelector('#pdfPage').value='2';d.querySelector('#pdfPage').dispatchEvent(new w.Event('change'));await tick();assert.match(d.querySelector('#photoStatus').textContent,/local OCR/);
 for(const [f,b] of Object.entries({port:[0,25],date:[25,45],cargo:[45,65],ship:[65,82],bl:[82,100]}))for(const [i,edge] of ['start','end'].entries())d.querySelector('#photo-'+f+'-'+edge).value=b[i];
 d.querySelector('#photoRead').click();await tick();assert.equal(ocrCalls,5);assert.equal(d.querySelectorAll('#photoRows input').length,1);assert.match(d.querySelector('#photoRows').textContent,/PDF OCR.*page 2/);
 d.querySelector('#photoCancel').click();assert.equal(d.querySelectorAll('#tableBody tr').length,21);assert.equal(destroyed,2);
 dom.window.close();console.log('PASS: PDF digital route: 20 preview rows / zero OCR / explicit editable append / review gate; scan page route: five OCR columns / cancellation / PDF cleanup.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
