// Hub lobby (new main interface, admin-switchable): the special 0.3.0 fork's cinematic hub — a procedural fortress
// backdrop, a centred emblem/radar, side tiles for the utility entries and three large mode entries that open a
// full-screen 选择模拟协议 page (isometric scene + difficulty cards). The classic lobby (screens/lobby.js) is kept
// intact; both screens share the same store, net actions and feature overlays.
//
// Every Hub feature is reachable here: 公开房间, 更新日志, 加入同盟/观战, 最近密钥, 野排队列,
// 测试房间, 公开可见性, S.W.E.E.P., 干员调配, 统计, 账号, 设置, 玩法说明, 大厅背景. The Hub deliberately drops
// 作战提示 and 资料库 (they stay in the classic lobby). `?room=` deep links and room-state routing are handled by
// main.js and never touched by the skin.
//
// Styles: css/screens/hub.css (ported from the fork with its GPL attribution; classic styles untouched).

import { useEffect, useRef, useState } from '../../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, ROOM_CODE_LEN, MAX_SEATS, MAX_SPECTATORS, ERR } from '../../../../shared/constants.js';
import { html, Button, Icon, MicroLabel, Modal, TextField, PingPill, AvatarFrame, Tooltip, Spinner, DifficultyIcon, doctorNo, Tabs, RoleTag, confirmDialog } from '../../ui/components.js';
import { toast, toastError } from '../../ui/toasts.js';
import { openStats } from '../stats.js';
import { SweepReport } from '../sweep.js';
import { LoadoutButton } from '../loadout.js';
import { SettingsButton } from '../../ui/settings.js';
import { GuideButton } from '../../ui/guide.js';
import { NoticesButton } from '../../ui/notices.js';
import { AccountDialog } from '../../ui/account.js';
import { ChangelogOverlay } from '../../ui/community.js';
import { OnlineOverlay } from '../online.js';
import { PublicRoomsScreen } from '../rooms.js';
import { net, identity } from '../../net.js';
import { store, useStore, shallowEqual, loadPref, savePref, setRoomsReturn, consumeRoomsReturn, setOnlineOpen, setOnlineFilter, setOnlineStatsReturn } from '../../store.js';
import { useData } from '../../data.js';
import { t } from '../../../../shared/i18n.js';
import { MODE_CARDS, difficultyInfo, normalizeCode, codeArg, remembersRoomOrigin } from '../lobbyData.js';
import { Emblem } from '../title.js';
import { HubBackdrop, HubRadar, BackdropGlyph, BackdropSettings } from '../../ui/hub/backdrop.js';
import { useHubBackdrop, backdropTheme } from '../../ui/hub/appearance.js';
import { ProtocolScene } from '../../ui/hub/protocolScene.js';

/** A hub mode entry (bottom-right): the fork's big bracket button. */
function HubEntry({ card, tone = 'mint', disabled = false, onClick }) {
  return html`<button type="button" class=${`hub-entry hub-entry--${tone}`} disabled=${disabled} onClick=${onClick}>
    <span class="hub-entry__icon"><${Icon} name=${card.icon} /></span>
    <span class="hub-entry__en">${card.en}</span>
    <span class="hub-entry__name">${t(card.name)}</span>
    <span class="hub-entry__corner" aria-hidden="true"></span>
  </button>`;
}

/** A side utility tile (join / rooms / codex / records). */
function HubTile({ icon, label, en, onClick }) {
  return html`<button type="button" class="hub-tile" onClick=${onClick}>
    <span class="hub-tile__icon"><${Icon} name=${icon} /></span>
    <span class="hub-tile__text"><span class="hub-tile__label">${label}</span><span class="hub-tile__en">${en}</span></span>
  </button>`;
}

/** The bright plate used for S.W.E.E.P. (same look as the fork's report plate). */
function SweepPlate({ onClick }) {
  return html`<button type="button" class="hub-plate hub-plate--sweep" onClick=${onClick}>
    <span class="hub-plate__glyph"><${Icon} name="book" /></span>
    <span class="hub-plate__label">${t('S.W.E.E.P.报告')}</span><span class="hub-plate__tag">REPORT</span>
  </button>`;
}

/** Server-side online count (the header badge; clicking opens the player list). */
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
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return html`<button type="button" class="online-badge" title=${t('查看在线玩家')} onClick=${onOpen}>
    <${Icon} name="users" /><span>${t('在线')}</span><b class="num">${n == null ? '—' : n}</b>
  </button>`;
}

