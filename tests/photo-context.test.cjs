const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../photo-import.js');
const families=(...values)=>[0,1].map(i=>values.flatMap(raw=>[0,1].map(j=>({raw,variant:raw+i+j,treatment:raw+i+j,pixelKey:raw+i+j,words:[{text:raw,conf:0}]}))));
const plan=(...values)=>p.photoGlyphPlan(families(...values),'ship',{numberMode:'dot'});
const support=(at,raw)=>['a','b','c'].map((key,i)=>({at,raw,key,kind:i===2?'median':'gaussian',words:[{text:raw,conf:92}]}));

test('partial glyph proof and context select an existing quantity rather than synthesize one',()=>{
 const q=plan('1205.125','1209.125','1209.135'),e=p.photoGlyphEvidence(q,support(3,'9'));
 assert.equal(e.conflict,false);assert.equal(e.resolved.get(3),'9');assert.equal(e.resolved.size,1);
 const ranges=p.photoGlyphSpanPlan(q,e);assert.deepEqual(ranges,[{at:6,left:5,right:7}]);
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,support(6,'135')).value,'1209.135');
 assert.equal(e.resolved.size,1,'Context must not mutate the preceding glyph evidence');
});
test('context retries only unresolved positions and stops at separators',()=>{
 const q=plan('1205.125','1209.135'),e=p.photoGlyphEvidence(q,support(3,'9'));
 assert.deepEqual(p.photoGlyphSpanPlan(q,e),[{at:6,left:5,right:7}]);
 const d=p.photoGlyphPlan(families('03-04-2026','03-03-2026'),'date',{dateOrder:'dmy'});
 assert.deepEqual(p.photoGlyphSpanPlan(d,{resolved:new Map(),conflict:false}),[{at:4,left:3,right:4}]);
 assert.equal(p.reconcilePhotoSpans(d,{resolved:new Map(),conflict:false},[{at:4,left:3,right:4}],support(4,'04')).value,'2026-04-03');
});
test('credible glyph contradictions block context; another segmentation mode cannot overwrite them',()=>{
 const q=plan('1205.125','1209.125'),e=p.photoGlyphEvidence(q,[...support(3,'5'),...support(3,'9').map(r=>({...r,key:'other-'+r.key}))]);
 assert.equal(e.conflict,true);assert.deepEqual(p.photoGlyphSpanPlan(q,e),[]);
 assert.equal(p.reconcilePhotoSpans(q,e,[{at:3,left:2,right:3}],support(3,'05')),null);
 const unknown=p.photoGlyphEvidence(q,support(3,'8'));assert.equal(unknown.conflict,true);
});
test('identical span pixels with contradictory modes and repeated weak alternative spans stay blank',()=>{
 const q=plan('1205.125','1209.125'),e={resolved:new Map(),conflict:false},ranges=p.photoGlyphSpanPlan(q,e),good=support(3,'05');
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,[...good,{...good[0],raw:'09',words:[{text:'09',conf:0}]}]),null);
 const other=support(3,'09').slice(0,2).map(r=>({...r,key:'other-'+r.key,words:[{text:'09',conf:0}]}));
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,[...good,...other]),null);
});
test('same bitmap or same filtering family cannot manufacture context agreement',()=>{
 const q=plan('1205.125','1209.125'),e={resolved:new Map(),conflict:false},ranges=p.photoGlyphSpanPlan(q,e);
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,support(3,'05').map(r=>({...r,key:'same'}))),null);
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,support(3,'05').map(r=>({...r,kind:'gaussian'}))),null);
});
test('missing digits, wrong-length spans and unknown candidate text cannot become quantities',()=>{
 const q=plan('1205.125','1209.125'),e={resolved:new Map(),conflict:false},ranges=p.photoGlyphSpanPlan(q,e);
 for(const raw of ['5','005','08','O5'])assert.equal(p.reconcilePhotoSpans(q,e,ranges,support(3,raw)),null);
});
test('context cannot contradict a confirmed glyph or compose a quantity absent from whole-cell candidates',()=>{
 const q=plan('1205.125','1209.125','1305.125'),e=p.photoGlyphEvidence(q,support(3,'9')),ranges=p.photoGlyphSpanPlan(q,e);
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,support(1,'130')),null);
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,support(1,'120')).value,'1209.125');
});
test('a low-confidence span alone remains insufficient even when repetitions match',()=>{
 const q=plan('1205.125','1209.125'),e={resolved:new Map(),conflict:false},ranges=p.photoGlyphSpanPlan(q,e);
 assert.equal(p.reconcilePhotoSpans(q,e,ranges,support(3,'05').map(r=>({...r,words:[{text:'05',conf:0}]}))),null);
});
