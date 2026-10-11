/* Photo-only geometric correction. Never alters recognized text or PDF extraction. */
(function(root){
    'use strict';
    function solve(matrix, values) {
        const a=matrix.map((r,i)=>[...r,values[i]]),n=values.length;
        for(let c=0;c<n;c++) {
            let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
            if(Math.abs(a[pivot][c])<1e-9)return null;
            [a[c],a[pivot]]=[a[pivot],a[c]];
            const d=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=d;
            for(let r=0;r<n;r++)if(r!==c){const f=a[r][c];for(let j=c;j<=n;j++)a[r][j]-=f*a[c][j];}
        }
        return a.map(r=>r[n]);
    }
    function homography(from,to) {
        const a=[],b=[];
        for(let i=0;i<4;i++){const [x,y]=from[i],[u,v]=to[i];a.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);b.push(u,v);}
        const h=solve(a,b);return h?[...h,1]:null;
    }
    function point(h,x,y){const d=h[6]*x+h[7]*y+h[8];return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];}
    function findRuledFrame(pixels) {
        const {width,height,data}=pixels,scale=Math.min(1,800/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale),dark=[];
        // Sample at a bounded resolution. Text alone must not create four long frame edges.
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const sx=Math.min(width-1,Math.round(x/scale)),sy=Math.min(height-1,Math.round(y/scale));let ink=false;
            // Retain thin rules that would vanish with nearest-pixel downsampling.
            const radius=scale<.5?1:0;
            for(let dy=-radius;dy<=radius && !ink;dy++)for(let dx=-radius;dx<=radius;dx++){
                if(sx+dx<0 || sx+dx>=width || sy+dy<0 || sy+dy>=height)continue;
                const i=((sy+dy)*width+sx+dx)*4;if(data[i]<110 && data[i+1]<110 && data[i+2]<110){ink=true;break;}
            }
            if(ink){const white=(dx,dy)=>{const xx=sx+Math.round(dx/scale),yy=sy+Math.round(dy/scale);if(xx<0 || yy<0 || xx>=width || yy>=height)return false;const i=(yy*width+xx)*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114>160;};if((white(0,-4)&&white(0,4)) || (white(-4,0)&&white(4,0)))dark.push([x,y]);}
        }
        if(dark.length>w*h*0.35)return null;
        function lines(vertical, from=0, to=vertical?h:w) {
            const axis=vertical?w:h,length=vertical?h:w,margin=Math.ceil(length*.22)+2,peaks=[];
            for(let step=-88;step<=88;step++) {
                const slope=step/400,counts=new Uint16Array(axis+2*margin);
                for(const [x,y]of dark){if((vertical?y:x)<from || (vertical?y:x)>to)continue;const b=Math.round((vertical?x:y)-slope*(vertical?y:x))+margin;if(b>=0 && b<counts.length)counts[b]++;}
                const threshold=(to-from)*(vertical ? .55 : .28);
                for(let i=1;i<counts.length-1;i++)if(counts[i]>=threshold && counts[i]>=counts[i-1] && counts[i]>=counts[i+1])peaks.push({slope,b:i-margin,score:counts[i],position:i-margin+slope*length/2});
            }
            peaks.sort((a,b)=>b.score-a.score);
            const groups=[];
            for(const p of peaks)if(!groups.some(g=>Math.abs(g.position-p.position)<6))groups.push(p);
            return groups.sort((a,b)=>a.position-b.position);
        }
        let hs=lines(false),vs=lines(true);if(hs.length<2)return null;
        // Prefer a repeated ruled table over dark monitor/picture borders.
        let best=[];
        for(let i=0;i<hs.length-4;i++){const gap=hs[i+1].position-hs[i].position;if(gap<7 || gap>h*.06)continue;let j=i+1;while(j+1<hs.length && (hs[j+1].position-hs[j].position)>=gap*.7 && (hs[j+1].position-hs[j].position)<=gap*3.3 && Math.abs((hs[j+1].position-hs[j].position)/gap-Math.round((hs[j+1].position-hs[j].position)/gap))<.3 && Math.abs(hs[j+1].slope-hs[i].slope)<.025)j++;if(j-i+1>best.length)best=hs.slice(i,j+1);}
        if(best.length>=5){
            const i=hs.indexOf(best[0]),gap=best[1].position-best[0].position,prior=hs[i-1];
            const header=prior && best[0].position-prior.position>gap*1.5 && best[0].position-prior.position<gap*6 && Math.abs(prior.slope-best[0].slope)<.025?prior:best[0];
            hs=[header,best.at(-1)];vs=lines(true,header.position,best.at(-1).position);
        }
        if(vs.length<2)return null;
        const refine=(line,vertical)=>{
            let current={...line};
            for(let pass=0;pass<2;pass++) {
                const points=dark.map(([x,y])=>vertical?[y,x]:[x,y]).filter(([x,y])=>Math.abs(y-current.slope*x-current.b)<3);
                if(points.length<20)break;
                let sx=0,sy=0,sxx=0,sxy=0;for(const [x,y]of points){sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
                const n=points.length,den=n*sxx-sx*sx;if(Math.abs(den)<1)break;
                const slope=(n*sxy-sx*sy)/den;current={...current,slope,b:(sy-slope*sx)/n};
            }
            return current;
        };
        const top=refine(hs[0],false),bottom=refine(hs.at(-1),false),left=refine(vs[0],true),right=refine(vs.at(-1),true);
        const intersect=(horizontal,vertical)=>{const den=1-horizontal.slope*vertical.slope;if(Math.abs(den)<.5)return null;const x=(vertical.slope*horizontal.b+vertical.b)/den;return [x/scale,(horizontal.slope*x+horizontal.b)/scale];};
        const corners=[intersect(top,left),intersect(top,right),intersect(bottom,right),intersect(bottom,left)];
        if(corners.some(p=>!p || p[0]<-10 || p[1]<-10 || p[0]>width+10 || p[1]>height+10))return null;
        if(right.position-left.position<w*.3 || bottom.position-top.position<h*.2)return null;
        // Already upright: preserve pixels, whitespace and the existing OCR result.
        if([top,bottom,left,right].every(l=>Math.abs(l.slope)<.01))return null;
        return corners;
    }
    function findCleanFrame(pixels) {
        const {width,height,data}=pixels,scale=Math.min(1,800/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale),dark=[];
        // Sample at a bounded resolution. Text alone must not create four long frame edges.
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const sx=Math.min(width-1,Math.round(x/scale)),sy=Math.min(height-1,Math.round(y/scale));let ink=false;
            // Retain thin rules that would vanish with nearest-pixel downsampling.
            const radius=scale<.5?1:0;
            for(let dy=-radius;dy<=radius && !ink;dy++)for(let dx=-radius;dx<=radius;dx++){
                if(sx+dx<0 || sx+dx>=width || sy+dy<0 || sy+dy>=height)continue;
                const i=((sy+dy)*width+sx+dx)*4;if(data[i]<110 && data[i+1]<110 && data[i+2]<110){ink=true;break;}
            }
            if(ink)dark.push([x,y]);
        }
        if(dark.length>w*h*0.35)return null;
        function lines(vertical) {
            const axis=vertical?w:h,length=vertical?h:w,margin=Math.ceil(length*.22)+2,peaks=[];
            for(let step=-22;step<=22;step++) {
                const slope=step/100,counts=new Uint16Array(axis+2*margin);
                for(const [x,y]of dark){const b=Math.round((vertical?x:y)-slope*(vertical?y:x))+margin;if(b>=0 && b<counts.length)counts[b]++;}
                const threshold=length*(vertical ? .28 : .42);
                for(let i=1;i<counts.length-1;i++)if(counts[i]>=threshold && counts[i]>=counts[i-1] && counts[i]>=counts[i+1])peaks.push({slope,b:i-margin,score:counts[i],position:i-margin+slope*length/2});
            }
            peaks.sort((a,b)=>b.score-a.score);
            const groups=[];
            for(const p of peaks)if(!groups.some(g=>Math.abs(g.position-p.position)<6))groups.push(p);
            return groups.sort((a,b)=>a.position-b.position);
        }
        const hs=lines(false),vs=lines(true);if(hs.length<2 || vs.length<2)return null;
        const refine=(line,vertical)=>{
            let current={...line};
            for(let pass=0;pass<2;pass++) {
                const points=dark.map(([x,y])=>vertical?[y,x]:[x,y]).filter(([x,y])=>Math.abs(y-current.slope*x-current.b)<3);
                if(points.length<20)break;
                let sx=0,sy=0,sxx=0,sxy=0;for(const [x,y]of points){sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
                const n=points.length,den=n*sxx-sx*sx;if(Math.abs(den)<1)break;
                const slope=(n*sxy-sx*sy)/den;current={...current,slope,b:(sy-slope*sx)/n};
            }
            return current;
        };
        const top=refine(hs[0],false),bottom=refine(hs.at(-1),false),left=refine(vs[0],true),right=refine(vs.at(-1),true);
        const intersect=(horizontal,vertical)=>{const den=1-horizontal.slope*vertical.slope;if(Math.abs(den)<.5)return null;const x=(vertical.slope*horizontal.b+vertical.b)/den;return [x/scale,(horizontal.slope*x+horizontal.b)/scale];};
        const corners=[intersect(top,left),intersect(top,right),intersect(bottom,right),intersect(bottom,left)];
        if(corners.some(p=>!p || p[0]<-10 || p[1]<-10 || p[0]>width+10 || p[1]>height+10))return null;
        if(right.position-left.position<w*.3 || bottom.position-top.position<h*.2)return null;
        // Already upright: preserve pixels, whitespace and the existing OCR result.
        if([top,bottom,left,right].every(l=>Math.abs(l.slope)<.01))return null;
        return corners;
    }
    function findFrame(pixels) {
        const {width,height,data}=pixels;let mid=0,border=0,n=0,bn=0;
        for(let y=0;y<height;y+=12)for(let x=0;x<width;x+=12){const i=(y*width+x)*4,v=data[i]*.299+data[i+1]*.587+data[i+2]*.114;n++;if(v>140 && v<235)mid++;if(x<width*.04 || x>width*.96 || y<height*.04 || y>height*.96){bn++;if(v<110)border++;}}
        // Preserve the validated clean-page strategy; photographed screens need thin-rule/table support.
        return mid/n>.12 || border/Math.max(1,bn)>.4 ? findRuledFrame(pixels) : findCleanFrame(pixels);
    }
    function rectify(pixels,corners) {
        const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
        const cw=Math.max(distance(corners[0],corners[1]),distance(corners[3],corners[2])),ch=Math.max(distance(corners[0],corners[3]),distance(corners[1],corners[2]));
        const scale=Math.min(1,2960/Math.max(cw,ch)),pad=12,width=Math.ceil(cw*scale)+pad*2,height=Math.ceil(ch*scale)+pad*2;
        if(width<40 || height<40)return null;
        const map=homography([[pad,pad],[width-pad-1,pad],[width-pad-1,height-pad-1],[pad,height-pad-1]],corners);if(!map)return null;
        const data=new Uint8ClampedArray(width*height*4);data.fill(255);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
            const [sx,sy]=point(map,x,y);if(sx<0 || sy<0 || sx>=pixels.width-1 || sy>=pixels.height-1)continue;
            const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,base=(iy*pixels.width+ix)*4,dest=(y*width+x)*4;
            for(let k=0;k<3;k++)data[dest+k]=pixels.data[base+k]*(1-fx)*(1-fy)+pixels.data[base+4+k]*fx*(1-fy)+pixels.data[base+pixels.width*4+k]*(1-fx)*fy+pixels.data[base+(pixels.width+1)*4+k]*fx*fy;
        }
        return {width,height,data};
    }
    function normalize(canvas,makeCanvas) {
        const context=canvas.getContext('2d'),pixels=context.getImageData(0,0,canvas.width,canvas.height),corners=findFrame(pixels);
        if(!corners)return {canvas,corrected:false};
        const result=rectify(pixels,corners);if(!result)return {canvas,corrected:false};
        const output=makeCanvas(result.width,result.height),ctx=output.getContext('2d'),image=ctx.createImageData(result.width,result.height);image.data.set(result.data);ctx.putImageData(image,0,0);
        return {canvas:output,corrected:true};
    }
    const api={homography,point,findFrame,rectify,normalize};root.VEFPhotoGeometry=api;if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
