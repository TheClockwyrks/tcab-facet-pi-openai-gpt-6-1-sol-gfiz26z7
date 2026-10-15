"""One-time original asset authoring. Not used by npm/build. Requires the six art tools."""
import colorsys
import json
import math
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
TMP = pathlib.Path(tempfile.mkdtemp(prefix='facet-'))

def run(tool, *args):
    subprocess.run([tool, *map(str, args)], check=True, stdout=subprocess.DEVNULL, cwd=TMP)

def rect(a, x, y, w, h, color):
    a.append(dict(op='fill_rect', x=round(x), y=round(y), width=max(1, round(w)), height=max(1, round(h)), color=color))

def line(a, p, q, color):
    a.append(dict(op='line', x0=round(p[0]), y0=round(p[1]), x1=round(q[0]), y1=round(q[1]), color=color))

def poly(a, points, color):
    for y in range(max(0, math.floor(min(p[1] for p in points))), min(64, math.ceil(max(p[1] for p in points)))):
        xs=[]
        for p,q in zip(points, points[1:]+points[:1]):
            if min(p[1],q[1]) <= y+.5 < max(p[1],q[1]):
                xs.append(p[0]+(y+.5-p[1])*(q[0]-p[0])/(q[1]-p[1]))
        xs.sort()
        for x,z in zip(xs[::2],xs[1::2]):
            rect(a, math.ceil(x),y,max(1, math.floor(z)-math.ceil(x)+1),1,color)

def rgb(h,s,v):
    return '#'+''.join(f'{round(c*255):02x}' for c in colorsys.hsv_to_rgb(h,s,v))

KINDS=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism']
HUES=[.96,.075,.145,.405,.51,.615,.765,.52]
SHAPES=[[(32,4),(51,14),(57,32),(44,54),(20,54),(7,32),(13,14)],
        [(21,6),(43,6),(57,25),(50,47),(32,59),(14,47),(7,25)],
        [(32,3),(56,28),(32,59),(8,28)],
        [(18,8),(46,8),(55,18),(55,46),(46,55),(18,55),(9,46),(9,18)],
        [(32,3),(53,17),(53,46),(32,60),(11,46),(11,17)],
        [(32,4),(56,45),(45,54),(19,54),(8,45)],
        [(32,3),(50,13),(58,32),(50,51),(32,60),(14,51),(6,32),(14,13)],
        [(32,3),(55,18),(53,46),(32,60),(11,46),(9,18)]]

def stone(k,strain=0,turn=0):
    a=[]; h=HUES[k]; pts=SHAPES[k]
    if turn:
        pts=[(32+(x-32)*math.cos(turn)-(y-32)*math.sin(turn),32+(x-32)*math.sin(turn)+(y-32)*math.cos(turn)) for x,y in pts]
    # a one-pixel dark girdle, then independently lit bevels
    poly(a,pts,'#03090f')
    inner=[(32+(x-32)*.59,31+(y-31)*.59) for x,y in pts]
    for i,(p,q) in enumerate(zip(pts,pts[1:]+pts[:1])):
        hue=(h + (i*.135 if k==7 else 0))%1
        light=[.97,.65,.41,.57,.82,.92,.64,.53][i]
        poly(a,[p,q,inner[(i+1)%len(pts)],inner[i]],rgb(hue,.36 if k==7 else .72,light))
        line(a,p,q,rgb(hue,.46,.64))
    for i,(p,q) in enumerate(zip(inner,inner[1:]+inner[:1])):
        hue=(h + i*.15)%1 if k==7 else h
        poly(a,[p,q,(30,29)],rgb(hue,.24 if k==7 else .58,.72 + .17*math.sin(i+1+turn)))
        line(a,p,q,rgb(hue,.27,.98))
    # refracted off-center face, sharp glints
    line(a,inner[0],inner[2%len(inner)],rgb(h,.3,.93))
    line(a,(18,18),(24,14),'#e8fff0')
    line(a,(19,18),(19,22),'#ffffff')
    rect(a,38,39,2,2,rgb(h,.20,.98))
    # The four damage states are individually rasterized, not runtime tinting.
    paths=[[(33,9),(29,21),(36,29),(30,39),(33,53)],
           [(10,31),(23,30),(31,36),(40,30),(52,34)],
           [(19,13),(25,24),(20,39),(25,49)]]
    for i in range(strain):
        path=paths[i]
        for p,q in zip(path,path[1:]):
            line(a,(p[0]+1,p[1]),(q[0]+1,q[1]),'#fdf5d5' if strain==3 else '#c5e5e4')
            line(a,p,q,'#071019')
        if strain==3:
            for p in path[1:-1]:
                rect(a,p[0]-1,p[1]-1,3,3,'#071019')
    if strain==3:
        # chipped side, ivory hot seams, not a floating status icon
        poly(a,[(11,30),(19,33),(13,40)],'#071019')
        line(a,(28,22),(35,29),'#fff1c8')
        rect(a,42,19,3,2,'#fff1c8')
    return a

