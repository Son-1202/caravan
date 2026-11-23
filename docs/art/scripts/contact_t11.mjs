// T-11 contact sheet -> assets/raw/T-11_contact.jpg
import {createRequire} from 'module'; const require=createRequire('/home/user/caravan/package.json'); const sharp=require('sharp');
const A='/home/user/caravan/assets/'; const W=1920,H=1500; const comps=[];
const IDS=['cinder_brand','wardens_mantle','phoenix_ash','bellows_charm','seers_lens','executioners_coin','sunsteel_whetstone','kindling_bundle','shatterpoint_heads','ashen_hourglass','banked_coals','crimson_ribbon','hearth_psalter','gilded_purse','last_light','tinderbox'];
const put=async(f,l,t,w,h)=>comps.push({input:await sharp(A+f).resize(w,h,{fit:'contain',background:{r:60,g:55,b:70,alpha:1}}).flatten({background:'#3c3746'}).png().toBuffer(),left:l,top:t});
for(let i=0;i<16;i++) await put('relics/'+IDS[i]+'.png',10+(i%8)*132,10+Math.floor(i/8)*132,128,128);
await put('raw/npc/mira_sprite.png',1080,10,260,400); await put('heroes/mira_portrait.jpg',1350,10,280,280); await put('heroes/mira_child_portrait.jpg',1636,10,280,280);
await put('ui/panel_frame.png',1350,300,280,280);
await put('cg/twist.jpg',10,600,940,525); await put('cg/epilogue.jpg',970,600,940,525);
await put('ui/map_bg.jpg',10,290,540,302);
await sharp({create:{width:W,height:H,channels:3,background:'#1e1b22'}}).composite(comps).jpeg({quality:82}).toFile(A+'raw/T-11_contact.jpg');
