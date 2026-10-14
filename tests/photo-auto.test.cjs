const {test}=require('node:test');
const assert=require('node:assert/strict');
const {detectPhotoTable,parse,detectPhotoColumns}=require('../photo-import.js');
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
const word=(x,y,text,conf=96,w=text.length*6)=>({x,y,text,conf,w,h:15});
const tsv=words=>header+words.map(w=>[5,1,1,1,1,1,w.x,w.y,w.w,w.h,w.conf,w.text].join('\t')).join('\n');
const headers=[word(10,30,'VOY'),word(70,30,'PORT'),word(115,30,'TERMINAL'),word(280,30,'B/L'),word(310,30,'DATE'),word(490,30,'CARGO'),word(660,10,"SHIP'S"),word(660,50,'FIGURES'),word(850,10,'B/L'),word(850,50,'FIGURES'),word(960,30,'Qualified')];
const data=[word(80,100,'STS'),word(290,100,'03/04/2026'),word(490,100,'OIL'),word(660,100,'1001.25'),word(850,100,'1000.00'),word(10,100,'17'),word(960,100,'NO'),word(80,130,'Dry Dock'),word(290,130,'04/04/2026'),word(490,130,'OIL'),word(660,130,'1999.5'),word(850,130,'2000.00'),word(10,130,'18'),word(960,130,'YES')];
test('automatic photo geometry requires no manual mapping and ignores document decisions / totals / footer',()=>{
 const all=[...headers,...data,word(80,165,'TOTAL'),word(660,165,'3000.75'),word(850,165,'3000.00'),word(80,200,'First voyage after Dry Dock')];
 const s=detectPhotoTable(tsv(all),1100,250);assert.ok(s);
 const rows=parse(tsv(all),1100,250,s.regions,{...s.options,numberMode:'dot'});
 assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>[r.port,r.date,r.cargo,r.ship,r.bl]),[['STS','2026-04-03','OIL','1001.25','1000'],['Dry Dock','2026-04-04','OIL','1999.5','2000']]);
 for(const r of rows){assert.equal(r.manualExclude,false);assert.equal(r.reason,'');assert.equal(r.voyage,undefined);assert.equal(r.qualified,undefined);}
});
test('partial available headers leave absent Cargo blank; low-confidence cells and ambiguous separators remain blank',()=>{
 const s=detectPhotoTable(tsv([...headers.filter(w=>w.text!=='CARGO'),...data]),1100,250);assert.ok(s);assert.equal(s.regions.cargo,undefined);
 const bad=data.map(w=>({...w,conf:w.text==='1001.25'?20:w.conf,text:w.text==='2000.00'?'2000.000':w.text}));
 const rows=parse(tsv([...headers,...bad]),1100,250,s.regions,{...s.options,numberMode:'auto'});
 assert.equal(rows[0].cargo,'');assert.equal(rows[0].ship,'');assert.equal(rows[1].bl,'');assert.ok(rows[0].warnings.length);
});
test('unknown / incomplete headers and title metadata without voyage evidence return safe fallback',()=>{
 assert.equal(detectPhotoTable(tsv(data),1100,250),null);
 assert.equal(detectPhotoTable(tsv(headers),1100,250),null);
 assert.equal(detectPhotoTable(tsv([...headers.filter(w=>w.text!=="SHIP'S"),...data]),1100,250),null);
 const title=[word(450,0,'PORT'),word(510,0,'OF'),word(550,0,'LOADING'),word(560,20,'DATE'),word(660,40,"SHIP'S"),word(850,40,'B/L')];
 assert.equal(detectPhotoTable(tsv([...title,...data]),1100,250),null);
});
test('grid rules split a merged VOY|PORT header into the actual Port cell',()=>{
 const width=1100,height=250,pixels={width,height,data:new Uint8ClampedArray(width*height*4)};pixels.data.fill(255);
 for(const x of [5,65,260,460,640,825,945,1090])for(let y=0;y<160;y++){const i=(y*width+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=0;}
 const h=headers.filter(w=>!['VOY','PORT'].includes(w.text));h.push(word(10,30,'VOY|PORT',96,100));
 const s=detectPhotoTable(tsv([...h,...data,word(70,165,'TOTAL')]),width,height,pixels);assert.ok(s);
 assert.deepEqual(s.regions.port,[65/width*100,260/width*100]);
 const rows=parse(tsv(data),width,height,s.regions,{...s.options,numberMode:'dot'});assert.equal(rows[0].port,'STS');
});
test('automatic discovery performs one sparse OCR pass on a disposable image before column OCR',async()=>{
 const calls=[],pixels={width:2,height:2,data:new Uint8ClampedArray(16)};pixels.data.fill(255);
 const canvas={width:2,height:2,getContext:()=>({getImageData:()=>pixels,putImageData:()=>calls.push('copy')})};
 const w={setParameters:async p=>calls.push(p.tessedit_pageseg_mode),recognize:async(c,o,output)=>{assert.equal(c,canvas);assert.equal(output.tsv,true);calls.push('ocr');return {data:{tsv:'test'}};}};
 assert.equal(await detectPhotoColumns(canvas,w),'test');assert.deepEqual(calls,['copy','11','ocr']);
});
test('header geometry works without grid lines, including BIL / combined headings and VOY|PORT',()=>{
 const h=headers.filter(w=>!['VOY','PORT','B/L','DATE'].includes(w.text));
 h.push(word(10,30,'VOY|PORT',96,100),word(280,30,'B/LDATE',96,80),word(850,10,'BIL',6,20));
 const s=detectPhotoTable(tsv([...h,...data]),1100,250);assert.ok(s);assert.ok(s.regions.port);assert.ok(s.regions.bl);
 const r=parse(tsv(data),1100,250,s.regions,{...s.options,numberMode:'dot'});assert.equal(r.length,2);assert.equal(r[0].port,'STS');assert.equal(r[0].bl,'1000');
 // A weak BIL token without its corroborating FIGURES anchor must not map a quantity column.
 assert.equal(detectPhotoTable(tsv([...h.filter(w=>!(w.text==='FIGURES' && w.x===850)),...data]),1100,250),null);
});
test('header aliases affect positions only; low-confidence data is still blank and cell text is never repaired',()=>{
 const s=detectPhotoTable(tsv([...headers,...data]),1100,250);assert.ok(s);
 const values=data.map(w=>w.text==='OIL'?{...w,text:'BIL'}:w.text==='1001.25'?{...w,conf:84}:w);
 const rows=parse(tsv(values),1100,250,s.regions,{...s.options,numberMode:'dot'});
 assert.equal(rows[0].cargo,'BIL');assert.equal(rows[0].ship,'');assert.equal(rows[0].raw.ship,'1001.25');
});
test('incompatible vertical rules retry semantic header boundaries instead of aborting a readable table',()=>{
 const width=1100,height=250,pixels={width,height,data:new Uint8ClampedArray(width*height*4)};pixels.data.fill(255);
 for(const x of [65,1050])for(let y=0;y<height;y++){const i=(y*width+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=0;}
 const s=detectPhotoTable(tsv([...headers,...data]),width,height,pixels);assert.ok(s);
 const rows=parse(tsv(data),width,height,s.regions,{...s.options,numberMode:'dot'});assert.equal(rows.length,2);assert.equal(rows[0].ship,'1001.25');assert.equal(rows[0].bl,'1000');
});

for(const label of ['B/L FIGURES','BL FIGURES','B/L QTY','SHORE FIGURES','SHORE QTY','shore figures','Shore Qty','SHOREFIGURES','BLQTY'])test('photo reference-quantity header alias: '+label,()=>{
 const h=headers.filter(w=>!(w.x===850 && w.y<100));
 const tokens=label.split(' ');h.push(...tokens.map((text,i)=>word(850,i?50:10,text,96,tokens.length===1?90:text.length*6)));
 const detected=detectPhotoTable(tsv([...h,...data]),1100,250);assert.ok(detected);
 const rows=parse(tsv(data),1100,250,detected.regions,{...detected.options,numberMode:'dot'});
 assert.equal(rows[0].date,'2026-04-03');assert.equal(rows[0].ship,'1001.25');assert.equal(rows[0].bl,'1000');
});

const semanticFields=['port','cargo','date','ship','bl'];
function semanticFixture(order,labels={}){
 const names={port:'PORT / TERMINAL',cargo:'PRODUCT',date:'DATE',ship:'SF TCV',bl:'BoL TCV',...labels};
 const values={port:'NORTH TERMINAL',cargo:'OIL',date:'02-01-2026',ship:'1200.25',bl:'1200.00'};
 const h=order.map((f,i)=>word(40+i*200,30,names[f],96,110));
 const cells=order.flatMap((f,i)=>[word(40+i*200,100,values[f]),word(40+i*200,130,values[f])]);
 return {text:tsv([...h,...cells,word(40,165,'TOTAL')]),order};
}
test('semantic fields follow header positions in every column permutation',()=>{
 const permutations=a=>a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[v,...p])):[[]];
 for(const order of permutations(semanticFields)){
  const {text}=semanticFixture(order),s=detectPhotoTable(text,1100,250);assert.ok(s,order.join(','));
  const rows=parse(text,1100,250,s.regions,{...s.options,numberMode:'dot'});
  assert.equal(rows.length,2);assert.deepEqual([rows[0].port,rows[0].date,rows[0].cargo,rows[0].ship,rows[0].bl],['NORTH TERMINAL','2026-01-02','OIL','1200.25','1200']);
 }
});
for(const ship of ["SHIP'S FIGURES",'SHIP FIGURES','VESSEL FIGURES','SF TCV','shipfigures','SFTCV'])for(const bl of ['B/L FIGURES','BL FIGURES','SHORE FIGURES','BoL TCV','B/L QTY','SHORE QTY'])test('semantic reordered aliases '+ship+' / '+bl,()=>{
 const {text}=semanticFixture(['bl','cargo','date','port','ship'],{ship,bl}),s=detectPhotoTable(text,1100,250);assert.ok(s);
 const rows=parse(text,1100,250,s.regions,{...s.options,numberMode:'dot'});assert.equal(rows[0].ship,'1200.25');assert.equal(rows[0].bl,'1200');
});
test('cropped optional Port stays unmapped; Cargo before bare DATE does not block quantity headers',()=>{
 const {text}=semanticFixture(['cargo','date','ship','bl']),s=detectPhotoTable(text,1100,250);assert.ok(s);assert.equal(s.regions.port,undefined);
 assert.ok(s.regions.cargo);assert.ok(s.regions.date);assert.ok(s.regions.ship);assert.ok(s.regions.bl);
});
test('semantic header aliases without paired quantity evidence never authorize a table',()=>{
 const {text}=semanticFixture(['bl','cargo','date','port','ship']);assert.equal(detectPhotoTable(text.split('\n').slice(0,6).join('\n'),1100,250),null);
});

