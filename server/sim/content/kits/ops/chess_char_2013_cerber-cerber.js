// server/sim/content/kits/ops/chess_char_2013_cerber-cerber.js — 刻俄柏 (char_2013_cerber) kit, tier 6 (custom:
// tools/build-data.mjs CUSTOM_CHESS, the bolivar roster). Like 谬因, her faithful kit already exists as her official
// 自选 kit (op-cerber.js): the shop body casts the same three skills from the same blackboards and reads the same
// talents / CCR-X module off the chess record, so this file only re-registers that builder under the chess base key.
// If a chess-only behaviour ever appears, fork the file. Kit contract: ../README.md; implementation: ./op-cerber.js.
import op from './op-cerber.js';

export default {
  chess_char_2013_cerber_a: op.char_2013_cerber,
};
