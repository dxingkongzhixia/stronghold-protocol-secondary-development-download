// Lobby screen: pick 独立模拟 / 同盟模拟 and a difficulty (标准/险境/绝境/终极), create a room,
// or join one with a 同盟密钥 — as a player (加入同盟) or in one of its MAX_SPECTATORS
// spectator seats (观战: room.spectate, also while its match runs; community report #26, a remake feature — the
// official room has none). Shows connection status + ping. The top bar opens the read-only S.W.E.E.P.报告
// (screens/sweep.js: 盟约 / 策略 / 敌方资料 and the enemy codex).
//
// Difficulty descriptions come from data/config.json `modes[modeId]` when present, else from the
// official act2autochess `modeDataDict` texts embedded below (desc + effectDescList), so the
// screen is complete before data is generated. Rounds: solo 标准 = 9, everything else 14 (+R15
// hidden core on 险境+), per research 00-INDEX §2. Battlefield pool (`modes[].stages`): 标准 always
// plays 战场#01, 险境 draws one of 8, 绝境 / 终极 one of 7 (m01 excluded).
// Texts go through t() (docs/I18N.md); the module-level tables hold msgids (N_) translated where they are shown, the
// config.json mode texts come localized from data.js.

import { ResumeMatchButton } from '../ui/resumeMatch.js';
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, ROOM_CODE_LEN, MAX_SEATS, MAX_SPECTATORS, modeIdFor, ERR, roleName } from '../../../shared/constants.js';
import { html, Button, Icon, MicroLabel, Panel, TextField, PingPill, AvatarFrame, Tooltip, Spinner, DifficultyIcon, doctorNo, Tabs, RoleTag, confirmDialog } from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
import { openStats, openPlayerStats } from './stats.js';
import { SweepReport } from './sweep.js';
import { LoadoutButton } from './loadout.js';
import { SettingsButton } from '../ui/settings.js';
import { NoticesButton } from '../ui/notices.js';
import { openCodex } from '../ui/codex.js';
import { AccountDialog } from '../ui/account.js';
import { ChangelogOverlay } from '../ui/community.js';
import { PublicRoomsScreen } from './rooms.js';
import { net, identity } from '../net.js';
import { store, useStore, shallowEqual, loadPref, savePref, setRoomsReturn, consumeRoomsReturn, setOnlineOpen, setOnlineFilter, setOnlineStatsReturn } from '../store.js';
import { getConfig, getMode, getStage, useData } from '../data.js';
import { t, tc, N_ } from '../../../shared/i18n.js';

/** Official mode texts (activity_table act2autochess.modeDataDict), fallback when config.json is absent. */
export const MODE_TEXT = {
  single: {
    FUNNY: { code: 'AC-1', desc: N_('时长较短的模拟训练'), effects: [N_('可以快速完成作战'), N_('常规奖励')] },
    NORMAL: { code: 'AC-2', desc: N_('敌方攻击强度较高的模拟训练'), effects: [N_('可使用盟约数增加'), N_('大幅增加奖励')] },
    HARD: { code: 'AC-3', desc: N_('敌方攻击强度极高的模拟训练'), effects: [N_('作战环境困难'), N_('出现更加危险的敌人')] },
    ABYSS: { code: 'AC-4', desc: N_('敌方攻击强度到达极限的模拟训练'), effects: [N_('作战环境无比困难'), N_('出现极度危险的敌人')] },
  },
  multi: {
    FUNNY: { code: 'AC-1', desc: N_('敌方攻击强度较低的模拟训练'), effects: [N_('作战环境较为温和'), N_('常规奖励')] },
    NORMAL: { code: 'AC-2', desc: N_('敌方攻击强度较高的模拟训练'), effects: [N_('可使用盟约数增加'), N_('大幅增加奖励')] },
    HARD: { code: 'AC-3', desc: N_('敌方攻击强度极高的模拟训练'), effects: [N_('作战环境困难'), N_('出现更加危险的敌人')] },
    ABYSS: { code: 'AC-4', desc: N_('敌方攻击强度到达极限的模拟训练'), effects: [N_('作战环境无比困难'), N_('出现极度危险的敌人')] },
  },
};

/** Battlefield pool per difficulty when config.json is absent (the modes' `stages` lists; same for solo and co-op). */
export const STAGE_POOL = { FUNNY: ['act1autochess_m01'], NORMAL: 8, HARD: 7, ABYSS: 7 };

/**
 * Display name of a stage: stages.json when it is loaded, else derived from the id (act1 m0N → 战场#0N, act2 m0N → 战场#0(N+4)).
 * From the data name only its 战场#NN part (with a (上半) / (下半) mark) — 'Battlefield #NN (First Half)' in English.
 * @param {string} id e.g. 'act1autochess_m01'
 */
