// Shared enums & constants (server + browser). Pure ESM, no Node APIs.

import { N_ } from './i18n.js';

export const PROTOCOL_VERSION = 1;
/** Release version shown to players (title screen, server banner, /healthz). Kept equal to package.json "version"
 * (test/version.test.js); PROTOCOL_VERSION above is the separate wire-format number. */
export const APP_VERSION = '0.4.0';
/** A development build (the public `dev` branch): the title screen, the boot banner and the README say so, and
 * tools/package.mjs refuses to build a release zip from it without --allow-dev. */
export const DEV_BUILD = /-dev$/.test(APP_VERSION);

export const MAX_SEATS = 4;
/**
 * Spectator seats of a co-op room (community report #26, owner's decision 2026-10-04) — a remake feature: the official
 * room has 1–4 players and no spectator seat (there only eliminated players and 联防 bystanders watch, research 09 §3.1).
 * A spectator never counts as a player, may not act, and watches like an eliminated player (server/lobby.js spectate,
 * server/match/match/watch.js addSpectator).
 */
export const MAX_SPECTATORS = 2;
export const ROOM_CODE_LEN = 4;
export const NAME_MAX_LEN = 12;

export const DIFFICULTIES = ['FUNNY', 'NORMAL', 'HARD', 'ABYSS'];
export const DIFFICULTY_NAMES = { FUNNY: N_('标准模拟'), NORMAL: N_('险境模拟'), HARD: N_('绝境模拟'), ABYSS: N_('终极模拟') };
export const DIFFICULTY_COLORS = { FUNNY: '#f6a329', NORMAL: '#e85a1a', HARD: '#e73118', ABYSS: '#ff0024' };

// modeId in data/config.json = `mode_${type}_${difficulty.toLowerCase()}` with type single|multi
export const modeIdFor = (roomMode, difficulty) =>
  `mode_${roomMode === 'solo' ? 'single' : 'multi'}_${difficulty.toLowerCase()}`;

export const PHASE = Object.freeze({
  LOBBY: 'LOBBY',
  INFO_CHECK: 'INFO_CHECK',
  BAND_DRAFT: 'BAND_DRAFT',
  BATTLE_CHECK: 'BATTLE_CHECK',
  ROUND_START: 'ROUND_START',
  SP_DRAFT: 'SP_DRAFT',
  PREP: 'PREP',
  COMBAT: 'COMBAT',
  UNITE: 'UNITE',
  SETTLE: 'SETTLE',
  FINAL_ASSAULT: 'FINAL_ASSAULT',
  HIDDEN_CORE: 'HIDDEN_CORE',
  RESULT: 'RESULT',
});

export const PHASE_NAMES = {
  LOBBY: N_('等待中'), INFO_CHECK: N_('确认本局信息'), BAND_DRAFT: N_('选择策略'), BATTLE_CHECK: N_('协议启动'),
  ROUND_START: N_('回合开始'), SP_DRAFT: N_('机变阶段'), PREP: N_('休整期'), COMBAT: N_('作战中'), UNITE: N_('联防阶段'),
  SETTLE: N_('结算'), FINAL_ASSAULT: N_('最终攻势'), HIDDEN_CORE: N_('隐秘核心'), RESULT: N_('模拟结束'),
};

// Board geometry on the 19x21 stage grid (row 0 = bottom). See DESIGN §3.
export const GEO = Object.freeze({
  ROWS: 19, COLS: 21,
  FIELD: { r0: 9, r1: 12, c0: 2, c1: 10 },        // own deployable board region
  NORMAL_RECT: { r0: 9, r1: 12, c0: 0, c1: 10 },  // simulation rect for a normal battle
  UNITE_RECT: { r0: 9, r1: 12, c0: 0, c1: 20 },
  BOSS_RECT: { r0: 0, r1: 5, c0: 0, c1: 20 },
  HAND_ROW: 7, HAND_SIZE: 10,                      // hand slot idx = col 0..9
  TEMP_ROW: 8, TEMP_C0: 4, TEMP_SIZE: 5,           // temp slot idx 0..4 = cols 4..8
  PARTNER_COL_OFFSET: 8,
});

