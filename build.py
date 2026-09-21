"""Build a dependency-free, offline HTML role-portal visualization."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def safe_json(text):
    return text.replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')

def build():
    css=(ROOT/'styles.css').read_text()+'\n'+(ROOT/'roles.css').read_text()
    app=(ROOT/'base-app.js').read_text()+'\n'+(ROOT/'role-views.js').read_text()
    for content in [(ROOT/'roles.json').read_text(),(ROOT/'permissions.json').read_text(),(ROOT/'source.json').read_text()]:json.loads(content)
    html='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="AuditSphere 14-role interactive prototype. Synthetic data only. No backend or real authorization."><title>AuditSphere · Role Portals v2</title><style>'''+css+'''</style></head><body><div id="app"></div><div id="modal-root"></div><div class="toast-stack" id="toasts" aria-live="polite"></div><input type="file" id="document-picker" class="hidden" accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg"><input type="file" id="tb-picker" class="hidden" accept=".csv,text/csv"><noscript>JavaScript is needed for this local demonstration. No actual authentication or provider operations are implemented.</noscript>'''
    for id,f in [('prd-data','source.json'),('role-data','roles.json'),('permission-data','permissions.json')]:
        html+=f'<script type="application/json" id="{id}">'+safe_json((ROOT/f).read_text())+'</script>'
    html+='<script>\n'+app.replace('</script','<\\/script')+'\n</script></body></html>'
    (ROOT/'index.html').write_text(html)
    (ROOT/'app.bundle.js').write_text(app)
    print(f'Built index.html ({len(html.encode()):,} bytes).')
if __name__=='__main__':build()
