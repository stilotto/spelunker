#!/bin/sh
# Stamp every module and the stylesheet with a fresh version so browsers
# fetch new files after a push instead of serving cached ones.
# Run before each commit: ./bump.sh
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M%S)
python3 - "$V" <<'PY'
import sys, re, glob, json
v = sys.argv[1]
files = sorted(f for f in glob.glob('js/*.js') if f != 'js/main.js')
imap = {'imports': {'./' + f: './' + f + '?v=' + v for f in files}}
html = open('index.html').read()
block = '<script type="importmap">' + json.dumps(imap, indent=2) + '</script>'
html = re.sub(r'<script type="importmap">.*?</script>', lambda m: block, html, flags=re.S)
html = re.sub(r'(css/style\.css|js/main\.js)(\?v=\d+)?"', lambda m: m.group(1) + '?v=' + v + '"', html)
open('index.html', 'w').write(html)
PY
echo "version $V"