export const AREA = Object.freeze({ BOARD: 'board', HAND: 'hand', TEMP: 'temp', OUTSIDE: 'outside' });

export const PIECE_KIND = Object.freeze({ CHESS: 'chess', ITEM: 'item', TOKEN: 'token' });

/**
 * Whether the placed piece of a skill's summon (赫默's 医疗探机, 巫恋's 诅咒娃娃) also deploys once, for free, at the
 * battle start. true = the PRTS reading (卫戍协议/帮助 §作战阶段: "所有手动部署的召唤物，无视所属干员的持有状态…作战开始时
 * 立即部署一次", example 赫默's drone), settled by the user on 2026-10-01 after playtest #6 (DESIGN §20); false = the
 * playtest #4 reading ("是赫默开技能释放一次，不是开局直接就部署了"): it takes its tile only when the owner's skill gives one.
 * Either way the piece re-appears on its tile each time the owner's skill gives one.
 * One switch for everything that depends on it: the sim (server/sim/content/tokens.js dockSkillSummons) and the summon
 * card's hint (public/js/ui/detailPanel.js summonDeployHint). docs/PLAYING.md §4 and docs/SIM.md (token pieces) state
 * the rule in prose — test/ui/playtest6_summons.test.js fails until they match the value.
 */
export const SKILL_SUMMON_START_DEPLOY = true;

/**
 * Official per-bond layer cap (docs/research/11-limits-official.md §1): the client's
 * `Torappu.Battle.AutoChessBattleConst.MAX_GARRISON_STACK = 999`, and its bond counter (`AddBondCount`) stores
 * `min(L + n, 999)` — each bond stops at 999 on its own; the community reports bonds sitting at 999 while fed (巴哈姆特
 * 12534 "每把都能999层", 12316 "999謝"; research 02 §layers). The only implementation of the cap (DESIGN §20.12). Every
 * writer of a bond's layers goes through `layerGainRoom`: the prep-side gains (server/match/player/economy.js addLayers —
 * 特质, items, bands, 机变 cards, bonds), the settle of the in-battle gains (server/match/match/settle.js) and the live in-battle
 * copy (server/sim/battle/economy.js addLayers, as the client's AddBondCount) — and the dev tools' direct writes (tools/matchrun.mjs
 * --layers, tools/balance.mjs applyBoard); a gain at the cap adds 0 (no onLayers, no 'layer'
 * event), and the client-result check (server/match/fields.js) bounds a reported gain by the room left. Milestones paid
 * per N layers (远见, 奇迹, 维多利亚 …) stop with the count. 0 / Infinity = no cap.
 */
export const BOND_LAYER_CAP = 999;

/**
 * The layers a gain of `n` actually adds to a bond holding `before` under BOND_LAYER_CAP: min(n, cap − before), never
 * negative (a count already at or over the cap gains 0 and is never lowered); 0 for a non-positive / non-finite `n`
 * except +Infinity (= "the room left").
 */
export function layerGainRoom(before, n) {
  if (!(n > 0)) return 0;
  const cap = BOND_LAYER_CAP > 0 ? BOND_LAYER_CAP : Infinity;
  const b = Number.isFinite(before) && before > 0 ? before : 0;
  return Math.max(0, Math.min(n, cap - b));
}

