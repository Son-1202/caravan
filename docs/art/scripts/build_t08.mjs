// T-08 build: run from the folder holding raw T-08 pngs (fs_far.png, sheetA.png, ...).
import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp');
import {keyBuffer} from './key.mjs'; import fs from 'fs';
const A='/home/user/caravan/assets'; const only=process.argv[2];
const KEY={fs_fg:{lo:28,hi:130},wintermaw:{lo:35,hi:150}}; // stricter key where magenta bleeds into fog/breath
// recolor leftover pinkish fog (min(r,b) > g) to a cold blue-grey, keeping alpha
async function unpink(buf){ const {data,info}=await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){ const r=data[i],g=data[i+1],b=data[i+2]; if(Math.min(r,b)-g>6){ data[i]=Math.max(0,g-6); data[i+2]=Math.min(255,g+18);} }
  return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer(); }
// cool down warm solenne layers so they sit under the near-night far layer
async function cool(buf){ const {data,info}=await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){ data[i]=data[i]*0.78; data[i+1]=data[i+1]*0.9; data[i+2]=Math.min(255,data[i+2]*1.25+10); }
  return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer(); }
const want=k=>!only||only.split(',').includes(k);
// region layers: [src, region, layer, clearTop, darken(brightness mult), tint]
const L=[['fs_far','frostspire','far',0,0.9],['fs_mid','frostspire','mid',0,0.85],['fs_fg','frostspire','fg',0,0.8],
 ['so_far','solenne','far',0,0.85],['so_mid','solenne','mid',0,0.7],['so_fg','solenne','fg',0,0.42]];
for(const [src,reg,layer,ct,br] of L){ if(!want(src)||!fs.existsSync(src+'.png')) continue;
  fs.mkdirSync(`${A}/regions/${reg}`,{recursive:true});
  if(layer==='far'){ await sharp(src+'.png').resize(1920).modulate({brightness:br}).jpeg({quality:88,mozjpeg:true}).toFile(`${A}/regions/${reg}/far.jpg`); continue; }
  let k=await (await keyBuffer(sharp(src+'.png').resize(1920),{clearTop:ct,...(KEY[src]||{})})).png().toBuffer();
  if(KEY[src]) k=await unpink(k);
  // darken + cool solenne layers (keeps alpha)
  let im=sharp(k).modulate({brightness:br, saturation: reg==='solenne'?(layer==='fg'?0.6:0.75):1});
  if(reg==='solenne') im=sharp(await cool(await im.png().toBuffer()));
  await im.png({compressionLevel:9,palette:true,quality:95,effort:10}).toFile(`${A}/regions/${reg}/${layer}.png`);
}
// enemy sheets: ids in TL,TR,BL,BR order; flip = ids that face right in the raw gen
const S={sheetA:['moss_wolf','thornling','wisp_lantern','barkhide_stag'],sheetB:['glass_scarab','dune_jackal','sand_wraith','prism_basilisk'],sheetC:['frost_wight','ice_harpy','rime_golem','aurora_drake']};
const FLIP=new Set(['moss_wolf','glass_scarab','dune_jackal','frost_wight']);
fs.mkdirSync(`${A}/raw/enemies`,{recursive:true});
async function out(buf,id){ let s=sharp(buf).trim({threshold:1}); if(FLIP.has(id)) s=sharp(await s.png().toBuffer()).flop();
  let b=await s.png().toBuffer(); const m=await sharp(b).metadata(); if(m.width>900||m.height>900) b=await sharp(b).resize(900,900,{fit:'inside',kernel:'nearest'}).png().toBuffer();
  await sharp(b).png({compressionLevel:9,effort:10}).toFile(`${A}/raw/enemies/${id}_sprite.png`); }
for(const [sh,ids] of Object.entries(S)){ if(!want(sh)||!fs.existsSync(sh+'.png')) continue;
  const m=await sharp(sh+'.png').metadata(); const q=m.width/2;
  for(let n=0;n<4;n++){ const quad=await sharp(sh+'.png').extract({left:(n%2)*q,top:Math.floor(n/2)*q,width:q,height:q}).toBuffer();
    await out(await (await keyBuffer(sharp(quad))).png().toBuffer(), ids[n]); } }
for(const id of ['rootmother','sunshard_colossus','wintermaw','hollow_king']){ if(!want(id)||!fs.existsSync(id+'.png')) continue;
  let b=await (await keyBuffer(sharp(id+'.png'),KEY[id]||{})).png().toBuffer(); if(KEY[id]) b=await unpink(b); await out(b, id); }