def emit(a,path,w=64,h=64,sheet=False):
    path=OUT/path; path.parent.mkdir(parents=True,exist_ok=True)
    log=TMP/'draw-ops.json';log.write_text(json.dumps(a))
    run('draw-sheet' if sheet else 'draw','render','--actions',log,'--out',path,'--width',w,'--height',h,'--no-layers')

for k,name in enumerate(KINDS):
    for s in range(4): emit(stone(k,s),pathlib.Path(f'gems/{name}-{s}.png'))
    if k<7:
        for frame in range(6):
            a=[]; pts=SHAPES[k]; t=frame/5
            for i,(p,q) in enumerate(zip(pts,pts[1:]+pts[:1])):
                ang=math.atan2((p[1]+q[1])/2-32,(p[0]+q[0])/2-32)
                dx=math.cos(ang)*t*22;dy=math.sin(ang)*t*22 + t*t*10
                shard=[(x+dx,y+dy) for x,y in [p,q,(32,31)]]
                # shards thin as they scatter
                c=((sum(x for x,y in shard)/3),(sum(y for x,y in shard)/3))
                shard=[(c[0]+(x-c[0])*(1-t*.65),c[1]+(y-c[1])*(1-t*.65)) for x,y in shard]
                poly(a,shard,rgb(HUES[k],.45,.98-t*.55))
                line(a,shard[0],shard[1],'#e6e9df'+f'{round((1-t)*255):02x}')
            emit(a,pathlib.Path(f'gems/break/{name}/{frame}.png'),sheet=True)
for strain in range(4):
    for f in range(12): emit(stone(7,strain,f*math.tau/12),pathlib.Path(f'gems/prism-turn/{strain}/{f}.png'),sheet=True)
for cut in ['brilliant','star']:
    a=[]
    if cut=='brilliant':
        pts=[(32,7),(53,32),(32,56),(11,32)]
        for p,q in zip(pts,pts[1:]+pts[:1]):
            line(a,p,q,'#fff0b8');line(a,(p[0]+1,p[1]),(q[0]+1,q[1]),'#846e48')
        for x,y in [(32,7),(53,32),(32,56),(11,32)]: rect(a,x-1,y-1,3,3,'#ffffe4')
    else:
        pts=[]
        for i in range(16):
            r=26 if i%2==0 else 10
            pts.append((32+math.sin(i*math.pi/8)*r,32-math.cos(i*math.pi/8)*r))
        for p,q in zip(pts,pts[1:]+pts[:1]): line(a,p,q,'#fff4be')
        line(a,(32,16),(32,47),'#fffbe0');line(a,(17,32),(47,32),'#fffbe0')
    emit(a,pathlib.Path(f'gems/{cut}.png'))
