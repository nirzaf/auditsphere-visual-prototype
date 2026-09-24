#!/usr/bin/env python3
"""Track this Markdown execution pack only. Does not run the app or contact GitHub."""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
STATES = {'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED', 'REOPENED'}
TRANSITIONS = {
    'NOT_STARTED': {'IN_PROGRESS', 'BLOCKED'},
    'IN_PROGRESS': {'IN_REVIEW', 'BLOCKED'},
    'IN_REVIEW': {'COMPLETED', 'IN_PROGRESS', 'BLOCKED'},
    'COMPLETED': {'REOPENED'},
    'REOPENED': {'IN_PROGRESS', 'BLOCKED'},
    'BLOCKED': {'IN_PROGRESS', 'NOT_STARTED', 'REOPENED'},
}

def manifest():
    return json.loads((ROOT / 'tracking/manifest.json').read_text(encoding='utf-8'))

def read_card(path):
    text = path.read_text(encoding='utf-8')
    match = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.S)
    if not match:
        raise ValueError(f'{path.name}: missing front matter')
    meta = {}
    for line in match[1].splitlines():
        key, sep, value = line.partition(':')
        if not sep or key in meta:
            raise ValueError(f'{path.name}: malformed/duplicate metadata key')
        meta[key] = json.loads(value.strip())
    return meta, match[2]

def write_card(path, meta, body):
    head = '\n'.join(f'{k}: {json.dumps(v, ensure_ascii=False)}' for k, v in meta.items())
    path.write_text('---\n' + head + '\n---\n' + body, encoding='utf-8')

def cards(m=None):
    m = m or manifest()
    result = {}
    for row in m['tasks']:
        if row['id'] in result:
            raise ValueError(f'Duplicate task ID {row["id"]}')
        meta, body = read_card(ROOT / row['file'])
        result[row['id']] = (row, meta, body)
    return result

def ready(task_id, current):
    deps = current[task_id][1]['depends_on']
    missing = [d for d in deps if d not in current or current[d][1]['status'] != 'COMPLETED']
    return 'WAITING: ' + ', '.join(missing) if missing else 'READY'

def safe(value):
    return str(value).replace('|', '/').replace('\n', ' ')

def table_rows(items, current, prefix=''):
    lines = ['| Task | Kind / priority | Status | Coordination readiness | Owner |', '|---|---|---|---|---|']
    for row in items:
        meta = current[row['id']][1]
        lines.append(f'| [{row["id"]} — {safe(row["title"])}]({prefix}{row["file"]}) | {row["kind"]} / {row["priority"]} | {meta["status"]} | {ready(row["id"], current)} | {safe(meta["owner"] or "Unassigned")} |')
    return '\n'.join(lines)

