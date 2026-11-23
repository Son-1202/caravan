// T-11 build. Usage: node build_t11.mjs <rawDir>  (raw PNGs named relics.png, mira_sprite.png, mira_portraits.png, cg_twist.png, cg_epilogue.png, map.png, panel.png)
import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp');
import {keyBuffer} from './key.mjs'; import path from 'path'; import fs from 'fs';
const R=process.argv[2]; const A='/home/user/caravan/assets'; const r=f=>path.join(R,f);
for(const d of ['relics','heroes','cg','ui','raw/npc']) fs.mkdirSync(path.join(A,d),{recursive:true});
const IDS=['cinder_brand','wardens_mantle','phoenix_ash','bellows_charm','seers_lens','executioners_coin','sunsteel_whetstone','kindling_bundle','shatterpoint_heads','ashen_hourglass','banked_coals','crimson_ribbon','hearth_psalter','gilded_purse','last_light','tinderbox'];
// 1. relics: gpt returned native alpha. Cut 4x4 cells, trim, fit in 120 box centered on 128 canvas.
{ const meta=await sharp(r('relics.png')).metadata(); const c=meta.width/4;
  for(let i=0;i<16;i++){ const x=(i%4)*c, y=Math.floor(i/4)*c;
    const cell=await sharp(r('relics.png')).extract({left:Math.round(x),top:Math.round(y),width:Math.round(c),height:Math.round(c)}).png().toBuffer();
    const t=await sharp(cell).trim({threshold:1}).png().toBuffer().catch(()=>cell);
    const fit=await sharp(t).resize(120,120,{fit:'contain',background:{r:0,g:0,b:0,alpha:0},kernel:'lanczos3'}).png().toBuffer();
    await sharp({create:{width:128,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:fit,gravity:'center'}]).png().toFile(path.join(A,'relics',IDS[i]+'.png'));
  } }
// 2a. Mira sprite: the gen copied the hero-sheet layout; key, then keep only the component connected to a seed on Mira.
{ const crop={left:700,top:420,width:700,height:1240};
  const k=await (await keyBuffer(sharp(r('mira_sprite.png')).extract(crop))).raw().toBuffer({resolveWithObject:true});
  const {data,info:{width:w,height:h}}=k; const keep=new Uint8Array(w*h); const st=[[300,700]];
  while(st.length){const [x,y]=st.pop(); if(x<0||y<0||x>=w||y>=h)continue; const p=y*w+x; if(keep[p]||data[p*4+3]<40)continue; keep[p]=1; st.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
  for(let p=0;p<w*h;p++){ const x=p%w,y=(p/w)|0, R=data[p*4],G=data[p*4+1],B=data[p*4+2];
    // drop Oren's censer + its pink smoke, which touch Mira's hem in the gen
    if(!keep[p] || (x<150 && y>950) || (R-G>30 && B-G>15 && y>1000)) data[p*4+3]=0; }
  await sharp(data,{raw:{width:w,height:h,channels:4}}).trim({threshold:1}).png().toBuffer().then(b=>sharp(b).resize({height:600,kernel:'lanczos3'}).png().toFile(path.join(A,'raw/npc/mira_sprite.png'))); }
// 2b. portraits: square crops from each half, 512.
const por=(box,out)=>sharp(r('mira_portraits.png')).extract(box).resize(512,512,{kernel:'lanczos3'}).flatten().jpeg({quality:88,mozjpeg:true}).toFile(path.join(A,'heroes',out));
await por({left:120,top:40,width:1200,height:1200},'mira_portrait.jpg');
await por({left:1500,top:100,width:1200,height:1200},'mira_child_portrait.jpg');
// 3/4. CG + map: 1920x1072 jpg.
for(const [f,o] of [['cg_twist.png','cg/twist.jpg'],['cg_epilogue.png','cg/epilogue.jpg'],['map.png','ui/map_bg.jpg']])
  await sharp(r(f)).resize(1920).flatten().jpeg({quality:86,mozjpeg:true}).toFile(path.join(A,o));
// 5. panel: key magenta, trim, 512 nearest-ish.
{ const k=await keyBuffer(sharp(r('panel.png'))); const b=await k.png().toBuffer();
  await sharp(b).trim({threshold:1}).resize(512,512,{fit:'fill',kernel:'lanczos3'}).png({palette:true,quality:95}).toFile(path.join(A,'ui/panel_frame.png')); }
console.log('done');
