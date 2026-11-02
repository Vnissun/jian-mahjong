"""Generate the 170 tile sprites from AI blank bodies and deterministic glyphs.
User approved programmatic composition for consistent bodies and exact suit counts.
"""
from pathlib import Path
import json, math, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/artwork/complete-set-v1'
RES=ROOT/'assets/resources'
FONT=Path('C:/Windows/Fonts/simkai.ttf')
W,H=600,900
RED=(166,32,23,255); GREEN=(14,105,48,255); BLACK=(23,30,23,255)
LAYOUTS={
 1:[(0,0)],2:[(0,-.70),(0,.70)],3:[(.65,-.70),(0,0),(-.65,.70)],
 4:[(-.62,-.65),(.62,-.65),(-.62,.65),(.62,.65)],
 5:[(-.62,-.70),(.62,-.70),(0,0),(-.62,.70),(.62,.70)],
 6:[(-.62,-.85),(.62,-.85),(-.62,0),(.62,0),(-.62,.85),(.62,.85)],
 7:[(-.60,-1.10),(0,-.78),(.60,-.46),(-.62,.25),(.62,.25),(-.62,1.05),(.62,1.05)],
 8:[(-.62,y) for y in [-1.10,-.36,.36,1.10]]+[(.62,y) for y in [-1.10,-.36,.36,1.10]],
 9:[(x,y) for y in [-1,0,1] for x in [-.72,0,.72]]
}
BAMBOO={
 2:[(0,-.65),(0,.65)],3:[(0,-.75),(-.65,.7),(.65,.7)],
 4:[(-.65,-.65),(.65,-.65),(-.65,.65),(.65,.65)],
 5:[(-.65,-.75),(.65,-.75),(0,0),(-.65,.75),(.65,.75)],
 6:[(x,y) for y in [-.65,.65] for x in [-.7,0,.7]],
 7:[(0,-1.15)]+[(x,y) for y in [-.10,1.0] for x in [-.7,0,.7]],
 8:[(-.65,-.7),(-.18,-.7),(.18,-.7),(.65,-.7),(-.65,.7),(-.18,.7),(.18,.7),(.65,.7)],
 9:[(x,y) for y in [-1,0,1] for x in [-.7,0,.7]]
}
QUADS={
 'hand_self':[(.20,.20),(.80,.20),(.80,.79),(.20,.79)],
 'flat_bottom':[(.335,.17),(.665,.17),(.725,.72),(.285,.72)],
 'flat_top':[(.735,.735),(.28,.735),(.335,.18),(.675,.18)],
 'flat_left':[(.71,.295),(.855,.545),(.285,.735),(.15,.445)],
 'flat_right':[(.16,.485),(.285,.285),(.845,.455),(.735,.73)]
}
def fit_text(draw,text,box,color):
    l,t,r,b=box
    size=1000
    while size>8:
        font=ImageFont.truetype(str(FONT),size)
        bb=font.getbbox(text,stroke_width=1)
        if bb[2]-bb[0]<=r-l and bb[3]-bb[1]<=b-t:break
        size-=2
    draw.text(((l+r-bb[2]-bb[0])/2,(t+b-bb[3]-bb[1])/2),text,font=font,fill=color,stroke_width=1,stroke_fill=color)

def bird(draw):
    # One stylized engraved peacock: fan, body, neck, beak and two feet.
    for i in range(9):
        a=math.radians(202+i*17)
        x=300+210*math.cos(a);y=410+245*math.sin(a)
        draw.line((295,580,x,y),fill=GREEN,width=18)
        draw.ellipse((x-38,y-54,x+38,y+54),fill=GREEN)
        draw.ellipse((x-25,y-39,x+25,y+39),fill=(229,232,205,255))
        draw.ellipse((x-18,y-28,x+18,y+28),fill=GREEN)
        draw.ellipse((x-7,y-12,x+7,y+12),fill=RED)
    draw.ellipse((180,465,385,705),fill=GREEN)
    draw.ellipse((190,493,310,659),fill=(39,139,67,255))
    draw.arc((166,476,340,686),285,75,fill=(225,229,197,255),width=8)
    draw.line([(342,564),(389,450),(390,348)],fill=GREEN,width=60)
    draw.ellipse((355,293,435,371),fill=GREEN)
    draw.polygon([(428,327),(475,341),(428,351)],fill=RED)
    draw.ellipse((407,315,418,326),fill=BLACK)
    for x in [383,399,415]:draw.line((398,301,x,270),fill=GREEN,width=6)
    for x in [242,311]:
        draw.line((x,685,x-12,765),fill=RED,width=8)
        draw.line((x-12,765,x-41,787),fill=RED,width=7)
        draw.line((x-12,765,x+17,782),fill=RED,width=7)

