// ui/account.js — the shared account form + dialog (docs/MATCHMAKING.md §8).
//
// 博士代号 = 账号名, so the form never asks for a name of its own: the caller passes `name` (the title's callsign
// field, or the dialog's own field). Used by the title screen and, as a modal, by the lobby so a guest already in
// the game can upgrade to a real account without losing the session (the server binds the account to the live
// session — see Lobby.bindAccount).
//
// Validation philosophy: the submit button is only disabled when the *name* is unusable or we are offline; a short
// password is refused on click with a toast + a hint, so the button is never silently dead.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { AUTH_NAME_MIN, AUTH_NAME_MAX, AUTH_PASS_MIN, AUTH_PASS_MAX } from '../../../shared/constants.js';
import { html, Button, Icon, TextField } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, savePref } from '../store.js';

/** Server error code → Chinese message. */
export const AUTH_ERR_TEXT = {
  BAD_NAME: '代号需 2–12 个字符', BAD_PASSWORD: '密码至少 6 位', NAME_TAKEN: '该代号已被使用',
  BAD_CREDENTIALS: '代号或密码错误', SESSION_EXPIRED: '登录已过期，请重新登录',
};

/** Trim + cap like the server (the server re-sanitizes authoritatively). */
const cleanName = (raw) => String(raw ?? '').trim().slice(0, AUTH_NAME_MAX);

/** Clear the stored account session (logout) — and unbind it server-side, freeing the single-session slot. */
export function logoutAccount() {
  net.request('auth.logout').catch(() => {});
  net.setAccountToken(null);
  savePref('authToken', null);
  store.patch('auth', { account: null, error: null });
}

/**
 * The 登录 / 注册 form (tabs + password + submit + hints). The account name comes from `name`.
 * @param {{ name: string, onDone?: () => void }} props
 */
export function AccountForm({ name, onDone }) {
  const auth = useStore((s) => s.auth, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  const [mode, setMode] = useState('login');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const online = conn.status === 'online' || conn.status === 'connected';
  const accountName = cleanName(name);
  const nameOk = accountName.length >= AUTH_NAME_MIN && accountName.length <= AUTH_NAME_MAX;
  // Enabled whenever the name is usable and we are online — a short password is answered with a toast, not silence.
  const canSubmit = nameOk && online && !busy;
  // A stale error stops being relevant once the account name is edited.
  useEffect(() => { setError(null); }, [accountName]);
  const fail = (message) => { setError(message); toast(message, 'warn'); };
  const submit = async () => {
    setError(null);
    if (!online) return fail('正在连接服务器，请稍候…');
    if (!nameOk) return fail(`代号需 ${AUTH_NAME_MIN}–${AUTH_NAME_MAX} 个字符`);
    if (pw.length < AUTH_PASS_MIN) return fail(`密码至少 ${AUTH_PASS_MIN} 位`);
    setBusy(true);
    try {
      if (mode === 'register') await net.authRegister(accountName, pw);
      else await net.authLogin(accountName, pw);
      setPw('');
      toast(mode === 'register' ? '注册成功，已登录' : '登录成功', 'success');
      onDone?.();
    } catch (err) {
      // Duplicate names get called out explicitly (the server enforces case-insensitive uniqueness).
      const message = err?.code === 'NAME_TAKEN'
        ? `代号「${accountName}」重名，已被占用 —— 请换一个`
        : (AUTH_ERR_TEXT[err?.code] || err?.message || '登录失败');
      setError(message);
      toast(message, 'error');
    } finally { setBusy(false); }
  };
  return html`<div class="account-form">
    <div class="account-form__tabs" role="tablist">
      <button type="button" role="tab" aria-selected=${mode === 'login'} class=${mode === 'login' ? 'is-on' : ''} onClick=${() => setMode('login')}>登录</button>
      <button type="button" role="tab" aria-selected=${mode === 'register'} class=${mode === 'register' ? 'is-on' : ''} onClick=${() => setMode('register')}>注册</button>
    </div>
    <${TextField} size="md" icon="key" type="password" value=${pw} maxLength=${AUTH_PASS_MAX}
      placeholder=${`密码（≥${AUTH_PASS_MIN} 位）`} onInput=${(v) => { setPw(v); if (error) setError(null); }} onEnter=${submit} />
    <${Button} variant="primary" size="lg" block=${true} loading=${busy} disabled=${!canSubmit} onClick=${submit}>${mode === 'register' ? '注册并进入' : '登录并进入'}<//>
    ${error ? html`<span class="account-form__err">${error}</span>`
      : (auth?.error ? html`<span class="account-form__err">${AUTH_ERR_TEXT[auth.error] || auth.error}</span>` : null)}
    <span class="account-form__hint">${!nameOk
      ? `请填写 ${AUTH_NAME_MIN}–${AUTH_NAME_MAX} 个字符的代号`
      : (pw.length >= AUTH_PASS_MIN ? '代号即账号名 · 登录后可参与「搜寻队友」野排' : `密码至少 ${AUTH_PASS_MIN} 位`)}</span>
  </div>`;
}

/** The logged-in summary + 退出 (shared by the title panel and the dialog). */
export function AccountWho({ account }) {
  return html`<div class="account-who">
    <span class="account-who__line"><${Icon} name="user" />已登录 · <b>${account.name}</b></span>
    <${Button} variant="secondary" onClick=${logoutAccount}>退出登录<//>
  </div>`;
}

/**
 * A modal that lets a guest already in the game register / log in, binding the account to the CURRENT session
 * (so the room / match continues). Mount it conditionally so it starts fresh each time.
 * @param {{ onClose: () => void, defaultName?: string }} props
 */
export function AccountDialog({ onClose, defaultName = '' }) {
  const auth = useStore((s) => s.auth, shallowEqual);
  const [name, setName] = useState(defaultName);
  return html`<div class="account-modal" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="account-modal__card brackets">
      <div class="account-modal__head"><span>账号</span>
        <button type="button" class="account-modal__close" onClick=${onClose} aria-label="关闭">✕</button></div>
      ${auth?.account
        ? html`<${AccountWho} account=${auth.account} />`
        : html`<div class="account-modal__body">
            <${TextField} size="md" icon="user" value=${name} maxLength=${AUTH_NAME_MAX}
              placeholder=${`代号（${AUTH_NAME_MIN}–${AUTH_NAME_MAX} 字符）`} onInput=${setName} />
            <${AccountForm} name=${name} onDone=${onClose} />
            <span class="account-modal__note">已是游客？注册或登录后，当前这一局会继续，只是身份升级为正式账号。</span>
          </div>`}
    </div>
  </div>`;
}