# Bench: real raster frame, bevels, grain, engraved grid, brass rivets.
a=[]
for pad,color in [(0,'#03080d'),(2,'#42443f'),(3,'#a28b61'),(4,'#403c32'),(7,'#26313a'),(11,'#18252e'),(14,'#08131b')]:
    rect(a,pad,pad,608-pad*2,608-pad*2,color)
for n in range(9):
    x=16+n*72
    line(a,(x,16),(x,592),'#1e3039');line(a,(16,x),(592,x),'#1e3039')
for y in range(24,592,4):
    for x in [8,597]:rect(a,x,y,2,1,'#34434b')
for x in [8,599]:
    for y in [8,599]:
        rect(a,x-3,y-3,7,7,'#0a141b');rect(a,x-2,y-2,5,5,'#a18c65');line(a,(x-1,y),(x+1,y),'#403d34')
for x in [26,582]:
    for y in [26,582]:
        line(a,(x-7,y),(x+7,y),'#9d865d');line(a,(x,y-7),(x,y+7),'#9d865d')
emit(a,pathlib.Path('gems/board-frame.png'),608,608)

# CLI sound recipes.
def config(name,tool,duration):
    d=dict(sample_rate=22050,channels='stereo',max_duration_ms=duration,seed=743,actions=str(TMP/(name+'-ops.json')),preview=str(TMP/(name+'.png')),wav=str(OUT/'audio'/ (name+'.wav')))
    if tool=='music':d.update(instrument_bank='gm-lite',mid=str(OUT/'audio'/(name+'.mid')))
    if tool=='sfx-sample':d.update(sample_pack='combat-core')
    p=TMP/(name+'.json');p.write_text(json.dumps(d));run(tool,'--config',p,'init');return p

def cmd(tool,c,*args):run(tool,'--config',c,*args)
(OUT/'audio').mkdir(exist_ok=True)
for name,freq,dur in [('select',760,95),('swap',470,160),('refuse',105,130),('land',72,180),('flaw',1800,90),('cut',1480,410),('levelup',520,760),('gameover',440,950)]+[(f'chain-{i}',f,440) for i,f in enumerate([523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.51],1)]:
    c=config(name,'sfx-synth',dur+200)
    cmd('sfx-synth',c,'add-voice','--name','body','--wave','sine' if name not in ['refuse','swap'] else 'triangle','--freq',freq,'--dur',dur,'--gain',-17)
    cmd('sfx-synth',c,'set-envelope','--voice','body','--env','pluck')
    if name.startswith('chain') or name in ['cut','levelup']:
        cmd('sfx-synth',c,'add-fm','--voice','body','--modulator',2.76,'--index',1.6)
        cmd('sfx-synth',c,'add-reverb','--size',.38,'--mix',.15)
    if name in ['select','swap','land','flaw','refuse']:
        cmd('sfx-synth',c,'add-voice','--name','tick','--wave','noise','--dur',35 if name!='flaw' else 85,'--gain',-30 if name!='flaw' else -19)
        cmd('sfx-synth',c,'set-envelope','--voice','tick','--env','pluck')
    if name in ['swap','land','refuse','gameover','levelup']:
        cmd('sfx-synth',c,'set-pitch','--voice','body','--slide-to',freq*(2.8 if name=='levelup' else .35),'--over',dur)
    cmd('sfx-synth',c,'render')
