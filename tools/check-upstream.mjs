// tools/check-upstream.mjs — pre-merge reconnaissance for the mainline (docs/AI-WORKFLOW.md §b, docs/UPSTREAM-MERGES.md).
//
// One command, and it never touches the working tree, the index or a branch:
//   1. fetch the mainline (default `https://github.com/sganggs/Stronghold-Protocol.git`; `SP_UPSTREAM` overrides),
//   2. baseline = `git merge-base HEAD <tip>` — the upstream commit we last folded in, so "new" means new to US,
//   3. list the new upstream commits and the files they touch,
//   4. split those files into "we changed it too" (the predicted conflict set) and the never-merge surface (§0),
//   5. run a REAL merge in memory (`git merge-tree --write-tree`) and report the conflicts it actually finds.
//
// The never-merge surface is §0 of docs/UPSTREAM-MERGES.md. Two parts of it are computed rather than listed: every
// path we DELETED relative to the baseline (the kits/tests of the excluded operators), and NEVER_MERGE_WATCH below —
// the machine-readable projection of the rows that live *inside* a file we still keep. §0 stays the authority: when
// you add a row there, add its upstream path here (test/check-upstream.test.js keeps the shape honest).
//
// Usage: node tools/check-upstream.mjs [--json] [--no-fetch] [--no-merge-tree] [--upstream <url|ref>] [--strict]
//   --json          print the model as JSON instead of the report
//   --no-fetch      do not touch the network; resolve --upstream (or `HEAD@{upstream}`, or the local `upstream`) instead
//   --no-merge-tree skip the in-memory merge (the report is then only the prediction, not the fact)
//   --upstream <x>  a URL to fetch, or an existing ref (e.g. `upstream/master`) to use as the tip
//   --strict        exit 1 when there IS new upstream work, 2 when the fetch failed (a pre-merge gate)
//
// Exit codes: 0 nothing new / report only; 1 new work with --strict; 2 the mainline could not be reached.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_UPSTREAM = 'https://github.com/sganggs/Stronghold-Protocol.git';

/**
 * The §0 rows that live inside a file we still keep — matched against the UPSTREAM paths a new commit touches.
 * `match` is an exact repo path or a RegExp; `item` is the §0 row it stands for (the table's own words).
 */
export const NEVER_MERGE_WATCH = Object.freeze([
  { match: 'public/js/screens/game.js', item: '#149 盟约收起 (foldable bond bar: bondsCollapsed / gm__bond-list)' },
  { match: 'server/match/bondsMeta.js', item: '本局禁用盟约被强制失效 (a 本局禁用 bond forced inert)' },
  { match: 'server/sim/content/kits/ops/op-clemnt.js', item: '上游 克莱门莎 (Clementia)' },
  { match: /^shared\/(potential|loadoutRecord)\.js$/, item: 'R21P 满潜 / R22-LOADOUT (per-operator 潜能 / 练度) — the fork KEEPS the subsystem but its DEFAULT is 潜能 1 / 未精英化 (MATCHMAKING §45): a merge must not restore a full-potential default' },
  { match: 'public/js/ui/settings.js', item: '设置 → 问题反馈 / DIAGNOSTICS' },
  { match: /^server\/match\/(Match|gamedata)\.js$/, item: '上游道具牌库卡库存 (itemPool / 白给装备)' },
  { match: 'server/match/match/spDraft.js', item: '上游道具牌库卡库存 (itemPool / 白给装备)' },
  { match: 'data/assets.json', item: '上游的多语言配音 (audio.voiceEn / voiceKr / voiceNative) — owner 2026-10-16: 只保留日语 + 中文' },
  { match: 'public/js/audio.js', item: '上游的多语言配音 (语音语言的选项表) — owner 2026-10-16: 只保留日语 + 中文' },
  { match: /^public\/js\/render\/board3d\//, item: '上游对 3D 战场的实现（board3d：光照 rig / 材质层 / 高台）' },
]);

/** `git diff --name-status` output → [{ status, path }] (a rename reports its new path). */
export function parseNameStatus(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 2) continue;
    out.push({ status: cols[0].trim(), path: cols[cols.length - 1] });
  }
  return out;
}

/**
 * `git merge-tree --write-tree <a> <b>` output → { tree, conflicts, messages }.
 * Shape: the tree OID, then the conflicted-file info as `<mode> <object> <stage>\t<path>` (three rows per file), then
 * a blank line and the informational `Auto-merging x` / `CONFLICT (…): … in x` lines.
 */
