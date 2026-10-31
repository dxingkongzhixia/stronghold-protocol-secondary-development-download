// The native-code consent gate (docs/keel/NATIVE-TASKS.md): a content set carrying native sim/match/policy modules does
// not execute on this machine until the player accepts, per content set. It is global (room, briefing, reconnect into a
// running match), because a reconnect with no remembered answer must still be able to authorize the set. The server
// owner's SP_PLUGIN_SCRIPTS + lock/pin gate decides whether the room may offer the code; this decides whether THIS
// browser runs it. The SES sandbox frame is defense in depth, not a promise against a sandbox escape.
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from './components.js';
import { t } from '../../../shared/i18n.js';
import { useStore } from '../store.js';
import { contentSet, acceptNativeConsent, declineNativeConsent } from '../content.js';

export function NativeConsentGate() {
  const cs = useStore((s) => s.room?.content?.cs ?? null);
  const pick = (s) => ({ cs: s.cs, native: s.native, nativeConsent: s.nativeConsent });
  const [state, setState] = useState(() => pick(contentSet.get()));
  const [declined, setDeclined] = useState(false);
  useEffect(() => {
    setState(pick(contentSet.get()));
    return contentSet.subscribe((s) => {
      const next = pick(s);
      setState((prev) => (prev.cs === next.cs && prev.native === next.native && prev.nativeConsent === next.nativeConsent ? prev : next));
    });
  }, []);
  const native = state.cs === cs && Array.isArray(state.native) ? state.native : [];
  if (!cs || !native.length || state.nativeConsent) return null;
  const nameOf = (p) => {
    const n = p?.name;
    if (typeof n === 'string' && n) return n;
    if (n && typeof n === 'object') return n.zh || n.en || p.id;
    return p.id;
  };
  const accept = () => {
    setDeclined(false);
    acceptNativeConsent(cs);
    // A b.start whose contentFor was refused before the click: try it again now that the set may run.
    globalThis.__SP_RUNNER__?.retryStart?.();
  };
  const reject = () => { setDeclined(true); declineNativeConsent(cs); };
  return html`<div class="native-gate" data-testid="native-consent" role="alertdialog" aria-modal="true" aria-label=${t('原生代码插件')}>
    <section class="trusted-consent native-consent">
      <div class="trusted-consent__title"><${Icon} name="warn" /><b>${t('原生代码插件')}</b><${MicroLabel}>NATIVE CODE<//></div>
      <p>${t('此房间启用了原生代码插件。它会在你的浏览器里运行，能读取战斗状态并修改对局；只在你信任插件作者和服务器时继续。')}</p>
      <ul>
        ${native.map((p) => html`<li key=${p.id}>
          <b>${nameOf(p)}</b> <span class="num t-dim">${p.id}${p.version ? ` · v${p.version}` : ''}</span>
          ${p.authors?.length ? html`<span class="t-dim"> · ${t('作者')}: ${p.authors.join(', ')}</span>` : null}
          ${p.modules?.length ? html`<span class="t-dim"> · ${t('模块')}: ${p.modules.map((m) => m.kind).join(', ')}</span>` : null}
          <br/><span class="num t-dim">${t('哈希')}: ${(p.modules || []).map((m) => `${m.entry} ${String(m.sha256).slice(0, 12)}…`).join(' · ')}</span>
        </li>`)}
      </ul>
      ${declined ? html`<p class="trusted-consent__declined" data-testid="native-declined">${t('已拒绝。开始模拟前仍需要你的同意。')}</p>` : null}
      <div class="trusted-consent__actions">
        <${Button} variant="secondary" size="sm" data-testid="native-reject" onClick=${reject}>${t('拒绝')}<//>
        <${Button} variant="primary" size="sm" data-testid="native-accept" onClick=${accept}>${t('我了解风险，继续')}<//>
      </div>
    </section>
  </div>`;
}