def generated_documents(m=None, current=None):
    m = m or manifest()
    current = current or cards(m)
    totals = Counter(meta['status'] for _, meta, _ in current.values())
    lines = [
        '# AuditSphere prototype — master implementation progress', '',
        '[Start here](PACK_README.md) · [39 module guides](01_MODULE_INDEX.md) · [Client playbook](02_CLIENT_DEMO_PLAYBOOK.md) · [Execution rules](03_EXECUTION_RULES.md)', '',
        f'**Snapshot:** `{m["repository"]}` / `main@{m["baseline_commit"]}`  ',
        '**Scope:** 48 Partial-story closure cards + 4 proposed presentation cards. No production implementation or live providers.', '',
        '## Progress', '', '| Execution status | Tasks |', '|---|---:|',
    ]
    for status in ['NOT_STARTED','IN_PROGRESS','IN_REVIEW','BLOCKED','REOPENED','COMPLETED']:
        lines.append(f'| {status} | {totals[status]} |')
    lines += [f'| **Total** | **{len(current)}** |', '',
        '**These are closure-task counts, not a feature-completion percentage.** Card front matter is authoritative; this index is generated. Original VP acceptance stays in the repository tracker. A demo can use working bounded paths while full story acceptance is still Partial.', '',
        '## Recommended first actions', '',
        'Confirm scope/runtime (VP-001/002); complete shared form safety (VP-003/004); repair the planning assumptions/feedback (VP-048); then prepare the proposed guide/tour/rehearsal work (DEMO-001–004). Feature cards marked VERIFY_FIRST must not rebuild existing functionality.', '',
        'The source reports 16 stories and 10 modules Verified. See [the preserve-baseline register](reference/VERIFIED_BASELINE_DO_NOT_REBUILD.md).', '',
        '## Chunk navigation', '', '| Chunk | Focus | Task count |', '|---|---|---:|']
    for chunk, title in m['chunks'].items():
        rows = [t for t in m['tasks'] if t['chunk'] == chunk]
        lines.append(f'| [{chunk}](chunks/{chunk}/00_INDEX.md) | {title} | {len(rows)} |')
    for chunk, title in m['chunks'].items():
        lines += ['', f'## {chunk} — {title}', '', table_rows([t for t in m['tasks'] if t['chunk'] == chunk], current)]
    lines += ['', '## Supporting records', '',
        '[Source traceability](tracking/SOURCE_TRACEABILITY.md) · [Module-demo signoff](tracking/MODULE_DEMO_SIGNOFF.md) · [Evidence log](tracking/ACCEPTANCE_EVIDENCE.md) · [Review findings](reference/REVIEW_FINDINGS.md) · [Package checks](tracking/PACK_VALIDATION.md)', '',
        'Run `python3 tools/progress.py refresh` after editing task metadata, then `python3 tools/progress.py validate`. Do not edit generated status tables independently.']
    documents = {'00_MASTER_INDEX.md': '\n'.join(lines)+'\n'}
    for chunk, title in m['chunks'].items():
        rows = [t for t in m['tasks'] if t['chunk'] == chunk]
        counts = Counter(current[t['id']][1]['status'] for t in rows)
        text = f'# {chunk} — {title}\n\n[Master index](../../00_MASTER_INDEX.md) · [Module guide index](../../01_MODULE_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)\n\n'
        text += f'**Cards:** {len(rows)} · **Completed:** {counts["COMPLETED"]} · **Blocked:** {counts["BLOCKED"]}\n\n'
        text += 'These are small remaining-work slices, not permission to rebuild this entire domain. Preserve the baseline and verify the exact residual before coding.\n\n'
        text += table_rows(rows, current, '../../')+'\n\n'
        text += 'Update card front matter, refresh the master/chunk indexes, and record actual evidence. Product acceptance and client-demo rehearsal remain separate.\n'
        documents[f'chunks/{chunk}/00_INDEX.md'] = text
    lines = ['# All 39 modules — usage and pending-work index', '',
        '[Master implementation progress](00_MASTER_INDEX.md) · [Client playbook](02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](reference/ROLE_HANDOFF_GUIDE.md)', '',
        '**Every module has a walkthrough**, including the 10 modules reported Verified. Verified modules have preservation/rehearsal entries rather than duplicate implementation tasks. All module-demo outcomes start NOT_RUN by this review; record actual results in [the signoff sheet](tracking/MODULE_DEMO_SIGNOFF.md).', '',
        '| Module and guide | Repository-reported baseline | Route / workspace | Specific closure cards |', '|---|---|---|---|']
    by_id = {t['id']:t for t in m['tasks']}
    for module in m['modules']:
        links = ', '.join(f'[{t}]({by_id[t]["file"]})' for t in module['tasks']) or 'Preserve; rehearse via DEMO-004'
        label = 'Verified' if module['baseline'].endswith('_VERIFIED') else 'Partial'
        lines.append(f'| [{module["id"]} — {module["name"]}]({module["file"]}) | {label} | `{module["route"]}` | {links} |')
    lines += ['', 'Cross-cutting scope/runtime/form/recovery and final evidence cards apply to every module. The four DEMO tasks add catalogue help, manual tour guidance, measured usability checks and final client rehearsal.']
    documents['01_MODULE_INDEX.md'] = '\n'.join(lines)+'\n'
    return documents

def refresh():
    for path, text in generated_documents().items():
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')

