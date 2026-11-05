// tools/agent/knowledge.mjs — the agent's local briefing + searchable rule knowledge.
//
// The LLM client sends this briefing once (role, etiquette, communication, phase playbook) and can ask for excerpts
// with {"lookup":"..."} instead of carrying the entire documentation in every prompt. The same module is a small CLI:
//
//   node tools/agent/knowledge.mjs "联防 怎么打"
//   node tools/agent/knowledge.mjs --list
//
// It reads only player-facing docs that ship in this checkout; a remote client without them gets the built-in briefing
// and the compact rule fallback from llm.mjs.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const KNOWLEDGE_FILES = Object.freeze(['docs/PLAYING.md', 'docs/RULES.md', 'docs/AI-STRATEGY.md', 'docs/BOT-STRATEGIES.md']);
const FILE_ALIAS = Object.freeze({
  'docs/PLAYING.md': 'play',
  'docs/RULES.md': 'rules',
  'docs/AI-STRATEGY.md': 'strategy',
  'docs/BOT-STRATEGIES.md': 'bots',
});

/** Role / etiquette / phase playbook. Kept short: it is sent with every system prompt. */
export const AGENT_BRIEFING = `# YOUR ROLE
You are an anonymous external AI agent occupying a player seat in a co-op match. The room UI marks your seat AGENT: you
are neither the built-in bot nor a human. You only control your own seat through g.* actions; you cannot invite, kick,
start, change settings or act for anyone else. Be a cooperative teammate: protect the team, share useful visible
information, never sabotage, never pretend to be human if asked.

# COMMUNICATION (you may speak)
You can send room.chat {"text":"..."} and g.emote {"id":"..."} like a human player.
- Greet once when the match starts; answer a teammate who speaks to you; make short, useful call-outs
  (under ~40 characters), e.g. "我来守上路", "先升商店", "这轮先稳".
- Use an emote for quick reactions (hello / agree / celebrate), not instead of playing.
- Do NOT spam: at most one chat every ~10 s and one emote every ~5 s. Do not argue, do not repeat yourself,
  and never claim knowledge you do not have (you only see your own visible views).
- Match the room's language; the default is Chinese (zh-CN). Keep messages short.

# STRATEGY REFERENCE (a baseline, not a hard rule)
Economy: R1–R2 target level 2 and fill the board; R3–R4 level 3 while starting your main bond; R5–R6 level 4 and
finish the main bond; R7–R9 level 5 for a 5-cost core; R10+ level 6 only when healthy. Funds usually reset at the end
of prep (only specific bands carry/interest), so spend instead of hoarding. Upgrade cost drops by 1 each round.
Refresh costs 1; do not reroll without a target. When low on team HP, spend on the board before leveling.
Composition: one main bond plus at most two utility bonds (air / block / sustain). A 2-star core beats an extra bond.
Keep transition pieces you will need later; the bench holds 10.
Position: blockers on the enemy path, damage behind them; ranged pieces on high ground/cover; keep the high-cost carry
out of boss focus. Deploy up to deployCap before Ready.
Prep order: buy pairs that can merge, deploy, answer reward/choice, then Ready. Sell returns little (usually 1).
Bands: weigh starting HP + the permanent effect against your plan — defense/heal when low, economy/interest for a long
game, bond layers for your composition. Look up strategy/3 (economy), strategy/4 (composition), strategy/5 (position)
when you need the detailed reasoning, or play/5–play/7 for special rounds.

# PHASE PLAYBOOK
INFO_CHECK: g.infoReady.
BAND_DRAFT: on your turn pick an unclaimed band; on other turns wait.
PREP: buy affordable chess, deploy hand pieces into free deploy cells, answer personalChoice / rewardOffer, then
g.ready. Chat/emote only when it helps coordination.
COMBAT / UNITE: no prep actions; you may answer a teammate or emote. Do not send buy/move/ready.

# WHEN YOU NEED A RULE
If something is not covered by the rule book, reply with {"lookup":"<short keywords>"} (once per decision). You will
receive the most relevant excerpts, then you must return the action. Prefer asking for game mechanics, not for hidden
information — you have none.`;

/** One markdown file split into level-2 sections, each with a stable lookup id (`play/5`). */
function parseMarkdown(file, text) {
  const alias = FILE_ALIAS[file] || path.basename(file, '.md');
  const out = [];
  let title = path.basename(file, '.md');
  let body = [];
  let n = 0;
  const flush = () => {
    const t = body.join('\n').trim();
    if (t) out.push({ id: `${alias}/${n}`, file, title, text: t, summary: summarize(t) });
    body = [];
  };
  for (const line of String(text).split(/\r?\n/)) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) { flush(); n++; title = h[1].trim(); continue; }
    // the file's h1 and any content before the first `##` is the alias/0 overview
    if (/^#\s+/.test(line) && !body.length) continue;
    body.push(line);
  }
  flush();
  return out;
}