/**
 * Official boss-hit limit "限伤" (docs/research/11-limits-official.md §2): `AutoChessBattleConst.MAX_BATTLE_DAMAGE =
 * 300000`. In a boss battle outside training — our battle kinds 'boss' (Final Assault) and 'hidden' (Hidden Core) — a
 * single hit on a leader (`AutoChessBattleUtil.IsBossEnemy`: an enemyId of activity_table autoChessData.bossInfoDict
 * = data/bosses.json `enemyKey`; in the sim the tag-'boss' units: those leaders and their mirrored copies, never parts,
 * escorts or drones) whose `ceil(final damage)` ≥ this is CANCELLED: 0 damage, nothing credited to the shared pool
 * (`AutoChessStepModeManager._OnBossEnemyTakeDamage` → `modifier.Cancel()`). It is not a clamp: a hit of 299999 lands.
 * Checked in server/sim/damage.js (dealDamage after DEF / RES and every multiplier, before shields; Battle.loseHp — not
 * the 胄 drone link's pool share, `noHitLimit`, DESIGN §25.13.4). Minions, normal rounds and 联防 are unaffected.
 * 0 / Infinity = off.
 */
export const BOSS_HIT_LIMIT = 300000;

/**
 * OUR difficulty layer (owner 2026-10-16 — docs/BALANCE.md §8, docs/MATCHMAKING.md §47). The official tables stay the
 * BASE and this is a deliberate fork-only bump layered on top of them, because the owner wants the mid game and the
 * leaders harder than the official data alone gives:
 *   * enemies of round ≥ BOOST_FROM_ROUND: max HP × ENEMY_BOOST_HP, ATK × ENEMY_BOOST_ATK (DEF / RES / speed untouched);
 *   * leaders: the shared pool × BOSS_BOOST_HP, their own ATK / DEF / RES × BOSS_BOOST_* — and their parts and
 *     mid-fight summons take the same leader rate (they read the boss field's scale).
 * The 8 formal modes only (`mode.inScope`; 入门协议 stays official). data/tuning.json `boost` carries the live numbers
 * and can switch the layer off (`enabled: false`) or restore the official numbers (every factor 1); these are the
 * built-in defaults when the file has no `boost` block. grep 'boostActive' for the live switch.
 */
export const BOOST_FROM_ROUND = 5;
export const ENEMY_BOOST_HP = 1.3;
export const ENEMY_BOOST_ATK = 1.3;
export const BOSS_BOOST_HP = 1.4;
export const BOSS_BOOST_ATK = 1.4;
export const BOSS_BOOST_DEF = 1.4;
export const BOSS_BOOST_RES = 1.4;

// Snapshot unit flag bits (DESIGN §8.2)
export const UF = Object.freeze({
  BLOCKED: 1, STUNNED: 2, FROZEN: 4, STEALTH: 8, SKILL: 16, SHIELD: 32, INVULN: 64, COLD: 128, SLEEP: 256, FLYING: 512,
});

export const ANIM = Object.freeze({ IDLE: 0, MOVE: 1, ATTACK: 2, SKILL: 3, DIE: 4, STUN: 5, DEPLOY: 6 });

export const ERR = Object.freeze({
  BAD_MSG: 'BAD_MSG',             // malformed / unknown message
  SESSION_IN_USE: 'SESSION_IN_USE', // a local recovery candidate cannot replace the connected holder
  RATE: 'RATE',                   // rate limited
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_STARTED: 'ROOM_STARTED',
  NOT_HOST: 'NOT_HOST',
  NOT_READY: 'NOT_READY',
  WRONG_PHASE: 'WRONG_PHASE',
  NO_FUNDS: 'NO_FUNDS',
  HAND_FULL: 'HAND_FULL',
  BOARD_FULL: 'BOARD_FULL',
  BAD_TILE: 'BAD_TILE',
  BAD_TARGET: 'BAD_TARGET',
  SOLD_OUT: 'SOLD_OUT',
  MAX_LEVEL: 'MAX_LEVEL',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  ALREADY: 'ALREADY',
  TEMP_NOT_EMPTY: 'TEMP_NOT_EMPTY',
  ELIMINATED: 'ELIMINATED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',     // 野排 requires a logged-in account
  BAD_NAME: 'BAD_NAME',               // registration name length / characters
  BAD_PASSWORD: 'BAD_PASSWORD',       // too short / too long
  NAME_TAKEN: 'NAME_TAKEN',           // the display name is already registered
  BAD_CREDENTIALS: 'BAD_CREDENTIALS', // wrong name or password
  SESSION_EXPIRED: 'SESSION_EXPIRED', // the stored account session is gone
  IN_QUEUE: 'IN_QUEUE',               // already queueing for a 野排 match
  NOT_QUEUED: 'NOT_QUEUED',
  SPECTATOR: 'SPECTATOR',         // a spectator seat only watches (MAX_SPECTATORS)
  BAD_REPORT: 'BAD_REPORT',       // a bug report's title / body failed validation (server/community.js)
  BAD_STATS: 'BAD_STATS',         // a match record failed normalization (server/stats.js)
  BAD_IMAGE: 'BAD_IMAGE',         // an attached image is missing / too large / not a supported raster type
  BAD_CHAT: 'BAD_CHAT',           // a room chat message is empty / only control characters / too long
  INTERNAL: 'INTERNAL',
});

