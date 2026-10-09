// Room text chat (同盟等待室 + 局内, docs/MATCHMAKING.md §38) — TRANSIENT SPEECH BUBBLES, no log.
//
// One room-scoped mechanism for both contexts: `room.chat { text }` → the server validates it (length cap, control-char
// stripping, per-session rate limit) and broadcasts `m.chat { from, name, text, at }` to every member of the room — the
// seated players AND the spectators — in the waiting lobby and while the room's match runs. The client shows each
// message as a short-lived bubble over the SENDER's seat / player row (CHAT_BUBBLE_MS), then it is gone: there is no
// message list, no history, nothing stored. Player text is ALWAYS rendered as text (Preact escapes `${}`), never
// through innerHTML.
//
//   chatMessage        the pure normalisation of one m.chat frame into the store event shape
//   activeChatBubbles  the pure "which bubble is live right now" mapping (newest per sender, younger than the TTL)
//   ChatBubble         one transient bubble (pops in, fades after the TTL) — placed over the sender
//   ChatComposer       the input + 发送 button; Enter sends; disabled while empty / offline; a hint when rate-limited
//   ChatDock           a collapsible ChatComposer (the in-match entry next to the 交流 button)
//
// Emotes are a separate system (ui/emotes.js) and are untouched. Styles: public/css/screens/room.css / game.css.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { CHAT_MAX, CHAT_BUBBLE_MS } from '../../../shared/constants.js';
import { html, Button, Icon } from './components.js';
import { toastError } from './toasts.js';
import { net } from '../net.js';
import { loadPref, savePref } from '../store.js';
import { bubbleAge } from './emotes.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** localStorage key remembering whether the 聊天 dock was left expanded (both screens share it). */
export const CHAT_OPEN_PREF = 'chatOpen';

/**
 * Whether the 聊天 dock starts expanded: only an explicit saved `true` expands it, so the default is COLLAPSED
 * (consistent with the in-match dock, one click away, Enter still sends).
 * @param {unknown} [value] raw pref value (defaults to the stored one)
 * @returns {boolean}
 */
export const chatDockStartsOpen = (value = loadPref(CHAT_OPEN_PREF, false)) => value === true;

/**
 * Normalise one `m.chat` frame into the transient store event: `{ seq, from, name, text, at }`, or null when it is not
 * a usable message (no text) — every field is coerced, so a hostile / truncated frame can never put a non-string into
 * the renderer. `seq` / `at` are assigned by the receiver (arrival order and time), like the emote events.
 * @param {any} msg
 * @param {number} seq
 * @param {number} at
 * @returns {{ seq: number, from: string|null, name: string, text: string, at: number } | null}
 */
export function chatMessage(msg, seq, at) {
  if (!msg || typeof msg !== 'object') return null;
  const text = typeof msg.text === 'string' ? msg.text : '';
  if (!text) return null;
  return {
    seq: Number.isFinite(seq) ? seq : 0,
    from: typeof msg.from === 'string' && msg.from ? msg.from : null,
    name: typeof msg.name === 'string' ? msg.name : '',
    text,
    at: Number.isFinite(at) ? at : 0,
  };
}

/**
 * The live chat bubbles right now: `from` → `{ text, name, seq, at }` for the NEWEST message of each sender younger
 * than `ttl` (a message from the future by more than a second is ignored — a client-clock oddity, mirror activeBubbles).
 * This is the whole "display": nothing else renders chat, so a message that has aged out simply disappears.
 * @param {Array<{seq:number, from:string|null, name:string, text:string, at:number}>} chat
 * @param {number} now
 * @param {number} [ttl]
 */
export function activeChatBubbles(chat, now, ttl = CHAT_BUBBLE_MS) {
  const out = new Map();
  for (const m of Array.isArray(chat) ? chat : []) {
    if (!m || typeof m !== 'object' || !(now - m.at < ttl) || m.at > now + 1000) continue;
    const cur = out.get(m.from);
    if (!cur || cur.seq < m.seq) out.set(m.from, { text: m.text, name: m.name, seq: m.seq, at: m.at });
  }
  return out;
}

