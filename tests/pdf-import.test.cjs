const {test}=require('node:test');const assert=require('node:assert/strict');
const pdf=require('../pdf-import.js'),parser=require('../photo-import.js');
const w=(text,x,y=40,width=text.length*5,h=10)=>({text,x,y,w:width,h,conf:100});
const header=[w('VOY',10),w('PORT',50),w('/',75),w('TERMINAL',85),w('B/L',190),w('DATE',215),w('CARGO',300),w("SHIP'S",410,20),w('FIGURES',407,60),w('B/L',520,20),w('FIGURES',510,60),w('Qualified',700),w('Difference',620)];
function table(){return [...header,...['STS','DryDock'].flatMap((port,i)=>[w(String(i+1),10,85+i*20),w(port,60,85+i*20),w('03/04/2026',190,85+i*20),w('OIL',300,85+i*20),w('1001.000',407,85+i*20),w('1000.000',510,85+i*20),w('NO',710,85+i*20)]),w('TOTALS:',300,140),w('99999.000',407,140),w('Dry Dock excluded',50,170)];}
test('digital header detection, data crop, whitelist; Voyage / Qualified / exclusion notes ignored',()=>{
 const words=table(),s=pdf.detectTable(words,800,200);assert.ok(s);s.options.numberMode='dot';
 const rows=pdf.extract(words,800,200,s);assert.equal(rows.length,2);
 for(const r of rows){assert.equal(r.ship,'1001');assert.equal(r.bl,'1000');assert.equal(r.date,'2026-04-03');assert.equal(r.manualExclude,false);assert.equal(r.reason,'');assert.equal(r.qualified,undefined);assert.equal(r.voyage,undefined);}
 assert.equal(rows[0].port,'STS');assert.equal(rows[1].port,'DryDock');
});
test('digital text is preferred; absent or incomplete headers require explicit mapping',()=>{
 assert.equal(pdf.hasTableText(table()),true);assert.equal(pdf.hasTableText([w('Page 1 footer',10)]),false);
 assert.equal(pdf.detectTable([w('SHIP',10),w('DATE',50)],800,200),null);
 const s={regions:{ship:[50,60],bl:[60,72]},options:{top:40,bottom:60,numberMode:'dot'}};
 const rows=pdf.extract(table(),800,200,s);assert.equal(rows.length,2);assert.equal(rows[0].port,'');
});
test('ambiguous decimal convention remains blank even for selectable PDF text',()=>{
 const s=pdf.detectTable(table(),800,200);const rows=pdf.extract(table(),800,200,s);
 assert.equal(rows[0].ship,'');assert.match(rows[0].warnings.join(' '),/1001.000/);
});
test('PDF.js coordinates: viewport transform, split text, ignore empty whitespace',()=>{
 const viewport={transform:[2,0,0,-2,0,400],scale:2};
 const words=pdf.textWords([{str:'PORT ONE',width:40,height:10,transform:[10,0,0,10,20,150]},{str:' ',width:5,height:0,transform:[1,0,0,1,0,0]}],viewport);
 assert.equal(words.length,2);assert.equal(words[0].text,'PORT');assert.equal(words[1].text,'ONE');
 assert.equal(words[0].x,40);assert.equal(words[0].y,80);assert.equal(words[0].h,20);assert.equal(words[0].conf,100);
});
test('strip only long table rules inside mapped area; preserve isolated text pixels',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4).fill(255);
 function black(x,y){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 for(let x=10;x<90;x++)black(x,50);for(let y=10;y<90;y++)black(50,y);
 black(30,30);black(2,2);
 const result=parser.removeTableRules({width,height,data},{ship:[10,90]},{top:10,bottom:90});
 assert.ok(result.rows);assert.ok(result.columns);assert.equal(data[(50*width+30)*4],255);assert.equal(data[(30*width+50)*4],255);
 assert.equal(data[(30*width+30)*4],0);assert.equal(data[(2*width+2)*4],0);
});
test('column OCR preserves source coordinates and only recognizes assigned fields',async()=>{
 let calls=0;const crops=[];
 const canvas={width:1000,height:200},settings={regions:{ship:[65,82],bl:[82,100]},options:{top:20,bottom:80,numberMode:'dot'}};
 const make=(width,height)=>({width,height,getContext:()=>({drawImage:(...args)=>crops.push(args.slice(1))})});
 const worker={recognize:async()=>{calls++;return {data:{tsv:'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'+[5,1,1,1,1,1,10,5,50,10,96,'1000'].join('\t')}};}};
 const tsv=await parser.recognizeColumns(canvas,settings,worker,make);
 const rows=parser.parse(tsv,1000,200,settings.regions,settings.options);
 assert.equal(calls,2);assert.equal(rows.length,1);assert.equal(rows[0].ship,'1000');assert.equal(rows[0].bl,'1000');assert.equal(rows[0].port,'');assert.deepEqual(crops[0].slice(0,4),[650,40,170,120]);
});
test('a text-only page footer date does not misclassify a scanned table as digital',()=>{
 assert.equal(pdf.hasTableText([w('01/10/2026',20),w('Page',100),w('1',140)]),false);
});