export const ERR_TEXT = {
  SESSION_IN_USE: N_('此对局仍在其他窗口中，或当前浏览器无法安全恢复。请关闭原窗口后重试。'),
  BAD_MSG: N_('无效的请求'), RATE: N_('操作过于频繁'), NOT_IN_ROOM: N_('你不在房间中'), ROOM_NOT_FOUND: N_('未找到该同盟密钥对应的房间'),
  ROOM_FULL: N_('房间已满'), ROOM_STARTED: N_('模拟已开始'), NOT_HOST: N_('只有房主可以操作'), NOT_READY: N_('仍有玩家未就绪'),
  WRONG_PHASE: N_('当前阶段无法进行该操作'), NO_FUNDS: N_('资金不足'), HAND_FULL: N_('整备区已满'), BOARD_FULL: N_('已达到部署上限'),
  BAD_TILE: N_('无法部署在该位置'), BAD_TARGET: N_('无效的目标'), SOLD_OUT: N_('已售出'), MAX_LEVEL: N_('调度中心已达最高等级'),
  NOT_YOUR_TURN: N_('尚未轮到你'), ALREADY: N_('已完成该操作'), TEMP_NOT_EMPTY: N_('临时整备区不为空'), ELIMINATED: N_('你已被淘汰'),
  AUTH_REQUIRED: N_('搜寻队友需要先登录账号'), BAD_NAME: N_('代号需 2–12 个字符'), BAD_PASSWORD: N_('密码至少 6 位'),
  NAME_TAKEN: N_('该代号已被使用'), BAD_CREDENTIALS: N_('代号或密码错误'), SESSION_EXPIRED: N_('登录已过期，请重新登录'),
  IN_QUEUE: N_('你已在搜寻队列中'), NOT_QUEUED: N_('你不在搜寻队列中'),
  SPECTATOR: N_('观战中无法进行该操作'), BAD_REPORT: N_('反馈内容为空或过长'),
  BAD_STATS: N_('对局记录无效'),
  BAD_IMAGE: N_('图片无效：仅支持 PNG / JPG / WebP，且不要超过大小限制'), INTERNAL: N_('服务器内部错误'),
  BAD_CHAT: N_('发言内容无效'),
};

