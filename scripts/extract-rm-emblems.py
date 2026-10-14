"""Extract the owner's numbered game shields; no generated/reconstructed artwork.
Usage: python scripts/extract-rm-emblems.py /path/to/screenshots
Input names: 2893.jpg,2895.jpg,...,2902.jpg (optional 01- prefix).
"""
from PIL import Image
import numpy as np
from scipy import ndimage as nd
from pathlib import Path
import json,sys
source=Path(sys.argv[1]);out=Path(__file__).resolve().parents[1]/'assets/rm-emblems';out.mkdir(parents=True,exist_ok=True)
entries=[]
for page,name in enumerate(['2893','2895','2896','2897','2898','2899','2900','2901','2902']):
 p=source/(name+'.jpg')
 if not p.exists():p=source/('01-'+name+'.jpg')
 a=np.array(Image.open(p).convert('RGB'));mask=(a[:,:,0]>140)&(a[:,:,1]>60)&(a[:,:,2]<110)&(a[:,:,0]>a[:,:,1]*1.05);lab,_=nd.label(mask);boxes=[]
 for i,s in enumerate(nd.find_objects(lab),1):
  if s is None:continue
  y,x=s;w=x.stop-x.start;h=y.stop-y.start
  if 160<w<310 and 170<h<310 and (lab[s]==i).sum()>8000:boxes.append((x.start,y.start,x.stop,y.stop,i))
 boxes=[b for b in boxes if not any(c!=b and c[0]<=b[0] and c[1]<=b[1] and c[2]>=b[2] and c[3]>=b[3] for c in boxes)]
 boxes.sort(key=lambda b:(round(b[1]/50),b[0]));assert len(boxes)==(16 if page==8 else 20),(name,len(boxes))
 for j,(x,y,x2,y2,i) in enumerate(boxes):
  id=page*20+j;pad=4;y0=max(0,y-pad);x0=max(0,x-pad);crop=a[y0:y2+pad,x0:x2+pad];m=nd.binary_fill_holes(lab[y0:y2+pad,x0:x2+pad]==i);m=nd.binary_dilation(m,iterations=1);alpha=(nd.gaussian_filter(m.astype(float),.6)*255).astype('uint8')
  im=Image.fromarray(np.dstack([crop,alpha]));im.thumbnail((160,176),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(160,176));canvas.paste(im,((160-im.width)//2,(176-im.height)//2));canvas.save(out/f'{id}.webp',quality=92,method=6)
  entries.append({'id':id,'source':name+'.jpg','row':j//4,'column':j%4})
(out/'catalog.json').write_text(json.dumps({'count':176,'order':'left-to-right, top-to-bottom, zero-based','entries':entries},indent=2)+'\n')
print('Extracted',len(entries),'emblems;',sum(p.stat().st_size for p in out.glob('*.webp')),'bytes')
