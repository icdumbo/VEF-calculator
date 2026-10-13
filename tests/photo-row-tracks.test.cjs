const {test}=require('node:test');
const assert=require('node:assert/strict');
const {detectPhotoRows,recognizePhotoCells}=require('../photo-import.js');
function grid({n=7,slope=.025,ink=155,missing=-1,scale=1}={}){
 const width=1000*scale,height=(150+n*40)*scale,data=new Uint8ClampedArray(width*height*4).fill(230);
 for(let i=3;i<data.length;i+=4)data[i]=255;
 for(let k=0;k<=n;k++)if(k!==missing)for(let x=10*scale;x<990*scale;x++){
  const y=Math.round((70+k*40)*scale+slope*(x-width/2));
  for(let dy=-scale;dy<=scale;dy++){const at=((y+dy)*width+x)*4;data[at]=data[at+1]=data[at+2]=ink;}
 }
 const settings={regions:{cargo:[1,17],bl:[17,35],port:[35,69],date:[69,78],ship:[78,99]},options:{top:8,bottom:(75+n*40)/(150+n*40)*100,numberMode:'dot'},evidence:{firstY:90*scale,lastY:(50+n*40)*scale,footerTop:(100+n*40)*scale}};
 return {pixels:{width,height,data},settings,n};
}
for(const scale of [1,2])for(const slope of [-.025,0,.025])test(`observed faint rule tracks retain variable rows, reversed columns and residual slope ${slope}, scale ${scale}`,()=>{
 const {pixels,settings,n}=grid({scale,slope,n:scale===1?7:11}),bands=detectPhotoRows(pixels,settings);
 assert.ok(bands);assert.equal(bands.length,n);assert.ok(bands[0].upper);
 for(const b of bands)assert.ok(Math.abs(b.upper.slope-slope)<.003);
});
test('missing faint rule, isolated text strokes and no closing boundary are rejected, without manufactured rows',()=>{
 for(const options of [{missing:3},{missing:7}]){const {pixels,settings}=grid(options);assert.equal(detectPhotoRows(pixels,settings),null);}
 const {pixels,settings}=grid();pixels.data.fill(230);assert.equal(detectPhotoRows(pixels,settings),null);
});
test('row fallback brackets actual data rather than treating tall header whitespace as a data row',()=>{
 const {pixels,settings,n}=grid({slope:0,ink:0});settings.options.top=0;settings.evidence.headerBottom=1;
 const bands=detectPhotoRows(pixels,settings);assert.ok(bands);assert.equal(bands.length,n);
});
test('tracked cell crops follow the same row at each column, never copy adjoining-row values',async()=>{
 const {pixels,settings}=grid({n:3}),bands=detectPhotoRows(pixels,settings),reads=[];
 function make(w,h){return {width:w,height:h,getContext(){return {fillRect(){},drawImage(...a){reads.push(a.slice(1,5));},getImageData(){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4).fill(255)};},putImageData(){}};}};}
 const source={width:pixels.width,height:pixels.height,getContext:()=>({getImageData:()=>pixels})};
 const worker={setParameters:async()=>{},recognize:async()=>({data:{tsv:''}})};
 await recognizePhotoCells(source,settings,bands,worker,make);
 const cropFor=(left)=>reads.find(r=>Math.abs(r[0]-left)<1);
 const port=cropFor(353),ship=cropFor(783);assert.ok(port);assert.ok(ship);assert.ok(ship[1]>port[1]);
 for(const [left,top,w,h] of reads){const b=bands.find(b=>top>=b.top-30 && top<b.bottom);assert.ok(b);const at=(t,x)=>t.y+t.slope*(x-t.x);assert.ok(top>Math.max(at(b.upper,left),at(b.upper,left+w)));assert.ok(top+h<Math.min(at(b.lower,left),at(b.lower,left+w)));}
});
