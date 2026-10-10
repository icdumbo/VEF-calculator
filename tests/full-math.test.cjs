// Run: node --test tests/full-math.test.cjs (no third-party dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/initializeApp\(\);\s*$/, '');
function element(value = '') {
    const classes = new Set();
    return { value: String(value), textContent: '', checked: false,
        validity: { badInput: false, stepMismatch: false }, setAttribute() {},
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x),
            toggle(x, enabled) { enabled ? classes.add(x) : classes.delete(x); } } };
}
function app(data) {
    const rows = data.map(v => {
        const cells = Object.fromEntries(['ship','bl','port','cargo','date','reason','manual-exclude','difference','vlr','qualified','row-status'].map(k => [`.${k}`, element(v[k] ?? '')]));
        cells['.manual-exclude'].checked = !!v.manual;
        for (const k of ['ship','bl']) {
            const n = Number(cells[`.${k}`].value);
            cells[`.${k}`].validity.stepMismatch = Number.isFinite(n) && Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-7;
        }
        return Object.assign(element(), { querySelector: k => cells[k] });
    });
    const ids = Object.fromEntries(['imoNumber','vesselName','calculationDate','totalShip','totalBL','averageRatio','lowerRange','upperRange','qualifiedCount','outsideRange','finalVEF','validationSummary'].map(k => [k, element()]));
    const ctx = vm.createContext({ document: { querySelectorAll: () => rows, getElementById: k => ids[k] },
        console, Blob, TextEncoder, Uint8Array, DataView, Date, Math, Number, URL });
    vm.runInContext(script, ctx);
    ctx.persistDraft = () => {};
    let blob;
    ctx.downloadReport = b => { blob = b; };
    return { ctx, rows, ids, calculate: () => ctx.calculateVEF(),
        async export(format) { ctx[format === 'xlsx' ? 'exportToExcel' : 'exportToPDF'](); return Buffer.from(await blob.arrayBuffer()); } };
}
function oracle(data) {
    const valid = v => v.ship !== undefined && v.bl !== undefined && Number(v.ship) > 0 && Number(v.bl) > 0 && Number(v.ship) === Math.round(Number(v.ship)*1000)/1000 && Number(v.bl) === Math.round(Number(v.bl)*1000)/1000;
    const eligible = data.filter(v => valid(v) && !v.manual);
    const units = (v,k) => BigInt(Math.round(Number(v[k])*1000));
    const sum = (a,k) => a.reduce((s,v) => s+units(v,k),0n);
    const ship = sum(eligible,'ship'), bl = sum(eligible,'bl');
    const qualified = data.map(v => {
        if(v.manual) return 'NO';
        if(!valid(v)||!bl) return '-';
        const d = units(v,'ship')*bl-ship*units(v,'bl');
        return (d<0n?-d:d)*1000n <= 3n*units(v,'bl')*bl ? 'YES' : 'NO';
    });
    const final = data.filter((v,i)=>qualified[i]==='YES');
    const finalBL=sum(final,'bl');
    return { totalShip:Number(ship)/1000,totalBL:Number(bl)/1000,averageRatio:bl?Number(ship)/Number(bl):'',
        finalVEF:finalBL?Number(sum(final,'ship'))/Number(finalBL):'',qualified };
}
const cases = {
    normal: [{ship:1001,bl:1000},{ship:1999,bl:2000}],
    weighted: [{ship:1004,bl:1000},{ship:8999,bl:9000}],
    manual: [{ship:1001,bl:1000},{ship:1800,bl:2000,manual:true,reason:'STS'}],
    outside: [{ship:1000,bl:1000},{ship:1000,bl:1000},{ship:1010,bl:1000}],
    exactLimits: [{ship:998000,bl:1000000},{ship:1004000,bl:1000000}],
    justOutside: [{ship:997999.999,bl:1000000},{ship:1004000.001,bl:1000000}],
    allExcluded: [{ship:1000,bl:1000,manual:true,reason:'Inspector'}],
    noFinalQualified: [{ship:990,bl:1000},{ship:1010,bl:1000}],
    invalid: [{ship:1000,bl:1000},{ship:1000.0001,bl:1000},{ship:0,bl:100},{ship:100,bl:0},{ship:-10,bl:10},{}],
    excludedMissing: [{ship:1000,bl:1000},{manual:true}],
    blankBetween: [{ship:1000,bl:1000},{},{ship:1000,bl:1000,manual:true,reason:'Manual'}],
    labelsNotRules: [{ship:1000,bl:1000,port:'STS'},{ship:1000,bl:1000,reason:'First voyage after Dry Dock'}],
    samePort: [{ship:1000,bl:1000,port:'SAME'},{ship:1010,bl:1000,port:'SAME'}],
    empty: [],
    allInvalid: [{ship:100,bl:0},{ship:100.0001,bl:100},{}],
    multipage: Array.from({length:30},(_,i)=>({ship:1000+i,bl:1000+i,port:'PORT '+i})),
};
function zipEntries(buf) {
    const entries = {};
    for(let i=0;i+30<buf.length && buf.readUInt32LE(i)===0x04034b50;) {
        const size=buf.readUInt32LE(i+18),len=buf.readUInt16LE(i+26),extra=buf.readUInt16LE(i+28);
        const start=i+30+len+extra;
        entries[buf.subarray(i+30,i+30+len).toString()]=buf.subarray(start,start+size).toString();
        i=start+size;
    }
    return entries;
}
for(const [name,data] of Object.entries(cases)) test(name,async()=>{
    const a=app(data), expected=oracle(data), actual=a.calculate();
    for(const k of ['totalShip','totalBL','averageRatio','finalVEF']) assert.equal(actual[k],expected[k],k);
    assert.deepEqual(a.rows.map(r=>r.querySelector('.qualified').textContent),expected.qualified);
    assert.equal(String(a.ids.qualifiedCount.textContent),String(expected.qualified.filter(x=>x==='YES').length));
    for(let i=0;i<data.length;i++) {
        const v=data[i], valid=Number(v.ship)>0&&Number(v.bl)>0;
        assert.equal(a.rows[i].querySelector('.vlr').textContent,valid?(Number(v.ship)/Number(v.bl)).toFixed(6):'-');
        assert.equal(a.rows[i].querySelector('.difference').textContent,valid?(Number(v.ship)-Number(v.bl)).toFixed(3):'-');
    }
    const xlsx=await a.export('xlsx'), xml=zipEntries(xlsx)['xl/worksheets/sheet1.xml'];
    const rowIds=[...xml.matchAll(/<row r="(\d+)"/g)].map(m=>Number(m[1]));
    assert.equal(new Set(rowIds).size,rowIds.length,'unique worksheet row IDs');
    assert.deepEqual(rowIds,[...rowIds].sort((x,y)=>x-y),'worksheet row order');
    for(const [cell,key] of [['B3','totalShip'],['B4','totalBL'],['B5','averageRatio'],['B10','finalVEF']]) {
        const value=xml.match(new RegExp(`<c r="${cell}"[^>]*>.*?<v>(.*?)</v>`))[1];
        assert.equal(value,String(expected[key]),`cached ${cell}`);
    }
    const pdf=(await a.export('pdf')).toString();
    assert.ok(pdf.includes(`(${a.ids.finalVEF.textContent}) Tj`));
    for(const [label,id] of [['Average Ratio','averageRatio'],['Lower Limit','lowerRange'],['Upper Limit','upperRange'],['Qualified Voyages','qualifiedCount'],['Total Ship\'s Figures','totalShip'],['Total B/L Figures','totalBL']]) assert.ok(pdf.includes(`(${label}: ${a.ids[id].textContent}) Tj`),label);
    if(name==='multipage') assert.ok(pdf.includes('/Count 2'));
    if(name==='blankBetween') { assert.ok(pdf.includes('(Manually excluded voyages: 3 \\(Manual\\))'));assert.ok(pdf.includes('(3. )')); }
    if(process.env.VEF_AUDIT_OUTPUT) {
        fs.mkdirSync(process.env.VEF_AUDIT_OUTPUT,{recursive:true});
        fs.writeFileSync(path.join(process.env.VEF_AUDIT_OUTPUT,name+'.xlsx'),xlsx);
        fs.writeFileSync(path.join(process.env.VEF_AUDIT_OUTPUT,name+'.pdf'),await a.export('pdf'));
        fs.writeFileSync(path.join(process.env.VEF_AUDIT_OUTPUT,name+'.json'),JSON.stringify(expected));
    }
});
test('1000 deterministic scenarios against exact rational oracle',()=>{
    let seed=1729;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<1000;i++) {
        const data=Array.from({length:1+Math.floor(rand()*25)},()=>{const bl=Math.floor(1000+rand()*1000000);return {bl,ship:Math.floor(bl*(0.99+rand()*0.02)*1000)/1000,manual:rand()<0.15,reason:'Inspector'};});
        const a=app(data),e=oracle(data),r=a.calculate();
        assert.deepEqual(a.rows.map(row=>row.querySelector('.qualified').textContent),e.qualified);
        for(const k of ['totalShip','totalBL','averageRatio','finalVEF']) if(e[k]!=='') assert.ok(Math.abs(r[k]-e[k])<=1e-9*Math.max(1,Math.abs(e[k])),k);
    }
});
