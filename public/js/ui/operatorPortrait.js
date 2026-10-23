// 干员立绘 / portrait used by the Hub's loadout deck (adapted from the special 0.3.0 fork's ui/operatorPortrait.js).
// The deck shows the operator in the outfit THIS browser chose: the choice is keyed by the operator's charId (ui/skins.js,
// docs/SKINS.md), the art comes from the composed manifest (a skin's portrait, else the operator's own portraitE2 /
// portrait). Invalid / removed choices fall back to the operator's own art — never to a placeholder.

import { html } from './components.js';
import { Img } from './gameComponents.js';
import { chessPortraitUrl } from './assetUrls.js';
import { useStore } from '../store.js';
import { skinsStore, chosenSkin } from './skins.js';

/**
 * A portrait that follows this browser's skin selection for `chess`.
 * @param {{ m: any, chess: any, skin?: string|null, fallback?: any, [key: string]: any }} props
 */
export function OperatorPortrait({ m, chess, skin, fallback = null, ...props }) {
  // subscribe to this operator's stored choice; the selector value itself is not used (chosenSkin validates it). The
  // parent loadout screen already subscribes to `assets`, so a catalogue arriving re-renders the deck.

  useStore((s) => s.skins?.[chess?.charId] || null, undefined, skinsStore);
  const selected = skin === null ? null : (skin || chosenSkin(chess?.charId));
  const base = chessPortraitUrl(m, chess);
  const src = chessPortraitUrl(m, chess, { skin: selected });
  return html`<${Img} ...${props} src=${src} fallback=${src !== base
    ? html`<${Img} ...${props} src=${base} fallback=${fallback} />`
    : fallback} />`;
}
