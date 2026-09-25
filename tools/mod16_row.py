import re
from pathlib import Path

path = next(Path('tracking').glob('MODULE_DEMO_SIGNOFF.md'))
text = path.read_text(encoding='utf-8')
pattern = re.compile(r'(\[MOD-16 — [^\]]+\]\([^)]+\)) \| NOT_RUN \| — \| Repository-verified module; no dedicated Report Centre journey executed in this rehearsal \| — \|')
text, n = pattern.subn(r'\1 | DEMONSTRATED | 2e466d2 / full-practice / manager, as-of 2026-09-23 | Practice Reporting Centre renders scoped WIP/billing reports (3 permitted mandates); missing WIP values shown as Unknown rather than invented; Print and Export Active Report (CSV) controls present | Live-browser rehearsal 2026-09-25 (screenshot in session artifacts) |', text)
assert n == 1, n
path.write_text(text, encoding='utf-8')
print('MOD-16: DEMONSTRATED via live rehearsal; 39/39 modules now have outcomes')