/** First readable sentence of a section, for the index (skips table rows and tiny fragments). */
function summarize(text) {
  const cleaned = String(text)
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-*|>\d.\s]+/, '').replace(/[*`|]/g, '').trim())
    .filter((s) => s.length > 0 && !/^```/.test(s) && !/^\|/.test(s));
  const line = cleaned.find((s) => s.length >= 12) || cleaned[0] || '';
  const out = line.replace(/\s+/g, ' ').trim();
  return out.length > 140 ? `${out.slice(0, 137)}…` : out;
}

/** All available knowledge chunks (cached per process). */
export function loadKnowledge({ root = ROOT } = {}) {
  const out = [];
  for (const rel of KNOWLEDGE_FILES) {
    const file = path.join(root, rel);
    if (!existsSync(file)) continue;
    try { out.push(...parseMarkdown(rel, readFileSync(file, 'utf8'))); } catch { /* skip an unreadable file */ }
  }
  return out;
}

/**
 * The compact table the model sees first: id, title, one-line summary. It is enough to decide WHAT to look up, without
 * shipping every rule in every prompt.
 * @param {{ root?: string }} [opts]
 * @returns {{ id: string, file: string, title: string, summary: string }[]}
 */
export function loadRuleIndex({ root = ROOT } = {}) {
  return loadKnowledge({ root }).map(({ id, file, title, summary }) => ({ id, file, title, summary }));
}

/** Format the index as a prompt block. */
export function renderRuleIndex(index) {
  if (!index || !index.length) return '# RULE INDEX\n(no rule documents available; use the built-in briefing and the visible state)';
  const lines = index.map((s) => `- ${s.id} · ${s.title}${s.summary ? ` — ${s.summary}` : ''}`);
  return `# RULE INDEX
Look up a section when you need its details: reply {"lookup":"<id>"} (or keywords). You then get that section and must
return the action. Prefer ids for exact lookups; use keywords when you do not know the id.

${lines.join('\n')}`;
}

const termsOf = (query) => {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const words = q.split(/[\s,，。;；:：!?！？/\\|]+/).filter((w) => w.length >= 2);
  const bigrams = [];
  for (const w of words) {
    if (/[\u3400-\u9fff]/.test(w)) for (let i = 0; i + 2 <= w.length; i++) bigrams.push(w.slice(i, i + 2));
  }
  return [...new Set([...words, ...bigrams])].sort((a, b) => b.length - a.length);
};

/**
 * Keyword search over the player docs. A heading match weighs more than body occurrences; the result is bounded so it
 * fits in a follow-up prompt.
 * @param {string} query
 * @param {{ limit?: number, maxChars?: number, root?: string }} [opts]
 * @returns {{ file: string, title: string, text: string, score: number }[]}
 */
export function searchKnowledge(query, { limit = 3, maxChars = 1400, root = ROOT } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const all = loadKnowledge({ root });
  // an exact id (`play/5`) is the index's primary lookup path
  const exact = all.find((item) => item.id === q);
  if (exact) return [{ ...exact, score: 999 }].map((item) => ({ ...item, text: item.text.slice(0, maxChars) }));
  const terms = termsOf(q);
  if (!terms.length) return [];
  const scored = [];
  for (const item of all) {
    const title = item.title.toLowerCase();
    const body = item.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 8;
      let at = body.indexOf(t);
      while (at >= 0) { score += 1; at = body.indexOf(t, at + t.length); }
    }
    if (score > 0) scored.push({ ...item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh'));
  return scored.slice(0, limit).map((item) => {
    const text = item.text.length > maxChars ? `${item.text.slice(0, maxChars)}…` : item.text;
    return { ...item, text };
  });
}

/** The excerpts as a prompt block the model can use. */
export function renderKnowledge(results, query = '') {
  if (!results || !results.length) return `No matching rule excerpt for "${query}". Act from the visible state and the rule book.`;
  return results.map((r, i) => `### [${i + 1}] ${r.id} · ${r.file} · ${r.title}\n${r.text}`).join('\n\n');
}

const IS_ENTRY = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_ENTRY) {
  const args = process.argv.slice(2);
  if (args.includes('--list') || args.length === 0) {
    for (const k of loadKnowledge()) console.log(`${k.id}\t${k.title}\t${k.summary}`);
  } else {
    const q = args.join(' ');
    const results = searchKnowledge(q);
    console.log(renderKnowledge(results, q));
  }
}
