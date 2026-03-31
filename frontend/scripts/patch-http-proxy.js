const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'node_modules', 'http-proxy', 'lib', 'http-proxy', 'common.js'),
  path.join(__dirname, '..', 'node_modules', 'http-proxy', 'lib', 'http-proxy', 'index.js')
];

const pattern = /require\(['"]util['"]\)\._extend/g;
let changed = false;

for (const file of files) {
  if (!fs.existsSync(file)) {
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  const next = src.replace(pattern, 'Object.assign');
  if (next !== src) {
    fs.writeFileSync(file, next, 'utf8');
    changed = true;
  }
}

if (changed) {
  console.log('Patched http-proxy to avoid util._extend deprecation warning.');
}
