#!/usr/bin/env node
// Check the runtime shape of a trusted-plugin container against the deployment baseline. This does not execute a
// plugin; it inspects the already-running container and its read-only/rootless/capability/network/resource settings.
//
// Usage: node tools/trusted-container-check.mjs --container <name> [--json]
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const get = (name, fallback = '') => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const container = get('--container');
const asJson = args.includes('--json');
if (!container) {
  console.error('usage: node tools/trusted-container-check.mjs --container <name> [--json]');
  process.exit(2);
}
const run = (cmd, argv) => {
  try { return { ok: true, out: execFileSync(cmd, argv, { encoding: 'utf8' }).trim() }; }
  catch (e) { return { ok: false, out: String(e?.stderr || e?.message || e) }; }
};
const inspect = run('docker', ['inspect', container]);
if (!inspect.ok) {
  console.error(`cannot inspect ${container}: ${inspect.out}`);
  process.exit(1);
}
let c;
try { c = JSON.parse(inspect.out)[0]; } catch (e) {
  console.error(`docker inspect did not return JSON: ${e.message}`);
  process.exit(1);
}
const host = c.HostConfig || {};
const cfg = c.Config || {};
const caps = (host.CapDrop || []).map((x) => String(x).toUpperCase());
const capAdd = (host.CapAdd || []).map((x) => String(x).toUpperCase());
const security = (host.SecurityOpt || []).map(String);
const uid = run('docker', ['exec', container, 'id', '-u']);
const rootWritable = run('docker', ['exec', container, 'sh', '-c', 'touch /.trusted-probe 2>/dev/null && rm -f /.trusted-probe']);
const binds = Object.values(host.PortBindings || {}).flat();
const loopbackPorts = binds.length > 0 && binds.every((b) => !b.HostIp || b.HostIp === '127.0.0.1' || b.HostIp === '::1');
const checks = [
  ['running', c.State?.Running === true],
  ['non-root user', Boolean(cfg.User) && !/^0(?::0)?$/.test(cfg.User)],
  ['exec uid non-root', uid.ok && uid.out !== '0'],
  ['read-only rootfs', host.ReadonlyRootfs === true],
  ['rootfs probe refused', !rootWritable.ok],
  ['not privileged', host.Privileged !== true],
  ['drop ALL capabilities', caps.includes('ALL')],
  ['no added capabilities', capAdd.length === 0],
  ['no-new-privileges', security.some((x) => /no-new-privileges/i.test(x))],
  ['resource memory limit', Number(host.Memory) > 0],
  ['pid limit', Number(host.PidsLimit) > 0],
  ['not host networking', host.NetworkMode !== 'host'],
  ['published ports loopback only', loopbackPorts],
];
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { container, ok: failures.length === 0, checks: Object.fromEntries(checks), failures };
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(report.ok ? '\ntrusted container baseline: PASS' : `\ntrusted container baseline: FAIL (${failures.join(', ')})`);
}
process.exit(report.ok ? 0 : 1);
