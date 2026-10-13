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
function makeCanvas(width,height){const c={width,height,getContext(){return {fillRect(){},drawImage(...args){c.sourceLeft=args[1];c.sourceTop=args[2];},getImageData(){const data=new Uint8ClampedArray(width*height*4);data.fill(255);return {width,height,data};},putImageData(){}};}};return c;}
test('cell OCR locks split fragments and empty cells to their geometric voyage; no phantom rows or decisions',async()=>{
 const p=fixture(),bands=detectPhotoRows(p,settings);let calls=0;
 const worker={setParameters:async()=>{},recognize:async c=>{calls++;const row=Math.round((c.sourceTop-52)/20),field=Math.floor(c.sourceLeft/100);const text=['PORT','01/01/2026','OIL','1001.25','1000.25'][field];return {data:{tsv:header+(row===5&&field===1?'':field===0?word('PORT')+'\n'+word('TERMINAL',96,12,30):word(text))}};}};
 const rows=await recognizePhotoCells(makeCanvas(p.width,p.height),settings,bands,worker,makeCanvas);
 assert.ok(calls>=200 && calls<=235,'Bounded confirmation reads, with extra retries only for the missing cell');assert.equal(rows.length,20);assert.equal(rows[5].date,'');assert.equal(rows[6].date,'2026-01-01');assert.equal(rows[5].port,'PORT TERMINAL');
 for(let i=0;i<20;i++){assert.equal(rows[i].sourceRow,i+1);assert.equal(rows[i].manualExclude,false);assert.equal(rows[i].qualified,undefined);assert.equal(rows[i].voyage,undefined);}
});
test('cell OCR keeps low-confidence numeric values and malformed / ambiguous quantities blank',async()=>{
 let field=0;const worker={setParameters:async p=>{if(p.tessedit_char_whitelist)field=p.tessedit_char_whitelist.includes('A')?0:p.tessedit_char_whitelist.includes('-')?1:3;},recognize:async()=>({data:{tsv:header+word(field===3?'1001.25':field===1?'01/01/2026':'PORT',field===3?5:96)}})};
 const rows=await recognizePhotoCells(makeCanvas(500,600),{...settings,options:{...settings.options,numberMode:'auto'}},[{top:52,bottom:68}],worker,makeCanvas);
 assert.equal(rows[0].ship,'');assert.equal(rows[0].bl,'');assert.equal(rows[0].raw.ship,'1001.25');assert.equal(rows[0].date,'2026-01-01');
});
test('uncertain cell replacement requires two confident agreeing variants; conflicting reads stay blank',async()=>{
 for(const agree of [true,false]){
  let portReads=0,field='port';
  const worker={setParameters:async p=>{if(p.tessedit_char_whitelist)field=p.tessedit_char_whitelist.includes('A')?'port':p.tessedit_char_whitelist.includes('-')?'date':'ship';},recognize:async()=>{
   let text=field==='date'?'01/01/2026':field==='ship'?'1001.25':portReads++===0?'UNCERTAIN':agree?'PORT':'OTHER'+portReads;
   return {data:{tsv:header+word(text,text==='UNCERTAIN'?20:96)}};
  }};
  const rows=await recognizePhotoCells(makeCanvas(500,600),settings,[{top:52,bottom:68}],worker,makeCanvas);
  assert.equal(rows[0].port,agree?'PORT':'');assert.equal(rows[0].ship,'1001.25');
 }
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

test('photo convention inference needs independent confident unambiguous evidence; no majority over conflicts',()=>{
 const {inferPhotoNumberMode}=require('../photo-import.js');
 const row=(raw,reliable=true)=>({raw:{ship:raw,bl:''},ocrReliable:{ship:reliable,bl:false}});
 assert.equal(inferPhotoNumberMode([row('6431.190'),row('5451.611'),row('6362.576')]),'dot');
 assert.equal(inferPhotoNumberMode([row('6431,190'),row('5451,611'),row('6362,576')]),'comma');
 assert.equal(inferPhotoNumberMode(Array(20).fill(row('1.234'))),'auto');
 assert.equal(inferPhotoNumberMode([row('6431.190'),row('5451.611'),row('6362.576',false)]),'auto');
 assert.equal(inferPhotoNumberMode([row('6431.190'),row('5451.611'),row('6362.576'),row('6362,576')]),'auto');
});
test('initial auto processing resolves and converts confident quantities within fixed rows; explicit correction wins',async()=>{
 for(const mode of ['auto','dot','comma']){
  let field=0;const params=[];
  const worker={setParameters:async p=>params.push(p),recognize:async c=>({data:{tsv:header+word(['PORT','01/01/2026','OIL','6431.190','6446.031'][Math.floor(c.sourceLeft/100)])}})};
  const rows=await recognizePhotoCells(makeCanvas(500,600),{...settings,options:{numberMode:mode}},[{top:52,bottom:68},{top:72,bottom:88}],worker,makeCanvas);
  assert.equal(rows.length,2);assert.equal(rows.numberMode,mode==='auto'?'dot':mode);
  assert.equal(rows[0].ship,mode==='comma'?'':'6431.19');assert.equal(rows[1].bl,mode==='comma'?'':'6446.031');
  assert.ok(params.some(p=>p.tessedit_char_whitelist==='0123456789-/.'));
  assert.ok(params.some(p=>p.tessedit_char_whitelist==='0123456789., '));
  assert.ok(params.some(p=>p.tessedit_char_whitelist?.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ')));
 }
});

test('confident isolated border punctuation is not accepted as a port suffix or date prefix',async()=>{
 let field='port';const worker={setParameters:async p=>{if(p.tessedit_char_whitelist)field=p.tessedit_char_whitelist.includes('A')?'port':p.tessedit_char_whitelist.includes('-')?'date':'ship';},recognize:async()=>({data:{tsv:header+word(field==='port'?'PORT -':field==='date'?'-01/01/2026':'1001.25')}})};
 const rows=await recognizePhotoCells(makeCanvas(500,600),settings,[{top:52,bottom:68}],worker,makeCanvas);
 assert.equal(rows[0].port,'');assert.equal(rows[0].date,'');assert.equal(rows[0].ship,'1001.25');
});

test('content retry crop removes peripheral border noise but preserves separators inside its own cell',()=>{
 const {photoCellContentBounds}=require('../photo-import.js');
 const width=100,height=40,data=new Uint8ClampedArray(width*height*4);data.fill(255);
 const ink=(x,y)=>{const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;};
 for(let y=0;y<height;y++)ink(1,y);
 for(let y=10;y<30;y++)for(const x of [30,31,32,50,51,52])ink(x,y);
 ink(42,27);ink(5,15);
 const original={left:0,right:100,top:0,bottom:40};const b=photoCellContentBounds({width,height,data},original);
 assert.ok(b.left>5 && b.left<=30);assert.ok(b.right>=53 && b.right<100);assert.ok(b.top>=0 && b.top<=10);assert.ok(b.bottom>=30 && b.bottom<=40);
 assert.ok(42>=b.left && 42<b.right && 27>=b.top && 27<b.bottom,'Internal decimal/separator pixels remain in the crop');
 const white={width,height,data:new Uint8ClampedArray(width*height*4).fill(255)};assert.deepEqual(photoCellContentBounds(white,original),original);
});
test('expanded retries cannot reach a neighboring column or voyage',async()=>{
 let field='port',samples=[];
 const worker={setParameters:async p=>{if(p.tessedit_char_whitelist)field=p.tessedit_char_whitelist.includes('A')?'port':p.tessedit_char_whitelist.includes('-')?'date':'ship';},recognize:async c=>{
  if(field==='port' && c.sourceLeft<100)samples.push([c.sourceLeft,c.sourceTop]);
  return {data:{tsv:header+(field==='port'?'':word(field==='date'?'01/01/2026':'1001.25'))}};
 }};
 const rows=await recognizePhotoCells(makeCanvas(500,600),settings,[{top:52,bottom:68},{top:72,bottom:88}],worker,makeCanvas);
 assert.equal(rows.length,2);assert.equal(rows[0].date,'2026-01-01');assert.equal(rows[1].date,'2026-01-01');
 assert.ok(samples.some(([x])=>x<3),'Expanded retry is actually attempted');
 for(const [x,y] of samples){assert.ok(x>=1 && x<100);assert.ok((y>=51 && y<=68) || (y>=71 && y<=88));}
});

test('two agreeing retries do not override a contradictory confident valid reading',async()=>{
 let field='port',n=0;
 const worker={setParameters:async p=>{if(p.tessedit_char_whitelist)field=p.tessedit_char_whitelist.includes('A')?'port':p.tessedit_char_whitelist.includes('-')?'date':'ship';},recognize:async()=>{
  if(field==='port'){n++;return {data:{tsv:header+word(n===1?'UNCERTAIN':n===2?'FIRST':'SECOND',n===1?50:96)}};}
  return {data:{tsv:header+word(field==='date'?'01/01/2026':'1001.25')}};
 }};
 const rows=await recognizePhotoCells(makeCanvas(500,600),settings,[{top:52,bottom:68}],worker,makeCanvas);
 assert.equal(rows[0].port,'');assert.ok(rows[0].warnings.some(w=>w.startsWith('Port')));assert.equal(rows[0].date,'2026-01-01');
});

test('port consensus accepts stable proper names with a weak word, without a name dictionary',()=>{
 const {portReadingConsensus}=require('../photo-import.js');
 const read=(raw,conf,variant,treatment=variant)=>({raw,variant,treatment,words:raw.split(' ').map((text,i)=>({text,conf:conf[i]}))});
 const stable=[read('NORTH TERMINAL',[55,88],'a'),read('NORTH TERMINAL',[45,91],'b'),read('NORTH TERMINAL',[30,90],'c')];
 assert.equal(portReadingConsensus(stable).raw,'NORTH TERMINAL');
 for(const r of stable){r.raw='SOUTH HARBOUR';r.words=r.raw.split(' ').map((text,i)=>({text,conf:i?90:55}));}
 assert.equal(portReadingConsensus(stable).raw,'SOUTH HARBOUR');
});
test('port consensus rejects conflicts, duplicate variants, identical pixels and weak-only agreement',()=>{
 const {portReadingConsensus}=require('../photo-import.js');
 const r=(raw='NORTH TERMINAL',conf=[55,88],variant='a',treatment=variant)=>({raw,variant,treatment,words:raw.split(' ').map((text,i)=>({text,conf:conf[i]}))});
 assert.equal(portReadingConsensus([r(),r(undefined,undefined,'b'),r('SOUTH TERMINAL',[55,88],'c')]),null);
 assert.equal(portReadingConsensus([r(),r(),r()]),null);
 assert.equal(portReadingConsensus([r('SOUTH TERMINAL'),r(),r(undefined,undefined,'b'),r(undefined,undefined,'c')]),null,'An earlier conflicting read cannot disappear when a variant key repeats');
 assert.equal(portReadingConsensus(['a','b','c'].map(v=>r(undefined,undefined,v,'same-pixels'))),null);
 for(const conf of [[0,99],[19,99],[39,99],[55,55]])assert.equal(portReadingConsensus(['a','b','c'].map(v=>r(undefined,conf,v))),null);
 assert.equal(portReadingConsensus([r(),r(undefined,undefined,'b')]),null);
 assert.equal(portReadingConsensus(['a','b','c'].map(v=>r('PORT -',[90,90],v))),null);
});
test('semantic consensus survives final assignment for moderate text/date/numeric confidence',async()=>{
 const fields=['port','date','cargo','ship','bl'];let field='port';
 const worker={setParameters:async p=>{if(p.tessedit_char_whitelist)field=p.tessedit_char_whitelist.includes('A')?'text':p.tessedit_char_whitelist.includes('-')?'date':'number';},recognize:async c=>{
  const f=fields[Math.floor(c.sourceLeft/100)];
  return {data:{tsv:header+(f==='port'||f==='cargo'?word('NORTH',55)+'\n'+word('TERMINAL',88,40):word(f==='date'?'01/01/2026':'1001.25',84))}};
 }};
 const rows=await recognizePhotoCells(makeCanvas(500,600),settings,[{top:52,bottom:68}],worker,makeCanvas);
 assert.equal(rows[0].port,'NORTH TERMINAL');assert.equal(rows[0].ocrReliable.port,true);
 assert.equal(rows[0].cargo,'NORTH TERMINAL');assert.equal(rows[0].date,'2026-01-01');assert.equal(rows[0].ship,'1001.25');assert.equal(rows[0].bl,'1001.25');
 assert.ok(rows[0].warnings.some(w=>w.includes('concordant')));assert.equal(rows[0].sourceRow,1);
});

test('missing optional header preserves all geometric voyages, blank review cells and no extra OCR',async()=>{
 const p=fixture(),s={...settings,regions:{date:[20,40],cargo:[40,60],ship:[60,80],bl:[80,100]}};
 const bands=detectPhotoRows(p,s);assert.equal(bands.length,20);let calls=0;
 const worker={setParameters:async()=>{},recognize:async c=>{calls++;const field=Math.floor(c.sourceLeft/100);return {data:{tsv:header+word(['','01/01/2026','OIL','1001.25','1000.25'][field])}};}};
 const rows=await recognizePhotoCells(makeCanvas(p.width,p.height),s,bands,worker,makeCanvas);
 assert.ok(calls>=160 && calls<=240);assert.equal(rows.length,20);
 rows.forEach((r,i)=>{assert.equal(r.port,'');assert.equal(r.sourceRow,i+1);assert.equal(r.date,'2026-01-01');assert.equal(r.ship,'1001.25');assert.ok(r.warnings.some(w=>w.includes('column not identified')));});
});

test('per-cell semantic validation accepts terminal punctuation and unambiguous date separators only',()=>{
 const {photoCellValue}=require('../photo-import.js');
 for(const raw of ['ULSD 10 PPM','GASOLINE 95 UNL.','PRODUCT (95%), TYPE-A'])assert.equal(photoCellValue(raw,'cargo'),raw);
 for(const raw of ['29-02-2024','29/02/2024','29.02.2024','29 - 02 - 2024'])assert.equal(photoCellValue(raw,'date',{dateOrder:'dmy'}),'2024-02-29');
 for(const raw of ['29-02-2023','31/04/2026','1-2-202','01-02/2026','PORT -'])assert.equal(photoCellValue(raw,raw.startsWith('PORT')?'port':'date'),'');
 assert.equal(photoCellValue('1,234.50','ship',{numberMode:'dot'}),'1234.5');assert.equal(photoCellValue('-123.5','bl',{numberMode:'dot'}),'');
});
test('moderate confidence needs independent valid cell agreement; conflict and weak-only reads stay flagged',()=>{
 const {photoCellConsensus}=require('../photo-import.js');
 const read=(raw,conf,k)=>({raw,variant:k,treatment:k,words:[{text:raw,conf}]});
 assert.equal(photoCellConsensus([read('04-03-2026',72,'a'),read('04/03/2026',75,'b'),read('04.03.2026',55,'c')],'date',{dateOrder:'dmy'}).value,'2026-03-04');
 assert.equal(photoCellConsensus([read('1001.25',72,'a'),read('1001.250',75,'b'),read('1001.25',55,'c')],'ship',{numberMode:'dot'}).value,'1001.25');
 assert.equal(photoCellConsensus([read('1001.25',84,'a')],'ship',{numberMode:'dot'}),null);
 assert.equal(photoCellConsensus([read('1001.25',72,'a'),read('1001.25',75,'b'),read('1001.25',55,'c'),read('1007.25',95,'d')],'ship',{numberMode:'dot'}),null);
 assert.equal(photoCellConsensus(['a','b','c'].map(k=>read('1001.25',0,k)),'ship',{numberMode:'dot'}),null);
});
test('row-local grid alignment follows only its own separators and never changes global mapping',()=>{
 const {photoRowCellRegions}=require('../photo-import.js'),width=500,height=100,data=new Uint8ClampedArray(width*height*4).fill(255);
 for(const x of [2,110,215,325,430,499])for(let y=20;y<80;y++){const at=(y*width+x)*4;data[at]=data[at+1]=data[at+2]=0;}
 const before=JSON.stringify(settings.regions),r=photoRowCellRegions({width,height,data},settings,{top:22,bottom:78});
 assert.equal(JSON.stringify(settings.regions),before);assert.equal(r.port[1]*width/100,110);assert.equal(r.date[0],r.port[1]);assert.equal(r.bl[0],r.ship[1]);
 data.fill(255);assert.deepEqual(photoRowCellRegions({width,height,data},settings,{top:22,bottom:78}),settings.regions);
});
test('adaptive threshold preserves image bounds and renders a local binary cell without neighboring pixels',()=>{
 const {adaptivePhotoCell}=require('../photo-import.js'),c=makeCanvas(40,40);assert.equal(adaptivePhotoCell(c),c);assert.equal(c.width,40);assert.equal(c.height,40);
});

test('photograph family validation requires independent moderate support and rejects supported alternatives',()=>{
 const {photoFamilyConsensus}=require('../photo-import.js');
 const read=(raw,conf,k)=>({raw,variant:k,treatment:k,words:[{text:raw,conf}]});
 const family=(raw,conf=90)=>['a','b','c'].map(k=>read(raw,conf,k));
 assert.equal(photoFamilyConsensus([family('1234.5')],'ship',{numberMode:'dot'}).value,'1234.5');
 assert.equal(photoFamilyConsensus([family('1234.5',72)],'ship',{numberMode:'dot'}),null);
 assert.equal(photoFamilyConsensus([family('1234.5',72),family('1234.500',74)],'ship',{numberMode:'dot'}).value,'1234.5');
 assert.equal(photoFamilyConsensus([family('1234.5'),family('1239.5')],'ship',{numberMode:'dot'}),null);
 const mixed=[...family('1234.5'),read('1239.5',91,'d'),read('1239.5',92,'e')];
 assert.equal(photoFamilyConsensus([mixed,family('1234.5')],'ship',{numberMode:'dot'}),null);
 assert.equal(photoFamilyConsensus([family('04/03/2026',72),family('04-03-2026',75)],'date',{dateOrder:'dmy'}).value,'2026-03-04');
 assert.equal(photoFamilyConsensus([[],[]],'port'),null);
});
test('native texture treatments use a bounded copy of the same cell and preserve the input geometry',()=>{
 const {nativePhotoCell}=require('../photo-import.js'),original=makeCanvas(500,600),bounds={left:102,right:198,top:52,bottom:68},before={...bounds};
 for(const kind of ['gaussian','median','binary'])for(const strength of [1,2]){
  const out=nativePhotoCell(original,bounds,makeCanvas,kind,strength);
  assert.equal(out.width,96);assert.equal(out.height,16);assert.equal(out.sourceLeft,102);assert.equal(out.sourceTop,52);
  assert.deepEqual(bounds,before);assert.notEqual(out,original);
 }
});
test('photograph native retries confirm moderate cells, remain bounded and do not override conflicting families',async()=>{
 for(const conflict of [false,true]){
  let field='',calls=0;
  const worker={setParameters:async()=>{},recognize:async c=>{
   calls++;let raw={port:'EAST TERMINAL',date:'09-05-2026',cargo:'PRODUCT 7',ship:'1205.25',bl:'1200.5'}[field];
   if(conflict && field==='bl' && c.sourceLeft===0)raw='1209.5';
   return {data:{tsv:header+word(raw,72)}};
  }};
  const rows=await recognizePhotoCells(makeCanvas(500,600),{...settings,options:{...settings.options,cellBinarize:true}},[{top:52,bottom:68}],worker,makeCanvas,(_i,_n,f)=>{field=f;});
  assert.equal(rows.length,1);assert.equal(rows[0].port,'EAST TERMINAL');assert.equal(rows[0].date,'2026-05-09');
  assert.equal(rows[0].ship,'1205.25');assert.equal(rows[0].bl,conflict?'':'1200.5');
  assert.ok(calls<=5*67,'Legacy and native cell reads have finite independent budgets');
  assert.equal(rows[0].manualExclude,false);assert.equal(rows[0].reason,'');assert.equal(rows[0].sourceRow,1);
 }
});
test('identical native pixels cannot masquerade as two independent moderate families',()=>{
 const {photoFamilyConsensus}=require('../photo-import.js');
 const family=()=>['a','b','c'].map(k=>({raw:'908.25',variant:k,treatment:k,pixelKey:'same-native-'+k,words:[{text:'908.25',conf:72}]}));
 assert.equal(photoFamilyConsensus([family(),family()],'ship',{numberMode:'dot'}),null);
});
