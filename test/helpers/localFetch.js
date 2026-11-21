// test/helpers/localFetch.js — a fetch for tests that talk to a server on an ephemeral port.
//
// undici (the global fetch) refuses a fixed list of ports ("bad port": 1–1023, 6000, 6665–6669, 10080 …). A test
// server bound with `port: 0` can land on one of them (a machine whose dynamic range starts at 1024, or a static
// 6000-range reservation), and the request then fails with a TypeError that has nothing to do with the code under
// test — the observed `test/i18n-packs.test.js` flake. node:http has no such list; this helper exposes just enough of
// the Response shape the tests use.
import http from 'node:http';
import https from 'node:https';

export function localFetch(url, opts = {}) {
  const u = new URL(url);
  const mod = u.protocol === 'https:' ? https : http;
  const raw = opts.body;
  const body = raw == null ? null : Buffer.from(typeof raw === 'string' || Buffer.isBuffer(raw) ? raw : JSON.stringify(raw));
  const headers = { ...(opts.headers || {}) };
  if (body && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: opts.method || (body ? 'POST' : 'GET'), headers }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: { get: (k) => res.headers[String(k).toLowerCase()] ?? null },
          async text() { return buf.toString('utf8'); },
          async json() { return JSON.parse(buf.toString('utf8')); },
          buffer: buf,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
