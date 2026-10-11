/* FULL only. Local OCR with automatic table detection and optional manual correction. */
(function (root) {
    'use strict';
    const fields = ['port', 'date', 'cargo', 'ship', 'bl'];
    const labels = ['Port / Terminal', 'B/L Date', 'Cargo', "Ship’s Figures", 'B/L Figures'];
    function quantity(raw, mode = 'auto') {
        let s = raw.trim();
        if (!/^\d[\d., ]*$/.test(s)) return '';
        // Spaces are thousands separators only when every group is complete.
        if (s.includes(' ')) {
            if (!/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,3})?$/.test(s)) return '';
            s = s.replace(/ /g, '');
        }
        let decimal = mode === 'dot' ? '.' : mode === 'comma' ? ',' : '';
        if (mode === 'auto') {
            if (s.includes('.') && s.includes(',')) decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (/[.,]/.test(s)) {
                // 1,234 / 1234.567 cannot be resolved safely without the inspector's convention.
                const parts = s.split(/[.,]/);
                if (parts.length !== 2 || parts[1].length === 3) return '';
                decimal = s.includes('.') ? '.' : ',';
            }
        }
        const thousands = decimal === '.' ? ',' : '.';
        if (decimal) {
            const parts = s.split(decimal);
            if (parts.length > 2 || (parts.length === 2 && !/^\d{1,3}$/.test(parts[1]))) return '';
            const integer = parts[0];
            if (integer.includes(thousands) && !(new RegExp('^\\d{1,3}(?:\\' + thousands + '\\d{3})+$')).test(integer)) return '';
            if (!new RegExp('^[\\d\\' + thousands + ']+$').test(integer)) return '';
            s = integer.split(thousands).join('') + (parts.length === 2 ? '.' + parts[1] : '');
        } else if (!/^\d+$/.test(s)) return '';
        const n = Number(s);
        return Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER / 1000 ? String(n) : '';
    }
    function date(raw, order = 'dmy') {
        const s = raw.trim();
        let y, m, d, match;
        if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [, y, m, d] = match;
        else if ((match = s.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/))) {
            y = match[4]; m = order === 'mdy' ? match[1] : match[3]; d = order === 'mdy' ? match[3] : match[1];
        } else return '';
        const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
        if (Number(y) < 1900 || dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() + 1 !== Number(m) || dt.getUTCDate() !== Number(d)) return '';
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    function parse(tsv, width, height, regions, options = {}) {
        const mapped = fields.filter(f => regions[f]);
        if (!mapped.length) throw new Error('Assign at least one column on the photo.');
        for (const f of mapped) {
            const [a, b] = regions[f];
            if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > 100 || a >= b) throw new Error('Invalid column bounds: ' + f);
        }
        for (let i = 0; i < mapped.length; i++) for (let j = i + 1; j < mapped.length; j++) {
            const a = regions[mapped[i]], b = regions[mapped[j]];
            if (Math.max(a[0], b[0]) < Math.min(a[1], b[1])) throw new Error('Column regions overlap. Adjust their bounds.');
        }
        const top = options.top ?? 0, bottom = options.bottom ?? 100;
        if (!(top >= 0 && bottom <= 100 && top < bottom)) throw new Error('Invalid table top / bottom bounds.');
        const words = tsv.split(/\r?\n/).slice(1).map(line => {
            const p = line.split('\t');
            return { level: +p[0], x: +p[6], y: +p[7], w: +p[8], h: +p[9], conf: +p[10], text: p.slice(11).join('\t').trim() };
        }).filter(w => w.level === 5 && w.text && w.w > 0 && w.h > 0 && [w.x,w.y,w.conf].every(Number.isFinite)
            && (w.y + w.h / 2) / height * 100 >= top && (w.y + w.h / 2) / height * 100 <= bottom);
        const heights = words.map(w => w.h).sort((a,b) => a-b);
        const tolerance = (heights[Math.floor(heights.length / 2)] || 10) * 0.6;
        const lines = [];
        for (const word of words.sort((a,b) => a.y + a.h/2 - b.y - b.h/2 || a.x - b.x)) {
            const center = word.y + word.h / 2;
            let line = lines.find(l => Math.abs(l.center - center) <= tolerance);
            if (!line) { line = { center, words: [] }; lines.push(line); }
            line.words.push(word);
        }
        return lines.map(line => {
            const row = { warnings: [], raw: {}, manualExclude: false, reason: '' };
            for (const f of fields) {
                const bounds = regions[f];
                const cell = bounds ? line.words.filter(w => {
                    const c = (w.x + w.w / 2) / width * 100;
                    return c >= bounds[0] && c < bounds[1];
                }).sort((a,b) => a.x-b.x) : [];
                const raw = cell.map(w => w.text).join(' ');
                row.raw[f] = raw;
                const threshold = f === 'ship' || f === 'bl' || f === 'date' ? 85 : 70;
                const uncertain = cell.some(w => w.conf < threshold || w.x / width * 100 < bounds[0] || (w.x + w.w) / width * 100 > bounds[1]);
                row[f] = uncertain ? '' : f === 'ship' || f === 'bl' ? quantity(raw, options.numberMode) : f === 'date' ? date(raw, options.dateOrder) : raw;
                if (!row[f]) row.warnings.push(labels[fields.indexOf(f)] + (raw ? ': unreadable / ambiguous (' + raw + ')' : ': missing'));
            }
            return row;
        }).filter(row => fields.some(f => row.raw[f]));
    }
    function removeTableRules(data, regions, options = {}) {
        const {width,height} = data, pixels = data.data;
        const ranges = Object.values(regions);
        if (!ranges.length) return {rows:0,columns:0};
        const left=Math.max(0,Math.floor(Math.min(...ranges.map(r=>r[0]))/100*width));
        const right=Math.min(width,Math.ceil(Math.max(...ranges.map(r=>r[1]))/100*width));
        const top=Math.max(0,Math.floor((options.top ?? 0)/100*height)), bottom=Math.min(height,Math.ceil((options.bottom ?? 100)/100*height));
        if (right<=left || bottom<=top) return {rows:0,columns:0};
        const dark=(x,y)=>{const i=(y*width+x)*4;return pixels[i]<110 && pixels[i+1]<110 && pixels[i+2]<110;};
        const horizontal=[],vertical=[];
        for(let y=top;y<bottom;y++){let count=0;for(let x=left;x<right;x++)if(dark(x,y))count++;if(count/(right-left)>0.65)horizontal.push(y);}
        for(let x=left;x<right;x++){let count=0;for(let y=top;y<bottom;y++)if(dark(x,y))count++;if(count/(bottom-top)>0.75)vertical.push(x);}
        const white=(x,y)=>{const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=pixels[i+3]=255;};
        // Only long, continuous table rules; never substitute recognized characters.
        for(const y of horizontal)for(let dy=-1;dy<=1;dy++)if(y+dy>=top && y+dy<bottom)for(let x=left;x<right;x++)white(x,y+dy);
        for(const x of vertical)for(let dx=-1;dx<=1;dx++)if(x+dx>=left && x+dx<right)for(let y=top;y<bottom;y++)white(x+dx,y);
        return {rows:horizontal.length,columns:vertical.length};
    }
    async function recognizeColumns(canvas, settings, worker, makeCanvas) {
        const lines=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'];
        const top=Math.max(0,Math.floor((settings.options.top ?? 0)/100*canvas.height));
        const bottom=Math.min(canvas.height,Math.ceil((settings.options.bottom ?? 100)/100*canvas.height));
        for(const field of fields.filter(f=>settings.regions[f])) {
            const bounds=settings.regions[field];
            const left=Math.max(0,Math.floor(bounds[0]/100*canvas.width)),right=Math.min(canvas.width,Math.ceil(bounds[1]/100*canvas.width));
            const crop=makeCanvas(right-left,bottom-top);
            crop.getContext('2d').drawImage(canvas,left,top,right-left,bottom-top,0,0,crop.width,crop.height);
            const result=await worker.recognize(crop,{}, {tsv:true});
            for(const line of (result.data.tsv || '').split(/\r?\n/).slice(1)) {
                const p=line.split('\t'); if(+p[0]!==5 || p.length<12)continue;
                p[6]=String(+p[6]+left);p[7]=String(+p[7]+top);lines.push(p.join('\t'));
            }
        }
        return lines.join('\n');
    }
    function tsvWords(tsv) {
        return tsv.split(/\r?\n/).map(line => {
            const p=line.split('\t');
            return {level:+p[0],x:+p[6],y:+p[7],w:+p[8],h:+p[9],conf:+p[10],text:p.slice(11).join('\t').trim()};
        }).filter(w=>w.level===5 && w.text && w.w>0 && w.h>0 && [w.x,w.y,w.conf].every(Number.isFinite));
    }
    // Header aliases affect geometry only: never repair or invent a cell value.
    function detectPhotoTable(tsv, width, height, pixels) {
        const clean=s=>s.toUpperCase().replace(/[’‘]/g,"'").replace(/[^A-Z0-9/']/g,'');
        const words=tsvWords(tsv).flatMap(w=>{
            const c=clean(w.text);let parts;
            if(/^(B\/L|BL|BIL|B1L)DATE$/.test(c))parts=[c.slice(0,-4),'DATE'];
            else if(/^SHIP'?S?FIGURES$/.test(c))parts=[c.slice(0,-7),'FIGURES'];
            else if(/^PORT\/?TERMINAL$/.test(c))parts=['PORT','TERMINAL'];
            if(!parts)return [w];let offset=0;const n=parts.join('').length;
            return parts.map(text=>{const out={...w,text,x:w.x+w.w*offset/n,w:w.w*text.length/n};offset+=text.length;return out;});
        });
        const isBL=w=>['B/L','BL','BIL','B1L'].includes(clean(w.text));
        const center=w=>w.x+w.w/2;
        const span=ws=>({x:Math.min(...ws.map(w=>w.x)),right:Math.max(...ws.map(w=>w.x+w.w)),y:Math.min(...ws.map(w=>w.y)),bottom:Math.max(...ws.map(w=>w.y+w.h))});
        for(const dateHeader of words.filter(w=>clean(w.text)==='DATE' && w.conf>=60)) {
            const band=words.filter(w=>(w.conf>=45 || isBL(w)) && Math.abs(w.y-dateHeader.y)<dateHeader.h*6);
            const terminal=band.find(w=>/^TERMINA[LІI1]$/.test(clean(w.text)));
            let port=band.filter(w=>/PORT$/.test(clean(w.text)) && (!terminal || w.x<terminal.x)).sort((a,b)=>Math.abs(a.y-dateHeader.y)-Math.abs(b.y-dateHeader.y))[0];
            if(port && /^VOY(?:AGE)?(?:NO)?PORT$/.test(clean(port.text))){const index=port.text.toUpperCase().lastIndexOf('PORT');port={...port,x:port.x+port.w*index/port.text.length,w:port.w*4/port.text.length,text:'PORT'};}
            const cargo=band.find(w=>clean(w.text)==='CARGO'),ship=band.find(w=>/^SHIP'?S?$/.test(clean(w.text)));
            const bls=band.filter(isBL);
            const dateBL=bls.find(w=>w.x<dateHeader.x && dateHeader.x-w.x-w.w<dateHeader.h*2 && Math.abs(w.y-dateHeader.y)<dateHeader.h);
            const bl=bls.find(w=>w!==dateBL && ship && w.x>ship.x);
            if(!ship || !bl || !port || (!dateBL && (!cargo || !terminal || dateHeader.x>=cargo.x))) continue;
            const figures=band.filter(w=>clean(w.text)==='FIGURES' && w.conf>=70);
            const near=a=>figures.filter(w=>w.y>=a.y && Math.abs(center(w)-center(a))<dateHeader.h*2.5);
            if((clean(bl.text)!=='B/L' || bl.conf<45) && !near(bl).length)continue;
            const anchors={port:span([port,...(terminal?[terminal]:[])]),date:span([dateHeader,...(dateBL?[dateBL]:[])]),ship:span([ship,...near(ship)]),bl:span([bl,...near(bl)])};
            if(cargo) anchors.cargo=span([cargo]);
            const sorted=Object.entries(anchors).map(([f,a])=>({f,...a})).sort((a,b)=>a.x-b.x);
            if(sorted.some((a,i)=>i && a.x<sorted[i-1].right)) continue;
            const top=Math.max(...sorted.map(a=>a.bottom))+1;
            const total=words.filter(w=>w.y>top && /^TOTALS?$/.test(clean(w.text))).sort((a,b)=>a.y-b.y)[0];
            const candidateBottom=total?total.y-1:height;
            // Vertical rules, when present, define actual cells, including a separate Voyage column.
            const edges=[];
            if(pixels && pixels.width===width && pixels.height===height) {
                const from=Math.max(0,Math.floor(Math.min(...sorted.map(a=>a.y)))),to=Math.min(height,Math.ceil(candidateBottom));
                let group=[];
                const flush=()=>{if(group.length)edges.push((group[0]+group[group.length-1])/2);group=[];};
                for(let x=0;x<width;x++) {
                    let count=0;for(let y=from;y<to;y++){const i=(y*width+x)*4;if(pixels.data[i]<110 && pixels.data[i+1]<110 && pixels.data[i+2]<110)count++;}
                    if(count/Math.max(1,to-from)>0.55)group.push(x);else flush();
                }
                flush();
            }
            for(const useRules of [true,false]) {
            const regions={};
            for(let i=0;i<sorted.length;i++) {
                const a=sorted[i],c=(a.x+a.right)/2;
                const leftRule=useRules?edges.filter(x=>x<c).at(-1):undefined,rightRule=useRules?edges.find(x=>x>c):undefined;
                const ignored=band.filter(w=>w.x>a.right && !sorted.some(a=>w.x>=a.x && w.x<a.right)).sort((a,b)=>a.x-b.x)[0];
                const left=leftRule??(i?(sorted[i-1].right+a.x)/2:Math.max(0,a.x-dateHeader.h));
                const right=rightRule??(i+1<sorted.length?(a.right+sorted[i+1].x)/2:ignored?(a.right+ignored.x)/2:Math.min(width,a.right+dateHeader.h*2));
                if(right-left<dateHeader.h || (a.f==='port' && clean(port.text)!=='PORT' && leftRule===undefined)) continue;
                regions[a.f]=[left/width*100,right/width*100];
            }
            if(!regions.ship || !regions.bl || !regions.date) continue;
            // Require actual quantity evidence below the headers; stop before footer prose / totals.
            const inColumn=(w,f)=>center(w)/width*100>=regions[f][0] && center(w)/width*100<regions[f][1];
            const quantities=words.filter(w=>w.y>=top && w.y<candidateBottom && /^\d[\d.,]*$/.test(w.text) && (inColumn(w,'ship') || inColumn(w,'bl')));
            const pairs=quantities.filter(w=>inColumn(w,'ship') && quantities.some(b=>inColumn(b,'bl') && Math.abs((b.y+b.h/2)-(w.y+w.h/2))<Math.max(b.h,w.h)));
            if(!pairs.length)continue;
            const bottom=Math.min(candidateBottom,Math.max(...quantities.map(w=>w.y+w.h))+dateHeader.h/2);
            const settings={regions,options:{top:top/height*100,bottom:bottom/height*100}};
            try{parse('',width,height,regions,settings.options);return settings;}catch{continue;}
            }
        }
        return null;
    }
    async function detectPhotoColumns(canvas, worker, makeCanvas) {
        const context=canvas.getContext('2d'),pixels=context.getImageData(0,0,canvas.width,canvas.height);
        // This is a disposable OCR copy, not the original image or the later column OCR canvas.
        removeTableRules(pixels,{all:[0,100]});context.putImageData(pixels,0,0);
        await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});
        const result=await worker.recognize(canvas,{}, {tsv:true});
        let tsv=result.data.tsv || '';
        if(makeCanvas && !detectPhotoTable(tsv,canvas.width,canvas.height)) {
            // Retry the header area as a block. Its short height lets grid removal
            // clear thin vertical rules without requiring page-height table lines.
            const crop=makeCanvas(canvas.width,Math.ceil(canvas.height*.4)),ctx=crop.getContext('2d');
            ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,crop.width,crop.height);
            removeTableRules(data,{all:[0,100]});ctx.putImageData(data,0,0);
            await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
            const retry=await worker.recognize(crop,{}, {tsv:true});tsv+='\n'+(retry.data.tsv || '');
        }
        return tsv;
    }
    const api = { quantity, date, parse, removeTableRules, recognizeColumns, tsvWords, detectPhotoTable, detectPhotoColumns };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.VEFPhotoImport = api;
    if (typeof document === 'undefined') return;
    let dialog, image, photoURL, worker, generation = 0, candidates = [], hooks, loading;
    let pdfTask, pdfDocument, pdfWords = [], pdfViewport, pdfCanvas, renderTask, pdfLoading;
    let sourceType = 'photo';
    let manualMapping = false;
    let photoPreparedCanvas = null;
    const el = id => document.getElementById(id);
    function status(text) { el('photoStatus').textContent = text; }
    function invalidate() {
        generation++; candidates = []; el('photoRows').textContent = ''; el('photoAppend').disabled = true;
        stop().catch(() => {});
        if (renderTask) { renderTask.cancel(); renderTask = null; }
        el('photoRead').disabled = sourceType === 'pdf' ? !pdfCanvas : !photoURL;
    }
    async function stop() { const w = worker; worker = null; if (w) await w.terminate(); }
    function cleanup() {
        invalidate(); stop().catch(() => {});
        if (pdfTask) pdfTask.destroy().catch(() => {});
        pdfTask = null; pdfDocument = null; pdfWords = []; pdfViewport = null; pdfCanvas = null; sourceType = 'photo';
        el('pdfFile').value = ''; el('pdfPage').textContent = ''; el('pdfControls').hidden = true;
        if (photoURL) URL.revokeObjectURL(photoURL);
        photoURL = null; image.removeAttribute('src'); el('photoFile').value = ''; el('photoCamera').value = '';
        image.onload=null; image.onerror=null; manualMapping=false; el('photoAdvanced').open=false;
        photoPreparedCanvas=null;el('photoCorrected').removeAttribute('src');el('photoCorrected').hidden=true;el('photoCorrectionNote').hidden=true;
        fields.forEach(f => ['start','end'].forEach(edge => { el('photo-' + f + '-' + edge).value = ''; }));
        el('photoBound').value = ''; el('photoTop').value = '0'; el('photoBottom').value = '100';
        el('photoRead').disabled = true;
        status('Select Camera, Photo / Gallery or PDF. Source files are not saved with the calculation.');
    }
    function loadEngine() {
        if (root.Tesseract) return Promise.resolve(root.Tesseract);
        if (loading) return loading;
        loading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
            script.onload = () => root.Tesseract ? resolve(root.Tesseract) : reject(new Error('OCR engine unavailable.'));
            script.onerror = () => { script.remove(); loading = null; reject(new Error('Cannot download OCR engine. Check your internet connection.')); };
            document.head.appendChild(script);
        });
        return loading;
    }
    function loadPDFEngine() {
        if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
        if (pdfLoading) return pdfLoading;
        pdfLoading = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/legacy/build/pdf.min.mjs').then(lib => {
            lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/legacy/build/pdf.worker.min.mjs';
            return lib;
        }).catch(error => { pdfLoading = null; throw new Error('Cannot load PDF reader. Check your internet connection. ' + error.message); });
        return pdfLoading;
    }
    function fileBytes(file) {
        if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
        return new Promise((resolve,reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Cannot read the selected PDF.')); reader.readAsArrayBuffer(file);
        });
    }
    function applyDetectedTable(settings) {
        fields.forEach(f => ['start','end'].forEach((edge,i) => { el('photo-' + f + '-' + edge).value = settings.regions[f] ? settings.regions[f][i].toFixed(3) : ''; }));
        el('photoTop').value = settings.options.top.toFixed(3); el('photoBottom').value = settings.options.bottom.toFixed(3);
    }
    async function loadPDFPage(number) {
        invalidate(); const token = generation; el('photoRead').disabled = true; pdfCanvas = null;
        fields.forEach(f => ['start','end'].forEach(edge => { el('photo-' + f + '-' + edge).value = ''; }));
        el('photoTop').value = '0'; el('photoBottom').value = '100';
        try {
            const page = await pdfDocument.getPage(number);
            const viewport = page.getViewport({scale:1});
            const text = await page.getTextContent();
            if (token !== generation) return;
            pdfWords = root.VEFPDFImport.textWords(text.items, viewport); pdfViewport = viewport;
            const detected = root.VEFPDFImport.detectTable(pdfWords, viewport.width, viewport.height);
            if (detected) applyDetectedTable(detected);
            const scaled = page.getViewport({scale:Math.min(3,3000 / Math.max(viewport.width,viewport.height))});
            const canvas = document.createElement('canvas'); canvas.width = Math.ceil(scaled.width); canvas.height = Math.ceil(scaled.height);
            const task = page.render({canvasContext:canvas.getContext('2d'),viewport:scaled}); renderTask = task;
            await task.promise;
            if (token !== generation) return;
            renderTask = null; pdfCanvas = canvas;
            const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
            if (token !== generation) return;
            if (!blob) throw new Error('Cannot preview this PDF page.');
            if (photoURL) URL.revokeObjectURL(photoURL);
            photoURL = URL.createObjectURL(blob); image.onload = null; image.onerror = null; image.src = photoURL;
            el('photoRead').disabled = false;
            status('PDF page ' + number + '/' + pdfDocument.numPages + ': ' + (root.VEFPDFImport.hasTableText(pdfWords)
                ? 'selectable table text found; Auto will extract it directly, without OCR. ' : 'no usable table text detected; Auto will use local OCR. ')
                + (detected ? 'Column bounds detected; verify them and number / date conventions before reading.' : 'Assign the column bounds on this page before reading.'));
        } catch (error) { if (token === generation) status('PDF page could not be opened: ' + error.message); }
    }
    async function selectPDF(file) {
        cleanup(); if (!file) return;
        if ((!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') || file.size > 20 * 1024 * 1024) { status('Choose a PDF of at most 20 MB.'); return; }
        sourceType = 'pdf'; const token = generation;
        status('Opening PDF locally. Downloading the PDF reader if needed.');
        try {
            const engine = await loadPDFEngine(), bytes = await fileBytes(file);
            if (token !== generation) return;
            const task = engine.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,
                cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/cmaps/',cMapPacked:true,
                standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/standard_fonts/',
                wasmUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/wasm/'});
            pdfTask = task;
            const doc = await task.promise;
            if (token !== generation) { await task.destroy(); return; }
            pdfDocument = doc;
            if (doc.numPages > 30) { await task.destroy(); pdfTask = null; pdfDocument = null; throw new Error('Limit: 30 pages. Select a smaller PDF.'); }
            for (let n=1; n<=doc.numPages; n++) { const opt = document.createElement('option'); opt.value = n; opt.textContent = 'Page ' + n; el('pdfPage').appendChild(opt); }
            el('pdfControls').hidden = false;
            await loadPDFPage(1);
        } catch (error) { if (token === generation) status('PDF could not be opened: ' + error.message + ' Password-protected or damaged files may need an unlocked copy.'); }
    }
    async function selectFile(file) {
        cleanup();
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) { status('Choose an image of at most 20 MB. Convert HEIC to JPEG if your browser cannot display it.'); return; }
        photoURL = URL.createObjectURL(file);
        const token=generation;
        image.onload = () => { if(token!==generation)return; el('photoRead').disabled = false; recognize(); };
        image.onerror = () => { status('This image format could not be opened. Try JPEG or PNG.'); el('photoRead').disabled = true; };
        image.src = photoURL;
    }
    function readSettings() {
        const regions = {};
        fields.forEach(f => {
            const start = el('photo-' + f + '-start').value, end = el('photo-' + f + '-end').value;
            if (start !== '' || end !== '') regions[f] = [start === '' ? NaN : +start, end === '' ? NaN : +end];
        });
        return { regions, options: { numberMode: el('photoNumbers').value, dateOrder: el('photoDates').value, top: +el('photoTop').value, bottom: +el('photoBottom').value } };
    }
    function render(rows) {
        candidates = rows;
        const table = el('photoRows'); table.textContent = '';
        const header = document.createElement('tr');
        ['Import?', ...labels, 'Source / Review notes'].forEach(text => { const th = document.createElement('th'); th.textContent = text; header.appendChild(th); });
        table.appendChild(header);
        rows.forEach((row, i) => {
            const tr = document.createElement('tr'), td = document.createElement('td'), checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.dataset.candidate = i; checkbox.setAttribute('aria-label', 'Import detected row ' + (i + 1));
            // No row is selected until the inspector explicitly chooses it.
            checkbox.addEventListener('change', () => { el('photoAppend').disabled = !table.querySelector('input:checked'); });
            td.appendChild(checkbox); tr.appendChild(td);
            fields.forEach(f => { const cell = document.createElement('td'); cell.textContent = row[f] || '—'; cell.title = 'OCR: ' + (row.raw[f] || '(missing)'); tr.appendChild(cell); });
            const notes = document.createElement('td'); notes.textContent = [row.source || 'Photo OCR', 'Verify every value against the original.', ...row.warnings].join(' '); tr.appendChild(notes); table.appendChild(tr);
        });
        status(rows.length ? `${rows.length} possible rows found. Select only voyage rows (skip headers / totals). Blank cells must be completed in the main table. No VEF will be calculated on import.` : 'No rows found in the assigned area. Adjust the photo / column bounds and retry.');
    }
    async function recognize() {
        invalidate(); const token = generation;
        el('photoRead').disabled = true;
        try {
            let settings = readSettings();
            const automatic = sourceType === 'photo' && !manualMapping;
            if(!automatic) parse('', 100, 100, settings.regions, settings.options); // validate manual / PDF settings before downloads
            if (sourceType === 'pdf' && (el('pdfMode').value === 'text' || (el('pdfMode').value === 'auto' && root.VEFPDFImport.hasTableText(pdfWords)))) {
                const rows = root.VEFPDFImport.extract(pdfWords, pdfViewport.width, pdfViewport.height, settings);
                rows.forEach(row => { row.source += ' — page ' + el('pdfPage').value; });
                render(rows); return;
            }
            let canvas = document.createElement('canvas');
            const scale = Math.min(automatic ? 2 : 1, 3000 / Math.max(image.naturalWidth, image.naturalHeight));
            if (sourceType === 'pdf') {
                canvas.width=pdfCanvas.width; canvas.height=pdfCanvas.height; canvas.getContext('2d').drawImage(pdfCanvas,0,0);
            } else if(photoPreparedCanvas) {
                canvas.width=photoPreparedCanvas.width;canvas.height=photoPreparedCanvas.height;canvas.getContext('2d').drawImage(photoPreparedCanvas,0,0);
            } else {
                canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            }
            if(automatic && !photoPreparedCanvas && root.VEFPhotoGeometry) {
                status('Checking photo alignment / perspective before header recognition…');
                const prepared=root.VEFPhotoGeometry.normalize(canvas,(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;});
                if(prepared.corrected){canvas=prepared.canvas;photoPreparedCanvas=canvas;el('photoCorrected').src=canvas.toDataURL('image/png');el('photoCorrected').hidden=false;el('photoCorrectionNote').hidden=false;}
            }
            const context=canvas.getContext('2d');
            status('Downloading / starting local OCR. The photo stays in this browser.');
            const engine = await loadEngine();
            if (token !== generation) return;
            const w = await engine.createWorker('eng', 1, {
                workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
                corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
                langPath: 'https://tessdata.projectnaptha.com/4.0.0',
                logger: m => { if (token === generation && m.status) status(m.status + (m.progress == null ? '' : ' ' + Math.round(m.progress * 100) + '%')); }
            });
            if (token !== generation) { await w.terminate(); return; }
            worker = w;
            if(automatic) {
                status('Automatically finding the voyage table and its column headers…');
                const pixels=context.getImageData(0,0,canvas.width,canvas.height);
                const detectionCanvas=document.createElement('canvas');detectionCanvas.width=canvas.width;detectionCanvas.height=canvas.height;
                detectionCanvas.getContext('2d').drawImage(canvas,0,0);
                const headerTSV=await detectPhotoColumns(detectionCanvas,w,(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;});
                if(token!==generation)return;
                const detected=detectPhotoTable(headerTSV,canvas.width,canvas.height,pixels);
                if(!detected) {
                    el('photoAdvanced').open=true;
                    status('Automatic table detection could not identify reliable columns. Try a clearer, upright photo including the headers, or use Advanced correction and Read selected source. No data was imported.');
                    return;
                }
                settings={regions:detected.regions,options:{...settings.options,...detected.options}};
                applyDetectedTable(settings);
            }
            if (typeof context.getImageData === 'function') {
                const pixels=context.getImageData(0,0,canvas.width,canvas.height);
                removeTableRules(pixels,settings.regions,settings.options); context.putImageData(pixels,0,0);
            }
            await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
            const tsv = await recognizeColumns(canvas,settings,w,(width,height)=>{const crop=document.createElement('canvas');crop.width=width;crop.height=height;return crop;});
            if (token === generation) {
                const rows = parse(tsv, canvas.width, canvas.height, settings.regions, settings.options);
                rows.forEach(row => { row.source = sourceType === 'pdf' ? 'PDF OCR — page ' + el('pdfPage').value : 'Photo OCR'; });
                render(rows);
                if(automatic && !rows.length)el('photoAdvanced').open=true;
                if(automatic && rows.length && typeof el('photoRows').scrollIntoView==='function')el('photoRows').scrollIntoView({block:'start'});
            }
        } catch (error) { if (token === generation) status('Source could not be read: ' + error.message); }
        finally {
            if (token === generation) { await stop().catch(() => {}); el('photoRead').disabled = !photoURL; }
        }
    }
    api.open = source => {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else { dialog.setAttribute('open',''); dialog.scrollIntoView(); }
        if (source === 'pdf') el('pdfFile').focus();
    };
    api.init = callbacks => {
        hooks = callbacks; dialog = el('photoDialog'); image = el('photoImage');
        const mapping = el('photoMapping');
        fields.forEach((f, i) => {
            const row = document.createElement('tr');
            const label = document.createElement('th'); label.textContent = labels[i]; row.appendChild(label);
            ['start','end'].forEach(edge => {
                const td = document.createElement('td'), input = document.createElement('input');
                input.type = 'number'; input.min = 0; input.max = 100; input.step = 0.001; input.id = 'photo-' + f + '-' + edge;
                input.setAttribute('aria-label', labels[i] + ' ' + edge + ' percent'); input.addEventListener('input', () => {manualMapping=true;invalidate();});
                td.appendChild(input); row.appendChild(td);
            }); mapping.appendChild(row);
        });
        // Tap / click the preview to fill a focused column bound, or type its percentage.
        const recordBound = event => {
            const selected = el('photoBound').value;
            if (!selected) return;
            if(photoPreparedCanvas && event.currentTarget===image)return;
            const rect = event.currentTarget.getBoundingClientRect();
            el(selected).value = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)).toFixed(1);
            manualMapping=true;
            invalidate();
            status('Column bound recorded. Check all start / end percentages before reading.');
        };
        image.addEventListener('pointerdown',recordBound);el('photoCorrected').addEventListener('pointerdown',recordBound);
        fields.forEach((f,i) => ['start','end'].forEach(edge => { const opt = document.createElement('option'); opt.value = 'photo-' + f + '-' + edge; opt.textContent = labels[i] + ' ' + edge; el('photoBound').appendChild(opt); }));
        el('photoFile').addEventListener('change', e => selectFile(e.target.files[0]));
        el('photoCamera').addEventListener('change', e => selectFile(e.target.files[0]));
        el('pdfFile').addEventListener('change', e => selectPDF(e.target.files[0]));
        el('pdfPage').addEventListener('change', () => { if (pdfDocument) loadPDFPage(+el('pdfPage').value); });
        el('pdfMode').addEventListener('change', invalidate);
        ['photoTop','photoBottom'].forEach(id => el(id).addEventListener('change', () => {manualMapping=true;invalidate();}));
        ['photoNumbers','photoDates'].forEach(id => el(id).addEventListener('change', invalidate));
        el('photoAuto').addEventListener('click', () => {manualMapping=false;el('photoAdvanced').open=false;recognize();});
        el('photoRead').addEventListener('click', recognize);
        el('photoCancel').addEventListener('click', () => { if (dialog.open && typeof dialog.close === 'function') dialog.close(); else { dialog.removeAttribute('open'); cleanup(); } });
        dialog.addEventListener('close', cleanup);
        el('photoAppend').addEventListener('click', () => {
            const selected = Array.from(el('photoRows').querySelectorAll('input:checked')).map(input => candidates[+input.dataset.candidate]);
            if (!selected.length) return;
            hooks.append(selected);
            if (typeof dialog.close === 'function') dialog.close(); else { dialog.removeAttribute('open'); cleanup(); }
        });
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
