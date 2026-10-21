import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginHudBlocks } from '../../public/js/ui/pluginHud.js';

test('plugin HUD accepts only the bounded declarative blocks', () => {
  const pub = { pluginView: {
    demo: { hud: { overlay: [
      { type: 'text', label: '目标', text: '存活到第 10 回合' },
      { type: 'bar', label: '重构', value: 2, max: 5 },
      { type: 'countdown', label: '清除', seconds: 12.2 },
      { type: 'list', label: '条件', items: ['守住左路', '不失去目标生命'] },
      { type: 'html', text: '<b>never</b>' },
      { type: 'bar', value: 1, max: 0 },
    ] } },
    other: { hud: { boss: [{ type: 'text', text: 'BOSS' }] } },
  } };
  assert.deepEqual(pluginHudBlocks(pub, 'overlay').map((b) => b.type), ['text', 'bar', 'countdown', 'list']);
  assert.deepEqual(pluginHudBlocks(pub, 'boss').map((b) => b.text), ['BOSS']);
  assert.deepEqual(pluginHudBlocks(pub, 'top'), []);
  assert.deepEqual(pluginHudBlocks(null, 'overlay'), []);
});
