// (i18n-ignore-file: developer-facing admin documentation viewer)
// Admin documentation viewer. The page shell is server/adminDocs.js; this file only consumes the
// token-gated /admin/api/docs APIs and renders Markdown with a small dependency-free parser.
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var token = params.get('token') || '';
  var files = [];
  var current = null;
  var markdown = '';
  var raw = false;
  var requestSeq = 0;

  var tree = document.getElementById('docTree');
  var body = document.getElementById('docBody');
  var title = document.getElementById('docTitle');
  var pathLabel = document.getElementById('docPath');
  var search = document.getElementById('docSearch');
  var rawButton = document.getElementById('docRaw');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function api(url) {
    var target = new URL(url, location.origin);
    if (token) target.searchParams.set('token', token);
    return fetch(target.toString(), { cache: 'no-store', headers: token ? { 'x-admin-token': token } : {} })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
          return json;
        });
      });
  }

  function groupLabel(group) {
    if (group === 'root') return '根目录';
    if (group === 'plugins') return '插件作者';
    if (group === 'docs') return '文档';
    return group.replace(/^docs\//, '').replace(/\//g, ' / ');
  }

  function renderTree() {
    var q = (search.value || '').trim().toLowerCase();
    var visible = files.filter(function (f) {
      return !q || (f.title + ' ' + f.path).toLowerCase().indexOf(q) >= 0;
    });
    if (!visible.length) {
      tree.innerHTML = '<p class="doc__empty">没有匹配的文档</p>';
      return;
    }
    var html = '';
    var last = null;
    visible.forEach(function (f) {
      if (f.group !== last) {
        if (last !== null) html += '</div>';
        html += '<div class="tree__group">' + esc(groupLabel(f.group)) + '</div>';
        last = f.group;
      }
      html += '<button type="button" class="tree__item' + (current === f.path ? ' is-on' : '') +
        '" data-doc="' + esc(f.path) + '" title="' + esc(f.path) + '">' + esc(f.title) + '</button>';
    });
    tree.innerHTML = html;
  }

  function resolvePath(base, href) {
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.charAt(0) === '#') return href;
    if (href.charAt(0) === '/') return href.slice(1);
    var clean = href.split('#')[0].split('?')[0];
    var dir = base.split('/').slice(0, -1).join('/');
    var parts = ((dir ? dir + '/' : '') + clean).split('/');
    var out = [];
    parts.forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') out.pop();
      else out.push(part);
    });
    return out.join('/');
  }

  function inline(src, base) {
    var text = esc(src);
    var codes = [];
    text = text.replace(/`([^`]+)`/g, function (_, code) {
      codes.push(code);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, href) {
      var src = href;
      if (!/^(?:https?:|data:)/i.test(src)) {
        src = '/admin/api/docs/asset?path=' + encodeURIComponent(resolvePath(base, src)) +
          (token ? '&token=' + encodeURIComponent(token) : '');
      }
      return '<img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy">';
    });
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
      href = href.trim();
      if (/\.md(?:[?#].*)?$/i.test(href)) {
        return '<a href="#" data-doc="' + esc(resolvePath(base, href)) + '">' + label + '</a>';
      }
      if (/^(?:https?:|mailto:)/i.test(href)) {
        return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + label + '</a>';
      }
      if (/^\s*javascript:/i.test(href)) return label;
      return '<a href="' + esc(href) + '">' + label + '</a>';
    });
    text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    text = text.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
    return text;
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }

  function mdToHtml(src, base) {
    var lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var i = 0;
    var lists = [];
    function closeLists(n) { while (lists.length > (n || 0)) out.push('</' + lists.pop() + '>'); }

    while (i < lines.length) {
      var line = lines[i];
      var fence = /^\s*```(\w*)\s*$/.exec(line);
      if (fence) {
        closeLists();
        var code = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }

      if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
        closeLists();
        var cells = function (row) {
          return row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
        };
        var head = cells(line);
        i += 2;
        var rows = [];
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) rows.push(cells(lines[i++]));
        out.push('<div class="tblwrap"><table><thead><tr>' + head.map(function (h) { return '<th>' + inline(h, base) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + rows.map(function (r) {
            return '<tr>' + head.map(function (_, k) { return '<td>' + inline(r[k] || '', base) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
        continue;
      }

      var heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        closeLists();
        var level = heading[1].length;
        var rawTitle = heading[2].replace(/\s*#+\s*$/, '');
        out.push('<h' + level + ' id="' + slug(rawTitle) + '">' + inline(rawTitle, base) + '</h' + level + '>');
        i++;
        continue;
      }

      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closeLists(); out.push('<hr>'); i++; continue; }

      if (/^\s*>\s?/.test(line)) {
        closeLists();
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + mdToHtml(quote.join('\n'), base) + '</blockquote>');
        continue;
      }

      var ul = /^(\s*)([-*+])\s+(.*)$/.exec(line);
      var ol = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
      if (ul || ol) {
        var depth = Math.floor((ul ? ul[1] : ol[1]).length / 2);
        var tag = ul ? 'ul' : 'ol';
        while (lists.length > depth + 1) out.push('</' + lists.pop() + '>');
        if (lists.length < depth + 1) { out.push('<' + tag + '>'); lists.push(tag); }
        else if (lists[lists.length - 1] !== tag) { out.push('</' + lists.pop() + '>'); out.push('<' + tag + '>'); lists.push(tag); }
        out.push('<li>' + inline(ul ? ul[3] : ol[3], base) + '</li>');
        i++;
        continue;
      }
      closeLists();

      if (!line.trim()) { i++; continue; }

      var para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]) &&
        !/^\s*(-{3,}|\*{3,})\s*$/.test(lines[i])) para.push(lines[i++]);
      out.push('<p>' + inline(para.join('\n'), base).replace(/\n/g, '<br>') + '</p>');
    }
    closeLists();
    return out.join('\n');
  }

  function paint() {
    if (!current) return;
    title.textContent = (files.find(function (f) { return f.path === current; }) || {}).title || '文档链';
    pathLabel.textContent = current;
    rawButton.textContent = raw ? '阅读' : '源码';
    rawButton.setAttribute('aria-pressed', raw ? 'true' : 'false');
    if (raw) {
      body.innerHTML = '<pre class="doc__raw"></pre>';
      body.firstChild.textContent = markdown;
    } else {
      body.innerHTML = mdToHtml(markdown, current);
    }
    renderTree();
  }

  function openDoc(path, updateHash) {
    if (!path) return;
    var seq = ++requestSeq;
    current = path;
    body.innerHTML = '<p class="doc__empty">正在读取 ' + esc(path) + '…</p>';
    api('/admin/api/docs/file?path=' + encodeURIComponent(path)).then(function (doc) {
      if (seq !== requestSeq) return;
      markdown = doc.markdown || '';
      if (updateHash !== false) history.replaceState(null, '', '#' + encodeURIComponent(path));
      raw = false;
      paint();
    }).catch(function (err) {
      if (seq !== requestSeq) return;
      body.innerHTML = '<p class="doc__error">' + esc(err.message) + '</p>';
    });
  }

  function loadIndex() {
    api('/admin/api/docs').then(function (index) {
      files = Array.isArray(index.files) ? index.files : [];
      var hash = location.hash.slice(1);
      try { hash = decodeURIComponent(hash); } catch { /* keep */ }
      var start = hash && files.some(function (f) { return f.path === hash; }) ? hash : 'docs/README.md';
      if (!files.some(function (f) { return f.path === start; })) start = files[0] && files[0].path;
      if (start) openDoc(start, false);
      else tree.innerHTML = '<p class="doc__empty">没有可查看的文档</p>';
    }).catch(function (err) {
      tree.innerHTML = '<p class="doc__error">' + esc(err.message) + '</p>';
    });
  }

  tree.addEventListener('click', function (e) {
    var button = e.target && e.target.closest ? e.target.closest('[data-doc]') : null;
    if (button) openDoc(button.getAttribute('data-doc'));
  });
  body.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('[data-doc]') : null;
    if (link) { e.preventDefault(); openDoc(link.getAttribute('data-doc')); }
  });
  search.addEventListener('input', renderTree);
  rawButton.addEventListener('click', function () { raw = !raw; paint(); });
  window.addEventListener('hashchange', function () {
    var hash = location.hash.slice(1);
    try { hash = decodeURIComponent(hash); } catch { /* keep */ }
    if (hash && hash !== current) openDoc(hash, false);
  });

  loadIndex();
})();
