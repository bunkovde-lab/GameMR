import random,math
from pathlib import Path
random.seed(2864)
W,H=1600,920
p=[]
def a(s):p.append(s)
a(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Концептуальная карта биотехнологического города Преемства без интерфейса">
<defs>
 <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#0b1720"/><stop offset="0.55" stop-color="#132531"/><stop offset="1" stop-color="#10141c"/></linearGradient>
 <linearGradient id="road" x2="1" y2="1"><stop stop-color="#354450"/><stop offset="0.5" stop-color="#1a2732"/><stop offset="1" stop-color="#42505b"/></linearGradient>
 <linearGradient id="roofa" x2="0" y2="1"><stop stop-color="#394956"/><stop offset="1" stop-color="#202c37"/></linearGradient>
 <linearGradient id="roofb" x2="1" y2="0"><stop stop-color="#33464f"/><stop offset="1" stop-color="#131d25"/></linearGradient>
 <linearGradient id="clin" x2="1" y2="1"><stop stop-color="#aa5951"/><stop offset="0.4" stop-color="#522c38"/><stop offset="1" stop-color="#201d2a"/></linearGradient>
 <radialGradient id="vign"><stop stop-color="#060b11" stop-opacity="0" offset="0.45"/><stop stop-color="#05080d" stop-opacity="0.72" offset="1"/></radialGradient>
 <filter id="glow"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
 <filter id="soft"><feGaussianBlur stdDeviation="29"/></filter>
 <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M 46 0 L 0 0 0 46" fill="none" stroke="#9bc0c4" stroke-opacity="0.055"/></pattern>
</defs>
<rect width="1600" height="920" fill="url(#sky)"/>
<rect width="1600" height="920" fill="url(#grid)"/>
''')
# broad region lighting
for x,y,rad,color,op in [(900,230,300,'#b33444',.26),(310,220,250,'#2b927b',.19),(1300,275,190,'#4496a0',.16),(340,720,320,'#c17539',.22),(1150,690,270,'#587c75',.14),(750,480,290,'#d3aa6b',.10)]:
 a(f'<ellipse cx="{x}" cy="{y}" rx="{rad}" ry="{rad*.55}" fill="{color}" opacity="{op}" filter="url(#soft)"/>')
# water/wide canals
for d in ["M -70 725 Q 240 605 410 655 T 850 720 T 1580 810","M 0 50 Q 150 165 325 113 T 630 130"]:
 a(f'<path d="{d}" stroke="#070f17" stroke-width="85" fill="none" opacity=".82"/>')
 a(f'<path d="{d}" stroke="#1f4856" stroke-width="42" fill="none" opacity=".38"/>')
# city blocks geometric clusters
clusters=[(235,235,340,260,'#63bba6'),(820,230,480,340,'#a85c60'),(1230,275,310,300,'#6c9eae'),(405,650,480,370,'#b58357'),(875,490,310,260,'#d3b083'),(1210,660,440,310,'#8cb6ac'),(700,755,280,250,'#73b5cc')]
for cx,cy,rx,ry,accent in clusters:
 for j in range(115):
  x=random.gauss(cx,rx*.29);y=random.gauss(cy,ry*.31)
  if not (22<x<1565 and 35<y<896):continue
  if math.hypot(x-850,y-490)<130 and cx != 875: continue
  w=random.randrange(10,32);h=random.randrange(11,52)
  if cx==820 and random.random()<.1: h=random.randrange(75,150)
  if cx==405 and random.random()<.2: w=random.randrange(24,44)
  roof=random.choice(['#303b46','#3e4348','#364652','#2c343d','#44525b'])
  side=random.choice(['#141e28','#1c252e','#22242b'])
  a(f'<path d="M{x:.0f} {y:.0f} l{w} -{w*.26:.0f} l0 {-h:.0f} l{-w} {w*.26:.0f}Z" fill="{side}" stroke="#667884" stroke-opacity=".22" stroke-width=".5"/>')
  a(f'<path d="M{x:.0f} {y-h:.0f} l{w} -{w*.26:.0f} l{w*.45:.0f} {w*.21:.0f} l{-w} {w*.26:.0f}Z" fill="{roof}" stroke="#8b9e9d" stroke-opacity=".17" stroke-width=".6"/>')
  if random.random()<.72:
   for k in range(1,5):
    if h>16 and random.random()<.8:
     xi=x+random.choice([4,8,12]); yi=y-k*(h/5)
     a(f'<rect x="{xi:.0f}" y="{yi:.0f}" width="2" height="3" fill="{accent}" opacity="{random.uniform(.35,.72):.2f}"/>')
# arterials
roads=[('M -90 485 C 260 455 450 462 740 500 S 1210 600 1700 555',17),('M 560 -100 Q 620 245 700 460 T 1030 1030',20),('M -80 850 C 230 765 570 738 900 690 S 1325 560 1650 350',14),('M 1250 -80 Q 1040 260 1065 480 T 1285 1010',12)]
for d,wd in roads:
 a(f'<path d="{d}" stroke="#0b1019" stroke-width="{wd+18}" fill="none" opacity=".96"/>')
 a(f'<path d="{d}" stroke="url(#road)" stroke-width="{wd}" fill="none"/>')
 a(f'<path d="{d}" stroke="#c59a6a" stroke-width="1.8" stroke-dasharray="16 25" opacity=".7" fill="none"/>')
 a(f'<path d="{d}" stroke="#a3cdd0" stroke-width="1.3" opacity=".37" fill="none" transform="translate(0,-6)"/>')
# transit oval monorail
for d in ['M120 675 Q 420 560 750 620 T 1510 730','M440 30 Q 730 60 965 200 T 1540 285']:
 a(f'<path d="{d}" stroke="#0d121b" stroke-width="21" fill="none"/>')
 a(f'<path d="{d}" stroke="#7b8f9a" stroke-width="8" fill="none" opacity=".75"/>')
 a(f'<path d="{d}" stroke="#e3a46d" stroke-width="2.5" stroke-dasharray="28 14" fill="none" opacity=".72"/>')
# green biogardens ellipse domes and branches
for x,y,rx,ry in [(250,235,146,105),(410,190,96,72),(140,265,80,59),(300,320,101,62)]:
 a(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="#265e51" stroke="#80c1a0" stroke-opacity=".55" stroke-width="3"/>')
 for i in range(6):
  xx=x+random.randint(-rx//2,rx//2);yy=y+random.randint(-ry//2,ry//2)
  a(f'<circle cx="{xx}" cy="{yy}" r="{random.randrange(10,25)}" fill="{random.choice(["#376851","#3e7859","#20594f","#548a68"])}" opacity=".87"/>')
 a(f'<path d="M{x-rx} {y} Q{x} {y-ry*1.9} {x+rx} {y}" stroke="#9bcabb" stroke-width="4" fill="none" opacity=".6"/>')
 for k in [-.66,-.33,.33,.66]:
  xx=x+rx*k
  a(f'<path d="M{xx} {y-ry*.4:.0f} Q {x+rx*k*.6:.0f} {y-ry*1.4:.0f} {x} {y-ry*.9:.0f}" stroke="#c0ddbd" stroke-width="1.5" fill="none" opacity=".45"/>')
# medical center geometric megastructure
x,y=860,260
a('<ellipse cx="860" cy="290" rx="220" ry="125" fill="#491e31" opacity=".5"/>')
for xx,yy,rr in [(850,225,84),(990,284,60),(735,280,54)]:
 a(f'<ellipse cx="{xx}" cy="{yy}" rx="{rr+9}" ry="{rr*.58}" fill="#1a2027" stroke="#e97776" stroke-width="4" opacity=".92"/>')
 a(f'<ellipse cx="{xx}" cy="{yy}" rx="{rr-8}" ry="{rr*.46}" fill="#6b2f3e" opacity=".7"/>')
for xx,hh in [(820,152),(855,213),(891,163),(935,121),(744,105)]:
 a(f'<rect x="{xx}" y="{300-hh}" width="{random.randrange(21,42)}" height="{hh}" fill="url(#clin)" stroke="#b66d69" stroke-width="2"/>')
 a(f'<path d="M{xx+13} {300-hh+22} v {hh-40}" stroke="#e08483" stroke-width="3" stroke-opacity=".48"/>')
a('<circle cx="870" cy="205" r="48" fill="none" stroke="#df6468" stroke-width="7" opacity=".8" filter="url(#glow)"/>')
a('<path d="M870 171 v66 M838 205 h64" stroke="#ffe0b5" stroke-width="8" opacity=".95"/>')
# industrial stacks and pipes
for x,y,h in [(223,618,120),(292,592,97),(390,610,145),(455,650,135),(535,690,115),(230,795,85)]:
 a(f'<rect x="{x}" y="{y-h}" width="25" height="{h}" fill="#3a3333" stroke="#d28c66" stroke-opacity=".7" stroke-width="2"/>')
 a(f'<rect x="{x-2}" y="{y-h}" width="29" height="8" fill="#ba7b62"/>')
 a(f'<ellipse cx="{x+12}" cy="{y-h-15}" rx="29" ry="16" fill="#aab3b5" opacity=".12" filter="url(#soft)"/>')
a('<path d="M118 755 H565 v-55 H675 M155 815 H500" stroke="#7b7772" stroke-width="12" fill="none" opacity=".7"/>')
# science quarter vessel and rings
for cx,cy,r in [(1290,270,83),(1370,350,52),(1165,225,54)]:
 a(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#17333e" stroke="#66bed1" stroke-width="4" opacity=".9"/>')
 a(f'<circle cx="{cx}" cy="{cy}" r="{r*.68:.0f}" fill="none" stroke="#6fd0c7" stroke-width="2" opacity=".55"/>')
 for k in range(4):
  angle=k*math.pi/2
  x2=cx+math.cos(angle)*r*.65;y2=cy+math.sin(angle)*r*.65
  a(f'<path d="M{cx} {cy} L{x2:.0f} {y2:.0f}" stroke="#9ab7b9" stroke-width="1" opacity=".4"/>')
# administrative plaza
for cx,cy in [(775,488),(865,480),(818,543)]:
 a(f'<rect x="{cx-40}" y="{cy-27}" width="80" height="54" fill="#35434b" stroke="#c1ad82" stroke-width="3"/>')
 a(f'<path d="M{cx-35} {cy-25} l35 -30 l35 30" stroke="#f0bb87" stroke-width="3" fill="none"/>')
 a(f'<circle cx="{cx}" cy="{cy}" r="13" fill="#dcab72" opacity=".45"/>')
# traffic lights
for k in range(120):
 x=random.randrange(10,1590);y=random.randrange(80,890)
 if random.random()<.7:
  a(f'<circle cx="{x}" cy="{y}" r="{random.choice([.6,.9,1.5])}" fill="{random.choice(["#e0a777","#bdc8b5","#db7772"])}" opacity="{random.uniform(.25,.8):.2f}"/>')
# atmospheric foreground and subtle vignette
a('<path d="M0 785 Q350 700 730 820 T1600 760 V920 H0Z" fill="#070e16" opacity=".23"/>')
a('<rect width="1600" height="920" fill="url(#vign)"/>')
a('</svg>')
Path('/mnt/data/mir_raskola_ui_proto/assets/map-placeholder.svg').write_text('\n'.join(p),encoding='utf-8')
print('SVG size',Path('/mnt/data/mir_raskola_ui_proto/assets/map-placeholder.svg').stat().st_size)
