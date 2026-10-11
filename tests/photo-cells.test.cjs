const {test}=require('node:test');
const assert=require('node:assert/strict');
const {detectPhotoRows,recognizePhotoCells}=require('../photo-import.js');
function fixture(n=20){
 const width=500,height=600,data=new Uint8ClampedArray(width*height*4);data.fill(255);
 for(let y=50;y<=50+n*20;y+=20)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 return {width,height,data};
}
const settings={regions:{port:[0,20],date:[20,40],cargo:[40,60],ship:[60,80],bl:[80,100]},options:{top:8,bottom:76,numberMode:'dot'},evidence:{firstY:80,lastY:440,footerTop:460}};
test('horizontal geometry yields 20 bands; missing first OCR quantity does not discard its row; totals excluded',()=>{
 const bands=detectPhotoRows(fixture(),settings);assert.equal(bands.length,20);assert.deepEqual(bands[0],{top:52,bottom:68});assert.equal(bands.at(-1).bottom,448);
});
test('row count is derived from geometry, never hardcoded to 20',()=>{
 const s={...settings,evidence:{lastY:100,footerTop:120},options:{top:8,bottom:20}};assert.equal(detectPhotoRows(fixture(3),s).length,3);
});
test('absent or missing horizontal rules require fallback, not OCR-fragment row guessing',()=>{
 const p=fixture();p.data.fill(255);assert.equal(detectPhotoRows(p,settings),null);
 const q=fixture();for(let x=0;x<q.width;x++){const i=(110*q.width+x)*4;q.data[i]=q.data[i+1]=q.data[i+2]=255;}assert.equal(detectPhotoRows(q,settings),null);
});
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
const word=(text,conf=96,x=12,y=12)=>[5,1,1,1,1,1,x,y,20,12,conf,text].join('\t');
function makeCanvas(width,height){return {width,height,getContext(){return {fillRect(){},drawImage(){},getImageData(){const data=new Uint8ClampedArray(width*height*4);data.fill(255);return {width,height,data};},putImageData(){}};}};}
test('cell OCR locks split fragments and empty cells to their geometric voyage; no phantom rows or decisions',async()=>{
 const p=fixture(),bands=detectPhotoRows(p,settings);let calls=0;
 const worker={setParameters:async()=>{},recognize:async()=>{const i=calls++,row=Math.floor(i/5),field=i%5;const text=['PORT','01/01/2026','OIL','1001.25','1000.25'][field];return {data:{tsv:header+(row===5&&field===1?'':field===0?word('PORT')+'\n'+word('TERMINAL',96,12,30):word(text))}};}};
 const rows=await recognizePhotoCells(makeCanvas(p.width,p.height),settings,bands,worker,makeCanvas);
 assert.equal(calls,100);assert.equal(rows.length,20);assert.equal(rows[5].date,'');assert.equal(rows[6].date,'2026-01-01');assert.equal(rows[5].port,'PORT TERMINAL');
 for(let i=0;i<20;i++){assert.equal(rows[i].sourceRow,i+1);assert.equal(rows[i].manualExclude,false);assert.equal(rows[i].qualified,undefined);assert.equal(rows[i].voyage,undefined);}
});
test('cell OCR keeps low-confidence numeric values and malformed / ambiguous quantities blank',async()=>{
 let calls=0;const worker={setParameters:async()=>{},recognize:async()=>{const field=calls++%5;return {data:{tsv:header+word(['PORT','01/01/2026','OIL','1001.25','1000.000'][field],field===3?84:96)}};}};
 const rows=await recognizePhotoCells(makeCanvas(500,600),{...settings,options:{...settings.options,numberMode:'auto'}},[{top:52,bottom:68}],worker,makeCanvas);
 assert.equal(rows[0].ship,'');assert.equal(rows[0].bl,'');assert.equal(rows[0].raw.ship,'1001.25');assert.equal(rows[0].date,'2026-01-01');
});
for(const agree of [true,false])test('low-confidence retry requires exact text agreement: '+agree,async()=>{
 let calls=0;const responses=[word('PORT',65),word(agree?'PORT':'OTHER',96),word('01/01/2026'),word('OIL'),word('1001.25'),word('1000.25')];
 const worker={setParameters:async()=>{},recognize:async()=>({data:{tsv:header+responses[calls++]}})};
 const rows=await recognizePhotoCells(makeCanvas(500,600),settings,[{top:52,bottom:68}],worker,makeCanvas);
 assert.equal(calls,6);assert.equal(rows[0].port,agree?'PORT':'');assert.equal(rows[0].raw.port,'PORT');assert.equal(rows[0].ship,'1001.25');
});
test('photo column refinement uses header anchors and continuous rules; Voyage column stays outside Port',()=>{
 const {refinePhotoCellColumns}=require('../photo-import.js'),width=650,height=500,data=new Uint8ClampedArray(width*height*4);data.fill(210);
 for(let i=3;i<data.length;i+=4)data[i]=255;
 for(const x of [10,100,200,300,400,500,600])for(let y=40;y<470;y++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 const fields=['port','date','cargo','ship','bl'],anchors=Object.fromEntries(fields.map((f,i)=>[f,{x:120+i*100,right:180+i*100}]));
 const s=refinePhotoCellColumns({width,height,data},{...settings,anchors},[{top:52,bottom:68},{top:432,bottom:448}]);
 assert.equal(s.options.cellBinarize,true);assert.equal(s.regions.port[0]*width/100,100);assert.equal(s.regions.port[1]*width/100,200);assert.equal(s.regions.bl[1]*width/100,600);
});
test('local cell-border fit excludes a continuous rule without following isolated text pixels',()=>{
 const {fitPhotoCellBounds}=require('../photo-import.js'),width=100,height=70,data=new Uint8ClampedArray(width*height*4);data.fill(255);
 for(let y=10;y<60;y++)for(const x of [19,20,21,79,80,81]){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 for(let y=25;y<35;y++){const i=(y*width+30)*4;data[i]=data[i+1]=data[i+2]=0;}
 const b=fitPhotoCellBounds({width,height,data},{left:23,right:77,top:12,bottom:58});assert.equal(b.left,24);assert.equal(b.right,76);
});
