// ui/about.js — the 「关于本服务器」 dialog opened from the title screen beside 公告. It is deliberately FACTUAL about
// OUR project and this deployment (docs/README.md), nothing invented:
//   · the version / build tag the client already carries (shared/constants.js APP_VERSION, DEV_BUILD) plus the served
//     runtime's `/healthz` `build` (server/http/buildTag.js — the same tag ui/buildGuard.js watches) and, optionally,
//     the live player count from the same `/healthz`;
//   · the mode list this server offers (shared/constants.js DIFFICULTIES / DIFFICULTY_NAMES — the difficulties the
//     lobby's 创建同盟 and 野排 already use);
//   · the project framing from README §一 ("二次开发版的下载 / 镜像库", distributed on Gitee, clone-and-run);
//   · the operator / asset attribution line the title footer already shows.
// Every fetched field is OPTIONAL: offline the dialog still shows the version, modes and attribution.
//
// Text goes through t() (docs/I18N.md); the difficulty names are msgids already (shared/constants.js DIFFICULTY_NAMES).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { APP_VERSION, DEV_BUILD, DIFFICULTIES, DIFFICULTY_NAMES } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';

/** The Gitee download / mirror repository of this fork's build (README.md §一). */
export const PROJECT_URL = 'https://gitee.com/marseille1/stronghold-protocol-secondary-development-download';
/** The project repository line shown in the dialog (text, not a claim). */
export const PROJECT_REPO_LABEL = 'gitee.com/marseille1/stronghold-protocol-secondary-development-download';

/**
 * Normalise the server info the dialog shows. Pure (no fetch / DOM), so it is unit-testable.
 * @param {{ version?: string, devBuild?: boolean, build?: string|null, online?: number|null, modes?: string[] }} [input]
 * @returns {{ version: string, devBuild: boolean, build: string|null, online: number|null, modes: string[] }}
 */
export function aboutServerInfo({ version = APP_VERSION, devBuild = DEV_BUILD, build = null, online = null, modes = DIFFICULTIES } = {}) {
  return {
    version: String(version),
    devBuild: !!devBuild,
    build: typeof build === 'string' && build ? build : null,
    online: Number.isFinite(online) ? online : null,
    modes: Array.isArray(modes) ? modes.filter((m) => typeof m === 'string' && m) : [],
  };
}

/**
 * The 关于本服务器 dialog. Reads `/healthz` once per open for the served build tag + online count (both optional).
 * @param {{ open: boolean, onClose: Function }} props
 */
export function AboutServerModal({ open, onClose }) {
  const [info, setInfo] = useState(() => aboutServerInfo());
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    fetch('/healthz', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setInfo(aboutServerInfo({ build: j.build, online: j.online })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);
  const modes = info.modes.map((m) => t(DIFFICULTY_NAMES[m] || m)).join(' · ');
  return html`<${Modal} open=${open} title=${t('关于本服务器')} micro="ABOUT THIS SERVER"
      class="title-about" width="min(7.4rem, 94vw)" onClose=${onClose}
      actions=${html`<${Button} variant="primary" data-autofocus onClick=${onClose}>${t('关闭')}<//>`}>
    <dl class="title-about__rows">
      <div><dt>${t('版本')}</dt><dd class="num">v${info.version}</dd></div>
      ${info.build ? html`<div><dt>${t('服务器构建')}</dt><dd class="num">${info.build}</dd></div>` : null}
      ${modes ? html`<div><dt>${t('可用模式')}</dt><dd>${modes}</dd></div>` : null}
      ${info.online != null ? html`<div><dt>${t('在线人数')}</dt><dd class="num">${info.online}</dd></div>` : null}
    </dl>
    <p class="title-about__project">${t('本服务器运行的是独立的二次开发版：整份源码与运行时素材都在 Gitee 仓库分发，clone 下来即可运行。')}</p>
    <p class="title-about__project"><a href=${PROJECT_URL} target="_blank" rel="noopener noreferrer">${t('项目仓库')} · ${PROJECT_REPO_LABEL}</a></p>
    ${info.devBuild ? html`<p class="title-about__disclaimer">${t('开发版 · 不稳定，请勿用于公开服务器')}</p>` : null}
    <p class="title-about__disclaimer title-about__platform">${t('仅支持网页版（桌面浏览器）；手机端可能存在兼容问题')}</p>
    <p class="title-about__disclaimer">${t('非官方同人复刻 · 游戏素材版权归 上海鹰角网络 / Yostar 所有')}</p>
    <p class="title-about__disclaimer">${t('非官方同人作品，仅供学习交流与个人非商业使用；与上海鹰角网络、Yostar 没有任何关系。')}</p>
  <//>`;
}
