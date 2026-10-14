const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('../photo-import.js');
const regions = {port:[0,25], date:[25,45], cargo:[45,65], ship:[65,82], bl:[82,100]};
function tsv(rows) {
    return 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' + rows.map(w => [5,1,1,1,1,1,w.x,w.y ?? 10,w.w ?? 50,20,w.conf ?? 96,w.text].join('\t')).join('\n');
}
test('strict quantities: no invented digits, ambiguous separators stay blank', () => {
    for (const raw of ['1,234','1234.567','1O00','-100','0','','100.0000','1.2.3','12 34','10e3','100kg','Infinity']) assert.equal(parser.quantity(raw), '',raw);
    for (const [raw,expected] of [['1001','1001'],['1,234.50','1234.5'],['1.234,50','1234.5'],['1234.50','1234.5'],['1 234','1234']]) assert.equal(parser.quantity(raw),expected,raw);
    assert.equal(parser.quantity('1,234','dot'),'1234');
    assert.equal(parser.quantity('1,234','comma'),'1.234');
    assert.equal(parser.quantity('1234.567','dot'),'1234.567');
    assert.equal(parser.quantity('1,23.4','dot'),'');
    assert.equal(parser.quantity('9,007,199,254,741','dot'),'');
});
test('explicit date conventions and real calendar validation', () => {
    assert.equal(parser.date('03/04/2026'),'2026-04-03');
    assert.equal(parser.date('03/04/2026','mdy'),'2026-03-04');
    assert.equal(parser.date('2026-10-10'),'2026-10-10');
    assert.equal(parser.date('29.02.2024'),'2024-02-29');
    for(const s of ['29.02.2026','31/04/2026','01/01/26','00/12/2026','13/13/2026','2026-02-30']) assert.equal(parser.date(s),'',s);
});
test('geometry maps five fields, sorts words, and never excludes STS / Dry Dock', () => {
    const words = [{x:5,text:'STS'},{x:60,text:'Terminal'},{x:260,w:160,text:'03/04/2026'},{x:460,text:'Cargo'},{x:660,text:'1001'},{x:850,text:'1000'},
        {x:5,y:60,text:'Dry'},{x:65,y:60,text:'Dock'},{x:660,y:60,text:'1999'},{x:850,y:60,text:'2000'}];
    const rows = parser.parse(tsv(words.reverse()),1000,100,regions);
    assert.equal(rows.length,2);
    assert.deepEqual([rows[0].port,rows[0].date,rows[0].cargo,rows[0].ship,rows[0].bl],['STS Terminal','2026-04-03','Cargo','1001','1000']);
    assert.equal(rows[1].port,'Dry Dock');
    for(const row of rows) { assert.equal(row.manualExclude,false); assert.equal(row.reason,''); }
});
test('low confidence, boundary crossing and unreadable fields are blank with raw review notes', () => {
    const rows = parser.parse(tsv([{x:660,text:'1001',conf:84},{x:850,text:'1000'},{x:230,w:60,text:'Port'}]),1000,100,regions);
    assert.equal(rows[0].ship,''); assert.equal(rows[0].bl,'1000'); assert.equal(rows[0].date,'');
    assert.match(rows[0].warnings.join(' '),/1001/); assert.equal(rows[0].raw.date,'Port');
});
test('optional fields, table crop, and invalid / overlapping column mappings', () => {
    assert.throws(()=>parser.parse('',1000,100,{}),/Assign/);
    assert.throws(()=>parser.parse('',1000,100,{ship:[65,85],bl:[82,100]}),/overlap/);
    assert.throws(()=>parser.parse('',1000,100,{ship:[65,NaN]}),/Invalid/);
    const rows=parser.parse(tsv([{x:660,y:0,text:'1001'},{x:660,y:60,text:'2001'},{x:850,y:60,text:'2000'}]),1000,100,{ship:[65,82],bl:[82,100]},{top:50,bottom:90});
    assert.equal(rows.length,1); assert.equal(rows[0].ship,'2001'); assert.equal(rows[0].port,'');
    assert.throws(()=>parser.parse('',1000,100,regions,{top:90,bottom:10}),/bounds/);
});
function element(value='') {
    const classes = new Set();
    return {value:String(value),textContent:'',checked:false, title:'', validity:{badInput:false,stepMismatch:false},setAttribute(){},
        classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}};
}
function integration() {
    let rows=[];
    const ids=Object.fromEntries(['imoNumber','vesselName','calculationDate','totalShip','totalBL','averageRatio','lowerRange','upperRange','qualifiedCount','outsideRange','finalVEF','validationSummary','reportDownload'].map(k=>[k,element()]));
    const tbody={appendChild(row){rows.push(row);},set innerHTML(s){assert.equal(s,'');rows=[];}};
    const ctx=vm.createContext({document:{querySelectorAll:()=>rows,getElementById:k=>k==='tableBody'?tbody:ids[k],createElement(tag){
        assert.equal(tag,'tr');const cells=Object.fromEntries(['ship','bl','port','cargo','date','reason','manual-exclude','difference','vlr','qualified','row-status'].map(k=>['.'+k,element()]));
        return Object.assign(element(),{querySelector:k=>cells[k]});
    }},console,Blob,TextEncoder,Uint8Array,DataView,Date,Math,Number,URL});
    const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/initializeApp\(\);\s*$/,'');
    vm.runInContext(source,ctx);ctx.persistDraft=()=>{};
    return {ctx,ids,get rows(){return rows;}};
}
test('append preserves existing voyages; no automatic VEF, totals, exclusions or exports until Calculate',async()=>{
    const a=integration();let old=a.ctx.addRow();old.querySelector('.ship').value='1001';old.querySelector('.bl').value='1000';old.querySelector('.manual-exclude').checked=true;old.querySelector('.reason').value='Inspector';
    a.ctx.calculateVEF();
    a.ctx.appendPhotoRows([{port:'STS',ship:'1000',bl:'1000',date:'2026-10-10',cargo:'Oil',raw:{ship:'1000'}},{port:'Dry Dock',ship:'1010',bl:'1000',raw:{}}]);
    assert.equal(a.rows.length,3);assert.equal(a.rows[0],old);assert.equal(old.querySelector('.manual-exclude').checked,true);
    assert.equal(a.ids.finalVEF.textContent,'-');assert.equal(a.ids.totalShip.textContent,'-');
    for(const row of a.rows.slice(1)) assert.equal(row.querySelector('.manual-exclude').checked,false);
    assert.equal(a.ctx.calculateVEF(),null);
    for(const row of a.rows) assert.equal(row.querySelector('.vlr').textContent,'-');
    for(const method of ['exportToExcel','exportToPDF']) assert.throws(()=>a.ctx[method](),/Calculate VEF/);
    const saved=a.ctx.collectCalculationState();assert.equal(saved.photoReviewPending,true);
    a.ctx.applyCalculationState(saved,'restored');assert.equal(a.ids.finalVEF.textContent,'-');assert.equal(a.ctx.calculateVEF(),null);
    a.rows[2].querySelector('.ship').value='1000';assert.equal(a.ctx.calculateVEF(),null);
    const result=a.ctx.calculateVEF(true);assert.equal(result.finalVEF,1);assert.equal(result.qualifiedCount,2);
    assert.equal(a.ctx.collectCalculationState().photoReviewPending,false);
    let blob;a.ctx.downloadReport=b=>{blob=b;};a.ctx.exportToExcel();assert.ok(blob.size>0);a.ctx.exportToPDF();assert.match(await blob.text(),/\(1.0000\) Tj/);
});
test('only explicit Calculate releases pending review; reset deliberately clears it',()=>{
    const a=integration();a.ctx.appendPhotoRows([{ship:'1001',bl:'1000',raw:{}}]);
    a.ctx.addRow();assert.equal(a.ids.finalVEF.textContent,'-');
    a.ctx.resetCalculationFields();assert.equal(a.ctx.collectCalculationState().photoReviewPending,false);
});
