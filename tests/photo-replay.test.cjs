const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../photo-import.js');
const treatment=(height=84)=>[{left:10,right:110,top:20,bottom:40},324,height,false,null,false,true,'gray',1,false];
const reading=(raw,t,conf=0)=>({raw,treatment:JSON.stringify(t),variant:JSON.stringify(t)+raw,words:[{text:raw,conf}]});
const families=(...rows)=>[rows,rows.map(r=>({...r,variant:r.variant+'other'}))];
const makePlan=f=>p.photoGlyphPlan(f,'date',{dateOrder:'dmy'});
const span=(raw,key='a',conf=0)=>({at:4,left:3,right:4,raw,key,words:[{text:raw,conf}]});

test('replay retains a valid weak date candidate and schedules its observed treatment',()=>{
 const f=families(reading('09-02-2027',treatment(),0),reading('09-03-2027',treatment(104),94));
 const plan=makePlan(f),profiles=p.photoGlyphReplayProfiles(plan,f,500,100);
 assert.equal(profiles.length,2);assert.deepEqual(profiles[1],treatment());
 const glyphs=['a','b','c'].map((key,i)=>({at:4,raw:'2',key,kind:i===2?'replay-gray':'median',words:[{text:'2',conf:91}]}));
 const recovered=p.reconcilePhotoGlyphs(plan,glyphs);
 assert.equal(recovered.value,'2027-02-09');
 assert.equal(p.photoGlyphReplayConflict(plan,recovered,[span('02','old',0)]),false);
});
test('profile selection is bounded, deduplicated and excludes unobserved candidate text',()=>{
 const f=families(...[64,84,104,124,144,164].map(h=>reading(h===64?'09-02-2027':'09-03-2027',treatment(h))),reading('noise',treatment(184),99));
 const out=p.photoGlyphReplayProfiles(makePlan(f),f,500,100);
 assert.equal(out.length,4);assert.equal(new Set(out.map(JSON.stringify)).size,4);
 assert.ok(out.every(t=>t[2]!==184));
});
test('replay rejects malformed metadata, image bounds and unsupported processing',()=>{
 const valid=families(reading('09-02-2027',treatment()),reading('09-03-2027',treatment(104))),plan=makePlan(valid);
 const bad=[null,['native',2],treatment().map((x,i)=>i===8?5:x),treatment().map((x,i)=>i===0?{left:-1,right:110,top:20,bottom:40}:x),treatment().map((x,i)=>i===2?5000:x),treatment().map((x,i)=>i===7?'unknown':x)];
 assert.deepEqual(p.photoGlyphReplayProfiles(plan,[bad.map(t=>reading('09-02-2027',t))],500,100),[]);
 assert.deepEqual(p.photoGlyphReplayProfiles(null,valid,500,100),[]);
});
test('a replay winner cannot override a confident or repeated original context contradiction',()=>{
 const f=families(reading('09-02-2027',treatment()),reading('09-03-2027',treatment(104))),plan=makePlan(f),candidate=plan.candidates.find(g=>g.value==='2027-02-09').best;
 assert.equal(p.photoGlyphReplayConflict(plan,candidate,[span('03','a',92)]),true);
 assert.equal(p.photoGlyphReplayConflict(plan,candidate,[span('03','a',0),span('03','b',0)]),true);
 assert.equal(p.photoGlyphReplayConflict(plan,candidate,[span('03','a',0),span('03','a',0)]),false);
});
test('contradictory original modes on the same span pixels remain a veto even at zero confidence',()=>{
 const f=families(reading('09-02-2027',treatment()),reading('09-03-2027',treatment(104))),plan=makePlan(f),candidate=plan.candidates[0].best;
 assert.equal(p.photoGlyphReplayConflict(plan,candidate,[span('02','same'),span('03','same')]),true);
 assert.equal(p.photoGlyphReplayConflict(plan,candidate,[span('2','a',99),span('002','b',99)]),false);
});