// ---- Emotes (交流, research 09 §4) -----------------------------------------------------------------------------
// The 36 official in-match emotes: display_meta_table emoticonData, scene AUTOCHESS_BATTLE, 6 themes × 6, one wheel
// page per theme in activity_table autoChessData.enabledEmoticonThemeIdList order, emotes by sortId. `g.emote { id }`
// / `m.emote { playerId, id }` carry the official emoji id. Generated reference: data/emotes.json
// (tools/build-emotes.mjs); test/ui/emotes.test.js keeps this table identical to it.
// Official emotes have no text (desc is null): `label` is ours and only ever an aria-label, never displayed.
// Art: extracted from a local client (tools/local-extract) to /assets/local/emoticon/<dir>/<picId>.png and listed in
// data/local-assets.json group `emoticon/<dir>`; also downloaded from the public mirror by tools/fetch-assets.mjs
// (tools/assets/plan.mjs UI_EXTRAS → data/assets.json ui['emoticon/<dir>/<picId>'], GitHub issue #42). The UI takes the
// local picture first, then the mirror copy, and shows a neutral glyph when neither is there. The picId is not
// derived from the id (autochess_battle_fooldoctor_03…06 → pic_fooldoctor_04/05/06/08_battle).
const emo = (id, sortId, picId, label) => Object.freeze({ id, sortId, picId, label });
export const EMOTE_THEMES = Object.freeze([
  { themeId: 'emoticon_autochess_basic', dir: 'basic', sortId: 100000, isBasic: true, name: N_('表情套组：卫戍协议'), emotes: [
    emo('autochess_battle_happy', 1001, 'pic_happy_battle', N_('开心')),
    emo('autochess_battle_scared', 1002, 'pic_scared_battle', N_('害怕')),
    emo('autochess_battle_sorry', 1003, 'pic_sorry_battle', N_('对不起')),
    emo('autochess_battle_thanks', 1004, 'pic_thanks_battle', N_('谢谢')),
    emo('autochess_battle_thinking', 1005, 'pic_thinking_battle', N_('思考')),
    emo('autochess_battle_nice_cooperate', 1006, 'pic_cooperate_battle', N_('合作愉快')),
  ] },
  { themeId: 'emoticon_originium_slug', dir: 'slug', sortId: 1001, isBasic: false, name: N_('表情套组：虫动'), emotes: [
    emo('slug_autochess_battle_nice_work', 2001, 'pic_nice_work_battle', N_('合作愉快！')),
    emo('slug_autochess_battle_thanks', 2002, 'pic_thanks_battle', N_('谢谢！')),
    emo('slug_autochess_battle_sorry', 2003, 'pic_sorry_battle', N_('对不起！')),
    emo('slug_autochess_battle_bye', 2004, 'pic_bye_battle', N_('再见！')),
    emo('slug_autochess_battle_distrust', 2005, 'pic_distrust_battle', '？？？'),
    emo('slug_autochess_battle_very_soon', 2006, 'pic_very_soon_battle', N_('很快就好！')),
  ] },
  { themeId: 'emoticon_autochess_basic_2', dir: 'basic_2', sortId: 100001, isBasic: true, name: N_('表情套组：卫戍协议'), emotes: [
    emo('autochess_battle_noproblem', 1007, 'pic_noproblem_battle', N_('没问题！')),
    emo('autochess_battle_respect', 1008, 'pic_respect_battle', N_('敬礼！')),
    emo('autochess_battle_call', 1009, 'pic_call_battle', N_('欢呼！')),
    emo('autochess_battle_playingcool', 1010, 'pic_playingcool_battle', N_('酷！')),
    emo('autochess_battle_sad', 1011, 'pic_sad_battle', N_('伤心')),
    emo('autochess_battle_dying', 1012, 'pic_dying_battle', N_('快死了')),
  ] },
  { themeId: 'emoticon_foolsday_doctor', dir: 'fooldoctor', sortId: 1002, isBasic: false, name: N_('表情套组：博士士'), emotes: [
    emo('autochess_battle_fooldoctor_01', 1020, 'pic_fooldoctor_01_battle', N_('博士士 1')),
    emo('autochess_battle_fooldoctor_02', 1021, 'pic_fooldoctor_02_battle', N_('博士士 2')),
    emo('autochess_battle_fooldoctor_03', 1022, 'pic_fooldoctor_04_battle', N_('博士士 3')),
    emo('autochess_battle_fooldoctor_04', 1023, 'pic_fooldoctor_05_battle', N_('博士士 4')),
    emo('autochess_battle_fooldoctor_05', 1024, 'pic_fooldoctor_06_battle', N_('博士士 5')),
    emo('autochess_battle_fooldoctor_06', 1025, 'pic_fooldoctor_08_battle', N_('博士士 6')),
  ] },
  { themeId: 'emoticon_foolsday_amiya', dir: 'foolamiya', sortId: 1003, isBasic: false, name: N_('表情套组：米米子'), emotes: [
    emo('autochess_battle_foolamiya_01', 1040, 'pic_foolamiya_01_battle', N_('米米子 1')),
    emo('autochess_battle_foolamiya_02', 1041, 'pic_foolamiya_02_battle', N_('米米子 2')),
    emo('autochess_battle_foolamiya_03', 1042, 'pic_foolamiya_03_battle', N_('米米子 3')),
    emo('autochess_battle_foolamiya_04', 1043, 'pic_foolamiya_04_battle', N_('米米子 4')),
    emo('autochess_battle_foolamiya_05', 1044, 'pic_foolamiya_05_battle', N_('米米子 5')),
    emo('autochess_battle_foolamiya_06', 1045, 'pic_foolamiya_06_battle', N_('米米子 6')),
  ] },
  { themeId: 'emoticon_foolsday_wisdel', dir: 'foolwisdel', sortId: 1004, isBasic: false, name: N_('表情套组：维维美'), emotes: [
    emo('autochess_battle_foolwisdel_01', 1060, 'pic_foolwisdel_01_battle', N_('维维美 1')),
    emo('autochess_battle_foolwisdel_02', 1061, 'pic_foolwisdel_02_battle', N_('维维美 2')),
    emo('autochess_battle_foolwisdel_03', 1062, 'pic_foolwisdel_03_battle', N_('维维美 3')),
    emo('autochess_battle_foolwisdel_04', 1063, 'pic_foolwisdel_04_battle', N_('维维美 4')),
    emo('autochess_battle_foolwisdel_05', 1064, 'pic_foolwisdel_05_battle', N_('维维美 5')),
    emo('autochess_battle_foolwisdel_06', 1065, 'pic_foolwisdel_06_battle', N_('维维美 6')),
  ] },
].map((t) => Object.freeze({ ...t, emotes: Object.freeze(t.emotes) })));
/** Every emote with its theme: `{ id, sortId, picId, label, themeId, dir }`, in wheel order. */
export const EMOTE_CATALOG = Object.freeze(EMOTE_THEMES.flatMap((t) => t.emotes.map((e) => Object.freeze({ ...e, themeId: t.themeId, dir: t.dir }))));
/** The 36 official emote ids (protocol whitelist: `EMOTES.includes(id)`). */
export const EMOTES = Object.freeze(EMOTE_CATALOG.map((e) => e.id));
const EMOTE_INDEX = new Map(EMOTE_CATALOG.map((e) => [e.id, e]));
/** Catalog record of an emote id, or null (safe for any input, including '__proto__'). */
export const emoteInfo = (id) => (typeof id === 'string' && EMOTE_INDEX.get(id)) || null;
// id-keyed maps without a prototype: a wire id like '__proto__' / 'toString' looks up undefined, never an Object method
const emoteMap = (pick) => Object.freeze(Object.assign(Object.create(null), Object.fromEntries(EMOTE_CATALOG.map((e) => [e.id, pick(e)]))));
/** Emote id → theme id. */
export const EMOTE_THEME = emoteMap((e) => e.themeId);
/** Emote id → our aria-label (never displayed). */
export const EMOTE_LABEL = emoteMap((e) => e.label);
/** data/local-assets.json group of an emote's art (`emoticon/<dir>`), or null. */
export const emoteArtGroup = (id) => { const e = emoteInfo(id); return e ? `emoticon/${e.dir}` : null; };
/** Canonical URL of an emote's extracted art (`/assets/local/emoticon/<dir>/<picId>.png`), or null for unknown ids. */
export const emoteArtPath = (id) => { const e = emoteInfo(id); return e ? `/assets/local/emoticon/${e.dir}/${e.picId}.png` : null; };
export const EMOTE_COOLDOWN_MS = 1000; // activity_table autoChessData.constData.chatCD (s)

