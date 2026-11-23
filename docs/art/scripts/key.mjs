import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp');
// Chroma-key pure magenta. m = min(r,b) - g : ~255 on bg, small on subject.
export async function keyBuffer(img, {lo=70, hi=170, clearTop=0}={}){
  const {data,info}=await img.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;let r=data[i],g=data[i+1],b=data[i+2];
    const m=Math.min(r,b)-g; let a=255;
    if(y<clearTop*h) a=0; else if(m>=hi) a=0; else if(m>lo) a=Math.round(255*(hi-m)/(hi-lo));
    if(m>lo/2 && a>0){ // despill: pull r,b toward g
      const cap=g+12; if(r>cap&&b>cap){const d=Math.min(r,b)-cap; r-=d; b-=d;} }
    data[i]=r;data[i+2]=b;data[i+3]=a;}
  // remove isolated low-alpha speckles: kill alpha < 24
  for(let i=3;i<data.length;i+=4) if(data[i]<24) data[i]=0;
  return sharp(data,{raw:{width:w,height:h,channels:4}});
}
