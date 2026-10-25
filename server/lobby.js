// server/lobby.js — rooms, seats, host, AI seats, ready/start, reconnect, and room → Match wiring
// (DESIGN §2, §6.1 LOBBY, §8.1). Implements the handler interface consumed by server/net.js.
//
// Rules (the choices where DESIGN is silent are marked ▸):
//   * Rooms are keyed by 4-letter codes from an unambiguous alphabet (no I/O, letters only). Join codes are
//     case-insensitive.
//   * 'solo' rooms hold exactly one human and never bots. 'coop' rooms have 4 seats (humans + AI bots).
//     Humans and bots take the lowest free seat index; seat indexes never compact.
//   * ▸ Being in a LOBBY room and sending room.create / room.join implicitly leaves it. While your room is
//     in a match, create/join of another room fails with ROOM_STARTED (send g.leave or room.leave first).
//   * Host-only: room.setDifficulty, room.setAiPicksLast, room.addBot, room.removeBot, room.kick, room.start.
//     ▸ Changing the difficulty or the AI-picks-last option (co-op only) un-readies the other humans.
//     ▸ room.start requires every other human to be connected and ready; the host's start counts as the host's
//     ready (the host may still toggle room.ready for display).
//   * room.kick {seat, playerId} (community report #17, owner approved): before the match only, the host removes another
//     human like an AI seat (an AI seat stays room.removeBot's; never the host itself). `playerId` names the player the
//     host confirmed: a seat that changed hands meanwhile (left, someone else joined) is refused with BAD_TARGET. The
//     seat is freed at once and the player gets `room.closed {reason:'kicked'}` — now, or on the next resume when
//     offline (with the result replay, as the grace timeout) —, so the reconnect token no longer leads back to the seat
//     (it stays the player's identity: net.js sessions belong to players, not seats). ▸ No ban: the player may join
//     again with the code.
//   * Host migration: when the host leaves (or is removed), the lowest-seat remaining human (connected
//     ones first) becomes host. A room without humans is disposed (bots never keep a room alive).
//   * Disconnect in LOBBY: the seat shows connected=false and is freed after `lobbyGraceMs` (60 s); a
//     session that comes back after that gets `room.closed {reason:'timeout'}`.
//     Disconnect in a match: the seat is kept and match.onDisconnect(playerId) is called.
//   * Abandoned coop rooms: when a drop / leave / grace leaves NO CONNECTED human, the remaining disconnected seats
//     are departures too and the last one disposes the room (`empty`) after the lobby grace — bots (and their
//     server-taken-over fields) never keep a room alive. A solo run keeps its seat for the 24 h resume instead.
//     (A party that still has a connected human keeps the dropped seat for the reconnect window.)
//   * Reconnect: `hello` with a known token (reconnect window, 10 min, see net.js) rebinds the session;
//     the lobby then broadcasts room.state and, in a match, calls match.onReconnect(playerId).
//     Solo runs (下半: "休整期及机变阶段没有时间限制…24小时内随时返回", research 01 §1 / 06 §17): a session that drops
//     while its solo room's match runs stays resumable for the official `config.constants.singleReconnectTime`
//     (86400 s; option `soloReconnectWindowMs` overrides it) instead of the 10-minute window — the untimed solo match
//     simply waits (net.js session.resumeWindowMs, set at every disconnect). Only after that does expiry turn into
//     match.onLeave ('abandoned'). The extension outlives the match, so a run that ended meanwhile (e.g. a server-run
//     Final Assault) still shows its result on the player's return.
//     A repeated hello on a live connection is a full resync: room.state goes to the requester only
//     (broadcast only when the seat visibly changed, e.g. a rename in LOBBY); the heavy part (match.onReconnect,
//     or the result replay below) runs at most once per `resyncMinGapMs` per session — extra requests inside
//     that window coalesce into one deferred resync, so hello spam cannot amplify into ~15 KB per request.
//   * Result replay: the match's final m.public and each human's m.result are kept after the match ends. A
//     human who resyncs (resume after a drop, a reloaded tab, a repeated hello) while the room is back in LOBBY
//     gets room.state followed by those two frames again, until they act in the room (ready, difficulty, the
//     AI-picks-last option, AI seats, start), leave it, or a new match starts. A human removed by the lobby grace
//     gets them right after `room.closed {timeout}` on their next resume (Match.onReconnect cannot do this: the
//     lobby drops the match reference at onEnd and disposes it on the next macrotask).
//   * Per-network limits (internet clients only, see net.js clientAddress): at most `maxRoomsPerAddr` rooms
//     created from one network may exist at once and at most `maxMatchesPerAddr` matches started from one
//     network may run at once (room.create / room.start → ERR.RATE). Without them a socket loop could fill
//     `maxRooms` or keep hundreds of unattended matches simulating for the whole reconnect window.
//   * Permanent departure during a match (room.leave, g.leave, reconnect window expired): OWNER'S RULE — while at least
//     one OTHER human is still in the room the seat is handed to a fresh AI (Match.aiTakeOver: it keeps the whole
//     PlayerState — board, gold, loadout — and server/match/bot.js plays it on, so the side stays full), and the seat
//     shows as a bot in room.state. Only when no human seat is left does the seat depart for real (match.onLeave →
//     elimination / 'abandoned') and the room get disposed ('empty'); an all-AI match never keeps running.
//     'g.leave' is handled here and never reaches match.handle(). A TRANSIENT disconnect never hands the seat over: the
//     dropped human keeps the reconnect grace (the seat auto-plays its last lineup meanwhile) and the AI only takes it
//     once that grace lapses — a reconnect before it returns the seat to the human.
//   * All other 'g.*' messages go to room.match.handle(playerId, msg); its {ok}/{error} becomes the reply.
//   * Match lifecycle: room.start → new Match({...}) → room.state (inMatch=true) → match.start(). The match gets
//     `matchNo` = the room's match number (1, 2, …): with the seed it keeps battleIds unique across the room's
//     matches, so a late b.progress / b.result of the previous match is ignored by the next one (DESIGN §14).
//     onEnd(summary) → room back to LOBBY (departed seats freed, humans un-readied, disconnected humans
//     get the lobby grace), dispose() on the next macrotask. Players can start again.
//   * room.closed reasons: 'timeout' (removed after lobby grace), 'kicked' (room.kick, room.removeSpectator), 'empty' (a
//     spectator whose room lost its last player), 'shutdown' (server stopping).
//   * Operator loadout (DESIGN §16): room.loadout { entries } is checked strictly against the game data
//     (shared/protocol.js checkLoadout: known visible chess, a skill index legal for the normal AND the elite status, a
//     module of the elite or 'none'; any bad entry rejects the whole message, nothing is stored). ▸ It is stored on the
//     session (it follows the player into every room they create/join, and survives a resume) and on the seat; the
//     match receives seats[].loadout (bots: none — they fight with the defaults). ▸ Accepted any time: in a LOBBY room
//     (or outside a room) it simply replaces the stored one; while the room's match runs it is also handed to
//     match.setLoadout(playerId, loadout), which accepts it only during INFO_CHECK (the 干员调配 entry of the briefing)
//     and refuses it afterwards (WRONG_PHASE: the match's loadout is locked, the stored one applies to the next match).
//     ▸ Its `ops` (0.2.2: the per-operator 潜能 / 练度, shared/protocol.js checkLoadoutOps — an operator of the 干员调配
//     roster or the 自选 owned pool, strict like the entries) travel with it: session.ops / seat.ops / seats[].ops and
//     match.setLoadout(playerId, loadout, ops); a message without `ops` sets none (every operator 潜能 6, 精英2 Lv.60).
//   * Operator ownership (干员持有, 0.2.0 补位, owner's decision 2026-10-05): room.ownership { notOwned } — the base chess
//     ids the player marked as not owned — is checked leniently (shared/protocol.js checkNotOwned: anything that is not
//     a droppable NORMAL chess is dropped, never the whole list; only a malformed list is BAD_MSG) and stored on the
//     session and the seat like the loadout. The match receives seats[].notOwned when it starts (bots: none — they own
//     every operator) and keeps it for its whole length: the setting is out of match ("局外设置，下一局生效"), so while
//     the room's match runs a new list is only stored for the next match (ROOM_STARTED 'stored for the next match',
//     never handed to the match). A spectator's list stays on its session.
//   * 自选编队 (0.2.0 DIY, the owner's decisions of 2026-10-05): room.diy { picks } — the player's picks for the four DIY
//     slots ({ [slotBaseId]: { charId, skillIndex?, uniEquipId? } | null }) — is checked leniently (shared/protocol.js
//     checkDiyPicks against the game data and the kit registry, server/sim/content/kits/index.js KITTED_CHARS: an
//     illegal pick — an operator without a kit, another tier's prototype, a prototype off its locked skill, a second slot
//     of one owned operator, the same operator twice in a tier, an unknown slot / skill / module — is dropped, never the
//     whole roster; only malformed picks are BAD_MSG) and stored on the session and the seat exactly like the
//     not-owned list: the match receives seats[].diy when it starts (bots: none — they field no 自选 piece [ASSUMED]),
//     and a change while it runs is stored for the next match (ROOM_STARTED 'stored for the next match'). Every
//     `welcome` carries `diyKitted` (welcomeInfo): the operators a DIY slot may field, so the client's picker offers
//     exactly what the server accepts.
//   * Content identity (DESIGN §32, the plugin system's first step): the lobby is given the server's vanilla content
//     (server/plugins/identity.js; none in unit tests that build a Lobby without it). Every `welcome` carries
//     `content: { vanilla: <cs> }` — and `plugins: <n>` when this server has n > 0 unofficial plugins (every class but a
//     language: the title screen's 「本服务器安装了 N 个插件」; a page fetches the catalogue only when n > 0 and something
//     needs it, so a server without plugins sends exactly what it sent before) —, every room's `room.state.content` is
//     `{ cs, vanilla: true, plugins: [] }` while it has
//     no plugin, and the match receives `cs`, which it copies into every BattleSpec (the sim never reads it;
//     diagnostics and replays name the content with it).
//   * The room's plugins (DESIGN §32 P1a — cosmetic plugins only): room.setPlugins { plugins: [{ id }] } — host-only,
//     before the match, and ▸ like a difficulty change it un-readies the other humans. The lobby asks the server's
//     visual sets (server/plugins/visualSet.js resolve: loaded cosmetic plugins of scope `room`, their requirements
//     switched on, in load order, within the size limit — PLUGIN_UNKNOWN / PLUGIN_BLOCKED / PLUGIN_DEPENDENCY /
//     PLUGIN_CONFLICT / PLUGIN_LIMIT otherwise; none given to the Lobby → PLUGIN_UNKNOWN) and the room's content becomes
//     `{ cs, vanilla: true, vs, plugins: [{ id, version, class, hash, auto? }], warnings, bytes }`: `cs` stays the vanilla
//     one — art never changes a battle, so the match, its BattleSpecs and the golden results are those of the original
//     content and ▸ such a match counts as the original game in the statistics overview (the owner's decision of
//     2026-10-13: gameplay and numbers unchanged) —, `vs` names the
//     art every member's page draws with (/vs/<vs16>/overlay.json, composed by public/js/content.js on the page's own
//     manifest). An empty list brings back
//     exactly the vanilla shape above. The set is the room's: kept across its matches and a host change, held in the
//     visual sets while the room uses it (hold / release) and gone with the room. The same set again (the same `vs`)
//     un-readies nobody; ▸ when only its 「自动」 marks changed (a plugin first switched on automatically is now chosen, or
//     the other way round) the new state is broadcast without un-readying. A request that changes nothing (the same `vs`
//     and the same marks) — or a refused one — leaves the host's result replay (a settlement screen still open:
//     dropReplay; a change is the host moving on). ▸ When a plugin of the room's set changes on disk while the room holds
//     it (the visual sets' onStale, after the registry read the folders again), the host is told once (an m.toast: apply
//     the room's plugins again — the panel's 「重新应用」 sends the same list, which resolves to the set of the files as
//     they are now) — during a match, once the room is back in its lobby (onMatchEnd), when it can be done; nothing
//     changes by itself.
//   * Gameplay plugins (DESIGN §32.6, P1c): room.setPlugins also takes the server's content plugins (data: numbers,
//     records, modes). The lobby's `plugins` (server/plugins/roomSets.js) closes the list over its requirements, refuses
//     conflicts, other classes and scopes, what the server owner's plugins/config.json does not allow and — unless it
//     allows them — gameplay plugins made for other game versions (PLUGIN_INCOMPATIBLE), and builds the room's content set:
//     a `cs` of its own (server/plugins/contentSets.js; at most limits.maxSets such sets held by rooms at once, else
//     PLUGIN_BUSY). The room's content is then `{ cs, vanilla: false, plugins: [{ id, version, class, hash, auto? }],
//     warnings, bytes, dataBytes, vs?, modes?, modeId? }` and ▸ the room is held to it like to a visual set (holdContent /
//     releaseContent). Its members' pages load and check that set (/cs/<cs16>/…, public/js/content.js) and say so with
//     room.contentReady { cs } — `seats[].content` (and `spectators[].content`) is 'loading' | 'ready' | 'failed' in such a
//     room only, reset to 'loading' when the set changes and when the member's socket drops (a reloaded page loads it
//     again); room.ready { ready: true } and room.start wait for every player's 'ready' (CONTENT_NOT_READY). A new room
//     starts with the policy's `default` plugins (none: the original game).
//     room.setMode { modeId } (host, before the match): an official mode of the room's type sets the difficulty; a mode
//     of the room's content set (content.modes, same room type) becomes content.modeId — the match's modeId — until the
//     host picks a difficulty or the set no longer has it; ▸ like a difficulty change it un-readies the other humans.
//     The match of such a room runs in that set's match host worker (server/match/host/: hosts.create — the match is a
//     MatchProxy whose answers are Promises), with opts.cs = the set's cs, opts.requireCs (a b.result naming another
//     content is refused) and opts.vs; ▸ every message and event of such a room is handled in order, one at a time, on
//     the room's own queue (serial): a request waits for the previous one's answer. A vanilla room never queues — its
//     match is in this process and answers at once, exactly as before. A loadout, 干员持有 list or 自选 roster stored while
//     the player was in a room of another content is filtered to the room's data when its match starts (an id the set
//     does not know is dropped, the rest kept — design study §6.9), and room.loadout / room.ownership / room.diy are
//     checked against the room's own data (and its 自选 list). When the worker stops (a crash, the watchdog), the match
//     ends with summary.reason 'plugin-crash' | 'plugin-hang' | 'plugin-start' and the room is back in its lobby.
//   * Spectator seats (community report #26, owner's decision 2026-10-04 — a remake feature, the official room has none):
//     room.spectate { code } takes one of a co-op room's MAX_SPECTATORS (2) spectator seats, in its lobby or while its
//     match runs (▸ solo rooms: ROOM_FULL). A spectator is not a player: never in `seats`, never counted for the 1–4 players
//     or the start gate, never host, never keeps a room alive (a room whose last human leaves closes with room.closed
//     {empty} for its spectators). It receives room.state (`spectators: [{ playerId, name, connected }]`) and every match
//     broadcast (m.public, m.ticker, m.emote, b.pool — public data); the match registers it (opts.spectators /
//     addSpectator) and shows it fields like an eliminated player (b.start watch / m.field), never an m.private. It may
//     only g.watch (the heavy bucket, like every watcher), g.leave / room.leave, and room.loadout / room.ownership /
//     room.diy (stored for its session, never handed to the match); anything else → SPECTATOR (▸ emotes too). Host: room.removeSpectator { playerId } any
//     time → room.closed {kicked} to it. A spectator in a LOBBY room may take a free player seat with room.join of the same
//     code; a player never switches to spectating in place (ALREADY). Disconnect / grace / reconnect / expiry work as for
//     a player seat (the seat is kept and given back on resume) EXCEPT that a dropped spectator's seat is freed by the
//     lobby grace even while the match runs — holding it for the whole 10-minute reconnect window locked one of the two
//     seats and shut later watchers out ("进不了房间", 2026-10-06).

