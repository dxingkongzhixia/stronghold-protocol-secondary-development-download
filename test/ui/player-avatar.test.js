// PlayerAvatar: the account picture (operator charId or uploaded file) wins over the band icon / initial now that the
// match's public player rows carry it (band check, protocol boot, in-match team panel, results).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlayerAvatar, Img } from '../../public/js/ui/gameComponents.js';
import { data } from '../../public/js/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));

function imgSrc(v) {
  const found = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    found.push(n);
    const c = n.props?.children;
    if (Array.isArray(c)) c.forEach(walk); else walk(c);
  };
  walk(v);
  return found.find((n) => n.type === Img)?.props?.src ?? null;
}

describe('PlayerAvatar', () => {
  data.setContent({ id: 'player-avatar-test', values: { assets: manifest } });

  test('an operator-avatar charId is drawn as the account picture', () => {
    const v = PlayerAvatar({ player: { playerId: 'p', name: 'A', seat: 0, bandId: 'band_bldsk', avatar: 'char_003_kalts' } });
    assert.equal(imgSrc(v), manifest.chars.char_003_kalts.avatarE2 || manifest.chars.char_003_kalts.avatar);
  });

  test('an uploaded avatar file uses the /avatar route', () => {
    const file = `${'ab'.repeat(16)}.png`;
    const v = PlayerAvatar({ player: { playerId: 'p', name: 'A', seat: 0, avatar: file } });
    assert.equal(imgSrc(v), `/avatar/${file}`);
  });

  test('without an account picture the old band icon / glyph fallback stays', () => {
    const withBand = PlayerAvatar({ player: { playerId: 'p', name: 'A', seat: 0, bandId: 'band_bldsk' } });
    assert.match(imgSrc(withBand), /\/band\/band_bldsk\.png$/);
    const plain = PlayerAvatar({ player: { playerId: 'p', name: 'A', seat: 0 } });
    assert.equal(imgSrc(plain), null);
  });
});
