// which art classes fail on the relay vs the game server (sampled from the LIVE served manifest)
const SITE = process.env.SITE || 'http://183.66.27.19:20522';
const RELAY = 'http://123.57.150.185';

const manifest = await (await fetch(`${SITE}/data/assets.json`)).json();
const urls = [];
(function walk(v) {
  if (typeof v === 'string') { if (v.startsWith('/assets/') || v.startsWith('/fonts/')) urls.push(v); return; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]);
})(manifest);
const uniq = [...new Set(urls)];

const cls = (u) => {
  const p = u.replace(/^\/assets\/~[0-9a-f]+\//, '/assets/');
  const m = p.match(/^(\/assets\/local\/[a-z]+\/|\/assets\/[a-z]+\/|\/fonts\/)/);
  return m ? m[1] : p.slice(0, 24);
};
const byClass = new Map();
for (const u of uniq) { const c = cls(u); const a = byClass.get(c) || []; if (a.length < 6) a.push(u); byClass.set(c, a); }

const head = async (u) => { try { const r = await fetch(u, { method: 'GET' }); return r.status; } catch (e) { return 'ERR'; } };
/** the URL the client actually uses for a mirror: drop the ~hash segment, add ?h=<hash> */
const clientForm = (u) => {
  const m = u.match(/^(\/assets|)(\/~[0-9a-f]+)?(\/.*)$/);
  const hash = u.match(/\/~([0-9a-f]+)\//);
  const plain = u.replace(/\/~[0-9a-f]+\//, '/');
  return hash ? `${RELAY}${plain}?h=${hash[1]}` : `${RELAY}${plain}`;
};

console.log('sampled classes:', [...byClass.keys()].length, 'urls:', uniq.length);
for (const [c, list] of [...byClass.entries()].sort()) {
  const rows = [];
  for (const u of list) {
    const relay = await head(clientForm(u));
    const server = await head(SITE + u);
    rows.push(`${relay}/${server}`);
  }
  console.log(`${c.padEnd(26)} relay/server: ${rows.join('  ')}`);
}