import { randomBytes, randomInt } from 'node:crypto';
import { DIFFICULTIES, ERR, MAX_SEATS, MAX_SPECTATORS, ROOM_CODE_LEN, modeIdFor, NAME_MAX_LEN, NOTICE_HISTORY, NOTICE_MAX_LEN, CHAT_MAX, CHAT_RATE_WINDOW_MS, CHAT_RATE_LIMIT } from '../shared/constants.js';
import { checkLoadout, checkLoadoutOps, cultivationCharIds, checkNotOwned, checkDiyPicks, charPotentialChanges, checkSkinSelection, operatorCharIds } from '../shared/protocol.js';
import { CLOSE, encode, isDroppable, isErrCode, presenceOnline, sanitizeName, sendRaw, sendSession } from './net.js';
import { getData as defaultGetData, lookup } from './data.js';
import { Match as DefaultMatch } from './match/Match.js';
import { Matchmaker } from './matchmaker.js';
import { BootGate } from './bootgate.js';
import { KITTED_CHARS } from './sim/content/kits/index.js';
import { parseTestModeEnv, testModeGate, unrecognizedTestMode } from './testMode.js';
import { isContentHash } from '../shared/plugins/identity.js';
import { OFFICIAL_ORIGIN, isLocalOrigin, normalizeOrigin } from '../shared/origins.js';
import { msg, wireMessage } from '../shared/i18n.js';

/** Room code alphabet: uppercase letters without I and O (and no digits, so no 0/1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Tunables. */
export const LOBBY_DEFAULTS = Object.freeze({
  lobbyGraceMs: 60_000,   // disconnected humans keep their lobby seat this long
  maxRooms: 1000,
  maxRoomsPerAddr: 16,    // rooms created from one client network that may exist at once (0 = unlimited)
  maxMatchesPerAddr: 8,   // matches started from one client network that may run at once (0 = unlimited)
  resyncMinGapMs: 1000,   // heavy resyncs (match state / result replay) per session at most this often on repeated hellos
  soloReconnectWindowMs: null, // a dropped solo run stays resumable this long (null = data singleReconnectTime, 24 h)
  bootSlots: 1,           // boot art preloads that may run at once (server/bootgate.js; 0/1 = one client at a time)
  bootHoldMs: 180_000,    // a slot is freed this long after a claim with no release (a tab that never finished)
  chatRateLimit: CHAT_RATE_LIMIT,       // room.chat (docs/MATCHMAKING.md §38): messages per session per window
  chatRateWindowMs: CHAT_RATE_WINDOW_MS, // ...the sliding window a session's chat messages are counted over
  officialOrigin: OFFICIAL_ORIGIN,      // where players should log in (a foreign page origin gets a plain reminder)
});

/** Official `singleReconnectTime` (s) when the data lacks it (constData, research 01 §1). */
export const SOLO_RECONNECT_FALLBACK_SEC = 86_400;

/** Display names for AI teammates (the tutorial NPCs first, then a few familiar faces). */
export const BOT_NAMES = Object.freeze(['AI·华法琳', 'AI·阿米娅', 'AI·惊蛰', 'AI·杜宾', 'AI·凯尔希', 'AI·可露希尔']); // i18n-ignore: player names (docs/I18N.md)

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });
/** A match's answer to a request as the platform replies it: OK, or its error (an unknown code: INTERNAL). */
const matchAnswer = (res) => (res && typeof res === 'object' && res.error
  ? fail(isErrCode(res.error) ? res.error : ERR.INTERNAL, typeof res.detail === 'string' ? res.detail : undefined)
  : OK);
const noopLog = { info() {}, warn() {}, error() {}, debug() {} };

/** Control / bidi / zero-width junk stripped from player chat text (a message is plain text, one line). */
const CHAT_STRIP = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u206f\ufeff]/g;
const CHAT_LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Clean one chat message: NFC, control / bidi / zero-width characters and lone surrogates removed, whitespace collapsed
 * to single spaces, trimmed. No length cap here — the caller enforces CHAT_MAX. Empty / only-junk returns ''.
 * @param {unknown} raw
 * @returns {string}
 */
function cleanChatText(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(CHAT_LONE_SURROGATE, '').replace(CHAT_STRIP, '').replace(/\s+/g, ' ').trim();
}

/**
 * @typedef {{ seat: number, playerId: string, name: string, role?: string|null, isBot: boolean, ready: boolean,
 *             connected: boolean, left: boolean, loadout?: Record<string, { skill: number, module: string|null }> | null,
 *             ops?: Readonly<Record<string, { potential: number, cultivate: number }>> | null,
 *             notOwned?: readonly string[] | null, diy?: Readonly<Record<string, DiyLoadout>> | null,
 *             content?: 'ready' | 'failed' | null, loadoutCs?: string | null, notOwnedCs?: string | null, diyCs?: string | null }} Seat
 *   content: a room with gameplay plugins — whether the player's page loaded and checked its content (header "Gameplay
 *   plugins"; null = still loading); loadoutCs / notOwnedCs / diyCs: the content its settings were checked for
 * @typedef {{ charId: string, skillIndex: number, uniEquipId: string|null }} DiyLoadout
 */

/** Deep-frozen copy of a checked loadout (shared by the session, the seat and the match's PlayerState). */
function freezeLoadout(loadout) {
  const out = {};
  for (const [id, e] of Object.entries(loadout || {})) out[id] = Object.freeze({ skill: e.skill, module: e.module ?? null });
  return Object.freeze(out);
}

/** Deep-frozen copy of checked operator settings (0.2.2 潜能 / 练度; shared by the session, the seat and the match). */
function freezeOps(ops) {
  const out = {};
  for (const [id, e] of Object.entries(ops || {})) out[id] = Object.freeze({ potential: e.potential, cultivate: e.cultivate });
  return Object.freeze(out);
}

/** The charIds a player may set a potential / 练度 for, per data object (shared/protocol.js cultivationCharIds). */
const OPS_IDS = new WeakMap();
function opsCharIds(data) {
  if (!data || typeof data !== 'object') return new Set();
  let ids = OPS_IDS.get(data);
  if (!ids) { ids = cultivationCharIds(data.chess, data.backups); OPS_IDS.set(data, ids); }
  return ids;
}

/** Deep-frozen copy of checked 自选 picks (shared by the session, the seat and the match's PlayerState). */
function freezeDiy(picks) {
  const out = {};
  for (const [id, p] of Object.entries(picks || {})) out[id] = Object.freeze({ charId: p.charId, skillIndex: p.skillIndex, uniEquipId: p.uniEquipId ?? null });
  return Object.freeze(out);
}

/** Frozen copy of a skin selection; null refuses the whole map. */
function freezeSkins(skins, hasOperator) {
  const res = checkSkinSelection(skins, hasOperator);
  if (!res.ok) return null;
  return Object.freeze({ ...res.skins });
}

/** One room: 4 seat slots, host, difficulty, optional running match. */
export class Room {
  /** @param {string} code @param {'solo'|'coop'} mode @param {string} difficulty @param {number} now */
  constructor(code, mode, difficulty, now) {
    this.code = code;
    this.mode = mode;
    this.difficulty = difficulty;
    /**
     * 「AI 队友最后选择」 (room.setAiPicksLast, GitHub #338; co-op only, off by default): the match's strategy and 机变 drafts
     * put every human seat before every AI seat (Match opts.aiPicksLast). Kept across the room's matches.
     */
    this.aiPicksLast = false;
    /** @type {string | null} */
    this.hostId = null;
    /** @type {(Seat | null)[]} */
    this.seats = new Array(MAX_SEATS).fill(null);
    /** @type {{ playerId: string, name: string, role?: string|null, connected: boolean }[]} spectator seats, ≤ MAX_SPECTATORS (header) */
    this.spectators = [];
    /** @type {any} running Match instance */
    this.match = null;
    /** @type {{ live: boolean, ended: boolean, disposed: boolean, match: any } | null} */
    this.matchCtx = null;
    this.matchCount = 0;
    /** @type {any} summary passed to onEnd by the last match */
    this.lastSummary = null;
    /**
     * Frames of the last match's end, replayed on resync to humans who have not moved on yet.
     * @type {{ publicFrame: string | null, frames: Map<string, string>, pending: Set<string> } | null}
     */
    this.replay = null;
    /** @type {string[] | null} plugins of the room's set that changed on disk — the host not told yet (Lobby.pluginsChanged) */
    this.pluginsChanged = null;
    /** @type {string | null} per-network limit key of the creator (net.js clientAddress) */
    this.ownerKey = null;
    /** @type {string | null} per-network limit key of whoever started the running match */
    this.matchKey = null;
    this.createdAt = now;
    this.disposed = false;
    /** Listed in the lobby's 公开同盟 directory (server/admin.js buildPublicSnapshot). Solo and 野排 (auto) rooms are
     *  never listed whatever this says; `create` sets it from the room.create `public` flag. */
    this.public = true;

    /**
     * The content set the room plays (DESIGN §32): `{ cs, vanilla, plugins }` — the server's vanilla set, or with the
     * cosmetic plugins its host switched on (header "The room's plugins": `vs`, `warnings`, `bytes` beside them), or a
     * content set with gameplay plugins (header "Gameplay plugins": `vanilla: false`, its own cs, `dataBytes`, `modes`,
     * `modeId`); null when the lobby has no content identity (room.state then carries none).
     * @type {Readonly<{ cs: string, vanilla: boolean, plugins: readonly object[], vs?: string, warnings?: readonly object[],
     *   bytes?: number, dataBytes?: number, modes?: readonly object[], modeId?: string }> | null}
     */
    this.content = null;
    /** Test room (only when the process switch allows it). Never flipped later. */
    this.test = false;
    /** the room's queue (header "Gameplay plugins": Lobby.serial): what is still waiting or running, and its tail */
    this.queue = { pending: 0, tail: Promise.resolve() };
  }

  /** Does the room play a content set with gameplay plugins (its own cs; header "Gameplay plugins")? */
  get modded() { return !!this.content && this.content.vanilla === false; }

  /** @param {string} playerId @returns {Seat | null} */
  seatOf(playerId) {
    for (const s of this.seats) if (s && s.playerId === playerId) return s;
    return null;
  }

  /** @param {string} playerId @returns {{ playerId: string, name: string, connected: boolean } | null} */
  spectatorOf(playerId) { return this.spectators.find((s) => s.playerId === playerId) || null; }

  /** Lowest free seat index, or -1. */
  freeSeat() { return this.seats.indexOf(null); }

  /** Humans that have not departed, in seat order. @returns {Seat[]} */
  activeHumans() { return this.seats.filter((s) => s && !s.isBot && !s.left); }

  /** `room.state` frame (DESIGN §8.1) plus `inMatch`. */
  toState() {
    return {
      t: 'room.state',
      code: this.code,
      hostId: this.hostId,
      mode: this.mode,
      difficulty: this.difficulty,
      aiPicksLast: this.aiPicksLast,
      inMatch: !!this.match,
      // 野排 (auto-matched) vs a hand-made / 同盟密钥 room: the client keeps them apart (e.g. only key rooms go into
      // the "最近同盟" list, and only auto rooms disband after a match) — docs/MATCHMAKING.md.
      auto: !!this.auto,
      // whether this 同盟 room is listed in the lobby's 公开同盟 directory (the room screen shows a 公开/仅密钥 badge)
      public: !!this.public,
      ...(this.test ? { test: true } : {}),
      seats: this.seats.map((s) => (s
        ? { seat: s.seat, playerId: s.playerId, name: s.name, role: s.role ?? null, isBot: s.isBot, ready: s.ready, connected: s.connected && !s.left, fromAi: !!s.fromAi, ...(s.art ? { art: s.art } : {}), ...(s.avatar ? { avatar: s.avatar } : {}), ...(this.modded && !s.isBot ? { content: s.content || 'loading' } : {}) }
        : null)),
      spectators: this.spectators.map((s) => ({ playerId: s.playerId, name: s.name, role: s.role ?? null, connected: s.connected, ...(s.art ? { art: s.art } : {}), ...(s.avatar ? { avatar: s.avatar } : {}), ...(this.modded ? { content: s.content || 'loading' } : {}) })),
      ...(this.content ? { content: this.content.trusted ? { ...this.content, trusted: { ...this.content.trusted, consent: Object.fromEntries(this.seats.filter((s) => s && !s.isBot).map((s) => [s.seat, s.consentCs === this.content.cs])) } } : this.content } : {}),
    };
  }
}

/** Room registry + lobby message handlers. Pass an instance as the `handler` of net.js Network. */
export class Lobby {
  /**
   * @param {{
   *   registry: import('./net.js').SessionRegistry,
   *   log?: { info: Function, warn: Function, error: Function, debug?: Function },
   *   MatchClass?: new (opts: object) => any,
   *   getData?: () => object,
   *   now?: () => number,
   *   seedFn?: () => number,
   *   content?: { cs: string } | null,
   *   plugins?: { resolve: (ids: string[], opts?: { scope?: 'room' | 'personal', settings?: object, replacing?: object | null }) => any,
   *     hold?: (vs: string) => void, release?: (vs: string) => void, holdContent?: (cs: string) => void,
   *     releaseContent?: (cs: string) => void, onStale?: (fn: (vs: string, ids: string[]) => void) => () => void,
   *     unofficial?: () => number, defaults?: () => string[], dataOf?: (cs: string) => any, kittedOf?: (cs: string) => any,
   *     contentInUse?: () => number } | null,
   *   hosts?: { create: (cs: string, opts: object) => any, stats?: () => object } | null,
   *   options?: Partial<typeof LOBBY_DEFAULTS>,
   * }} opts
   *   content: the server's vanilla content (server/plugins/identity.js; header "Content identity"); plugins: what a host
   *   chooses from — the room's sets (server/plugins/roomSets.js: visual sets and content sets; header "The room's
   *   plugins", "Gameplay plugins"); hosts: the match hosts a room with gameplay plugins runs its match in
   *   (server/match/host/index.js; none: such a match runs here, unit tests)
   */
  constructor({ registry, log = noopLog, MatchClass = DefaultMatch, getData = defaultGetData, now = Date.now, seedFn, content = null, plugins = null, hosts = null, options = {}, auth = null, matchmaker = null, community = null, stats = null }) {
    this.registry = registry;
    /** the vanilla content set every room plays (header "Content identity"), or null */
    this.vanilla = content && isContentHash(content.cs) ? Object.freeze({ cs: content.cs, vanilla: true, plugins: Object.freeze([]) }) : null;
    /** the server's room sets — visual and content (header "The room's plugins", "Gameplay plugins"), or null */
    this.plugins = plugins;
    /** the match hosts (header "Gameplay plugins"), or null */
    this.hosts = hosts;
    this.log = log;
    this.MatchClass = MatchClass;
    this.getData = getData;
    this.now = now;
    this.seedFn = seedFn || (() => randomInt(2 ** 32));
    this.opts = { ...LOBBY_DEFAULTS, ...options };
    /** The public origin players should use; a page opened on another origin gets a plain reminder. */
    this.officialOrigin = normalizeOrigin(options.officialOrigin ?? process.env.SP_OFFICIAL_ORIGIN) || OFFICIAL_ORIGIN;
    const testModeOpt = options.testMode;
    const testHostOpt = options.testHost;
    delete this.opts.testMode;
    delete this.opts.testHost;
    const rawTestMode = testModeOpt != null ? testModeOpt : (process.env.SP_TEST_MODE);
    this.testMode = parseTestModeEnv(rawTestMode);
    this.testUnrecognized = unrecognizedTestMode(rawTestMode);
    this.testHost = '';
    this.testEnabled = false;
    this.testWarn = this.testUnrecognized;
    if (testHostOpt != null) this.setTestHost(testHostOpt);
    /** @type {import('./auth.js').AuthService | null} accounts (野排 requires a bound one; null = guests only) */
    this.auth = auth;
    /** @type {import('./community.js').CommunityService | null} changelog + bug reports (null disables bug.report) */
    this.community = community;
    /** @type {import('./stats.js').StatsService | null} match statistics (null disables stats.*) */
    this.matchStats = stats;
    /** @type {import('./net.js').Network | null} set by index.js; lets the lobby close a socket the net way (kick) */
    this.network = null;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** Boot art preload gate (server/bootgate.js): at most `bootSlots` cold preloads at once. */
    this.bootGate = new BootGate({ maxConcurrent: this.opts.bootSlots, holdMs: this.opts.bootHoldMs, now });
    /** @type {Map<string, NodeJS.Timeout>} lobby grace timers by playerId */
    this.graceTimers = new Map();
    /** @type {Map<string, NodeJS.Timeout>} deferred (coalesced) resyncs by playerId */
    this.resyncTimers = new Map();
    /**
     * Operator notices (the admin page's 通知 panel): the broadcast history, newest first, ≤ NOTICE_HISTORY.
     * @type {Array<{ id: string, text: string, sign: string|null, at: number, scope: string, sent: number }>}
     */
    this.notices = [];
    this._noticeSeq = 0;
    /** per-network limit warnings: at most one log line per 10 s (the rest are counted) */
    this.limitLog = { at: -Infinity, suppressed: 0 };
    /**
     * 野排 shared pool (server/matchmaker.js): matching sessions become a ready co-op room (createMatchedRoom).
     * @type {import('./matchmaker.js').Matchmaker}
     */
    this.mm = matchmaker || new Matchmaker({
      now, log,
      onMatch: (sessions, info) => this.createMatchedRoom(sessions, info),
      onState: (session, state) => { if (session?.connected) sendSession(session, { t: 'mm.state', ...state }); },
    });
    /** log lines said once (warnOnce) */
    this.told = new Set();
    /** a held visual set whose plugins changed on disk: its rooms' hosts are told (header "The room's plugins") */
    this.offStale = typeof plugins?.onStale === 'function' ? plugins.onStale((vs, ids) => this.pluginsChanged(vs, ids)) : null;
  }

