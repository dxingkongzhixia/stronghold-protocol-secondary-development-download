// server/match/showTags.js — the live numbers behind the official cards' {showtag_value_N} placeholders (规程 §37.201,
// ported from the mainline). 规程's tables write a running value into some texts — 定期存折 "装备时销毁，获得
// {showtag_value_1}资金（持有时每回合+1）", the 特质 of 风絮 / 可露希尔 / … "本回合每获得过一名干员…已获得
// {showtag_value_1}名", 安洁莉娜 "(已刷新{showtag_value_1}次)", 溯光星源 "(已消耗{showtag_value_1}资金)", 极光
// "【谢拉格】层数+{showtag_value_1}…", 忍冬 "获得{showtag_value_1}次免费刷新…" — that the client cannot know.
// The player's own piece views carry the values (player/views.js pieceView: `showTag` on an item, `garrisonTags` keyed by
// garrison id on an operator); records without such a text add nothing, so every other version's views stay as they were.
// Presentation only: never advances a counter. A shop card or a catalog entry shows the record's starting value
// (public/js/ui/showTags.js).

import { nextGarrisonUpgrade } from '../../shared/garrisonUpgrades.js';

const SHOW_TAG = /\{showtag_value_\d+\}/;

/** Does an official text carry a {showtag_value_N} placeholder? */
export const hasShowTag = (text) => typeof text === 'string' && SHOW_TAG.test(text);

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);

/**
 * An item piece's values: 定期存折 pays its `value` plus what it grew while held (the counter `passbook:<uid>`).
 * @param {any} ps PlayerState
 * @param {{ id: string, uid: number }} item
 * @returns {number[]|undefined}
 */
export function itemShowTags(ps, item) {
  const rec = ps.gd.item(item.id);
  if (!rec || !hasShowTag(rec.descRaw || rec.desc)) return undefined;
  if (Array.isArray(rec.buffs) && rec.buffs.some((b) => b && b.key === 'equip_destory_gain_coin')) {
    return [int(rec.params?.value) + int(ps.counters[`passbook:${item.uid}`])];
  }
  return undefined;
}

/**
 * One 特质's value, read the way its handler (server/sim/content/garrisons/meta.js) counts: the round's operators gained
 * (add_method round_gain_char), refreshes, funds spent, or what an upgrading 特质's next trigger grants. null: no value
 * known for that effect (the text keeps the record's starting value on the client).
 */
function garrisonValue(ps, piece, g) {
  const r = ps.round || {};
  switch (g.effectKey) {
    case 'SERVER_ADD_BOND_METHOD': return g.bbStr?.add_method === 'round_gain_char' ? int(r.gainedChess) : null;
    case 'SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER': return int(r.refreshes);
    case 'SERVER_ADD_BOND_ROUND_COIN_COST': return int(r.spent);
    case 'SERVER_GAIN_FREE_REFRESH_UPGRADE_COUNT': {
      // this fork's handler counts grants in `freeRefreshUpgrade:<piece uid>` and gives `delta_count` each time, at most
      // `max_count`; the card shows the next grant (the mainline's `upgradeGive` reading).
      const per = Math.max(1, int(g.bb?.delta_count ?? 1));
      const max = Math.max(0, int(g.bb?.max_count ?? 2));
      const used = int(ps.counters[`freeRefreshUpgrade:${piece.uid}`]);
      return Math.max(0, Math.min(per, max - used));
    }
    case 'SERVER_ADD_BOND_UPGRADE_LAYER': {
      const key = `garrison:upgrade:${ps.gd.baseIdOf(piece.id)}:${g.effectKey}`;
      return nextGarrisonUpgrade(g.bb || {}, { fired: ps.counters[key] || 0 });
    }
    default: return null;
  }
}

/**
 * An operator piece's 特质 values, keyed by garrison id.
 * @param {any} ps PlayerState
 * @param {{ id: string, uid?: number }} piece
 * @returns {Record<string, number[]>|undefined}
 */
export function garrisonShowTags(ps, piece) {
  const rec = ps.gd.chess(piece.id);
  if (!rec || !Array.isArray(rec.garrisonIds)) return undefined;
  let out;
  for (const gid of rec.garrisonIds) {
    const g = ps.gd.garrison(gid);
    if (!g || !hasShowTag(g.descRaw || g.desc)) continue;
    const v = garrisonValue(ps, piece, g);
    if (v == null) continue;
    (out ||= {})[gid] = [v];
  }
  return out;
}
