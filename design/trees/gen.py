"""
계절별 나무 설계도 생성기 (BUILD 24 준비). `python3 gen.py` → Spring/Main(여름)/Autumn/Winter/Anatomy .dc.html + canvas.json

규칙 하나로 사계절을 만든다:
  나무 = 가지 뼈대(항상 그린다, 시드 결정론) + 잎덩어리(가지 끝·마디에 원, 반지름·개수는 leafiness 0~1)
  겨울 0.0 앙상한 가지만 · 봄 0.45 연둣빛 작은 덩어리(가지 보임) · 가을 0.75 주황 · 여름 1.0 덩어리가 겹쳐 가지가 안 보임
색은 renderer.ts SEASON_PALETTE 그대로. 외곽선 #1f3a2a, 잉크 패스 먼저 → 채움 패스 (게임과 같은 문법).
"""
import json, math, random

INK = '#1f3a2a'
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

# renderer.ts SEASON_PALETTE + 잎덩어리 3톤(base·hi·dark)
SEASONS = {
  'Spring': dict(title='봄 · 연둣빛, 가지가 비친다', leaf=0.45, skyTop='#cfe9f6', skyBottom='#fbeef0', sun='#ffe9a0', glow='#fff6c8', cloud='#ffffff',
                 far='#d6ecb0', base='#a5d98a', hi='#d6ecb0', dark='#6cbf6f', near='#6cbf6f', trunk='#b98a5a', ground='#a5d98a', fern='#3f9a58'),
  'Main':   dict(title='여름 · 아주 초록, 풍성', leaf=1.0, skyTop='#3fb0ea', skyBottom='#a9e2ff', sun='#ffcc1f', glow='#fff0a0', cloud='#ffffff',
                 far='#5cc06a', base='#2c9c4b', hi='#5cc06a', dark='#177a3a', near='#177a3a', trunk='#8a5a34', ground='#2c9c4b', fern='#0d5a2a'),
  'Autumn': dict(title='가을 · 주황, 끝가지가 드러난다', leaf=0.75, skyTop='#b8dff0', skyBottom='#f7e6c8', sun='#ffd94d', glow='#fff0a0', cloud='#fff8ee',
                 far='#e0b35a', base='#d47f3a', hi='#e0b35a', dark='#a34d2a', near='#a34d2a', trunk='#6e4426', ground='#c9a05a', fern='#6b3520'),
  'Winter': dict(title='겨울 · 앙상한 가지만', leaf=0.0, skyTop='#aebfcb', skyBottom='#e6edf1', sun='#fff4c2', glow='#ffffff', cloud='#c9d5dc',
                 far='#b9cdd6', base='#8ea9b6', hi='#dfe9ec', dark='#5e7a88', near='#8ea9b6', trunk='#6f7f88', ground='#eef3f6', fern='#7f95a3'),
}


def skeleton(x, y, height, seed, depth=4):
    """가지 뼈대 — (x1,y1,x2,y2,width,depth) 선분 목록과 마디(잎덩어리 후보) 목록. 시드 결정론"""
    rng = random.Random(seed)
    segs, nodes = [], []

    def grow(px, py, ang, length, width, d):
        ex = px + math.cos(ang) * length
        ey = py - math.sin(ang) * length
        segs.append((px, py, ex, ey, width, d))
        nodes.append((ex, ey, d))
        if d == 0:
            return
        spread = rng.uniform(0.45, 0.8)
        for side in (1, -1):
            a = ang + side * spread * rng.uniform(0.7, 1.15) + rng.uniform(-0.08, 0.08)
            grow(ex, ey, a, length * rng.uniform(0.6, 0.74), width * 0.6, d - 1)
        if rng.random() < 0.55:
            grow(ex, ey, ang + rng.uniform(-0.2, 0.2), length * rng.uniform(0.55, 0.7), width * 0.5, d - 1)

    grow(x, y, math.pi / 2 + rng.uniform(-0.08, 0.08), height * 0.42, height * 0.085, depth)
    return segs, nodes


