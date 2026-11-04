// public/dev/mobile-audit.js — mock page skeletons for tools/mobile-audit.mjs (docs/MOBILE-UI.md §7 M0.3).
// Every page uses the real stylesheets and the real class names; content is mock, there is no socket, no login and no art.
// The audit measures these pages at the P0 viewport matrix; the harness chrome (nav) is never measured.
const PLAYERS = [
  { name: '星空', band: '阿米娅', ready: true, you: true },
  { name: '凛冬', band: '歌利亚', ready: true },
  { name: '阿米娅', band: '杜宾', ready: false },
  { name: '华法琳', band: '克莱门莎', ready: false },
];
const MODES = [
  { name: '标准', desc: '标准盟约赛制，四人对局', sel: true },
  { name: '自选', desc: '自定义干员与道具', sel: false },
  { name: '极限', desc: '更高难度与更少生命', sel: false },
];
const RESULTS = PLAYERS.map((p, i) => ({ ...p, place: i + 1, lp: 40 - i * 7, kills: 39 - i * 8, dmg: 128000 - i * 26000 }));
const STATS = [
  ['总对局', '128'], ['胜率', '46.9%'], ['最高波次', '13'], ['平均排名', '2.31'],
  ['击杀', '4 812'], ['造成伤害', '9 204 118'], ['承伤', '7 301 442'], ['治疗', '1 002 873'],
];
const TIPS = [
  '拖动棋子到高台可以改变攻击方向。',
  '同名的羁绊层数在备战阶段结算。',
  '商店刷新前先看需要的对子。',
  '漏怪会扣除目标生命，注意提前布防。',
];

const btn = (label, cls = 'btn', extra = '') => `<button type="button" class="${cls}" ${extra}>${label}</button>`;
const scard = (name, price, bonds) => `
  <button type="button" class="scard" aria-label="${name}">
    <span class="scard__bg" aria-hidden="true"></span>
    <span class="scard__top"><span class="scard__pips">${'◆'.repeat(3)}</span></span>
    <span class="scard__body">
      <span class="scard__name">${name}</span>
      <span class="scard__bonds">${bonds}</span>
      <span class="scard__class">近卫</span>
    </span>
    <span class="scard__free">${price}</span>
  </button>`;