def validate():
    errors = []
    m = manifest()
    current = cards(m)
    expected = {t['file'] for t in m['tasks']}
    actual = {p.relative_to(ROOT).as_posix() for p in (ROOT/'chunks').rglob('*.md') if p.name != '00_INDEX.md'}
    if expected != actual:
        errors.append(f'Task file inventory differs: missing {sorted(expected-actual)}, extra {sorted(actual-expected)}')
    for task_id, (row, meta, body) in current.items():
        for field in ['id','title','source_stories','modules','depends_on','status','owner','reviewer','evidence']:
            if field not in meta:
                errors.append(f'{task_id}: missing {field}')
        if meta['id'] != task_id or meta['source_stories'] != row['stories'] or meta['modules'] != row['modules'] or meta['depends_on'] != row['dependencies']:
            errors.append(f'{task_id}: metadata/manifest mismatch')
        if not Path(row['file']).name.startswith(task_id+'_'):
            errors.append(f'{task_id}: filename mismatch')
        if meta['status'] not in STATES:
            errors.append(f'{task_id}: unknown status')
        for dep in meta['depends_on']:
            if dep not in current:
                errors.append(f'{task_id}: missing dependency {dep}')
        section = re.search(r'<!-- TASK_ACCEPTANCE -->(.*?)<!-- END_TASK_ACCEPTANCE -->', body, re.S)
        if not section or len(re.findall(r'^- \[[ xX]\]', section[1], re.M)) != 4:
            errors.append(f'{task_id}: expected four task acceptance items')
        if meta['status'] in {'BLOCKED','REOPENED'} and not meta.get('blocked_reason','').strip():
            errors.append(f'{task_id}: reason required')
        if meta['status'] in {'IN_PROGRESS','IN_REVIEW','COMPLETED'} and ready(task_id,current) != 'READY':
            errors.append(f'{task_id}: coordination prerequisite incomplete')
        if meta['status'] == 'COMPLETED':
            for field in ['owner','reviewer','evidence']:
                if not meta.get(field,'').strip(): errors.append(f'{task_id}: completion requires {field}')
            if meta.get('owner','').casefold() == meta.get('reviewer','').casefold():
                errors.append(f'{task_id}: reviewer must differ from owner')
            if section and '- [ ]' in section[1]:
                errors.append(f'{task_id}: unchecked acceptance items')
    temporary, permanent = set(), set()
    def visit(node):
        if node in temporary: raise ValueError(f'Dependency cycle at {node}')
        if node in permanent: return
        temporary.add(node)
        for dep in current[node][1]['depends_on']:
            if dep in current: visit(dep)
        temporary.remove(node); permanent.add(node)
    try:
        for node in current: visit(node)
    except ValueError as exc:
        errors.append(str(exc))
    original = {f'VP-{n:03}' for n in range(1,65)}
    verified = set(m['reported_verified_story_ids'])
    partial = {tid for tid in current if tid.startswith('VP-')}
    if partial & verified or partial | verified != original or len(partial)!=48 or len(verified)!=16:
        errors.append('Original-story partition must be 48 closure cards plus 16 preserved verified stories')
    module_ids = [x['id'] for x in m['modules']]
    if len(module_ids)!=39 or set(module_ids)!={f'MOD-{n:02}' for n in range(1,40)}:
        errors.append('Module inventory must contain 39 distinct original IDs')
    for module in m['modules']:
        if not (ROOT/module['file']).is_file(): errors.append(f'{module["id"]}: missing module guide')
        for tid in module['tasks']:
            if tid not in current: errors.append(f'{module["id"]}: unknown task link {tid}')
    trace = (ROOT/'tracking/SOURCE_TRACEABILITY.md').read_text(encoding='utf-8')
    criterion_ids = re.findall(r'`(VP-\d{3}-AC\d{2})`',trace)
    expected_criteria={f'VP-{n:03}-AC{a:02}' for n in range(1,65) for a in range(1,5)}
    if len(criterion_ids)!=256 or set(criterion_ids)!=expected_criteria:
        errors.append('Source traceability must have 256 unique original criterion locators')
    # Internal file targets only. External GitHub links remain pinned source references.
    # Scan pack-owned paths plus the pack README files; vendored trees (node_modules,
    # dist, docs, previews) belong to the application, not this execution pack.
    checked = 0
    scanned = 0
    scan_roots = [p for p in [ROOT/'chunks', ROOT/'modules', ROOT/'reference', ROOT/'tracking',
        ROOT/'README.md', ROOT/'PACK_README.md', ROOT/'00_MASTER_INDEX.md', ROOT/'01_MODULE_INDEX.md',
        ROOT/'02_CLIENT_DEMO_PLAYBOOK.md', ROOT/'03_EXECUTION_RULES.md'] if p.exists()]
    scan_files = []
    for root_path in scan_roots:
        scan_files.extend(sorted(root_path.rglob('*.md')) if root_path.is_dir() else [root_path])
    for path in scan_files:
        scanned += 1
        text = path.read_text(encoding='utf-8')
        text = re.sub(r'```.*?```','',text,flags=re.S)
        for match in re.finditer(r'\]\(([^)]+)\)',text):
            raw=match[1].strip().split(' "',1)[0]
            split=urlsplit(raw)
            if split.scheme or raw.startswith('//'): continue
            if not split.path: continue
            target=(path.parent/unquote(split.path)).resolve()
            checked+=1
            try: target.relative_to(ROOT.resolve())
            except ValueError:
                errors.append(f'{path.name}: link escapes pack: {raw}'); continue
            if not target.exists(): errors.append(f'{path.name}: missing link target {raw}')
    for path,text in generated_documents(m,current).items():
        if not (ROOT/path).is_file() or (ROOT/path).read_text(encoding='utf-8')!=text:
            errors.append(f'{path}: generated index stale; run refresh')
    stats={'tasks':len(current),'original_partial_story_cards':len(partial),'presentation_cards':len(current)-len(partial),'module_guides':len(module_ids),'original_story_rows':64,'criterion_locators':len(criterion_ids),'chunks':len(m['chunks']),'internal_file_links_checked':checked,'markdown_files':scanned}
    return errors,stats

