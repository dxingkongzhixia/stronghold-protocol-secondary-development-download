#!/usr/bin/env node
// tools/hang-guard.mjs — run a test command under a hard wall clock; a run past the limit is treated as hung and
// STOPPED, with the diagnostics a human needs, instead of silently burning CPU for an hour.
//
//   node tools/hang-guard.mjs -- node --test test/ui/teammate-loadout.e2e.test.js
//   node tools/hang-guard.mjs --minutes 5 -- npm run test:browser:smoke
//
// Why: a browser E2E run here once spent ~55 min with one Chrome process at 66 min CPU while node sat at 2 s — the
// suite looked like it was "still running". Node's own --test-timeout bounds a single test, and --test-force-exit
// covers "tests done, a leaked server/browser keeps the process alive"; this guard covers the remaining shape, a
// whole run that never reaches either (a crash dialog, a spinning page, a stuck browser launch).
//
// On timeout it prints the elapsed time, the command, the process tree's top CPU users (best effort) and the last
// output lines, then kills the child tree. Exit 3 = HANG (manual intervention), the command's own code otherwise.
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const argv = process.argv.slice(2);
const at = argv.indexOf('--');
if (at < 0 || at === argv.length - 1) {
  console.error('usage: node tools/hang-guard.mjs [--minutes N] -- <command> [args…]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && i < at ? Number(argv[i + 1]) || fallback : fallback;
};
const MINUTES = opt('--minutes', 10);
const cmd = argv.slice(at + 1);
const LIMIT_MS = MINUTES * 60 * 1000;
const started = Date.now();
const tail = [];
const remember = (s) => { for (const line of String(s).split(/\r?\n/)) if (line.trim()) { tail.push(line); if (tail.length > 40) tail.shift(); } };

/** The process tree's busiest members, best effort (Windows: tasklist /v has no CPU; PowerShell can give it). */
function cpuReport() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-NoProfile', '-Command',
        'Get-Process node,chrome,msedge -ErrorAction SilentlyContinue | Sort-Object CPU -Descending | Select-Object -First 6 Id,ProcessName,CPU,StartTime | Format-Table -AutoSize | Out-String'],
        { encoding: 'utf8', timeout: 15000 });
      return (r.stdout || '').trim();
    }
    const r = spawnSync('ps', ['-eo', 'pid,pcpu,etime,comm', '--sort=-pcpu'], { encoding: 'utf8', timeout: 15000 });
    return (r.stdout || '').split('\n').slice(0, 7).join('\n');
  } catch { return '(process table unavailable)'; }
}

const child = spawn(cmd[0], cmd.slice(1), { stdio: ['inherit', 'pipe', 'pipe'], env: process.env });
child.stdout.on('data', (d) => { process.stdout.write(d); remember(d); });
child.stderr.on('data', (d) => { process.stderr.write(d); remember(d); });

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  const mins = Math.round((Date.now() - started) / 60000);
  console.error(`\n[hang-guard] HANG SUSPECTED: the command has run ${mins} min (limit ${MINUTES}). Stopping it.`);
  console.error(`[hang-guard] command: ${cmd.join(' ')}`);
  console.error('[hang-guard] busiest node/chrome processes now:');
  console.error(cpuReport());
  console.error('[hang-guard] last output:');
  for (const line of tail.slice(-15)) console.error(`  | ${line}`);
  console.error('[hang-guard] A hang needs manual inspection (the last test/file above; node --test-timeout names a single test, --test-force-exit the leaked-handle case).');
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch { /* already gone */ }
}, LIMIT_MS);

child.on('exit', async (code, signal) => {
  clearTimeout(timer);
  if (timedOut) { await delay(100); process.exit(3); }
  process.exit(code ?? (signal ? 1 : 0));
});
