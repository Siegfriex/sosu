raw = """color/gray/950|var(--prim-gray-950)|#172228|
color/gray/900|var(--prim-gray-900)|#22282c|
color/gray/700|var(--prim-gray-700)|#5e6163|
color/gray/650|var(--prim-gray-650)|#6c6f71|
color/gray/600|var(--prim-gray-600)|#64625a|
color/gray/500|var(--prim-gray-500)|#999999|
color/gray/300|var(--prim-gray-300)|#d9d9d9|
color/gray/200|var(--prim-gray-200)|#dedede|
color/gray/50|var(--prim-gray-50)|#fafbfc|
color/white|var(--prim-white)|#ffffff|
color/black|var(--prim-black)|#000000|
color/gold/500|var(--prim-gold-500)|#c5be98|
color/gold/550|var(--prim-gold-550)|#b8b18b|
color/gold/600|var(--prim-gold-600)|#aaa37e|
color/gold/400|var(--prim-gold-400)|#c2bda9|
color/gold/450|var(--prim-gold-450)|#c9bf97|
color/gold/100|var(--prim-gold-100)|#e6e3d6|
color/gold/900|var(--prim-gold-900)|#545246|
color/red/500|var(--prim-red-500)|#e06c65|
color/green/500|var(--prim-green-500)|#8fbf8a|
color/bg/app-light|var(--color-bg-app-light)|#fafbfc|color/gray/50
color/bg/app-dark|var(--color-bg-app-dark)|#172228|color/gray/950
color/bg/header-light|var(--color-bg-header-light)|#fafbfc|color/gray/50
color/bg/header-dark|var(--color-bg-header-dark)|#172228|color/gray/950
color/surface/dark|var(--color-surface-dark)|#172228|color/gray/950
color/surface/control|var(--color-surface-control)|#5e6163|color/gray/700
color/surface/control-hover|var(--color-surface-control-hover)|#6c6f71|color/gray/650
color/surface/result|var(--color-surface-result)|#fafbfc|color/gray/50
color/surface/thumbnail|var(--color-surface-thumbnail)|#d9d9d9|color/gray/300
color/text/on-dark|var(--color-text-on-dark)|#fafbfc|color/gray/50
color/text/on-light|var(--color-text-on-light)|#172228|color/gray/950
color/text/muted|var(--color-text-muted)|#999999|color/gray/500
color/text/accent|var(--color-text-accent)|#c2bda9|color/gold/400
color/text/accent-on-light|var(--color-text-accent-on-light)|#545246|color/gold/900
color/text/on-accent|var(--color-text-on-accent)|#172228|color/gray/950
color/text/error|var(--color-text-error)|#e06c65|color/red/500
color/text/success|var(--color-text-success)|#8fbf8a|color/green/500
color/action/primary|var(--color-action-primary)|#c5be98|color/gold/500
color/action/primary-hover|var(--color-action-primary-hover)|#b8b18b|color/gold/550
color/action/primary-pressed|var(--color-action-primary-pressed)|#aaa37e|color/gold/600
color/action/selected|var(--color-action-selected)|#c5be98|color/gold/500
color/action/disabled|var(--color-action-disabled)|#64625a|color/gray/600
color/action/secondary|var(--color-action-secondary)|#5e6163|color/gray/700
color/border/subtle|var(--color-border-subtle)|#64625a|color/gray/600
color/border/subtle-light|var(--color-border-subtle-light)|#dedede|color/gray/200
color/border/accent|var(--color-border-accent)|#c5be98|color/gold/500
color/border/focus|var(--color-border-focus)|#fafbfc|color/gray/50
color/border/focus-on-light|var(--color-border-focus-on-light)|#22282c|color/gray/900
color/border/error|var(--color-border-error)|#e06c65|color/red/500
color/logo/on-light|var(--color-logo-on-light)|#22282c|color/gray/900
color/logo/on-dark|var(--color-logo-on-dark)|#fafbfc|color/gray/50
color/illustration/accent|var(--color-illustration-accent)|#c9bf97|color/gold/450
color/overlay/backdrop|var(--color-overlay-backdrop)|#000000|color/black
space/2|var(--space-2)|2|
space/4|var(--space-4)|4|
space/8|var(--space-8)|8|
space/12|var(--space-12)|12|
space/16|var(--space-16)|16|
space/20|var(--space-20)|20|
space/24|var(--space-24)|24|
space/32|var(--space-32)|32|
space/40|var(--space-40)|40|
layout/gutter|var(--layout-gutter)|16|
layout/content-max|var(--layout-content-max)|430|
layout/header-row|var(--layout-header-row)|48|
size/control|var(--size-control)|44|
size/chip|var(--size-chip)|40|
size/button-lg|var(--size-button-lg)|56|
size/button-md|var(--size-button-md)|44|
size/indicator-dot|var(--size-indicator-dot)|6|
size/indicator-active|var(--size-indicator-active)|18|
size/thumbnail|var(--size-thumbnail)|75|
radius/control|var(--radius-control)|10|
radius/chip|var(--radius-chip)|9999|
radius/card|var(--radius-card)|15|
radius/container|var(--radius-container)|24|
radius/button|var(--radius-button)|9999|
radius/uploader|var(--radius-uploader)|24|
z/base|var(--z-base)|0|
z/header|var(--z-header)|100|
z/backdrop|var(--z-backdrop)|1000|
z/lightbox|var(--z-lightbox)|1100|
z/toast|var(--z-toast)|1200|
opacity/disabled|var(--opacity-disabled)|0.5|
opacity/backdrop|var(--opacity-backdrop)|0.6|
stroke/card|var(--stroke-card)|3|
stroke/focus|var(--stroke-focus)|2|
stroke/divider|var(--stroke-divider)|1|"""
import re, sys, pathlib
# Source of truth for tokens.css: the `raw` table above (Figma Variables export, file ejRfXQERdNsBWbKYEdemRB).
#   python3 scripts/gen_tokens.py          → regenerate src/styles/tokens.css
#   python3 scripts/gen_tokens.py --check  → exit 1 if tokens.css differs from the generator output
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'styles' / 'tokens.css'
out=[':root {','  /* Generated from Figma Variables (file ejRfXQERdNsBWbKYEdemRB) — Primitive / Semantic / Layout collections. Do not edit by hand: npm run tokens */']
def cssname(v): return re.match(r'var\((--[^)]+)\)',v).group(1)
rows=[l.split('|') for l in raw.strip().split('\n')]
css_by_name={name:css for name,css,_,_ in rows}
prims=[];sems=[];lays=[]
for name,css,val,alias in rows:
    n=cssname(css)
    if name.startswith('color/') and not alias: prims.append((n,val))
    elif name.startswith('color/'): sems.append((n,f'var({cssname(css_by_name[alias])})'))
    else:
        unit='' if name.startswith(('z/','opacity/')) else 'px'
        lays.append((n,val+unit))
out.append('  /* primitives (measured from legacy) */'); out+= [f'  {n}: {v};' for n,v in prims]
out.append('  /* semantic roles */'); out+= [f'  {n}: {v};' for n,v in sems]
out.append('  /* layout · size · radius · z · opacity · stroke */'); out+= [f'  {n}: {v};' for n,v in lays]
out.append('  /* typography families */')
out.append("  --font-family-brand: 'SUITE', 'Noto Sans KR', system-ui, sans-serif;")
out.append("  --font-family-fallback: 'Noto Sans KR', system-ui, sans-serif;")
out.append('}')
text='\n'.join(out)+'\n'
if '--check' in sys.argv:
    current = OUT.read_text() if OUT.exists() else ''
    if current != text:
        print(f'{OUT} is out of date — run: npm run tokens'); sys.exit(1)
    print(f'tokens.css up to date ({len(prims)} primitive / {len(sems)} semantic / {len(lays)} layout)')
else:
    OUT.write_text(text)
    print(f'wrote {OUT} ({len(prims)} primitive / {len(sems)} semantic / {len(lays)} layout)')
