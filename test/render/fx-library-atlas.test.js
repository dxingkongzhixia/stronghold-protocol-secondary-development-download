// Plugin texture pages: the atlas is drawn into one canvas, and the lite tier halves both the page and its parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FxLibrary } from '../../public/js/render/vfx/library.js';

test('the lite tier halves a plugin atlas page and a plain plugin texture', async () => {
  const oldCanvas = globalThis.OffscreenCanvas, oldBitmap = globalThis.createImageBitmap, oldImage = globalThis.Image;
  const draws = [], bitmaps = [];
  class Canvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { drawImage: (...a) => draws.push(a) }; }
  }
  globalThis.OffscreenCanvas = Canvas;
  globalThis.createImageBitmap = async (_blob, opts) => { bitmaps.push(opts); return { width: 4, height: 4 }; };
  try {
    const lib = new FxLibrary({ fetch: async () => ({ ok: true, blob: async () => new Blob(['x']) }), list: { groups: {} } });
    lib.pluginAtlas.set('plugin:fx:__atlas', { w: 8, h: 8, parts: [
      { url: '/p/fx/a.png', x: 2, y: 2, w: 4, h: 4 },
      { url: '/p/fx/b.png', x: 0, y: 0, w: 2, h: 2 },
    ] });
    const page = await lib.loadTexture('plugin:fx:__atlas', true);
    assert.equal(page.image.width, 4); assert.equal(page.image.height, 4);
    assert.equal(draws.length, 2);
    assert.deepEqual(draws[0].slice(5), [1, 1, 2, 2]);
    assert.equal(bitmaps[0].imageOrientation, 'none');

    lib.pluginTex.set('plugin:fx:one', { path: '/p/fx/one.png', w: 8, h: 4 });
    await lib.loadTexture('plugin:fx:one', true);
    assert.deepEqual(bitmaps.at(-1).resizeWidth, 4);
    assert.deepEqual(bitmaps.at(-1).resizeHeight, 2);
  } finally {
    globalThis.OffscreenCanvas = oldCanvas; globalThis.createImageBitmap = oldBitmap; globalThis.Image = oldImage;
  }
});
