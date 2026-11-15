// 选择自编 — 规程's CUSTOM_CHECK step (official enterSteps: INFO_CHECK → BAND_CHECK → CUSTOM_CHECK → BATTLE_CHECK).
// The player's 自选编队 picks are already fixed before the match; here they take at most two tier-5 and two tier-6
// slots into this run (the rest stay out of the pool). The default 盟约 flow has no such step and never mounts this
// screen (config.timers.enterSteps names it only in the version build).
import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon } from '../ui/components.js';
import { Img, useGameData } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { actions } from '../ui/gameActions.js';
import { useStore } from '../store.js';
import { charPortraitUrl } from '../ui/assetUrls.js';
import { sortedPlayers, preGameSteps } from '../ui/gameLogic.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
/** The per-tier take limit (official 自选 Ⅴ/Ⅵ 各 0–2). */
export const CUSTOM_MAX_PER_TIER = 2;

/**
 * Toggle one slot in a selection: `slots` = `{ slotId, tier }[]`, `picked` = the current slot ids. Returns the next
 * list, or null when the slot is unknown or its tier already has CUSTOM_MAX_PER_TIER picks (the card is disabled then).
 */
export function toggleCustomPick(slots, picked, slotId) {
  const slot = slots.find((s) => s.slotId === slotId);
  if (!slot) return null;
  const next = picked.filter((id) => id !== slotId);
  if (next.length === picked.length) {
    const inTier = picked.filter((id) => slots.find((s) => s.slotId === id)?.tier === slot.tier).length;
    if (inTier >= CUSTOM_MAX_PER_TIER) return null;
    next.push(slotId);
  }
  return next;
}

/** CUSTOM_CHECK screen. */
export function CustomScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const gd = useGameData();
  const [exit, setExit] = useState(false);
  const [sending, setSending] = useState(false);
  if (!pub) return null;
  const custom = priv?.custom || null;
  const slots = custom?.slots || [];
  const picked = new Set(custom?.picked || []);
  const ready = !!custom?.ready;
  const players = sortedPlayers(pub);
  const readyN = pub.custom?.ready ?? 0;
  const totalN = pub.custom?.total ?? players.length;
  const step = (gd.config?.timers?.enterSteps || []).find((s) => s && s.step === 'CUSTOM_CHECK');
  const pick = (slot) => {
    if (ready || sending) return;
    const next = toggleCustomPick(slots, [...picked], slot.slotId);
    if (!next) return;
    setSending(true);
    actions.custom(next).finally(() => setSending(false));
  };
  const confirm = async () => {
    if (ready || sending) return;
    setSending(true);
    await actions.customReady(true);
    setSending(false);
  };
  return html`<div class="screen custom">
    <div class="custom__bg" aria-hidden="true"></div>
    <${StepHeader} step=${3} of=${preGameSteps(gd.config)} title=${t('选择自编')} micro="CUSTOM // CUSTOM CHECK" pub=${pub}
      total=${step?.time ?? 30} onExit=${() => setExit(true)} />
    <main class="custom__main">
      <p class="custom__hint">${t('选择本局携带的自编干员：5阶、6阶各至多 {n} 名。', { n: CUSTOM_MAX_PER_TIER })}</p>
      ${slots.length ? [5, 6].map((tier) => {
        const list = slots.filter((s) => s.tier === tier);
        if (!list.length) return null;
        const used = list.filter((s) => picked.has(s.slotId)).length;
        return html`<section key=${tier} class="custom__tier">
          <h3>${t('{tier}阶 自选', { tier })} <span class="num t-dim">${used}/${CUSTOM_MAX_PER_TIER}</span></h3>
          <div class="custom__grid">${list.map((s) => {
            const on = picked.has(s.slotId);
            const full = !on && used >= CUSTOM_MAX_PER_TIER;
            const art = charPortraitUrl(gd?.m, s.charId);
            return html`<button key=${s.slotId} type="button" class=${cx('custom__card', on && 'is-on')}
                disabled=${ready || sending || full} aria-pressed=${on ? 'true' : 'false'} onClick=${() => pick(s)}>
              ${art ? html`<${Img} src=${art} alt="" />` : html`<span class="custom__ph"><${Icon} name="user" /></span>`}
              <b>${s.name}</b>
              ${on ? html`<i class="custom__check"><${Icon} name="check" /></i>` : null}
            </button>`;
          })}</div>
        </section>`;
      }) : html`<p class="custom__empty">${t('没有自编干员')}</p>`}
    </main>
    <footer class="custom__foot">
      <span class="custom__count num">${t('已确认')} <b>${readyN}</b>/${totalN}</span>
      <${Button} variant="primary" size="xl" icon=${ready ? 'check' : 'play'} disabled=${ready} loading=${sending}
        onClick=${confirm}>${ready ? t('已确认') : t('确认自编')}<//>
    </footer>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${String(pub?.modeId || '').includes('single')} />
  </div>`;
}
