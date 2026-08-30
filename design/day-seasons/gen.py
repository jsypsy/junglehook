import json
HEAD = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif; }
    a { color: #ff7f3f; } a:hover { color: #e5662a; }
  </style>
</helmet>'''
TAIL = '''</x-dc>
</body>
</html>'''

# 장면 팔레트 — 외곽선/플레이어/타깃은 고정, 하늘·광원·구름·숲만 바뀐다
SCENES = {
  'Morning': dict(title='봄 · 아침 (0m~)', sky=('#bfe8f5','#eaf7d6'), sun='#ffe680', glow='#fff3b0', sunpos=(318,96), cloud='#ffffff',
                  forest=('#a9dc8e','#5fbf6e','#2f8f4e','#1f6b3c'), leaf='#5fbf6e', ink='#1f3a2a', hud='#ffffff', halo=None, extras='blossom'),
  'Noon':    dict(title='봄 · 낮 (150m~)', sky=('#8fd3f4','#d7f2e3'), sun='#ffd94d', glow='#fff0a0', sunpos=(200,70), cloud='#ffffff',
                  forest=('#9fd889','#4fb463','#2a8a48','#1b6337'), leaf='#4fb463', ink='#1f3a2a', hud='#ffffff', halo=None, extras=''),
  'Evening': dict(title='봄 · 저녁 (300m~)', sky=('#f7a072','#ffe0b5'), sun='#ff8c5a', glow='#ffc9a0', sunpos=(80,300), cloud='#ffe6d5',
                  forest=('#8fbf7a','#5a9a5a','#2f6f45','#1d4f33'), leaf='#5a9a5a', ink='#1f3a2a', hud='#fff4ea', halo=None, extras=''),
  'Night':   dict(title='봄 · 밤 (450m~)', sky=('#1b2a4a','#2f4a6b'), sun='#f4f1d0', glow='#8f9fd6', sunpos=(300,110), cloud='#b9c4d9',
                  forest=('#3f6b57','#2c5245','#1e3d33','#152c25'), leaf='#2c5245', ink='#1f3a2a', hud='#e8f0f7', halo='#9ec3b3', extras='stars'),
  'Dawn':    dict(title='봄 · 새벽 (600m~)', sky=('#5d6f9e','#f7c4a0'), sun='#ffd27a', glow='#ffe4b0', sunpos=(330,400), cloud='#e9dbe8',
                  forest=('#6f9d7a','#4a7f5f','#2d5f45','#1e4433'), leaf='#4a7f5f', ink='#1f3a2a', hud='#f5eef2', halo='#e3d6ec', extras='mist'),
  'Summer':  dict(title='여름 · 낮 (750m~)', sky=('#6fc8f2','#cdeeff'), sun='#ffd23a', glow='#fff2a8', sunpos=(200,70), cloud='#ffffff',
                  forest=('#79c96f','#3aa652','#1f8341','#125f2e'), leaf='#3aa652', ink='#1f3a2a', hud='#ffffff', halo=None, extras=''),
  'Autumn':  dict(title='가을 · 낮 (1500m~)', sky=('#b8dff0','#f7e6c8'), sun='#ffd94d', glow='#fff0a0', sunpos=(200,70), cloud='#fff8ee',
                  forest=('#e0b35a','#d47f3a','#a34d2a','#6b3520'), leaf='#d47f3a', ink='#1f3a2a', hud='#fff8ee', halo=None, extras='fall'),
  'Rain':    dict(title='비 (랜덤 · 봄~가을)', sky=('#7f93a6','#b8c6cf'), sun=None, glow=None, sunpos=(200,70), cloud='#7c8b98',
                  forest=('#6fb36a','#3a9a4f','#1f7a3e','#125a2c'), leaf='#3a9a4f', ink='#1f3a2a', hud='#eef3f6', halo=None, extras='rain'),
  'Winter':  dict(title='겨울 · 눈 (2250m~, 갈수록 거세짐)', sky=('#aebfcb','#e6edf1'), sun='#fff4c2', glow='#ffffff', sunpos=(320,60), cloud='#98a8b4',
                  forest=('#dfe9ec','#b9cdd6','#8ea9b6','#5e7a88'), leaf='#b9cdd6', ink='#1f3a2a', hud='#ffffff', halo=None, extras='snow'),
}

def scene_svg(p):
    ink = p['ink']; halo = p['halo']
    def stroke(extra=''):
        return f'stroke="{ink}" stroke-width="3"{extra}'
    sun_x, sun_y = p['sunpos']
    s = []
    s.append(f'''<svg width="393" height="749" viewBox="0 0 393 749" style="position: absolute; left: 0; top: 0;">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{p['sky'][0]}"/><stop offset="1" stop-color="{p['sky'][1]}"/></linearGradient></defs>
    <rect width="393" height="749" fill="url(#sky)"/>''')
    if p['extras'] == 'stars':
        for (x,y,r) in [(40,60,2),(120,140,1.5),(210,40,2),(250,180,1.2),(70,250,1.5),(160,300,1),(350,260,1.5),(300,330,1),(30,380,1.2),(230,420,1.3)]:
            s.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#f4f1d0" opacity="0.9"/>')
        s.append(f'<circle cx="{sun_x}" cy="{sun_y}" r="52" fill="{p["glow"]}" opacity="0.35"/>')
        s.append(f'<circle cx="{sun_x}" cy="{sun_y}" r="36" fill="{p["sun"]}" {stroke()}/>')
        s.append(f'<circle cx="{sun_x-10}" cy="{sun_y-8}" r="6" fill="#dcd8b4"/><circle cx="{sun_x+12}" cy="{sun_y+10}" r="4" fill="#dcd8b4"/>')  # 달 크레이터
    elif p['sun']:
        s.append(f'<circle cx="{sun_x}" cy="{sun_y}" r="54" fill="{p["glow"]}" opacity="0.9"/>')
        s.append(f'<circle cx="{sun_x}" cy="{sun_y}" r="40" fill="{p["sun"]}" {stroke()}/>')
    # 구름 — 비·눈이면 먹구름이 크고 낮게 하늘을 덮는다
    if p['extras'] in ('rain','snow'):
        s.append(f'''<g fill="{p['cloud']}" {stroke(' stroke-linejoin="round"')}>
      <path d="M-20 120 q20 -50 70 -34 q20 -44 72 -18 q52 -12 62 38 q36 6 24 36 H-20 z"/>
      <path d="M200 90 q16 -44 60 -30 q16 -36 60 -14 q46 -10 54 34 q30 4 20 30 H196 q-18 -4 4 -20 z"/>
      <path d="M120 200 q10 -30 40 -22 q12 -24 40 -10 q30 -6 34 24 q20 4 14 22 H116 q-14 -2 4 -14 z"/>
    </g>''')
    else:
        s.append(f'''<g fill="{p['cloud']}" {stroke(' stroke-linejoin="round"')}>
      <path d="M40 160 q10 -26 36 -18 q10 -22 36 -8 q26 -6 30 20 q18 4 12 20 H36 q-14 -2 4 -14 z"/>
      <path d="M232 214 q8 -20 28 -14 q8 -16 28 -6 q20 -4 22 16 q14 2 10 14 H228 q-10 -2 4 -10 z"/>
    </g>''')
    if p['extras'] == 'rain':
        lines = ''.join(f'<line x1="{x}" y1="{y}" x2="{x-6}" y2="{y+22}"/>' for x in range(20, 400, 34) for y in range(150, 700, 70))
        s.append(f'<g stroke="#dbe7f0" stroke-width="2.5" stroke-linecap="round" opacity="0.85">{lines}</g>')
        s.append(f'<g stroke="{ink}" stroke-width="0.8" stroke-linecap="round" opacity="0.35">{lines}</g>')
    if p['extras'] == 'mist':
        s.append('<rect x="0" y="470" width="393" height="90" fill="#ffffff" opacity="0.22"/>')
    f = p['forest']
    s.append(f'''<path d="M0 520 Q60 470 120 500 T240 490 T393 505 V749 H0 Z" fill="{f[0]}" {stroke()}/>
    <path d="M0 580 Q50 540 110 575 T230 560 T393 578 V749 H0 Z" fill="{f[1]}" {stroke()}/>
    <path d="M0 640 Q70 600 140 640 T280 630 T393 645 V749 H0 Z" fill="{f[2]}" {stroke()}/>
    <g fill="{f[3]}" {stroke(' stroke-linejoin="round"')}>
      <path d="M-10 749 C10 690 60 680 90 700 C70 720 60 740 70 749 Z"/>
      <path d="M393 749 C380 690 330 672 300 690 C325 715 330 735 320 749 Z"/>
      <path d="M150 749 C160 715 200 705 230 715 C210 730 205 742 210 749 Z"/>
    </g>''')
    if p['extras'] == 'snow':
        for i,(x,y) in enumerate([(60,250),(150,230),(240,280),(330,240),(100,330),(290,350),(200,400),(40,450),(360,440),(170,480),(120,560),(300,520),(30,600),(230,620),(370,590)]):
            s.append(f'<circle cx="{x}" cy="{y}" r="{[3,4,2.5][i%3]}" fill="#ffffff" stroke="{ink}" stroke-width="1"/>')
    if p['extras'] == 'blossom':
        for (x,y) in [(60,470),(180,455),(300,475),(120,500),(250,490)]:
            s.append(f'<circle cx="{x}" cy="{y}" r="4" fill="#ffb7c9" stroke="{ink}" stroke-width="1.2"/>')
    if p['extras'] == 'fall':
        for (x,y,rot) in [(90,420,20),(200,460,-30),(320,430,40),(150,520,10)]:
            s.append(f'<ellipse cx="{x}" cy="{y}" rx="7" ry="3.5" fill="#d47f3a" stroke="{ink}" stroke-width="1.2" transform="rotate({rot} {x} {y})"/>')
    # 덩굴·앵커·로프·플레이어 (고정 문법; 밤엔 halo)
    vine = p['leaf'] if p['extras']!='fall' else '#8a5a2a'
    def haloed(inner):
        if not halo: return inner
        return inner.replace('__H__', f'stroke="{halo}" stroke-width="7" opacity="0.55"')
    vines = f'''<g stroke="{vine}" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M150 0 C156 40 140 80 152 150"/><path d="M296 0 C302 60 288 110 298 200"/><path d="M362 0 C368 60 350 100 362 150"/>
    </g>'''
    if halo:
        s.append(f'<g stroke="{halo}" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.45"><path d="M150 0 C156 40 140 80 152 150"/><path d="M296 0 C302 60 288 110 298 200"/><path d="M362 0 C368 60 350 100 362 150"/></g>')
        for (x,y) in [(152,158),(298,208),(362,150)]:
            s.append(f'<circle cx="{x}" cy="{y}" r="12" fill="none" stroke="{halo}" stroke-width="4" opacity="0.5"/>')
    s.append(vines)
    # 앵커 = 덩굴 끝이 말려 만든 고리 (덩굴과 같은 색, 가운데가 비어 "여기에 건다"가 읽힌다)
    def loop(x, y, op=1.0):
        return (f'<g opacity="{op}"><circle cx="{x}" cy="{y}" r="8" fill="none" stroke="{ink}" stroke-width="7.5"/>'
                f'<circle cx="{x}" cy="{y}" r="8" fill="none" stroke="{vine}" stroke-width="4"/>'
                f'<ellipse cx="{x+11}" cy="{y-7}" rx="6" ry="3" fill="{vine}" stroke="{ink}" stroke-width="1.5" transform="rotate(-35 {x+11} {y-7})"/></g>')
    s.append(loop(152,158) + loop(298,208) + loop(362,150,0.5))
    s.append(f'''<circle cx="298" cy="208" r="17" fill="none" stroke="#ffcc33" stroke-width="4"/>
    <circle cx="298" cy="208" r="17" fill="none" stroke="{ink}" stroke-width="1.2"/>
    <line x1="154" y1="166" x2="196" y2="352" stroke="#c98c4b" stroke-width="4" stroke-linecap="round"/>
    <line x1="154" y1="166" x2="196" y2="352" stroke="{ink}" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
    <g fill="#ff7f3f" stroke="{ink}" stroke-width="1.5">
      <circle cx="96" cy="300" r="4" opacity="0.25"/><circle cx="112" cy="316" r="4.5" opacity="0.35"/><circle cx="130" cy="330" r="5" opacity="0.45"/><circle cx="150" cy="341" r="5.5" opacity="0.55"/><circle cx="172" cy="348" r="6" opacity="0.7"/>
    </g>
    <circle cx="196" cy="352" r="15" fill="#ff7f3f" stroke="{ink}" stroke-width="3"/>
    <circle cx="190" cy="346" r="4.5" fill="#ffd7b3"/>
    <circle cx="192" cy="354" r="1.9" fill="{ink}"/><circle cx="201" cy="354" r="1.9" fill="{ink}"/>
    <path d="M193 359 Q196.5 362 200 359" stroke="{ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </svg>''')
    return '\n'.join(s)

def board(name, p, m):
    return f'''{HEAD}
<div style="position: relative; width: 393px; height: 749px; overflow: hidden; background: {p['sky'][0]}; color: {p['ink']};">
{scene_svg(p)}
  <div style="position: absolute; left: 14px; top: 14px; display: flex; align-items: center; background: {p['hud']}; border: 2px solid {p['ink']}; border-radius: 999px; padding: 6px 16px 6px 14px; box-shadow: 3px 3px 0 {p['ink']};">
    <span style="font-size: 26px; font-weight: 900; line-height: 1; color: {p['ink']};">{m}m</span>
  </div>
  <div style="position: absolute; right: 14px; top: 20px; display: flex; align-items: center; gap: 6px; background: #ffcc33; border: 2px solid {p['ink']}; border-radius: 999px; padding: 4px 12px; box-shadow: 3px 3px 0 {p['ink']};">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="{p['ink']}" stroke-width="2.5" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
    <span style="font-size: 14px; font-weight: 800; color: {p['ink']};">327m</span>
  </div>
  <div style="position: absolute; left: 14px; bottom: 12px; font-size: 12px; font-weight: 800; color: {p['ink']}; background: {p['hud']}; border: 2px solid {p['ink']}; border-radius: 999px; padding: 3px 10px; opacity: 0.9;">{p['title']}</div>
</div>
{TAIL}'''

METERS = {'Morning':42,'Noon':188,'Evening':336,'Night':492,'Dawn':641,'Summer':812,'Rain':955,'Autumn':1560,'Winter':2310}
for name, p in SCENES.items():
    open(f'{name}.dc.html','w').write(board(name, p, METERS[name]))

# 타임라인 보드
rows = [('봄', ['#a9dc8e','#5fbf6e','#2f8f4e']), ('여름', ['#79c96f','#3aa652','#1f8341']), ('가을', ['#e0b35a','#d47f3a','#a34d2a']), ('겨울', ['#dfe9ec','#b9cdd6','#8ea9b6'])]
times = [('아침','#bfe8f5','#eaf7d6'),('낮','#8fd3f4','#d7f2e3'),('저녁','#f7a072','#ffe0b5'),('밤','#1b2a4a','#2f4a6b'),('새벽','#5d6f9e','#f7c4a0')]
cells = ''
for si,(sn, fc) in enumerate(rows):
    cells += f'<div style="display: flex; align-items: center; gap: 8px;"><div style="width: 44px; font-size: 13px; font-weight: 900; color: #1f3a2a;">{sn}</div>'
    for ti,(tn, a, b) in enumerate(times):
        m = (si*5+ti)*150
        cells += f'''<div style="display: flex; flex-direction: column; gap: 4px; width: 84px;">
      <div style="height: 64px; border-radius: 12px; border: 2px solid #1f3a2a; overflow: hidden; display: flex; flex-direction: column;">
        <div style="flex: 1; background: linear-gradient({a}, {b});"></div>
        <div style="display: flex; height: 18px;"><div style="flex: 1; background: {fc[0]};"></div><div style="flex: 1; background: {fc[1]};"></div><div style="flex: 1; background: {fc[2]};"></div></div>
      </div>
      <div style="font-size: 11px; color: #4f7f62; text-align: center;">{tn} · {m}m</div>
    </div>'''
    cells += '</div>'
timeline = f'''{HEAD}
<div style="width: 560px; height: 749px; box-sizing: border-box; overflow: hidden; padding: 28px; background: #f4f9ea; color: #1f3a2a; display: flex; flex-direction: column; gap: 18px;">
  <div style="display: flex; flex-direction: column; gap: 4px;">
    <div style="font-size: 12px; letter-spacing: 0.12em; color: #4f7f62;">정글훅 · 하루와 계절</div>
    <div style="font-size: 22px; font-weight: 900;">150m마다 하루가 한 칸, 750m마다 계절이 한 칸</div>
    <div style="font-size: 13px; color: #4f7f62; line-height: 1.5;">시작은 늘 봄 아침. 단계 경계에서 100m에 걸쳐 색을 보간(oklch)한다. 외곽선·플레이어·타깃 링은 고정, 하늘·광원·구름·숲만 바뀐다. 밤·새벽엔 덩굴·앵커에 연한 테두리(halo)를 더해 읽기를 지킨다.</div>
  </div>
  <div style="display: flex; flex-direction: column; gap: 12px;">{cells}</div>
  <div style="font-size: 12px; color: #4f7f62; line-height: 1.6; background: #ffffff; border: 2px solid #1f3a2a; border-radius: 14px; padding: 12px 14px; box-shadow: 4px 4px 0 #1f3a2a;">
    왜 150m인가 — 사람 기록이 200~400m대라 500m면 대부분 한 번도 못 본다. 150m이면 한 판에 2~3장면, 450m의 밤이 첫 목표가 되고 750m 여름은 고수의 자랑거리. 결과 카드는 죽은 지점의 장면을 그대로 배경으로 쓴다.<br>날씨 — 판 시드로 랜덤(연출이라 등급과 무관). 150m 단계마다 약 1/4 확률로 비, 첫 단계는 항상 맑음. 겨울은 항상 눈, 거리가 갈수록 거세진다.
  </div>
</div>
{TAIL}'''
open('Timeline.dc.html','w').write(timeline)
# Main = 밤 (가장 극적인 장면을 대표로)
import shutil; shutil.copy('Night.dc.html','Main.dc.html')
order = ['Morning','Noon','Evening','Main','Dawn']
arts = []
x = 0
arts.append({'file':'Timeline.dc.html','x':0,'y':0,'w':560,'h':749,'title':'타임라인'})
x = 660
for n in order:
    arts.append({'file':f'{n}.dc.html','x':x,'y':0,'w':393,'h':749,'title': '밤 (450m~)' if n=='Main' else SCENES[n]['title']})
    x += 483
x = 660
for n in ['Summer','Rain','Autumn','Winter']:
    arts.append({'file':f'{n}.dc.html','x':x,'y':900,'w':393,'h':749,'title':SCENES[n]['title']})
    x += 483
json.dump({'artboards':arts,'annotations':[{'id':'row-day','x':660,'y':-90,'w':520,'text':'윗줄: 봄의 하루 — 150m마다 아침→낮→저녁→밤→새벽'},{'id':'row-season','x':660,'y':830,'w':520,'text':'아랫줄: 계절 — 750m마다 여름→가을→겨울 (낮 장면으로 비교).\n날씨는 판 시드로 랜덤(연출이라 GRAC 확률형 아이템과 무관): 150m 단계마다 약 1/4 확률로 흐림→비, 첫 단계(0~150m)는 항상 맑음. 겨울은 항상 눈이고 거리가 갈수록 눈이 거세진다. 비·눈이면 먹구름이 하늘을 덮고 광원이 사라진다'}],'launch':{'view':'canvas'}}, open('canvas.json','w'), ensure_ascii=False, indent=2)
print('ok', len(arts))
