// Briefing — INFO_CHECK "1/2 确认本局信息" (research 06 §4.1, D1): enemy leader (silhouette, name,
// abilities), stage (+ its pool: 战场固定 / 战场随机（共N张）), 特训敌人 factions (icon, name, description), the difficulty
// tag, the ready count x/N with person pips, the 准备就绪 button (g.infoReady) and the countdown. The right column — 核心盟约
// / 附加盟约 rows of bond discs (disabled bonds greyed with the banned-member badge), the legend and the 本局禁用干员
// avatars, with the player's own 自选 pieces out of the shop (m.private.diyBanned) — is ui/matchInfo.js MatchInfo, the same
// blocks the strategy draft's 本局信息 dialog shows (screens/bandDraft.js). The enemy column is shared too:
// ui/matchEnemies.js MatchEnemies (GitHub #484).

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon } from '../ui/components.js';
import { useGameData } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfo, matchInfoModel } from '../ui/matchInfo.js';
import { MatchEnemies } from '../ui/matchEnemies.js';
import { LoadoutButton } from './loadout.js';
import { UnofficialMark } from '../ui/pluginTag.js';
import { SetupReroll } from '../ui/setupReroll.js';
import { actions } from '../ui/gameActions.js';
import { sortedPlayers, phaseTotalSeconds, preGameSteps } from '../ui/gameLogic.js';
import { useStore } from '../store.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * 规程 personal briefing: the two core-bond groups (m.private.coreBond { groups, pick }), one keeps its bonds and the
 * other's operators leave the simulation (g.coreBond). Shown only while the server offers a choice (regulation solo).
 */
function CoreBondChoice({ coreBond, gd }) {
  const [busy, setBusy] = useState(false);
  if (!coreBond || !Array.isArray(coreBond.groups) || coreBond.groups.length < 2) return null;
  const picked = Number.isInteger(coreBond.pick) ? coreBond.pick : null;
  const pick = async (group) => {
    if (picked != null || busy) return;
    setBusy(true);
    await actions.coreBond(group);
    setBusy(false);
  };
  return html`<section class="corepick" aria-label=${t('核心盟约')}>
    <h3 class="corepick__title">${t('核心盟约')}<span class="num t-dim"> CORE BOND</span></h3>
    <p class="corepick__hint">${picked == null ? t('选择一项') : t('已选择')}</p>
    ${coreBond.groups.map((group, i) => html`<button key=${i} type="button" class=${cx('corepick__opt', picked === i && 'is-active')}
        disabled=${picked != null || busy} onClick=${() => pick(i)}>
      <b class="corepick__letter">${String.fromCharCode(65 + i)}</b>
      <span class="corepick__bonds">${group.map((id) => (gd?.bond(id)?.name || id)).join(' · ')}</span>
      ${picked === i ? html`<span class="corepick__on">${t('已选择')}</span>` : null}
    </button>`)}
  </section>`;
}

/** INFO_CHECK screen. */
export function BriefingScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const solo = useStore((s) => s.room?.mode === 'solo') || String(pub?.modeId || '').includes('single');
  // gameplay plugins (DESIGN §32.6): the briefing says the match is unofficial
  const room = useStore((s) => s.room);
  const gd = useGameData();
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!pub) return null;

  const players = sortedPlayers(pub);
  const me = players.find((p) => p.playerId === myId);
  const readyN = players.filter((p) => p.ready).length;
  const mode = gd.config?.modes?.[pub.modeId];
  // (+ the own 自选 pieces this match leaves out of the shop: m.private.diyBanned)
  const info = matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: { chess: data.get('chess'), backups: data.get('backups') } });

  const ready = async () => {
    if (busy || me?.ready) return;
    setBusy(true);
    await actions.infoReady(pub.setupRevision ?? 0);
    setBusy(false);
  };

  return html`<div class="screen brief">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${1} of=${preGameSteps(gd.config)} title=${t('确认本局信息')} micro="BRIEFING // INFO CHECK" pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config)} onExit=${() => setExit(true)} />
    <${UnofficialMark} room=${room} class="brief__modmark" />
    <main class="brief__main">
      <section class="brief__left">
        <${MatchEnemies} pub=${pub} gd=${gd} />
      </section>
      <section class="brief__right">
        <${CoreBondChoice} coreBond=${priv?.coreBond} gd=${gd} />
        <${MatchInfo} model=${info} />
      </section>
    </main>
    <${SetupReroll} pub=${pub} />
    <footer class="brief__foot">
      <${LoadoutButton} from="briefing" size="lg" class="brief-loadout" />
      <div class="brief-ready">
        <span class="brief-ready__txt">${t('已就绪')} <b class="num">${readyN}</b><span class="num">/${players.length}</span></span>
        <span class="brief-ready__pips">${players.map((p) => html`<i key=${p.playerId} class=${cx(p.ready && 'on', p.playerId === myId && 'me')} title=${p.name}><${Icon} name="user" /></i>`)}</span>
      </div>
      <${Button} variant="primary" size="xl" icon=${me?.ready ? 'check' : me ? 'play' : 'eye'} active=${!!me?.ready} loading=${busy}
        disabled=${!!me?.ready || !me || !!pub.rerollVote} onClick=${ready}>${me?.ready ? t('已就绪') : me ? t('准备就绪') : t('观战中')}<//>
    </footer>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
  </div>`;
}