export function stageLabel(id) {
  const rec = getStage(id);
  if (rec && typeof rec.name === 'string' && rec.name) {
    const m = rec.name.match(/^(.*?#\d+(?:\s*[(（][^)）]*[)）])?)/);
    return m ? m[1] : rec.name.split(/\s+/)[0];
  }
  const m = String(id || '').match(/^act(\d)autochess_m(\d+)$/);
  return m ? t('战场#{no}', { no: String(Number(m[2]) + (m[1] === '2' ? 4 : 0)).padStart(2, '0') }) : '';
}

/**
 * The battlefield note of a difficulty (official wording): a single-stage pool is fixed ("战场固定为 战场#01"), a larger
 * one is drawn at random ("战场随机（共8张）").
 * @param {string[] | number | null | undefined} stages the mode's `stages` list (or a count)
 * @returns {string} '' when unknown
 */
export function stageNote(stages) {
  if (Array.isArray(stages)) {
    const ids = stages.filter((s) => typeof s === 'string' && s);
    if (ids.length === 1) { const name = stageLabel(ids[0]); return name ? t('战场固定为 {name}', { name }) : t('战场固定'); }
    return ids.length > 1 ? t('战场随机（共{n}张）', { n: ids.length }) : '';
  }
  return Number.isInteger(stages) && stages > 1 ? t('战场随机（共{stages}张）', { stages }) : '';
}

export const MODE_CARDS = [
  {
    id: 'solo', name: N_('独立模拟'), en: 'SOLO SIMULATION', icon: 'user',
    desc: N_('独自调配资金与干员，以自己的节奏完成整场模拟。'),
    points: [N_('1 名博士'), N_('休整期与机变阶段不限时')],
  },
  {
    id: 'coop', name: N_('同盟模拟'), en: 'ALLIANCE SIMULATION', icon: 'users',
    desc: N_('与至多 {n} 名博士组成同盟，共享干员池，联防协作抵御敌潮。'), params: { n: MAX_SEATS - 1 },
    points: [N_('1–{n} 名博士 · 可由 AI 队友补位'), N_('联防阶段 · 最终攻势合并生命值')], pointParams: { n: MAX_SEATS },
  },
  // 野排 (docs/MATCHMAKING.md): the third mode card is the matchmaker, not a room mode — it never creates a room.
  // Its bullets describe OUR rules (shared pool, AI backfill, an account is required), never the reference's wording.
  {
    id: 'mm', name: N_('同盟匹配'), en: 'ALLIANCE MATCHMAKING', icon: 'signal',
    desc: N_('单人进入共享池，自动匹配队友组成同盟。'),
    points: [N_('1 名博士 · 单人即可加入'), N_('最多 5 分钟 · 不足由 AI 队友补位')],
  },
];

/**
 * Text for a difficulty card, preferring data/config.json.
 * @param {'solo'|'coop'} roomMode
 * @param {string} difficulty
 * @returns {{ code: string, desc: string, effects: string[], rounds: number, hidden: boolean, stageNote: string }}
 */
export function difficultyInfo(roomMode, difficulty) {
  const fallback = MODE_TEXT[roomMode === 'solo' ? 'single' : 'multi'][difficulty] || { code: '', desc: '', effects: [] };
  // modeIdFor() lower-cases the difficulty: never call it with a value the server did not validate.
  const m = DIFFICULTIES.includes(difficulty) ? getMode(modeIdFor(roomMode, difficulty)) : null;
  const effects = Array.isArray(m?.effectDescList)
    ? m.effectDescList.map((e) => String(e).replace(/^[·•・･\s]+/, '')).filter(Boolean)
    : fallback.effects.map((e) => t(e));
  const rounds = Number.isFinite(m?.lastRound) ? m.lastRound : roomMode === 'solo' && difficulty === 'FUNNY' ? 9 : 14;
  return {
    code: typeof m?.code === 'string' ? m.code : fallback.code,
    desc: typeof m?.desc === 'string' ? m.desc : t(fallback.desc),
    effects,
    rounds,
    hidden: difficulty !== 'FUNNY',
    stageNote: stageNote(Array.isArray(m?.stages) && m.stages.length ? m.stages : STAGE_POOL[difficulty]),
  };
}

const CODE_RE = new RegExp(`^[A-Z0-9]{${ROOM_CODE_LEN}}$`);
/**
 * Normalise user input into a room code: accepts a pasted invite link (`…?room=ABCD`), keeps
 * upper-cased alphanumerics and clamps to the code length.
 * @param {string} v
 * @returns {string}
 */
export function normalizeCode(v) {
  let s = String(v ?? '');
  const m = s.match(/[?&]room=([A-Za-z0-9]+)/);
  if (m) s = m[1];
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN);
}

/**
 * A handler that Preact binds as `onClick=${fn}` receives the click EVENT as its first argument, and a default
 * parameter only applies to `undefined` — so `fn(c = code)` would normalise the event target into a nonsense code
 * (`String(el)` → `"[object HTMLElement]"` → "OBJE"). Only a string is ever a code; anything else falls back to the
 * input field. Returns null when neither yields a well-formed code.
 * @param {unknown} arg the argument a handler was called with
 * @param {string} field the current input-field value
 * @returns {string|null}
 */
export function codeArg(arg, field) {
  const k = normalizeCode(typeof arg === 'string' ? arg : field);
  return CODE_RE.test(k) ? k : null;
}

/**
 * Whether a room entry initiated from `source` remembers the 公开房间 origin, so an intentional leave returns there
 * (owner 2026-10-09; docs/MATCHMAKING.md §36.4). ONLY the 公开房间 screen itself passes `'rooms'`: 创建同盟, the 密钥
 * field, the inline 公开同盟 / 正在模拟 chips and the `?room=` deep link all keep today's plain-lobby behaviour.
 * @param {string|null|undefined} source
 * @returns {boolean}
 */
export function remembersRoomOrigin(source) {
  return source === 'rooms';
}

/**
 * Room code from a deep link query string (`?room=CODE`), or null when absent/malformed.
 * Accepts ROOM_CODE_LEN..ROOM_CODE_LEN+2 alphanumerics (the protocol's join limit).
 * @param {string} search e.g. location.search
 * @returns {string|null}
 */
export function parseRoomParam(search) {
  try {
    const raw = new URLSearchParams(search || '').get('room');
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(code)) return null;
    return code.length >= ROOM_CODE_LEN && code.length <= ROOM_CODE_LEN + 2 ? code : null;
  } catch {
    return null;
  }
}

const FALLBACK_TIPS = [
  N_('联合模拟在选择策略时可以进行一次跳过'),
  N_('调度中心即使冻结，依然可以主动刷新'),
  N_('两件同名装备可以合成一件更强力的装备'),
  N_('只有达成完美作战的队友可以进行联防'),
];
const TIP_ROTATE_MS = 5000; // matchingTipRotateInterval

