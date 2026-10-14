const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../photo-import.js');
const read=(raw,key,conf=0)=>({raw,variant:key,treatment:key,pixelKey:key,words:[{text:raw,conf}]});
const families=(...values)=>[0,1].map(i=>values.flatMap(raw=>[0,1].map(j=>read(raw,raw+':'+i+':'+j))));
const plan=(...values)=>p.photoGlyphPlan(families(...values),'ship',{numberMode:'dot'});
const glyph=(at,raw,key,kind,conf=92)=>({at,raw,key,kind,words:[{text:raw,conf}]});
const support=(at,ch)=>[glyph(at,ch,'pixel-a','gaussian'),glyph(at,ch,'pixel-b','gaussian'),glyph(at,ch,'pixel-c','median')];

test('local glyph evidence recovers an observed valid quantity despite zero whole-word confidence',()=>{
 const q=plan('1205.125','1209.125');assert.deepEqual(q.positions,[3]);
 const r=p.reconcilePhotoGlyphs(q,support(3,'5'));assert.equal(r.value,'1205.125');assert.equal(r.raw,'1205.125');
});
test('glyph plan covers every compatible repeated alternative, not just the top two',()=>{
 const q=plan('1205.125','1209.125','1205.135');assert.deepEqual(q.positions,[3,6]);
 assert.equal(p.reconcilePhotoGlyphs(q,support(3,'5')),null);
 assert.equal(p.reconcilePhotoGlyphs(q,[...support(3,'5'),...support(6,'2')]).value,'1205.125');
});
test('the disputed character must select one whole-cell candidate; no invented quantity',()=>{
 const q=plan('1205.125','1209.125');assert.equal(p.reconcilePhotoGlyphs(q,support(3,'8')),null);
});
test('same bitmap or same filtering family cannot manufacture glyph agreement',()=>{
 const q=plan('1205.125','1209.125');
 assert.equal(p.reconcilePhotoGlyphs(q,support(3,'5').map(r=>({...r,key:'same-pixels'}))),null);
 assert.equal(p.reconcilePhotoGlyphs(q,support(3,'5').map(r=>({...r,kind:'gaussian'}))),null);
});
test('contradictory repeated weak glyphs and confident singleton glyphs keep the cell unresolved',()=>{
 const q=plan('1205.125','1209.125'),good=support(3,'5');
 assert.equal(p.reconcilePhotoGlyphs(q,[...good,glyph(3,'9','alt-a','gaussian',0),glyph(3,'9','alt-b','median',0)]),null);
 assert.equal(p.reconcilePhotoGlyphs(q,[...good,glyph(3,'9','alt-a','median',95)]),null);
 assert.equal(p.reconcilePhotoGlyphs(q,[...good,glyph(3,'9','pixel-a','gaussian')]),null);
});
test('letter/digit ambiguity, missing characters, separator conventions and impossible dates cannot be guessed',()=>{
 assert.equal(p.photoGlyphPlan(families('AREA S','AREA 5'),'port',{}),null);
 assert.equal(p.photoGlyphPlan(families('GRADE 95','GRADE 9S'),'cargo',{}),null);
 assert.equal(plan('1205.125','1205125'),null);
 assert.equal(p.photoGlyphPlan(families('1.234','1,234'),'ship',{numberMode:'auto'}),null);
 assert.equal(p.photoGlyphPlan(families('31/02/2026','30/02/2026'),'date',{dateOrder:'dmy'}),null);
});
test('text and calendar recovery use observed candidates rather than dictionaries or date repairs',()=>{
 const q=p.photoGlyphPlan(families('EAST DOCK','EAST DACK'),'port',{});
 assert.equal(p.reconcilePhotoGlyphs(q,support(q.positions[0],'O')).value,'EAST DOCK');
 const d=p.photoGlyphPlan(families('03-04-2026','03-03-2026'),'date',{dateOrder:'dmy'});
 assert.equal(p.reconcilePhotoGlyphs(d,support(d.positions[0],'4')).value,'2026-04-03');
});
function canvas(width,height){return {width,height,getContext(){return {fillRect(){},drawImage(){},getImageData(){return {width,height,data:new Uint8ClampedArray(width*height*4).fill(255)};},putImageData(){}};}};}
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
test('missing or out-of-cell symbol boxes cannot trigger guessed glyph crops; retries remain bounded',async()=>{
 for(const box of [undefined,'1 -1 10 20 30 0']){
  let calls=0;const settings=[];
  const worker={setParameters:async x=>settings.push(x),recognize:async()=>{calls++;return {data:{tsv:header+[5,1,1,1,1,1,10,10,60,20,95,'1205.125'].join('\t'),box}};}};
  const bounds={left:110,right:190,top:10,bottom:30},before={...bounds};
  assert.equal(await p.recognizePhotoGlyphs(canvas(500,100),bounds,families('1205.125','1209.125'),'ship',{numberMode:'dot'},worker,canvas),null);
  assert.deepEqual(bounds,before);assert.ok(calls<=4);assert.ok(settings.every(x=>x.tessedit_pageseg_mode==='7'));
 }
});
