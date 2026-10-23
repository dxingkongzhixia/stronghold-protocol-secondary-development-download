// server/adminDocs.js — the self-contained shell of the admin documentation viewer.
// The page itself contains no documentation or script logic: /js/adminDocs.js fetches the
// token-gated /admin/api/docs index and renders the selected Markdown locally.

export const DOCS_HTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>文档 · Stronghold Protocol 管理</title>
<style>
:root{color-scheme:dark;--bg:#070b0a;--side:#0a100e;--panel:#0d1412;--panel2:#0a100e;--line:#1b2823;--line2:#263630;
  --text:#d8e3de;--dim:#87978f;--dim2:#60726a;--mint:#4ed8af;--gold:#ffd089;--red:#ff8a78;
  --font:"Noto Sans SC",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font:14px/1.65 var(--font)}
a{color:var(--mint);text-decoration:none}a:hover{text-decoration:underline}
.top{height:54px;display:flex;align-items:center;gap:14px;padding:0 18px;background:var(--side);border-bottom:1px solid var(--line)}
.top b{font-size:15px;letter-spacing:.02em}.top .sp{flex:1}.top a{color:var(--dim);font-size:12.5px}
.top a:hover{color:var(--mint)}
.layout{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:calc(100vh - 54px)}
.side{border-right:1px solid var(--line);background:var(--side);padding:14px 10px;min-width:0}
.side__search{width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:7px 10px;font:inherit;font-size:12.5px;outline:none}
.side__search:focus{border-color:var(--mint)}
.tree{padding:10px 0 30px;overflow:auto;max-height:calc(100vh - 130px)}
.tree__group{padding:12px 9px 4px;color:var(--dim2);font-size:10px;letter-spacing:.15em;text-transform:uppercase}
.tree__item{display:block;width:100%;border:1px solid transparent;border-radius:7px;background:none;color:var(--dim);text-align:left;padding:5px 9px;font:inherit;font-size:12.5px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tree__item:hover{background:rgba(78,216,175,.06);color:var(--text)}.tree__item.is-on{background:rgba(78,216,175,.11);border-color:rgba(78,216,175,.28);color:var(--mint)}
.main{min-width:0;display:flex;flex-direction:column}.bar{display:flex;align-items:flex-start;gap:12px;padding:20px 28px 14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--panel),rgba(10,16,14,.45))}
.bar h1{margin:0;font-size:21px;line-height:1.2;font-weight:650}.bar small{display:block;margin-top:5px;color:var(--dim2);font-family:var(--mono);font-size:11.5px;word-break:break-all}
.bar .tools{margin-left:auto;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.btn{background:#111917;color:var(--text);border:1px solid var(--line2);border-radius:7px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px}
.btn:hover{border-color:var(--mint);color:var(--mint)}
.doc{width:min(100%,1040px);padding:26px 30px 80px;margin:0 auto;min-width:0}
.doc h1,.doc h2,.doc h3,.doc h4{line-height:1.3;color:#eef5f1;margin:1.45em 0 .55em}.doc h1{font-size:30px;margin-top:0}.doc h2{font-size:23px;border-bottom:1px solid var(--line);padding-bottom:6px}.doc h3{font-size:18px}.doc h4{font-size:15px}
.doc p,.doc li{color:#c6d3cd}.doc p{margin:.7em 0}.doc ul,.doc ol{padding-left:1.5em}.doc li{margin:.2em 0}
.doc code{font-family:var(--mono);font-size:.92em;background:#101b17;border:1px solid #1d3029;border-radius:4px;padding:.1em .3em;color:#b9f3df}
.doc pre{overflow:auto;background:#08110e;border:1px solid var(--line2);border-radius:8px;padding:13px 15px;margin:1em 0}.doc pre code{background:none;border:0;padding:0;color:#c7e4d8}
.doc blockquote{margin:1em 0;padding:8px 15px;border-left:3px solid var(--mint);background:rgba(78,216,175,.05);color:var(--dim)}
.doc hr{border:0;border-top:1px solid var(--line);margin:1.5em 0}.doc a{text-decoration:underline;text-underline-offset:2px}
.doc img{max-width:100%;height:auto;border-radius:6px;margin:8px 0}.doc .tblwrap{overflow:auto;margin:1em 0}.doc table{border-collapse:collapse;width:100%;font-size:12.5px}.doc th,.doc td{border:1px solid var(--line2);padding:6px 9px;text-align:left;vertical-align:top}.doc th{background:#101b17;color:var(--mint)}
.doc__meta{color:var(--dim2);font-size:11.5px;margin-left:8px}.doc__empty,.doc__error{color:var(--dim);padding:40px 0}.doc__error{color:var(--red)}
.doc__raw{white-space:pre-wrap;font:12px/1.6 var(--mono);color:#c7e4d8;background:#08110e;border:1px solid var(--line2);border-radius:8px;padding:15px;overflow:auto}
@media(max-width:760px){.layout{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--line)}.tree{max-height:220px}.bar{padding:16px 16px 12px}.doc{padding:20px 16px 60px}}
</style></head><body>
<div class="top"><b>文档链</b><span class="sp"></span><a href="/admin">返回管理台</a></div>
<div class="layout">
  <aside class="side"><input class="side__search" id="docSearch" placeholder="搜索文档标题 / 路径" autocomplete="off"/><nav class="tree" id="docTree"><p class="doc__empty">正在读取文档索引…</p></nav></aside>
  <main class="main">
    <header class="bar"><div><h1 id="docTitle">文档链</h1><small id="docPath">选择左侧文档</small></div>
      <div class="tools"><button class="btn" id="docRaw" type="button" aria-pressed="false">源码</button></div></header>
    <article class="doc" id="docBody"><p class="doc__empty">正在读取文档…</p></article>
  </main>
</div>
<script src="/js/adminDocs.js" defer></script>
</body></html>`;