test('same-line spaced header words pair by adjacent text geometry, not only centre alignment',()=>{
 const h=[word(40,30,'PRODUCT'),word(240,30,'DATE'),word(440,30,"SHIP'S",96,90),word(555,30,'FIGURES',96,130),word(840,30,'B/L',96,40),word(910,30,'FIGURES',96,130)];
 const body=[word(240,100,'02-01-2026'),word(440,100,'1200.25'),word(840,100,'1200.00')];
 const s=detectPhotoTable(tsv([...h,...body]),1100,250);assert.ok(s);assert.ok(s.regions.ship);assert.ok(s.regions.bl);
});
test('short preprocessed header retry maps padded/scaled OCR coordinates back to source geometry',async()=>{
 const width=1100,height=250;function canvas(w,h){return {width:w,height:h,getContext:()=>({drawImage(){},fillRect(){},getImageData(){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4).fill(255)};},putImageData(){}})};}
 const heads=[word(40,90,'PRODUCT'),word(240,90,'DATE'),word(440,90,'SF TCV',96,100),word(640,90,'BoL TCV',96,100)];
 const body=[word(240,150,'02-01-2026'),word(440,150,'1200.25'),word(640,150,'1200.00')];
 const initial=tsv([heads[1],...body]);const top=30,bottom=148,scale=Math.min(4,Math.max(1,200/(bottom-top)),1800/width);
 const transformed=heads.map(w=>({...w,x:w.x*scale+12,y:(w.y-top)*scale+12,w:w.w*scale,h:w.h*scale}));let calls=0;
 const worker={setParameters:async()=>{},recognize:async()=>({data:{tsv:++calls===1?initial:calls===2?'':tsv(transformed)}})};
 const result=await detectPhotoColumns(canvas(width,height),worker,canvas),settings=detectPhotoTable(result,width,height);
 assert.equal(calls,3);assert.ok(settings);assert.ok(Math.abs(settings.anchors.cargo.x-40)<.001);assert.ok(Math.abs(settings.anchors.cargo.y-90)<.001);
});

