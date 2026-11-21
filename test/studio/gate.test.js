// server/studio/gate.js — who may use the studio (DESIGN §32.9, docs/PLUGINS.md §15). Pure decisions: a fake
// IncomingMessage ({ socket.remoteAddress, headers }) needs no server and no Chrome. The cases are the header's own
// rules: this machine / the local network, a local Host (DNS rebinding), every forwarding hop, the studio key's origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORWARD_HEADERS, extraHosts, forwardedAddresses, hostName, isLocalHost, isLoopback, isStudioChange, studioAllowed, studioMode,
} from '../../server/studio/gate.js';

const req = (ip, headers = {}) => ({ socket: { remoteAddress: ip }, headers });
const may = (r, opts) => studioAllowed(r, opts).ok;

test('studioMode: on for the local network by default, narrowed by SP_STUDIO=local, switched off by off/0/false/no', () => {
  assert.equal(studioMode({}), 'lan');
  assert.equal(studioMode({ SP_STUDIO: ' LAN ' }), 'lan');
  for (const v of ['off', '0', 'false', 'no', 'OFF']) assert.equal(studioMode({ SP_STUDIO: v }), 'off', v);
  for (const v of ['local', 'loopback', 'Local']) assert.equal(studioMode({ SP_STUDIO: v }), 'local', v);
  assert.equal(studioMode({ SP_STUDIO: 'whatever' }), 'lan');
});

test('extraHosts: SP_STUDIO_HOSTS is a trimmed, lower-case, comma-separated list', () => {
  assert.deepEqual(extraHosts({}), []);
  assert.deepEqual(extraHosts({ SP_STUDIO_HOSTS: ' Box.Local , my-pc ,,' }), ['box.local', 'my-pc']);
});

test('hostName: strips the port and the IPv6 brackets, lower cases, refuses garbage', () => {
  assert.equal(hostName('localhost:3000'), 'localhost');
  assert.equal(hostName('[::1]:80'), '::1');
  assert.equal(hostName('My-Box.LOCAL'), 'my-box.local');
  assert.equal(hostName(''), null);
  assert.equal(hostName(null), null);
  assert.equal(hostName('x'.repeat(256)), null);
  assert.equal(hostName('a b'), null);
  assert.equal(hostName('x:notaport'), null, 'a non-numeric colon is not a port');
});

test('isLocalHost: loopback and private IPs, localhost / *.localhost, a dotless machine name, *.local/lan/home.arpa/internal', () => {
  for (const h of ['127.0.0.1', '127.0.0.1:3000', '192.168.1.9:3000', '10.0.0.2', '172.16.0.1', '[::1]:80', 'localhost', 'a.localhost', 'desktop-1', 'box.local', 'nas.lan', 'x.home.arpa', 'svc.internal']) {
    assert.equal(isLocalHost(h), true, h);
  }
  for (const h of ['8.8.8.8', 'example.com', 'evil.example.com', '1.1.1.1:443', '', null]) assert.equal(isLocalHost(h), false, String(h));
  assert.equal(isLocalHost('studio.example.com', ['studio.example.com']), true, 'SP_STUDIO_HOSTS admits a name');
});

test('isLoopback: 127.0.0.0/8 and ::1 only', () => {
  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('127.5.5.5'), true);
  assert.equal(isLoopback('::1'), true);
  assert.equal(isLoopback('192.168.1.9'), false);
  assert.equal(isLoopback('8.8.8.8'), false);
});