/** Rotating tactical tips (config.json `tips`, weighted list of { tip, weight }). */
function TipsPanel() {
  const cfg = getConfig();
  const fallback = FALLBACK_TIPS.map((x) => t(x));
  const tips = Array.isArray(cfg?.tips)
    ? cfg.tips.map((x) => (typeof x === 'string' ? x : x?.tip)).filter((x) => typeof x === 'string' && x)
    : fallback;
  const list = tips.length ? tips : fallback;
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => i + 1), TIP_ROTATE_MS);
    return () => clearInterval(id);
  }, []);
  const i = ((idx % list.length) + list.length) % list.length;
  return html`<div class="tips brackets">
    <div class="tips__head">
      <${Icon} name="info" />
      <span>${t('作战提示')}</span>
      <${MicroLabel}>TACTICAL TIPS<//>
      <span class="tips__idx num">${String(i + 1).padStart(2, '0')}<span class="t-dim">/${String(list.length).padStart(2, '0')}</span></span>
      <button type="button" class="tips__nav" onClick=${() => setIdx(i - 1 + list.length)} aria-label=${t('上一条')}><${Icon} name="chevronLeft" /></button>
      <button type="button" class="tips__nav" onClick=${() => setIdx(i + 1)} aria-label=${t('下一条')}><${Icon} name="chevronRight" /></button>
    </div>
    <p key=${i} class="tips__text">${list[i]}</p>
  </div>`;
}

function ModeCard({ card, selected, onSelect }) {
  return html`<button type="button" class=${`mode-card brackets${selected ? ' is-selected' : ''}`} onClick=${() => onSelect(card.id)}
      aria-pressed=${selected ? 'true' : 'false'}>
    <span class="mode-card__bg" aria-hidden="true"></span>
    <span class="mode-card__icon"><${Icon} name=${card.icon} /></span>
    <span class="mode-card__text">
      <${MicroLabel} tone=${selected ? 'mint' : undefined}>${card.en}<//>
      <span class="mode-card__name">${t(card.name)}</span>
      <span class="mode-card__desc">${t(card.desc, card.params)}</span>
      <span class="mode-card__points">${card.points.map((p) => html`<span key=${p}>${t(p, card.pointParams)}</span>`)}</span>
    </span>
    <span class="mode-card__check" aria-hidden="true"><${Icon} name="check" />${t('已选定')}</span>
  </button>`;
}

function DifficultyCard({ roomMode, difficulty, selected, onSelect }) {
  const info = difficultyInfo(roomMode, difficulty);
  return html`<button type="button" class=${`diff-card${selected ? ' is-selected' : ''}`}
      style=${`--d-color:${DIFFICULTY_COLORS[difficulty]}`} onClick=${() => onSelect(difficulty)} aria-pressed=${selected ? 'true' : 'false'}>
    <span class="diff-card__bar" aria-hidden="true"></span>
    <span class="diff-card__head">
      <${DifficultyIcon} difficulty=${difficulty} class="diff-card__glyph" />
      <span class="diff-card__name">${t(DIFFICULTY_NAMES[difficulty])}</span>
      <span class="diff-card__code num">${info.code}</span>
      <span class="diff-card__meta">
        <span class="num">${info.rounds}</span> ${tc('rounds', '回合')}${info.hidden ? html`<span class="diff-card__hidden">${t('+ 隐秘核心')}</span>` : null}
      </span>
    </span>
    <span class="diff-card__desc">${info.desc}</span>
    <span class="diff-card__effects">${info.effects.map((e) => html`<span key=${e}>${e}</span>`)}${info.stageNote ? html`<span key="stage" class="diff-card__stage"><${Icon} name="rook" />${info.stageNote}</span>` : null}</span>
    <span class="diff-card__check" aria-hidden="true"><${Icon} name="check" /><span>${t('已选定')}</span></span>
  </button>`;
}

