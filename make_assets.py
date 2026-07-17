from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root=Path('/mnt/data/work_6162/beta/icons')
red1=(239,57,63); red2=(211,41,48); white=(255,255,255); black=(20,20,20)
font_path='/usr/share/fonts/truetype/noto/NotoSerifDisplay-BlackItalic.ttf'

def icon(size, out, maskable=False):
    im=Image.new('RGBA',(size,size),(0,0,0,0)); p=im.load()
    for y in range(size):
        t=y/(size-1)
        c=tuple(int(red1[i]*(1-t)+red2[i]*t) for i in range(3))+(255,)
        for x in range(size): p[x,y]=c
    # rounded mask for normal icons, full square for maskable
    if not maskable:
        m=Image.new('L',(size,size),0); d=ImageDraw.Draw(m); d.rounded_rectangle((0,0,size-1,size-1),radius=int(size*.22),fill=255)
        im.putalpha(m)
    d=ImageDraw.Draw(im)
    font=ImageFont.truetype(font_path,int(size*.48))
    # balanced V on left
    d.text((int(size*.11),int(size*.09)), 'V', font=font, fill=white, stroke_width=1)
    # cart to right/lower, centered as one symbol
    x0=int(size*.49); y0=int(size*.36); w=int(size*.31); h=int(size*.25)
    sw=max(3,int(size*.018))
    d.line((x0,y0-int(size*.05),x0+int(size*.035),y0-int(size*.05),x0+int(size*.08),y0+h),fill=white,width=sw,joint='curve')
    for i in range(4):
        yy=y0+int(i*h/4)
        d.line((x0+int(size*.08),yy,x0+w,yy),fill=white,width=sw)
    d.line((x0+int(size*.08),y0+h,x0+w-int(size*.02),y0+h),fill=white,width=sw)
    r=int(size*.027)
    for cx in (x0+int(size*.13),x0+w-int(size*.06)):
        d.ellipse((cx-r,y0+h+int(size*.07)-r,cx+r,y0+h+int(size*.07)+r),fill=black)
    im.save(out)

icon(512,root/'icon-512.png')
icon(192,root/'icon-192.png')
icon(96,root/'icon-96.png')
icon(512,root/'icon-maskable-512.png',True)
icon(180,root/'apple-touch-icon.png')
icon(64,root/'favicon.png')
# monochrome badge centered transparent
s=96
im=Image.new('RGBA',(s,s),(0,0,0,0)); d=ImageDraw.Draw(im)
f=ImageFont.truetype(font_path,48)
d.text((4,3),'V',font=f,fill=white)
x0=45;y0=29;w=38;h=28;sw=4
d.line((x0,y0-5,x0+4,y0-5,x0+10,y0+h),fill=white,width=sw)
for i in range(4):
    yy=y0+i*7; d.line((x0+10,yy,x0+w,yy),fill=white,width=sw)
for cx in (58,78): d.ellipse((cx-3,68,cx+3,74),fill=white)
im.save(root/'notification-badge-96.png')
