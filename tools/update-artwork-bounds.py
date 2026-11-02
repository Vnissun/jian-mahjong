"""Recalculate display bounds without modifying user-supplied PNG artwork."""
from pathlib import Path
import json
from PIL import Image
root=Path(__file__).resolve().parents[1]
resources=root/'assets/resources'
bounds={}
for folder in ['tiles/hand_self','tiles/flat_bottom','tiles/flat_top','tiles/flat_left','tiles/flat_right','tiles/backs','actions','profiles']:
    for path in sorted((resources/folder).glob('*.png')):
        image=Image.open(path).convert('RGBA')
        box=image.getchannel('A').point(lambda a:255 if a>=12 else 0).getbbox()
        if box is None: raise ValueError(f'Empty artwork: {path}')
        x,y,right,bottom=box
        x=max(0,x-2);y=max(0,y-2);right=min(image.width,right+2);bottom=min(image.height,bottom+2)
        bounds[path.relative_to(resources).with_suffix('').as_posix()]=[x,y,right-x,bottom-y]
(root/'assets/scripts/ui/ArtworkBounds.ts').write_text('// PNG display bounds, with original aspect ratios preserved.\nexport const ART_BOUNDS: Record<string, number[]> = '+json.dumps(bounds,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
print(f'Updated display bounds for {len(bounds)} PNGs; original artwork unchanged.')
