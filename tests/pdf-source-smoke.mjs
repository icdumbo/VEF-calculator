// Optional real PDF / OCR test. See docs/full-pdf-import.md for dependencies.
// Input, oracle and inspector mapping remain external (never commit real reports).
// VEF_SOURCE_MODE=text|ocr|photo node tests/pdf-source-smoke.mjs input oracle [settings]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), pdf=require('../pdf-import.js'), parser=require('../photo-import.js');
const canvas=require('@napi-rs/canvas');
for(const k of ['DOMMatrix','ImageData','Path2D']) globalThis[k]=canvas[k];
const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfjs=await import(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
const {createWorker}=require('tesseract.js');
const [input,oraclePath,mappingPath]=process.argv.slice(2);
assert.ok(input && oraclePath,'Supply input PDF/photo and expected five-field JSON');
const mode=process.env.VEF_SOURCE_MODE || 'text';
const expected=JSON.parse(fs.readFileSync(oraclePath));
let settings=mappingPath?JSON.parse(fs.readFileSync(mappingPath)):null;
let doc,worker,rows=[],ocrCalls=0;
async function ocr(c,width,height) {
 if(!worker){worker=await createWorker('eng',1,process.env.VEF_OCR_LANG_PATH?{langPath:process.env.VEF_OCR_LANG_PATH,gzip:false,cacheMethod:'none'}:{});}
 const wrapped={setParameters:p=>worker.setParameters(p),recognize:(crop,options,output)=>worker.recognize(crop.toBuffer('image/png'),options,output)};
 if(mode==='photo' && process.env.VEF_PHOTO_AUTO==='1') {
  const pixels=c.getContext('2d').getImageData(0,0,width,height),copy=canvas.createCanvas(width,height);copy.getContext('2d').drawImage(c,0,0);
  const detector={setParameters:p=>wrapped.setParameters(p),recognize:(...args)=>{ocrCalls++;return wrapped.recognize(...args);}};
  const tsv=await parser.detectPhotoColumns(copy,detector,canvas.createCanvas);
  const detected=parser.detectPhotoTable(tsv,width,height,pixels);assert.ok(detected,'Automatic photo table / column detection without inspector mapping');
  settings={...detected,options:{...detected.options,numberMode:process.env.VEF_NUMBER_MODE || 'dot',dateOrder:'dmy'}};
  const bands=parser.detectPhotoRows(pixels,settings);assert.ok(bands,'Verified horizontal row geometry');
  return parser.recognizePhotoCells(c,settings,bands,detector,canvas.createCanvas);
 }
 const context=c.getContext('2d'),pixels=context.getImageData(0,0,width,height);
 parser.removeTableRules(pixels,settings.regions,settings.options);context.putImageData(pixels,0,0);

 await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
 ocrCalls+=Object.keys(settings.regions).length;
 const tsv=await parser.recognizeColumns(c,settings,{recognize:(crop,options,output)=>worker.recognize(crop.toBuffer('image/png'),options,output)},canvas.createCanvas);
 return parser.parse(tsv,width,height,settings.regions,settings.options);
}
try{
 if(mode==='photo'){
  assert.ok(settings || process.env.VEF_PHOTO_AUTO==='1','Photo needs automatic detection or inspector mapping');
  const img=await canvas.loadImage(input),scale=Math.min(process.env.VEF_PHOTO_AUTO==='1'?2:1,3000/Math.max(img.width,img.height));
  let c=canvas.createCanvas(Math.round(img.width*scale),Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  if(process.env.VEF_PHOTO_AUTO==='1'){const geometry=require('../photo-geometry.js');const prepared=geometry.normalize(c,canvas.createCanvas);c=prepared.canvas;}
  rows=await ocr(c,c.width,c.height);
 }else{
  doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(input)),isEvalSupported:false,standardFontDataUrl:pdfRoot+'/standard_fonts/',cMapUrl:pdfRoot+'/cmaps/',cMapPacked:true,wasmUrl:pdfRoot+'/wasm/'}).promise;
  // Real reference: the voyage table is on page 1; page 2 is legal text only.
  const page=await doc.getPage(1),v=page.getViewport({scale:1}),words=pdf.textWords((await page.getTextContent()).items,v);
  if(mode==='text'){
   const detected=pdf.detectTable(words,v.width,v.height);assert.ok(detected,'Digital table header detection');
   settings={...detected,options:{...detected.options,numberMode:'dot',dateOrder:'dmy'}};
   assert.equal(pdf.hasTableText(words),true);rows=pdf.extract(words,v.width,v.height,settings);assert.equal(ocrCalls,0);
  }else{
   assert.equal(mode,'ocr');assert.equal(words.length,0,'Scan fixture must contain no text layer');assert.ok(settings,'Scan requires inspector mapping');
   const scaled=page.getViewport({scale:Math.min(3,3000/Math.max(v.width,v.height))}),c=canvas.createCanvas(Math.ceil(scaled.width),Math.ceil(scaled.height));
   await page.render({canvasContext:c.getContext('2d'),viewport:scaled}).promise;
   rows=await ocr(c,c.width,c.height);
  }
 }
 const fields=['port','date','cargo','ship','bl'];
 const summary={mode,expectedRows:expected.length,recognizedRows:rows.length,fullyCorrectRows:0,correctFields:0,blankFields:0,wrongFields:0,ocrCalls,perField:Object.fromEntries(fields.map(f=>[f,{correct:0,blank:0,wrong:0}])),mismatches:[]};
 for(let i=0;i<expected.length;i++){
  let complete=true;
  for(const f of fields){const actual=rows[i]?.[f] || '',target=expected[i][f];const equal=(f==='ship'||f==='bl')?actual!=='' && Number(actual)===Number(target):actual===target;
   const result=equal?'correct':actual===''?'blank':'wrong';summary.perField[f][result]++;
   if(equal)summary.correctFields++;else{complete=false;summary[result==='blank'?'blankFields':'wrongFields']++;summary.mismatches.push({row:i+1,field:f,type:result});}
  }
  if(complete)summary.fullyCorrectRows++;
 }
 for(const row of rows){assert.equal(row.manualExclude,false);assert.equal(row.reason,'');assert.equal(row.qualified,undefined);assert.equal(row.voyage,undefined);}
 console.log(JSON.stringify(summary,null,2));
 if(process.env.VEF_SOURCE_RESULT) fs.writeFileSync(process.env.VEF_SOURCE_RESULT,JSON.stringify(summary,null,2));
 if(mode==='photo' && process.env.VEF_PHOTO_AUTO==='1'){assert.equal(rows.length,expected.length,'Geometric row count');assert.equal(summary.wrongFields,0,'No wrong or shifted accepted fields');rows.forEach((r,i)=>assert.equal(r.sourceRow,i+1));}
 if(mode==='text'){assert.equal(summary.recognizedRows,expected.length);assert.equal(summary.correctFields,expected.length*5);assert.equal(summary.wrongFields,0);}
}finally{if(worker)await worker.terminate();if(doc)await doc.destroy();}