export function parseMergeTree(stdout) {
  const lines = String(stdout).split(/\r?\n/);
  const first = (lines[0] || '').trim();
  const tree = /^[0-9a-f]{40,64}$/.test(first) ? first : null;
  const conflicts = new Set();
  const messages = [];
  for (const line of lines.slice(tree ? 1 : 0)) {
    const stage = line.match(/^\d{6} [0-9a-f]+ [123]\t(.+)$/);
    if (stage) { conflicts.add(stage[1]); continue; }
    if (line.startsWith('CONFLICT')) messages.push(line);
  }
  return { tree, conflicts: [...conflicts].sort(), messages };
}

/** Which new upstream paths land on the never-merge surface — deleted-by-us, or a NEVER_MERGE_WATCH row. */
export function neverMergeHits(upstreamPaths, deletedPaths, watch = NEVER_MERGE_WATCH) {
  const deleted = new Set(deletedPaths);
  const hits = new Map();
  for (const p of upstreamPaths) {
    if (deleted.has(p)) { hits.set(p, 'we deleted this file (a removed upstream feature lives here)'); continue; }
    for (const rule of watch) {
      const hit = typeof rule.match === 'string' ? rule.match === p : rule.match.test(p);
      if (hit) { hits.set(p, rule.item); break; }
    }
  }
  return [...hits].map(([path, item]) => ({ path, item })).sort((a, b) => a.path.localeCompare(b.path));
}

/** The model → the console report. `paths` are capped so a huge merge stays readable; the counts never are. */
export function formatReport(m) {
  const L = [];
  const say = (s = '') => L.push(s);
  say(`mainline   ${m.upstream}`);
  say(`baseline   ${m.baseline}   (the upstream commit we last folded in)`);
  say(`tip        ${m.tip}${m.tipSubject ? '   ' + m.tipSubject : ''}`);
  say(`new        ${m.commits.length} commit(s) we do not have  ·  we are ${m.ahead} ahead`);
  if (!m.commits.length) {
    say('');
    say('Nothing to merge: the mainline has not moved since our last fold-in.');
    return L.join('\n');
  }
  say('');
  say('New upstream commits:');
  for (const c of m.commits.slice(0, m.showCommits)) say(`  ${c.sha.slice(0, 9)}  ${c.subject}`);
  if (m.commits.length > m.showCommits) say(`  … and ${m.commits.length - m.showCommits} more`);
  say('');
  say(`Files they touch: ${m.upstreamPaths.length}`);
  say(`  · we changed too (predicted conflicts): ${m.overlap.length}`);
  for (const p of m.overlap.slice(0, m.showPaths)) say(`      ${p}`);
  if (m.overlap.length > m.showPaths) say(`      … and ${m.overlap.length - m.showPaths} more`);
  say(`  · never-merge surface (§0): ${m.neverMerge.length}`);
  for (const h of m.neverMerge) say(`      ${h.path}   ← ${h.item}`);
  if (m.neverMerge.length) {
    say('    STOP: a §0 item is in play. Read docs/UPSTREAM-MERGES.md §0 and docs/OUR-FEATURES.md §5 before merging.');
  }
  if (m.mergeTree) {
    say('');
    say(`In-memory merge (\`git merge-tree --write-tree\`): ${m.mergeTree.conflicts.length} conflicted file(s)`);
    for (const p of m.mergeTree.conflicts.slice(0, m.showPaths)) say(`      ${p}`);
    if (m.mergeTree.conflicts.length > m.showPaths) {
      say(`      … and ${m.mergeTree.conflicts.length - m.showPaths} more`);
    }
    if (!m.mergeTree.conflicts.length) say('      (none: this merge would apply cleanly)');
  } else {
    say('');
    say('In-memory merge skipped (--no-merge-tree): the list above is a prediction, not the fact.');
  }
  say('');
  say('Next: docs/AI-WORKFLOW.md §b (the merge procedure) — resolve hunk-by-hunk, never `--ours/--theirs` on a source file.');
  return L.join('\n');
}

/** Node's default maxBuffer (1 MB) is far too small for a mainline batch: `git diff` over 764 upstream commits
 *  printed >100 MB and the tool crashed with a truncated buffer instead of reporting. 256 MB is the ceiling. */
const MAX_OUT = 256 * 1024 * 1024;

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_OUT, ...opts }).trim();
}

