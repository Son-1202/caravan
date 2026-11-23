import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp'); import fs from 'fs';
const A='/home/user/caravan/assets'; const W=480,H=270;
const cells=[];
for(const r of ['whisperpine','glass_dunes']){
  for(const l of ['far.jpg','mid.png','fg.png']) cells.push({f:`${A}/regions/${r}/${l}`,w:W,h:H});
  // composite preview far+mid+fg
  cells.push({comp:r,w:W,h:H});
}
for(const id of ['bram','lysa','oren','kit']) cells.push({f:`${A}/raw/heroes/${id}_sprite.png`,w:W/2,h:H});
for(const id of ['bram','lysa','oren','kit']) cells.push({f:`${A}/heroes/${id}_portrait.jpg`,w:W/2,h:H});
const comps=[]; let x=0,y=0; const SW=W*4;
for(const c of cells){ if(x+c.w>SW){x=0;y+=H;}
  let buf;
  if(c.comp){ const L=['far.jpg','mid.png','fg.png'].map(l=>`${A}/regions/${c.comp}/${l}`).filter(fs.existsSync);
    const base=sharp(L[0]).resize(W,H); buf=await base.composite(await Promise.all(L.slice(1).map(async f=>({input:await sharp(f).resize(W,H).toBuffer()})))).png().toBuffer(); }
  else if(fs.existsSync(c.f)) buf=await sharp(c.f).resize(c.w-8,c.h-8,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).toBuffer();
  else buf=null;
  comps.push({input:await sharp({create:{width:c.w,height:c.h,channels:3,background:'#3a6a8a'}}).png().toBuffer(),left:x,top:y});
  if(buf) comps.push({input:buf,left:x+(c.comp?0:4),top:y+(c.comp?0:4)});
  x+=c.w; }
await sharp({create:{width:SW,height:y+H,channels:3,background:'#000'}}).composite(comps).jpeg({quality:85}).toFile(`${A}/raw/T-05_contact.jpg`);
