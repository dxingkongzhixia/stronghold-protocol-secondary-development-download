// server/sim/content/kits/ops/chess_char_4229_aphris-aphris.js — 谬因 (char_4229_aphris) kit, tier 6 (custom:
// tools/build-data.mjs CUSTOM_CHESS). She is the first custom operator whose faithful kit already existed as her official
// 自选 kit (op-aphris.js): the shop body and the 自选 body cast the same three skills from the same blackboards, read the
// same talents and the BLA-Y module off the chess record, so this file only re-registers that builder under the chess
// base key instead of keeping a second, divergent implementation. If a chess-only behaviour ever appears, fork the file.
// Kit contract: ../README.md; the 自选 implementation and its sources: ./op-aphris.js.
import op from './op-aphris.js';

export default {
  chess_char_4229_aphris_a: op.char_4229_aphris,
};