  /**
   * The plugins `ids` of the visual set `vs` changed on disk: the host of every room using it is told to apply the room's
   * plugins again (header "The room's plugins") — a host offline now misses it; the panel's 「重新应用」 is always there.
   * @param {string} vs @param {string[]} ids
   */
  pluginsChanged(vs, ids) {
    for (const room of this.rooms.values()) {
      if (room.disposed || room.content?.vs !== vs) continue;
      this.log.info(`[lobby] ${room.code} plugins changed on disk: ${ids.join(', ')} — the host is asked to apply them again`);
      // during a match the panel cannot change them: the host hears it once the room is back in its lobby (onMatchEnd)
      room.pluginsChanged = ids;
      if (!room.match) this.tellPluginsChanged(room);
    }
  }

  /** Tell the host of `room` that its plugins changed on disk (pluginsChanged), once. @param {Room} room */
  tellPluginsChanged(room) {
    const ids = room.pluginsChanged;
    room.pluginsChanged = null;
    // the room's set changed since (re-applied, switched off): nothing to tell
    if (!ids || !room.content?.vs) return;
    const names = ids.slice(0, 8).join('、');
    this.sendToPlayer(room, room.hostId, { t: 'm.toast', kind: 'warn', ...wireMessage(msg('房间插件「{names}」的文件在服务器上变了，请在插件面板中点「重新应用」', { names })) });
  }

  /** @param {string} code @returns {Room | null} */
  getRoom(code) { return this.rooms.get(String(code).toUpperCase()) || null; }

  /**
   * Operator broadcast (the admin page's 通知 panel): push one notice to the sessions connected RIGHT NOW — every
   * logged-in account by default, everyone (guests included) with `scope: 'all'`. The notice is kept in `this.notices`
   * (newest first, ≤ NOTICE_HISTORY) so the admin page can show what was sent. Deploys / restarts announce themselves
   * this way (docs/MATCHMAKING.md §28), signed `d星空之下`.
   *
   * Two kinds (2026-10-25): a PLAIN notice only reaches the live sessions; a CHANGELOG notice additionally becomes the
   * running 更新日志's next minor version. `changelog` defaults to false, so operational notices stay out of the log.
   * @param {{ text: string, sign?: string|null, scope?: 'accounts'|'all', changelog?: boolean }} opts
   * @returns {{ ok: true, notice: object, sent: number, changelog: object|null } | { error: string }}
   */
  broadcastNotice({ text, sign = null, scope = 'accounts', changelog = false } = {}) {
    const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const body = clean(text, NOTICE_MAX_LEN);
    if (!body) return { error: 'BAD_NOTICE' };
    const at = this.now();
    const notice = {
      id: `${at}-${++this._noticeSeq}`,
      text: body,
      sign: clean(sign, NAME_MAX_LEN) || null,
      at,
      scope: scope === 'all' ? 'all' : 'accounts',
      kind: changelog === true ? 'changelog' : 'plain',
      version: null,
      sent: 0,
    };
    const frame = { t: 'sys.notice', id: notice.id, text: notice.text, sign: notice.sign, at: notice.at, kind: notice.kind };
    for (const session of this.registry.all()) {
      if (!session.connected) continue;
      if (notice.scope === 'accounts' && session.accountId == null) continue;
      if (sendSession(session, frame)) notice.sent += 1;
    }
    this.notices.unshift(notice);
    if (this.notices.length > NOTICE_HISTORY) this.notices.length = NOTICE_HISTORY;
    // A CHANGELOG notice also becomes the running 更新日志's next minor version (docs/MATCHMAKING.md §36.2/§36.3): this
    // write must NEVER block or break the broadcast, so a failure is only logged and the push above still stands.
    let entry = null;
    if (notice.kind === 'changelog' && this.community && typeof this.community.recordNotice === 'function') {
      try {
        const c = this.community.recordNotice({ text: notice.text, releasedAt: at });
        if (c && c.ok) {
          entry = { id: c.id, version: c.version, minor_seq: c.minor_seq };
          notice.version = c.version;
        } else this.log.warn?.(`[lobby] notice changelog skipped: ${c && c.error}`);
      } catch (e) {
        this.log.warn?.(`[lobby] notice changelog failed: ${e?.message}`);
      }
    }
    this.log.info(`[lobby] notice (${notice.kind}) → ${notice.sent} session(s) (${notice.scope}): ${notice.text.slice(0, 40)}`);
    return { ok: true, notice, sent: notice.sent, changelog: entry };
  }

  /** Counters for /healthz. */
  stats() {
    let matches = 0;
    let humans = 0;
    let bots = 0;
    let online = 0;
    // authoritative presence (server/net.js presenceOnline): live sockets + logged-in sessions inside their 5-min grace
    const now = this.now();
    for (const s of this.registry.all()) if (presenceOnline(s, now)) online++;
    let spectators = 0;
    for (const r of this.rooms.values()) {
      if (r.match) matches++;
      for (const s of r.seats) if (s && !s.left) (s.isBot ? bots++ : humans++);
      spectators += r.spectators.length;
    }
    return { rooms: this.rooms.size, matches, humans, bots, online, spectators };
  }

  // ---------------------------------------------------------------------------------------------------
  // net.js handler interface
  // ---------------------------------------------------------------------------------------------------

  /**
   * Remind a player who opened the game on an address other than `officialOrigin` (an IP, a mirror, http instead of
   * https): one private PLAIN `sys.notice` per new connection. Localhost / loopback is exempt so the owner's dev
   * server stays quiet. This never touches the admin history or the changelog.
   * @param {import('./net.js').Session | null | undefined} session
   * @returns {boolean} true when the reminder was sent
   */
  warnForeignOrigin(session) {
    const origin = normalizeOrigin(session?.origin);
    if (!origin || origin === this.officialOrigin || isLocalOrigin(origin)) return false;
    const shown = origin.length > 120 ? `${origin.slice(0, 117)}...` : origin;
    const text = wireMessage(msg(
      '检测到你正在通过 {origin} 进入游戏，请改用官方地址 {official}/ 登录；其他地址可能无法同步账号与更新。',
      { origin: shown, official: this.officialOrigin },
    )).text.slice(0, NOTICE_MAX_LEN);
    const sent = sendSession(session, { t: 'sys.notice', id: `origin:${session.playerId}`, text, sign: null, at: this.now(), kind: 'plain', origin: true });
    if (sent) this.log.info?.(`[lobby] non-official origin ${origin} (${session.name}); reminded to use ${this.officialOrigin}/`);
    return sent;
  }

  /**
   * After `welcome`: resend room state / match state for resumed (or repeated) hellos.
   * @param {import('./net.js').Session} session
   * @param {{ resumed: boolean, repeat: boolean }} info
   */
  onHello(session, { resumed, repeat, accountToken } = {}) {
    // the client's stored account session (docs/MATCHMAKING.md): rebind the session to that account and confirm it.
    if (accountToken && this.auth) {
      const acc = this.auth.resolve(accountToken);
      if (acc) {
        session.accountId = acc.id;
        session.accountToken = accountToken;
        session.name = acc.name;
        session.role = acc.role ?? null;
        session.art = acc.art ?? null;
        session.avatar = acc.avatar ?? null;
        this.kickOtherSessions(session, acc.id);
        sendSession(session, { t: 'auth.ok', account: acc, token: accountToken });
      } else if (session.accountToken) {
        session.accountId = null;
        session.accountToken = null;
        session.role = null;
        session.art = null;
        session.avatar = null;
        sendSession(session, { t: 'auth.error', code: 'SESSION_EXPIRED' });
      }
    }
    if (!repeat) this.warnForeignOrigin(session);
    if (!resumed && !repeat) return;
    const room = this.roomOf(session);
    if (!room) {
      if (session.notice) {
        sendSession(session, { t: 'room.closed', reason: session.notice });
        session.notice = null;
      }
      if (session.pendingResult) {
        for (const frame of session.pendingResult) if (frame) sendRaw(session.ws, frame);
        session.pendingResult = null;
      }
      return;
    }
    session.notice = null;
    session.pendingResult = null;
    // a player seat, or a spectator seat (header): both carry `connected` / `name`
    const seat = room.seatOf(session.playerId) || room.spectatorOf(session.playerId);
    this.clearGrace(session.playerId);
    // Only a visible change (reconnect, rename, new host) is broadcast; a plain resync (repeated hello on a
    // live socket) answers the requester alone, so hello spam cannot amplify into room-wide traffic.
    let changed = !seat.connected;
    seat.connected = true;
    if (!room.match && (seat.name !== session.name || (seat.role ?? null) !== (session.role ?? null))) {
      seat.name = session.name;
      seat.role = session.role ?? null;
      changed = true;
    }
    if (!room.hostId) { this.migrateHost(room); changed = true; }
    if (changed) this.broadcastState(room);
    else this.sendState(room, session);
    this.resync(session, !resumed);
  }

  /**
   * Validated client message from an identified session. A room whose match runs in a match host worker handles its
   * messages one at a time, in order (serial; header "Gameplay plugins"): the answer is then a Promise (server/net.js
   * replies when it settles).
   * @param {import('./net.js').Session} session
   * @param {any} msg
   * @returns {{ ok: true } | { error: string, detail?: string } | Promise<{ ok: true } | { error: string, detail?: string }>}
   */
  onMessage(session, msg) {
    const room = this.queuedRoom(session);
    return room ? this.serial(room, () => this.handleMessage(session, msg)) : this.handleMessage(session, msg);
  }

  /**
   * The room of `session` when its messages go through the room's queue: its match runs in a match host worker
   * (MatchProxy `hosted`), or something of the room is still pending. Null for every vanilla room.
   * @param {import('./net.js').Session} session
   */
  queuedRoom(session) {
    const room = session.roomCode ? this.rooms.get(session.roomCode) : null;
    return room && !room.disposed && (room.queue.pending > 0 || room.match?.hosted === true) ? room : null;
  }

  /**
   * Run `fn` on the room's queue (header "Gameplay plugins"): at once when nothing of the room is pending — a synchronous
   * answer stays synchronous —, else after everything before it has settled. An answer that is a Promise keeps the room's
   * queue busy until it settles.
   * @template T
   * @param {Room} room @param {() => T} fn
   * @returns {T | Promise<Awaited<T>>}
   */
  serial(room, fn) {
    const q = room.queue;
    if (q.pending === 0) {
      const r = fn();
      if (!r || typeof /** @type {any} */ (r).then !== 'function') return r;
      q.pending++;
      const done = Promise.resolve(r).finally(() => { q.pending--; });
      q.tail = done.then(() => {}, () => {});
      return /** @type {any} */ (done);
    }
    q.pending++;
    const done = q.tail.then(() => fn()).finally(() => { q.pending--; });
    q.tail = done.then(() => {}, () => {});
    return /** @type {any} */ (done);
  }

  /** An event of the room (a disconnect, a resync, an expiry) on its queue: nothing waits for it; a failure is logged. */
  queueEvent(room, fn) {
    let r;
    try { r = this.serial(room, fn); } catch (e) { this.log.error(`[lobby] ${room.code} a room event failed`, e); return; }
    if (r && typeof r.then === 'function') r.then(null, (e) => this.log.error(`[lobby] ${room.code} a room event failed`, e));
  }

  /**
   * One message (onMessage), now.
   * @param {import('./net.js').Session} session
   * @param {any} msg
   */
  handleMessage(session, msg) {
    switch (msg.t) {
      case 'room.create': return this.create(session, msg);
      case 'room.join': return this.join(session, msg);
      case 'room.leave': return this.leave(session);
      case 'room.ready': return this.ready(session, msg);
      case 'room.setDifficulty': return this.setDifficulty(session, msg);
      case 'room.setAiPicksLast': return this.setAiPicksLast(session, msg);
      case 'room.addBot': return this.addBot(session);
      case 'room.removeBot': return this.removeBot(session, msg);
      case 'room.kick': return this.kick(session, msg);
      case 'room.start': return this.start(session);
      case 'room.rerollSetup': return this.rerollSetup(session, msg);
      case 'room.cancelReroll': return this.rerollSetup(session, msg, true);
      case 'room.loadout': return this.loadout(session, msg);
      case 'room.skins': return this.skins(session, msg);
      // accounts & 野排 (docs/MATCHMAKING.md)
      case 'auth.register': return this.register(session, msg);
      case 'auth.login': return this.login(session, msg);
      case 'auth.logout': return this.logout(session);
      case 'account.setArt': return this.accountSetArt(session, msg);
      case 'account.setAvatar': return this.accountSetAvatar(session, msg);
      case 'mm.join': return this.mmJoin(session, msg);
      case 'mm.cancel': return this.mmCancel(session);
      // player bug report (server/community.js, docs/MATCHMAKING.md §36): TEXT + already-uploaded image ids
      case 'bug.report': return this.bugReport(session, msg);
      // match statistics (server/stats.js, docs/MATCHMAKING.md §40): the finished matches, per owner (account or guest)
      case 'stats.submit': return this.statsSubmit(session, msg);
      case 'stats.list': return this.statsList(session, msg);
      case 'stats.clear': return this.statsClear(session);
      case 'stats.view': return this.statsView(session, msg);
      // boot art preload gate (server/bootgate.js): one client downloads at a time, the rest wait their turn
      case 'boot.claim': return this.bootClaim(session);
      case 'boot.release': return this.bootRelease(session);
      case 'room.ownership': return this.ownership(session, msg);
      case 'room.diy': return this.diy(session, msg);
      case 'room.spectate': return this.spectate(session, msg);
      case 'room.removeSpectator': return this.removeSpectator(session, msg);
      case 'room.chat': return this.chat(session, msg);
      case 'room.setArt': return this.setArt(session, msg);
      case 'room.takeOver': return this.takeOver(session, msg);
      case 'room.releaseSeat': return this.releaseSeat(session);
      case 'room.setPlugins': return this.setPlugins(session, msg);
      case 'room.setMode': return this.setMode(session, msg);
      case 'room.contentReady': return this.contentReady(session, msg);
      case 'room.consent': return this.consent(session, msg);
      default:
        if (typeof msg.t === 'string' && msg.t.startsWith('g.')) return this.routeGameNow(session, msg);
        return fail(ERR.BAD_MSG, `unhandled type ${String(msg.t).slice(0, 32)}`);
    }
  }

