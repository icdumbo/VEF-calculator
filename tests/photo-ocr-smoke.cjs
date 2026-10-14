// Optional real OCR test: install tesseract.js@7.0.0 outside the repository.
// NODE_PATH=/path/to/node_modules node tests/photo-ocr-smoke.cjs
// Offline: VEF_OCR_LANG_PATH=/usr/share/tesseract-ocr/5/tessdata (eng.traineddata).
const assert=require('node:assert/strict');
const path=require('node:path');
const {createWorker}=require('tesseract.js');
const {parse,recognizeColumns,removeTableRules}=require('../photo-import.js');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
(async()=>{
    const options=process.env.VEF_OCR_LANG_PATH ? {langPath:process.env.VEF_OCR_LANG_PATH,gzip:false,cacheMethod:'none'} : {};
    const worker=await createWorker('eng',1,options);
    try {
        await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
        const settings={regions:{port:[0,26],date:[26,46],cargo:[46,65],ship:[65,82],bl:[82,100]},options:{top:25,bottom:90}};
        const image=await loadImage(path.join(__dirname,'fixtures/vef-photo-clean.png')),canvas=createCanvas(2000,460),context=canvas.getContext('2d');context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,2000,460);removeTableRules(pixels,settings.regions,settings.options);context.putImageData(pixels,0,0);
        const tsv=await recognizeColumns(canvas,settings,{recognize:(crop,options,output)=>worker.recognize(crop.toBuffer('image/png'),options,output)},createCanvas);
        const rows=parse(tsv,2000,460,settings.regions,settings.options);
        assert.equal(rows.length,2);
        assert.deepEqual(rows.map(r=>[r.port,r.date,r.cargo,r.ship,r.bl]),[
            ['ROTTERDAM','2026-04-03','GASOIL','1001.25','1000'],
            ['STS TERMINAL','2026-04-04','GASOIL','1999.5','2000']
        ]);
        for(const row of rows) assert.equal(row.manualExclude,false);
        console.log('PASS: actual Tesseract.js 7 OCR → five mapped fields → two editable-row payloads.');
    } finally {await worker.terminate();}
})().catch(error=>{console.error(error);process.exitCode=1;});