/** Lobby screen component. */
export function LobbyScreen() {
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  const auth = useStore((s) => s.auth, shallowEqual);
  const mm = useStore((s) => s.mm, shallowEqual);
  const testMode = useStore((s) => s.testMode === true);
  const [asTest, setAsTest] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  // 在线玩家 overlay: store-level (not local state) so opening a player's stats can pop back to it (ui.onlineOpen).
  const showOnline = useStore((s) => s.ui.onlineOpen);
  // 更新日志 / 公开房间 (ui/community.js): which community panel is open, or null. A pending 公开房间
  // return (ui.roomsReturn, set by this screen's own 加入 / 观战) opens the rooms view at once — consumed here, once.
  // (bug提交 left this top bar on 2026-10-11 — it is reached from the 设置 dialog now, ui/settings.js.)
  const [showCommunity, setShowCommunity] = useState(() => (consumeRoomsReturn() ? 'rooms' : null));
  useData('config');
  const [roomMode, setRoomMode] = useState(() => {
    const m = loadPref('lobby.mode', 'coop');
    return m === 'solo' || m === 'mm' ? m : 'coop';
  });
  const [difficulty, setDifficulty] = useState(() => {
    const d = loadPref('lobby.difficulty', 'FUNNY');
    return DIFFICULTIES.includes(d) ? d : 'FUNNY';
  });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  // 公开同盟 (lobby 03 → server /online/api `openRooms`): whether a new 同盟 room is listed publicly. Persisted.
  const [isPublic, setIsPublic] = useState(() => loadPref('lobby.public', true) !== false);
  const [sweepOpen, setSweepOpen] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false); // synchronous guard against double clicks (state updates are async)
  useEffect(() => () => { alive.current = false; }, []);

  const online = conn.status === 'online';
  const codeOk = CODE_RE.test(code);
  // 野排 rules for the room actions (owner 2026-10-11, docs/MATCHMAKING.md §16): while a queue is live the create-room
  // action is blocked; join-by-key stays available and leaves the pool (the helper says why). Recomputed per render, so
  // a mode switch can never leave a stale enabled 创建同盟 button.
  const entryPolicy = roomEntryPolicy(mm, roomMode);

  const pickMode = (m) => { setRoomMode(m); savePref('lobby.mode', m); };
  const pickDifficulty = (d) => { setDifficulty(d); savePref('lobby.difficulty', d); };
  const pickPublic = (v) => { const b = v === 'public'; setIsPublic(b); savePref('lobby.public', b); };

  const run = async (kind, fn) => {
    if (inFlight.current) return;
    if (!online) { toast(t('尚未连接到服务器，请稍候'), 'warn'); return; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };
  const create = () => {
    // The button is disabled while blocked, but a keyboard activation or a stale click must not slip through either.
    if (entryPolicy.blocked) { if (entryPolicy.reason) toast(entryPolicy.reason, 'warn'); return; }
    run('create', () => net.request('room.create', { mode: roomMode, difficulty, public: isPublic, ...(testMode && asTest ? { test: true } : {}) }));
  };
  /** Test rooms need an explicit acknowledgement before any seat or private state is sent. */
  const joinRequest = (type, k) => net.request(type, { code: k }).catch((err) => {
    if (err?.code !== ERR.TEST_CONFIRM) throw err;
    return confirmDialog({ title: t('测试房间'), text: t('这是测试房间，不计入任何记录。确认加入？'), okText: t('加入') })
      .then((ok) => { if (!ok) throw err; return net.request(type, { code: k, testAck: true }); });
  });
  // 野排 (docs/MATCHMAKING.md): enter the difficulty-bucketed shared pool (a logged-in account is required).
  const mmJoin = () => run('mm', () => net.request('mm.join', { difficulty }));
  const mmCancel = () => {
    // Optimistic: clear locally so a failed / slow cancel can never leave the panel stuck (a real mm.state re-syncs).
    clearMmQueue();
    net.request('mm.cancel').catch(() => {});
  };
  const join = (c = code, source = null) => {
    // `onClick=${join}` hands the click EVENT as the first argument, and a default parameter only applies to
    // `undefined` — codeArg keeps an event target out of the key and falls back to the input field
    const k = codeArg(c, code);
    if (!k) { toast(t('同盟密钥为 {ROOM_CODE_LEN} 位字母或数字', { ROOM_CODE_LEN }), 'warn'); return; }
    const fromRooms = remembersRoomOrigin(source);
    run('join', () => {
      if (fromRooms) setRoomsReturn(true);
      return joinRequest('room.join', k).then((r) => {
        // Entering a room leaves the 野排 pool (server/lobby.js room.join → mm.leave): mirror that locally at once. A
        // FAILED join never reached the pool drop, so it keeps the queue (the server is the source of truth either way).
        if (entryPolicy.joinClearsQueue) clearMmQueue();
        return r;
      }).catch((err) => {
        // a failed 公开房间 join never entered the room: don't leave the return flag for a later, unrelated leave
        if (fromRooms) setRoomsReturn(false);
        throw err;
      });
    });
  };
  // a spectator seat: no player seat taken, nothing to do but watch (also a match already running)
  const spectate = (c = code, source = null) => {
    // same guard as join: `onClick=${spectate}` passes the click event, not a code
    const k = codeArg(c, code);
    if (!k) { toast(t('同盟密钥为 {ROOM_CODE_LEN} 位字母或数字', { ROOM_CODE_LEN }), 'warn'); return; }
    const fromRooms = remembersRoomOrigin(source);
    run('spectate', () => {
      if (fromRooms) setRoomsReturn(true);
      return joinRequest('room.spectate', k).then((r) => {
        // same as join: a spectator seat also leaves the 野排 pool (server/lobby.js room.spectate → mm.leave)
        if (entryPolicy.joinClearsQueue) clearMmQueue();
        return r;
      }).catch((err) => {
        if (fromRooms) setRoomsReturn(false);
        // Clearer than the bare ERR_TEXT: the usual cause is a code that is not the host's (a remembered one from an
        // earlier room, or another machine's) — the server can only answer "no such room".
        if (err?.code === ERR.ROOM_NOT_FOUND) {
          toast(t('没有找到密钥 {k} 对应的同盟：请和房主核对密钥（同盟结束后密钥即失效）', { k }), 'warn');
          return;
        }
        if (err?.code === ERR.ALREADY) {
          toast(t('你已经是该同盟的博士：先离开同盟，才能以观战身份进入'), 'warn');
          return;
        }
        throw err;
      });
    });
  };
  const backToTitle = () => {
    // Leaving the lobby must not leave the 野排 queue behind: the socket stays open, so without this the server
    // would keep this session in the shared pool (and could match it into a room the player never sees).
    if (mm.queued) mmCancel();
    // 返回标题 clears the 公开房间 return intent: a later, unrelated room leave must not reopen it; the 在线玩家
    // overlay and its stats-return intent go with it too (docs/MATCHMAKING.md §8).
    setRoomsReturn(false);
    setOnlineOpen(false);
    setOnlineFilter('');
    setOnlineStatsReturn(false);
    identity.setEntered(false);
    store.set((s) => ({ session: { ...s.session, entered: false }, mm: { ...s.mm, queued: false, difficulty: null } }));
  };

  // 公开房间 is a full screen, not a modal (docs/MATCHMAKING.md §36): the lobby body is swapped for screens/rooms.js
  // while it is open — same LobbyScreen, same routing, so a room.state still takes over and the `?room=` deep-link is
  // untouched; joining / spectating closes the screen and reuses the lobby's own handlers.
  if (showCommunity === 'rooms') {
    return html`<div class="screen lobby-screen">
      <${PublicRoomsScreen} onBack=${() => setShowCommunity(null)}
        onJoin=${(c) => { setShowCommunity(null); setCode(c); join(c, 'rooms'); }}
        onSpectate=${(c) => { setShowCommunity(null); setCode(c); spectate(c, 'rooms'); }} />
    </div>`;
  }

  // The 档案 chip in `.topbar__right` IS the 统计数据 entry (owner 2026-10-15: 「统计按钮移除，把这个功能放到账号
  // 显示上」). The standalone 统计 button is gone; the chip's chart icon and `.me-chip--btn` already existed from
  // upstream, unwired — this completes that (the class was applied to a `<div>` that could not be clicked, and an
  // orphan `</button>` was left behind). The 设置 dialog and the room / title bars keep their own entries.
  return html`<div class="screen lobby-screen">
    <header class="topbar">
      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" onClick=${backToTitle} title=${t('返回标题')}>${t('返回')}<//>
        <${PingPill} ms=${conn.ping} online=${online} />
        <${OnlineBadge} onOpen=${() => setOnlineOpen(true)} />
        <button type="button" class="online-badge lobby-rooms" title=${t('公开房间')} onClick=${() => setShowCommunity('rooms')}>
          <${Icon} name="users" /><span>${t('公开房间')}</span>
        </button>
        <button type="button" class="online-badge lobby-rooms" title=${t('更新日志')} onClick=${() => setShowCommunity('changelog')}>
          <${Icon} name="book" /><span>${t('更新日志')}</span>
        </button>
      </div>
      <div class="topbar__center">
        <${MicroLabel} tone="mint">SIMULATION PROTOCOL SELECT<//>
        <h1 class="topbar__title">${t('选择模拟协议')}</h1>
      </div>
      <div class="topbar__right">
        <${Button} variant="secondary" size="sm" icon="info" class="codex-entry" onClick=${() => openCodex('bonds')} title=${t('资料库')} aria-label=${t('资料库')}>${t('资料库')}<//>
        <${Button} variant="secondary" size="sm" icon="book" class="lobby-sweep" onClick=${() => setSweepOpen(true)}
          title=${t('S.W.E.E.P.')}>S.W.E.E.P.<//>
        <${LoadoutButton} from="lobby" size="sm" class="lobby-loadout" label=${t('干员调配')} />
        ${auth?.account ? null : html`<${Button} variant="secondary" size="sm" icon="user" class="lobby-account"
          onClick=${() => setShowAccount(true)}>${t('登录 / 注册')}<//>`}
        <${SettingsButton} class="lobby-settings" variant="secondary" label=${t('设置')} />
        <button type="button" class="me-chip me-chip--btn" onClick=${openStats} title=${t('统计数据')} aria-label=${t('统计数据')}>
          <${AvatarFrame} size="sm" name=${me.name} seat=${0} self=${true} />
          <div class="me-chip__text">
            <span class="me-chip__name">${me.name || t('博士')}<${RoleTag} role=${auth?.account?.role} />${auth?.account ? null : html`<em class="me-chip__guest">${t('游客')}</em>`}</span>
            <${MicroLabel}>${me.playerId != null ? `DOCTOR #${doctorNo(me.playerId)}` : 'DOCTOR'}<//>
          </div>
          <${Icon} name="chart" class="me-chip__stats" />
        </button>
      </div>
    </header>

    <div class="lobby-body screen__scroll">
      <section class="lobby-left">
        <div class="section-label"><span class="section-label__idx num">01</span>${t('模拟方式')}<${MicroLabel}>MODE<//></div>
        <div class="mode-cards">
          ${MODE_CARDS.map((c) => html`<${ModeCard} key=${c.id} card=${c} selected=${roomMode === c.id} onSelect=${pickMode} />`)}
        </div>

        <div class="section-label"><span class="section-label__idx num">03</span>${t('加入同盟')}<${MicroLabel}>JOIN WITH ALLIANCE KEY<//></div>
        <${Panel} class="join-panel" tone="amber">
          <div class="join-row">
            <${TextField} size="code" icon="key" value=${code} placeholder=${t('输入同盟密钥 / 粘贴邀请链接')}
              transform=${normalizeCode} onInput=${(v) => setCode(normalizeCode(v))} onEnter=${() => join()} />
            <${Button} variant="amber" size="lg" icon="users" loading=${busy === 'join'} disabled=${!codeOk || !online} onClick=${() => join()}>${t('加入同盟')}<//>
            <${Tooltip} text=${t('以观战者身份进入：不占博士席位，只能观看（每个同盟最多 {MAX_SPECTATORS} 名，模拟进行中也可进入）', { MAX_SPECTATORS })}>
              <${Button} variant="secondary" size="lg" icon="eye" class="join-spectate" loading=${busy === 'spectate'} disabled=${!codeOk || !online} onClick=${spectate}>${t('观战')}<//>
            <//>
          </div>
          <${PublicAlliances} onJoin=${(c) => { setCode(c); join(c); }} onSpectate=${(c) => { setCode(c); spectate(c); }} />
        <//>
        <${TipsPanel} />
      </section>

      <section class="lobby-right">
        <div class="section-label"><span class="section-label__idx num">02</span>${t('模拟难度')}<${MicroLabel}>DIFFICULTY<//></div>
        <div class="diff-list">
          ${DIFFICULTIES.map((d) => html`<${DifficultyCard} key=${d} roomMode=${roomMode === 'mm' ? 'coop' : roomMode} difficulty=${d} selected=${difficulty === d} onSelect=${pickDifficulty} />`)}
        </div>
        ${roomMode === 'mm'
          ? (mm.queued ? null : html`<div class="mm-box">
              <${Button} variant="primary" size="xl" block=${true} icon="search" disabled=${!online || !auth.account}
                onClick=${mmJoin} title=${auth.account ? '' : t('需要先登录账号')}>${t('搜寻队友（野排）')}<//>
              <div class="mm-box__hint">${auth.account ? t('进入共享池，最多 5 分钟凑齐 4 人，不足由 AI 补位') : t('需先在标题页登录 / 注册账号')}</div>
            </div>`)
          : html`<div class="create-box">
              ${roomMode === 'coop' ? html`<div class="create-vis">
                <span class="create-vis__label">${t('房间可见性')}<${MicroLabel}>VISIBILITY<//></span>
                <${Tabs} size="sm" value=${isPublic ? 'public' : 'private'} onChange=${pickPublic}
                  items=${[{ id: 'public', label: t('公开') }, { id: 'private', label: t('不公开') }]} />
              </div>` : null}
              <${Tooltip} block=${true} text=${entryPolicy.reason || (online ? null : t('正在连接服务器…'))}>
                <${Button} variant="primary" size="xl" block=${true} iconRight="chevrons" loading=${busy === 'create'} disabled=${!online || entryPolicy.blocked} onClick=${create}>
                  ${roomMode === 'solo' ? t('开始独立模拟') : t('创建同盟')}
                <//>
              <//>
              ${testMode ? html`<label class="create-box__test" data-testid="create-test">
                <input type="checkbox" checked=${asTest} onChange=${(e) => setAsTest(!!e.currentTarget.checked)} />
                <span>${t('测试房间')}</span>
              </label>` : null}
              <div class="create-box__hint">
                ${entryPolicy.reason
                  ? html`<span class="create-box__blocked">${entryPolicy.reason}</span>`
                  : online
                    ? html`<span>${roomMode === 'solo' ? t('创建后即可开始模拟')
                      : isPublic ? t('公开：其他博士可在大厅「公开同盟」直接加入')
                      : t('不公开：仅凭同盟密钥加入')}</span>`
                    : html`<${Spinner} size="sm" label="CONNECTING" />`}
              </div>
            </div>`}
        ${mm.queued ? html`<${MmPanel} mm=${mm} onCancel=${mmCancel} />` : null}
      </section>
    </div>
    ${showAccount ? html`<${AccountDialog} defaultName=${me.name} onClose=${() => setShowAccount(false)} />` : null}
    ${showOnline ? html`<${OnlineOverlay} onClose=${() => setOnlineOpen(false)} />` : null}
    ${showCommunity === 'changelog' ? html`<${ChangelogOverlay} onClose=${() => setShowCommunity(null)} />` : null}
    ${sweepOpen ? html`<${SweepReport} onClose=${() => setSweepOpen(false)} />` : null}
  </div>`;
}

/**
 * Live 同盟 directory (server `/online/api`, polled async every 4 s):
 *   · `openRooms` — a hand-made room still in its lobby with a free seat → clicking joins the 同盟.
 *   · `playRooms` — a co-op room whose match is ALREADY RUNNING (up to 4) → clicking enters as a spectator (观战).
 * The same public, token-free endpoint the 在线 overlay uses (docs/MATCHMAKING.md).
 */
function PublicAlliances({ onJoin, onSpectate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/online/api', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setData({
          open: Array.isArray(j.openRooms) ? j.openRooms : [],
          play: Array.isArray(j.playRooms) ? j.playRooms : [],
        });
      } catch { /* keep the last list */ }
    };
    tick();
    const h = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(h); };
  }, []);
  const open = (data?.open || []).filter((r) => !r.full).slice(0, 3); // full lobbies are 观战-only → not a 加入 chip here
  const play = (data?.play || []).slice(0, 4);
  const rows = [];
  if (open.length) {
    rows.push(html`<div class="join-foot" key="open">
      <span class="t-lo">${t('公开同盟')}</span>
      ${open.map((r) => html`<button key=${r.code} type="button" class="code-chip num"
        title=${t('{0} · {humans}/{MAX_SEATS}{3} —— 点击加入', { 0: r.difficultyName || '', humans: r.humans, MAX_SEATS, 3: r.host ? ` · ${r.host}${roleName(r.hostRole) ? `（${roleName(r.hostRole)}）` : ''}` : '' })}
        onClick=${() => onJoin(r.code)}>${r.code}</button>`)}
    </div>`);
  }
  if (play.length) {
    rows.push(html`<div class="join-foot" key="play">
      <span class="t-lo">${t('正在模拟')}</span>
      ${play.map((r) => html`<button key=${r.code} type="button" class="code-chip num is-live"
        title=${t('{0} · {humans} 人{2}{3} —— 点击观战', { 0: r.difficultyName || '', humans: r.humans, 2: r.bots ? ` + ${r.bots} AI` : '', 3: r.host ? ` · ${r.host}${roleName(r.hostRole) ? `（${roleName(r.hostRole)}）` : ''}` : '' })}
        onClick=${() => onSpectate(r.code)}>${r.code}</button>`)}
    </div>`);
  }
  return rows.length ? rows : null;
}

/**
 * The 野排 status panel's pure view model (bottom-right of the lobby, docs/MATCHMAKING.md §16.2): null when not queueing,
 * else the live `mm.state` numbers the panel renders. Split out so the queued / un-queued split is testable without a
 * browser, like the rest of the lobby's pure helpers.
 * @param {{ queued?: boolean, difficulty?: string|null, waiting?: number, need?: number, elapsedMs?: number, deadlineMs?: number }} mm
 * @param {number} [now]
 * @returns {{ difficulty: string|null, waiting: number, need: number, elapsed: number, left: number } | null}
 */
export function mmPanelView(mm, now = Date.now()) {
  if (!mm?.queued) return null;
  const need = Number.isFinite(mm.need) && mm.need > 0 ? mm.need : MAX_SEATS;
  const waiting = Number.isFinite(mm.waiting) ? Math.max(0, mm.waiting) : 0;
  const elapsed = Math.max(0, Math.floor((mm.elapsedMs || 0) / 1000));
  const left = Math.max(0, Math.ceil(((mm.deadlineMs || 0) - now) / 1000));
  return { difficulty: typeof mm.difficulty === 'string' ? mm.difficulty : null, waiting, need, elapsed, left };
}

/**
 * The 野排 rules on the lobby's ROOM actions (owner 2026-10-11, docs/MATCHMAKING.md §16) — pure and unit-testable:
 * while a queue is live (`mm.queued`) and/or the 同盟匹配 mode is selected, a hand-made room contradicts the pool, so
 * the CREATE-room action (创建同盟 / 开始独立模拟) is BLOCKED and says why:
 *   · `blocked` — disable the create button + show `reason` as its hint/tooltip. `reason` is empty when allowed.
 *   · 加入同盟 / 观战 (join-by-key) stays ALLOWED: entering a room leaves the pool anyway (server/lobby.js `join` /
 *     `spectate` → `mm.leave`; `main.js onRoomState` clears the local queue on the pushed `room.state`), so
 *     `joinClearsQueue` tells the caller to mirror that clear optimistically. A FAILED join keeps the queue.
 * @param {{ queued?: boolean }} mm the store's mm slice
 * @param {'solo'|'coop'|'mm'} roomMode the selected mode card
 * @returns {{ blocked: boolean, reason: string, joinClearsQueue: boolean }}
 */
export function roomEntryPolicy(mm, roomMode) {
  const queued = !!(mm && mm.queued);
  const mmMode = roomMode === 'mm';
  return {
    blocked: queued || mmMode,
    reason: queued ? t('匹配中不可创建房间，请先退出匹配') : mmMode ? t('同盟匹配不会创建房间') : '',
    joinClearsQueue: queued,
  };
}

/**
 * A queue time for the 野排 panel (the window is minutes long, MM_WINDOW_MS): seconds below a minute ("45s"), `m:ss`
 * from a minute up ("4:55") — so the 5-minute countdown never reads as a bare "300s".
 * @param {number} sec
 * @returns {string}
 */
export function fmtMmClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Optimistic local clear of the 野排 queue (the server's mm.state re-syncs). Used by the panel's ✕ 退出匹配. */
export function clearMmQueue() {
  store.patch('mm', { queued: false, difficulty: null });
}

/**
 * The 野排 status panel: the shared-pool search, the current head count (n/4), the difficulty / wait / AI-backfill
 * countdown and the cancel button. It refreshes on each `mm.state` push (~1 Hz, main.js wireNet → store.mm). Replaces
 * the old centred `MmOverlay`; the wording describes OUR rules (shared pool, ≤5 min, AI backfill), not the reference's.
 */
function MmPanel({ mm, onCancel }) {
  const v = mmPanelView(mm);
  if (!v) return null;
  return html`<div class="mm-panel brackets" role="status" aria-live="polite">
    <${MicroLabel} tone="mint">ALLIANCE MATCHMAKING<//>
    <div class="mm-panel__row">
      <span class="mm-panel__title">${t('正在寻找同盟队友')}<span class="mm-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>
      <span class="mm-panel__count num"><b>${v.waiting}</b>/<span>${v.need}</span></span>
    </div>
    <div class="mm-panel__rule" aria-hidden="true"></div>
    <div class="mm-panel__meta">
      <span>${t('难度')} <b>${v.difficulty ? t(DIFFICULTY_NAMES[v.difficulty]) : '-'}</b></span>
      <span>${t('已等待')} <b class="num">${fmtMmClock(v.elapsed)}</b></span>
      ${v.left > 0 ? html`<span class="mm-panel__left num">${t('约 {left} 后由 AI 补位开局', { left: fmtMmClock(v.left) })}</span>` : html`<span class="mm-panel__left num">${t('正在组队…')}</span>`}
    </div>
    <div class="mm-panel__hint">${t('进入共享池，最多 5 分钟凑齐 4 人，不足由 AI 补位')}</div>
    <${Button} variant="secondary" size="md" block=${true} icon="close" class="mm-panel__exit" onClick=${onCancel}>${t('退出匹配')}<//>
  </div>`;
}

/**
 * The server's online-player count (Lobby.stats().online, served by /healthz — server data, not a client guess).
 * Clicking opens the in-game online overlay (`onOpen`).
 */
function OnlineBadge({ onOpen }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/healthz', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && Number.isFinite(j.online)) setN(j.online);
      } catch { /* offline: keep the last value */ }
    };
    tick();
    const h = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(h); };
  }, []);
  return html`<button type="button" class="online-badge" title=${t('查看在线玩家')} onClick=${onOpen}>
    <${Icon} name="users" /><span>${t('在线')}</span><b class="num">${n == null ? '—' : n}</b>
  </button>`;
}

/** Status key → label + tone (distinct hues, all from the theme tokens; mirrors server/admin.js STATUS). */
const ONLINE_STATUS = {
  online: { label: N_('在线'), c: 'mint' }, room: { label: N_('组队中'), c: 'ice' }, queue: { label: N_('野排排队'), c: 'gold' },
  mmplay: { label: N_('野排游玩'), c: 'amber' }, alliance: { label: N_('同盟游玩'), c: 'violet' }, solo: { label: N_('单人游玩'), c: 'green' },
  offline: { label: N_('离线'), c: 'dim' },
};

/**
 * The public stats target of an /online/api online row: a registered player's callsign, else null. Guests have no
 * account-bound identity others can key on (server/stats.js `stats.view` resolves by public callsign), so their row
 * stays a plain row — and so does a nameless entry.
 * @param {any} p an /online/api `online[]` entry
 * @returns {string|null}
 */
export function onlineStatsTarget(p) {
  return p && !p.guest && typeof p.name === 'string' && p.name.length > 0 ? p.name : null;
}

/**
 * Filter the online list by a free-text query: a case-insensitive substring of the callsign, the room code, or the
 * status (its key like `queue`, or its translated label like 野排排队), so any of those find a row. An empty / blank
 * query keeps the list as it is (the same array reference — no needless re-render).
 * @param {any[]} list /online/api `online[]`
 * @param {string} query the search field's text
 * @returns {any[]}
 */
export function filterOnlinePlayers(list, query) {
  const arr = Array.isArray(list) ? list : [];
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return arr;
  return arr.filter((p) => {
    const status = ONLINE_STATUS[p?.status];
    const hay = [p?.name, p?.roomCode, p?.status, status ? t(status.label) : '', p?.guest ? t('游客') : t('已登录')];
    return hay.some((s) => typeof s === 'string' && s.toLowerCase().includes(q));
  });
}

/**
 * A 在线玩家 row click on a viewable player: hide the list and open their public records, remembering the online-list
 * origin so closing the stats pops back here with the search still in place (ui.onlineStatsReturn, one-shot). Split
 * out so the row → stats wiring is testable without a browser; `deps.open` defaults to the real `openPlayerStats`.
 * @param {any} p an /online/api `online[]` entry
 * @param {{ open?: (name: string) => void }} [deps]
 * @returns {boolean} whether a viewable row opened the stats
 */
export function openOnlineStats(p, deps = {}) {
  const name = onlineStatsTarget(p);
  if (!name) return false;
  setOnlineStatsReturn(true);
  setOnlineOpen(false);
  (deps.open || openPlayerStats)(name);
  return true;
}

/**
 * The in-game online-players overlay: server data via /online/api (token-free), refreshed every 4 s. Opened from the
 * 在线 badge — no separate page. Rows list 名字 / 是否登录 / 状态 / 房间; a registered player's row (the `>` chevron)
 * opens their public records (server/stats.js stats.view) and returns here on close. A search box filters the list by
 * callsign / room code / status. Styled with the game's own components (docs/MATCHMAKING.md §8).
 */
function OnlineOverlay({ onClose }) {
  const [data, setData] = useState(null);
  const query = useStore((s) => s.ui.onlineFilter);
  const list = (data && data.online) || [];
  const shown = filterOnlinePlayers(list, query);
  const st = (s) => ONLINE_STATUS[s] || { label: s, c: 'dim' };
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/online/api', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setData(j);
      } catch { /* keep the last snapshot */ }
    };
    tick();
    const h = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(h); };
  }, []);
  // Esc closes the overlay — but a confirm dialog on top takes the Esc. The stats viewer this overlay opens consumes
  // the first Esc (popping back here); this listener is mounted only then, so the second Esc closes the list.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.modal')) return;
      e.preventDefault(); e.stopPropagation();
      closeRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return html`<div class="online-modal" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="online-modal__card brackets">
      <div class="online-modal__head">
        <div class="online-modal__title"><${MicroLabel} tone="mint">ONLINE DOCTORS<//>
          <h2>${t('在线玩家')}<span class="num">${data ? data.counts.online : '—'}</span></h2></div>
        <button type="button" class="online-modal__close" onClick=${onClose} aria-label=${t('关闭')}><${Icon} name="close" /><//>
      </div>
      <div class="online-modal__meta"><span><i class="online-dot"></i>${t('实时')}</span><span>${t('游客')} ${data ? data.counts.guests : '—'}</span><span>${t('每 4 秒刷新')}</span></div>
      <div class="online-modal__search">
        <${TextField} size="sm" icon="search" value=${query} placeholder=${t('搜索玩家代号 / 房间号')}
          onInput=${setOnlineFilter} class="online-modal__search-field" />
        <span class="online-modal__count num" title=${t('显示 {shown} / {total}', { shown: shown.length, total: list.length })}>
          <b>${shown.length}</b><span>/${list.length}</span></span>
        ${query ? html`<button type="button" class="online-modal__clear" aria-label=${t('清除搜索')} title=${t('清除搜索')}
          onClick=${() => setOnlineFilter('')}><${Icon} name="close" /><//>` : null}
      </div>
      <div class="online-modal__list">
        ${shown.length ? shown.map((p, i) => {
          // a registered player's row opens their public match records (server/stats.js stats.view) and returns here;
          // guests have no account-bound identity others can key on, so their row stays a plain row
          const target = onlineStatsTarget(p);
          const open = target ? () => openOnlineStats(p) : undefined;
          return html`<div class=${`online-row${target ? ' is-viewable' : ''}`} key=${`${p.name}-${i}`}
            role=${target ? 'button' : undefined} tabIndex=${target ? 0 : undefined}
            title=${target ? t('查看其对局记录') : undefined}
            onClick=${target ? open : undefined}
            onKeyDown=${target ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}>
          <${AvatarFrame} size="sm" name=${p.name} seat=${i} offline=${p.status === 'offline'} />
          <span class="online-row__name">${p.name}<${RoleTag} role=${p.role} /></span>
          ${p.guest ? html`<span class="online-row__tag">${t('游客')}</span>` : html`<span class="online-row__tag is-acc">${t('已登录')}</span>`}
          <span class=${`online-row__status is-${st(p.status).c}`}>${t(st(p.status).label)}</span>
          <span class="online-row__room num">${p.roomCode || '—'}</span>
          ${target ? html`<span class="online-row__go" aria-hidden="true"><${Icon} name="chevronRight" /></span>` : null}
        </div>`;
        }) : html`<div class="online-modal__empty">${!data ? t('加载中…') : list.length ? t('没有匹配的玩家') : t('暂无在线玩家')}</div>`}
      </div>
    </div>
  </div>`;
}
