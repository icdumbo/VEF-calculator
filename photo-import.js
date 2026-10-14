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
    function photoHeaderCells(pixels) {
        const {width,height,data}=pixels,dark=(x,y)=>{const i=(y*width+x)*4;return Math.max(data[i],data[i+1],data[i+2])<140;};
        const lines=[];let group=[];
        const flush=()=>{if(group.length)lines.push({start:group[0],end:group.at(-1),y:(group[0]+group.at(-1))/2});group=[];};
        for(let y=0;y<height;y++){let n=0;for(let x=0;x<width;x++)if(dark(x,y))n++;if(n/width>.6)group.push(y);else flush();}flush();
        const gaps=lines.slice(1).map((l,i)=>l.y-lines[i].y).filter(g=>g>8).sort((a,b)=>a-b),median=gaps[Math.floor(gaps.length/2)];
        if(!median)return [];
        const cells=[];
        for(let k=0;k<lines.length-4;k++){
            const gap=lines[k+1].y-lines[k].y;
            if(gap<median*1.5 || gap>median*6 || ![1,2,3].every(j=>Math.abs((lines[k+j+1].y-lines[k+j].y)/median-1)<.35))continue;
            const top=lines[k].end+2,bottom=lines[k+1].start-2,edges=[];group=[];
            const edge=()=>{if(group.length)edges.push({start:group[0],end:group.at(-1)});group=[];};
            for(let x=0;x<width;x++){let n=0;for(let y=top;y<bottom;y++)if(dark(x,y))n++;if(n/Math.max(1,bottom-top)>.65)group.push(x);else edge();}edge();
            if(edges.length<4 || edges.length>17)continue;
            for(let i=1;i<edges.length;i++){const left=edges[i-1].end+2,right=edges[i].start-2;if(right-left>=12)cells.push({left,right,top,bottom});}
            break;
        }
        return cells;
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
        const partial=detectPhotoTable(tsv,canvas.width,canvas.height);
        if(makeCanvas && (!partial || fields.some(f=>!partial.regions[f]))) {
            // Geometry determines header cells; OCR names them without an order assumption.
            // A valid partial table must not suppress recovery of an unread optional header.
            const pixels=headerSource.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
            for(const bounds of photoHeaderCells(pixels)){
                const scale=Math.min(4,Math.max(1,120/(bounds.bottom-bounds.top)),1800/(bounds.right-bounds.left)),pad=12;
                const crop=preparePhotoCell(headerSource,bounds,makeCanvas,120,false,150,false,true,'max');
                await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
                const result=await worker.recognize(crop,{}, {tsv:true});
                const lines=(result.data.tsv || '').split(/\r?\n/).slice(1).map(line=>{const p=line.split('\t');if(+p[0]===5){p[6]=String((+p[6]-pad)/scale+bounds.left);p[7]=String((+p[7]-pad)/scale+bounds.top);p[8]=String(+p[8]/scale);p[9]=String(+p[9]/scale);}return p.join('\t');});
                tsv+='\n'+lines.join('\n');
            }
        }
        return tsv;
    }
    // Photo only: line geometry fixes row identity before any cell OCR.
    function detectPhotoRowsLegacy(pixels, settings) {
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
    // Independently observed short rule segments tolerate residual skew and
    // unequal column widths. Never interpolate a missing separator or row.
    function detectPhotoRows(pixels,settings) {
        const original=detectPhotoRowsLegacy(pixels,settings);
        if(original)return original;
        if(['date','ship','bl'].some(f=>!settings.regions[f]))return null;
        const {width,height,data}=pixels,ranges=Object.values(settings.regions);
        const left=Math.max(0,Math.ceil(Math.min(...ranges.map(r=>r[0]))*width/100)),right=Math.min(width-1,Math.floor(Math.max(...ranges.map(r=>r[1]))*width/100)),span=right-left;
        if(span<60)return null;
        const first=settings.evidence?.firstY,last=settings.evidence?.lastY,footer=settings.evidence?.footerTop;
        if(!Number.isFinite(first) || !Number.isFinite(last) || first>last)return null;
        const radius=Math.max(4,Math.min(14,Math.round(height/180))),half=Math.max(8,Math.min(28,Math.floor(span/40)));
        const from=Math.max(0,Math.floor(Math.min(settings.options.top*height/100,first)-radius*4)),to=Math.min(height-1,Math.ceil((footer??settings.options.bottom*height/100)+radius*5));
        const strips=[];
        for(let k=0;k<9;k++){
            const x=Math.max(half,Math.min(width-half-1,Math.round(left+span*(k+.5)/9))),profile=[];
            for(let y=from;y<=to;y++){let sum=0,n=0;for(let dx=-half;dx<=half;dx+=2){const i=(y*width+x+dx)*4;sum+=data[i]*.299+data[i+1]*.587+data[i+2]*.114;n++;}profile.push(sum/n);}
            const rules=[];let group=[];
            const flush=()=>{if(group.length){const start=group[0],end=group.at(-1);if(end-start<=radius*2)rules.push({x,y:(start+end)/2,start,end});}group=[];};
            for(let y=from;y<=to;y++){
                const at=y-from,background=Math.max(profile[Math.max(0,at-radius)],profile[Math.min(profile.length-1,at+radius)]);
                let n=0,total=0;const threshold=Math.min(200,background-22);
                for(let dx=-half;dx<=half;dx+=2){const i=(y*width+x+dx)*4;if(data[i]*.299+data[i+1]*.587+data[i+2]*.114<threshold)n++;total++;}
                if(background-profile[at]>25 && n/total>.78)group.push(y);else flush();
            }flush();strips.push(rules);
        }
        const tracks=[],tolerance=Math.max(2,half*.08);
        for(const a of strips[0])for(const b of strips.at(-1)){
            const slope=(b.y-a.y)/(b.x-a.x);if(Math.abs(slope)>.12)continue;
            const points=strips.map(rs=>rs.filter(r=>Math.abs(r.y-(a.y+slope*(r.x-a.x)))<=tolerance).sort((u,v)=>Math.abs(u.y-(a.y+slope*(u.x-a.x)))-Math.abs(v.y-(a.y+slope*(v.x-a.x))))[0]).filter(Boolean);
            if(points.length<7)continue;
            const mx=points.reduce((s,p)=>s+p.x,0)/points.length,my=points.reduce((s,p)=>s+p.y,0)/points.length;
            const m=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/points.reduce((s,p)=>s+(p.x-mx)**2,0),y=my+m*((left+right)/2-mx),thickness=Math.max(...points.map(p=>p.end-p.start))/2+1;
            if(points.some(p=>Math.abs(p.y-(my+m*(p.x-mx)))>tolerance))continue;
            if(!tracks.some(t=>Math.abs(t.y-y)<radius))tracks.push({y,slope:m,x:(left+right)/2,thickness});
        }
        tracks.sort((a,b)=>a.y-b.y);
        // The first/last observed data centers must be enclosed by real rules.
        const start=tracks.findLastIndex(t=>t.y<first),end=tracks.findIndex(t=>t.y>last);
        if(start<0 || end<=start || Number.isFinite(footer) && tracks[end].y>=footer)return null;
        const selected=tracks.slice(start,end+1),gaps=selected.slice(1).map((t,i)=>t.y-selected[i].y),sorted=[...gaps].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
        if(gaps.length>100 || median<8 || gaps.some(g=>g<median*.65 || g>median*1.45))return null;
        const bands=selected.slice(1).map((lower,i)=>({top:Math.ceil(selected[i].y+selected[i].thickness+2),bottom:Math.floor(lower.y-lower.thickness-2),upper:selected[i],lower}));
        if(bands.some(b=>Object.values(settings.regions).some(r=>{const s=photoRowCellBand(b,r[0]*width/100,r[1]*width/100);return s.bottom-s.top<8;})))return null;
        return bands;
    }
    function photoRowCellBand(band,left,right) {
        if(!band.upper)return band;
        const at=(t,x)=>t.y+t.slope*(x-t.x);
        return {top:Math.ceil(Math.max(at(band.upper,left),at(band.upper,right))+band.upper.thickness+2),bottom:Math.floor(Math.min(at(band.lower,left),at(band.lower,right))-band.lower.thickness-2)};
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
    function photoRowCellRegions(pixels,settings,band) {
        // Global semantic identity is fixed. Locate the same separators inside
        // this row so a slightly sloping rule cannot clip the final digit.
        const sorted=Object.entries(settings.regions).sort((a,b)=>a[1][0]-b[1][0]),width=pixels.width;
        const boundaries=[sorted[0][1][0]*width/100,...sorted.map(x=>x[1][1]*width/100)],found=[];
        for(let k=0;k<boundaries.length;k++){
            const adjacent=[];if(k)adjacent.push(boundaries[k]-boundaries[k-1]);if(k+1<boundaries.length)adjacent.push(boundaries[k+1]-boundaries[k]);
            const radius=Math.min(...adjacent)*.45,edge=boundaries[k],groups=[];let group=[];
            const flush=()=>{if(group.length)groups.push((group[0]+group.at(-1))/2);group=[];};
            for(let x=Math.max(0,Math.floor(edge-radius));x<Math.min(width,Math.ceil(edge+radius));x++){
                let n=0;for(let y=band.top;y<band.bottom;y++){let dark=false;for(let dx=-2;dx<=2;dx++){if(x+dx<0 || x+dx>=width)continue;const i=(y*width+x+dx)*4;if(pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114<150){dark=true;break;}}if(dark)n++;}
                if(n/Math.max(1,band.bottom-band.top)>.82)group.push(x);else flush();
            }flush();
            found.push(groups.sort((a,b)=>Math.abs(a-edge)-Math.abs(b-edge))[0] ?? edge);
        }
        if(found.some((x,i)=>i && x-found[i-1]<Math.max(12,(boundaries[i]-boundaries[i-1])*.5)))return settings.regions;
        return Object.fromEntries(sorted.map(([f],i)=>[f,[found[i]/width*100,found[i+1]/width*100]]));
    }
    function photoCellValue(raw,field,options={}) {
        if(field==='date')return date(raw.replace(/\s*([./-])\s*/g,'$1'),options.dateOrder);
        if(field==='ship' || field==='bl'){
            const mode=options.numberMode || 'auto';
            if(mode!=='auto')return quantity(raw,mode);
            const d=quantity(raw,'dot'),c=quantity(raw,'comma');
            return d && c && d!==c?'ambiguous:'+raw.trim():d || c;
        }
        const text=raw.trim().replace(/\s+/g,' ').toUpperCase();
        return /^[A-Z0-9](?:[A-Z0-9 /'&().,+:;%_-]*[A-Z0-9.)%])?$/.test(text) && /[A-Z0-9]/.test(text)?text:'';
    }
    function photoCellConsensus(readings,field,options={}) {
        const score=r=>r.words.reduce((sum,w)=>sum+w.conf*w.text.length,0)/r.words.reduce((sum,w)=>sum+w.text.length,0);
        const usable=readings.map(r=>({...r,value:photoCellValue(r.raw,field,options),score:score(r)})).filter(r=>r.value && r.words.length && r.words.every(w=>Number.isFinite(w.conf) && w.conf>=10) && r.score>=45);
        const groups=new Map();for(const r of usable){if(!groups.has(r.value))groups.set(r.value,[]);groups.get(r.value).push(r);}
        const supported=[];
        for(const [value,all] of groups){
            const unique=[...new Map(all.map(r=>[r.variant,r])).values()];
            if(new Set(unique.map(r=>r.treatment)).size<2)continue;
            const high=unique.filter(r=>r.score>=85 && r.words.every(w=>w.conf>=60));
            const strong=unique.filter(r=>r.score>=65);
            if(high.length<2 && !(unique.length>=3 && strong.length>=2))continue;
            supported.push({value,all,best:unique.reduce((a,b)=>a.score>=b.score?a:b)});
        }
        if(supported.length!==1)return null;
        const chosen=supported[0];
        for(const [value,other] of groups)if(value!==chosen.value && (other.some(r=>r.score>=85) || new Set(other.filter(r=>r.score>=65).map(r=>r.variant)).size>=2))return null;
        return chosen.best;
    }
    function smoothPhotoCell(image) {
        const ctx=image.getContext('2d'),p=ctx.getImageData(0,0,image.width,image.height),source=p.data.slice(),weights=[1,2,1];
        for(let y=1;y<image.height-1;y++)for(let x=1;x<image.width-1;x++){
            let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=source[((y+dy)*image.width+x+dx)*4]*weights[dy+1]*weights[dx+1];
            const at=(y*image.width+x)*4,v=Math.round(sum/16);p.data[at]=p.data[at+1]=p.data[at+2]=v;
        }
        ctx.putImageData(p,0,0);return image;
    }
    function adaptivePhotoCell(image) {
        const ctx=image.getContext('2d'),pixels=ctx.getImageData(0,0,image.width,image.height),{width,height,data}=pixels;
        const stride=width+1,integral=new Float64Array(stride*(height+1));
        for(let y=0;y<height;y++){let sum=0;for(let x=0;x<width;x++){sum+=data[(y*width+x)*4];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;}}
        const radius=Math.max(9,Math.ceil(height/8));
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const l=Math.max(0,x-radius),r=Math.min(width,x+radius+1),t=Math.max(0,y-radius),b=Math.min(height,y+radius+1);
            const mean=(integral[b*stride+r]-integral[t*stride+r]-integral[b*stride+l]+integral[t*stride+l])/((r-l)*(b-t)),at=(y*width+x)*4,v=data[at]<mean-10?0:255;
            data[at]=data[at+1]=data[at+2]=v;
        }
        ctx.putImageData(pixels,0,0);return image;
    }
    // Suppress fine photographed-screen texture before enlargement. Only this
    // cell's pixels are used; filtering never changes table/row coordinates.
    function nativePhotoCell(canvas,bounds,makeCanvas,kind,strength) {
        const out=makeCanvas(bounds.right-bounds.left,bounds.bottom-bounds.top),ctx=out.getContext('2d');
        ctx.drawImage(canvas,bounds.left,bounds.top,out.width,out.height,0,0,out.width,out.height);
        const p=ctx.getImageData(0,0,out.width,out.height);
        if(!['gaussian','content'].includes(kind))removeTableRules(p,{cell:[0,100]});
        for(let i=0;i<p.data.length;i+=4)p.data[i]=p.data[i+1]=p.data[i+2]=Math.max(p.data[i],p.data[i+1],p.data[i+2]);
        if(kind==='median'){
            const original=p.data.slice(),radius=strength,values=[];
            for(let y=radius;y<out.height-radius;y++)for(let x=radius;x<out.width-radius;x++){
                values.length=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)values.push(original[((y+dy)*out.width+x+dx)*4]);
                values.sort((a,b)=>a-b);const i=(y*out.width+x)*4;p.data[i]=p.data[i+1]=p.data[i+2]=values[values.length>>1];
            }
        }
        ctx.putImageData(p,0,0);
        if(kind!=='median')for(let n=0;n<strength;n++)smoothPhotoCell(out);
        return out;
    }
    function photoFamilyConsensus(families,field,options={}) {
        const picked=families.map(rs=>photoCellConsensus(rs,field,options));
        const winners=[...new Map(picked.flatMap((r,i)=>r?[[r.pixelKey || 'family:'+i,r]]:[])).values()];
        if(!winners.length || new Set(winners.map(r=>r.value)).size!==1)return null;
        const best=winners.reduce((a,b)=>a.score>=b.score?a:b);
        // Moderate confidence needs support from independently prepared families.
        if(best.score<85 && winners.length<2)return null;
        const conflicts=new Map();
        for(const r of families[0]){
            const value=photoCellValue(r.raw,field,options),score=r.words.reduce((n,w)=>n+w.conf*w.text.length,0)/r.words.reduce((n,w)=>n+w.text.length,0);
            if(!value || value===best.value || score<85 || r.words.some(w=>!Number.isFinite(w.conf) || w.conf<10))continue;
            if(!conflicts.has(value))conflicts.set(value,new Set());conflicts.get(value).add(r.treatment);
        }
        // Do not replace an unresolved legacy cell when distinct pixel treatments
        // repeatedly support another valid value. Never synthesize a compromise.
        return [...conflicts.values()].some(s=>s.size>=2)?null:best;
    }
    function cleanPhotoCellEdges(image,cutoff=140) {
        const ctx=image.getContext('2d'),p=ctx.getImageData(0,0,image.width,image.height),{width,height,data}=p;
        const dark=(x,y)=>data[(y*width+x)*4]<cutoff,white=(x,y)=>{const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=255;};
        const columns=[];
        for(let x=0;x<width;x++){
            if(x>height*.4 && x<width-height*.4)continue;
            let n=0,top=false,bottom=false;const end=Math.ceil(height*.08);
            for(let y=0;y<height;y++)if(dark(x,y)){n++;if(y<end)top=true;if(y>=height-end)bottom=true;}
            // A border spans both ends; a tall glyph inside the row does not.
            if(n/height>.65 && top && bottom)columns.push(x);
        }
        for(const x of columns)for(let dx=-1;dx<=1;dx++)if(x+dx>=0 && x+dx<width)for(let y=0;y<height;y++)white(x+dx,y);
        const rows=[];
        for(let y=0;y<height;y++){
            if(y>height*.1 && y<height*.9)continue;
            let n=0,left=false,right=false;const end=Math.ceil(width*.05);
            for(let x=0;x<width;x++)if(dark(x,y)){n++;if(x<end)left=true;if(x>=width-end)right=true;}
            if(n/width>.6 && left && right)rows.push(y);
        }
        for(const y of rows)for(let dy=-1;dy<=1;dy++)if(y+dy>=0 && y+dy<height)for(let x=0;x<width;x++)white(x,y+dy);
        ctx.putImageData(p,0,0);return image;
    }
    async function photoCellPixelKey(image) {
        const data=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
        if(root.crypto?.subtle){
            const bytes=new Uint8Array(data.length+8),view=new DataView(bytes.buffer);
            view.setUint32(0,image.width);view.setUint32(4,image.height);bytes.set(data,8);
            const hash=new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes));
            return [...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
        }
        // Deterministic fallback for test/older contexts; both hashes include
        // every byte, with dimensions kept separately to distinguish shapes.
        let a=2166136261,b=5381;
        for(const value of data){a=Math.imul(a^value,16777619);b=(Math.imul(b,33)^value)>>>0;}
        return image.width+':'+image.height+':'+(a>>>0)+':'+b;
    }
    async function recognizePhotoCellEdges(canvas,bounds,worker,makeCanvas,progress=()=>{}) {
        const readings=[],cache=new Map();
        for(const cutoff of [140,165]){
            const source=cleanPhotoCellEdges(nativePhotoCell(canvas,bounds,makeCanvas,'gaussian',1),cutoff);
            for(const size of [60,90])for(const psm of [7,6]){
                progress();
                const crop=preparePhotoCell(source,{left:0,right:source.width,top:0,bottom:source.height},makeCanvas,size,false,150,false,true,'gray');
                await worker.setParameters({tessedit_pageseg_mode:String(psm),tessedit_char_whitelist:''});
                const treatment=await photoCellPixelKey(crop),variant=JSON.stringify([treatment,psm]);
                if(!cache.has(variant)){
                    const result=await worker.recognize(crop,{}, {tsv:true}),words=tsvWords(result.data.tsv || '').sort((a,b)=>Math.abs(a.y-b.y)>Math.min(a.h,b.h)*.6?a.y-b.y:a.x-b.x);
                    cache.set(variant,{words,raw:words.map(w=>w.text).join(' '),variant,treatment,pixelKey:treatment});
                }
                readings.push(cache.get(variant));
            }
        }
        return readings;
    }
    // Retain every semantically valid cell candidate, including zero-confidence
    // words. Agreement is counted once per pixel treatment, never per retry.
    function photoCellEvidenceGroups(families,field,options={}) {
        const groups=new Map();
        families.forEach((readings,family)=>{
            for(const r of readings){
                const value=photoCellValue(r.raw,field,options),length=r.words.reduce((n,w)=>n+w.text.length,0);
                if(!value || !length || r.words.some(w=>!Number.isFinite(w.conf) || w.conf<0))continue;
                const score=r.words.reduce((n,w)=>n+w.conf*w.text.length,0)/length,key=r.pixelKey || family+':'+r.treatment;
                if(!groups.has(value))groups.set(value,new Map());
                const pixels=groups.get(value),old=pixels.get(key);
                if(!old || score>old.score)pixels.set(key,{...r,value,score,family:old?.family ?? family});
            }
        });
        return [...groups].map(([value,pixels])=>{
            const readings=[...pixels.values()];
            return {value,count:pixels.size,families:new Set(readings.map(r=>r.family)).size,best:readings.reduce((a,b)=>a.score>=b.score?a:b)};
        }).sort((a,b)=>b.count-a.count || b.best.score-a.best.score);
    }
    function reconcilePhotoCellEvidence(families,field,options={},current=null) {
        const groups=photoCellEvidenceGroups(families,field,options);
        if(current){
            // A repeated valid numeric/date alternative can be credible even
            // when only one of its corroborating reads has high confidence.
            if(['date','ship','bl'].includes(field) && groups.some(g=>g.value!==current.value && g.count>=2 && g.families>=2 && g.best.score>=85))return null;
            return current;
        }
        const best=groups[0];
        // No confidence floor: require a clearly dominant, repeated value from
        // distinct preparations. Conflicting repeated valid values stay blank.
        if(!best || best.count<4 || best.families<2 || best.count<3*(groups[1]?.count || 0) || groups.slice(1).some(g=>g.count>=4 && g.families>=2))return null;
        return best.best;
    }
    // A secondary check of disputed glyphs, not another vote on whole words.
    // Only an already observed, valid candidate can be recovered. Different
    // character classes, lengths or separators cannot be guessed into agreement.
    function photoGlyphPlan(families,field,options={}) {
        if(['ship','bl'].includes(field) && (!options.numberMode || options.numberMode==='auto'))return null;
        const normalize=raw=>raw.normalize('NFC').replace(/\s+/g,'').toUpperCase().replace(field==='date'?/[/.]/g:/$^/g,'-');
        const groups=photoCellEvidenceGroups(families,field,options).filter(g=>g.count>=2 && !g.value.startsWith('ambiguous:'));
        if(groups.length<2)return null;
        const first=normalize(groups[0].best.raw);
        if(!/^[\x20-\x7e]+$/.test(first))return null;
        const candidates=groups.map(g=>({...g,text:normalize(g.best.raw)})).filter(g=>g.text.length===first.length && [...g.text].every((ch,k)=>/[A-Z0-9]/.test(ch)===/[A-Z0-9]/.test(first[k]) && (/[A-Z0-9]/.test(ch) || ch===first[k])));
        const positions=[...first].flatMap((ch,k)=>candidates.some(g=>g.text[k]!==ch)?[k]:[]);
        if(!positions.length || positions.length>3 || positions.some(k=>new Set(candidates.map(g=>/[0-9]/.test(g.text[k])?'digit':'letter')).size>1))return null;
        return {candidates,positions,normalize};
    }
    function photoGlyphEvidence(plan,readings) {
        const resolved=new Map();
        if(!plan)return {resolved,conflict:true};
        for(const at of plan.positions){
            const chars=new Map(),pixels=new Map();
            for(const r of readings.filter(r=>r.at===at)){
                if(!/^[A-Z0-9]$/.test(r.raw) || !r.words.length || r.words.some(w=>!Number.isFinite(w.conf) || w.conf<0))continue;
                const score=r.words.reduce((n,w)=>n+w.conf*w.text.length,0)/r.words.reduce((n,w)=>n+w.text.length,0);
                if(pixels.has(r.key) && pixels.get(r.key)!==r.raw)return {resolved,conflict:true};
                pixels.set(r.key,r.raw);
                if(!chars.has(r.raw))chars.set(r.raw,new Map());
                const entries=chars.get(r.raw),old=entries.get(r.key);
                if(!old || score>old.score)entries.set(r.key,{...r,score});
            }
            const supported=[...chars].filter(([ch,entries])=>plan.candidates.some(g=>g.text[at]===ch) && entries.size>=3 && new Set([...entries.values()].map(r=>r.kind)).size>=2 && [...entries.values()].some(r=>r.score>=65));
            if(supported.length>1)return {resolved,conflict:true};
            if(!supported.length){
                // Missing evidence may be retried with context. Credible
                // competing glyphs must not be overwritten by another mode.
                const credible=[...chars].filter(([,entries])=>entries.size>=2 || [...entries.values()].some(r=>r.score>=60));
                if(credible.length>1 || credible.some(([ch])=>!plan.candidates.some(g=>g.text[at]===ch)))return {resolved,conflict:true};
                continue;
            }
            const ch=supported[0][0];
            if([...chars].some(([other,entries])=>other!==ch && (entries.size>=2 || [...entries.values()].some(r=>r.score>=60))))return {resolved,conflict:true};
            resolved.set(at,ch);
        }
        return {resolved,conflict:false};
    }
    function photoGlyphSurvivor(plan,resolved) {
        if(!plan || resolved.size!==plan.positions.length)return null;
        const survivors=plan.candidates.filter(g=>[...resolved].every(([at,ch])=>g.text[at]===ch));
        return survivors.length===1?survivors[0].best:null;
    }
    function reconcilePhotoGlyphs(plan,readings) {
        const evidence=photoGlyphEvidence(plan,readings);
        return evidence.conflict?null:photoGlyphSurvivor(plan,evidence.resolved);
    }
    function photoGlyphSpanPlan(plan,evidence) {
        if(!plan || evidence.conflict)return [];
        return plan.positions.filter(at=>!evidence.resolved.has(at)).map(at=>{
            let left=at,right=at;
            if(left>0 && /[A-Z0-9]/.test(plan.candidates[0].text[left-1]))left--;
            if(right+1<plan.candidates[0].text.length && /[A-Z0-9]/.test(plan.candidates[0].text[right+1]))right++;
            return {at,left,right};
        }).filter(r=>r.right>r.left);
    }
    function reconcilePhotoSpans(plan,evidence,ranges,readings) {
        if(!plan || evidence.conflict)return null;
        const resolved=new Map(evidence.resolved);
        for(const range of ranges){
            const values=new Map(),pixels=new Map(),length=range.right-range.left+1;
            for(const r of readings.filter(r=>r.at===range.at)){
                if(!/^[A-Z0-9]+$/.test(r.raw) || r.raw.length!==length || !r.words.length || r.words.some(w=>!Number.isFinite(w.conf) || w.conf<0))continue;
                if(pixels.has(r.key) && pixels.get(r.key)!==r.raw)return null;
                pixels.set(r.key,r.raw);
                const score=r.words.reduce((n,w)=>n+w.conf*w.text.length,0)/r.words.reduce((n,w)=>n+w.text.length,0);
                if(!values.has(r.raw))values.set(r.raw,new Map());
                const entries=values.get(r.raw),old=entries.get(r.key);
                if(!old || score>old.score)entries.set(r.key,{...r,score});
            }
            const compatible=text=>plan.candidates.some(g=>g.text.slice(range.left,range.right+1)===text && [...resolved].every(([at,ch])=>g.text[at]===ch));
            const supported=[...values].filter(([text,entries])=>compatible(text) && entries.size>=3 && new Set([...entries.values()].map(r=>r.kind)).size>=2 && [...entries.values()].some(r=>r.score>=65));
            if(supported.length!==1)return null;
            const text=supported[0][0];
            if([...values].some(([other,entries])=>other!==text && (entries.size>=2 || [...entries.values()].some(r=>r.score>=60))))return null;
            for(const [at,ch] of resolved)if(at>=range.left && at<=range.right && text[at-range.left]!==ch)return null;
            resolved.set(range.at,text[range.at-range.left]);
        }
        return photoGlyphSurvivor(plan,resolved);
    }
    function photoGlyphReplayProfiles(plan,families,width,height) {
        if(!plan)return [];
        const seen=new Set(),profiles=[];
        const readings=families.flat().filter(r=>r.words.length && plan.candidates.some(g=>g.text===plan.normalize(r.raw))).sort((a,b)=>Math.min(...b.words.map(w=>w.conf))-Math.min(...a.words.map(w=>w.conf)));
        for(const r of readings){
            if(profiles.length===4)break;
            let t;try{t=JSON.parse(r.treatment);}catch{continue;}
            if(!Array.isArray(t) || t.length!==10 || !t[0] || typeof t[0]!=='object')continue;
            const [crop,w,h,binary,cutoff,sharpen,cleanRules,channel,stretch,adaptive]=t;
            if(![crop.left,crop.right,crop.top,crop.bottom,w,h,stretch].every(Number.isFinite) || crop.left<0 || crop.top<0 || crop.right>width || crop.bottom>height || crop.right<=crop.left || crop.bottom<=crop.top || w<25 || w>1824 || h<25 || h>224 || !['gray','max'].includes(channel) || stretch<1 || stretch>1.15 || typeof binary!=='boolean' || typeof sharpen!=='boolean' || typeof cleanRules!=='boolean' || ![false,true,'smooth'].includes(adaptive) || (binary && (!Number.isFinite(cutoff) || cutoff<0 || cutoff>255)))continue;
            const key=JSON.stringify(t);if(seen.has(key))continue;
            seen.add(key);profiles.push(t);
        }
        return profiles;
    }
    function photoGlyphReplayConflict(plan,candidate,readings) {
        const expected=plan.normalize(candidate.raw),groups=new Map();
        for(const r of readings){
            const length=r.right-r.left+1;
            if(!/^[A-Z0-9]+$/.test(r.raw) || r.raw.length!==length || !r.words.length || r.words.some(w=>!Number.isFinite(w.conf) || w.conf<0))continue;
            const id=r.left+':'+r.right;
            if(!groups.has(id))groups.set(id,{pixels:new Map(),alternatives:new Map()});
            const g=groups.get(id);
            if(g.pixels.has(r.key) && g.pixels.get(r.key)!==r.raw)return true;
            g.pixels.set(r.key,r.raw);
            if(r.raw===expected.slice(r.left,r.right+1))continue;
            if(!g.alternatives.has(r.raw))g.alternatives.set(r.raw,new Set());
            const keys=g.alternatives.get(r.raw);keys.add(r.key);
            const score=r.words.reduce((n,w)=>n+w.conf*w.text.length,0)/r.words.reduce((n,w)=>n+w.text.length,0);
            if(keys.size>=2 || score>=60)return true;
        }
        return false;
    }
    async function recognizePhotoGlyphs(canvas,bounds,families,field,options,worker,makeCanvas,progress=()=>{}) {
        const plan=photoGlyphPlan(families,field,options);
        if(!plan)return null;
        const cache=new Map(),whitelist=['date','ship','bl'].includes(field)?'0123456789.,-/':'';
        const read=async(image,psm,chars,output)=>{
            const key=await photoCellPixelKey(image),variant=JSON.stringify([key,psm,chars,output]);
            if(!cache.has(variant)){
                progress();await worker.setParameters({tessedit_pageseg_mode:String(psm),tessedit_char_whitelist:chars,preserve_interword_spaces:'1'});
                cache.set(variant,await worker.recognize(image,{},output));
            }
            return {key,data:cache.get(variant).data};
        };
        const verify=async frames=>{
            const readings=[],wordImages=[];
            for(const {kind,image} of frames){
                const result=await read(image,7,whitelist,{tsv:true,box:true});
                const raw=tsvWords(result.data.tsv || '').sort((a,b)=>a.x-b.x).map(w=>w.text).join(' '),text=plan.normalize(raw);
                if(!plan.candidates.some(g=>g.text===text))continue;
                const boxes=(result.data.box || '').trim().split(/\r?\n/).map(line=>{
                    const a=line.trim().split(/\s+/);return {text:a[0],left:+a[1],top:image.height-(+a[4]),right:+a[3],bottom:image.height-(+a[2])};
                }).filter(b=>b.text && !/\s/.test(b.text));
                if(boxes.length!==text.length || plan.normalize(boxes.map(b=>b.text).join(''))!==text || boxes.some(b=>![b.left,b.right,b.top,b.bottom].every(Number.isFinite) || b.left<0 || b.top<0 || b.right>image.width || b.bottom>image.height || b.right<=b.left || b.bottom<=b.top))continue;
                wordImages.push({image,boxes,kind});
                for(const at of plan.positions)for(const pad of [2,4]){
                    const b=boxes[at],crop={left:Math.max(0,b.left-pad),right:Math.min(image.width,b.right+pad),top:Math.max(0,b.top-pad),bottom:Math.min(image.height,b.bottom+pad)};
                    const imageGlyph=preparePhotoCell(image,crop,makeCanvas,pad===2?60:90,false,150,false,false,'gray');
                    const result=await read(imageGlyph,10,whitelist?'0123456789':'',{tsv:true}),words=tsvWords(result.data.tsv || '');
                    readings.push({at,key:result.key,kind,words,raw:words.map(w=>w.text).join('').toUpperCase()});
                }
            }
            const chosen=reconcilePhotoGlyphs(plan,readings);
            if(chosen)return {chosen,spans:[],evidence:photoGlyphEvidence(plan,readings)};
            const evidence=photoGlyphEvidence(plan,readings),ranges=photoGlyphSpanPlan(plan,evidence);
            if(!ranges.length)return {chosen:null,spans:[],evidence};
            const spans=[];
            // Reuse validated word boxes. Retry only unresolved positions with up
            // to one neighbouring character on either side, inside the same cell.
            // At most 3 ranges × 8 images × 2 paddings × 2 modes = 96 reads;
            // native-pass images/configurations reuse the shared cache.
            for(const {image,boxes,kind} of wordImages)for(const range of ranges)for(const pad of [2,4]){
                const selected=boxes.slice(range.left,range.right+1),crop={left:Math.max(0,Math.min(...selected.map(b=>b.left))-pad),right:Math.min(image.width,Math.max(...selected.map(b=>b.right))+pad),top:Math.max(0,Math.min(...selected.map(b=>b.top))-pad),bottom:Math.min(image.height,Math.max(...selected.map(b=>b.bottom))+pad)};
                const context=preparePhotoCell(image,crop,makeCanvas,pad===2?60:90,false,150,false,false,'gray');
                for(const mode of [7,13]){
                    const result=await read(context,mode,whitelist?'0123456789':'',{tsv:true}),words=tsvWords(result.data.tsv || '');
                    spans.push({...range,key:result.key,kind,words,raw:plan.normalize(words.map(w=>w.text).join(' '))});
                }
            }
            return {chosen:reconcilePhotoSpans(plan,evidence,ranges,spans),spans,evidence};
        };
        const frames=[];
        for(const kind of ['gaussian','median'])for(const strength of [1,2]){
            const source=nativePhotoCell(canvas,bounds,makeCanvas,kind,strength);
            frames.push({kind,image:preparePhotoCell(source,{left:0,right:source.width,top:0,bottom:source.height},makeCanvas,80,false,150,false,true,'gray')});
        }
        const original=await verify(frames);
        if(original.chosen || original.evidence.conflict)return original.chosen;
        // Reuse up to four previously observed whole-cell treatments, never
        // search other rows/columns. The shared pixel/configuration cache
        // prevents repeated native reads from becoming new OCR calls.
        const profiles=photoGlyphReplayProfiles(plan,families,canvas.width,canvas.height);
        for(const t of profiles){
            const [crop,width,height,binary,cutoff,sharpen,cleanRules,channel,stretch,adaptive]=t;
            let image=preparePhotoCell(canvas,crop,makeCanvas,height-24,binary,cutoff??150,sharpen,cleanRules,channel,stretch);
            if(adaptive==='smooth')image=smoothPhotoCell(image);else if(adaptive)image=adaptivePhotoCell(image);
            if(image.width!==width || image.height!==height)continue;
            frames.push({image,kind:'replay-'+(adaptive||binary?'binary':channel)});
        }
        if(frames.length===4)return null;
        const replay=await verify(frames);
        return replay.chosen && !photoGlyphReplayConflict(plan,replay.chosen,original.spans)?replay.chosen:null;
    }
    async function recognizePhotoCells(canvas, settings, rowBands, worker, makeCanvas, progress=()=>{}) {
        const rows=[],pendingGlyphs=[],sourcePixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
        await worker.setParameters({tessedit_pageseg_mode:'7',preserve_interword_spaces:'1'});
        for(let i=0;i<rowBands.length;i++){
            const row={warnings:[],raw:{},ocrReliable:{},manualExclude:false,reason:'',sourceRow:i+1};
            const cellRegions=settings.options.cellBinarize?photoRowCellRegions(sourcePixels,settings,rowBands[i]):settings.regions;
            for(const f of fields){
                progress(i+1,rowBands.length,f);
                if(!settings.regions[f]){row[f]='';row.raw[f]='';row.ocrReliable[f]=false;row.warnings.push(labels[fields.indexOf(f)]+': column not identified; verify original.');continue;}
                const [a,b]=cellRegions[f],band=photoRowCellBand(rowBands[i],a/100*canvas.width,b/100*canvas.width);
                let bounds={left:Math.ceil(a/100*canvas.width)+3,right:Math.floor(b/100*canvas.width)-3,top:band.top,bottom:band.bottom};
                if(settings.options.cellBinarize)bounds=fitPhotoCellBounds(sourcePixels,bounds);
                bounds.left=Math.max(Math.ceil(a/100*canvas.width)+1,bounds.left);bounds.right=Math.min(Math.floor(b/100*canvas.width)-1,bounds.right);
                if(bounds.right<=bounds.left || bounds.bottom<=bounds.top)throw new Error('Invalid cell geometry; use Advanced correction.');
                const whitelist=f==='date'?'0123456789-/.':(['ship','bl'].includes(f)?'0123456789., ':"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /-'&().,+:;%_");
                await worker.setParameters({tessedit_char_whitelist:whitelist});
                const threshold=['ship','bl','date'].includes(f)?85:70;
                const valid=raw=>!!photoCellValue(raw,f,settings.options);
                const reliable=r=>valid(r.raw) && r.words.length>0 && r.words.every(w=>w.conf>=threshold);
                let contentCrop;const readCache=new Map();
                const read=async(size,binary,cutoff,sharpen=false,psm=7,verification=false,margin=0,channel='gray',stretch=1,adaptive=false)=>{
                    await worker.setParameters({tessedit_pageseg_mode:String(psm),tessedit_char_whitelist:verification?'':whitelist});
                    progress(i+1,rowBands.length,f);
                    // Retry margins stay inside this column and this geometric row.
                    const crop=margin==='content'?(contentCrop ||= photoCellContentBounds(sourcePixels,bounds)):margin?{left:Math.max(Math.ceil(a/100*canvas.width)+1,bounds.left-margin),right:Math.min(Math.floor(b/100*canvas.width)-1,bounds.right+margin),top:Math.max(band.top,bounds.top-margin),bottom:Math.min(band.bottom,bounds.bottom+margin)}:bounds;
                    let image=preparePhotoCell(canvas,crop,makeCanvas,size,binary,cutoff,sharpen,!!margin || settings.options.cellBinarize,channel,stretch);
                    if(adaptive==='smooth')image=smoothPhotoCell(image);else if(adaptive)image=adaptivePhotoCell(image);
                    const treatment=JSON.stringify([crop,image.width,image.height,binary,binary?cutoff:null,sharpen,!!margin || settings.options.cellBinarize,channel,stretch,adaptive]);
                    const variant=JSON.stringify([treatment,psm,verification]);
                    if(readCache.has(variant))return readCache.get(variant);
                    const result=await worker.recognize(image,{}, {tsv:true});
                    const words=tsvWords(result.data.tsv || '').sort((a,b)=>Math.abs(a.y-b.y)>Math.min(a.h,b.h)*.6?a.y-b.y:a.x-b.x);
                    const reading={variant,treatment,words,raw:words.map(w=>w.text).join(' ').replace(['ship','bl'].includes(f)?/\s*([.,])\s*/g:/$^/g,'$1')};readCache.set(variant,reading);return reading;
                };
                const primary=await read(f==='cargo'?100:60,f==='port'?false:settings.options.cellBinarize,150);
                let {words,raw}=primary,accepted=false,cellFamilies;
                {
                    const readings=[primary],variants=settings.options.cellBinarize?[[80,false,150],[140,false,150],[140,true,150],[100,true,170],[100,true,130],[100,false,150],[60,true,150],[160,false,150,true],[160,true,150,true],[140,true,150,false,6],[200,false,150,false,6]]:[[140,false,150],[80,false,150],[60,false,150],[160,false,150,true],[140,false,150,false,6]];
                    if(['ship','bl','date'].includes(f))variants.unshift([80,false,150,false,7,true,'content','max'],[100,false,150,false,7,true,'content','max']);
                    variants.push([100,false,150,false,7,false,2],[80,false,150,false,7,false,2],[100,true,150,false,7,false,2],[100,true,170,false,7,false,2],[100,true,130,false,7,false,2],[100,false,150,false,6,false,2],[100,false,150,false,8,false,2]);
                    variants.push([100,false,150,false,7,false,'content','max'],[80,false,150,false,7,false,'content','max'],[100,true,150,false,7,false,'content','max'],[80,true,170,false,7,false,'content','max']);
                    variants.push([100,false,150,false,7,false,2,'max'],[80,false,150,false,7,false,2,'max'],[100,true,170,false,7,false,2,'max'],[140,true,170,false,7,false,2,'max']);
                    variants.push([100,false,150,false,7,false,'content','max',1.15],[80,false,150,false,7,false,'content','max',1.15],[100,true,150,false,7,false,'content','max',1.15],[80,true,150,false,7,false,'content','max',1.15],[100,false,150,false,6,false,'content','max'],[100,true,150,false,6,false,'content','max']);
                    variants.unshift([100,false,150,false,7,true,2,'max',1,'smooth'],[140,false,150,false,7,true,2,'max',1,'smooth'],[100,false,150,false,7,false,'content','max',1,true],[100,false,150,false,7,true,'content','max',1,true]);
                    cellFamilies=[readings];
                    // Try content crops first: they remove border noise without extra row OCR.
                    variants.sort((a,b)=>(a[6]==='content'?0:a[6]?1:2)-(b[6]==='content'?0:b[6]?1:2));
                    for(const [size,binary,cutoff,sharpen,psm,verification,margin,channel,stretch,adaptive] of variants.slice(0,34)){
                        const alternative=await read(size,binary,cutoff,sharpen,psm,verification,margin,channel,stretch,adaptive);readings.push(alternative);
                        const agreed=photoCellConsensus(readings,f,settings.options);
                        if(agreed && !settings.options.cellBinarize){words=agreed.words;raw=agreed.raw;accepted=true;break;}
                    }
                    if(settings.options.cellBinarize){
                        const legacy=photoCellConsensus(readings,f,settings.options);
                        const stable=legacy && legacy.score>=90 && legacy.words.every(w=>w.conf>=60);
                        const families=[readings],nativeCache=new Map();cellFamilies=families;
                        for(const kind of (stable?[]:['gaussian','median','content','binary'])){
                            const family=[];
                            for(const strength of [1,2]){
                                const native=nativePhotoCell(canvas,bounds,makeCanvas,kind,strength);
                                for(const binary of (kind==='binary'?[140,160,180]:[false,true]))for(const size of [80,120]){
                                    if(family.length>=8)continue;
                                    progress(i+1,rowBands.length,f);
                                    let source=native;
                                    if(kind==='binary'){
                                        source=makeCanvas(native.width,native.height);const ctx=source.getContext('2d'),p=native.getContext('2d').getImageData(0,0,native.width,native.height);
                                        for(let j=0;j<p.data.length;j+=4)p.data[j]=p.data[j+1]=p.data[j+2]=p.data[j]<binary?0:255;
                                        ctx.putImageData(p,0,0);
                                    }
                                    let localBounds={left:0,right:source.width,top:0,bottom:source.height};
                                    if(kind==='content')localBounds=photoCellContentBounds(source.getContext('2d').getImageData(0,0,source.width,source.height),localBounds);
                                    const image=preparePhotoCell(source,localBounds,makeCanvas,size,kind==='binary'?false:binary,150,false,true,'gray');
                                    await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
                                    const treatment=JSON.stringify([kind==='content'?'gaussian':kind,strength,binary,size,localBounds]);
                                    if(!nativeCache.has(treatment)){
                                        const result=await worker.recognize(image,{}, {tsv:true}),words=tsvWords(result.data.tsv || '').sort((a,b)=>a.x-b.x);
                                        nativeCache.set(treatment,{words,raw:words.map(w=>w.text).join(' '),variant:treatment,treatment,pixelKey:treatment});
                                    }
                                    family.push(nativeCache.get(treatment));
                                }
                            }
                            families.push(family);
                        }
                        let agreed=stable?legacy:reconcilePhotoCellEvidence(families,f,settings.options,photoFamilyConsensus(families,f,settings.options));
                        if(!agreed){
                            families.push(await recognizePhotoCellEdges(canvas,bounds,worker,makeCanvas,()=>progress(i+1,rowBands.length,f)));
                            agreed=reconcilePhotoCellEvidence(families,f,settings.options,photoFamilyConsensus(families,f,settings.options));
                        }
                        if(agreed){words=agreed.words;raw=agreed.raw;accepted=true;}
                    }
                }
                if(!accepted)pendingGlyphs.push({row,field:f,bounds:{...bounds},families:cellFamilies,index:i});
                row.raw[f]=raw;row.ocrReliable[f]=accepted;
                row[f]=!row.ocrReliable[f]?'':['ship','bl'].includes(f)?quantity(raw,settings.options.numberMode):photoCellValue(raw,f,settings.options);
                if(accepted && !reliable({words,raw}))row.warnings.push(labels[fields.indexOf(f)]+': accepted by concordant cell OCR; verify value.');
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
        for(const cell of pendingGlyphs){
            if(cell.row[cell.field])continue;
            const value=await recognizePhotoGlyphs(canvas,cell.bounds,cell.families,cell.field,{...settings.options,numberMode:rows.numberMode},worker,makeCanvas,()=>progress(cell.index+1,rowBands.length,cell.field));
            if(!value)continue;
            cell.row[cell.field]=value.value;cell.row.raw[cell.field]=value.raw;cell.row.ocrReliable[cell.field]=true;
            // Preserve the original ambiguity warning and require review of
            // every glyph recovery, even if the isolated character was strong.
            cell.row.warnings.push(labels[fields.indexOf(cell.field)]+': recovered by local glyph verification; inspect original before import.');
        }
        return rows;
    }
    const api = { photoGlyphReplayProfiles, photoGlyphReplayConflict, photoGlyphEvidence, photoGlyphSpanPlan, reconcilePhotoSpans, photoGlyphPlan, reconcilePhotoGlyphs, recognizePhotoGlyphs, photoCellPixelKey, cleanPhotoCellEdges, recognizePhotoCellEdges, photoCellEvidenceGroups, reconcilePhotoCellEvidence, nativePhotoCell, photoFamilyConsensus, smoothPhotoCell, photoRowCellRegions, photoCellValue, photoCellConsensus, adaptivePhotoCell, photoHeaderCells, portReadingConsensus, quantity, date, parse, removeTableRules, recognizeColumns, tsvWords, detectPhotoTable, detectPhotoColumns, detectPhotoRows, refinePhotoCellColumns, fitPhotoCellBounds, preparePhotoCell, photoCellContentBounds, inferPhotoNumberMode, recognizePhotoCells };
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