/**
 * 分血救援 (revive, owner 2026-10-17; retuned the same day: 1 LP is enough, one point per rescuer). In co-op
 * (同盟 / 野排) a teammate's 目标生命值 hitting 0 no longer eliminates him while another human can still fight: he is
 * DOWNED (board/hand/funds frozen, spectating) and a living teammate hands over ONE of his own LP in 休整期; that single
 * point revives him on the spot with LP 1.
 *  - DONATE     LP one survivor hands over per press
 *  - NEED       the pool a rescue needs (one point: any living teammate can bring him back)
 *  - MAX        rescues per player in one match (the same player can be rescued twice, never more)
 *  - FLOOR      a donor's LP never drops below this (no suicide gifts)
 *  - PER_TARGET each living teammate may give at most this much to the SAME downed teammate per downing
 * No rescue once the Final Assault starts (its `teamLp` pool is a snapshot), and bots never down (golden neutrality).
 */
export const REVIVE = Object.freeze({ DONATE: 1, NEED: 1, MAX: 2, FLOOR: 5, PER_TARGET: 1 });
export const EMOTE_BUBBLE_MS = 3000;   // constData.chatTime (s): how long a bubble stays up

// ---- ours: room text chat (同盟等待室 + 局内, 2026-10-09) ------------------------------------------------
// `room.chat { text }` — the lobby validates it (length cap, control-char stripping, per-session rate limit) and
// broadcasts `m.chat { from, name, text, at }` to EVERY member of the room (seats + spectators) in the waiting lobby
// AND while the room's match runs (room-scoped, never leaking to another room or a match one is not in). The client
// shows it as a TRANSIENT speech bubble over the sender's seat / player row for CHAT_BUBBLE_MS — no log, no history.
// Plain text only: the client renders it as text (never innerHTML). NEVER persisted (see server/lobby.js).
export const CHAT_MAX = 100;                  // characters of one message (UTF-16 units, like NAME_MAX_LEN)
export const CHAT_RATE_WINDOW_MS = 10_000;    // per-session sliding window
export const CHAT_RATE_LIMIT = 5;             // messages per session per window
export const CHAT_BUBBLE_MS = 5000;           // how long a chat speech bubble stays before fading (client-side)

