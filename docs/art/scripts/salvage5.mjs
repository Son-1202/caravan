// Salvage glass_dunes fg from regen e2554f4c: keep only bottom corners + bottom strip (piecewise boundary), then magenta key.
import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp');
import {keyBuffer} from './key.mjs';
const pts=JSON.parse(process.argv[2]||'[[0,0.55],[0.06,0.60],[0.11,0.72],[0.17,0.80],[0.22,0.83],[0.30,0.85],[0.72,0.85],[0.80,0.77],[0.90,0.74],[1,0.72]]');
// final boundary used: [[0,0.63],[0.025,0.63],[0.05,0.66],[0.07,0.70],[0.10,0.71],[0.12,0.78],[0.15,0.82],[0.20,0.84],[0.30,0.85],[0.72,0.85],[0.74,0.83],[0.84,0.82],[0.87,0.78],[0.96,0.77],[1,0.76]]
const bnd=x=>{for(let i=1;i<pts.length;i++){const[a,b]=pts[i-1],[c,d]=pts[i];if(x<=c)return b+(d-b)*(x-a)/(c-a)}return pts.at(-1)[1]};
const k=await keyBuffer(sharp('raw/5b.png').resize(1920));
const {data,info}=await k.raw().toBuffer({resolveWithObject:true}); const w=info.width,h=info.height, F=8;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const by=bnd(x/w)*h; const d=y-by; const m=d>=F?1:d<=0?0:d/F; const i=(y*w+x)*4+3; data[i]=Math.round(data[i]*m);}
await sharp(data,{raw:{width:w,height:h,channels:4}}).png({compressionLevel:9,palette:true,quality:95,effort:10}).toFile('/home/user/caravan/assets/regions/glass_dunes/fg.png');
await sharp({create:{width:w,height:h,channels:3,background:'#3a6a8a'}}).composite([{input:'/home/user/caravan/assets/regions/glass_dunes/fg.png'}]).png().toBuffer().then(b=>sharp(b).resize(1280).jpeg().toFile('fgcheck.jpg'));
