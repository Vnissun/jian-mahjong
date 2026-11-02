"""Import only visual resources from the supplied mahjong-master project."""
from pathlib import Path
from PIL import Image
import shutil,json
root=Path(__file__).resolve().parents[1]
source=root.parent/'mahjong-master'/'cocosstudio'
target=root/'assets/resources/reference_ui'
files=[]
for folder in ['GameLayer','HelloLayer','SetLayer','GameOverLayer']:
 for p in sorted((source/folder).rglob('*')):
  if p.suffix.lower() in ['.png','.jpg']:
   rel=p.relative_to(source);dst=target/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
   files.append({'source':p.relative_to(root.parent).as_posix(),'target':dst.relative_to(root).as_posix()})
bounds={}
for item in files:
 p=root/item['target'];im=Image.open(p)
 bounds[p.relative_to(root/'assets/resources').with_suffix('').as_posix()]=[0,0,im.width,im.height]
(root/'assets/scripts/ui/ArtworkBounds.ts').write_text('// Visual resources imported from mahjong-master. Full source canvases preserve CocosStudio spacing.\nexport const ART_BOUNDS: Record<string, number[]> = '+json.dumps(bounds,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
(root/'output/reference-ui/import-manifest.json').write_text(json.dumps(files,ensure_ascii=False,indent=2),encoding='utf-8')
print('Imported UI images:',len(files),'No reference game code imported.')