c=config('shatter','sfx-sample',650)
cmd('sfx-sample',c,'add-sample','--name','debris_glass','--t',0,'--gain',-17,'--trim','0,500','--fade-out',160)
cmd('sfx-sample',c,'add-sample','--name','snap_transient','--t',0,'--gain',-25)
cmd('sfx-sample',c,'render')
for name,bpm in [('title',96),('play',76)]:
    c=config(name,'music',int(32*60000/bpm))
    cmd('music',c,'set-tempo','--bpm',bpm)
    for track,inst,gain,pan in [('hook','music_box',-17,-.22),('chords','vibraphone',-24,.23),('pulse','marimba',-26,0)]:
        cmd('music',c,'define-track','--name',track,'--instrument',inst)
        cmd('music',c,'set-track-fx','--track',track,'--gain',gain,'--pan',pan,'--reverb',.21)
    progression=[['D3','F3','A3'],['Bb2','D3','F3'],['G2','Bb2','D3'],['A2','E3','G3']]
    motif=['D5','A5','F5','E5','D5','C5','A4','C5','D5','F5','E5','A5','G5','E5','C5','A4']
    for bar in range(8):
        chord=progression[bar%4]
        for note in chord:cmd('music',c,'add-note','--track','chords','--pitch',note,'--t',bar*4,'--dur',3.6,'--velocity',65)
        for j in range(4):cmd('music',c,'add-note','--track','pulse','--pitch',chord[j%3],'--t',bar*4+j,'--dur',.6,'--velocity',55)
        for j in range(4 if name=='title' else 2):
            t=bar*4+j*(.75 if name=='title' else 1.5)
            cmd('music',c,'add-note','--track','hook','--pitch',motif[(bar*2+j)%len(motif)],'--t',t,'--dur',.55 if name=='title' else .9,'--velocity',72 if name=='title' else 48)
    cmd('music',c,'render')
# Authored live particles. Field units map to local pixels in our compositor.
for name,count,speed,life,size,color in [('clear',13,75,380,2.8,'#a8e1ed'),('flawed',28,150,620,4.5,'#ffd48e'),('cut',22,100,550,3.6,'#fff1bc'),('aura',6,10,1100,2.3,'#c1e7e4')]:
    p=TMP/(name+'-fx.json'); folder=OUT/'fx'/name;folder.mkdir(parents=True,exist_ok=True)
    d=dict(width=128,height=128,duration_ms=1500,fps=30,loop=name=='aura',background='#09131a',actions=str(TMP/(name+'-fx-ops.json')),preview=str(TMP/(name+'-fx.gif')),system=str(folder/'system.json'))
    p.write_text(json.dumps(d))
    cmd('particle-2d',p,'init')
    cmd('particle-2d',p,'add-emitter','--name','sparks','--shape','disc','--x',64,'--y',64,'--radius',25 if name=='aura' else 5,'--rate' if name=='aura' else '--burst',count,'--lifetime',life,'--lifetime-spread',life*.2,'--speed',speed,'--speed-spread',speed*.3,'--cone-angle',180)
    cmd('particle-2d',p,'set-forces','--drag',1.8,'--gravity',-40 if name!='aura' else 0,'--vortex',8 if name=='aura' else 0)
    cmd('particle-2d',p,'set-particle','--emitter','sparks','--size-from',size,'--size-to',.1,'--opacity-from',.8,'--opacity-to',0,'--color-gradient',f'#ffffff@0,{color}@0.3,#486c82@1','--size-curve','ease-out')
    cmd('particle-2d',p,'render','--frame',6,'--out',TMP/(name+'-fx.png'))
# One-time PCM mastering keeps the quiet bank instruments audible beneath cues.
# Only scales the generated recordings; no runtime oscillators or external audio.
import wave
import struct
for path in (OUT/'audio').glob('*.wav'):
    with wave.open(str(path),'rb') as audio:
        params=audio.getparams()
        values=struct.unpack('<'+'h'*(audio.getnframes()*audio.getnchannels()),audio.readframes(audio.getnframes()))
    rms=math.sqrt(sum(v*v for v in values)/len(values))/32768
    target=.025 if path.stem=='play' else .04 if path.stem in ['title','shatter'] else .06
    gain=min(target/max(rms,.000001), .8*32767/max(map(abs,values)))
    mastered=[round(v*gain) for v in values]
    with wave.open(str(path),'wb') as audio:
        audio.setparams(params)
        audio.writeframes(struct.pack('<'+'h'*len(mastered),*mastered))
print('Original assets produced at',OUT)