def tree_svg(x, y, height, seed, leaf, p, outline=3, far=False):
    """한 그루 — 잉크 패스(가지·덩어리 외곽) → 가지 채움 → 덩어리 채움(dark·base·hi)"""
    segs, nodes = skeleton(x, y, height, seed)
    s = []
    fmt = lambda v: f'{v:.1f}'
    # 잎덩어리: 마디 깊이별 반지름 (깊을수록=줄기 가까울수록 큼). leaf가 0.2 아래면 덩어리 없음
    lobes = []
    if leaf > 0.2:
        for (nx, ny, d) in nodes:
            if d == 4:
                continue  # 줄기 꼭대기 마디는 제외 — 위 마디들이 덮는다
            base_r = {3: 0.30, 2: 0.24, 1: 0.17, 0: 0.12}[d] * height
            r = base_r * (0.35 + 0.65 * leaf)
            if leaf < 0.6 and d == 0 and (hash((seed, int(nx))) % 3 == 0):
                continue  # 봄: 끝가지 일부는 잎 없이 드러난다
            lobes.append((nx, ny, r, d))
    # 잉크 패스
    s.append(f'<g stroke="{INK}" stroke-linecap="round" fill="none">')
    for (x1, y1, x2, y2, w, d) in segs:
        s.append(f'<line x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}" stroke-width="{fmt(w + outline * 2)}"/>')
    s.append('</g>')
    s.append(f'<g fill="{INK}">')
    for (lx, ly, r, d) in lobes:
        s.append(f'<circle cx="{fmt(lx)}" cy="{fmt(ly)}" r="{fmt(r + outline)}"/>')
    s.append('</g>')
    # 밑동 — 땅으로 벌어진다
    w0 = segs[0][4]
    s.append(f'<path d="M{fmt(x - w0 * 1.6)} {fmt(y + 4)} Q{fmt(x - w0 * 0.6)} {fmt(y - height * 0.05)} {fmt(x - w0 * 0.5)} {fmt(y - height * 0.12)} '
             f'L{fmt(x + w0 * 0.5)} {fmt(y - height * 0.12)} Q{fmt(x + w0 * 0.6)} {fmt(y - height * 0.05)} {fmt(x + w0 * 1.6)} {fmt(y + 4)} Z" '
             f'fill="{p["trunk"]}" stroke="{INK}" stroke-width="{outline}" stroke-linejoin="round"/>')
    # 가지 채움
    s.append(f'<g stroke="{p["trunk"]}" stroke-linecap="round" fill="none">')
    for (x1, y1, x2, y2, w, d) in segs:
        s.append(f'<line x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}" stroke-width="{fmt(w)}"/>')
    s.append('</g>')
    # 덩어리 채움 — 아래쪽 마디는 진하게, 위쪽은 밝게 (원 겹침 순서로 깊이감)
    if lobes:
        top = min(ly for (_, ly, _, _) in lobes)
        bot = max(ly for (_, ly, _, _) in lobes)
        for (lx, ly, r, d) in sorted(lobes, key=lambda t: -t[1]):
            t = (ly - top) / max(1, bot - top)
            col = p['dark'] if t > 0.66 else p['base'] if t > 0.28 else p['hi']
            if far:
                col = p['far']
            s.append(f'<circle cx="{fmt(lx)}" cy="{fmt(ly)}" r="{fmt(r)}" fill="{col}"/>')
        if not far and leaf >= 0.6:
            # 반사광 — 윗덩어리 왼쪽 위에 작은 원
            for (lx, ly, r, d) in lobes:
                if (ly - top) / max(1, bot - top) < 0.28 and r > 24:
                    s.append(f'<circle cx="{fmt(lx - r * 0.28)}" cy="{fmt(ly - r * 0.3)}" r="{fmt(r * 0.42)}" fill="#ffffff" opacity="0.2"/>')
    return '\n'.join(s)


def far_tree_svg(x, y, height, seed, leaf, p):
    """먼 나무 — 외곽선 얇게, 한 색 실루엣(far). 겨울엔 가는 뼈대만"""
    return tree_svg(x, y, height, seed, leaf, dict(p, trunk=p['far'], base=p['far'], hi=p['far'], dark=p['far']), outline=1.5, far=True)


