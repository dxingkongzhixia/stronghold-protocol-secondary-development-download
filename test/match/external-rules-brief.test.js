// docs/EXTERNAL_AI.md: an external model is told the rules before it decides. The knowledge pack carries the
// player-facing rule book (docs/PLAYING.md §1–§7, cut to a bounded brief) and the system prompt says to read that
// brief first — the fork's own rules, not the model's priors about similar auto-chess games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knowledgePack } from '../../server/ai/knowledge.js';
import { advisorSystem, RULES_LEAD } from '../../tools/ai/llm-agent.mjs';
import { getData } from '../../server/data.js';

test('the external model reads this game\'s rules first', () => {
  const pack = knowledgePack(getData(), { language: 'zh-CN', modeId: 'coop' });
  assert.equal(typeof pack.rulesBrief, 'string');
  assert.ok(pack.rulesBrief.length > 1000, 'the rule book travels with the knowledge pack');
  assert.match(pack.rulesBrief, /玩法指南|规则入口/, 'it is docs/PLAYING.md §1–§7');
  const system = advisorSystem(pack);
  assert.ok(system.includes(RULES_LEAD), 'the system prompt asks for the rules first');
  assert.ok(system.includes('玩法指南'), 'and the brief itself is in the request');
  assert.ok(system.length <= 200000, 'the request stays bounded');
  // a deployment without the docs (a slim image): no dangling instruction, the pack still builds
  const bare = advisorSystem({ version: 1 });
  assert.equal(bare.includes(RULES_LEAD), false);
});