// ---- ours: account (auth) limits -- kept through the upstream (feedback5) i18n merge ----
export const AUTH_NAME_MIN = 2;
export const AUTH_NAME_MAX = NAME_MAX_LEN;
export const AUTH_PASS_MIN = 6;
export const AUTH_PASS_MAX = 128;
// operator notices (server/lobby.js `broadcastNotice`, the admin page's 通知 panel): a broadcast pushed to the live
// sessions and kept in a short history. A deploy / restart should announce itself this way (signed `d星空之下`).
export const NOTICE_MAX_LEN = 300;
export const NOTICE_HISTORY = 20;
// ---- ours: player bug reports + changelog (server/community.js) ------------------------------------------------
// The lobby's 更新日志 / bug提交 / 公开房间 panels. A bug report is TEXT + at most BUG_IMAGES_MAX raster images
// (no replay / seed / room data): the images live on disk under `var/bug-uploads/` (git-ignored, never statically
// served) and the DB holds only path + mime + byte count + uploader + time. The mime is sniffed from the bytes, never
// the filename (png / jpeg / webp only — no svg / html). Rate limits are per account (or, for a guest, per network).
export const BUG_TITLE_MAX = 80;
export const BUG_BODY_MAX = 2000;
export const BUG_IMAGES_MAX = 4;
export const BUG_IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB per image, enforced while reading the body
export const BUG_IMAGE_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
export const BUG_RATE_WINDOW_MS = 30 * 60 * 1000;
export const BUG_REPORT_LIMIT = 5;  // reports per window per account / guest network
export const BUG_UPLOAD_LIMIT = 20; // image uploads per window per account / guest network (≤4 per report)
export const BUG_STATUSES = Object.freeze(['new', 'triaged', 'fixed']);
/** Status labels of the admin page (`t()` where shown; the server sends the key, the page its label). */
export const BUG_STATUS_NAMES = Object.freeze({ new: N_('待处理'), triaged: N_('已受理'), fixed: N_('已修复') });
/** The changelog panel shows the newest CHANGELOG_LIMIT versions (seeded once from the repo's CHANGELOG.md). */
export const CHANGELOG_LIMIT = 50;
export const CHANGELOG_BODY_MAX = 20000;
/** The concise gist the changelog panel shows by default — the full `body` stays one tap away (server/community.js). */
export const CHANGELOG_SUMMARY_MAX = 120;
/** Where a changelog row came from: a seeded release (CHANGELOG.md) or a pushed operator notice (the minor log). */
export const CHANGELOG_SOURCES = Object.freeze(['release', 'notice']);