/**
 * One transient speech bubble (text only). The parent keys it by `seq` (a newer message remounts and pops again) and
 * must unmount it once it has aged out; the CSS animation runs for the TTL and fades. `at` (Date.now clock) resumes a
 * bubble mounted late. Own messages get the `is-own` accent.
 * @param {{ name?: string, text: string, own?: boolean, ttl?: number, at?: number, class?: string }} props
 */
export function ChatBubble({ name, text, own = false, ttl = CHAT_BUBBLE_MS, at, class: cls }) {
  const life = Math.max(1000, Number(ttl) || CHAT_BUBBLE_MS);
  const [age] = useState(() => bubbleAge(at, Date.now(), life)); // fixed at mount: the CSS animation runs from there
  const style = [`--chat-ttl:${Math.round(life)}ms`, age && `--chat-age:${Math.round(age)}ms`].filter(Boolean).join(';');
  return html`<div class=${cx('cbubble', own && 'is-own', cls)} style=${style} role="status">
    ${name ? html`<span class="cbubble__name">${name}</span>` : null}
    <span class="cbubble__text">${text}</span>
  </div>`;
}

/**
 * Input + 发送. Enter sends (never during IME composition: a Chinese / Japanese candidate confirm must not send).
 * Disabled while offline or empty; a 3 s hint after the server rate-limits a burst.
 * @param {{ class?: string, disabled?: boolean }} props
 */
export function ChatComposer({ class: cls, disabled = false }) {
  const [draft, setDraft] = useState('');
  const [rateLimited, setRateLimited] = useState(false);
  const alive = useRef(true);
  const timer = useRef(null);
  useEffect(() => () => { alive.current = false; clearTimeout(timer.current); }, []);
  const blocked = disabled || rateLimited;
  const canSend = !blocked && draft.trim().length > 0;
  const send = async () => {
    const text = draft.trim();
    if (!text || blocked) return;
    try {
      await net.request('room.chat', { text });
      if (alive.current) setDraft('');
    } catch (err) {
      if (err?.code === 'RATE') {
        if (!alive.current) return;
        setRateLimited(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { if (alive.current) setRateLimited(false); }, 3000);
      } else toastError(err);
    }
  };
  return html`<div class=${cx('chat-send', cls)}>
    <input class="chat-send__input" type="text" value=${draft} maxlength=${CHAT_MAX} disabled=${disabled}
      placeholder=${t('说点什么…')} aria-label=${t('聊天')}
      onInput=${(e) => setDraft(e.currentTarget.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } }} />
    <${Button} size="sm" icon="send" disabled=${!canSend} onClick=${send}>${t('发送')}<//>
    ${rateLimited ? html`<span class="chat-send__hint t-orange">${t('已发送过快，请稍候')}</span>` : null}
  </div>`;
}

/**
 * Collapsible chat dock (both screens) — the SAME component so the waiting room and the in-match cluster look and
 * behave identically: a `▸ 聊天` header (disclosure triangle + chat icon) that expands to the composer and collapses
 * back. The open/closed state is remembered across sessions (localStorage `chatOpen`, CHAT_OPEN_PREF); the default is
 * collapsed.
 * @param {{ class?: string, disabled?: boolean }} props
 */
export function ChatDock({ class: cls, disabled = false }) {
  const [open, setOpen] = useState(chatDockStartsOpen);
  const onToggle = (e) => {
    const next = !!e.currentTarget.open;
    setOpen(next);
    savePref(CHAT_OPEN_PREF, next);
  };
  return html`<details class=${cx('chat-dock', cls)} open=${open} onToggle=${onToggle}>
    <summary class="chat-dock__sum"><${Icon} name="chat" /><span>${t('聊天')}</span></summary>
    <${ChatComposer} disabled=${disabled} />
  </details>`;
}
