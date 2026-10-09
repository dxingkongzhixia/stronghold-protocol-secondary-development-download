// Room text chat (同盟等待室 + 局内, docs/MATCHMAKING.md §38).
//
// One room-scoped mechanism for both contexts: `room.chat { text }` → the server validates it (length cap, control-char
// stripping, per-session rate limit) and broadcasts `m.chat { from, name, text, at }` to every member of the room — the
// seated players AND the spectators — in the waiting lobby and while the room's match runs. A session that enters (or
// re-enters) a room is sent the recent history as `room.chat { messages: [...] }`.
//
//   chatLine / chatHistory / appendChat   the pure mapping/normalisation of the wire frames into the store slice
//   ChatLog        the scrollable message list (name + text; own messages highlighted) — display only
//   ChatComposer   the input + 发送 button; Enter sends; disabled while empty / offline; a hint when rate-limited
//   ChatBox        ChatLog + ChatComposer (the waiting-room panel and the in-match widget)
//   ChatDock       a collapsible ChatBox (the in-match 聊天 entry, beside the 交流 button)
//
// Player text is ALWAYS rendered as text (Preact escapes `${}`), never through innerHTML; the server already strips
// control characters. Emotes are a separate system (ui/emotes.js) and are untouched here.
// Styles: public/css/screens/room.css (.room-chat / .chat-*) and public/css/screens/game.css (.gm-chat / .chat-*).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { CHAT_MAX, CHAT_HISTORY } from '../../../shared/constants.js';
import { html, Button, Icon } from './components.js';
import { toastError } from './toasts.js';
import { net } from '../net.js';
import { useStore, shallowEqual } from '../store.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * One chat message from the wire, normalised to the store shape — null when it is not a usable message. Every field is
 * coerced, so a hostile / truncated frame can never put a non-string into the renderer.
 * @param {any} msg m.chat / a room.chat history entry
 * @returns {{ from: string|null, name: string, text: string, at: number } | null}
 */
export function chatLine(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const text = typeof msg.text === 'string' ? msg.text : '';
  if (!text) return null;
  return {
    from: typeof msg.from === 'string' && msg.from ? msg.from : null,
    name: typeof msg.name === 'string' ? msg.name : '',
    text,
    at: Number.isFinite(msg.at) ? msg.at : 0,
  };
}

/**
 * A room.chat history payload (`{ messages }`) as the store slice: usable lines only, oldest first, at most `max`.
 * @param {any} list
 * @param {number} [max]
 */
export function chatHistory(list, max = CHAT_HISTORY) {
  const src = Array.isArray(list) ? list : [];
  return src.map(chatLine).filter(Boolean).slice(-max);
}

/**
 * Append one wire message to a chat slice: the new line last, capped at `max` (returns the same array when the message
 * is unusable).
 * @param {{ from: string|null, name: string, text: string, at: number }[]} list
 * @param {any} msg
 * @param {number} [max]
 */
export function appendChat(list, msg, max = CHAT_HISTORY) {
  const line = chatLine(msg);
  if (!line) return Array.isArray(list) ? list : [];
  return [...(Array.isArray(list) ? list : []), line].slice(-max);
}

/**
 * Scrollable message log (name + text). Own messages are highlighted. Renders player text as text.
 * @param {{ class?: string, myId?: string|null, limit?: number, empty?: boolean }} props
 */
export function ChatLog({ class: cls, myId = null, limit = 0, empty = true }) {
  const chat = useStore((s) => s.chat, shallowEqual);
  const ref = useRef(null);
  const lines = limit > 0 ? chat.slice(-limit) : chat;
  // follow the tail whenever a message arrives
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);
  return html`<div class=${cx('chat-log', cls)} ref=${ref} role="log" aria-live="polite">
    ${lines.length === 0 && empty
      ? html`<p class="chat-log__empty t-dim">${t('暂无消息')}</p>`
      : lines.map((m, i) => html`<p key=${`${m.at}-${m.from}-${i}`} class=${cx('chat-log__line', m.from != null && m.from === myId && 'is-me')}>
          <span class="chat-log__name">${m.name || t('博士')}</span>
          <span class="chat-log__text">${m.text}</span>
        </p>`)}
  </div>`;
}

/**
 * Input + 发送. Enter sends (never Shift+Enter: a single-line input has no newline anyway). Disabled while offline or
 * empty; a 3 s hint after the server rate-limits a burst.
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
 * Message log + composer (the waiting-room panel; also the body of ChatDock).
 * @param {{ class?: string, disabled?: boolean, title?: boolean, limit?: number, logClass?: string }} props
 */
export function ChatBox({ class: cls, disabled = false, title = true, limit = 0, logClass = null }) {
  const myId = useStore((s) => s.me.playerId);
  return html`<section class=${cx('chat-panel', 'brackets', cls)} aria-label=${t('聊天')}>
    ${title ? html`<header class="chat-panel__head"><${Icon} name="chat" /><span>${t('聊天')}</span></header>` : null}
    <${ChatLog} myId=${myId} limit=${limit} class=${logClass} />
    <${ChatComposer} disabled=${disabled} />
  </section>`;
}

/**
 * Collapsible in-match chat entry (`<details>`): the summary is the 聊天 toggle; opens onto a compact ChatBox. Placed
 * beside the 交流 button (ui/emotes.js) so both live in the bottom-left communication cluster.
 * @param {{ class?: string, disabled?: boolean }} props
 */
export function ChatDock({ class: cls, disabled = false }) {
  return html`<details class=${cx('chat-dock', cls)}>
    <summary class="chat-dock__sum"><${Icon} name="chat" /><span>${t('聊天')}</span></summary>
    <${ChatBox} disabled=${disabled} title=${false} />
  </details>`;
}