test('forwardedAddresses: every hop of X-Forwarded-For, every single-address header, Forwarded for=, repeated headers', () => {
  assert.deepEqual(forwardedAddresses({}), []);
  assert.deepEqual(forwardedAddresses({ 'x-forwarded-for': '10.0.0.1, 8.8.8.8' }), ['10.0.0.1', '8.8.8.8']);
  assert.deepEqual(forwardedAddresses({ 'x-forwarded-for': ['10.0.0.1', ' 9.9.9.9 '] }), ['10.0.0.1', '9.9.9.9']);
  assert.deepEqual(forwardedAddresses({ 'x-real-ip': '192.168.1.2' }), ['192.168.1.2']);
  assert.deepEqual(forwardedAddresses({ forwarded: 'for=10.0.0.1;proto=https, for="[2001:db8::1]"' }), ['10.0.0.1', '2001:db8::1']);
  assert.deepEqual(forwardedAddresses({ forwarded: 'proto=https;by=10.0.0.9' }), [], 'an element without for= names nobody');
  assert.deepEqual(forwardedAddresses({ 'x-forwarded-for': '10.0.0.1,, 8.8.8.8' }), ['10.0.0.1', '8.8.8.8'], 'an empty hop is skipped');
  assert.deepEqual(forwardedAddresses({ 'x-forwarded-for': 'unknown' }), [''], 'an unreadable name is kept as "" (refused)');
  assert.equal(FORWARD_HEADERS.length, 8);
});

test('studioAllowed: local network by default, loopback only in local mode, off refuses; any public hop, public Host or unreadable peer refuses', () => {
  assert.equal(may(req('127.0.0.1', { host: 'localhost:3000' }), { mode: 'lan' }), true);
  assert.equal(may(req('192.168.1.9', { host: '192.168.1.9:3000' }), { mode: 'lan' }), true);
  assert.equal(may(req('::1', { host: '[::1]:3000' }), { mode: 'lan' }), true);
  assert.equal(may(req('8.8.8.8', { host: 'localhost' }), { mode: 'lan' }), false, 'a public peer');
  assert.equal(may(req('192.168.1.9', { host: '192.168.1.9' }), { mode: 'local' }), false, 'SP_STUDIO=local is loopback only');
  assert.equal(may(req('127.0.0.1', { host: 'localhost' }), { mode: 'local' }), true);
  assert.equal(may(req('127.0.0.1', { host: 'localhost' }), { mode: 'off' }), false, 'SP_STUDIO=off');
  assert.equal(may(req('127.0.0.1', { host: 'localhost', 'x-forwarded-for': '10.0.0.1, 8.8.8.8' }), { mode: 'lan' }), false, 'a public hop');
  assert.equal(may(req('127.0.0.1', { host: 'localhost', forwarded: 'for=unknown' }), { mode: 'lan' }), false, 'an unreadable hop');
  assert.equal(may(req('127.0.0.1', { host: 'evil.example.com' }), { mode: 'lan' }), false, 'DNS rebinding');
  assert.equal(may(req('127.0.0.1', {}), { mode: 'lan' }), false, 'no Host');
  assert.equal(may(req('nonsense', { host: 'localhost' }), { mode: 'lan' }), false, 'an unreadable peer');
  assert.equal(may(req(undefined, { host: 'localhost' }), { mode: 'lan' }), false, 'no peer');
  assert.equal(may(req('127.0.0.1', { host: 'studio.example.com' }), { mode: 'lan', hosts: ['studio.example.com'] }), true);
  const why = studioAllowed(req('8.8.8.8', { host: 'localhost' }), { mode: 'lan' });
  assert.equal(why.ok, false);
  assert.match(why.why, /8\.8\.8\.8 is not/);
});

test('isStudioChange: X-SP-Studio plus (when the browser names them) a same-origin Sec-Fetch-Site and the request Host', () => {
  assert.equal(isStudioChange({ headers: {} }), false);
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': '' } }), false);
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': 'k' } }), true, 'a non-browser client need not name Origin');
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': 'k', 'sec-fetch-site': 'same-origin' } }), true);
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': 'k', 'sec-fetch-site': 'none' } }), true);
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': 'k', 'sec-fetch-site': 'cross-site' } }), false);
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': 'k', origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' } }), true);
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': 'k', origin: 'http://evil.example', host: '127.0.0.1:3000' } }), false);
  assert.equal(isStudioChange({ headers: { 'x-sp-studio': 'k', origin: 'not a url' } }), false);
});