def glyph(kind):
    image=Image.new('RGBA',(W,H))
    d=ImageDraw.Draw(image)
    if kind.startswith('wan'):
        n=int(kind[3:])
        fit_text(d,'一二三四五六七八九'[n-1],(45,28,555,278),BLACK)
        fit_text(d,'萬',(40,312,560,872),RED)
    elif kind.startswith('tong'):
        n=int(kind[4:]);points=LAYOUTS[n];assert len(points)==n
        radius=198 if n==1 else 100 if n==2 else 81 if n==3 else 76 if n<=6 else 65
        for i,(px,py) in enumerate(points):
            x=300+px*220;y=450+py*270
            color=GREEN
            if n==3 and i==1 or n==5 and i==2 or n==6 and i>=2 or n==7 and i>=3 or n==9 and 3<=i<6:color=RED
            if n==8:color=BLACK
            for frac,width in [(1,13),(.70,10),(.37,9)]:
                rr=radius*frac;d.ellipse((x-rr,y-rr,x+rr,y+rr),outline=color,width=width)
            if n==1:
                for j in range(16):
                    a=j*math.pi/8
                    d.line((x+math.cos(a)*145,y+math.sin(a)*145,x+math.cos(a)*177,y+math.sin(a)*177),fill=GREEN,width=10)
                d.ellipse((x-60,y-60,x+60,y+60),fill=RED)
    elif kind.startswith('tiao'):
        n=int(kind[4:])
        if n==1:bird(d)
        else:
            points=BAMBOO[n];assert len(points)==n
            for i,(px,py) in enumerate(points):
                rod=Image.new('RGBA',(150,220));rd=ImageDraw.Draw(rod)
                color=RED if n==5 and i==2 or n==7 and i==0 or n==9 and i%3==1 else GREEN
                rd.rounded_rectangle((50,20,100,200),12,fill=color)
                rd.line((65,28,65,192),fill=(227,231,204,255),width=5)
                rd.line((83,28,83,192),fill=(50,144,75,255) if color==GREEN else (197,57,35,255),width=5)
                for yy in [30,110,190]:rd.rounded_rectangle((39,yy-8,111,yy+8),5,fill=color)
                if n==8:rod=rod.rotate(34 if i in [0,3,4,7] else -34,resample=Image.Resampling.BICUBIC)
                rod=rod.resize((112,167) if n>=7 else (130,194),Image.Resampling.LANCZOS)
                x=round(300+px*230-rod.width/2);y=round(450+py*265-rod.height/2)
                image.alpha_composite(rod,(x,y))
    elif kind.startswith('feng'):
        fit_text(d,'東南西北'[int(kind[4:])-1],(40,130,560,770),BLACK)
    elif kind=='yuan1':fit_text(d,'中',(50,130,550,770),RED)
    elif kind=='yuan2':fit_text(d,'發',(35,130,565,770),GREEN)
    elif kind=='yuan3':d.rectangle((112,255,488,631),outline=RED,width=16)
    else:raise ValueError(kind)
    # Very thin ivory bevel around the ink, retained at export sizes.
    mask=image.getchannel('A')
    rim=ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(5)),mask)
    under=Image.new('RGBA',image.size,(255,250,226,0));under.putalpha(rim.point(lambda p:int(p*.65)))
    return Image.alpha_composite(under,image)

