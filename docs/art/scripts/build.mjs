import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp');
import {keyBuffer} from './key.mjs'; import fs from 'fs';
const A='/home/user/caravan/assets'; const only=process.argv[2];
const map={0:['whisperpine','far'],1:['whisperpine','mid'],2:['whisperpine','fg'],3:['glass_dunes','far'],4:['glass_dunes','mid'],5:['glass_dunes','fg']};
const clearTop={1:0.185,4:0.38,2:0,5:0};
for(const [k,[reg,layer]] of Object.entries(map)){ if(only && !only.split(',').includes(k)) continue;
  const src=fs.existsSync(`raw/${k}b.png`)?`raw/${k}b.png`:`raw/${k}.png`; if(!fs.existsSync(src)) continue;
  fs.mkdirSync(`${A}/regions/${reg}`,{recursive:true});
  if(layer==='far'){ await sharp(src).resize(1920).jpeg({quality:88,mozjpeg:true}).toFile(`${A}/regions/${reg}/far.jpg`); }
  else { const im=await keyBuffer(sharp(src).resize(1920),{clearTop:clearTop[k]}); await im.png({compressionLevel:9,palette:true,quality:95,effort:10}).toFile(`${A}/regions/${reg}/${layer}.png`); }
}
if(!only || only.includes('h')){
  fs.mkdirSync(`${A}/raw/heroes`,{recursive:true}); fs.mkdirSync(`${A}/heroes`,{recursive:true});
  const ids=['bram','lysa','oren','kit'];
  const sm=await sharp('raw/6.png').metadata(); const q=sm.width/2;
  for(let n=0;n<4;n++){ const left=(n%2)*q, top=Math.floor(n/2)*q;
    const quad=await sharp('raw/6.png').extract({left,top,width:q,height:q}).toBuffer();
    const k=await (await keyBuffer(sharp(quad))).png().toBuffer();
    await sharp(k).trim({threshold:1}).png().toFile(`${A}/raw/heroes/${ids[n]}_sprite.png`);
    const pm=await sharp('raw/7.png').metadata(); const pq=pm.width/2, inset=Math.round(pq*0.04);
    await sharp('raw/7.png').extract({left:(n%2)*pq+inset,top:Math.floor(n/2)*pq+inset,width:pq-2*inset,height:pq-2*inset}).resize(512,512).jpeg({quality:90,mozjpeg:true}).toFile(`${A}/heroes/${ids[n]}_portrait.jpg`);
  }
}