def scene(name, p):
    leaf = p['leaf']
    s = [f'''<div style="position: relative; width: 393px; height: 749px; overflow: hidden; background: {p['skyTop']}; color: {INK};">
<svg width="393" height="749" viewBox="0 0 393 749" style="position: absolute; left: 0; top: 0;">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{p['skyTop']}"/><stop offset="1" stop-color="{p['skyBottom']}"/></linearGradient></defs>
<rect width="393" height="749" fill="url(#sky)"/>
<circle cx="318" cy="96" r="54" fill="{p['glow']}" opacity="0.9"/>
<circle cx="318" cy="96" r="40" fill="{p['sun']}" stroke="{INK}" stroke-width="3"/>
<g fill="{p['cloud']}" stroke="{INK}" stroke-width="3" stroke-linejoin="round">
  <path d="M40 160 q10 -26 36 -18 q10 -22 36 -8 q26 -6 30 20 q18 4 12 20 H36 q-14 -2 4 -14 z"/>
  <path d="M232 214 q8 -20 28 -14 q8 -16 28 -6 q20 -4 22 16 q14 2 10 14 H228 q-10 -2 4 -10 z"/>
</g>''']
    # 먼 나무들 (땅 y=560, 작게, 실루엣) — 띄엄띄엄
    for i, (fx, fh) in enumerate([(30, 150), (150, 175), (255, 140), (370, 165)]):
        s.append(far_tree_svg(fx, 562, fh, 100 + i, leaf, p))
    # 먼 숲 띠 — 먼 나무의 발치를 가린다
    s.append(f'<path d="M-10 556 Q60 536 120 552 T240 546 T400 556 V749 H-10 Z" fill="{p["far"]}" stroke="{INK}" stroke-width="2.5"/>')
    # 중간 나무 두 그루 (땅 y=700) — 주인공 크기
    s.append(tree_svg(96, 702, 250, 7, leaf, p))
    s.append(tree_svg(300, 702, 275, 11, leaf, p))
    # 안개 띠
    s.append('<rect x="0" y="560" width="393" height="80" fill="#ffffff" opacity="0.18"/>')
    # 땅
    s.append(f'<path d="M-10 700 Q80 684 160 696 T330 690 T400 698 V749 H-10 Z" fill="{p["ground"]}" stroke="{INK}" stroke-width="3"/>')
    # 앞쪽 양치식물 (겨울엔 마른 잎)
    fern = p['fern']
    def fern_svg(x, y, k, flip):
        sx = -k if flip else k
        parts = [f'<g transform="translate({x} {y}) scale({sx} {k})" stroke="{INK}" stroke-width="2" stroke-linecap="round" fill="{fern}">',
                 '<path d="M0 0 Q6 -40 24 -70" fill="none" stroke-width="3"/>']
        for i in range(6):
            t = i / 5
            px = 6 * t * t + 18 * t
            py = -70 * t
            parts.append(f'<ellipse cx="{px - 8:.1f}" cy="{py:.1f}" rx="9" ry="3.5" transform="rotate(-25 {px - 8:.1f} {py:.1f})"/>')
            parts.append(f'<ellipse cx="{px + 8:.1f}" cy="{py:.1f}" rx="9" ry="3.5" transform="rotate(25 {px + 8:.1f} {py:.1f})"/>')
        parts.append('</g>')
        return '\n'.join(parts)
    s.append(fern_svg(30, 752, 1.1, False))
    s.append(fern_svg(210, 756, 0.75, False))
    s.append(fern_svg(380, 752, 1.0, True))
    if name == 'Winter':
        # 눈송이 몇 개
        for (x, y, r) in [(60, 300, 3.5), (140, 380, 4), (220, 330, 3), (330, 420, 4.2), (90, 470, 3), (290, 250, 3.6)]:
            s.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#ffffff" opacity="0.9"/>')
    if name == 'Autumn':
        for (x, y, a) in [(150, 330, 20), (240, 400, -30), (60, 420, 45), (330, 300, -15)]:
            s.append(f'<ellipse cx="{x}" cy="{y}" rx="9" ry="4" fill="{p["base"]}" stroke="{INK}" stroke-width="1.5" transform="rotate({a} {x} {y})"/>')
    s.append('</svg>')
    s.append(f'''<div style="position: absolute; left: 14px; top: 14px; padding: 8px 14px; background: #ffffff; border: 2px solid {INK}; border-radius: 16px; box-shadow: 3px 3px 0 {INK}; font-weight: 900; font-size: 15px;">{p['title'].split(' · ')[0]} · 잎 {leaf:.2f}</div>''')
    s.append('</div>')
    return HEAD + '\n' + '\n'.join(s) + '\n' + TAIL


