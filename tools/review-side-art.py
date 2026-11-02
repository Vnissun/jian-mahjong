"""Validate/export an inventory and previews; never edits the game PNGs."""
import argparse, base64, hashlib, html, json, math, zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/artwork/side-proportion-v3'
RES=ROOT/'assets/resources'
RECEIPTS=ROOT/'output/artwork/complete-set-v1/receipts'
KINDS=[f'{s}{i}' for s,n in [('wan',9),('tong',9),('tiao',9),('feng',4),('yuan',3)] for i in range(1,n+1)]
FONT=ImageFont.truetype('C:/Windows/Fonts/simhei.ttf',18)
TARGETS=[f'tiles/{v}/{k}.png' for v in ['flat_left','flat_right'] for k in KINDS]+[f'tiles/{v}/tiao8.png' for v in ['hand_self','flat_bottom','flat_top']]

def main():
 p=argparse.ArgumentParser();p.add_argument('--final',action='store_true');args=p.parse_args()
 OUT.mkdir(parents=True,exist_ok=True)
 records=[];pending=[];errors=[];suspects=[]
 for name in TARGETS:
  receipt=RECEIPTS/(name.replace('/','__').replace('.png','.json'))
  data=json.loads(receipt.read_text('utf-8-sig'))
  if data.get('series')!='side-proportion-v3': pending.append(name);continue
  im=Image.open(RES/name)
  side=('/flat_left/' in name or '/flat_right/' in name)
  expected=(192,112) if side else (192,160)
  custom='/hand_self/' in name
  if not custom and im.size!=expected:errors.append(name+': dimensions '+str(im.size))
  if im.mode!='RGBA':errors.append(name+': missing alpha')
  alpha=im.convert('RGBA').getchannel('A')
  corners=[alpha.getpixel(xy) for xy in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]]
  if max(corners):errors.append(name+': nontransparent corner')
  bbox=alpha.point(lambda a:255 if a>=24 else 0).getbbox()
  if not bbox:errors.append(name+': empty image');continue
  ratio=(bbox[2]-bbox[0])/(bbox[3]-bbox[1])
  if side and not 1.78<=ratio<=2.32:suspects.append(dict(path=name,ratio=round(ratio,3)))
  records.append(dict(path=name,size=list(im.size),bodyBounds=list(bbox),bodyAspect=round(ratio,3),userCroppedHand=custom,method=data['method'],source=data['source'],master=data['master'],sha256=hashlib.sha256((RES/name).read_bytes()).hexdigest()))
 report=dict(expected=71,complete=len(records),pending=pending,errors=errors,proportionReview=suspects,assets=records)
 (OUT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
 for view in ['flat_left','flat_right','eight-bamboo']:
  members=[r for r in records if ('/'+view+'/') in r['path']] if view!='eight-bamboo' else [r for r in records if r['path'].endswith('/tiao8.png')]
  if not members:continue
  cols=6 if view!='eight-bamboo' else 5
  cw,ch=(224,160) if view!='eight-bamboo' else (224,340)
  sheet=Image.new('RGB',(cols*cw,math.ceil(len(members)/cols)*ch),(18,62,53));d=ImageDraw.Draw(sheet)
  for i,r in enumerate(members):
   im=Image.open(RES/r['path']).convert('RGBA');im.thumbnail((cw-16,ch-42),Image.Resampling.LANCZOS)
   x=(i%cols)*cw+(cw-im.width)//2;y=(i//cols)*ch+12
   sheet.paste(im,(x,y),im)
   label=Path(r['path']).stem if view!='eight-bamboo' else Path(r['path']).parent.name
   d.text(((i%cols)*cw+12,(i//cols)*ch+ch-26),label,font=FONT,fill='white')
  sheet.save(OUT/('preview-'+view+'.jpg'),quality=95)
 print(json.dumps(dict(complete=len(records),pending=len(pending),errors=errors,proportionReview=suspects),ensure_ascii=False))
 if args.final:
  assert len(records)==71 and not errors and not pending and not suspects,'Complete QA before packaging'
  parts=['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>侧斜牌与新八条</title><style>body{font:16px sans-serif;background:#123e35;color:white;margin:28px}section{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;padding:12px;background:#1b5043;border-radius:12px;text-align:center}img{width:192px;height:auto;display:block;margin:auto}figcaption{margin-top:10px}p{color:#e7ce94}</style><h1>左右侧斜牌 · 新八条</h1><p>左右各 34 张，统一 192×112 紧凑透明画布。五个视角八条使用连接式竹节图案。共 71 个不同文件。</p>']
  for group in ['flat_left','flat_right','八条其他视角']:
   parts.append('<h2>'+group+'</h2><section>')
   members=[r for r in records if '/'+group+'/' in r['path']] if group!='八条其他视角' else [r for r in records if '/flat_left/' not in r['path'] and '/flat_right/' not in r['path']]
   for r in members:
    b64=base64.b64encode((RES/r['path']).read_bytes()).decode()
    parts.append('<figure><img src="data:image/png;base64,'+b64+'"><figcaption>'+html.escape(r['path'].replace('tiles/',''))+'</figcaption></figure>')
   parts.append('</section>')
  (OUT/'素材总览.html').write_text(''.join(parts)+'</html>','utf-8')
  archive=OUT/'左右侧斜牌与新版八条.zip'
  with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
   for r in records:z.write(RES/r['path'],'assets/resources/'+r['path'])
   for file in OUT.iterdir():
    if file.suffix in ['.json','.md','.jpg','.html']:z.write(file,'素材说明/'+file.name)
  print(str(archive))

if __name__=='__main__':main()
