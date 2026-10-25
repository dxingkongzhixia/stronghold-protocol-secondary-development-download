#!/usr/bin/env node
// Publish active marketplace zips and cached installed-plugin zips to the asset relay.
// The relay serves /srv/sp/public at http://103.205.254.40; after this, set
// var/plugin-market/mirrors.json to ["http://103.205.254.40/plugin-market/"].
//
// Usage: node tools/push-plugin-market.mjs [--root var/plugin-market] [--host 103.205.254.40] [--port 57435]
//        [--key ~/.ssh/sp-deploy] [--remote /srv/sp/public/plugin-market] [--dry-run]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const val = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const root = path.resolve(val('--root', path.join('var', 'plugin-market')));
const host = val('--host', process.env.SP_RELAY_HOST || '103.205.254.40');
const port = val('--port', process.env.SP_RELAY_PORT || '57435');
const key = val('--key', process.env.SP_RELAY_KEY || path.join(os.homedir(), '.ssh', 'sp-deploy'));
const remote = val('--remote', '/srv/sp/public/plugin-market');
const dry = args.includes('--dry-run');
const base = path.join(root, 'index.json');
let entries = [];
try {
  const index = JSON.parse(fs.readFileSync(base, 'utf8'));
  entries = (index.entries || []).filter((e) => e.status === 'active' && e.listed !== false && e.file);
} catch {
  console.error(`cannot read ${base}`);
  process.exit(1);
}
const files = [];
for (const e of entries) {
  const file = path.resolve(root, e.file);
  if (!fs.existsSync(file)) { console.error(`missing ${file}`); process.exit(1); }
  files.push({ local: file, rel: e.file.replace(/\\/g, '/') });
}
const installed = path.join(root, 'installed');
try {
  for (const name of fs.readdirSync(installed)) {
    if (name.endsWith('.zip')) files.push({ local: path.join(installed, name), rel: `installed/${name}` });
  }
} catch { /* none cached */ }
if (!files.length) { console.log('nothing to publish'); process.exit(0); }
const SSH_PORT = String(port) === '22' ? [] : ['-p', String(port)];
const SCP_PORT = String(port) === '22' ? [] : ['-P', String(port)];
const ssh = (cmd) => {
  if (dry) { console.log(`[dry] ssh ${host} ${cmd}`); return; }
  execFileSync('ssh', ['-i', key, '-o', 'BatchMode=yes', ...SSH_PORT, `root@${host}`, cmd], { stdio: 'inherit' });
};
const scp = (local, rel) => {
  const target = `root@${host}:${remote}/${rel}`;
  if (dry) { console.log(`[dry] scp ${local} ${target}`); return; }
  execFileSync('scp', ['-i', key, '-B', ...SCP_PORT, local, target], { stdio: 'inherit' });
};
ssh(`mkdir -p ${remote}/ordinary ${remote}/forge ${remote}/installed`);
for (const f of files) scp(f.local, f.rel);
console.log(`published ${files.length} files to http://${host}/plugin-market/`);
console.log(`set var/plugin-market/mirrors.json to ["http://${host}/plugin-market/"]`);
