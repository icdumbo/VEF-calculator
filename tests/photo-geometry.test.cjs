const {test}=require('node:test'),assert=require('node:assert/strict');
const g=require('../photo-geometry.js');
test('projective mapping solves identity, arbitrary quadrilateral and rejects degenerate coordinates',()=>{
 const from=[[0,0],[100,0],[100,200],[0,200]],to=[[10,20],[110,30],[100,220],[20,210]],h=g.homography(from,to);assert.ok(h);
 from.forEach(([x,y],i)=>g.point(h,x,y).forEach((v,k)=>assert.ok(Math.abs(v-to[i][k])<1e-7)));
 assert.equal(g.homography([[0,0],[0,0],[0,0],[0,0]],to),null);
});
function fixture(corners) {
 const width=430,height=520,data=new Uint8ClampedArray(width*height*4);data.fill(255);
 const draw=(a,b)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let i=0;i<=n;i++){const x=Math.round(a[0]+(b[0]-a[0])*i/n),y=Math.round(a[1]+(b[1]-a[1])*i/n);for(let d=-1;d<=1;d++){const j=((y+d)*width+x)*4;if(j>=0 && j<data.length)data[j]=data[j+1]=data[j+2]=0;}}};
 const m=g.homography([[0,0],[1,0],[1,1],[0,1]],corners);
 for(const y of [0,.2,.4,.6,.8,1])draw(g.point(m,0,y),g.point(m,1,y));
 for(const x of [0,.2,.4,.6,.8,1])draw(g.point(m,x,0),g.point(m,x,1));
 return {width,height,data};
}
test('bounded frame search rectifies sloping horizontal / vertical rules and preserves source pixels',()=>{
 const p=fixture([[30,40],[370,65],[350,450],[50,460]]),before=p.data.slice(),corners=g.findFrame(p);assert.ok(corners);
 const out=g.rectify(p,corners);assert.ok(out);assert.ok(out.width<=3000 && out.height<=3000);assert.deepEqual(p.data,before);
 let aligned=0;for(let y=0;y<out.height;y++){let n=0;for(let x=12;x<out.width-12;x++)if(out.data[(y*out.width+x)*4]<110)n++;if(n/(out.width-24)>.7)aligned++;}assert.ok(aligned>=4,'Long rules become approximately horizontal');
});
test('white / upright / very dark photographs do not trigger unsupported perspective corrections',()=>{
 const blank={width:430,height:520,data:new Uint8ClampedArray(430*520*4)};blank.data.fill(255);assert.equal(g.findFrame(blank),null);
 assert.equal(g.findFrame(fixture([[30,40],[370,40],[370,460],[30,460]])),null);
 blank.data.fill(0);assert.equal(g.findFrame(blank),null);
});
test('dark screen borders do not replace the tilted ruled table frame',()=>{
 const p=fixture([[55,60],[365,82],[350,445],[65,455]]);
 for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(x<20 || x>p.width-20 || y<20 || y>p.height-20){const i=(y*p.width+x)*4;p.data[i]=p.data[i+1]=p.data[i+2]=0;}
 const corners=g.findFrame(p);assert.ok(corners);for(const [x,y] of corners){assert.ok(x>30 && x<400);assert.ok(y>35 && y<480);}assert.ok(g.rectify(p,corners));
});

test('outer-edge recovery requires repeated well-spread support, not isolated text or noise',()=>{
 const prior={slope:0,b:200},points=Array.from({length:12},(_,i)=>({x:50+i*.5,y:40+i*25}));
 const fit=g.supportedExtent(points,prior,300);assert.ok(Math.abs(fit.b-49.2)<.01);assert.ok(Math.abs(fit.slope-.02)<.001);
 assert.equal(g.supportedExtent(points.slice(0,4),prior,300),prior);
 assert.equal(g.supportedExtent(points.map(p=>({...p,y:40+p.y*.01})),prior,300),prior);
 assert.equal(g.supportedExtent([{x:0,y:0},{x:50,y:50},{x:200,y:100},{x:60,y:150},{x:100,y:200}],prior,300),prior);
});
test('faint outer vertical rules preserve full width using horizontal voyage extents on both sides',()=>{
 const width=430,height=520,data=new Uint8ClampedArray(width*height*4);data.fill(210);for(let i=3;i<data.length;i+=4)data[i]=255;
 const corners=[[50,40],[390,58],[370,490],[60,475]],m=g.homography([[0,0],[1,0],[1,1],[0,1]],corners);
 const line=(a,b,value)=>{const n=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1]));for(let i=0;i<=n;i++){const x=Math.round(a[0]+(b[0]-a[0])*i/n),y=Math.round(a[1]+(b[1]-a[1])*i/n);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const k=((y+dy)*width+x+dx)*4;data[k]=data[k+1]=data[k+2]=value;}}};
 for(const x of [0,.2,.4,.6,.8,1])line(g.point(m,x,0),g.point(m,x,1),x===0||x===1?180:0);
 for(const y of [0,...Array.from({length:21},(_,i)=>.1+i*.9/20)])line(g.point(m,0,y),g.point(m,1,y),0);
 const found=g.findFrame({width,height,data});assert.ok(found);
 assert.ok(found[0][0]<80 && found[3][0]<80,'Left outer columns retained');
 assert.ok(found[1][0]>350 && found[2][0]>350,'Right outer columns retained');
 const out=g.rectify({width,height,data},found);assert.ok(out.width>300,'Full table with safety padding');
});
