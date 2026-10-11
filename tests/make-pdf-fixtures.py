"""Generate synthetic test PDFs outside the repository; no real vessel data."""
import json,sys
from pathlib import Path
from reportlab.pdfgen import canvas
from PIL import Image
import fitz
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
p=out/'digital.pdf';c=canvas.Canvas(str(p),pagesize=(1000,1000))
c.setFont('Helvetica',14)
for x,text in zip([15,65,260,420,600,760,900],['VOY','PORT / TERMINAL','B/L DATE','CARGO',"SHIP'S",'B/L','Qualified']):c.drawString(x,930,text)
for x in [600,760]:c.drawString(x,908,'FIGURES')
expected=[]
for n in range(1,21):
 row={'port':f'PORT {n}','date':f'2026-09-{n:02d}','cargo':'OIL','ship':str(1000+n),'bl':'1000'};expected.append(row)
 for x,text in zip([15,65,260,420,600,760,900],[str(n),row['port'],f'{n:02d}/09/2026',row['cargo'],str(1000+n)+'.000','1000.000','NO']):c.drawString(x,890-n*30,text)
c.drawString(420,250,'TOTALS:');c.drawString(65,220,'STS / First voyage after Dry Dock — inspector note only')
c.showPage();c.save()
json.dump(expected,open(out/'expected.json','w'))
doc=fitz.open(p);pix=doc[0].get_pixmap(matrix=fitz.Matrix(3,3));im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
im.save(out/'scan.pdf','PDF',resolution=216);im.save(out/'photo.png')
# Explicit inspector column mapping for the synthetic scan / photo.
json.dump({'regions':{'port':[5.5,24],'date':[24,39],'cargo':[39,56],'ship':[56,72],'bl':[72,88]},'options':{'top':10.2,'bottom':72,'numberMode':'dot','dateOrder':'dmy'}},open(out/'settings.json','w'))