function gitOk(args, opts = {}) {
  try {
    return { ok: true, out: execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_OUT, ...opts }).trim() };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '').trim(), err: String(e.stderr || e.message || '').trim() };
  }
}

/**
 * Build the model. Throws nothing: a failed fetch comes back as { fetchError }.
 * @param {{ root?: string, upstream?: string, fetch?: boolean, mergeTree?: boolean, showCommits?: number, showPaths?: number }} o
 */
export function check({ root = process.cwd(), upstream = DEFAULT_UPSTREAM, fetch = true, mergeTree = true,
  showCommits = 15, showPaths = 20 } = {}) {
  const at = (args) => git(['-C', root, ...args]);
  const isUrl = /:\/\/|^[^\s/]+@[^\s:]+:/.test(upstream);
  let tip;
  if (isUrl) {
    if (fetch) {
      const f = gitOk(['-C', root, 'fetch', '--no-tags', upstream, 'master']);
      if (!f.ok) return { upstream, fetchError: f.err || 'git fetch failed' };
      tip = at(['rev-parse', 'FETCH_HEAD']);
    } else {
      // --no-fetch with a URL: fall back to whatever ref already points at the mainline
      const local = gitOk(['-C', root, 'rev-parse', '--verify', '--quiet', 'upstream']);
      if (!local.ok) return { upstream, fetchError: '--no-fetch, and no local `upstream` ref to fall back to' };
      tip = local.out;
    }
  } else {
    const r = gitOk(['-C', root, 'rev-parse', '--verify', '--quiet', upstream]);
    if (!r.ok) return { upstream, fetchError: `cannot resolve the ref \`${upstream}\`` };
    tip = r.out;
  }

  const baseline = at(['merge-base', 'HEAD', tip]);
  const ahead = Number(at(['rev-list', '--count', `${tip}..HEAD`]));
  const log = at(['log', '--format=%H\t%s', `${baseline}..${tip}`]);
  const commits = log ? log.split(/\r?\n/).map((l) => {
    const i = l.indexOf('\t');
    return { sha: l.slice(0, i), subject: l.slice(i + 1) };
  }) : [];
  const upstreamPaths = parseNameStatus(at(['diff', '--name-status', baseline, tip])).map((e) => e.path);
  const ours = parseNameStatus(at(['diff', '--name-status', baseline, 'HEAD']));
  const ourPaths = new Set(ours.map((e) => e.path));
  const deleted = ours.filter((e) => e.status.startsWith('D')).map((e) => e.path);
  const overlap = upstreamPaths.filter((p) => ourPaths.has(p));
  const neverMerge = neverMergeHits(upstreamPaths, deleted);

  let mt = null;
  if (mergeTree && commits.length) {
    const r = gitOk(['-C', root, 'merge-tree', '--write-tree', 'HEAD', tip]);
    mt = parseMergeTree(r.out);
  }

  return {
    upstream, baseline, tip, tipSubject: commits.length ? commits[0].subject : at(['log', '-1', '--format=%s', tip]),
    ahead, commits, upstreamPaths, overlap, neverMerge, mergeTree: mt, showCommits, showPaths,
  };
}

const USAGE = 'usage: node tools/check-upstream.mjs [--json] [--no-fetch] [--no-merge-tree] [--upstream <url|ref>] [--strict]';

export function main(argv) {
  let json = false, strict = false, fetch = true, mergeTree = true;
  let upstream = process.env.SP_UPSTREAM || DEFAULT_UPSTREAM;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--strict') strict = true;
    else if (a === '--no-fetch') fetch = false;
    else if (a === '--no-merge-tree') mergeTree = false;
    else if (a === '--upstream') { upstream = argv[++i] || ''; if (!upstream) { console.error(USAGE); return 2; } }
    else if (a === '--help' || a === '-h') { console.log(USAGE); return 0; }
    else { console.error(`check-upstream: unknown argument ${a}`); console.error(USAGE); return 2; }
  }
  const root = git(['rev-parse', '--show-toplevel']);
  const model = check({ root, upstream, fetch, mergeTree });
  if (model.fetchError) {
    console.error(`check-upstream: could not reach the mainline (${model.upstream})\n  ${model.fetchError}`);
    console.error('  (the local proxy is off? try --no-fetch --upstream upstream, or start the proxy)');
    return 2;
  }
  process.stdout.write(json ? JSON.stringify(model, null, 2) + '\n' : formatReport(model) + '\n');
  if (!strict) return 0;
  return model.commits.length ? 1 : 0;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) process.exit(main(process.argv.slice(2)));