// account roles (accounts.role, server/auth.js): a SHORT one-character badge shown next to the name everywhere it
// appears — 管 (管理员) / 开 (开发者) — with the full name in the badge's tooltip. `null` = an ordinary account.
// Assigned with `node tools/role.mjs <代号> <admin|dev>`.
export const ROLES = Object.freeze({ admin: N_('管'), dev: N_('开') });
/** The full role name (the badge's tooltip, the admin page's 身份 column). */
export const ROLE_NAMES = Object.freeze({ admin: N_('管理员'), dev: N_('开发者') });
/** The short badge text of a role, or null for null/unknown values (an unknown role is simply not shown). */
export const roleLabel = (role) => (typeof role === 'string' && ROLES[role]) || null;
/** The full name of a role, or null for null/unknown values. */
export const roleName = (role) => (typeof role === 'string' && ROLE_NAMES[role]) || null;
// matchmaking (server/matchmaker.js): the shared pool of 野排 (搜寻队友)
export const MM_WINDOW_MS = 300_000;  // one pool window (owner 2026-10-11: up to 5 min); < 4 gathered by then ⇒ AI fills the alliance
export const MM_SEATS = 4;
// presence (server/net.js presenceOnline): a LOGGED-IN session stays "online" this long after its socket drops (a
// reload / brief blip), then goes offline. Guests (no account) go offline the moment their socket closes.
export const PRESENCE_GRACE_MS = 5 * 60 * 1000;

// ---- ours: match statistics (server/stats.js, shared/stats.js, public/js/ui/stats.js) ---------------------------
// Every finished match is one normalized record (`shared/stats.js`). The RECORD SCHEMA and the mainline *rules* are
// upstream PR #323's: keep the newest `maxRecords` per owner, keep full rows (lineups / bonds / teammates) for only the
// newest `fullKeep`, and stay under a per-owner `maxChars` JSON budget (oldest pruned first). WE store these records
// on the accounts SQLite, tied to an owner (a registered player's account, else the guest's session identity), keep
// exactly 2× those caps so one server-side history is worth roughly two upstream clients', and let online players read
// each other's public record list. The client mirrors the same numbers (public/js/ui/stats.js derives its MAX_RECORDS /
// FULL_KEEP / MAX_CHARS from here), so the local fallback and the server enforce one set of rules.
export const STATS_MAINLINE = Object.freeze({ maxRecords: 1000, fullKeep: 30, maxChars: 800_000 });
/** Ours = 2 × the mainline caps (owner decision): 1000→2000, 30→60, 800_000→1_600_000. */
export const STATS_SCALE = 2;
export const STATS_MAX_RECORDS = STATS_MAINLINE.maxRecords * STATS_SCALE;
export const STATS_FULL_KEEP = STATS_MAINLINE.fullKeep * STATS_SCALE;
export const STATS_MAX_CHARS = STATS_MAINLINE.maxChars * STATS_SCALE;
/** Largest export file the stats page reads (foreign / hand-made data: NOT scaled). */
export const STATS_IMPORT_MAX_CHARS = 8_000_000;
/** The most records one `stats.list` / `stats.view` answer carries (= the per-owner cap). */
export const STATS_LIST_LIMIT = STATS_MAX_RECORDS;