def coefficients(dst):
    src=[(0,0),(W,0),(W,H),(0,H)]
    matrix=[];rhs=[]
    for (x,y),(u,v) in zip(dst,src):
        matrix.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]])
        rhs.extend([u,v])
    for i in range(8):
        pivot=max(range(i,8),key=lambda j:abs(matrix[j][i]))
        matrix[i],matrix[pivot]=matrix[pivot],matrix[i];rhs[i],rhs[pivot]=rhs[pivot],rhs[i]
        q=matrix[i][i];matrix[i]=[v/q for v in matrix[i]];rhs[i]/=q
        for j in range(8):
            if j==i:continue
            q=matrix[j][i];matrix[j]=[a-q*b for a,b in zip(matrix[j],matrix[i])];rhs[j]-=q*rhs[i]
    return tuple(rhs)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    kinds=[f'{s}{n}' for s,last in [('wan',9),('tong',9),('tiao',9),('feng',4),('yuan',3)] for n in range(1,last+1)]
    assert len(kinds)==34
    glyphs={k:glyph(k) for k in kinds}
    for k,g in glyphs.items():
        path=OUT/'glyphs'/f'{k}.png';path.parent.mkdir(exist_ok=True);g.save(path)
    specs=json.loads((OUT/'blank-templates.json').read_text(encoding='utf-8-sig'))
    for spec in specs:
        view=spec['id'];width=spec['w'];height=spec['h']
        template=Image.open(spec['source']).convert('RGBA')
        template_path=OUT/'templates'/f'{view}.png';template_path.parent.mkdir(exist_ok=True);template.save(template_path)
        size=(width*3,height*3)
        # Masters already use the requested aspect; fit with unchanged proportions.
        factor=min(size[0]/template.width,size[1]/template.height)
        newsize=(round(template.width*factor),round(template.height*factor))
        base=Image.new('RGBA',size)
        offset=((size[0]-newsize[0])//2,(size[1]-newsize[1])//2)
        base.alpha_composite(template.resize(newsize,Image.Resampling.LANCZOS),offset)
        quad=[(x*newsize[0]+offset[0],y*newsize[1]+offset[1]) for x,y in QUADS[view]]
        coeff=coefficients(quad)
        for kind in kinds:
            path=RES/'tiles'/view/f'{kind}.png';path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists():
                draft=OUT/'ai-drafts'/'tiles'/view/path.name;draft.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,draft)
            face=glyphs[kind].transform(size,Image.Transform.PERSPECTIVE,coeff,resample=Image.Resampling.BICUBIC)
            result=Image.alpha_composite(base,face)
            master=OUT/'masters'/'tiles'/view/path.name;master.parent.mkdir(parents=True,exist_ok=True);result.save(master)
            result.resize((width,height),Image.Resampling.LANCZOS).save(path)
            receipt={'path':f'tiles/{view}/{kind}.png','width':width,'height':height,'method':'approved-program-composite','template':str(template_path),'glyph':kind,'glyphCount':int(kind[4:]) if kind.startswith(('tong','tiao')) else None,'master':str(master),'cornerAlpha':0}
            receipt_path=OUT/'receipts'/(receipt['path'].replace('/','__').replace('.png','.json'));receipt_path.parent.mkdir(exist_ok=True)
            receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
        print(view+': 34 sprites exported',flush=True)
    contact=Image.new('RGB',(1400,math.ceil(34/10)*220),(21,69,59));d=ImageDraw.Draw(contact)
    for i,k in enumerate(kinds):
        img=Image.open(RES/'tiles/hand_self'/f'{k}.png');img.thumbnail((110,180))
        x=(i%10)*140+(140-img.width)//2;y=(i//10)*220
        contact.paste(img,(x,y),img);d.text(((i%10)*140+30,y+184),k,fill='white')
    contact.save(OUT/'preview-hand-self.png')
    views=Image.new('RGB',(1500,400),(21,69,59));d=ImageDraw.Draw(views)
    for i,spec in enumerate(specs):
        img=Image.open(RES/'tiles'/spec['id']/'wan1.png');img.thumbnail((250,330))
        x=i*300+(300-img.width)//2;y=(350-img.height)//2
        views.paste(img,(x,y),img);d.text((i*300+70,366),spec['id'],fill='white')
    views.save(OUT/'preview-five-views.png')
    print('170 sprites complete',flush=True)
if __name__=='__main__':main()
