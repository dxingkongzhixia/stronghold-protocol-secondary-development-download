// regulationBackdrop.js — 规程's lobby ground: the official season screen's layers over the hub's drawn radar.
//
// The art comes from the local client (tools/local-extract/season_entry.py: the 规程 season entry's prefabs and their
// sprites, data/local-assets.json group `ui/season/act3autochess/entry`): its worn ground, the 乌萨斯 monument key art
// and the industrial skyline in front, under drawn sun rays and scan lines (css/screens/hub.css `.hub-reg*`). Each
// layer renders only when the extracted art has it; without it the gradient and the rays alone carry the season.
//
// The port follows the mainline's ui/regulationBackdrop.js (their title screen also draws the opening's last frame —
// the film player is not ported yet; the hub and the title wear the layers below instead).
import { html } from './components.js';
import { localAsset } from '../data.js';

/** The local-client art group of 规程's season (data/local-assets.json). */
export const REGULATION_ART = 'ui/season/act3autochess/entry';
/** The season value the hub's `data-season` uses (shared/versions.js family 'regulation'). */
export const REGULATION = 'act3autochess';
/** The season value every 盟约 version wears (the hub's own look). */
export const ALLIANCE = 'alliance';

/**
 * The season of a version: 规程's own look, or the hub's (盟约) — `data-season` on `.lobby-hub`.
 * @param {string | null | undefined} id
 */
export const seasonOf = (id) => (/^act3autochess/.test(String(id ?? '')) ? REGULATION : ALLIANCE);

/** 规程's lobby ground (each layer only when the local-client art has it). */
export function RegulationBackdrop() {
  const art = (name) => localAsset(REGULATION_ART, `sprites/${name}.webp`);
  const [ground, pic, skyline] = [art('bkg_season_on'), art('bg_season_on'), art('bg_front_season_on')];
  return html`<span class="hub-reg" aria-hidden="true">
    ${ground ? html`<img class="hub-reg__ground" src=${ground} alt="" draggable=${false} />` : null}
    <span class="hub-reg__rays"></span>
    ${pic ? html`<img class="hub-reg__pic" src=${pic} alt="" draggable=${false} />` : null}
    ${skyline ? html`<img class="hub-reg__skyline" src=${skyline} alt="" draggable=${false} />` : null}
    <span class="hub-reg__scan"></span>
  </span>`;
}