  /** The session's socket closed. @param {import('./net.js').Session} session */
  onDisconnect(session) {
    this.mm.leave(session.playerId);
    this.bootRelease(session); // never let a closed tab hold the preload slot
    this.clearResync(session.playerId); // the next resume resyncs immediately
    const room = this.roomOf(session);
    // a solo run may be resumed within singleReconnectTime (24 h); everything else keeps the registry's window
    session.resumeWindowMs = room && room.match && room.mode === 'solo' ? this.soloResumeWindowMs() : null;
    if (!room) return;
    const player = room.seatOf(session.playerId);
    const seat = player || room.spectatorOf(session.playerId);
    seat.connected = false;
    if (room.modded) seat.content = null;
    // a spectator is only a watcher: it gets the same grace / reconnect as a player, but its seat is freed by that
    // grace even while the match runs — holding it for the whole registry window (10 min) would lock one of the
    // MAX_SPECTATORS (2) seats and shut later watchers out (the reported "进不了房间").
    if (player && room.match) this.callMatch(room, 'onDisconnect', session.playerId);
    // arm the lobby grace for every drop: a spectator's seat frees mid-match, and a human's frees when the whole party
    // is abandoned (no connected human left) — a live party and a solo run keep their seats (startGrace's guard).
    this.startGrace(room, seat);
    this.broadcastState(room);
  }

  /** The session's reconnect window elapsed (already removed from the registry). */
  onExpire(session) {
    this.mm.leave(session.playerId);
    this.bootRelease(session);
    session.notice = null;
    session.pendingResult = null;
    this.clearResync(session.playerId);
    const code = session.roomCode;
    const room = code ? this.rooms.get(code) : null;
    // in order with the room's messages when its match runs in a match host worker (header "Gameplay plugins")
    if (room && this.queuedRoom(session)) {
      this.queueEvent(room, () => { if (session.roomCode === code) session.roomCode = null; this.removeMember(room, session.playerId); });
      return;
    }
    session.roomCode = null;
    if (room) this.removeMember(room, session.playerId);
  }

  /**
   * Dispose every room (notifying members with room.closed) — used on server shutdown.
   * @param {string} [reason]
   */
  shutdown(reason = 'shutdown') {
    this.mm.dispose();
    this.offStale?.();
    this.offStale = null;
    for (const room of [...this.rooms.values()]) this.disposeRoom(room, reason);
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    for (const t of this.resyncTimers.values()) clearTimeout(t);
    this.resyncTimers.clear();
  }

  // ---------------------------------------------------------------------------------------------------
  // room.* handlers
  // ---------------------------------------------------------------------------------------------------

  /**
   * The address this process bound. Test rooms stay disabled until this runs. `host` empty fails closed.
   * @param {string} host
   * @returns {{ enabled: boolean, warn: string|null }}
   */
  setTestHost(host) {
    this.testHost = typeof host === 'string' ? host : '';
    const gate = testModeGate(this.testMode, this.testHost);
    this.testEnabled = gate.enabled === true;
    this.testWarn = this.testUnrecognized || gate.warn;
    return { enabled: this.testEnabled, warn: this.testWarn };
  }

  create(session, { mode, difficulty, public: isPublic, test = false }) {
    if (test === true && this.testEnabled !== true) return fail(ERR.TEST_DISABLED);
    const cur = this.roomOf(session);
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    if (this.rooms.size >= this.opts.maxRooms) return fail(ERR.INTERNAL, 'too many rooms');
    const key = session.limitKey || null;
    if (key && this.opts.maxRoomsPerAddr > 0) {
      // The room being left disappears with this create when the creator is its only human (a spectator is none).
      const leaving = cur && cur.ownerKey === key && cur.activeHumans().length === 1 && !cur.spectatorOf(session.playerId) ? 1 : 0;
      if (this.countRooms((r) => r.ownerKey === key) - leaving >= this.opts.maxRoomsPerAddr) {
        this.limitWarn(`room limit (${this.opts.maxRoomsPerAddr}) reached for ${session.addr}`);
        return fail(ERR.RATE, 'too many rooms from your network');
      }
    }
    const code = this.genCode();
    if (!code) return fail(ERR.INTERNAL, 'no room code available');
    if (cur) this.removeMember(cur, session.playerId);
    this.mm.leave(session.playerId); // creating a room leaves the 野排 shared pool (you can't be in both)
    const room = new Room(code, mode, difficulty, this.now());
    room.test = test === true;
    room.content = this.vanilla;
    // the server owner's default plugins (plugins/config.json `default`; header "Gameplay plugins"): none — the original game
    const defaults = this.plugins?.defaults?.() || [];
    if (defaults.length) {
      const r = this.resolveContent(room, defaults);
      if ('error' in r) this.warnOnce(`[lobby] the default plugins (${defaults.join(', ')}) cannot be applied: ${r.error}${r.detail ? ` (${r.detail})` : ''}`);
      else { room.content = r.content; this.holdContent(r.content); }
    }
    room.ownerKey = key;
    // 公开同盟 opt-out: only a hand-made co-op room can be listed, and only when the creator left it public.
    room.public = mode === 'coop' && isPublic !== false;
    room.seats[0] = this.humanSeat(0, session);
    room.hostId = session.playerId;
    this.rooms.set(code, room);
    session.roomCode = code;
    session.notice = null;
    session.pendingResult = null;
    this.log.info(`[lobby] ${code} created (${mode}/${difficulty}${room.test ? ', test' : ''}) by ${session.name}`);
    this.broadcastState(room);
    return OK;
  }

  join(session, { code, testAck }) {
    const norm = String(code).trim().toUpperCase();
    const room = norm.length === ROOM_CODE_LEN ? this.rooms.get(norm) : undefined;
    if (!room) return fail(ERR.ROOM_NOT_FOUND);
    if (room.test && testAck !== true) return fail(ERR.TEST_CONFIRM);
    const cur = this.roomOf(session);
    // idempotent for members; a spectator of this room goes on below: it may take a free player seat (header)
    if (cur === room && !room.spectatorOf(session.playerId)) { this.sendState(room, session); return OK; }
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (room.mode === 'solo') return fail(ERR.ROOM_FULL, 'solo room');
    const idx = room.freeSeat();
    if (idx < 0) return fail(ERR.ROOM_FULL);
    if (cur) this.removeMember(cur, session.playerId);
    this.mm.leave(session.playerId); // joining a room leaves the 野排 shared pool
    room.seats[idx] = this.humanSeat(idx, session);
    session.roomCode = room.code;
    session.notice = null;
    session.pendingResult = null;
    if (!room.hostId) room.hostId = session.playerId;
    this.broadcastState(room);
    return OK;
  }

  leave(session) {
    this.mm.leave(session.playerId); // defensive: leaving never keeps a 野排 queue slot
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    this.removeMember(room, session.playerId);
    return OK;
  }

  /**
   * room.spectate: one of a co-op room's MAX_SPECTATORS spectator seats, in its lobby or during its match (header). In a
   * running match the match registers the spectator and resends what it may see (Match.addSpectator).
   */
  spectate(session, { code, testAck }) {
    const norm = String(code).trim().toUpperCase();
    const room = norm.length === ROOM_CODE_LEN ? this.rooms.get(norm) : undefined;
    if (!room) return fail(ERR.ROOM_NOT_FOUND);
    if (room.test && testAck !== true) return fail(ERR.TEST_CONFIRM);
    const cur = this.roomOf(session);
    if (cur === room) {
      if (!room.spectatorOf(session.playerId)) return fail(ERR.ALREADY, 'seated as a player');
      this.sendState(room, session);
      return OK;
    }
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    if (room.mode === 'solo') return fail(ERR.ROOM_FULL, 'solo room');
    if (room.spectators.length >= MAX_SPECTATORS) return fail(ERR.ROOM_FULL, 'no free spectator seat');
    if (cur) this.removeMember(cur, session.playerId);
    room.spectators.push({ playerId: session.playerId, name: session.name, role: session.role ?? null, connected: session.connected, art: session.art ?? null, avatar: session.avatar ?? null });
    session.roomCode = room.code;
    session.notice = null;
    session.pendingResult = null;
    this.broadcastState(room);
    if (room.match) this.callMatch(room, 'addSpectator', session.playerId);
    return OK;
  }