/** The 野排 queue strip: head count, difficulty and the AI-backfill countdown. */
function QueuePanel({ mm, onCancel }) {
  if (!mm?.queued) return null;
  const need = Number.isFinite(mm.need) && mm.need > 0 ? mm.need : MAX_SEATS;
  const waiting = Number.isFinite(mm.waiting) ? Math.max(0, mm.waiting) : 0;
  const elapsed = Math.max(0, Math.floor((mm.elapsedMs || 0) / 1000));
  const left = Math.max(0, Math.ceil(((mm.deadlineMs || 0) - Date.now()) / 1000));
  const clock = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return html`<div class="match-queue brackets" role="status" aria-live="polite">
    <div class="match-queue__head"><${Icon} name="signal" /><div><${MicroLabel} tone="mint">ALLIANCE MATCHMAKING<//>
      <b>${t('正在寻找同盟队友')}</b></div><span class="num">${waiting}/${need}</span></div>
    <div class="match-queue__meta">
      <span>${t('难度')} <b>${mm.difficulty ? t(DIFFICULTY_NAMES[mm.difficulty]) : '-'}</b></span>
      <span>${t('已等待')} <b class="num">${clock(elapsed)}</b></span>
      <span class="num">${left > 0 ? t('{left} 后由 AI 补位开局', { left: clock(left) }) : t('正在组队…')}</span>
    </div>
    <${Button} variant="secondary" size="sm" icon="close" onClick=${onCancel}>${t('退出匹配')}<//>
  </div>`;
}

/** One difficulty card in the protocol page. */
function ProtocolCard({ roomMode, difficulty, selected, onSelect }) {
  const info = difficultyInfo(roomMode, difficulty);
  return html`<button type="button" class=${`pcard${selected ? ' is-on' : ''}`} style=${`--d-color:${DIFFICULTY_COLORS[difficulty]}`}
      onClick=${() => onSelect(difficulty)} aria-pressed=${selected ? 'true' : 'false'}>
    <span class="pcard__glow" aria-hidden="true"></span>
    <span class="pcard__head"><${DifficultyIcon} difficulty=${difficulty} class="pcard__glyph" />
      <span class="pcard__name">${t(DIFFICULTY_NAMES[difficulty])}</span></span>
    <span class="pcard__desc">${info.desc}</span>
    <span class="pcard__effects">${info.effects.map((e) => html`<span key=${e}>${e}</span>`)}</span>
    <span class="pcard__meta">
      ${info.code ? html`<span class="num">${info.code}</span>` : null}
      <span><b class="num">${info.rounds}</b> ${t('回合')}${info.hidden ? t(' + 隐秘核心') : ''}</span>
      ${info.stageNote ? html`<span>${info.stageNote}</span>` : null}
    </span>
    <span class="pcard__stamp" aria-hidden="true"><span class="pcard__tick"><${Icon} name="check" /></span></span>
  </button>`;
}

/**
 * 选择模拟协议: the fork's full-screen difficulty page. It never mutates the classic lobby — the caller owns the
 * create/queue actions and receives `onStart`.
 */
