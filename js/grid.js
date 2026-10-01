/* ═══════════════════════════════════════════════════════════
   FigForge · 电子表格组件  (js/grid.js)
   仿 Excel 的数据表编辑：A/B/C 列标、行号、格线、单元格选区、
   方向键 / Tab / Enter 导航、区域拖选、Ctrl+C/V、角色标记。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const CG = global.CG || (global.CG = {});
  const G = {};

  /** 列序号 → Excel 列标：0→A, 25→Z, 26→AA */
  function colLetter(n) {
    let s = '';
    n = n + 1;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  G.colLetter = colLetter;

  /**
   * 创建表格实例
   * @param {HTMLElement} host
   * @param {object} opt
   *   getDataset()      返回当前数据表
   *   onChange(change)  数据/列定义变化后的回调 {type, ...}
   *   onOpenRoleMenu(colIndex, anchorEl)
   *   onOpenColMenu(colIndex, anchorEl)
   */
  G.create = function (host, opt) {
    opt = opt || {};
    const state = {
      ds: null,
      sel: { r1: 0, c1: 0, r2: 0, c2: 0 },
      editing: null,       // {r,c,input}
      dragging: false,
      colWidths: {},       // {c: px}  存的是「100% 时的基准宽度」，缩放时再乘比例
      zoom: 1,             // 表格字体缩放（1 = 100%）
      readonly: false
    };

    const root = document.createElement('div');
    root.className = 'ss-wrap';
    root.tabIndex = 0;
    host.appendChild(root);

    /* 字号缩放：只改一个 CSS 变量，字号/行高/列宽在样式里统一按它算 */
    function applyZoomVar() { root.style.setProperty('--ss-k', String(state.zoom || 1)); }
    applyZoomVar();

    /* ───────── 工具 ───────── */
    function ds() { return state.ds; }
    function nRows() { return state.ds ? state.ds.rows.length : 0; }
    function nCols() { return state.ds ? state.ds.columns.length : 0; }
    /** 表格缩放比例；所有内联写死的像素宽都要乘它 */
    function ssK() { return state.zoom || 1; }
    /** 默认列宽（100% 时的像素），画布同比例缩放 */
    const DEF_COL_W = 92;
    const MIN_COL_W = 46;

    function norm(sel) {
      return {
        r1: Math.min(sel.r1, sel.r2), r2: Math.max(sel.r1, sel.r2),
        c1: Math.min(sel.c1, sel.c2), c2: Math.max(sel.c1, sel.c2)
      };
    }
    function inSel(r, c) {
      const s = norm(state.sel);
      return r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2;
    }
    G.clampCell = function (r, c) {
      return {
        r: Math.max(0, Math.min(nRows() - 1, r)),
        c: Math.max(0, Math.min(nCols() - 1, c))
      };
    };

    /* ───────── 渲染 ───────── */
    function render() {
      const d = state.ds;
      if (!d) { root.innerHTML = ''; return; }
      const nR = nRows(), nC = nCols();
      const s = norm(state.sel);
      const parts = [];
      // 每一列都必须写出明确宽度：table-layout:fixed 只认 <col> / 首行单元格的宽度，
      // 少写一列浏览器就会自己按内容猜，结果行号列被挤成十几像素、各列宽窄不一。
      parts.push('<table class="ss"><colgroup><col class="ss-colnum">');
      for (let c = 0; c < nC; c++) {
        const base = state.colWidths[c] === undefined ? DEF_COL_W : state.colWidths[c];
        parts.push('<col style="width:' + Math.max(1, Math.round(base * ssK())) + 'px">');
      }
      parts.push('</colgroup><thead><tr>');
      parts.push('<th class="ss-corner" data-corner="1" title="全选"><span></span></th>');
      for (let c = 0; c < nC; c++) {
        const col = d.columns[c];
        const selCol = c >= s.c1 && c <= s.c2;
        parts.push(
          '<th class="ss-ch' + (selCol ? ' sel' : '') + '" data-c="' + c + '">' +
          '<span class="ss-letter">' + colLetter(c) + '</span>' +
          '<span class="ss-name" title="双击重命名">' + esc(col.name) + '</span>' +
          '<span class="ss-role role-' + col.role + '" title="' + roleTitle(col.role) + '">' + col.role + '</span>' +
          '<i class="ss-grip"></i>' +
          '</th>');
      }
      parts.push('</tr></thead><tbody>');
      for (let r = 0; r < nR; r++) {
        const selRow = r >= s.r1 && r <= s.r2;
        parts.push('<tr' + (selRow ? ' class="sel"' : '') + '>');
        parts.push('<th class="ss-rh' + (selRow ? ' sel' : '') + '" data-r="' + r + '">' + (r + 1) + '</th>');
        const row = d.rows[r];
        for (let c = 0; c < nC; c++) {
          const v = row[c] === undefined || row[c] === null ? '' : row[c];
          const cls = ['ss-cell'];
          if (inSel(r, c)) cls.push('sel');
          if (r === state.sel.r1 && c === state.sel.c1) cls.push('act');
          if (v === '') cls.push('empty');
          parts.push('<td class="' + cls.join(' ') + '" data-r="' + r + '" data-c="' + c + '">' + esc(v) + '</td>');
        }
        parts.push('</tr>');
      }
      parts.push('</tbody></table>');
      root.innerHTML = parts.join('');
      const t = root.querySelector('table');
      if (state.colWidths && Object.keys(state.colWidths).length) applyColWidths();
      // 滚动到活动单元格
      const act = root.querySelector('td.act');
      if (act && state.needScroll) {
        act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        state.needScroll = false;
      }
      if (opt.onSelectionChange) opt.onSelectionChange(getSelection(), d);
    }

    function applyColWidths() {
      const cols = root.querySelectorAll('colgroup col');
      for (let c = 0; c < nCols(); c++) {
        const el = cols[c + 1];
        if (!el) continue;
        const base = state.colWidths[c] === undefined ? DEF_COL_W : state.colWidths[c];
        el.style.width = Math.max(1, Math.round(base * ssK())) + 'px';
      }
    }

    function esc(v) {
      return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function roleTitle(role) {
      const D = CG.data;
      return D ? D.ROLE_NAME(role) : role;
    }
    function cellEl(r, c) { return root.querySelector('td[data-r="' + r + '"][data-c="' + c + '"]'); }

    /* ───────── 选中与移动 ───────── */
    function setSel(r1, c1, r2, c2, opts) {
      const a = G.clampCell(r1, c1);
      const b = G.clampCell(r2 === undefined ? r1 : r2, c2 === undefined ? c1 : c2);
      state.sel = { r1: a.r, c1: a.c, r2: b.r, c2: b.c };
      state.needScroll = !opts || opts.scroll !== false;
      render();
      root.focus({ preventScroll: true });
    }
    function move(dr, dc, extend) {
      let r = state.sel.r1 + dr, c = state.sel.c1 + dc;
      if (dc) c = Math.max(0, Math.min(nCols() - 1, c));
      if (dr) r = Math.max(0, Math.min(nRows() - 1, r));
      if (extend) setSel(state.sel.r1, state.sel.c1, r, c);
      else setSel(r, c);
    }
    function getSelection() {
      const s = norm(state.sel);
      return {
        r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2,
        rows: s.r2 - s.r1 + 1, cols: s.c2 - s.c1 + 1,
        active: { r: state.sel.r1, c: state.sel.c1 }
      };
    }

    /* ───────── 编辑 ───────── */
    function commitEdit(moveDir) {
      const e = state.editing;
      if (!e) return;
      const val = e.input.value;
      state.editing = null;
      const d = state.ds;
      const old = d.rows[e.r][e.c];
      if (String(old === undefined ? '' : old) !== val) {
        d.rows[e.r][e.c] = val;
        notify({ type: 'cell', r: e.r, c: e.c, value: val, old: old });
      }
      render();
      if (moveDir) move(moveDir[0], moveDir[1]);
      else root.focus({ preventScroll: true });
    }
    function startEdit(r, c, initial) {
      if (state.readonly) return;
      const td = cellEl(r, c);
      if (!td) return;
      commitEdit();
      const d = state.ds;
      const cur = d.rows[r][c] === undefined ? '' : String(d.rows[r][c]);
      td.classList.remove('empty');
      td.textContent = '';
      const input = document.createElement('input');
      input.className = 'ss-input';
      input.value = initial !== undefined ? initial : cur;
      td.appendChild(input);
      input.focus();
      if (initial === undefined) input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
      state.editing = { r, c, input };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commitEdit([ev.shiftKey ? -1 : 1, 0]); }
        else if (ev.key === 'Tab') { ev.preventDefault(); commitEdit([0, ev.shiftKey ? -1 : 1]); }
        else if (ev.key === 'Escape') { ev.preventDefault(); state.editing = null; render(); root.focus(); }
        else ev.stopPropagation();
      });
      input.addEventListener('blur', () => { if (state.editing) commitEdit(); });
    }

    /* ───────── 通知外部 ───────── */
    function notify(change) {
      if (opt.onChange) opt.onChange(change);
    }

    /* ───────── 选区数据 ───────── */
    function selectionText(asTSV) {
      const s = norm(state.sel);
      const d = state.ds;
      const lines = [];
      for (let r = s.r1; r <= s.r2; r++) {
        const cells = [];
        for (let c = s.c1; c <= s.c2; c++) {
          const v = d.rows[r][c];
          cells.push(v === undefined || v === null ? '' : String(v));
        }
        lines.push(cells.join('\t'));
      }
      return lines.join('\n');
    }

    function pasteText(text) {
      const d = state.ds;
      const parsed = CG.data.parseTable(text, CG.data.detectSep(text));
      let rows = parsed.rows;
      if (!rows.length) return;
      // 若只有一行一列，按原样写入活动单元格
      const start = G.clampCell(state.sel.r1, state.sel.c1);
      const needR = start.r + rows.length;
      const needC = start.c + rows[0].length;
      while (d.rows.length < needR) {
        d.rows.push(new Array(d.columns.length).fill(''));
      }
      while (d.columns.length < needC) {
        d.columns.push({
          id: CG.data.uid('col'),
          name: '列 ' + colLetter(d.columns.length),
          role: d.kind === 'xy' && d.columns.length === 0 ? 'X' : 'Y'
        });
        d.rows.forEach(r => r.push(''));
      }
      rows.forEach((row, i) => {
        row.forEach((v, j) => { d.rows[start.r + i][start.c + j] = v; });
      });
      notify({ type: 'paste', rows: rows.length, cols: rows[0].length, at: start });
      setSel(start.r, start.c, start.r + rows.length - 1, start.c + rows[0].length - 1);
    }

    /* ───────── 事件 ───────── */
    root.addEventListener('mousedown', (e) => {
      const td = e.target.closest('td.ss-cell');
      const ch = e.target.closest('th.ss-ch');
      const rh = e.target.closest('th.ss-rh');
      const corner = e.target.closest('th.ss-corner');
      const grip = e.target.closest('.ss-grip');

      if (grip && ch) { startColResize(e, Number(ch.dataset.c)); return; }
      if (e.target.closest('input.ss-input')) return;

      if (corner) { e.preventDefault(); setSel(0, 0, nRows() - 1, nCols() - 1); return; }
      if (ch) {
        const c = Number(ch.dataset.c);
        if (e.detail === 2) { renameCol(c, ch); return; }
        e.preventDefault();
        if (e.shiftKey) setSel(state.sel.r1, state.sel.c1, nRows() - 1, c);
        else setSel(0, c, nRows() - 1, c);
        return;
      }
      if (rh) {
        const r = Number(rh.dataset.r);
        e.preventDefault();
        if (e.shiftKey) setSel(state.sel.r1, state.sel.c1, r, nCols() - 1);
        else setSel(r, 0, r, nCols() - 1);
        return;
      }
      if (td) {
        e.preventDefault();
        const r = Number(td.dataset.r), c = Number(td.dataset.c);
        commitEdit();
        if (state.editing === null && e.detail === 2) { startEdit(r, c); return; }
        if (e.shiftKey) setSel(state.sel.r1, state.sel.c1, r, c);
        else { state.dragging = true; setSel(r, c); }
      }
    });

    root.addEventListener('mouseover', (e) => {
      if (!state.dragging) return;
      const td = e.target.closest('td.ss-cell');
      if (!td) return;
      const r = Number(td.dataset.r), c = Number(td.dataset.c);
      if (r === state.sel.r2 && c === state.sel.c2) return;
      setSel(state.sel.r1, state.sel.c1, r, c, { scroll: false });
    });
    document.addEventListener('mouseup', () => { state.dragging = false; });

    // 列宽拖拽
    function startColResize(e, c) {
      e.preventDefault(); e.stopPropagation();
      const th = root.querySelector('th.ss-ch[data-c="' + c + '"]');
      const startX = e.clientX;
      // colWidths 存的是基准宽（100% 时的值），当前像素宽要乘缩放比例
      const startW = state.colWidths[c] !== undefined ? state.colWidths[c] * ssK() : th.offsetWidth;
      root.classList.add('resizing');
      const mm = (ev) => {
        const w = Math.max(MIN_COL_W, startW + ev.clientX - startX);
        state.colWidths[c] = w / ssK();
        const cols = root.querySelectorAll('colgroup col');
        if (cols[c + 1]) cols[c + 1].style.width = Math.round(w) + 'px';
      };
      const mu = () => {
        root.classList.remove('resizing');
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu);
      };
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    }

    root.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td.ss-cell');
      if (td && !state.editing) startEdit(Number(td.dataset.r), Number(td.dataset.c));
    });

    root.addEventListener('keydown', (e) => {
      if (state.editing) return;
      const big = e.ctrlKey || e.metaKey;
      const s = norm(state.sel);
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); move(e.shiftKey ? -1 : -1, 0, e.shiftKey); if (!e.shiftKey) {} break;
        case 'ArrowDown': e.preventDefault(); move(1, 0, e.shiftKey); break;
        case 'ArrowLeft': e.preventDefault(); move(0, -1, e.shiftKey); break;
        case 'ArrowRight': e.preventDefault(); move(0, 1, e.shiftKey); break;
        case 'Tab': e.preventDefault(); move(0, e.shiftKey ? -1 : 1); break;
        case 'Enter':
          e.preventDefault();
          if (state.editing) break;
          startEdit(state.sel.r1, state.sel.c1);
          break;
        case 'F2': e.preventDefault(); startEdit(state.sel.r1, state.sel.c1); break;
        case 'Delete': case 'Backspace': {
          e.preventDefault();
          clearCells();
          break;
        }
        case 'Home':
          e.preventDefault();
          if (big) setSel(0, 0); else setSel(state.sel.r1, 0);
          break;
        case 'End':
          e.preventDefault();
          if (big) setSel(nRows() - 1, nCols() - 1); else setSel(state.sel.r1, nCols() - 1);
          break;
        case 'PageUp': e.preventDefault(); move(-15, 0, e.shiftKey); break;
        case 'PageDown': e.preventDefault(); move(15, 0, e.shiftKey); break;
        case 'c': case 'C':
          if (big) { e.preventDefault(); copy(); }
          break;
        case 'x': case 'X':
          if (big) {
            e.preventDefault(); copy();
            clearCells();
          }
          break;
        case 'v': case 'V':
          if (big) { e.preventDefault(); readClipboardAndPaste(); }
          break;
        case 'a': case 'A':
          if (big) { e.preventDefault(); setSel(0, 0, nRows() - 1, nCols() - 1); }
          break;
        default: {
          // 直接键入 → 进入编辑
          if (e.key.length === 1 && !big && !e.altKey) {
            e.preventDefault();
            startEdit(state.sel.r1, state.sel.c1, e.key);
          }
        }
      }
    });

    function copy() {
      const text = selectionText(true);
      const done = () => {
        if (opt.onCopy) opt.onCopy(text, getSelection());
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      } else fallbackCopy(text, done);
    }
    function fallbackCopy(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) { }
      document.body.removeChild(ta);
      if (cb) cb();
    }
    function readClipboardAndPaste() {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(t => { if (t) pasteText(t); }, () => {
          if (opt.onRequestPaste) opt.onRequestPaste();
        });
      } else if (opt.onRequestPaste) opt.onRequestPaste();
    }

    root.addEventListener('paste', (e) => {
      if (state.editing) return;
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t) return;
      e.preventDefault();
      pasteText(t);
    });
    root.addEventListener('copy', (e) => {
      if (state.editing) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', selectionText(true));
    });
    root.addEventListener('cut', (e) => {
      if (state.editing) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', selectionText(true));
      clearCells();
    });

    /* ───────── 右键菜单 ───────── */
    /**
     * 右键先按 Excel 的习惯把选区落到点上：
     * 点在已有选区之外 → 重选区；点在选区内 → 保留原来的多格/多列选区，
     * 这样「对一批行一起操作」不会因为右键而丢失。
     */
    function focusCell(td) {
      const r = Number(td.dataset.r), c = Number(td.dataset.c);
      const s = norm(state.sel);
      const multi = s.r2 > s.r1 || s.c2 > s.c1;
      if (!(multi && r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2)) setSel(r, c, undefined, undefined, { scroll: false });
    }
    function focusCol(c) {
      const s = norm(state.sel);
      const multiCol = s.c2 > s.c1 && s.r1 === 0 && s.r2 === nRows() - 1;
      if (!(multiCol && c >= s.c1 && c <= s.c2)) setSel(0, c, nRows() - 1, c, { scroll: false });
    }
    function focusRow(r) {
      const s = norm(state.sel);
      const multiRow = s.r2 > s.r1 && s.c1 === 0 && s.c2 === nCols() - 1;
      if (!(multiRow && r >= s.r1 && r <= s.r2)) setSel(r, 0, r, nCols() - 1, { scroll: false });
    }

    function menuCell() {
      const d = state.ds, s = norm(state.sel);
      const nR = s.r2 - s.r1 + 1, nC = s.c2 - s.c1 + 1;
      return {
        title: (nR === 1 && nC === 1) ? ('单元格 ' + colLetter(s.c1) + (s.r1 + 1)) : (nR + ' 行 × ' + nC + ' 列'),
        items: [
          { label: '剪切', desc: 'Ctrl+X', onClick: () => { copy(); clearCells(); } },
          { label: '复制', desc: 'Ctrl+C', onClick: () => copy() },
          { label: '粘贴', desc: 'Ctrl+V', onClick: () => paste() },
          { label: '清空内容', desc: 'Delete', onClick: clearCells },
          { sep: true },
          {
            label: '插入行', sub: [
              { label: '在上方插入 ' + nR + ' 行', onClick: () => insertRows(s.r1, nR) },
              { label: '在下方插入 ' + nR + ' 行', onClick: () => insertRows(s.r2 + 1, nR) }
            ]
          },
          {
            label: '插入列', sub: [
              { label: '在左侧插入 ' + nC + ' 列', onClick: () => insertCols(s.c1, nC) },
              { label: '在右侧插入 ' + nC + ' 列', onClick: () => insertCols(s.c2 + 1, nC) }
            ]
          },
          { label: '删除行', desc: nR + ' 行', onClick: delRows },
          { label: '删除列', desc: nC + ' 列', onClick: delCols },
          { sep: true },
          { label: '复制为 CSV', onClick: () => copyText(csvOf(s.r1, s.c1, s.r2, s.c2, false), '已复制 ' + nR + '×' + nC + ' 为 CSV') },
          { label: '复制为 TSV', onClick: () => copyText(selectionText(true), '已复制 ' + nR + '×' + nC + ' 为 TSV') },
          { sep: true },
          { label: '全选', desc: 'Ctrl+A', onClick: selectAll },
          { label: '列角色设置…', onClick: () => { if (opt.onGoStyle) opt.onGoStyle(); } }
        ]
      };
    }

    function menuCol(ch) {
      const d = state.ds, c = Number(ch.dataset.c);
      const s = norm(state.sel);
      const nC = s.c2 - s.c1 + 1;
      const col = d.columns[c];
      const cur = d.columns[s.c1] || col;
      return {
        title: '列 ' + colLetter(c) + ' · ' + col.name,
        items: [
          { label: '重命名列', desc: '双击列头', onClick: () => renameCol(c, root.querySelector('th.ss-ch[data-c="' + c + '"]')) },
          {
            label: '列角色', sub: (CG.data ? CG.data.ROLES : []).map(r => ({
              label: r.id + ' · ' + r.name,
              desc: r.id === cur.role ? '当前' : '',
              on: r.id === cur.role,
              onClick: () => setRole(s.c1, r.id)
            }))
          },
          { sep: true },
          { label: '升序排序', onClick: () => sortBy(c, 'asc') },
          { label: '降序排序', onClick: () => sortBy(c, 'desc') },
          { sep: true },
          { label: '在左侧插入列', onClick: () => insertCols(s.c1, 1) },
          { label: '在右侧插入列', onClick: () => insertCols(s.c2 + 1, 1) },
          { label: '删除' + (nC > 1 ? '选中的 ' + nC + ' 列' : '此列'), onClick: delCols },
          { sep: true },
          { label: '复制整列', onClick: () => copyText(csvOf(0, c, nRows() - 1, c, false), '已复制列 ' + colLetter(c)) },
          { label: '复制列名', onClick: () => copyText(col.name, '已复制列名') }
        ]
      };
    }

    function menuRow(rh) {
      const r = Number(rh.dataset.r), s = norm(state.sel);
      const nR = s.r2 - s.r1 + 1;
      return {
        title: nR === 1 ? ('第 ' + (s.r1 + 1) + ' 行') : (nR + ' 行'),
        items: [
          { label: '在上方插入 ' + nR + ' 行', onClick: () => insertRows(s.r1, nR) },
          { label: '在下方插入 ' + nR + ' 行', onClick: () => insertRows(s.r2 + 1, nR) },
          { sep: true },
          { label: '删除选中行', desc: nR + ' 行', onClick: delRows },
          { label: '清空选中行', onClick: clearCells },
          { sep: true },
          { label: '复制选中行', onClick: () => copyText(csvOf(s.r1, 0, s.r2, nCols() - 1, false), '已复制 ' + nR + ' 行') },
          { label: '全选', desc: 'Ctrl+A', onClick: selectAll }
        ]
      };
    }

    function menuAll() {
      return {
        title: '整张数据表',
        items: [
          { label: '全选', desc: 'Ctrl+A', onClick: selectAll },
          { sep: true },
          { label: '复制全表为 CSV', desc: '含列名', onClick: () => copyText(csvOf(0, 0, nRows() - 1, nCols() - 1, true), '已复制全表 CSV（含列名）') },
          { label: '复制全表为 TSV', onClick: () => copyText(selectionText(true), '已复制全表 TSV') },
          { sep: true },
          { label: '新增一行', onClick: () => insertRows(nRows(), 1) },
          { label: '新增一列', onClick: () => insertCols(nCols(), 1) }
        ]
      };
    }

    root.addEventListener('contextmenu', (e) => {
      // 正在编辑单元格时保留系统菜单，方便在输入框里复制/粘贴文字
      if (e.target.closest('input')) return;
      const td = e.target.closest('td.ss-cell');
      const ch = e.target.closest('th.ss-ch');
      const rh = e.target.closest('th.ss-rh');
      const corner = e.target.closest('th.ss-corner');
      if (!td && !ch && !rh && !corner) return;
      e.preventDefault();
      if (state.editing) commitEdit();
      let spec;
      if (td) { focusCell(td); spec = menuCell(); }
      else if (ch) { focusCol(Number(ch.dataset.c)); spec = menuCol(ch); }
      else if (rh) { focusRow(Number(rh.dataset.r)); spec = menuRow(rh); }
      else { selectAll(); spec = menuAll(); }
      const ui = CG.ui;
      if (!ui) return;
      ui.popmenu(null, [{ title: spec.title }].concat(spec.items), { at: { x: e.clientX, y: e.clientY }, wide: true });
    });

    /* ───────── 列名重命名 ───────── */
    function renameCol(c, th) {
      const nameEl = th.querySelector('.ss-name');
      if (!nameEl) return;
      const old = state.ds.columns[c].name;
      const input = document.createElement('input');
      input.className = 'ss-name-input';
      input.value = old;
      nameEl.textContent = '';
      nameEl.appendChild(input);
      input.focus();
      input.select();
      const finish = (save) => {
        const v = input.value.trim();
        if (save && v && v !== old) {
          state.ds.columns[c].name = v;
          notify({ type: 'colname', c, name: v, old });
        }
        render();
      };
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') finish(true);
        else if (ev.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    }

    /* ───────── 行列操作 ───────── */
    /** 在第 at 行前插入 n 行空行 */
    function insertRows(at, n) {
      const d = state.ds;
      n = Math.max(1, n || 1);
      at = Math.max(0, Math.min(d.rows.length, at));
      const blank = [];
      for (let i = 0; i < n; i++) blank.push(new Array(d.columns.length).fill(''));
      d.rows.splice.apply(d.rows, [at, 0].concat(blank));
      notify({ type: 'addrow', at, n });
      setSel(at, 0);
    }
    /** 在第 at 列前插入 n 列空列 */
    function insertCols(at, n) {
      const d = state.ds;
      n = Math.max(1, n || 1);
      at = Math.max(0, Math.min(d.columns.length, at));
      for (let i = 0; i < n; i++) {
        const c = at + i;
        let role = 'Y';
        if (d.kind === 'xy' && c === 0) role = 'X';
        if (d.kind === 'grouped' && c === 0) role = 'G';
        if (d.kind === 'survival') role = ['X', 'V', 'G', 'I', 'I'][c] || 'I';
        d.columns.splice(c, 0, { id: CG.data.uid('col'), name: '列 ' + colLetter(c), role });
        d.rows.forEach(r => r.splice(c, 0, ''));
      }
      notify({ type: 'addcol', at, n });
      setSel(0, at);
    }
    function addRow(at) {
      insertRows(at === undefined ? nRows() : at, 1);
    }
    function delRows() {
      const d = state.ds;
      const s = norm(state.sel);
      const n = s.r2 - s.r1 + 1;
      if (d.rows.length - n < 1) { t('至少保留一行'); return; }
      d.rows.splice(s.r1, n);
      notify({ type: 'delrow', at: s.r1, n });
      setSel(Math.min(s.r1, d.rows.length - 1), s.c1);
    }
    function addCol(at) {
      insertCols(at === undefined ? nCols() : at, 1);
    }
    function delCols() {
      const d = state.ds;
      const s = norm(state.sel);
      const n = s.c2 - s.c1 + 1;
      if (d.columns.length - n < 1) { t('至少保留一列'); return; }
      d.columns.splice(s.c1, n);
      d.rows.forEach(r => r.splice(s.c1, n));
      notify({ type: 'delcol', at: s.c1, n });
      setSel(0, Math.min(s.c1, d.columns.length - 1));
    }
    function t(msg, kind) { if (opt.toast) opt.toast(msg, kind); }

    /** 清空选区内容（Delete 键 / 右键菜单共用） */
    function clearCells() {
      const s = norm(state.sel);
      let n = 0;
      for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) {
        if (state.ds.rows[r][c] !== '') { state.ds.rows[r][c] = ''; n++; }
      }
      if (n) notify({ type: 'clear', n });
      render();
    }
    function selectAll() { setSel(0, 0, nRows() - 1, nCols() - 1); }

    /** 按某列排序；整列都是数字就按数值排，否则按文本（中文按拼音） */
    function sortBy(c, dir) {
      const d = state.ds;
      const num = v => {
        const s = String(v === undefined || v === null ? '' : v).trim();
        if (s === '') return null;
        const x = Number(s);
        return isNaN(x) ? null : x;
      };
      const allNum = d.rows.length > 0 && d.rows.every(r => num(r[c]) !== null);
      const order = d.rows.map((_, i) => i);
      order.sort((a, b) => {
        const va = d.rows[a][c], vb = d.rows[b][c];
        const k = allNum
          ? num(va) - num(vb)
          : String(va === undefined ? '' : va).localeCompare(String(vb === undefined ? '' : vb), 'zh-Hans-CN', { numeric: true });
        return dir === 'desc' ? -k : k;
      });
      d.rows = order.map(i => d.rows[i]);
      notify({ type: 'sort', c, dir, by: allNum ? '数值' : '文本' });
      render();
      t('已按「' + d.columns[c].name + '」' + (dir === 'desc' ? '降序' : '升序') + '排序（' + (allNum ? '数值' : '文本') + '）', 'ok');
    }

    function setRole(c, role) {
      const d = state.ds;
      const col = d.columns[c];
      if (!col || col.role === role) return;
      const old = col.role;
      col.role = role;
      notify({ type: 'role', c, role, old });
      render();
      t('列 ' + colLetter(c) + ' 角色改为「' + (CG.data ? CG.data.ROLE_NAME(role) : role) + '」', 'ok');
    }

    /* ───────── 复制 ───────── */
    function q(v) {
      const s = String(v === undefined || v === null ? '' : v);
      return /[",\n\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function csvOf(r1, c1, r2, c2, withHeader) {
      const d = state.ds, out = [];
      if (withHeader) {
        const h = [];
        for (let c = c1; c <= c2; c++) h.push(q(d.columns[c].name));
        out.push(h.join(','));
      }
      for (let r = r1; r <= r2; r++) {
        const line = [];
        for (let c = c1; c <= c2; c++) line.push(q(d.rows[r][c]));
        out.push(line.join(','));
      }
      return out.join('\n');
    }
    /** 写剪贴板并给个回执 */
    function copyText(text, msg) {
      const done = () => { if (msg) t(msg, 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    }

    /* ───────── 对外 API ───────── */
    const api = {
      setDataset(ds2, keepSel) {
        state.ds = ds2;
        state.editing = null;
        if (!keepSel) state.sel = { r1: 0, c1: 0, r2: 0, c2: 0 };
        state.colWidths = {};
        render();
      },
      refresh: render,
      getSelection,
      setSelection(r1, c1, r2, c2) { setSel(r1, c1, r2, c2); },
      focus() { root.focus({ preventScroll: true }); },
      addRow, delRows, addCol, delCols,
      addRowBelow() { addRow(norm(state.sel).r2 + 1); },
      addColRight() { addCol(norm(state.sel).c2 + 1); },
      insertRows, insertCols, sortBy, selectAll,
      pasteText, copySelection: copy,
      paste() { readClipboardAndPaste(); },
      selectColumn(c) { setSel(0, c, nRows() - 1, c); },
      /* 表格字体缩放：pct 为百分比，60–220 */
      setZoom(pct) {
        const p = Math.max(60, Math.min(220, Math.round(pct)));
        if (p === Math.round((state.zoom || 1) * 100)) return p;
        state.zoom = p / 100;
        applyZoomVar();
        render();
        return p;
      },
      getZoom() { return Math.round((state.zoom || 1) * 100); },
      element: root,
      get colWidths() { return state.colWidths; }
    };
    return api;
  };

  CG.Grid = G;
})(typeof window !== 'undefined' ? window : globalThis);