  /**
   * room.takeOver { seat } (a spectator, docs/MATCHMAKING.md): the spectator takes over a BOT seat of the room it is
   * watching — the AI's board, gold and loadout become the human's. In the room's lobby the seat is swapped directly; in
   * a RUNNING match the match re-keys the bot's state to the human (Match.takeOver) and resends it the player view.
   * Players stay ≤ MAX_SEATS — only an AI seat can be taken (an empty seat is room.join).
   */
  takeOver(session, { seat }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.mode === 'solo') return fail(ERR.BAD_TARGET, 'solo room');
    if (!room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR, 'only a spectator may take over an AI');
    const ai = room.seats[seat];
    if (!ai || ai.left || !ai.isBot) return fail(ERR.BAD_TARGET, 'that seat is not an AI');
    if (room.activeHumans().length >= MAX_SEATS) return fail(ERR.ROOM_FULL, 'no free player seat');
    if (room.match && this.callMatch(room, 'takeOver', session.playerId, seat, session.name, session.role ?? null) !== true) {
      return fail(ERR.BAD_TARGET, 'takeover refused');
    }
    this.freeSpectatorSeat(room, session.playerId);   // it was watching; it plays now
    const s = room.seats[seat];
    if (s) {
      s.playerId = session.playerId;
      s.name = session.name;
      s.role = session.role ?? null;
      s.isBot = false;
      s.connected = true;
      s.ready = true;                                 // a running match never waits on a ready flag
      s.fromAi = true;                                // room.releaseSeat may hand it back to an AI
    }
    session.roomCode = room.code;
    session.notice = null;
    session.pendingResult = null;
    this.broadcastState(room);
    this.log.info(`[lobby] ${room.code} ${session.name} took over seat ${seat}`);
    return OK;
  }

  /**
   * room.releaseSeat (a human who took an AI over, docs/MATCHMAKING.md): hand the seat back to a fresh AI and return to a
   * spectator seat — the reverse of room.takeOver. The AI carries on with the board, gold and loadout the human had.
   * Owner's rule: a room lives only while it holds a human PLAYER. Releasing the last player's seat leaves only AI
   * seats — the releaser watches but is not a player — so the room (and its match) is destroyed at once, never left
   * as a spectator-only / all-AI room (spectators do not keep a room alive, the same as room.leave).
   */
  releaseSeat(session) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.mode === 'solo') return fail(ERR.BAD_TARGET, 'solo room');
    const seat = room.seatOf(session.playerId);
    if (!seat || seat.isBot) return fail(ERR.NOT_IN_ROOM);
    if (!seat.fromAi) return fail(ERR.BAD_TARGET, 'this seat was not taken over from an AI');
    if (room.spectators.length >= MAX_SPECTATORS) return fail(ERR.ROOM_FULL, 'no free spectator seat');
    const bot = this.makeBot(room, seat.seat);
    if (room.match && this.callMatch(room, 'releaseSeat', session.playerId, bot.playerId, bot.name) !== true) {
      return fail(ERR.BAD_TARGET, 'release refused');
    }
    const wasHost = room.hostId === session.playerId;
    seat.playerId = bot.playerId;
    seat.name = bot.name;
    seat.role = null;
    seat.isBot = true;
    seat.connected = true;
    seat.ready = true;
    seat.fromAi = false;
    delete seat.loadout;
    room.spectators.push({ playerId: session.playerId, name: session.name, role: session.role ?? null, connected: session.connected, art: session.art ?? null, avatar: session.avatar ?? null });
    session.roomCode = room.code;
    if (room.activeHumans().length === 0) {
      // no human player is left (spectators are not players): the last player released its seat → destroy the room
      this.disposeRoom(room, 'empty');
      return OK;
    }
    if (wasHost) this.migrateHost(room);   // never leaves the host on the released (now AI) seat
    this.broadcastState(room);
    this.log.info(`[lobby] ${room.code} ${session.name} released seat ${seat.seat} back to an AI`);
    return OK;
  }

  /** room.removeSpectator (host, any time): the spectator gets room.closed {kicked} and its seat is freed. */
  removeSpectator(session, { playerId }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (!room.spectatorOf(playerId)) return fail(ERR.BAD_TARGET, 'not a spectator of this room');
    const target = this.registry.byId(playerId);
    const wasHere = !!target && target.roomCode === room.code;
    const replay = this.replayFor(room, playerId);
    this.removeMember(room, playerId);
    if (wasHere) {
      // like room.kick: now, or on the next resume (with the result replay, as after the grace timeout)
      if (target.connected) sendSession(target, { t: 'room.closed', reason: 'kicked' });
      else { target.notice = 'kicked'; target.pendingResult = replay; }
    }
    return OK;
  }

  /**
   * room.chat { text } (docs/MATCHMAKING.md §38): one plain-text message to the whole room — its seated players AND its
   * spectators — in the waiting lobby AND while the room's match runs (room-scoped: never another room, never a match
   * one is not part of). The text is cleaned (control chars stripped, whitespace collapsed), capped at CHAT_MAX
   * characters and rate-limited per session (CHAT_RATE_LIMIT per CHAT_RATE_WINDOW_MS, a sliding window); every member
   * receives `m.chat { from, name, text, at }` — shown as a transient bubble, never stored (no DB, no room buffer, no
   * replay). A spectator may chat here (unlike g.* intents); the message is plain text — escaping is not enough, so it
   * is sanitised server-side and the client renders it as text.
   */
  /**
   * room.setArt / account.setArt (owner 2026-10-24): the seat card's 立绘 — an operator charId, or null for the
   * default look. The charId must exist in the installation's operator assets (so a stale or hand-made id never
   * reaches other clients). `save` on room.setArt (and account.setArt itself) also stores it as the bound account's
   * default, so every later room opens with it; a guest's choice lasts for the session only.
   */
  setArt(session, { art, save = false }) {
    const value = this._cleanArt(art);
    if (value === undefined) return fail(ERR.BAD_MSG, 'unknown operator art');
    session.art = value;
    this._applyArtToSeat(session, value, { broadcast: true });
    if (save && session.accountId && this.auth) {
      const account = this.auth.setArt(session.accountId, value);
      if (account) sendSession(session, { t: 'auth.profile', account });
    }
    return OK;
  }

  /** account.setArt: the default for future seats, applied to the current one too (a logged-in account is required). */
  accountSetArt(session, { art }) {
    if (!this.auth || !session.accountId) return fail(ERR.AUTH_REQUIRED);
    const value = this._cleanArt(art);
    if (value === undefined) return fail(ERR.BAD_MSG, 'unknown operator art');
    const account = this.auth.setArt(session.accountId, value);
    if (!account) return fail(ERR.AUTH_REQUIRED);
    session.art = value;
    this._applyArtToSeat(session, value, { broadcast: true });
    sendSession(session, { t: 'auth.profile', account });
    return OK;
  }

  /**
   * account.setAvatar: the profile picture from an operator's own avatar (a charId; null restores the initials).
   * The upload route writes the same accounts.avatar column as a file name; this clears that with a charId.
   */
  accountSetAvatar(session, { art }) {
    if (!this.auth || !session.accountId) return fail(ERR.AUTH_REQUIRED);
    const value = art == null ? null : String(art);
    if (value != null) {
      const chars = this.safeData()?.assets?.chars;
      if (!chars || !Object.prototype.hasOwnProperty.call(chars, value)) return fail(ERR.BAD_MSG, 'unknown operator avatar');
    }
    const account = this.auth.setAvatar(session.accountId, value);
    if (!account) return fail(ERR.AUTH_REQUIRED);
    this.applyProfile(session.accountId, { avatar: value });
    return OK;
  }

  /** null, or a charId / skin key the installation has art for; undefined when it is neither (the caller refuses it). */
  _cleanArt(art) {
    if (art == null) return null;
    if (typeof art !== 'string') return undefined;
    const charId = art.includes('@') ? art.slice(0, art.indexOf('@')) : art;
    const chars = this.safeData()?.assets?.chars;
    return chars && Object.prototype.hasOwnProperty.call(chars, charId) ? art : undefined;
  }

  /** Put a session's art on its player seat (and spectator record) and tell the room. */
  _applyArtToSeat(session, art, { broadcast = false } = {}) {
    const room = this.roomOf(session);
    if (!room) return;
    const seat = room.seatOf(session.playerId);
    const spectator = room.spectatorOf(session.playerId);
    if (seat) seat.art = art;
    if (spectator) spectator.art = art;
    if (broadcast && (seat || spectator)) this.broadcastState(room);
  }

  /**
   * An account's uploaded avatar changed (server/index.js POST/DELETE /api/account/avatar after auth.setAvatar):
   * push it onto every live session of that account and the seat it occupies, so the room redraws without a reconnect.
   */
  applyProfile(accountId, { avatar } = {}) {
    if (!Number.isInteger(accountId) || avatar === undefined) return;
    for (const s of this.registry.all()) {
      if (s.accountId !== accountId) continue;
      s.avatar = avatar ?? null;
      const room = this.roomOf(s);
      if (room) {
        const seat = room.seatOf(s.playerId);
        const spectator = room.spectatorOf(s.playerId);
        if (seat) seat.avatar = s.avatar;
        if (spectator) spectator.avatar = s.avatar;
        if (seat || spectator) this.broadcastState(room);
      }
      sendSession(s, { t: 'auth.profile', account: { id: s.accountId, name: s.name, role: s.role ?? null, art: s.art ?? null, avatar: s.avatar ?? null } });
    }
  }

  chat(session, { text }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    const body = cleanChatText(text);
    if (!body || [...body].length > CHAT_MAX) return fail(ERR.BAD_CHAT);
    const now = this.now();
    const windowMs = this.opts.chatRateWindowMs;
    const limit = this.opts.chatRateLimit;
    const times = (Array.isArray(session.chatAt) ? session.chatAt : []).filter((t) => now - t < windowMs);
    if (times.length >= limit) {
      session.chatAt = times;
      return fail(ERR.RATE, 'room chat too fast');
    }
    times.push(now);
    session.chatAt = times;
    this.broadcastRoom(room, { t: 'm.chat', from: session.playerId, name: session.name, text: body, at: now });
    return OK;
  }

  ready(session, { ready }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    const seat = room.seatOf(session.playerId);
    // a room with gameplay plugins: ready once the page has loaded and checked its content (header "Gameplay plugins")
    if (ready && room.modded && seat.content !== 'ready') return fail(ERR.CONTENT_NOT_READY);
    if (seat.ready !== ready) {
      seat.ready = ready;
      this.broadcastState(room);
    }
    return OK;
  }

  setDifficulty(session, { difficulty }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    // a plugin mode chosen (header "Gameplay plugins") carries its own difficulty: picking one leaves it
    if (room.difficulty !== difficulty || room.content?.modeId) {
      room.difficulty = difficulty;
      if (room.content?.modeId) { const rest = { ...room.content }; delete rest.modeId; room.content = Object.freeze(rest); }
      for (const s of room.seats) if (s && !s.isBot && s.playerId !== room.hostId) s.ready = false;
      this.broadcastState(room);
    }
    return OK;
  }

  /** 「AI 队友最后选择」 (GitHub #338): host-only, before the match, co-op rooms only (a solo room has no AI seat). */
  setAiPicksLast(session, { on }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (room.mode === 'solo') return fail(ERR.BAD_TARGET, 'solo rooms have no AI teammates');
    this.dropReplay(room, session.playerId);
    if (room.aiPicksLast !== on) {
      room.aiPicksLast = on;
      for (const s of room.seats) if (s && !s.isBot && s.playerId !== room.hostId) s.ready = false;
      this.broadcastState(room);
    }
    return OK;
  }

  /**
   * room.setPlugins (header "The room's plugins", "Gameplay plugins"): host-only, before the match; the set of the plugins
   * asked for becomes the room's content and the other humans are un-readied — nothing changes (and nobody is un-readied)
   * when it is the set the room already has. The host's result replay (a settlement screen still open) is dropped only
   * when the set did change: re-applying the same plugins, or a refused set, leaves it.
   */
  setPlugins(session, { plugins }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    const ids = [...new Set(plugins.map((p) => p.id))];
    /** @type {Record<string, Record<string, unknown>>} */
    const settings = {};
    for (const p of plugins) if (p.settings) settings[p.id] = p.settings;
    const r = this.resolveContent(room, ids, settings);
    if ('error' in r) return r;
    let content = r.content;
    const before = room.content;
    const sameSet = (before?.vs ?? null) === (content?.vs ?? null) && (before?.cs ?? null) === (content?.cs ?? null);
    const marks = (c) => JSON.stringify((c?.plugins || []).map((p) => [p.id, !!p.auto]));
    if (sameSet && marks(before) === marks(content)) return OK;
    this.dropReplay(room, session.playerId);
    // another set: a notice still waiting for the end of a match (pluginsChanged) is moot
    if (!sameSet) room.pluginsChanged = null;
    // the plugin mode chosen stays while the set still provides it (header "Gameplay plugins")
    if (before?.modeId && content?.modes?.some((m) => m.id === before.modeId)) content = Object.freeze({ ...content, modeId: before.modeId });
    room.content = content;
    if (!sameSet) {
      this.holdContent(content);
      this.releaseContent(before);
      for (const s of room.seats) if (s && !s.isBot && s.playerId !== room.hostId) s.ready = false;
      // another content set: every page loads and checks it again (room.contentReady)
      if ((before?.cs ?? null) !== (content?.cs ?? null)) for (const s of [...room.seats, ...room.spectators]) if (s && !s.isBot) s.content = null;
      this.log.info(`[lobby] ${room.code} plugins: ${content?.plugins?.length ? content.plugins.map((p) => `${p.id}@${p.version}`).join(', ') : 'none'}${room.modded ? ` (content ${content.cs.slice(0, 8)})` : ''}`);
    }
    this.broadcastState(room);
    return OK;
  }

  /**
   * The content a room gets for the plugins `ids` (header "The room's plugins", "Gameplay plugins"): the vanilla set for
   * none, else what the room sets resolve — cosmetic plugins only: the vanilla cs with their `vs`; content plugins: the
   * content set's own cs (`vanilla: false`). Nothing is held yet (holdContent).
   * @param {Room | null} room @param {string[]} ids @param {Record<string, Record<string, unknown>>} [settings]
   * @returns {{ content: Room['content'] } | { error: string, detail?: string }}
   */
  resolveContent(room, ids, settings = {}) {
    if (!ids.length) return { content: this.vanilla };
    if (!this.vanilla || !this.plugins) return fail(ERR.PLUGIN_UNKNOWN, 'this server applies no plugins');
    let r;
    try { r = this.plugins.resolve(ids, { scope: 'room', settings, replacing: room?.content ?? null }); } catch (e) {
      this.log.error(`[lobby] ${room?.code ?? '----'} plugin set failed`, e);
      return fail(ERR.INTERNAL);
    }
    if (!r || !r.ok) return fail(r && isErrCode(r.error) ? r.error : ERR.INTERNAL, r && typeof r.detail === 'string' ? r.detail.slice(0, 200) : undefined);
    const { cs, vs, plugins: list, warnings, bytes, dataBytes, modes, trusted, execution, rules, kitted } = r.set;
    const modded = isContentHash(cs) && cs !== this.vanilla.cs;
    const frozen = (a) => Object.freeze((Array.isArray(a) ? a : []).map((p) => Object.freeze({ ...p })));
    return {
      content: Object.freeze({
        cs: modded ? cs : this.vanilla.cs,
        vanilla: !modded,
        ...(vs ? { vs } : {}),
        plugins: frozen(list),
        ...(trusted ? { trusted } : {}),
        ...(execution ? { execution } : {}),
        ...(rules ? { rules } : {}),
        warnings: Object.freeze([...(warnings || [])]),
        bytes: Number(bytes) || 0,
        ...(modded && Array.isArray(kitted) && kitted.length ? { kittedExtra: Object.freeze(kitted.filter((x) => typeof x === 'string').slice(0, 200)) } : {}),
        ...(modded ? { dataBytes: Number(dataBytes) || 0, modes: frozen(modes) } : {}),
      }),
    };
  }

  /** A room now uses `content`: its visual set and its content set are held (released by releaseContent). */
  holdContent(content) {
    if (content?.vs) this.plugins?.hold?.(content.vs);
    if (content && content.vanilla === false) this.plugins?.holdContent?.(content.cs);
  }

  /** A room no longer uses `content`. */
  releaseContent(content) {
    if (content?.vs) this.plugins?.release?.(content.vs);
    if (content && content.vanilla === false) this.plugins?.releaseContent?.(content.cs);
  }

  /**
   * room.setMode (header "Gameplay plugins"): host-only, before the match. An official mode of the room's type sets its
   * difficulty (and leaves a plugin mode); a mode of the room's content set (content.modes, the room's type) becomes
   * content.modeId — its difficulty the room's. Like a difficulty change it un-readies the other humans.
   */
  setMode(session, { modeId }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    const official = DIFFICULTIES.find((d) => modeIdFor(room.mode, d) === modeId);
    let difficulty = room.difficulty;
    let content = room.content;
    if (official) {
      difficulty = official;
      if (content?.modeId) { const rest = { ...content }; delete rest.modeId; content = Object.freeze(rest); }
    } else {
      const mode = Array.isArray(content?.modes) ? content.modes.find((m) => m && m.id === modeId) : null;
      if (!mode) return fail(ERR.BAD_TARGET, 'not a mode of this room');
      if (mode.roomMode !== room.mode) return fail(ERR.BAD_TARGET, `a mode of ${mode.roomMode} rooms`);
      if (DIFFICULTIES.includes(mode.difficulty)) difficulty = mode.difficulty;
      if (content.modeId !== modeId) content = Object.freeze({ ...content, modeId });
    }
    if (difficulty === room.difficulty && content === room.content) return OK;
    this.dropReplay(room, session.playerId);
    room.difficulty = difficulty;
    room.content = content;
    for (const s of room.seats) if (s && !s.isBot && s.playerId !== room.hostId) s.ready = false;
    this.broadcastState(room);
    return OK;
  }

  /**
   * room.contentReady { cs, ok? } (header "Gameplay plugins"): the member's page has loaded and checked the room's content
   * set (`ok: false`: it could not). Recorded for the room's current set only — a page that checked an older one is
   * answered OK and changes nothing.
   */
  contentReady(session, { cs, ok }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (!room.modded || room.content.cs !== cs) return OK;
    const seat = room.seatOf(session.playerId) || room.spectatorOf(session.playerId);
    const state = ok === false ? 'failed' : 'ready';
    if (seat.content === state) return OK;
    seat.content = state;
    if (state === 'failed') this.log.warn(`[lobby] ${room.code} ${session.name}: the room's content ${cs.slice(0, 8)} did not load or check on that page`);
    this.broadcastState(room);
    return OK;
  }

  /** Each live session consents only for its own seat and the current cs. Reconnect keeps the seat. */
  consent(session, { cs, accept }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    const seat = room.seatOf(session.playerId);
    if (!seat || seat.isBot) return fail(ERR.SPECTATOR);
    if (!session.connected || !room.content?.trusted || room.content.cs !== cs) return fail(ERR.PLUGIN_CONSENT);
    if (room.match) return fail(ERR.ROOM_STARTED);
    const changed = (seat.consentCs === cs) !== accept;
    seat.consentCs = accept ? cs : null;
    if (changed) seat.content = null;
    if (!accept) { seat.ready = false; seat.content = null; }
    this.broadcastState(room);
    return OK;
  }

  addBot(session) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    if (room.mode === 'solo') return fail(ERR.ROOM_FULL, 'solo rooms cannot have AI teammates');
    const idx = room.freeSeat();
    if (idx < 0) return fail(ERR.ROOM_FULL);
    const used = new Set(room.seats.filter((s) => s && s.isBot).map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `AI·${idx + 1}`;
    let playerId;
    do playerId = 'ai_' + randomBytes(4).toString('hex'); while (room.seatOf(playerId));
    room.seats[idx] = { seat: idx, playerId, name, role: null, isBot: true, ready: true, connected: true, left: false };
    this.broadcastState(room);
    return OK;
  }

  removeBot(session, { seat }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    const target = room.seats[seat];
    if (!target || !target.isBot) return fail(ERR.BAD_TARGET, 'seat does not hold an AI');
    room.seats[seat] = null;
    this.broadcastState(room);
    return OK;
  }

  /** Host removes another human before the match (header: room.kick). */
  kick(session, { seat, playerId }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    const target = room.seats[seat];
    if (!target || target.left) return fail(ERR.BAD_TARGET, 'seat holds no player');
    if (target.playerId !== playerId) return fail(ERR.BAD_TARGET, 'seat changed hands'); // the confirmed player left meanwhile
    if (target.isBot) return fail(ERR.BAD_TARGET, 'seat holds an AI (room.removeBot)');
    if (target.playerId === session.playerId) return fail(ERR.BAD_TARGET, 'cannot kick yourself');
    const kicked = this.registry.byId(target.playerId);
    const wasHere = !!kicked && kicked.roomCode === room.code;
    const replay = this.replayFor(room, target.playerId);
    this.removeMember(room, target.playerId);
    if (wasHere) {
      if (kicked.connected) sendSession(kicked, { t: 'room.closed', reason: 'kicked' });
      else { kicked.notice = 'kicked'; kicked.pendingResult = replay; }
    }
    this.log.info(`[lobby] ${room.code} ${target.name} removed by the host`);
    return OK;
  }

  start(session) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    const humans = room.activeHumans();
    if (room.content?.trusted && humans.some((s) => !s.isBot && s.consentCs !== room.content.cs)) return fail(ERR.PLUGIN_CONSENT);
    for (const s of humans) {
      if (s.playerId !== room.hostId && (!s.connected || !s.ready)) return fail(ERR.NOT_READY);
    }
    // a room with gameplay plugins starts once every player's page has loaded and checked its content (the host's too)
    if (room.modded && humans.some((s) => s.content !== 'ready')) return fail(ERR.CONTENT_NOT_READY);
    const bots = room.seats.filter((s) => s && s.isBot);
    if (humans.length < 1 || (room.mode === 'solo' && (humans.length !== 1 || bots.length > 0))) {
      return fail(ERR.BAD_MSG, 'invalid seat configuration');
    }
    const key = session.limitKey || null;
    if (key && this.opts.maxMatchesPerAddr > 0 && this.countRooms((r) => !!r.match && r.matchKey === key) >= this.opts.maxMatchesPerAddr) {
      this.limitWarn(`match limit (${this.opts.maxMatchesPerAddr}) reached for ${session.addr}`);
      return fail(ERR.RATE, 'too many running matches from your network');
    }
    return this.startMatch(room, key);
  }

  /** Host authorization stays in the lobby; the match owns the vote and setup. */
  rerollSetup(session, msg, cancel = false) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    const method = cancel ? 'cancelSetupReroll' : 'requestSetupReroll';
    if (!room.match || typeof room.match[method] !== 'function') return fail(ERR.WRONG_PHASE);
    return this.callMatch(room, method, session.playerId, cancel ? msg.voteId : msg.setupRevision) || fail(ERR.INTERNAL);
  }

  /**
   * room.loadout (DESIGN §16): check the operator loadout — and its per-operator 潜能 / 练度 `ops` (0.2.2) — against the
   * game data, store both on the session and the seat, and — while a match runs — hand them to the match (accepted only
   * during INFO_CHECK, see the header). Either part refused: nothing is stored.
   */
  loadout(session, { entries, ops }) {
    const room = this.roomOf(session);
    // checked against the room's own data: a room with gameplay plugins knows its plugins' operators (header "Gameplay plugins")
    const data = this.dataFor(room);
    const res = checkLoadout(entries, (id) => lookup('chess', id, data));
    if (!res || res.error) return fail(res && isErrCode(res.error) ? res.error : ERR.BAD_MSG, res && res.detail);
    const ids = opsCharIds(data);
    const resOps = checkLoadoutOps(ops, (id) => ids.has(id), (id) => charPotentialChanges(data, id));
    if (!resOps || resOps.error) return fail(resOps && isErrCode(resOps.error) ? resOps.error : ERR.BAD_MSG, resOps && resOps.detail);
    const loadout = freezeLoadout(res.loadout);
    const opsSet = freezeOps(resOps.ops);
    const cs = this.csOf(room);
    session.loadout = loadout;
    session.ops = opsSet;
    session.loadoutCs = cs;
    if (!room) return OK;
    const seat = room.seatOf(session.playerId);
    if (seat) { seat.loadout = loadout; seat.ops = opsSet; seat.loadoutCs = cs; }
    if (!room.match || !seat) return OK; // a spectator's loadout stays on its session, never reaching the match
    if (typeof room.match.setLoadout !== 'function') return fail(ERR.ROOM_STARTED, 'stored for the next match');
    let r;
    try {
      r = room.match.setLoadout(session.playerId, loadout, opsSet);
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match.setLoadout threw`, e);
      return fail(ERR.INTERNAL);
    }
    // a match in a match host worker answers later (header "Gameplay plugins")
    if (r && typeof r.then === 'function') return Promise.resolve(r).then(matchAnswer, () => fail(ERR.INTERNAL));
    return matchAnswer(r);
  }

  /**
   * room.ownership (0.2.0 补位): keep the droppable chess of the not-owned list, store it on the session and the seat
   * (see the header). A running match never takes it: it keeps the list its seat had at its start.
   */
  ownership(session, { notOwned }) {
    const room = this.roomOf(session);
    const data = this.dataFor(room);
    const res = checkNotOwned(notOwned, (id) => lookup('chess', id, data));
    if (!res || res.error) return fail(ERR.BAD_MSG, res && res.detail);
    const list = Object.freeze(res.notOwned.slice());
    const cs = this.csOf(room);
    session.notOwned = list;
    session.notOwnedCs = cs;
    if (!room) return OK;
    const seat = room.seatOf(session.playerId);
    if (seat) { seat.notOwned = list; seat.notOwnedCs = cs; }
    if (room.match && seat) return fail(ERR.ROOM_STARTED, 'stored for the next match');
    return OK;
  }

  /**
   * room.diy (0.2.0 自选编队): keep the legal picks (checkDiyPicks against the data and KITTED_CHARS — the room's own in a
   * room with gameplay plugins), store them on the session and the seat (see the header). A running match never takes
   * them: it keeps the picks its seat had at its start.
   */
  diy(session, { picks }) {
    const room = this.roomOf(session);
    const res = checkDiyPicks(picks, { data: this.dataFor(room), kitted: this.kittedFor(room) });
    if (!res || !('ok' in res)) return fail(ERR.BAD_MSG, res && res.detail);
    const kept = freezeDiy(res.picks);
    const cs = this.csOf(room);
    session.diy = kept;
    session.diyCs = cs;
    if (!room) return OK;
    const seat = room.seatOf(session.playerId);
    if (seat) { seat.diy = kept; seat.diyCs = cs; }
    if (room.match && seat) return fail(ERR.ROOM_STARTED, 'stored for the next match');
    return OK;
  }

  /** The game data of a room's content (header "Gameplay plugins"): its content set's, else the server's. @param {Room | null} room */
  /**
   * room.skins (docs/SKINS.md): store the appearances this player chose for their operators, on the session and the
   * seat, and hand them to a running match. Unlike the loadout there is no phase gate: a skin is cosmetic and public.
   */
  skins(session, { skins }) {
    const room = this.roomOf(session);
    const ids = operatorCharIds(this.dataFor(room));
    const kept = freezeSkins(skins, (id) => ids.has(id));
    if (!kept) return fail(ERR.BAD_MSG, 'bad skin selection');
    session.skins = kept;
    if (!room) return OK;
    const seat = room.seatOf(session.playerId);
    if (seat) seat.skins = kept;
    if (!room.match || !seat) return OK;
    if (typeof room.match.setSkins !== 'function') return fail(ERR.ROOM_STARTED, 'stored for the next match');
    return matchAnswer(this.callMatch(room, 'setSkins', session.playerId, kept));
  }

  dataFor(room) {
    if (room?.modded) {
      try {
        const d = this.plugins?.dataOf?.(room.content.cs);
        if (d) return d;
      } catch (e) { this.log.error(`[lobby] ${room.code} content data failed`, e); }
    }
    return this.safeData();
  }

  /** The operators a 自选 slot may field in a room (its content set's list, else the vanilla one). @param {Room | null} room */
  kittedFor(room) {
    if (room?.modded) {
      try {
        const k = this.plugins?.kittedOf?.(room.content.cs);
        if (Array.isArray(k)) return k;
      } catch (e) { this.log.error(`[lobby] ${room.code} content 自选 list failed`, e); }
    }
    return KITTED_CHARS;
  }

  /** The content a setting stored now is checked for: the room's cs, else the server's vanilla one. @param {Room | null} room */
  csOf(room) { return room?.content?.cs ?? this.vanilla?.cs ?? null; }

  /**
   * A human seat's stored settings for a match of `room` (header "Gameplay plugins", the design study's §6.9): kept as
   * they are when they were checked for the room's content; filtered to its data otherwise — an id it does not know is
   * dropped, the rest kept (never the whole setting refused).
   * @param {Room} room @param {Seat} s @param {Readonly<Record<string, any>>} data
   */
  seatSettings(room, s, data) {
    const cs = this.csOf(room);
    const other = (checked) => !!cs && (checked ?? this.vanilla?.cs ?? null) !== cs;
    let loadout = s.loadout || null;
    let ops = s.ops || null;
    let notOwned = s.notOwned || null;
    let diy = s.diy || null;
    let skins = null;
    if (s.skins && typeof s.skins === 'object') {
      const ids = operatorCharIds(data);
      const res = checkSkinSelection(s.skins, (id) => ids.has(id));
      if (res.ok) skins = Object.freeze({ ...res.skins });
    }
    const chess = (id) => lookup('chess', id, data);
    if (loadout && other(s.loadoutCs)) {
      const keep = {};
      for (const [id, e] of Object.entries(loadout)) {
        const r = checkLoadout({ [id]: { skill: e.skill, ...(e.module != null ? { module: e.module } : {}) } }, chess);
        if (r && !r.error && r.loadout[id]) keep[id] = r.loadout[id];
      }
      loadout = freezeLoadout(keep);
      const ids = opsCharIds(data);
      const keepOps = {};
      for (const [id, e] of Object.entries(ops || {})) {
        const r = checkLoadoutOps({ [id]: { potential: e.potential, cultivate: e.cultivate } }, (x) => ids.has(x));
        if (r && !r.error && r.ops[id]) keepOps[id] = r.ops[id];
      }
      ops = freezeOps(keepOps);
    }
    if (notOwned && other(s.notOwnedCs)) {
      const r = checkNotOwned([...notOwned], chess);
      notOwned = r && !r.error ? Object.freeze(r.notOwned.slice()) : null;
    }
    if (diy && other(s.diyCs)) {
      const r = checkDiyPicks({ ...diy }, { data, kitted: this.kittedFor(room) });
      diy = r && 'ok' in r ? freezeDiy(r.picks) : null;
    }
    return { loadout, ops, notOwned, diy, skins };
  }

  /**
   * Extra fields of every `welcome` (net.js): the operators a 自选 slot may field (shared/diy.js `kitted`) and the
   * server's content identity (header "Content identity").
   */
  welcomeInfo() {
    if (!this.vanilla) return { diyKitted: KITTED_CHARS };
    let n;
    try { n = Number(this.plugins?.unofficial?.()) || 0; } catch { n = 0; }
    let notices = false;
    try { notices = this.plugins?.hasNotices?.() === true; } catch { /* optional catalogue hint */ }
    // The lobby's loadout preview uses the owner's default room art (the skin picker before a room
    // exists); a room, when joined, still names its own vs and wins on the page.
    let defaultVs = null;
    try {
      const vs = this.plugins?.defaultVisual?.();
      if (typeof vs === 'string') defaultVs = vs;
    } catch { /* a broken default set must not break the welcome */ }
    return { diyKitted: KITTED_CHARS, content: { vanilla: this.vanilla.cs, ...(n > 0 ? { plugins: n } : {}), ...(notices ? { notices: true } : {}), ...(defaultVs ? { defaultVs } : {}) },
      ...(this.testEnabled === true ? { testMode: true } : {}) };
  }

  // ---------------------------------------------------------------------------------------------------
  // Accounts & 野排 (docs/MATCHMAKING.md)
  // ---------------------------------------------------------------------------------------------------

  register(session, { name, password }) {
    if (!this.auth) return fail(ERR.INTERNAL, 'accounts disabled');
    const r = this.auth.register(name, password);
    if (r.error) return fail(r.error);
    this.bindAccount(session, r.account, r.token);
    return OK;
  }

  login(session, { name, password }) {
    if (!this.auth) return fail(ERR.INTERNAL, 'accounts disabled');
    const r = this.auth.login(name, password);
    if (r.error) return fail(r.error);
    this.bindAccount(session, r.account, r.token);
    return OK;
  }

  /** Client 「退出登录」: unbind the account from this live session and invalidate its token (frees the single-session slot). */
  logout(session) {
    const token = session.accountToken;
    session.accountId = null;
    session.accountToken = null;
    session.role = null;
    // the profile is the account's: back to the guest look (no 立绘 / avatar) on the session and its seat
    session.art = null;
    session.avatar = null;
    if (token && this.auth) this.auth.logout(token);
    // the display name stays (that is the existing behaviour); a room seat drops the role badge with it
    const room = this.roomOf(session);
    const seat = room ? (room.seatOf(session.playerId) || room.spectatorOf(session.playerId)) : null;
    if (seat && !room.match) {
      seat.role = null;
      seat.art = null;
      seat.avatar = null;
      this.broadcastState(room);
    }
    return OK;
  }

  /**
   * One live session per account: any OTHER session already bound to this account is unbound and its socket closed
   * (the client shows「该身份已在其他页面登录」). Logging in elsewhere therefore kicks the previous device.
   */
  kickOtherSessions(session, accountId) {
    for (const other of this.registry.all()) {
      if (other === session || other.accountId !== accountId) continue;
      other.accountId = null;
      other.accountToken = null;
      other.role = null;
      // Close through the Network (sets conn.closing) so an in-flight `hello` cannot rebind this session and kick us
      // back; it also fires onDisconnect now, so the old device immediately leaves the 野排 pool / its room.
      if (this.network) this.network.closeSession(other, CLOSE.REPLACED, 'account logged in elsewhere');
      else if (other.ws) { try { other.ws.close(CLOSE.REPLACED, 'account logged in elsewhere'); } catch { /* ignore */ } }
    }
  }

  /** Bind a session to an account and tell it (auth.ok); the display name (and role badge) follow the account. */
  bindAccount(session, account, token) {
    session.accountId = account.id;
    session.accountToken = token;
    session.name = account.name;
    session.role = account.role ?? null;
    session.art = account.art ?? null;
    session.avatar = account.avatar ?? null;
    this.kickOtherSessions(session, account.id);
    sendSession(session, { t: 'auth.ok', account, token });
    const room = this.roomOf(session);
    if (room) {
      const seat = room.seatOf(session.playerId);
      if (seat && !room.match) {
        seat.name = account.name;
        seat.role = account.role ?? null;
        seat.art = session.art;
        seat.avatar = session.avatar;
        this.broadcastState(room);
      }
    }
  }

  /** 野排: enter the difficulty-bucketed shared pool (a bound account is required). */
  mmJoin(session, { difficulty }) {
    if (!this.auth || !session.accountId) return fail(ERR.AUTH_REQUIRED);
    if (this.mm.byKey.has(session.playerId)) return fail(ERR.IN_QUEUE);
    const cur = this.roomOf(session);
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    if (cur) this.removeMember(cur, session.playerId);
    return this.mm.join({ key: session.playerId, session, difficulty });
  }

  mmCancel(session) {
    const r = this.mm.cancel(session.playerId);
    if (r.ok) sendSession(session, { t: 'mm.state', queued: false });
    return r;
  }

  /**
   * A player bug report (the lobby's bug提交 panel, server/community.js): the title / description and up to
   * BUG_IMAGES_MAX image ids the same session already uploaded over HTTP. Attributed to the bound account when there is
   * one, else a guest; rate limited per account, else per the session's network key. No replay / seed / room data.
   */
  bugReport(session, { title, body, images }) {
    if (!this.community) return fail(ERR.INTERNAL, 'community disabled');
    const key = session.accountId != null ? `account:${session.accountId}` : (session.limitKey ? `net:${session.limitKey}` : `player:${session.playerId}`);
    const r = this.community.createBugReport({ title, body, images, accountId: session.accountId ?? null, submitter: session.name, key });
    if (r.error) return fail(r.error);
    this.log.info(`[lobby] bug report #${r.report.id} from ${session.name} (${r.report.images.length} image(s))`);
    return OK;
  }

  // ---------------------------------------------------------------------------------------------------
  // Match statistics (server/stats.js, docs/MATCHMAKING.md §40)
  // ---------------------------------------------------------------------------------------------------

  /**
   * The owner key of a session's match records: a registered player's account id, else the guest's session identity
   * (`playerId` — the id the repo already assigns a session; the client keeps its reconnect token, so the session and
   * its guest key survive a reload / reconnect for the reconnect window). Guests are stored exactly like accounts;
   * only the key differs.
   */
  _statsOwner(session) {
    if (session.accountId != null) return { accountId: session.accountId, guestId: null };
    return { accountId: null, guestId: session.playerId };
  }

  /** The public identity of a session's owner (what /online/api already shows: name + role + guest, never an id). */
  _statsOwnerPublic(session) {
    return { name: session.name, role: session.role ?? null, guest: session.accountId == null };
  }

  /** One normalized finished match, bound to the session's owner (server/stats.js submit; the record id dedupes a replay). */
  statsSubmit(session, { record }) {
    if (!this.matchStats) return fail(ERR.INTERNAL, 'stats disabled');
    const r = this.matchStats.submit({ ...this._statsOwner(session), record });
    if (r.error) return fail(r.error);
    return OK;
  }

  /** The caller's own records (newest first, bounded), answered with `stats.records { scope: 'self', ... }`. */
  statsList(session, msg) {
    if (!this.matchStats) return fail(ERR.INTERNAL, 'stats disabled');
    const records = this.matchStats.list({ ...this._statsOwner(session), limit: msg?.limit });
    sendSession(session, { t: 'stats.records', ...(Number.isInteger(msg?.rid) ? { rid: msg.rid } : {}), scope: 'self', owner: this._statsOwnerPublic(session), records });
    return OK;
  }

  /** Delete the caller's own records. */
  statsClear(session) {
    if (!this.matchStats) return fail(ERR.INTERNAL, 'stats disabled');
    this.matchStats.clear(this._statsOwner(session));
    return OK;
  }

  /**
   * Another ONLINE player's public record list, keyed by the public display name the 在线 overlay shows (no account
   * id / token crosses the wire). The target is resolved among the sessions that count as online right now (guest or
   * registered, unique by name); its records answer as `stats.records { scope: 'other', ... }`.
   */
  statsView(session, msg) {
    if (!this.matchStats) return fail(ERR.INTERNAL, 'stats disabled');
    const target = this._statsViewTarget(msg?.name);
    if (!target) return fail(ERR.BAD_TARGET, 'no such online player');
    const records = this.matchStats.list({ accountId: target.accountId, guestId: target.guestId, limit: msg?.limit });
    sendSession(session, { t: 'stats.records', ...(Number.isInteger(msg?.rid) ? { rid: msg.rid } : {}), scope: 'other', owner: target.owner, records });
    return OK;
  }

  /**
   * Resolve a `stats.view` name to an owner among the currently-online sessions (net.js presenceOnline), unique by
   * name. A registered session resolves to its account; a guest to its session identity. Non-unique / unknown → null.
   */
  _statsViewTarget(rawName) {
    const want = sanitizeName(rawName);
    if (!want) return null;
    const now = this.now();
    const matches = [...this.registry.all()].filter((s) => s && s.name === want && presenceOnline(s, now));
    if (matches.length !== 1) return null;
    const s = matches[0];
    return s.accountId != null
      ? { accountId: s.accountId, guestId: null, owner: { name: s.name, role: s.role ?? null, guest: false } }
      : { accountId: null, guestId: s.playerId, owner: { name: s.name, role: null, guest: true } };
  }

  /**
   * A 野排 group from the matchmaker: build a ready co-op room (humans in queue order), fill every other seat with AI
   * and start at once (no ready step). A queued session that dropped is replaced by AI too.
   * @param {import('./net.js').Session[]} sessions
   * @param {{ difficulty: string, ai: number }} info
   */
  createMatchedRoom(sessions, { difficulty }) {
    // The matchmaker already removed this group from the pool, so a bail-out here must not leave the players with a
    // stuck queue overlay: explicitly tell every connected member queued:false.
    const bail = (why) => {
      this.log.warn(`[lobby] 野排 group dropped: ${why}`);
      for (const s of sessions) if (s && s.connected) sendSession(s, { t: 'mm.state', queued: false });
    };
    if (this.rooms.size >= this.opts.maxRooms) return bail('too many rooms');
    const code = this.genCode();
    if (!code) return bail('no room code');
    // Same per-network running-match quota as room.start(): a 野排 group must not bypass it (anti-abuse).
    const key = (sessions.find((s) => s && s.connected) || sessions[0] || {}).limitKey || null;
    if (key && this.opts.maxMatchesPerAddr > 0 && this.countRooms((r) => !!r.match && r.matchKey === key) >= this.opts.maxMatchesPerAddr) {
      return bail('match limit reached for this network');
    }
    const room = new Room(code, 'coop', difficulty, this.now());
    room.auto = true; // 野排: auto-matched — server/admin.js uses this to tell 野排游玩 from a hand-made 同盟游玩
    room.public = false; // matched rooms start immediately and are never key-joinable → keep them out of 公开同盟
    this.rooms.set(code, room);
    let idx = 0;
    let humans = 0;
    for (const session of sessions) {
      if (idx >= MAX_SEATS) break;
      if (session && session.connected && !session.roomCode) {
        const st = this.humanSeat(idx, session);
        st.ready = true;
        room.seats[idx] = st;
        session.roomCode = code;
        session.notice = null;
        session.pendingResult = null;
        if (!room.ownerKey) room.ownerKey = session.limitKey || null;
        humans++;
      }
      idx++;
    }
    for (let i = 0; i < MAX_SEATS; i++) if (!room.seats[i]) room.seats[i] = this.makeBot(room, i);
    const host = room.seats.find((s) => s && !s.isBot);
    if (!host) { this.disposeRoom(room, 'empty'); return; }
    room.hostId = host.playerId;
    this.log.info(`[lobby] ${code} 野排 (${difficulty}) ${humans} 玩家 + ${MAX_SEATS - humans} AI`);
    this.broadcastState(room);
    // If the match refuses to start, don't leave a zombie auto room: tear it down (members get room.closed).
    const started = this.startMatch(room, room.ownerKey);
    if (started && started.error) this.disposeRoom(room, 'start-failed');
  }

  /** A fresh AI seat (an unused BOT_NAMES name and an `ai_` playerId). */
  makeBot(room, idx) {
    const used = new Set(room.seats.filter((s) => s && s.isBot).map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `AI·${idx + 1}`;
    let playerId;
    do playerId = 'ai_' + randomBytes(4).toString('hex'); while (room.seatOf(playerId));
    return { seat: idx, playerId, name, role: null, isBot: true, ready: true, connected: true, left: false };
  }

  // ---------------------------------------------------------------------------------------------------
  // Match wiring
  // ---------------------------------------------------------------------------------------------------

  /** @param {Room} room @param {string | null} [key] per-network limit key of the starter */
  startMatch(room, key = null) {
    if (room.test && !this.testEnabled) return fail(ERR.TEST_DISABLED);
    const host = room.seatOf(room.hostId);
    if (host) host.ready = true;
    // the room's data: its content set's in a room with gameplay plugins (header "Gameplay plugins")
    const data = this.dataFor(room);
    const seats = room.seats.filter(Boolean).map((s) => {
      // a setting checked for another content is filtered to this room's data (header "Gameplay plugins")
      const own = s.isBot ? null : this.seatSettings(room, s, data);
      return {
        seat: s.seat, playerId: s.playerId, name: s.name, role: s.role ?? null, isBot: s.isBot, connected: s.connected,
        // the account picture (schema v6): the match's PlayerState / player view carry it so the band check, the
        // protocol-boot cards and the in-match team panel draw the same avatar as the room seats (owner 2026-10-25)
        ...(s.avatar ? { avatar: s.avatar } : {}),
        // DESIGN §16: the human's checked operator loadout and (0.2.2) per-operator 潜能 / 练度 (bots fight with the defaults)
        loadout: own ? own.loadout : null,
        ops: own ? own.ops : null,
        // 0.2.0 补位: the chess the human marked as not owned (bots own every operator)
        notOwned: own ? own.notOwned : null,
        // 0.2.0 自选编队: the human's checked DIY picks (bots field no 自选 piece [ASSUMED])
        diy: own ? own.diy : null,
        skins: own ? own.skins : null,
      };
    });
    // lastPublic / results: the latest m.public broadcast and the m.result frames (encoded), kept for the replay.
    const ctx = { live: true, ended: false, disposed: false, match: null, lastPublic: null, sharedResult: null, results: new Map() };
    let seed = 0;
    try { seed = this.seedFn() >>> 0; } catch { seed = randomInt(2 ** 32); }
    const modded = room.modded;
    try {
      const opts = {
        roomCode: room.code,
        mode: room.mode,
        difficulty: room.difficulty,
        // a plugin mode the host chose (header "Gameplay plugins"), else the official mode of the difficulty
        modeId: room.content?.modeId || modeIdFor(room.mode, room.difficulty),
        // 「AI 队友最后选择」 (GitHub #338): fixed for the match
        aiPicksLast: room.mode !== 'solo' && room.aiPicksLast === true,
        seats,
        // the spectator seats (header): watched like eliminated players, never players
        spectators: room.spectators.map((s) => s.playerId),
        // the room's host: the current executor of a delegated bot layout rehearsal (DESIGN §14; setHost follows a
        // migration while the match runs)
        hostId: room.hostId,
        ...(room.test === true ? { test: true } : {}),
        seed,
        // the room's match number: with the seed it keeps battleIds unique across the room's matches (DESIGN §14)
        matchNo: room.matchCount + 1,
        // the room's content hash (header "Content identity"): copied into every BattleSpec; its visual set too (a
        // replay names the art), and with gameplay plugins a b.result must name the room's cs (header "Gameplay plugins")
        ...(room.content ? { cs: room.content.cs } : {}),
        ...(room.content?.vs ? { vs: room.content.vs } : {}),
        ...(modded ? { requireCs: true } : {}),
        data,
        log: this.log,
        now: this.now,
        send: (playerId, msg) => (ctx.live ? this.matchSend(room, ctx, playerId, msg) : false),
        broadcast: (msg) => { if (ctx.live) this.matchBroadcast(room, ctx, msg); },
        onEnd: (summary) => this.onMatchEnd(room, ctx, summary),
      };
      // a room with gameplay plugins plays in its content set's match host worker; every other room here, as always
      const match = modded && this.hosts ? this.hosts.create(room.content.cs, opts) : new this.MatchClass(opts);
      ctx.match = match;
      room.match = match;
      room.matchCtx = ctx;
      room.matchKey = key;
      room.replay = null;
      room.matchCount++;
      this.log.info(`[lobby] ${room.code} match #${room.matchCount} starting (${room.mode}/${room.difficulty}, ${seats.length} seats, seed ${seed}${modded ? `, content ${room.content.cs.slice(0, 8)}${match.hosted ? ' in its match host' : ''}` : ''})`);
      this.broadcastState(room);
      match.start();
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match failed to start`, e);
      if (room.matchCtx === ctx) { room.match = null; room.matchCtx = null; room.matchKey = null; }
      this.disposeMatchCtx(ctx);
      this.broadcastState(room);
      // the match hosts refuse one content set more than they run (PLUGIN_BUSY: server/match/host/index.js)
      return fail(e && isErrCode(e.code) ? e.code : ERR.INTERNAL, 'match failed to start');
    }
    return OK;
  }

  /** onEnd callback: return the room to LOBBY and dispose the match on the next macrotask. */
  onMatchEnd(room, ctx, summary) {
    if (ctx.ended || !ctx.live || room.matchCtx !== ctx || room.disposed) return;
    ctx.ended = true;
    room.lastSummary = summary ?? null;
    room.match = null;
    room.matchCtx = null;
    room.matchKey = null;
    room.replay = this.buildReplay(room, ctx);
    setImmediate(() => this.disposeMatchCtx(ctx));
    // a match of gameplay plugins whose match host stopped (header "Gameplay plugins"; its members were told: proxy.js)
    const why = summary && typeof summary.reason === 'string' && summary.reason.startsWith('plugin-') ? ` (${summary.reason}${summary.detail ? `: ${summary.detail}` : ''})` : '';
    this.log.info(`[lobby] ${room.code} match #${room.matchCount} ended${why}`);
    for (let i = 0; i < room.seats.length; i++) {
      const s = room.seats[i];
      if (!s || s.isBot) continue;
      if (s.left) { room.seats[i] = null; continue; }
      s.ready = false;
      if (!s.connected) this.startGrace(room, s);
    }
    for (const s of room.spectators) if (!s.connected) this.startGrace(room, s);
    const host = room.hostId ? room.seatOf(room.hostId) : null;
    if (!host || host.isBot || host.left) this.migrateHost(room);
    if (room.activeHumans().length === 0) this.disposeRoom(room, 'empty');
    // 野排 (auto) parties are transient: disband the room when the match ends, so players are dropped back to the
    // lobby and must re-queue — nobody stays grouped with the same random strangers (docs/MATCHMAKING.md).
    else if (room.auto) this.disposeRoom(room, 'matched-end');
    else {
      this.broadcastState(room);
      // its plugins changed on disk during the match: the host can apply them again now
      if (room.pluginsChanged) this.tellPluginsChanged(room);
    }
  }

  /** Match unicast; m.result frames are also kept for the replay. */
  matchSend(room, ctx, playerId, msg) {
    if (msg && msg.t === 'm.result') {
      const data = encode(msg);
      if (data != null) ctx.results.set(playerId, data);
    }
    return this.sendToPlayer(room, playerId, msg);
  }

  /** Match broadcast; the latest m.public and a broadcast m.result are also kept for the replay. */
  matchBroadcast(room, ctx, msg) {
    const data = this.broadcastRoom(room, msg);
    if (data == null) return;
    if (msg.t === 'm.public') ctx.lastPublic = data;
    else if (msg.t === 'm.result') ctx.sharedResult = data;
  }

  /**
   * Replay record for the humans still seated when a match ends (null when the match produced no m.result,
   * e.g. it was abandoned: those clients then see "simulation closed").
   * @param {Room} room @returns {Room['replay']}
   */
  buildReplay(room, ctx) {
    const frames = new Map();
    for (const s of [...room.seats, ...room.spectators]) {
      if (!s || s.isBot || s.left) continue;
      const frame = ctx.results.get(s.playerId) || ctx.sharedResult;
      if (frame) frames.set(s.playerId, frame);
    }
    if (frames.size === 0) return null;
    return { publicFrame: ctx.lastPublic, frames, pending: new Set(frames.keys()) };
  }

  /** The replay frames still owed to a player (null when they moved on). @returns {string[] | null} */
  replayFor(room, playerId) {
    const r = room.replay;
    if (!r || !r.pending.has(playerId)) return null;
    return [r.publicFrame, r.frames.get(playerId)].filter(Boolean);
  }

  /** The player moved on from the result screen (acted in the room, left): stop replaying it. */
  dropReplay(room, playerId) {
    const r = room.replay;
    if (!r || !r.pending.delete(playerId)) return;
    r.frames.delete(playerId);
    if (r.pending.size === 0) room.replay = null;
  }

  /**
   * The heavy part of a resync — full match state (match.onReconnect) or, back in LOBBY, the result replay.
   * Immediate after a (re)connect; for repeated hellos on a live socket at most once per resyncMinGapMs
   * (requests inside the window coalesce into one deferred resync).
   * @param {import('./net.js').Session} session @param {boolean} coalesce
   */
  resync(session, coalesce) {
    const pid = session.playerId;
    if (coalesce) {
      if (this.resyncTimers.has(pid)) return; // the scheduled resync answers this request too
      const wait = (Number.isFinite(session.resyncAt) ? session.resyncAt : -Infinity) + this.opts.resyncMinGapMs - this.now();
      if (wait > 0) {
        const t = setTimeout(() => { this.resyncTimers.delete(pid); this.runResync(session); }, wait);
        t.unref?.();
        this.resyncTimers.set(pid, t);
        return;
      }
    } else {
      this.clearResync(pid);
    }
    this.runResync(session);
  }

  /** @param {import('./net.js').Session} session */
  runResync(session) {
    if (!session.connected || this.registry.byId(session.playerId) !== session) return;
    const room = this.roomOf(session);
    if (!room) return;
    // in order with the room's messages when its match runs in a match host worker (header "Gameplay plugins")
    if (this.queuedRoom(session)) { this.queueEvent(room, () => this.resyncNow(session)); return; }
    this.resyncNow(session);
  }

  /** runResync, now. @param {import('./net.js').Session} session */
  resyncNow(session) {
    if (!session.connected || this.registry.byId(session.playerId) !== session) return;
    const room = this.roomOf(session);
    if (!room) return;
    session.resyncAt = this.now();
    if (room.match) {
      this.callMatch(room, room.spectatorOf(session.playerId) ? 'addSpectator' : 'onReconnect', session.playerId);
      return;
    }
    const frames = this.replayFor(room, session.playerId);
    if (frames) for (const frame of frames) sendRaw(session.ws, frame);
  }

  clearResync(playerId) {
    const t = this.resyncTimers.get(playerId);
    if (t) { clearTimeout(t); this.resyncTimers.delete(playerId); }
  }

  /** Log a per-network limit refusal without letting a refusal loop flood the log. */
  limitWarn(text) {
    const now = this.now();
    if (now - this.limitLog.at < 10_000) { this.limitLog.suppressed++; return; }
    const more = this.limitLog.suppressed ? ` (+${this.limitLog.suppressed} similar refusals)` : '';
    this.limitLog.at = now;
    this.limitLog.suppressed = 0;
    this.log.warn(`[lobby] ${text}${more}`);
  }

  /** A warning logged once per text (the default plugins that cannot be applied …). @param {string} line */
  warnOnce(line) {
    if (this.told.has(line)) return;
    if (this.told.size < 256) this.told.add(line);
    this.log.warn(line);
  }

  /** Number of rooms matching a predicate. */
  countRooms(pred) {
    let n = 0;
    for (const r of this.rooms.values()) if (pred(r)) n++;
    return n;
  }

  /**
   * Route a 'g.*' intent or a 'b.*' report (server/net.js) to the running match — on the room's queue when its match runs
   * in a match host worker (header "Gameplay plugins").
   */
  routeGame(session, msg) {
    const room = this.queuedRoom(session);
    return room ? this.serial(room, () => this.routeGameNow(session, msg)) : this.routeGameNow(session, msg);
  }

  /** routeGame, now. */
  routeGameNow(session, msg) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (msg.t === 'g.test') {
      if (!this.testEnabled) return fail(ERR.TEST_DISABLED);
      if (room.test !== true) return fail(ERR.TEST_FORBIDDEN);
    }
    if (!room.match) return fail(ERR.WRONG_PHASE, 'no running match');
    if (msg.t === 'g.leave') {
      this.removeMember(room, session.playerId);
      return OK;
    }
    // a spectator only watches (header): nothing else of it ever reaches the match
    if (msg.t !== 'g.watch' && !(room.test && msg.t === 'g.test') && room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR);
    let res;
    try {
      res = room.match.handle(session.playerId, msg);
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match.handle(${msg.t}) threw`, e);
      return fail(ERR.INTERNAL);
    }
    if (res && typeof res.then === 'function') {
      // a match in a match host worker answers later (header "Gameplay plugins"): the reply waits for it
      if (room.match?.hosted === true) {
        return Promise.resolve(res).then((r) => matchAnswer(r), (e) => {
          this.log.error(`[lobby] ${room.code} match.handle(${msg.t}) rejected`, e);
          return fail(ERR.INTERNAL);
        });
      }
      // Contract violation (handle must be synchronous): never let the rejection go unhandled.
      this.log.error(`[lobby] ${room.code} match.handle(${msg.t}) returned a Promise; it must be synchronous`);
      Promise.resolve(res).catch((e) => this.log.error(`[lobby] ${room.code} match.handle(${msg.t}) rejected`, e));
      return OK;
    }
    return matchAnswer(res);
  }

  /** Call an optional match hook without letting it throw. onLeave falls back to onDisconnect. */
  callMatch(room, method, ...args) {
    const m = room.match;
    if (!m) return undefined;
    let fn = m[method];
    if (typeof fn !== 'function' && method === 'onLeave') fn = m.onDisconnect;
    if (typeof fn !== 'function') return undefined;
    try {
      return fn.apply(m, args);
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match.${method} threw`, e);
      return undefined;
    }
  }

  disposeMatchCtx(ctx) {
    if (ctx.disposed) return;
    ctx.disposed = true;
    ctx.live = false;
    try { ctx.match?.dispose?.(); } catch (e) { this.log.error('[lobby] match.dispose threw', e); }
  }

  safeData() {
    try { return this.getData(); } catch (e) { this.log.error('[lobby] getData failed', e); return Object.freeze({}); }
  }

  /** How long a dropped solo run stays resumable (ms): the option, else data singleReconnectTime, else 24 h. */
  soloResumeWindowMs() {
    const o = this.opts.soloReconnectWindowMs;
    if (typeof o === 'number' && Number.isFinite(o) && o > 0) return o;
    const sec = this.safeData()?.config?.constants?.singleReconnectTime;
    return (typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? sec : SOLO_RECONNECT_FALLBACK_SEC) * 1000;
  }

  // ---------------------------------------------------------------------------------------------------
  // Membership helpers
  // ---------------------------------------------------------------------------------------------------

  /** The session's current room (self-heals stale `roomCode`). @returns {Room | null} */
  roomOf(session) {
    if (!session.roomCode) return null;
    const room = this.rooms.get(session.roomCode);
    const seat = room ? room.seatOf(session.playerId) : null;
    if (room && !seat && room.spectatorOf(session.playerId)) return room; // a spectator seat
    if (!room || !seat || seat.left || seat.isBot) { session.roomCode = null; return null; }
    return room;
  }

  /** @returns {Seat} */
  humanSeat(idx, session) {
    return {
      seat: idx, playerId: session.playerId, name: session.name, role: session.role ?? null, isBot: false, ready: false, connected: session.connected, left: false,
      // the player's profile (schema v6): the seat card's 立绘 charId and uploaded avatar file, or null
      art: session.art ?? null,
      avatar: session.avatar ?? null,
      loadout: session.loadout || null,
      ops: session.ops || null,
      notOwned: session.notOwned || null,
      diy: session.diy || null,
      skins: session.skins || null,
      // the content each was checked for (header "Gameplay plugins": filtered at the match start when it is another)
      loadoutCs: session.loadoutCs ?? null,
      notOwnedCs: session.notOwnedCs ?? null,
      diyCs: session.diyCs ?? null,
    };
  }

  /**
   * Owner's rule (a human left a running match while another human is still in the room): hand the seat to a fresh AI
   * so the side keeps playing, instead of eliminating it. The match re-keys the whole PlayerState (board, gold,
   * loadout — Match.aiTakeOver) and the lobby seat becomes the bot. removeMember has already detached the departed
   * human's session. Returns false when the match offers no takeover (a MatchClass without the optional hook, or one
   * that already ended), so removeMember falls back to the departed-seat path. The last human leaving never gets here.
   * @param {Room} room @param {Seat} seat @returns {boolean}
   */
  handSeatToAI(room, seat) {
    if (!room.match) return false;
    const bot = this.makeBot(room, seat.seat);
    if (this.callMatch(room, 'aiTakeOver', seat.playerId, bot.playerId, bot.name) !== true) return false;
    seat.playerId = bot.playerId;
    seat.name = bot.name;
    seat.role = null;
    seat.isBot = true;
    seat.connected = true;
    seat.ready = true;
    seat.fromAi = false;
    delete seat.loadout;
    delete seat.notOwned;
    delete seat.diy;
    this.log.info(`[lobby] ${room.code} seat ${seat.seat} handed to the AI ${bot.name}`);
    return true;
  }

  /**
   * Remove a human from a room permanently (leave, grace timeout, expiry, switching rooms).
   * In LOBBY the seat is freed; during a match, with another human still in the room, the seat is handed to an AI
   * (handSeatToAI); only the last human's departure marks the seat departed and calls match.onLeave.
   * @param {Room} room @param {string} playerId
   */
  removeMember(room, playerId) {
    const session = this.registry.byId(playerId);
    if (session && session.roomCode === room.code) session.roomCode = null;
    this.clearGrace(playerId);
    this.clearResync(playerId); // a deferred resync must not fire later against whatever room the player joins next
    this.dropReplay(room, playerId);
    if (this.freeSpectatorSeat(room, playerId)) return;
    const seat = room.seatOf(playerId);
    if (!seat || seat.isBot || seat.left || room.disposed) return;
    if (room.match) {
      // Owner's rule: with another human still in the room the seat is handed to an AI and the match goes on (no
      // elimination); only the last human's departure ends it (abandoned-party / 'empty' below). A match that offers
      // no takeover (a MatchClass without the hook, or one that already ended) falls back to the departed-seat path.
      if (room.activeHumans().some((s) => s.playerId !== playerId) && this.handSeatToAI(room, seat)) {
        // the seat is a bot now: no `left` mark, no onLeave
      } else {
        seat.left = true;
        seat.connected = false;
        seat.ready = false;
        this.callMatch(room, 'onLeave', playerId);
      }
    } else {
      room.seats[seat.seat] = null;
    }
    if (room.disposed) return; // onLeave may have ended the match and emptied the room
    if (room.hostId === playerId) this.migrateHost(room);
    // the party is abandoned (no CONNECTED human left): a coop room does not linger on disconnected seats — every
    // remaining disconnected seat is a departure too, and the last one disposes the room (bots never keep it alive).
    // A solo run keeps its seat for the official 24 h resume.
    if (room.mode !== 'solo' && !room.activeHumans().some((s) => s.connected)) {
      for (const s of [...room.activeHumans()]) this.removeMember(room, s.playerId);
    }
    if (room.disposed) return;
    if (room.activeHumans().length === 0) this.disposeRoom(room, 'empty');
    else this.broadcastState(room);
  }

  /**
   * Free a spectator seat (removeMember): the match forgets the spectator; never a host change or a disposal — a
   * spectator neither holds the host nor keeps a room alive. @returns {boolean} true when it was a spectator seat
   */
  freeSpectatorSeat(room, playerId) {
    const i = room.spectators.findIndex((s) => s.playerId === playerId);
    if (i < 0) return false;
    room.spectators.splice(i, 1);
    if (room.disposed) return true;
    this.callMatch(room, 'removeSpectator', playerId);
    this.broadcastState(room);
    return true;
  }

  /** Lowest-seat connected human becomes host (else lowest-seat human, else null). */
  migrateHost(room) {
    const humans = room.activeHumans();
    const pick = humans.find((s) => s.connected) || humans[0] || null;
    const prev = room.hostId;
    room.hostId = pick ? pick.playerId : null;
    if (pick && prev !== pick.playerId) this.log.info(`[lobby] ${room.code} host → ${pick.name}`);
    // a running match follows the host change: its delegated bot rehearsals fall back to the server and later ones ask
    // the new host (DESIGN §14, Match.setHost)
    if (room.match && room.hostId !== prev) this.callMatch(room, 'setHost', room.hostId);
  }

  startGrace(room, seat) {
    const playerId = seat.playerId;
    this.clearGrace(playerId);
    const spectator = !room.seatOf(playerId) && !!room.spectatorOf(playerId);
    const t = setTimeout(() => {
      this.graceTimers.delete(playerId);
      if (room.disposed) return;
      // During a match a PLAYER's seat belongs to the match (normally kept for the reconnect window) — except when the
      // whole party is gone: with no connected human left the match already runs on server-taken-over AI, so the seat
      // is freed and the room disposed. A solo run keeps its seat for the official 24 h resume instead.
      if (room.match && !spectator) {
        if (room.mode === 'solo') return;
        if (room.activeHumans().some((s) => s.connected)) return;
      }
      const s = room.seatOf(playerId) || room.spectatorOf(playerId);
      if (!s || s.connected) return;
      const session = this.registry.byId(playerId);
      if (session && session.roomCode === room.code) {
        session.notice = 'timeout';
        session.pendingResult = this.replayFor(room, playerId); // still shown after room.closed on resume
      }
      this.removeMember(room, playerId);
    }, this.opts.lobbyGraceMs);
    t.unref?.();
    this.graceTimers.set(playerId, t);
  }

  clearGrace(playerId) {
    const t = this.graceTimers.get(playerId);
    if (t) { clearTimeout(t); this.graceTimers.delete(playerId); }
  }

  /**
   * Delete a room, detach its members (room.closed unless the room simply emptied) and dispose its match.
   * @param {Room} room @param {string} reason
   */
  disposeRoom(room, reason) {
    if (room.disposed) return;
    room.disposed = true;
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    const ctx = room.matchCtx;
    room.match = null;
    room.matchCtx = null;
    room.matchKey = null;
    for (const s of room.seats) {
      if (!s || s.isBot) continue;
      this.clearGrace(s.playerId);
      this.clearResync(s.playerId);
      const session = this.registry.byId(s.playerId);
      if (!session || session.roomCode !== room.code) continue;
      session.roomCode = null;
      if (s.left || reason === 'empty') continue;
      if (session.connected) {
        sendSession(session, { t: 'room.closed', reason });
      } else {
        // Offline member: deliver room.closed on resume AND, when the match just ended, the result replay — a 野排 room
        // is torn down right after the result, so without this the player would never see the settlement.
        session.notice = reason;
        const frames = this.replayFor(room, s.playerId);
        if (frames) session.pendingResult = frames;
      }
    }
    // spectators did not leave: they are told whatever closed the room (its last human leaving included)
    for (const s of room.spectators) {
      this.clearGrace(s.playerId);
      const session = this.registry.byId(s.playerId);
      if (!session || session.roomCode !== room.code) continue;
      session.roomCode = null;
      if (session.connected) sendSession(session, { t: 'room.closed', reason });
      else session.notice = reason;
    }
    room.replay = null; // after the loop: replayFor() above still needs it
    if (ctx) this.disposeMatchCtx(ctx);
    // the room's visual set and content set are no longer held by it (server/plugins/visualSet.js, contentSets.js)
    this.releaseContent(room.content);
    this.log.info(`[lobby] ${room.code} disposed (${reason})`);
  }

  genCode() {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LEN; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------------------------------

  /** Connected, non-departed human sessions of a room — its spectators included (room.state, match broadcasts). */
  *memberSessions(room) {
    for (const s of [...room.seats, ...room.spectators]) {
      if (!s || s.isBot || s.left) continue;
      const session = this.registry.byId(s.playerId);
      if (session && session.connected && session.roomCode === room.code) yield session;
    }
  }

  broadcastState(room) {
    if (room.disposed) return;
    const data = encode(room.toState());
    for (const session of this.memberSessions(room)) sendRaw(session.ws, data);
  }

  // ---- boot art preload gate (server/bootgate.js, docs/MATCHMAKING.md) -----------------------------------------
  // A first-time visitor pulls ~140 MB (art + boot video); on the 20 Mbps uplink a few simultaneous arrivals saturate
  // it and spike everyone's latency. `bootSlots` (default 1) players preload at a time; the rest are told their place
  // and wait, then are pushed `boot.state { granted: true }`.

  /** @param {import('./net.js').Session} session */
  bootClaim(session) {
    const { granted, position } = this.bootGate.claim(session.playerId);
    this.pushBootState(session, granted, position);
    if (!granted) this.drainBoot(); // a sweep may have freed a slot for someone who is not asking again
    return OK;
  }

  /** @param {import('./net.js').Session} session */
  bootRelease(session) {
    if (this.bootGate.release(session.playerId)) this.drainBoot();
    return OK;
  }

  /** Hand free slots to the next waiters and tell each one. */
  drainBoot() {
    for (const playerId of this.bootGate.drain()) {
      const s = this.registry.byId(playerId);
      if (s) this.pushBootState(s, true, 0);
    }
  }

  /** @param {import('./net.js').Session} session @param {boolean} granted @param {number} position */
  pushBootState(session, granted, position) {
    if (session.connected) sendSession(session, { t: 'boot.state', granted, position });
  }

  sendState(room, session) {
    sendSession(session, room.toState());
  }

  /** Match broadcast: encode once, send to every connected member. @returns {string | null} the encoded frame */
  broadcastRoom(room, msg) {
    if (room.disposed) return null;
    const data = encode(msg);
    if (data == null) { this.log.error(`[lobby] ${room.code} unserializable broadcast ${msg && msg.t}`); return null; }
    const droppable = isDroppable(msg);
    for (const session of this.memberSessions(room)) sendRaw(session.ws, data, { droppable });
    return data;
  }

  /** Match unicast. @returns {boolean} */
  sendToPlayer(room, playerId, msg) {
    if (room.disposed) return false;
    const seat = room.seatOf(playerId) || room.spectatorOf(playerId);
    if (!seat || seat.isBot || seat.left) return false;
    const session = this.registry.byId(playerId);
    if (!session || session.roomCode !== room.code) return false;
    return sendSession(session, msg);
  }
}
