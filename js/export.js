/* ═══════════════════════════════════════════════════════════
   FigForge · 导出  (js/export.js)
   SVG（真矢量，text 保持可编辑）/ PNG（任意 DPI）/ PDF（打印矢量）
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const CG = global.CG || (global.CG = {});
  const E = {};
  const P = CG.presets;

  /* ───────── 通用 ───────── */
  function ts() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  E.timestamp = ts;

  function sanitize(name) {
    return String(name || 'figure').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 60);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }
  E.download = download;

  /** 克隆并净化 SVG：去除交互标记、补全命名空间与物理尺寸 */
  function prepareSVG(svg, style) {
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('[data-oi]').forEach(n => {
      n.removeAttribute('data-oi');
      n.removeAttribute('data-oikey');
      n.removeAttribute('data-oiidx');
    });
    clone.querySelectorAll('[data-annid]').forEach(n => n.removeAttribute('data-annid'));
    // 图标题带了「点我编辑」的标记，导出时清掉，别留在图里
    clone.querySelectorAll('[data-figtitle]').forEach(n => {
      n.removeAttribute('data-figtitle');
      n.removeAttribute('style');
    });
    clone.querySelectorAll('.oi-hl').forEach(n => n.classList.remove('oi-hl'));
    clone.querySelectorAll('g[class=""]').forEach(n => n.removeAttribute('class'));
    // 去掉纯定位用的空 class
    clone.querySelectorAll('[class]').forEach(n => {
      const c = (n.getAttribute('class') || '').trim();
      if (!c || /^oi-/.test(c)) n.removeAttribute('class');
    });

    const wmm = style.size.w, hmm = style.size.h;
    const wpx = P.mm2px(wmm), hpx = P.mm2px(hmm);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('version', '1.1');
    clone.setAttribute('width', wmm + 'mm');
    clone.setAttribute('height', hmm + 'mm');
    clone.setAttribute('viewBox', '0 0 ' + wpx + ' ' + hpx);
    clone.style.overflow = 'visible';
    // 背景必须显式画出来，否则矢量编辑器里透明
    const bg = clone.querySelector('rect[aria-label="background"], rect.plot-background');
    if (!bg && style.bg.show) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', 0); r.setAttribute('y', 0);
      r.setAttribute('width', wpx); r.setAttribute('height', hpx);
      r.setAttribute('fill', style.bg.color || '#fff');
      r.setAttribute('aria-label', 'background');
      clone.insertBefore(r, clone.firstChild);
    }
    return clone;
  }

  /* ───────── SVG ───────── */
  E.toSVGString = function (svg, style) {
    const clone = prepareSVG(svg, style);
    const s = new XMLSerializer().serializeToString(clone);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + s;
  };

  E.exportSVG = function (svg, style, name) {
    const str = E.toSVGString(svg, style);
    download(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }),
      sanitize(name || 'figure') + '.svg');
    return { ok: true, bytes: str.length };
  };

  /* ───────── PNG ───────── */
  /**
   * @param {SVGElement} svg
   * @param {object} style
   * @param {number} dpi 300 / 600 / 1200
   * @param {string} bg '#ffffff' 或 'transparent'
   */
  E.toPNGBlob = function (svg, style, dpi, bg) {
    return new Promise((resolve, reject) => {
      const wmm = style.size.w, hmm = style.size.h;
      const wpx = P.mm2px(wmm), hpx = P.mm2px(hmm);
      const scale = (dpi || 300) / 96;
      const str = E.toSVGString(svg, style);
      const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(wpx * scale));
        cv.height = Math.max(1, Math.round(hpx * scale));
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        if (bg && bg !== 'transparent') {
          g.fillStyle = bg;
          g.fillRect(0, 0, cv.width, cv.height);
        }
        g.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (b) resolve({ blob: b, w: cv.width, h: cv.height, dpi: dpi || 300 });
          else reject(new Error('画布导出失败'));
        }, 'image/png');
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('SVG 光栅化失败'));
      };
      img.src = url;
    });
  };

  E.exportPNG = function (svg, style, dpi, name, bg) {
    return E.toPNGBlob(svg, style, dpi, bg).then(r => {
      download(r.blob, sanitize(name || 'figure') + '_' + dpi + 'dpi.png');
      return { ok: true, w: r.w, h: r.h, bytes: r.blob.size };
    });
  };

  /** 复制 PNG 到剪贴板（方便直接粘进 Word / PPT） */
  E.copyPNG = function (svg, style, dpi, bg) {
    if (!navigator.clipboard || !global.ClipboardItem) {
      return Promise.reject(new Error('当前浏览器不支持图片剪贴板，请改用“导出 PNG”'));
    }
    return E.toPNGBlob(svg, style, dpi || 300, bg).then(r =>
      navigator.clipboard.write([new global.ClipboardItem({ 'image/png': r.blob })])
    ).then(() => ({ ok: true }));
  };

  /* ───────── PDF（按物理尺寸的打印式矢量输出） ───────── */
  E.exportPDF = function (svg, style, name) {
    const wmm = style.size.w, hmm = style.size.h;
    const str = E.toSVGString(svg, style);
    let root = document.getElementById('print-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      document.body.appendChild(root);
    }
    root.innerHTML = str;
    const svgIn = root.querySelector('svg');
    if (svgIn) {
      svgIn.setAttribute('width', wmm + 'mm');
      svgIn.setAttribute('height', hmm + 'mm');
    }
    const st = document.getElementById('print-page-style');
    if (st) st.remove();
    const s = document.createElement('style');
    s.id = 'print-page-style';
    s.textContent = '@page{size:' + wmm + 'mm ' + hmm + 'mm;margin:0}';
    document.head.appendChild(s);
    const title = document.title;
    document.title = sanitize(name || 'figure');
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = title; }, 800);
    }, 60);
    return { ok: true };
  };

  /* ───────── EPS / TIFF 的替代路径提示 ───────── */
  E.legacyHint = 'EPS / TIFF 属于印刷端格式，浏览器无法直接生成：\n' +
    '· 需要 EPS：导出 SVG 后用 Inkscape（免费）另存为 EPS，矢量且无损；\n' +
    '· 需要 TIFF：导出 600 dpi PNG 后，在 ImageJ / Photoshop 中转存 TIFF（LZW 压缩）。\n' +
    '两者都不会损失分辨率。';

  /* ───────── 数据导出 ───────── */
  E.exportCSV = function (ds, name) {
    download(new Blob(['\uFEFF' + CG.data.toCSV(ds)], { type: 'text/csv;charset=utf-8' }),
      sanitize(name || 'data') + '.csv');
    return { ok: true };
  };

  /** 导出统计结果表（CSV） */
  E.exportStatsCSV = function (rows, name) {
    const lines = rows.map(r => r.map(v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','));
    download(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      sanitize(name || 'statistics') + '.csv');
    return { ok: true };
  };

  CG.exporter = E;
})(typeof window !== 'undefined' ? window : globalThis);
