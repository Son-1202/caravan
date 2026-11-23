import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp'); import fs from 'fs';
const A='/home/user/caravan/assets'; const W=480,H=270, SW=W*4; const cells=[];
for(const r of ['frostspire','solenne']){ for(const l of ['far.jpg','mid.png','fg.png']) cells.push({f:`${A}/regions/${r}/${l}`,w:W,h:H}); cells.push({comp:r,w:W,h:H}); }
const ids=['moss_wolf','thornling','wisp_lantern','barkhide_stag','glass_scarab','dune_jackal','sand_wraith','prism_basilisk','frost_wight','ice_harpy','rime_golem','aurora_drake'];
for(const id of ids) cells.push({f:`${A}/raw/enemies/${id}_sprite.png`,w:W/2,h:H/1.5});
for(const id of ['rootmother','sunshard_colossus','wintermaw','hollow_king']) cells.push({f:`${A}/raw/enemies/${id}_sprite.png`,w:W,h:H*1.5});
const comps=[]; let x=0,y=0,rowH=0;
for(const c of cells){ c.h=Math.round(c.h); if(x+c.w>SW){x=0;y+=rowH;rowH=0;}
  let buf=null;
  if(c.comp){ const L=['far.jpg','mid.png','fg.png'].map(l=>`${A}/regions/${c.comp}/${l}`).filter(fs.existsSync);
    buf=await sharp(L[0]).resize(W,H).composite(await Promise.all(L.slice(1).map(async f=>({input:await sharp(f).resize(W,H).toBuffer()})))).png().toBuffer(); }
  else if(fs.existsSync(c.f)) buf=await sharp(c.f).resize(c.w-8,c.h-8,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).toBuffer();
  comps.push({input:await sharp({create:{width:c.w,height:c.h,channels:3,background:'#3a6a8a'}}).png().toBuffer(),left:x,top:y});
  if(buf) comps.push({input:buf,left:x+(c.comp?0:4),top:y+(c.comp?0:4)});
  x+=c.w; rowH=Math.max(rowH,c.h); }
await sharp({create:{width:SW,height:y+rowH,channels:3,background:'#000'}}).composite(comps).jpeg({quality:85}).toFile(`${A}/raw/T-08_contact.jpg`);