function ProtocolPage({ mode, difficulty, onDifficulty, onClose, online, busy, isPublic, onPublic, testMode, asTest, onTest,
  blockedReason, needAccount, onStart }) {
  const card = MODE_CARDS.find((c) => c.id === mode) || MODE_CARDS[0];
  const info = difficultyInfo(mode === 'mm' ? 'coop' : mode, difficulty);
  const color = DIFFICULTY_COLORS[difficulty];
  const startLabel = mode === 'solo' ? t('开始独立模拟') : mode === 'mm' ? t('搜寻队友（野排）') : t('创建同盟');
  const blocked = !online || !!busy || !!blockedReason || (mode === 'mm' && needAccount);
  const hint = !online ? t('正在连接服务器…') : needAccount ? t('需先在标题页登录 / 注册账号') : blockedReason
    || (mode === 'coop' ? (isPublic ? t('公开：其他博士可在大厅「公开房间」直接加入')
      : t('不公开：仅凭同盟密钥加入')) : mode === 'mm' ? t('进入共享池，最多 5 分钟凑齐 4 人，不足由 AI 补位')
      : t('创建后即可开始模拟'));
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return html`<main class="screen protocol-screen" aria-label=${`${t(card.name)} · ${t('选择模拟协议')}`}>
    <div class="proto" style=${`--d-color:${color}`}>
      <div class="proto__bg" aria-hidden="true"></div>
      <header class="proto-top">
        <button type="button" class="proto-back" onClick=${onClose} title=${t('返回大厅')} aria-label=${t('返回大厅')}>
          <${Icon} name="chevronLeft" /><span class="proto-back__home"><${Icon} name="rook" /></span>
        </button>
        <div class="proto-title">
          <h2>${t('选择模拟协议')}</h2>
          <span class="proto-title__mode">${t(card.name)}<i>${card.en}</i></span>
        </div>
      </header>
      <div class="proto-body">
        <section class="proto-stage">
          <${ProtocolScene} key=${difficulty} difficulty=${difficulty} />
          <div class="proto-brief">
            <span class="proto-brief__code num">${info.code}</span>
            <b class="proto-brief__name">${t(DIFFICULTY_NAMES[difficulty])}</b>
            <p>${t(card.desc, card.params)}</p>
          </div>
        </section>
        <section class="proto-side">
          <div class="proto-list" aria-label=${t('模拟难度')}>
            ${DIFFICULTIES.map((d) => html`<${ProtocolCard} key=${d} roomMode=${mode === 'mm' ? 'coop' : mode}
              difficulty=${d} selected=${difficulty === d} onSelect=${onDifficulty} />`)}
          </div>
          <div class="proto-foot">
            ${mode === 'coop' ? html`<div class="proto-vis">
              <span class="t-dim">${t('房间可见性')}</span>
              <${Tabs} size="sm" value=${isPublic ? 'public' : 'private'} onChange=${onPublic}
                items=${[{ id: 'public', label: t('公开') }, { id: 'private', label: t('不公开') }]} />
            </div>` : null}
            ${testMode && mode !== 'mm' ? html`<label class="proto-test">
              <input type="checkbox" checked=${asTest} onChange=${(e) => onTest(!!e.currentTarget.checked)} />
              <span>${t('测试房间')}</span>
            </label>` : null}
            <p class="proto-hint">${hint}</p>
            <button type="button" class="proto-start" disabled=${blocked} onClick=${onStart}>
              <span class="proto-start__mark" aria-hidden="true"><span class="proto-start__rook"><${Icon} name="rook" /></span></span>
              <span class="proto-start__label">${busy ? html`<${Spinner} size="sm" />` : null}${startLabel}</span>
              <span class="proto-start__deco" aria-hidden="true"></span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </main>`;
}

