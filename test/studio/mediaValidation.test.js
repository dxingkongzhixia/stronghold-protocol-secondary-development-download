// server/studio/mediaValidation.js — what the studio accepts as a PNG: the signature, IHDR, chunk order/CRC, the decoded
// size cap (256 MiB), the FX limits, and a real inflate + per-row filter check. Pure bytes; no server, no Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../server/plugins/zip.js';
import { PNG_RAW_BYTES, effectImages, validatePng } from '../../server/studio/mediaValidation.js';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = ({ w, h, depth = 8, color = 2, interlaced = 0 }) => {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(w, 0); d.writeUInt32BE(h, 4); d[8] = depth; d[9] = color; d[12] = interlaced;
  return d;
};
/** A valid PNG; `raw` overrides the scanlines (each row starts with its filter byte). */
function png({ w = 1, h = 1, depth = 8, color = 2, interlaced = 0, raw = null } = {}) {
  const stride = Math.ceil((w * depth * CHANNELS[color]) / 8) + 1;
  return Buffer.concat([SIG, chunk('IHDR', ihdr({ w, h, depth, color, interlaced })), chunk('IDAT', deflateSync(raw ?? Buffer.alloc(stride * h))), chunk('IEND', Buffer.alloc(0))]);
}
/** A header-only PNG (33 bytes): enough for the size check, no chunks after IHDR. */
const headerOnly = (o) => Buffer.concat([SIG, chunk('IHDR', ihdr(o))]);
const fails = (bytes, text, opts) => assert.throws(() => validatePng(bytes, 'a.png', opts), (e) => {
  assert.equal(e.code, 'PLUGIN_PART_SHAPE');
  assert.equal(e.status, 400);
  assert.match(String(e.params?.detail ?? e.message), new RegExp(text));
  return true;
});

test('validatePng: a plain RGB / RGBA / grey PNG is accepted', () => {
  validatePng(png({ w: 1, h: 1 }), 'a.png');
  validatePng(png({ w: 8, h: 4, color: 6 }), 'a.png');
  validatePng(png({ w: 3, h: 3, color: 0, depth: 8 }), 'a.png');
  validatePng(png({ w: 2, h: 2, depth: 16, color: 6 }), 'a.png');
});

test('validatePng: the signature and the IHDR are checked before anything else', () => {
  fails(Buffer.alloc(10), 'image must be PNG');
  fails(Buffer.concat([Buffer.from('not a png at all........'), Buffer.alloc(40)]), 'image must be PNG');
  fails(png({ w: 0, h: 1 }), 'invalid PNG header');
  fails(png({ w: 1, h: 0 }), 'invalid PNG header');
  fails(png({ w: 1, h: 1, depth: 4, color: 2 }), 'invalid PNG header', 'RGB has no 4-bit depth');
  const compressed = png({ w: 1, h: 1 });
  compressed[26] = 1; // a compression method other than 0
  fails(compressed, 'invalid PNG header');
});

test('validatePng: FX textures are 8-bit non-interlaced RGB/RGBA, at most 2048 square', () => {
  validatePng(png({ w: 2048, h: 1, color: 6 }), 'fx.png', { fx: true });
  validatePng(png({ w: 1, h: 1, color: 2 }), 'fx.png', { fx: true });
  fails(png({ w: 3000, h: 1, color: 6 }), 'effect texture', { fx: true });
  fails(png({ w: 2, h: 2, depth: 16, color: 6 }), 'effect texture', { fx: true });
  fails(png({ w: 2, h: 2, color: 0 }), 'effect texture', { fx: true }); // grey is not an effect texture
  fails(png({ w: 2, h: 2, color: 6, interlaced: 1 }), 'effect texture', { fx: true });
});

test('validatePng: the decoded size is capped at 256 MiB before any inflation', () => {
  assert.equal(PNG_RAW_BYTES, 256 * 1024 * 1024);
  fails(headerOnly({ w: 20000, h: 20000, color: 6 }), 'decoded PNG exceeds 256 MiB');
});

test('validatePng: chunk order, checksums, truncation and the end marker', () => {
  const good = png({ w: 2, h: 2 });
  const badCrc = Buffer.from(good); badCrc[29] ^= 0xff; // inside IHDR's CRC (8 signature + 4 len + 4 type + 13 data)
  fails(badCrc, 'PNG checksum mismatch');
  fails(good.subarray(0, good.length - 7), 'truncated PNG chunk');
  fails(Buffer.concat([good, Buffer.from([0, 0, 0, 0])]), 'invalid PNG end');
  const noData = Buffer.concat([SIG, chunk('IHDR', ihdr({ w: 1, h: 1 })), chunk('IEND', Buffer.alloc(0))]);
  fails(noData, 'incomplete PNG');
});

test('validatePng: the inflate must produce exactly the scanlines and every row filter must be 0–4', () => {
  const stride = Math.ceil((1 * 8 * 3) / 8) + 1; // RGB 1×1 = 4 bytes
  const short = Buffer.concat([SIG, chunk('IHDR', ihdr({ w: 1, h: 1 })), chunk('IDAT', deflateSync(Buffer.alloc(stride - 1))), chunk('IEND', Buffer.alloc(0))]);
  fails(short, 'invalid PNG pixel data');
  fails(png({ w: 1, h: 1, raw: Buffer.from([5, 0, 0, 0]) }), 'invalid PNG filter');
  validatePng(png({ w: 1, h: 1, raw: Buffer.from([4, 0, 0, 0]) }), 'a.png', 'filter 4 (Paeth) is legal');
});

test('effectImages: an overlay\'s flipbook images and its fx index textures, inline or through a file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-studio-media-'));
  const files = { stat: (id, rel) => ({ abs: path.join(dir, rel) }) };
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ assets: { fx: { flipbooks: { a: { image: 'ui/a.png' } } } } }));
  assert.deepEqual([...effectImages(files, 'p')], ['ui/a.png']);

  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ assets: 'assets.json' }));
  fs.writeFileSync(path.join(dir, 'assets.json'), JSON.stringify({ fx: { flipbooks: { b: { image: 'ui/b.png' } }, index: 'fx/index.json' } }));
  fs.mkdirSync(path.join(dir, 'fx'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'fx', 'index.json'), JSON.stringify({ textures: { t: { file: 'ui/c.png' } } }));
  assert.deepEqual([...effectImages(files, 'p')].sort(), ['ui/b.png', 'ui/c.png']);

  fs.writeFileSync(path.join(dir, 'plugin.json'), '{ broken');
  assert.equal(effectImages(files, 'p').size, 0, 'the folder checker reports a broken document');
});
