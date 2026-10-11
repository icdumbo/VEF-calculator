/* FULL only: PDF.js text geometry and conservative table-header detection. */
(function(root){
    'use strict';
    const parser = typeof module !== 'undefined' && module.exports ? require('./photo-import.js') : root.VEFPhotoImport;
    const fields = ['port','date','cargo','ship','bl'];
    function textWords(items, viewport) {
        const v = viewport.transform;
        const words = [];
        for(const item of items) {
            if(!item.str?.trim() || !item.width || !item.height || !item.transform) continue;
            const t = item.transform, scale = viewport.scale || 1;
            const a=v[0]*t[0]+v[2]*t[1], b=v[1]*t[0]+v[3]*t[1], c=v[0]*t[2]+v[2]*t[3], d=v[1]*t[2]+v[3]*t[3];
            const x=v[0]*t[4]+v[2]*t[5]+v[4], y=v[1]*t[4]+v[3]*t[5]+v[5];
            const horizontal=Math.hypot(a,b), vertical=Math.hypot(c,d);
            if(!horizontal || !vertical) continue;
            for(const match of item.str.matchAll(/\S+/g)) {
                const start=match.index/item.str.length, end=(match.index+match[0].length)/item.str.length;
                const dx=a/horizontal*item.width*scale, dy=b/horizontal*item.width*scale;
                const vx=c/vertical*item.height*scale, vy=d/vertical*item.height*scale;
                const points=[[x+dx*start,y+dy*start],[x+dx*end,y+dy*end],[x+dx*start+vx,y+dy*start+vy],[x+dx*end+vx,y+dy*end+vy]];
                const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
                words.push({text:match[0],x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),conf:100});
            }
        }
        return words;
    }
    function toTSV(words) {
        return 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'+words.map(w=>[5,1,1,1,1,1,w.x,w.y,w.w,w.h,w.conf,w.text.replace(/[\t\r\n]/g,' ')].join('\t')).join('\n');
    }
    const clean = s => s.toUpperCase().replace(/[’‘]/g,"'").replace(/[^A-Z0-9/']/g,'');
    function detectTable(words,width,height) {
        const dates=words.filter(w=>clean(w.text)==='DATE');
        const center=w=>w.x+w.w/2;
        const span=ws=>({x:Math.min(...ws.map(w=>w.x)),right:Math.max(...ws.map(w=>w.x+w.w)),y:Math.min(...ws.map(w=>w.y)),bottom:Math.max(...ws.map(w=>w.y+w.h))});
        for(const date of dates) {
            const band=words.filter(w=>Math.abs(w.y-date.y)<date.h*4);
            const port=band.find(w=>clean(w.text)==='PORT'),terminal=band.find(w=>clean(w.text)==='TERMINAL'),cargo=band.find(w=>clean(w.text)==='CARGO');
            const ship=band.find(w=>/^SHIP'?S?$/.test(clean(w.text)));
            const bls=band.filter(w=>['B/L','BL'].includes(clean(w.text)));
            const dateBL=bls.find(w=>Math.abs(w.y-date.y)<date.h && w.x<date.x && date.x-w.x-w.w<date.h*2);
            const bl=bls.find(w=>w!==dateBL && ship && w.x>ship.x);
            if(!port || !terminal || !cargo || !ship || !bl) continue;
            const figures=band.filter(w=>clean(w.text)==='FIGURES');
            const nearFigures=anchor=>figures.filter(w=>Math.abs(center(w)-center(anchor))<date.h*2.5);
            const anchors={port:span([port,terminal]),date:span([date,...(dateBL?[dateBL]:[])]),cargo:span([cargo]),ship:span([ship,...nearFigures(ship)]),bl:span([bl,...nearFigures(bl)])};
            const sorted=fields.map(f=>({f,...anchors[f]})).sort((a,b)=>a.x-b.x);
            if(sorted.some((a,i)=>i && a.x<sorted[i-1].right)) continue;
            const regions={};
            sorted.forEach((a,i)=>{
                const left=i?(sorted[i-1].right+a.x)/2:Math.max(0,a.x-2);
                const ignored=band.filter(w=>w.x>=a.right+1 && !fields.some(f=>w.x>=anchors[f].x && w.x<anchors[f].right)).sort((a,b)=>a.x-b.x)[0];
                const right=i+1<sorted.length?(a.right+sorted[i+1].x)/2:ignored?(a.right+ignored.x)/2:Math.min(width,a.right+date.h*2);
                regions[a.f]=[left/width*100,right/width*100];
            });
            const tableTop=Math.max(...fields.map(f=>anchors[f].bottom))+1;
            const totals=words.filter(w=>w.y>tableTop && /^TOTALS?$/.test(clean(w.text))).sort((a,b)=>a.y-b.y)[0];
            return {regions,options:{top:tableTop/height*100,bottom:totals?(totals.y-1)/height*100:100}};
        }
        return null;
    }
    function hasTableText(words) {
        const dates=words.filter(w=>/^(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})$/.test(w.text)).length;
        const quantities=words.filter(w=>/^\d+[.,]\d{1,3}$/.test(w.text)).length;
        return (dates>0 && quantities>=2) || quantities>=4;
    }
    function extract(words,width,height,settings) {
        const rows=parser.parse(toTSV(words),width,height,settings.regions,settings.options);
        // Only mapped values are returned: never copy Voyage, Qualified or exclusions.
        return rows.map(row=>({...row,source:'PDF digital text',manualExclude:false,reason:''}));
    }
    const api={textWords,toTSV,detectTable,hasTableText,extract};
    root.VEFPDFImport=api;
    if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