test('header grid cells are detected from row/column rules with no fixed order or percentages',()=>{
 const {photoHeaderCells}=require('../photo-import.js'),width=500,height=450,data=new Uint8ClampedArray(width*height*4).fill(255);
 const ink=(x,y)=>{const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;};
 for(const y of [20,100,130,160,190,220,250,280])for(let x=10;x<=490;x++)ink(x,y);
 for(const x of [10,100,250,350,490])for(let y=20;y<=280;y++)ink(x,y);
 const cells=photoHeaderCells({width,height,data});assert.equal(cells.length,4);assert.deepEqual(cells[0],{left:12,right:98,top:22,bottom:98});assert.equal(cells[3].right,488);
 data.fill(255);assert.deepEqual(photoHeaderCells({width,height,data}),[]);
});

test('a valid partial table still retries its observed header cells to recover an unread optional header',async()=>{
 const width=500,height=450,source=new Uint8ClampedArray(width*height*4).fill(255);
 const ink=(x,y)=>{const i=(y*width+x)*4;source[i]=source[i+1]=source[i+2]=0;};
 for(const y of [20,100,130,160,190,220,250,280])for(let x=10;x<=490;x++)ink(x,y);
 for(const x of [10,100,200,300,400,490])for(let y=20;y<=280;y++)ink(x,y);
 function canvas(w,h){const data=w===width&&h===height?new Uint8ClampedArray(source):new Uint8ClampedArray(w*h*4).fill(255);return {width:w,height:h,getContext:()=>({drawImage(){},fillRect(){},getImageData:()=>({width:w,height:h,data:new Uint8ClampedArray(data)}),putImageData(){}})};}
 const initial=tsv([word(110,50,'DATE',96,40),word(210,50,'CARGO',96,50),word(310,50,'SFTCV',96,60),word(410,50,'BoLTCV',96,60),word(310,115,'1200.25',96,60),word(410,115,'1200.00',96,60)]);
 assert.equal(detectPhotoTable(initial,width,height).regions.port,undefined);
 let calls=0;const worker={setParameters:async()=>{},recognize:async()=>({data:{tsv:++calls===1?initial:tsv([word(20,50,'PORT/TERMINAL',96,65)])}})};
 const result=await detectPhotoColumns(canvas(width,height),worker,canvas),settings=detectPhotoTable(result,width,height);
 assert.equal(calls,6);assert.ok(settings.regions.port);assert.ok(settings.anchors.port.x<100);
});
