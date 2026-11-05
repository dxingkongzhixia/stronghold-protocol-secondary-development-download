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

/** One markdown file split into heading-scoped chunks. */
function parseMarkdown(file, text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  let title = path.basename(file, '.md');
  let body = [];
  const flush = () => {
    const t = body.join('\n').trim();
    if (t) out.push({ file, title, text: t });
    body = [];
  };
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h) { flush(); title = h[2].trim(); continue; }
    body.push(line);
  }
  flush();
  return out;
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
  const terms = termsOf(query);
  if (!terms.length) return [];
  const scored = [];
  for (const item of loadKnowledge({ root })) {
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
  return results.map((r, i) => `### [${i + 1}] ${r.file} · ${r.title}\n${r.text}`).join('\n\n');
}

const IS_ENTRY = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_ENTRY) {
  const args = process.argv.slice(2);
  if (args.includes('--list') || args.length === 0) {
    const seen = new Map();
    for (const k of loadKnowledge()) {
      if (!seen.has(k.file)) seen.set(k.file, []);
      seen.get(k.file).push(k.title);
    }
    for (const [file, titles] of seen) console.log(`${file}\n  ${titles.join('\n  ')}`);
  } else {
    const q = args.join(' ');
    const results = searchKnowledge(q);
    console.log(renderKnowledge(results, q));
  }
}