const PAGES = {
  lobby() {
    return `<div class="screen lobby-screen" data-page="lobby">
      <header class="topbar">
        <div class="topbar__left"><b class="logo">卫戍协议</b><span class="t-dim">v0.4.0</span></div>
        <div class="topbar__right">${btn('设置')}${btn('图鉴')}${btn('统计')}</div>
      </header>
      <div class="lobby-body">
        <section class="lobby-left">
          <h2 class="section__title">选择模式</h2>
          <div class="mode-cards">
            ${MODES.map((m) => `<button type="button" class="mode-card brackets${m.sel ? ' is-selected' : ''}">
              <span class="mode-card__bg" aria-hidden="true"></span>
              <b class="mode-card__name">${m.name}</b><span class="mode-card__desc">${m.desc}</span>
            </button>`).join('')}
          </div>
          <div class="tips brackets"><div class="tips__head"><span class="tips__idx num">01<span class="t-dim">/04</span></span>
            <button type="button" class="tips__nav" aria-label="上一条">‹</button>
            <button type="button" class="tips__nav" aria-label="下一条">›</button></div>
            <p class="tips__text">${TIPS[0]}</p></div>
        </section>
        <aside class="lobby-right">
          <div class="create-box brackets">
            <h3 class="create-box__title">创建房间</h3>
            <label class="field"><span>房间名</span><input value="星空的车队" /></label>
            <div class="create-box__actions">${btn('创建', 'btn btn--primary')}${btn('快速加入')}</div>
          </div>
          <div class="mm-box brackets">
            <h3 class="mm-box__title">在线房间</h3>
            <ul class="mm-list">${[1, 2, 3].map((i) => `<li class="mm-row"><span>房间 ${i}</span><span class="t-dim">2/4</span>${btn('加入', 'btn btn--sm')}</li>`).join('')}</ul>
          </div>
        </aside>
      </div>
    </div>`;
  },

  hub() {
    return `<div class="screen protocol-screen" data-page="hub">
      <div class="lobby-hub">
        <header class="topbar hub-topbar">
          <div class="topbar__left"><b class="logo">卫戍协议</b><span class="connection-status">● 已连接</span></div>
          <div class="topbar__right">${btn('设置')}</div>
        </header>
        <div class="hub-stage">
          <div class="hub-center"><b class="hub-center__title">卫戍协议</b><span class="t-dim">选择行动 · 在线 21</span></div>
          <section class="hub-entries">
            <div class="hub-entries__row">
              ${[['独立模拟', '独自调配'], ['同盟模拟', '组队协作'], ['同盟匹配', '快速加入']]
                .map(([t, d], i) => `<button type="button" class="hub-entry hub-entry--${i === 0 ? 'solo hub-entry--mint' : i === 1 ? 'coop hub-entry--mint' : 'mm hub-entry--amber is-featured'}">
                  <b class="hub-entry__title">${t}</b><span class="hub-entry__desc">${d}</span></button>`).join('')}
            </div>
          </section>
        </div>
      </div>
    </div>`;
  },

  room() {
    return `<div class="screen room-screen" data-page="room">
      <header class="topbar">
        <div class="topbar__left"><b>房间</b><span class="invite__code"><span>VQHY</span>${btn('复制', 'btn btn--sm')}</span></div>
        <div class="topbar__right">${btn('离开')}</div>
      </header>
      <section class="seats">
        ${PLAYERS.map((p, i) => `<div class="seat${p.ready ? ' is-ready' : ''}">
          <span class="seat__no num">P${i + 1}</span>
          <span class="seat__name">${p.name}</span>
          <span class="seat__band">${p.band}</span>
          <span class="seat__state">${p.ready ? '已准备' : '未准备'}</span>
        </div>`).join('')}
      </section>
      <section class="invite brackets">
        <span class="invite__label">邀请链接</span>
        <div class="invite__code"><span>http://183.66.27.19:20522/?room=VQHY</span></div>
        <div class="invite__btns">${btn('复制链接')}${btn('分享')}</div>
      </section>
      <footer class="room-bar">
        <div class="chat-dock"><button type="button" class="chat-dock__toggle">聊天</button></div>
        ${btn('准备', 'btn btn--primary')}
      </footer>
    </div>`;
  },

  result() {
    return `<div class="screen result" data-page="result">
      <div class="result__bg" aria-hidden="true"></div>
      <div class="result__grid" aria-hidden="true"></div>
      <div class="result__main">
        <section class="result__hero">
          <h1 class="result__headline">行动结束</h1>
          <p class="result__sub">目标生命 3 · 用时 21:04 · 完美作战</p>
          <div class="result__actions">${btn('再来一局', 'btn btn--primary')}${btn('返回大厅')}</div>
        </section>
        <section class="result__summary">
          ${RESULTS.map((r) => `<div class="rcard${r.you ? ' is-you' : ''}">
            <div class="rcard__head"><span class="rcard__place num">#${r.place}</span>
              <span class="rcard__who"><b class="rcard__name">${r.name}</b>${r.you ? '<span class="rcard__you">你</span>' : ''}
              <span class="rcard__band">${r.band}</span></span></div>
            <div class="rcard__mid"><span class="rcard__lineup">🔥 ${r.kills} 击杀 · ${(r.dmg / 1000).toFixed(0)}k 伤害 · LP ${r.lp}</span></div>
          </div>`).join('')}
        </section>
      </div>
    </div>`;
  },

  settle() {
    return `<div class="screen result settle" data-page="settle">
      <div class="settle__stage">
        <div class="settle__barbg" aria-hidden="true"></div>
        <div class="slogo"><span class="slogo__txt">行动结束</span></div>
        <div class="splate"><div class="splate__info">${RESULTS.map((r) => `<div class="srow${r.you ? ' is-you' : ''}">
          <span class="srow__place num">${r.place}</span><span class="srow__name">${r.name}</span>
          <span class="srow__band">${r.band}</span><span class="srow__lp num">${r.lp}</span>
          <span class="srow__dmg num">${r.dmg}</span></div>`).join('')}</div></div>
        <button type="button" class="settle__next"><span class="settle__nextlabel">下一步</span></button>
      </div>
    </div>`;
  },

  codex() {
    return `<div class="screen cx" data-page="codex">
      <div class="cx__box">
        <header class="cx__head">
          <div class="cx__titles"><h1 class="cx__title">图鉴</h1><span class="t-dim">干员 · 道具 · 敌人</span></div>
          <div class="cx__tabs tabs"><button type="button" class="tabs__tab is-active">干员</button>
            <button type="button" class="tabs__tab">道具</button><button type="button" class="tabs__tab">敌人</button></div>
          <input class="cx-search" placeholder="检索" />
          ${btn('关闭')}
        </header>
        <div class="cx__body">
          <aside class="cx-side">${['全部', '先锋', '近卫', '重装', '狙击', '术师', '医疗', '辅助', '特种'].map((x) => `<button type="button" class="cx-chip">${x}</button>`).join('')}</aside>
          <section class="cx-list">${Array.from({ length: 12 }, (_, i) => `<article class="cx-entry">
            <b class="cx-entry__name">干员 ${i + 1}</b><span class="cx-entry__tags">近卫 · 维多利亚</span>
            <p class="cx-entry__desc">攻击范围内所有敌人，技能开启时提升攻击力。</p></article>`).join('')}</section>
        </div>
        <section class="guide__box"><header class="guide__head"><h2 class="guide__title">指南</h2>
          <div class="guide__chapters"><button type="button" class="guide__chapter">基础</button><button type="button" class="guide__chapter">盟约</button></div></header>
          <div class="guide__stage guide__stage--text"><p>拖动棋子部署，点击开始战斗。</p></div></section>
      </div>
    </div>`;
  },

  stats() {
    return `<div class="screen st" data-page="stats">
      <header class="st-top"><div class="st-top__left">${btn('返回')}<b>数据统计</b></div><div class="st-top__right">${btn('导出')}</div></header>
      <div class="st-body">
        <section class="st-cards">${STATS.map(([label, num]) => `<div class="st-card">
          <span class="st-card__num num">${num}</span><span class="st-card__label">${label}</span></div>`).join('')}</section>
        <section class="st-overview-details">
          <table class="st-table"><thead><tr><th>模式</th><th>对局</th><th>胜率</th><th>最高波次</th><th>平均排名</th></tr></thead>
            <tbody>${['标准', '自选', '极限'].map((m) => `<tr><td>${m}</td><td>42</td><td>47%</td><td>13</td><td>2.3</td></tr>`).join('')}</tbody></table>
        </section>
      </div>
    </div>`;
  },

  settings() {
    const rows = [['画面质量', '低'], ['屏幕适配', '自动'], ['文字大小', '100%'], ['语音语言', '日语'], ['触屏震动', '关'], ['减少动效', '跟随系统']];
    return `<div class="screen" data-page="settings">
      <div class="set-panel brackets">
        <header class="set-head"><b>设置</b>${btn('关闭')}</header>
        <div class="set-list">${rows.map(([k, v]) => `<div class="set-row">
          <span class="set-row__label">${k}</span>
          <span class="set-row__val num">${v}</span>
          <button type="button" class="btn btn--sm">切换</button></div>`).join('')}</div>
        <div class="set-keys"><div class="set-keys__row"><span>确认</span><kbd>Enter</kbd></div>
          <div class="set-keys__row"><span>取消</span><kbd>Esc</kbd></div></div>
      </div>
    </div>`;
  },

  game() {
    return `<div class="screen gm" data-page="game">
      <div class="gm__field" aria-hidden="true"></div>
      <div class="gm__vignette" aria-hidden="true"></div>
      <div class="gm__hud">
        <header class="gm__top"><span class="gm__lp num">3</span><span class="gm__gold num">42</span><span class="gm__round">第 9 波</span></header>
        <div class="gm__bonds"><div class="bstrip">${['维多利亚', '深海猎人', '精准', '盟约', '投资'].map((b) => `<button type="button" class="bslot">
          <span class="bond"><span class="bond__name">${b}</span><span class="bond__layers num">3</span></span></button>`).join('')}<button type="button" class="bstrip__more">+2</button></div></div>
        <div class="gm__teamcol">${PLAYERS.map((p) => `<div class="team-row"><span class="team-row__name">${p.name}</span>
          <span class="team-row__hp num">40</span></div>`).join('')}</div>
        <div class="shopbar">
          <div class="shopbar__tools">${btn('刷新')}${btn('升级')}${btn('冻结')}</div>
          <div class="shopbar__remain">剩余 <b class="num">42</b></div>
          <div class="shopbar__row">${scard('推进之王', 1, '先锋 · 维多利亚')}${scard('银灰', 3, '近卫 · 喀兰')}
            ${scard('德克萨斯', 2, '先锋 · 叙拉古')}${scard('白面鸮', 2, '医疗 · 莱茵')}${scard('艾雅法拉', 3, '术师 · 莱茵')}</div>
        </div>
        <div class="gm__corner">${btn('撤退')}${btn('技能')}${btn('二倍速')}${btn('暂停')}</div>
      </div>
    </div>`;
  },
};

const nav = document.getElementById('ma-nav');
const current = new URLSearchParams(location.search).get('page') || 'lobby';
nav.innerHTML = Object.keys(PAGES).map((k) =>
  `<a href="?page=${k}"${k === current ? ' aria-current="page"' : ''}>${k}</a>`).join('');
const host = document.getElementById('app');
const build = PAGES[current] || PAGES.lobby;
host.innerHTML = build();
document.documentElement.dataset.auditPage = current;

// The settle page scales its 19.2×10.8 rem stage to the viewport in the real screen (JS sets --k); the harness does the
// same so its 下一步 button sits where it really does.
if (current === 'settle') {
  const stage = host.querySelector('.settle__stage');
  if (stage) {
    const fit = () => {
      const w = stage.offsetWidth || 1, h = stage.offsetHeight || 1;
      const box = stage.parentElement || document.documentElement;
      const k = Math.min(box.clientWidth / w, box.clientHeight / h);
      stage.style.setProperty('--k', String(k));
    };
    fit();
    addEventListener('resize', fit);
    // the audit applies the safe-area insets after load: the parent's content box changes with them
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(stage.parentElement);
  }
}
