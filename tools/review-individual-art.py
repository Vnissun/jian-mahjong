"""Inventory and contact sheets only. Does not draw or alter game artwork."""
import argparse, base64, hashlib, html, json, math, zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/artwork/individual-set-v2'
OLD = ROOT / 'output/artwork/complete-set-v1'
RES = ROOT / 'assets/resources'
FONT = ImageFont.truetype('C:/Windows/Fonts/simhei.ttf', 17)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--final', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = json.loads((OLD / 'face-jobs.json').read_text('utf-8-sig'))
    jobs += json.loads((OLD / 'extra-jobs.json').read_text('utf-8-sig'))
    for view, size in [('hand_self',(240,360)),('flat_bottom',(192,160)),('flat_top',(192,160)),('flat_left',(192,192)),('flat_right',(192,192))]:
        jobs.append(dict(path=f'tiles/{view}/wan1.png',w=size[0],h=size[1]))
    jobs.sort(key=lambda j: j['path'])
    records, pending, errors = [], [], []
    for job in jobs:
        path = job['path']
        receipt = OLD / 'receipts' / (path.replace('/','__').replace('.png','.json'))
        if not receipt.exists():
            pending.append(path)
            continue
        data = json.loads(receipt.read_text('utf-8-sig'))
        if data.get('method') != 'individual-image-generation':
            pending.append(path)
            continue
        file = RES / path
        im = Image.open(file)
        if im.size != (job['w'], job['h']): errors.append(path+': wrong size')
        if im.mode != 'RGBA': errors.append(path+': missing RGBA')
        alpha = im.convert('RGBA').getchannel('A')
        corners = [alpha.getpixel(p) for p in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]]
        if max(corners) != 0: errors.append(path+': opaque corner')
        if not alpha.getbbox(): errors.append(path+': empty image')
        records.append(dict(path=path,width=im.width,height=im.height,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),source=data.get('source'),master=data['master'],method=data['method'],cornerAlpha=corners))
    groups = {}
    for r in records:
        groups.setdefault(str(Path(r['path']).parent).replace('\\','/'),[]).append(r)
    for group, members in groups.items():
        # Display order follows Mahjong suits and numeric order, not alphabetic order.
        order = {'wan':0,'tong':1,'tiao':2,'feng':3,'yuan':4}
        members.sort(key=lambda r: (order.get(Path(r['path']).stem.rstrip('0123456789'),9),Path(r['path']).stem))
        cols = 9 if '/backs' not in group and group.startswith('tiles/') else 6
        cw,ch = (144,228) if group.endswith('hand_self') else (180,208)
        sheet = Image.new('RGB',(cols*cw,math.ceil(len(members)/cols)*ch),(19,64,54))
        draw = ImageDraw.Draw(sheet)
        for i,r in enumerate(members):
            im=Image.open(RES/r['path']).convert('RGBA')
            im.thumbnail((cw-12,ch-32),Image.Resampling.LANCZOS)
            x,y=(i%cols)*cw,(i//cols)*ch
            sheet.paste(im,(x+(cw-im.width)//2,y+8),im)
            draw.text((x+8,y+ch-23),Path(r['path']).stem,font=FONT,fill='white')
        sheet.save(OUT/('preview-'+group.replace('/','-')+'.jpg'),quality=94)
    report = dict(expected=210,completed=len(records),pending=pending,errors=errors,assets=records)
    (OUT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(dict(expected=210,completed=len(records),pending=len(pending),errors=errors),ensure_ascii=False))
    if args.final:
        assert len(records)==210 and not pending and not errors, 'Assets are not complete/valid'
        parts=['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>集安麻将 · 逐张生成素材</title><style>body{background:#124035;color:#fff;font:16px sans-serif;margin:30px}section{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;padding:8px;background:#1d5146;border-radius:12px;text-align:center;width:180px}img{width:172px;height:200px;object-fit:contain}h2{margin-top:36px}p{color:#ddc997}</style><h1>集安麻将 · 逐张生成素材</h1><p>210 张独立生成的透明 PNG。此页面用于查看素材，尚未接入游戏显示。</p>']
        for group,members in groups.items():
            parts.append('<h2>'+html.escape(group)+'</h2><section>')
            for r in members:
                encoded=base64.b64encode((RES/r['path']).read_bytes()).decode('ascii')
                parts.append('<figure><img src="data:image/png;base64,'+encoded+'"><figcaption>'+html.escape(Path(r['path']).name)+'</figcaption></figure>')
            parts.append('</section>')
        parts.append('</html>')
        (OUT/'素材总览.html').write_text(''.join(parts),'utf-8')
        with zipfile.ZipFile(OUT/'麻将UI素材-逐张生成版.zip','w',zipfile.ZIP_DEFLATED) as z:
            for r in records: z.write(RES/r['path'],'assets/resources/'+r['path'])
            for file in OUT.iterdir():
                if file.suffix in ['.json','.md','.jpg','.html']: z.write(file,'素材说明/'+file.name)
        print(str(OUT/'麻将UI素材-逐张生成版.zip'))

if __name__ == '__main__': main()
