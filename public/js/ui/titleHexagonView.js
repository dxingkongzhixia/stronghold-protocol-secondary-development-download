// The six-title hexagon shared by the statistics overview (screens/stats.js) and the achievements panel
// (ui/achievements.js): the official statistics art when the asset pack has it (titleMask / decoration / countGlow),
// six wedges that fill with each title's count (0..20), and the counts beside their names.
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { Img } from './gameComponents.js';
import { uiUrl } from './assetUrls.js';
import { fmtNum } from './gameLogic.js';
import { t } from '../../../shared/i18n.js';
import { TITLE_HEX_SECTORS, titleSectorClip } from './titleHexagon.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** @param {{ titles: Array<{ id: string, count?: number, name?: string, text?: string }>, manifest: any }} props */
export function TitleHexagon({ titles, manifest }) {
  const byId = new Map(titles.map((x) => [x.id, x]));
  const mask = uiUrl(manifest, 'statistics/titleMask');
  const glow = uiUrl(manifest, 'statistics/countGlow');
  const [loadedArt, setLoadedArt] = useState([]);
  useEffect(() => {
    let active = true;
    const images = [mask, glow].filter(Boolean).map((url) => {
      const image = new Image();
      image.onload = () => { if (active) setLoadedArt((loaded) => loaded.includes(url) ? loaded : [...loaded, url]); };
      image.src = url;
      return image;
    });
    return () => { active = false; for (const image of images) image.onload = null; };
  }, [mask, glow]);
  return html`<div class=${cx('st-titlehex', mask && loadedArt.includes(mask) && 'has-reference-mask')} role="group" aria-label=${t('称号')}
    style=${{ '--st-title-mask': mask ? `url("${mask}")` : undefined, '--st-title-glow': glow && loadedArt.includes(glow) ? `url("${glow}")` : undefined }}>
    <div class="st-titlehex__graphic" aria-hidden="true">
      ${TITLE_HEX_SECTORS.map(([id, angle]) => {
        const clip = titleSectorClip(byId.get(id)?.count || 0);
        return html`<div key=${id} class="st-titlehex__wedge"
          style=${{ '--sector-angle': `${angle}deg`, '--texture-angle': `${-angle}deg` }}>
          <div class="st-titlehex__base"></div>
          ${clip ? html`<div class="st-titlehex__active"><div class="st-titlehex__sector" style=${{ clipPath: clip }}>
            <div class="st-titlehex__texture"></div>
          </div></div>` : null}
        </div>`;
      })}
      <${Img} src=${uiUrl(manifest, 'statistics/decoration')} class="st-titlehex__decoration" />
    </div>
    <ul class="st-titlehex__labels">
      ${TITLE_HEX_SECTORS.map(([id], i) => {
        const x = byId.get(id);
        return x ? html`<li key=${id} class=${cx('st-titlehex__label', `st-titlehex__label--${i}`)} title=${x.text || ''}>
          <b class=${cx('st-titlehex__count num', x.count >= 20 && 'is-bright')}>${fmtNum(x.count || 0)}</b><span class="st-titlehex__name">${x.name || id}</span>
        </li>` : null;
      })}
    </ul>
  </div>`;
}
