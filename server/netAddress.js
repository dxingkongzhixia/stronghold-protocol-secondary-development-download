// server/netAddress.js — the owner-gate address rules shared by test mode and Keel's native trust gate.
//
// [ASSUMED] All of IPv4 0/8 and every spelling of IPv6 zero are unspecified for this gate.
import { isIP } from 'node:net';
import { isLocalIp, normalizeIp } from './net.js';

/** Parse literals first; normalizeIp expands IPv4-mapped IPv6 and strips the zone id. */
const listeningIp = (host) => (isIP(host) ? normalizeIp(host) : '');

export function isUnspecifiedAddress(host) {
  const ip = listeningIp(host);
  if (isIP(ip) === 4) return Number(ip.split('.')[0]) === 0;
  // Empty groups in a valid IPv6 literal are compressed zeros; a dotted tail is also numeric.
  return isIP(ip) === 6 && ip.split(':').every((g) => !g || (g.includes('.')
    ? g.split('.').every((n) => Number(n) === 0) : parseInt(g, 16) === 0));
}

/** A trusted gate may listen on loopback/private addresses; `trusted-force`/`force` opens it explicitly. */
export function trustedHostAllowed(host, mode) {
  return mode === 'trusted-force' || mode === 'force'
    || (isLocalIp(listeningIp(host)) && !isUnspecifiedAddress(host));
}
