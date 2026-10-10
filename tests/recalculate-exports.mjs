// Optional independent XLSX engine check. Requires @oai/artifact-tool.
// VEF_AUDIT_OUTPUT=/tmp/vef-full-audit node --test tests/full-math.test.cjs
// VEF_AUDIT_OUTPUT=/tmp/vef-full-audit node tests/recalculate-exports.mjs
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { FileBlob, SpreadsheetFile } = await import(createRequire(import.meta.url).resolve('@oai/artifact-tool'));
const dir = process.env.VEF_AUDIT_OUTPUT;
assert.ok(dir, 'Set VEF_AUDIT_OUTPUT to the test export directory');
function numeric(actual, expected, label) {
    if (expected === '') assert.ok(actual === '' || actual === null, `${label}: ${actual}`);
    else assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < 1e-10 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`);
}
for (const file of (await fs.readdir(dir)).filter(f => f.endsWith('.xlsx'))) {
    const e = JSON.parse(await fs.readFile(dir + '/' + file.replace('.xlsx', '.json'), 'utf8'));
    const w = await SpreadsheetFile.importXlsx(await FileBlob.load(dir + '/' + file));
    w.recalculate();
    const s = w.worksheets.getItemAt(0);
    for (const [cell, k] of [['B3', 'totalShip'], ['B4', 'totalBL'], ['B5', 'averageRatio'], ['B10', 'finalVEF']]) numeric(s.getRange(cell).values[0][0], e[k], `${file} ${cell}`);
    numeric(s.getRange('B6').values[0][0], e.averageRatio === '' ? '' : e.averageRatio - 0.003, file + ' lower limit');
    numeric(s.getRange('B7').values[0][0], e.averageRatio === '' ? '' : e.averageRatio + 0.003, file + ' upper limit');
    numeric(s.getRange('B8').values[0][0], e.qualified.filter(q => q === 'YES').length, file + ' count');
    const outside = e.qualified.map((q, i) => q === 'NO' ? i + 1 : null).filter(Boolean);
    assert.equal(s.getRange('B9').values[0][0], outside.length ? outside.join(', ') : 'None', file + ' outside list');
    for (let i = 0; i < e.qualified.length; i++) assert.equal(s.getRange('H' + (14 + i)).values[0][0] ?? '', e.qualified[i] === '-' ? '' : e.qualified[i], file + ' Qualified ' + i);
    // Exercise recalculation after editing an unlocked input and manual exclusion.
    if (file === 'normal.xlsx') {
        s.getRange('D14').values = [[1002]];
        w.recalculate();
        numeric(s.getRange('B5').values[0][0], 3001 / 3000, 'edited weighted ratio');
        s.getRange('I14').values = [['YES']];
        w.recalculate();
        numeric(s.getRange('B10').values[0][0], 1999 / 2000, 'edited manual exclusion');
        s.getRange('D15').values = [[1999.0001]];
        w.recalculate();
        numeric(s.getRange('B3').values[0][0], 0, 'edited invalid precision');
        numeric(s.getRange('B10').values[0][0], '', 'edited no eligible figures');
    }
    console.log('Recalculation PASS:', file);
}