/** Hub lobby component (the new main interface). */
export function LobbyScreen() {
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  const auth = useStore((s) => s.auth, shallowEqual);
  const mm = useStore((s) => s.mm, shallowEqual);
  const testMode = useStore((s) => s.testMode === true);
  const showOnline = useStore((s) => s.ui.onlineOpen);
  const bg = useHubBackdrop();

  const [roomMode, setRoomMode] = useState(() => {
    const m = loadPref('lobby.mode', 'coop');
    return m === 'solo' || m === 'coop' || m === 'mm' ? m : 'coop';
  });
  const [difficulty, setDifficulty] = useState(() => {
    const d = loadPref('lobby.difficulty', 'FUNNY');
    return DIFFICULTIES.includes(d) ? d : 'FUNNY';
  });
  const [isPublic, setIsPublic] = useState(() => loadPref('lobby.public', true) !== false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [asTest, setAsTest] = useState(false);
  const [protocol, setProtocol] = useState(null);
  const [showJoin, setShowJoin] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCommunity, setShowCommunity] = useState(() => (consumeRoomsReturn() ? 'rooms' : null));
  const [sweepOpen, setSweepOpen] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  useData('config');
  useEffect(() => () => { alive.current = false; }, []);

  const online = conn.status === 'online';
  const codeOk = new RegExp(`^[A-Z0-9]{${ROOM_CODE_LEN}}$`).test(code);
  const queued = !!mm.queued;
  const entryBlocked = queued ? t('匹配中不可创建房间，请先退出匹配') : '';

  const pickDifficulty = (d) => { setDifficulty(d); savePref('lobby.difficulty', d); };
  const pickPublic = (v) => { const b = v === 'public'; setIsPublic(b); savePref('lobby.public', b); };

  const run = async (kind, fn) => {
    if (inFlight.current) return;
    if (!online) { toast(t('尚未连接到服务器，请稍后'), 'warn'); return; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };
  const create = () => {
    if (entryBlocked) { toast(entryBlocked, 'warn'); return; }
    const mode = protocol || roomMode;
    run('create', () => net.request('room.create', {
      mode, difficulty, public: isPublic, ...(testMode && asTest && mode !== 'mm' ? { test: true } : {}),
    }));
  };
  const joinRequest = (type, k) => net.request(type, { code: k }).catch((err) => {
    if (err?.code !== ERR.TEST_CONFIRM) throw err;
    return confirmDialog({ title: t('测试房间'), text: t('这是测试房间，不计入任何记录。确认加入？'), okText: t('加入') })
      .then((ok) => { if (!ok) throw err; return net.request(type, { code: k, testAck: true }); });
  });
  const join = (c = code, source = null) => {
    const k = codeArg(c, code);
    if (!k) { toast(t('同盟密钥为 {ROOM_CODE_LEN} 位字母或数字', { ROOM_CODE_LEN }), 'warn'); return; }
    const fromRooms = remembersRoomOrigin(source);
    run('join', () => {
      if (fromRooms) setRoomsReturn(true);
      return joinRequest('room.join', k).then((r) => {
        if (queued) store.patch('mm', { queued: false, difficulty: null });
        setShowJoin(false);
        return r;
      }).catch((err) => { if (fromRooms) setRoomsReturn(false); throw err; });
    });
  };
  const spectate = (c = code, source = null) => {
    const k = codeArg(c, code);
    if (!k) { toast(t('同盟密钥为 {ROOM_CODE_LEN} 位字母或数字', { ROOM_CODE_LEN }), 'warn'); return; }
    const fromRooms = remembersRoomOrigin(source);
    run('spectate', () => {
      if (fromRooms) setRoomsReturn(true);
      return joinRequest('room.spectate', k).then((r) => {
        if (queued) mmCancel();
        setShowJoin(false);
        return r;
      }).catch((err) => {
        if (fromRooms) setRoomsReturn(false);
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
  const mmJoin = () => run('mm', () => net.request('mm.join', { difficulty }).then(() => setProtocol(null)));
  const mmCancel = () => {
    // optimistic local clear; a real mm.state re-syncs
    store.patch('mm', { queued: false, difficulty: null });
    net.request('mm.cancel').catch(() => {});
  };
  const startProtocol = () => {
    const mode = protocol || roomMode;
    setRoomMode(mode);
    savePref('lobby.mode', mode);
    if (mode === 'mm') { mmJoin(); return; }
    create();
  };
  const backToTitle = () => {
    if (mm.queued) mmCancel();
    setRoomsReturn(false);
    setOnlineOpen(false);
    setOnlineFilter('');
    setOnlineStatsReturn(false);
    identity.setEntered(false);
    store.set((s) => ({ session: { ...s.session, entered: false }, mm: { ...s.mm, queued: false, difficulty: null } }));
  };

  if (showCommunity === 'rooms') {
    return html`<div class="screen lobby-screen">
      <${PublicRoomsScreen} onBack=${() => setShowCommunity(null)}
        onJoin=${(c) => { setShowCommunity(null); setCode(c); join(c, 'rooms'); }}
        onSpectate=${(c) => { setShowCommunity(null); setCode(c); spectate(c, 'rooms'); }} />
    </div>`;
  }
  if (protocol) {
    return html`<${ProtocolPage} mode=${protocol} difficulty=${difficulty} onDifficulty=${pickDifficulty}
      onClose=${() => setProtocol(null)} online=${online} busy=${busy} isPublic=${isPublic} onPublic=${pickPublic}
      testMode=${testMode} asTest=${asTest} onTest=${setAsTest}
      blockedReason=${protocol === 'mm' ? '' : entryBlocked} needAccount=${protocol === 'mm' && !auth?.account}
      onStart=${startProtocol} />`;
  }

  return html`<div class="screen lobby-screen lobby-hub" data-hub-theme=${backdropTheme(bg)}>
    <${HubBackdrop} bg=${bg} />
    <header class="topbar hub-topbar">
      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" onClick=${backToTitle} title=${t('返回标题')}>${t('返回')}<//>
        <div class="connection-status">
          <${PingPill} ms=${conn.ping} online=${online} />
          <${OnlineBadge} onOpen=${() => setOnlineOpen(true)} />
          <${NoticesButton} />
        </div>
        <div class="topbar__tools">
          <${Button} variant="secondary" size="sm" square=${true} title=${t('大厅背景')} aria-label=${t('大厅背景')}
            onClick=${() => setBgOpen(true)}><${BackdropGlyph} /><//>
          <${SettingsButton} class="hub-settings" variant="secondary" size="sm" square=${true} />
          <${GuideButton} class="hub-guide" variant="secondary" size="sm" square=${true} />
        </div>
      </div>
      <div class="topbar__right">
        ${auth?.account ? null : html`<${Button} variant="secondary" size="sm" icon="user" class="hub-account"
          onClick=${() => setShowAccount(true)}>${t('登录 / 注册')}<//>`}
        <button type="button" class="me-chip me-chip--btn" onClick=${openStats} title=${t('统计数据')} aria-label=${t('统计数据')}>
          <${AvatarFrame} size="sm" name=${me.name} seat=${0} self=${true} />
          <span class="me-chip__text">
            <span class="me-chip__name">${me.name || t('博士')}<${RoleTag} role=${auth?.account?.role} />${auth?.account ? null : html`<em class="me-chip__guest">${t('游客')}</em>`}</span>
            <${MicroLabel}>${me.playerId != null ? `DOCTOR #${doctorNo(me.playerId)}` : 'DOCTOR'}<//>
          </span>
          <${Icon} name="chart" class="me-chip__stats" />
        </button>
      </div>
    </header>

    <main class="hub-stage screen__scroll">
      <div class="hub-center" aria-hidden="true">
        <div class="hub-center__mark"><${HubRadar} bg=${bg} /><${Emblem} /></div>
        <span class="hub-center__en">STRONGHOLD <b>PROTOCOL</b></span>
        <h1 class="hub-center__title">${t('卫戍协议：盟约')}</h1>
      </div>

      <aside class="hub-side">
        <${HubTile} icon="users" label=${t('公开房间')} en="PUBLIC ALLIANCES" onClick=${() => setShowCommunity('rooms')} />
        <${HubTile} icon="key" label=${t('加入同盟')} en="ALLIANCE KEY" onClick=${() => setShowJoin(true)} />
        <${HubTile} icon="book" label=${t('更新日志')} en="CHANGELOG" onClick=${() => setShowCommunity('changelog')} />
      </aside>

      <aside class="hub-right">
        <${SweepPlate} onClick=${() => setSweepOpen(true)} />
        <${LoadoutButton} from="lobby" size="lg" class="lobby-loadout hub-plate hub-plate--loadout" label=${t('干员调配')} />
        <${HubTile} icon="chart" label=${t('统计数据')} en="LOCAL RECORDS" onClick=${openStats} />
      </aside>

      <section class="hub-entries" aria-label=${t('模拟方式')}>
        ${queued ? html`<${QueuePanel} mm=${mm} onCancel=${mmCancel} />` : null}
        <div class="hub-entries__row">
          ${MODE_CARDS.map((c) => html`<${HubEntry} key=${c.id} card=${c} tone=${c.id === 'mm' ? 'amber' : 'mint'}
            disabled=${queued} onClick=${() => setProtocol(c.id)} />`)}
        </div>
      </section>
    </main>

    <${Modal} open=${showJoin} utility=${true} class="hub-dialog" title=${t('加入同盟')} micro="ALLIANCE KEY"
      onClose=${() => setShowJoin(false)}>
      <div class="join-panel">
        <div class="join-row">
          <${TextField} size="code" icon="key" value=${code} placeholder=${t('输入同盟密钥 / 粘贴邀请链接')}
            transform=${normalizeCode} onInput=${(v) => setCode(normalizeCode(v))} onEnter=${() => join()} />
          <${Button} variant="amber" size="lg" icon="users" loading=${busy === 'join'} disabled=${!codeOk || !online}
            onClick=${() => join()}>${t('加入同盟')}<//>
          <${Tooltip} text=${t('以观战者身份进入：不占博士席位，只能观看（每个同盟最多 {MAX_SPECTATORS} 名，模拟进行中也可进入）', { MAX_SPECTATORS })}>
            <${Button} variant="secondary" size="lg" icon="eye" class="join-spectate" loading=${busy === 'spectate'}
              disabled=${!codeOk || !online} onClick=${spectate}>${t('观战')}<//>
          <//>
        </div>
        <div class="join-foot">
          <span class="t-dim">${t('向同伴索取 {ROOM_CODE_LEN} 位同盟密钥，或直接打开邀请链接', { ROOM_CODE_LEN })}</span>
        </div>
        <div class="join-foot"><button type="button" class="btn btn--ghost btn--sm" onClick=${() => { setShowJoin(false); setShowCommunity('rooms'); }}>
          ${t('浏览公开房间')}</button></div>
      </div>
    <//>

    <${Modal} open=${bgOpen} utility=${true} class="hub-backdrop-panel" title=${t('大厅背景')} micro="LOBBY BACKDROP"
      onClose=${() => setBgOpen(false)}><${BackdropSettings} bg=${bg} /><//>

    ${showAccount ? html`<${AccountDialog} defaultName=${me.name} onClose=${() => setShowAccount(false)} />` : null}
    ${showOnline ? html`<${OnlineOverlay} onClose=${() => setOnlineOpen(false)} />` : null}
    ${showCommunity === 'changelog' ? html`<${ChangelogOverlay} onClose=${() => setShowCommunity(null)} />` : null}
    ${sweepOpen ? html`<${SweepReport} onClose=${() => setSweepOpen(false)} />` : null}
  </div>`;
}