def anatomy():
    p = SEASONS['Main']
    cols = [(0.0, '겨울 0', SEASONS['Winter']), (0.45, '봄 0.45', SEASONS['Spring']), (0.75, '가을 0.75', SEASONS['Autumn']), (1.0, '여름 1', p)]
    s = [f'''<div style="position: relative; width: 760px; height: 749px; overflow: hidden; background: #f3efe6; color: {INK}; padding: 0;">
<div style="position: absolute; left: 28px; top: 24px; display: flex; flex-direction: column; gap: 6px;">
  <div style="font-size: 12px; letter-spacing: 0.12em; color: #4f7f62; font-weight: 800;">정글훅 · 계절 나무 해부도</div>
  <div style="font-size: 22px; font-weight: 900;">나무 하나 = 가지 뼈대 + 잎 밀도(0~1)</div>
  <div style="font-size: 13px; line-height: 1.5; color: #4f7f62; max-width: 700px;">뼈대는 시드로 결정돼 계절이 바뀌어도 같은 나무다. 잎덩어리는 가지 끝·마디에 원을 얹고, 반지름과 개수를 잎 밀도로 정한다. 겨울 0은 원이 하나도 없어 앙상한 가지만 남고, 여름 1은 원이 겹쳐 가지를 완전히 덮는다. 계절 경계(40m)에서는 밀도와 색만 보간하면 된다.</div>
</div>
<svg width="760" height="749" viewBox="0 0 760 749" style="position: absolute; left: 0; top: 0;">''']
    for i, (leaf, label, pal) in enumerate(cols):
        x = 100 + i * 185
        s.append(tree_svg(x, 560, 250, 7, leaf, pal))
        s.append(f'<text x="{x}" y="620" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="16" fill="{INK}">{label}</text>')
    s.append(f'<line x1="40" y1="562" x2="720" y2="562" stroke="{INK}" stroke-width="2" stroke-dasharray="6 6"/>')
    # 마디 반지름 표
    s.append(f'<text x="40" y="670" font-family="system-ui, sans-serif" font-weight="800" font-size="13" fill="{INK}">마디 깊이별 원 반지름 (나무 높이 대비): 줄기 가까운 마디 0.30 → 0.24 → 0.17 → 끝가지 0.12, 여기에 × (0.35 + 0.65 × 잎 밀도)</text>')
    s.append(f'<text x="40" y="694" font-family="system-ui, sans-serif" font-weight="800" font-size="13" fill="{INK}">색: 아래 덩어리 dark · 가운데 base · 위 hi (계절 팔레트 3톤). 잎 밀도 0.6 미만이면 끝가지 1/3은 잎 없이 드러난다</text>')
    s.append(f'<text x="40" y="718" font-family="system-ui, sans-serif" font-weight="800" font-size="13" fill="{INK}">그리기 순서: 잉크 패스(가지 굵기+6·원 반지름+3) → 밑동 → 가지 채움 → 원 채움(아래→위) → 반사광</text>')
    s.append('</svg></div>')
    return HEAD + '\n' + '\n'.join(s) + '\n' + TAIL


arts = []
order = ['Winter', 'Spring', 'Main', 'Autumn']
open('Anatomy.dc.html', 'w').write(anatomy())
arts.append({'file': 'Anatomy.dc.html', 'x': 0, 'y': 0, 'w': 760, 'h': 749, 'title': '해부도 — 잎 밀도 0 → 1'})
for i, name in enumerate(order):
    open(f'{name}.dc.html', 'w').write(scene(name, SEASONS[name]))
    arts.append({'file': f'{name}.dc.html', 'x': 860 + i * 483, 'y': 0, 'w': 393, 'h': 749, 'title': SEASONS[name]['title']})
json.dump({'artboards': arts, 'annotations': [
    {'id': 'brief', 'x': 860, 'y': -150, 'w': 620, 'text': '요청: 겨울엔 앙상한 나뭇가지만, 여름엔 아주 초록 풍성하게.\n먼 나무(실루엣)·중간 나무(기둥 있음) 모두 같은 규칙. 봄·가을은 중간값으로 채웠으니 밀도 숫자만 정해 주면 된다.'},
], 'launch': {'view': 'canvas'}}, open('canvas.json', 'w'), ensure_ascii=False, indent=2)
print('ok', [a['file'] for a in arts])