def change_status(task_id, status, owner=None, reviewer=None, evidence=None, reason=None):
    current=cards()
    if task_id not in current: raise ValueError(f'Unknown task {task_id}')
    row,meta,body=current[task_id]
    old=meta['status']
    if status not in TRANSITIONS.get(old,set()): raise ValueError(f'Invalid transition {old} -> {status}')
    for key,value in [('owner',owner),('reviewer',reviewer),('evidence',evidence)]:
        if value is not None: meta[key]=value.strip()
    if not meta['owner']: raise ValueError('Record --owner before changing status')
    if status in {'BLOCKED','REOPENED'} and not (reason or '').strip(): raise ValueError('A reason is required')
    if status in {'IN_PROGRESS','IN_REVIEW','COMPLETED'} and ready(task_id,current)!='READY': raise ValueError(ready(task_id,current))
    if status=='COMPLETED':
        section=re.search(r'<!-- TASK_ACCEPTANCE -->(.*?)<!-- END_TASK_ACCEPTANCE -->',body,re.S)
        if not meta['reviewer'] or not meta['evidence']: raise ValueError('Completion needs reviewer and evidence')
        if meta['owner'].casefold()==meta['reviewer'].casefold(): raise ValueError('Reviewer must differ from owner')
        if not section or len(re.findall(r'^- \[[xX]\]',section[1],re.M))!=4: raise ValueError('Check the four acceptance items after real verification')
    meta['status']=status
    meta['blocked_reason']=(reason or '').strip() if status in {'BLOCKED','REOPENED'} else ''
    meta['updated_at']=datetime.now(timezone.utc).isoformat(timespec='seconds')
    write_card(ROOT/row['file'],meta,body)
    with (ROOT/'tracking/CHANGELOG.md').open('a',encoding='utf-8') as out:
        out.write(f'| {meta["updated_at"]} | {task_id}: {old} → {status} | {safe(meta["owner"])} | {safe(reason or evidence or "See card evidence")} |\n')
    if old=='COMPLETED':
        affected={task_id}
        changed=True
        while changed:
            changed=False
            for tid,(_,other,_) in current.items():
                if tid not in affected and any(d in affected for d in other['depends_on']):
                    affected.add(tid);changed=True
        for tid in affected-{task_id}:
            r,m,b=current[tid]
            if m['status'] in {'IN_PROGRESS','IN_REVIEW','COMPLETED'}:
                m['status']='BLOCKED';m['blocked_reason']=f'Upstream {task_id} reopened: {reason}'
                m['updated_at']=meta['updated_at'];write_card(ROOT/r['file'],m,b)
    refresh()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('validate');sub.add_parser('refresh');sub.add_parser('next')
    p=sub.add_parser('set');p.add_argument('task');p.add_argument('status',choices=sorted(STATES))
    for option in ['owner','reviewer','evidence','reason']:p.add_argument('--'+option)
    args=parser.parse_args()
    try:
        if args.command=='validate':
            errors,stats=validate();print(json.dumps({'valid':not errors,'checks':stats,'errors':errors},indent=2));return int(bool(errors))
        if args.command=='refresh':refresh();print('Master, chunk and module indexes refreshed.');return 0
        if args.command=='next':
            current=cards()
            for tid,(row,meta,_) in current.items():
                if meta['status'] in {'NOT_STARTED','REOPENED'} and ready(tid,current)=='READY':print(f'{tid}: {row["title"]}')
            return 0
        change_status(args.task,args.status,args.owner,args.reviewer,args.evidence,args.reason)
        print(f'{args.task}: {args.status}; indexes refreshed.');return 0
    except (ValueError,KeyError,OSError,json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}',file=sys.stderr);return 1

if __name__=='__main__':raise SystemExit(main())
