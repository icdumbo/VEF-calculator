/* FULL only. Conservative, local OCR with inspector-assigned column regions. */
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
    const api = { quantity, date, parse, removeTableRules, recognizeColumns };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.VEFPhotoImport = api;
    if (typeof document === 'undefined') return;
    let dialog, image, photoURL, worker, generation = 0, candidates = [], hooks, loading;
    let pdfTask, pdfDocument, pdfWords = [], pdfViewport, pdfCanvas, renderTask, pdfLoading;
    let sourceType = 'photo';
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
        fields.forEach(f => ['start','end'].forEach((edge,i) => { el('photo-' + f + '-' + edge).value = settings.regions[f][i].toFixed(3); }));
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
        image.onload = () => { el('photoRead').disabled = false; status('Assign the column bounds and table area, then read the photo.'); };
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
            const settings = readSettings();
            parse('', 100, 100, settings.regions, settings.options); // validate before downloads
            if (sourceType === 'pdf' && (el('pdfMode').value === 'text' || (el('pdfMode').value === 'auto' && root.VEFPDFImport.hasTableText(pdfWords)))) {
                const rows = root.VEFPDFImport.extract(pdfWords, pdfViewport.width, pdfViewport.height, settings);
                rows.forEach(row => { row.source += ' — page ' + el('pdfPage').value; });
                render(rows); return;
            }
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 3000 / Math.max(image.naturalWidth, image.naturalHeight));
            if (sourceType === 'pdf') {
                canvas.width=pdfCanvas.width; canvas.height=pdfCanvas.height; canvas.getContext('2d').drawImage(pdfCanvas,0,0);
            } else {
                canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            }
            const context=canvas.getContext('2d');
            if (typeof context.getImageData === 'function') {
                const pixels=context.getImageData(0,0,canvas.width,canvas.height);
                removeTableRules(pixels,settings.regions,settings.options); context.putImageData(pixels,0,0);
            }
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
            await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
            const tsv = await recognizeColumns(canvas,settings,w,(width,height)=>{const crop=document.createElement('canvas');crop.width=width;crop.height=height;return crop;});
            if (token === generation) {
                const rows = parse(tsv, canvas.width, canvas.height, settings.regions, settings.options);
                rows.forEach(row => { row.source = sourceType === 'pdf' ? 'PDF OCR — page ' + el('pdfPage').value : 'Photo OCR'; });
                render(rows);
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
                input.setAttribute('aria-label', labels[i] + ' ' + edge + ' percent'); input.addEventListener('input', invalidate);
                td.appendChild(input); row.appendChild(td);
            }); mapping.appendChild(row);
        });
        // Tap / click the preview to fill a focused column bound, or type its percentage.
        image.addEventListener('pointerdown', event => {
            const selected = el('photoBound').value;
            if (!selected) return;
            const rect = image.getBoundingClientRect();
            el(selected).value = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)).toFixed(1);
            invalidate();
            status('Column bound recorded. Check all start / end percentages before reading.');
        });
        fields.forEach((f,i) => ['start','end'].forEach(edge => { const opt = document.createElement('option'); opt.value = 'photo-' + f + '-' + edge; opt.textContent = labels[i] + ' ' + edge; el('photoBound').appendChild(opt); }));
        el('photoFile').addEventListener('change', e => selectFile(e.target.files[0]));
        el('photoCamera').addEventListener('change', e => selectFile(e.target.files[0]));
        el('pdfFile').addEventListener('change', e => selectPDF(e.target.files[0]));
        el('pdfPage').addEventListener('change', () => { if (pdfDocument) loadPDFPage(+el('pdfPage').value); });
        el('pdfMode').addEventListener('change', invalidate);
        ['photoTop','photoBottom','photoNumbers','photoDates'].forEach(id => el(id).addEventListener('change', invalidate));
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
