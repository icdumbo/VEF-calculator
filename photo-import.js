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
    function detectPhotoTableLegacy(tsv, width, height, pixels) {
        const clean=s=>s.toUpperCase().replace(/[’‘]/g,"'").replace(/[^A-Z0-9/']/g,'');
        const words=tsvWords(tsv).flatMap(w=>{
            const c=clean(w.text);let parts,referenceHeader;
            if(/^(B\/L|BL|BIL|B1L)DATE$/.test(c))parts=[c.slice(0,-4),'DATE'];
            else if(/^(B\/L|BL|BIL|B1L|SHORE)(FIGURES|QTY)$/.test(c)){const m=c.match(/^(B\/L|BL|BIL|B1L|SHORE)(FIGURES|QTY)$/);parts=[m[1],m[2]];referenceHeader=w;}
            else if(/^SHIP'?S?FIGURES$/.test(c))parts=[c.slice(0,-7),'FIGURES'];
            else if(/^PORT\/?TERMINAL$/.test(c))parts=['PORT','TERMINAL'];
            if(!parts)return [w];let offset=0;const n=parts.join('').length;
            return parts.map(text=>{const out={...w,text,referenceHeader,x:w.x+w.w*offset/n,w:w.w*text.length/n};offset+=text.length;return out;});
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
            const bl=band.find(w=>(isBL(w) || clean(w.text)==='SHORE') && w!==dateBL && ship && w.x>ship.x);
            if(!ship || !bl || !port || (!dateBL && (!cargo || !terminal || dateHeader.x>=cargo.x))) continue;
            const figures=band.filter(w=>['FIGURES','QTY'].includes(clean(w.text)) && w.conf>=70);
            const near=a=>figures.filter(w=>w.y>=a.y && ((a.referenceHeader && w.referenceHeader===a.referenceHeader) || Math.abs(center(w)-center(a))<dateHeader.h*2.5));
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
            const settings={regions,options:{top:top/height*100,bottom:bottom/height*100},evidence:{firstY:Math.min(...pairs.map(w=>w.y+w.h/2)),lastY:Math.max(...quantities.map(w=>w.y+w.h/2)),headerBottom:top,footerTop:total?.y},anchors};
            try{parse('',width,height,regions,settings.options);return settings;}catch{continue;}
            }
        }
        return null;
    }
    // Semantic fallback: headers name the fields; their coordinates name the order.
    function detectPhotoTable(tsv,width,height,pixels) {
        const original=detectPhotoTableLegacy(tsv,width,height,pixels);
        if(original)return original; // Preserve the validated first-format mapping exactly.
        const clean=s=>s.toUpperCase().replace(/[’‘]/g,"'").replace(/[^A-Z0-9/']/g,'');
        const words=tsvWords(tsv),center=w=>w.x+w.w/2;
        const span=ws=>({x:Math.min(...ws.map(w=>w.x)),right:Math.max(...ws.map(w=>w.x+w.w)),y:Math.min(...ws.map(w=>w.y)),bottom:Math.max(...ws.map(w=>w.y+w.h))});
        for(const d of words.filter(w=>w.conf>=60 && /^(?:(?:B\/L|BL|BIL|B1L|BOL))?DATE$/.test(clean(w.text)))) {
            const band=words.filter(w=>w.conf>=45 && Math.abs(w.y-d.y)<d.h*6),candidates={port:[],date:[span([d])],cargo:[],ship:[],bl:[]};
            for(const w of band) {
                const t=clean(w.text);
                if(/^(CARGO|PRODUCT)$/.test(t))candidates.cargo.push(span([w]));
                if(/^(PORT\/?TERMINAL|TERMINAL)$/.test(t))candidates.port.push(span([w]));
                if(t==='PORT'){
                    const terminal=band.find(b=>/^TERMINA[LІI1]$/.test(clean(b.text)) && b.x>=w.x && b.x-w.x-w.w<d.h*4 && Math.abs(b.y-w.y)<d.h*2);
                    candidates.port.push(span(terminal?[w,terminal]:[w]));
                }
                const fullShip=/^(SHIP'?S?|VESSEL)(FIGURES|QTY)$/.test(t) || t==='SFTCV';
                const fullBL=/^(B\/L|BL|BIL|B1L|BOL|SHORE)(FIGURES|QTY|TCV)$/.test(t);
                if(fullShip)candidates.ship.push(span([w]));
                if(fullBL)candidates.bl.push(span([w]));
                const f=/^(SHIP'?S?|VESSEL|SF)$/.test(t)?'ship':/^(B\/L|BL|BIL|B1L|BOL|SHORE)$/.test(t)?'bl':null;
                if(f){
                    const suffixes=band.filter(b=>b!==w && /^(FIGURES|QTY|TCV)$/.test(clean(b.text)) && b.conf>=60 && (Math.abs(center(b)-center(w))<Math.max(d.h*3,(w.w+b.w)/2) || (b.x>=w.x+w.w-d.h && b.x-w.x-w.w<d.h*3 && Math.abs(b.y-w.y)<d.h*2)) && b.y>=w.y-d.h && b.y-w.y<d.h*5);
                    for(const b of suffixes)candidates[f].push(span([w,b]));
                }
            }
            // Keep B/L next to DATE within the date header, never a quantity heading.
            const prefix=band.find(w=>/^(B\/L|BL|BIL|B1L|BOL)$/.test(clean(w.text)) && w.x<d.x && d.x-w.x-w.w<d.h*2 && Math.abs(w.y-d.y)<d.h);
            if(prefix)candidates.date=[span([prefix,d])];
            for(const ship of candidates.ship)for(const bl of candidates.bl){
                const anchors={date:candidates.date[0],ship,bl};
                for(const f of ['port','cargo']){
                    const a=candidates[f].sort((a,b)=>Math.abs(a.y-d.y)-Math.abs(b.y-d.y))[0];if(a)anchors[f]=a;
                }
                if(!anchors.port && !anchors.cargo)continue;
                const sorted=Object.entries(anchors).map(([f,a])=>({f,...a})).sort((a,b)=>a.x-b.x);
                if(sorted.some((a,i)=>i && a.x<sorted[i-1].right))continue;
                const top=Math.max(...sorted.map(a=>a.bottom))+1;
                const total=words.filter(w=>w.y>top && /^TOTALS?$/.test(clean(w.text))).sort((a,b)=>a.y-b.y)[0],footer=total?total.y-1:height;
                const edges=[];
                if(pixels && pixels.width===width && pixels.height===height){
                    const from=Math.max(0,Math.floor(Math.min(...sorted.map(a=>a.y)))),to=Math.min(height,Math.ceil(footer));let group=[];
                    const flush=()=>{if(group.length)edges.push((group[0]+group.at(-1))/2);group=[];};
                    for(let x=0;x<width;x++){let n=0;for(let y=from;y<to;y++){const i=(y*width+x)*4;if(pixels.data[i]<110 && pixels.data[i+1]<110 && pixels.data[i+2]<110)n++;}if(n/Math.max(1,to-from)>.55)group.push(x);else flush();}flush();
                }
                for(const rules of [true,false]){
                    const regions={};
                    for(let i=0;i<sorted.length;i++){
                        const a=sorted[i],c=(a.x+a.right)/2,leftRule=rules?edges.filter(x=>x<c).at(-1):undefined,rightRule=rules?edges.find(x=>x>c):undefined;
                        const ignored=band.filter(w=>w.x>a.right && !sorted.some(b=>w.x>=b.x && w.x<b.right)).sort((a,b)=>a.x-b.x)[0];
                        const left=leftRule??(i?(sorted[i-1].right+a.x)/2:Math.max(0,a.x-d.h));
                        const right=rightRule??(i+1<sorted.length?(a.right+sorted[i+1].x)/2:ignored?(a.right+ignored.x)/2:Math.min(width,a.right+d.h*2));
                        if(right-left<d.h)break;regions[a.f]=[left/width*100,right/width*100];
                    }
                    if(!regions.ship || !regions.bl || !regions.date)continue;
                    const inside=(w,f)=>center(w)/width*100>=regions[f][0] && center(w)/width*100<regions[f][1];
                    const quantities=words.filter(w=>w.y>=top && w.y<footer && /^\d[\d.,]*$/.test(w.text) && (inside(w,'ship') || inside(w,'bl')));
                    const pairs=quantities.filter(w=>inside(w,'ship') && quantities.some(b=>inside(b,'bl') && Math.abs((b.y+b.h/2)-(w.y+w.h/2))<Math.max(w.h,b.h)));
                    if(!pairs.length)continue;
                    const bottom=Math.min(footer,Math.max(...quantities.map(w=>w.y+w.h))+d.h/2);
                    const settings={regions,anchors,options:{top:top/height*100,bottom:bottom/height*100},evidence:{firstY:Math.min(...pairs.map(w=>w.y+w.h/2)),lastY:Math.max(...quantities.map(w=>w.y+w.h/2)),headerBottom:top,footerTop:total?.y}};
                    try{parse('',width,height,regions,settings.options);return settings;}catch{}
                }
            }
        }
        return null;
    }
    async function detectPhotoColumns(canvas, worker, makeCanvas) {
        const headerSource=makeCanvas?makeCanvas(canvas.width,canvas.height):null;
        if(headerSource)headerSource.getContext('2d').drawImage(canvas,0,0);
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
        if(makeCanvas && !detectPhotoTable(tsv,canvas.width,canvas.height)) {
            // A short header strip removes rules that survived page/block OCR.
            // Locate it from DATE geometry, not a fixed percentage or column order.
            const words=tsvWords(tsv),dates=words.filter(w=>w.conf>=60 && /DATE/i.test(w.text)).slice(0,3);
            for(const d of dates){
                const below=words.filter(w=>w.y>d.y+d.h && /^\d[\d.,]*$/.test(w.text)).map(w=>w.y);
                const top=Math.max(0,Math.floor(d.y-d.h*4)),bottom=Math.min(canvas.height,Math.ceil(d.y+d.h*4),below.length?Math.min(...below)-2:canvas.height);
                if(bottom<=top+d.h)continue;
                const scale=Math.min(4,Math.max(1,200/(bottom-top)),1800/canvas.width),pad=12;
                const crop=preparePhotoCell(headerSource,{left:0,right:canvas.width,top,bottom},makeCanvas,200,false,150,false,true,'max');
                await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
                const retry=await worker.recognize(crop,{}, {tsv:true});
                const lines=(retry.data.tsv || '').split(/\r?\n/).slice(1).map(line=>{const p=line.split('\t');if(+p[0]===5){p[6]=String((+p[6]-pad)/scale);p[7]=String((+p[7]-pad)/scale+top);p[8]=String(+p[8]/scale);p[9]=String(+p[9]/scale);}return p.join('\t');});
                tsv+='\n'+lines.join('\n');
                if(detectPhotoTable(tsv,canvas.width,canvas.height))break;
            }
        }
        return tsv;
    }
    // Photo only: line geometry fixes row identity before any cell OCR.
    function detectPhotoRows(pixels, settings) {
        const {width,height,data}=pixels, ranges=Object.values(settings.regions);
        if(['date','ship','bl'].some(f=>!settings.regions[f]))return null;
        const left=Math.ceil(Math.min(...ranges.map(r=>r[0]))/100*width),right=Math.floor(Math.max(...ranges.map(r=>r[1]))/100*width);
        const top=settings.options.top/100*height,bottom=settings.options.bottom/100*height;
        const last=settings.evidence?.lastY ?? bottom-10,footer=settings.evidence?.footerTop;
        const lines=[];let group=[];
        const flush=()=>{if(group.length)lines.push({y:(group[0]+group.at(-1))/2,start:group[0],end:group.at(-1)});group=[];};
        for(let y=Math.max(0,Math.floor(top-40));y<Math.min(height,Math.ceil((footer ?? bottom)+60));y++){
            let n=0;for(let x=left;x<right;x++){const i=(y*width+x)*4;if(data[i]*.299+data[i+1]*.587+data[i+2]*.114<140)n++;}
            if(n/Math.max(1,right-left)>.60)group.push(y);else flush();
        }flush();
        const start=lines.findIndex(l=>l.y>=top-12),end=Number.isFinite(footer)?lines.findLastIndex(l=>l.y<footer):lines.findIndex(l=>l.y>last);
        if(start<0 || end<=start)return null;
        const selected=lines.slice(start,end+1),gaps=selected.slice(1).map((l,i)=>l.y-selected[i].y),sorted=[...gaps].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
        // Missing rules / prose / merged geometry require explicit correction, never guessed row splitting.
        if(gaps.length>100 || median<8 || gaps.some(g=>g<median*.65 || g>median*1.45))return null;
        return selected.slice(1).map((l,i)=>({top:selected[i].end+2,bottom:l.start-2}));
    }
    function refinePhotoCellColumns(pixels, settings, bands) {
        if(!settings.anchors || !bands?.length)return settings;
        const {width,data}=pixels,from=bands[0].top,to=bands.at(-1).bottom,edges=[];let group=[];
        let mid=0,samples=0;for(let y=from;y<to;y+=8)for(let x=0;x<width;x+=8){const i=(y*width+x)*4,v=data[i]*.299+data[i+1]*.587+data[i+2]*.114;samples++;if(v>140 && v<235)mid++;}
        settings={...settings,options:{...settings.options,cellBinarize:mid/samples>.3}};
        if(!settings.options.cellBinarize)return settings;
        const flush=()=>{if(group.length)edges.push((group[0]+group.at(-1))/2);group=[];};
        for(let x=0;x<width;x++){
            let n=0;for(let y=from;y<to;y++){
                let dark=false;for(let dx=-4;dx<=4;dx++){if(x+dx<0 || x+dx>=width)continue;const i=(y*width+x+dx)*4;if(data[i]*.299+data[i+1]*.587+data[i+2]*.114<150){dark=true;break;}}
                if(dark)n++;
            }
            if(n/(to-from)>.75)group.push(x);else flush();
        }flush();
        const regions={};
        for(const f of fields){const a=settings.anchors[f];if(!a)continue;const center=(a.x+a.right)/2,left=edges.filter(x=>x<center).at(-1),right=edges.find(x=>x>center);if(left===undefined || right===undefined || left>a.x+5 || right<a.right-5)return settings;regions[f]=[left/width*100,right/width*100];}
        try{parse('',width,pixels.height,regions);return {...settings,regions};}catch{return settings;}
    }
    function fitPhotoCellBounds(pixels,bounds) {
        const {width,data}=pixels,out={...bounds};
        for(const side of ['left','right']){
            const expected=bounds[side]+(side==='left'?-3:3),groups=[];let group=[];
            const flush=()=>{if(group.length)groups.push(group);group=[];};
            for(let x=Math.max(0,Math.floor(expected-12));x<Math.min(width,Math.ceil(expected+12));x++){
                let n=0;for(let y=bounds.top;y<bounds.bottom;y++){const i=(y*width+x)*4;if(data[i]*.299+data[i+1]*.587+data[i+2]*.114<150)n++;}
                if(n/(bounds.bottom-bounds.top)>.82)group.push(x);else flush();
            }flush();
            const best=groups.sort((a,b)=>Math.abs((a[0]+a.at(-1))/2-expected)-Math.abs((b[0]+b.at(-1))/2-expected))[0];
            if(best)out[side]=side==='left'?best.at(-1)+3:best[0]-3;
        }
        return out;
    }
    function preparePhotoCell(canvas, bounds, makeCanvas, targetHeight=60, binary=false, cutoff=150, sharpen=false, cleanRules=false, channel='gray', stretch=1) {
        const {left,right,top,bottom}=bounds,w=right-left,h=bottom-top;
        const scale=Math.min(4,Math.max(1,targetHeight/h),1800/(w*stretch)),pad=12;
        const out=makeCanvas(Math.ceil(w*scale*stretch)+pad*2,Math.ceil(h*scale)+pad*2),ctx=out.getContext('2d');
        ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);
        ctx.drawImage(canvas,left,top,w,h,pad,pad,w*scale*stretch,h*scale);
        const pixels=ctx.getImageData(0,0,out.width,out.height),hist=new Uint32Array(256);
        if(binary || cleanRules)removeTableRules(pixels,{cell:[0,100]});
        for(let i=0;i<pixels.data.length;i+=4){const v=Math.round(channel==='max'?Math.max(pixels.data[i],pixels.data[i+1],pixels.data[i+2]):pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114);hist[v]++;}
        const count=out.width*out.height;let low=0,sum=0;for(;low<255;low++){sum+=hist[low];if(sum>=count*.01)break;}
        let high=255;sum=0;for(;high>low;high--){sum+=hist[high];if(sum>=count*.95)break;}
        const gray=new Float32Array(count);
        for(let i=0,j=0;i<pixels.data.length;i+=4,j++){const v=channel==='max'?Math.max(pixels.data[i],pixels.data[i+1],pixels.data[i+2]):pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114;gray[j]=high-low>40?Math.max(0,Math.min(255,(v-low)*255/(high-low))):v;}
        for(let j=0;j<count;j++){
            let v=gray[j];
            if(sharpen && j>out.width && j<count-out.width && j%out.width>0 && j%out.width<out.width-1){const blur=(gray[j-1]+gray[j+1]+gray[j-out.width]+gray[j+out.width])/4;v=Math.max(0,Math.min(255,v+1.2*(v-blur)));}
            const i=j*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=binary?(v<cutoff?0:255):v;pixels.data[i+3]=255;
        }
        ctx.putImageData(pixels,0,0);return out;
    }
    // Photo-only inference: use confident cells whose grouping syntax rules out
    // the opposite convention. Repeated ambiguous 1.234 values are not evidence.
    function inferPhotoNumberMode(rows) {
        let dot=0,comma=0;
        for(const row of rows)for(const f of ['ship','bl']){
            if(!row.ocrReliable?.[f])continue;
            const raw=row.raw[f],d=quantity(raw,'dot'),c=quantity(raw,'comma');
            if(d && !c)dot++;if(c && !d)comma++;
        }
        return dot>=3 && !comma?'dot':comma>=3 && !dot?'comma':'auto';
    }
    // Content-only retry crop: letter/digit-sized ink components seed a box.
    // Small separators inside it remain untouched; table edges are not seeds.
    function photoCellContentBounds(pixels,bounds) {
        const w=bounds.right-bounds.left,h=bounds.bottom-bounds.top,seen=new Uint8Array(w*h),boxes=[];
        const ink=(x,y)=>{const i=((y+bounds.top)*pixels.width+x+bounds.left)*4;return Math.max(pixels.data[i],pixels.data[i+1],pixels.data[i+2])<155;};
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const at=y*w+x;if(seen[at] || !ink(x,y))continue;
            const queue=[at];seen[at]=1;let minX=x,maxX=x,minY=y,maxY=y;
            for(let q=0;q<queue.length;q++){
                const k=queue[q],cx=k%w,cy=Math.floor(k/w);minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
                for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
                    const nx=cx+dx,ny=cy+dy;if(nx<0 || nx>=w || ny<0 || ny>=h)continue;
                    const next=ny*w+nx;if(!seen[next] && ink(nx,ny)){seen[next]=1;queue.push(next);}
                }
            }
            const ch=maxY-minY+1,cw=maxX-minX+1;
            if(ch>=h*.35 && ch<=h*.92 && cw>=2 && queue.length>=h*.4 && minY>0 && maxY<h-1 && !(cw>w*.65 && ch<h*.5))boxes.push({minX,maxX,minY,maxY});
        }
        if(boxes.length<2)return bounds;
        const padX=Math.ceil(h*.12),padY=Math.ceil(h*.08);
        return {left:Math.max(bounds.left,bounds.left+Math.min(...boxes.map(b=>b.minX))-padX),right:Math.min(bounds.right,bounds.left+Math.max(...boxes.map(b=>b.maxX))+1+padX),top:Math.max(bounds.top,bounds.top+Math.min(...boxes.map(b=>b.minY))-padY),bottom:Math.min(bounds.bottom,bounds.top+Math.max(...boxes.map(b=>b.maxY))+1+padY)};
    }
    // Proper names can have one weak word even when the whole cell is stable.
    // This fallback uses only repeated reads of this cell, never other voyages.
    function portReadingConsensus(readings) {
        const syntax=r=>/^[A-Z0-9](?:[A-Z0-9 /'&().-]*[A-Z0-9])?$/.test(r.raw) && /[A-Z]/.test(r.raw);
        const score=r=>r.words.reduce((sum,w)=>sum+w.conf*w.text.length,0)/r.words.reduce((sum,w)=>sum+w.text.length,0);
        const usable=r=>syntax(r) && r.words.length>0 && r.words.every(w=>Number.isFinite(w.conf) && w.conf>=20) && score(r)>=60;
        const usableReadings=readings.filter(usable);
        if(new Set(usableReadings.map(r=>r.raw)).size!==1)return null;
        const unique=[...new Map(usableReadings.filter(r=>r.variant).map(r=>[r.variant,r])).values()];
        const strong=unique.filter(r=>r.words.every(w=>w.conf>=40) && score(r)>=70);
        if(strong.length<2 || new Set(unique.map(r=>r.raw)).size!==1 || unique.length<3)return null;
        // Different crop / pixel treatments must support the result; repeated
        // segmentation of identical pixels alone does not establish agreement.
        if(new Set(unique.map(r=>r.treatment)).size<2)return null;
        return strong.reduce((best,r)=>score(r)>score(best)?r:best);
    }
    async function recognizePhotoCells(canvas, settings, rowBands, worker, makeCanvas, progress=()=>{}) {
        const rows=[],sourcePixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
        await worker.setParameters({tessedit_pageseg_mode:'7',preserve_interword_spaces:'1'});
        for(let i=0;i<rowBands.length;i++){
            const row={warnings:[],raw:{},ocrReliable:{},manualExclude:false,reason:'',sourceRow:i+1};
            for(const f of fields){
                progress(i+1,rowBands.length,f);
                if(!settings.regions[f]){row[f]='';row.raw[f]='';row.ocrReliable[f]=false;row.warnings.push(labels[fields.indexOf(f)]+': column not identified; verify original.');continue;}
                const [a,b]=settings.regions[f],band=rowBands[i];
                let bounds={left:Math.ceil(a/100*canvas.width)+3,right:Math.floor(b/100*canvas.width)-3,top:band.top,bottom:band.bottom};
                if(settings.options.cellBinarize)bounds=fitPhotoCellBounds(sourcePixels,bounds);
                if(bounds.right<=bounds.left || bounds.bottom<=bounds.top)throw new Error('Invalid cell geometry; use Advanced correction.');
                const whitelist=f==='date'?'0123456789-/.':(['ship','bl'].includes(f)?'0123456789., ':"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /-'&().");
                await worker.setParameters({tessedit_char_whitelist:whitelist});
                const threshold=['ship','bl','date'].includes(f)?85:70;
                const valid=raw=>f==='date'?!!date(raw,settings.options.dateOrder):['ship','bl'].includes(f)?!!(quantity(raw,'dot') || quantity(raw,'comma')):/^[A-Z0-9](?:[A-Z0-9 /'&().-]*[A-Z0-9])?$/.test(raw);
                const reliable=r=>valid(r.raw) && r.words.length>0 && r.words.every(w=>w.conf>=threshold);
                let contentCrop;
                const read=async(size,binary,cutoff,sharpen=false,psm=7,verification=false,margin=0,channel='gray',stretch=1)=>{
                    await worker.setParameters({tessedit_pageseg_mode:String(psm),tessedit_char_whitelist:verification?'':whitelist});
                    progress(i+1,rowBands.length,f);
                    // Retry margins stay inside this column and this geometric row.
                    const crop=margin==='content'?(contentCrop ||= photoCellContentBounds(sourcePixels,bounds)):margin?{left:Math.max(Math.ceil(a/100*canvas.width)+1,bounds.left-margin),right:Math.min(Math.floor(b/100*canvas.width)-1,bounds.right+margin),top:Math.max(band.top-1,bounds.top-margin),bottom:Math.min(band.bottom+1,bounds.bottom+margin)}:bounds;
                    const image=preparePhotoCell(canvas,crop,makeCanvas,size,binary,cutoff,sharpen,!!margin,channel,stretch);
                    const treatment=JSON.stringify([crop,image.width,image.height,binary,binary?cutoff:null,sharpen,!!margin,channel,stretch]);
                    const variant=JSON.stringify([treatment,psm,verification]);
                    const result=await worker.recognize(image,{}, {tsv:true});
                    const words=tsvWords(result.data.tsv || '').sort((a,b)=>Math.abs(a.y-b.y)>Math.min(a.h,b.h)*.6?a.y-b.y:a.x-b.x);
                    return {variant,treatment,words,raw:words.map(w=>w.text).join(' ').replace(['ship','bl'].includes(f)?/\s*([.,])\s*/g:/$^/g,'$1')};
                };
                const primary=await read(f==='cargo'?100:60,f==='port'?false:settings.options.cellBinarize,150);
                let {words,raw}=primary,portConsensus=false;
                if(!reliable({words,raw})){
                    const readings=[primary],variants=settings.options.cellBinarize?[[80,false,150],[140,false,150],[140,true,150],[100,true,170],[100,true,130],[100,false,150],[60,true,150],[160,false,150,true],[160,true,150,true],[140,true,150,false,6],[200,false,150,false,6]]:[[140,false,150],[80,false,150],[60,false,150],[160,false,150,true],[140,false,150,false,6]];
                    if(['ship','bl','date'].includes(f))variants.push([60,settings.options.cellBinarize,150,false,7,true],[80,settings.options.cellBinarize,150,false,7,true]);
                    variants.push([100,false,150,false,7,false,2],[80,false,150,false,7,false,2],[100,true,150,false,7,false,2],[100,true,170,false,7,false,2],[100,true,130,false,7,false,2],[100,false,150,false,6,false,2],[100,false,150,false,8,false,2]);
                    variants.push([100,false,150,false,7,false,'content','max'],[80,false,150,false,7,false,'content','max'],[100,true,150,false,7,false,'content','max'],[80,true,170,false,7,false,'content','max']);
                    variants.push([100,false,150,false,7,false,2,'max'],[80,false,150,false,7,false,2,'max'],[100,true,170,false,7,false,2,'max'],[140,true,170,false,7,false,2,'max']);
                    variants.push([100,false,150,false,7,false,'content','max',1.15],[80,false,150,false,7,false,'content','max',1.15],[100,true,150,false,7,false,'content','max',1.15],[80,true,150,false,7,false,'content','max',1.15],[100,false,150,false,6,false,'content','max'],[100,true,150,false,6,false,'content','max']);
                    // Try content crops first: they remove border noise without extra row OCR.
                    variants.sort((a,b)=>(a[6]==='content'?0:a[6]?1:2)-(b[6]==='content'?0:b[6]?1:2));
                    for(const [size,binary,cutoff,sharpen,psm,verification,margin,channel,stretch] of variants){
                        const alternative=await read(size,binary,cutoff,sharpen,psm,verification,margin,channel,stretch);readings.push(alternative);
                        // A retry may replace an uncertain first reading only if an
                        // second preprocessing / segmentation variant agrees, without relaxing confidence.
                        if(reliable(alternative) && readings.slice(0,-1).some(r=>r.raw===alternative.raw && reliable(r)) && readings.filter(reliable).every(r=>r.raw===alternative.raw)){
                            words=alternative.words;raw=alternative.raw;break;
                        }
                    }
                    if(f==='port' && !reliable({words,raw})){
                        const agreed=portReadingConsensus(readings);
                        if(agreed){words=agreed.words;raw=agreed.raw;portConsensus=true;row.warnings.push('Port / Terminal: accepted by concordant cell OCR; verify proper name.');}
                    }
                }
                row.raw[f]=raw;row.ocrReliable[f]=portConsensus || reliable({words,raw});
                row[f]=!row.ocrReliable[f]?'':['ship','bl'].includes(f)?quantity(raw,settings.options.numberMode):f==='date'?date(raw,settings.options.dateOrder):raw;
                if(!row[f])row.warnings.push(labels[fields.indexOf(f)]+(raw?': unreadable / ambiguous ('+raw+')':': missing'));
            }
            // A blank cell, or extra OCR fragment, cannot create, delete or shift a geometric row.
            rows.push(row);
        }
        rows.numberMode=settings.options.numberMode || 'auto';
        if(rows.numberMode==='auto'){
            rows.numberMode=inferPhotoNumberMode(rows);
            if(rows.numberMode!=='auto')for(const row of rows)for(const f of ['ship','bl']){
                row[f]=row.ocrReliable[f]?quantity(row.raw[f],rows.numberMode):'';
                if(row[f])row.warnings=row.warnings.filter(w=>!w.startsWith(labels[fields.indexOf(f)]+':'));
            }
        }
        return rows;
    }
    const api = { portReadingConsensus, quantity, date, parse, removeTableRules, recognizeColumns, tsvWords, detectPhotoTable, detectPhotoColumns, detectPhotoRows, refinePhotoCellColumns, fitPhotoCellBounds, preparePhotoCell, photoCellContentBounds, inferPhotoNumberMode, recognizePhotoCells };
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
        el('photoNumbers').value='auto';
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
                settings={...detected,options:{...settings.options,...detected.options}};
                applyDetectedTable(settings);
                const bands=detectPhotoRows(pixels,settings);
                if(!bands){el('photoAdvanced').open=true;status('Automatic row grid could not be verified. Use a clearer photo or Advanced correction. No data was imported.');return;}
                settings=refinePhotoCellColumns(pixels,settings,bands);applyDetectedTable(settings);
                const rows=await recognizePhotoCells(canvas,settings,bands,w,(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;},(i,n,f)=>{if(token!==generation)throw new Error('Source changed.');status('Reading table cells: row '+i+' / '+n+' — '+labels[fields.indexOf(f)]);});
                if(token===generation){if(settings.options.numberMode==='auto' && rows.numberMode!=='auto')el('photoNumbers').value=rows.numberMode;rows.forEach(row=>{row.source='Photo cell OCR — geometric row '+row.sourceRow;});render(rows);status(rows.length+' table rows found. '+(rows.numberMode==='dot'?'Decimal dot / thousands comma. ':rows.numberMode==='comma'?'Decimal comma / thousands dot. ':'Numeric convention uncertain; use the selector to correct it. ')+'All cells stay in their geometric row. Verify, select and import; no VEF is calculated.');if(typeof el('photoRows').scrollIntoView==='function')el('photoRows').scrollIntoView({block:'start'});}
                return;
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
