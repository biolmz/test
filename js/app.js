/* ═══════════════════════════════════════════════════════════
   FigForge · 主控制器  (js/app.js)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const CG = window.CG;
  const { chart, data, presets, exporter, ui, stats } = CG;
  const $ = (id) => document.getElementById(id);

  /* ════════════ 状态 ════════════ */
  const S = {
    datasets: [],
    activeId: null,
    type: 'bar',
    style: presets.defaultStyle('default'),
    sel: null,
    mode: 'edit',
    zoom: 1,
    history: [],
    histIdx: -1,
    renderInfo: null,
    autoFit: true,
    // 右侧面板各分组的折叠状态。必须初始化：面板里 onCollapse 会往里写，
    // 少了它点一次分组标题就抛 TypeError，折叠状态也存不下来。
    collapsed: {}
  };
  window.__fig = S;   // 便于调试

  const grid = CG.Grid.create($('grid-scroll'), {
    getDataset: () => ds(),
    onChange: (ch) => {
      pushHistory('data:' + ch.type);
      refreshGridStat();
      // 改列（增删/改名/换角色）会改变右侧面板里的列清单，得重建
      if (/^(addcol|delcol|colname|role)$/.test(ch.type)) renderPanel();
      scheduleRender();
    },
    onOpenRoleMenu: null,
    onSelectionChange: (sel, d) => updateGridStat(sel, d),
    onRequestPaste: () => openPastePanel(),
    onGoStyle: () => {
      activeTab = 'style';
      $('right-tabs').querySelectorAll('.ptab').forEach(x => x.classList.toggle('on', x.dataset.tab === 'style'));
      renderPanel();
      setStatus('已切到「样式」标签，可逐列设置角色');
    },
    toast: (m, kind) => ui.toast(m, kind || 'err')
  });

  /* ════════════ 工具 ════════════ */
  function ds() { return S.datasets.find(d => d.id === S.activeId) || null; }
  function getPath(o, p) {
    return p.split('.').reduce((a, k) => (a === null || a === undefined ? undefined : a[k]), o);
  }
  function setPath(o, p, v) {
    const ks = p.split('.'); const last = ks.pop();
    let t = o;
    for (const k of ks) { if (t[k] === null || t[k] === undefined) t[k] = {}; t = t[k]; }
    t[last] = v;
  }

  /** 当前数据表里的序列名（图例名），用于「右轴序列」这类下拉 */
  function seriesNamesOf(d) {
    if (!d) return [];
    const seen = [];
    data.flatten(d).forEach(r => {
      const s = r.s === null || r.s === undefined ? '—' : String(r.s);
      if (seen.indexOf(s) < 0) seen.push(s);
    });
    return seen;
  }

  /**
   * 把样式里的选择翻译成渲染引擎认识的 mapping。
   * 只在用户真的指定了右轴序列时才下发 y2，留空则交给 dual 构建器
   * 走「自动取最后一列」的默认逻辑。
   */
  function mappingOf() {
    const y2 = S.style.marks && S.style.marks.y2 ? S.style.marks.y2.series : '';
    return y2 ? { y2: y2 } : {};
  }

  /* ════════════ 撤销 / 重做 ════════════ */
  let snapshotLock = false;
  function snapshot() {
    return JSON.stringify({
      datasets: S.datasets, activeId: S.activeId,
      type: S.type, style: S.style
    });
  }
  function pushHistory(label) {
    if (snapshotLock) return;
    const s = snapshot();
    if (S.history[S.histIdx] === s) return;
    S.history = S.history.slice(0, S.histIdx + 1);
    S.history.push(s);
    if (S.history.length > 120) S.history.shift();
    S.histIdx = S.history.length - 1;
    updateHistoryButtons();
    setStatus(label || '已修改');
  }
  /**
   * 补齐 / 迁移样式对象。撤销栈里的旧快照、以及早先版本存下的字段，
   * 都可能缺键或用了已经废弃的取值，直接渲染会踩空。
   * 这里只做「缺什么补什么 + 旧值映射成新值」，不动用户设过的有效值。
   */
  function normalizeStyle(style) {
    if (!style) return style;
    if (!style.overrides) style.overrides = {};
    if (!style.annots) style.annots = [];
    const d = presets.defaultStyle(style.preset || 'default');
    if (!style.marks) style.marks = d.marks;
    else if (!style.marks.y2) style.marks.y2 = d.marks.y2;
    if (!style.stats) style.stats = d.stats;
    else {
      const s = style.stats;
      /* 旧版把「画法」和「内容」都塞在 annot 里：annot='brackets' 表示括号。
         现在 annot 只表示文字内容，画法归 annotStyle，所以把旧值搬过去。 */
      if (s.annot === 'brackets' || s.annot === 'bracket') {
        s.annot = 'stars';
        if (!s.annotStyle) s.annotStyle = 'bracket';
      }
      if (['stars', 'p', 'both'].indexOf(s.annot) < 0) s.annot = 'stars';
      if (['bracket', 'bar', 'star'].indexOf(s.annotStyle) < 0) s.annotStyle = 'bracket';
    }
    return style;
  }

  function restore(s) {
    snapshotLock = true;
    const o = JSON.parse(s);
    S.datasets = o.datasets;
    S.activeId = o.activeId;
    S.type = o.type;
    S.style = normalizeStyle(o.style);
    snapshotLock = false;
    S.sel = null;
    syncToolbar();
    grid.setDataset(ds(), true);
    refreshTabs();
    renderPanel();
    renderChart();
  }
  function undo() {
    if (S.histIdx <= 0) { ui.toast('没有可撤销的操作'); return; }
    S.histIdx--;
    restore(S.history[S.histIdx]);
    setStatus('已撤销');
    updateHistoryButtons();
  }
  function redo() {
    if (S.histIdx >= S.history.length - 1) { ui.toast('没有可重做的操作'); return; }
    S.histIdx++;
    restore(S.history[S.histIdx]);
    setStatus('已重做');
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $('btn-undo').disabled = S.histIdx <= 0;
    $('btn-redo').disabled = S.histIdx >= S.history.length - 1;
  }

  /* ════════════ 渲染 ════════════ */
  let rafId = null, rafTimer = null;
  /**
   * 合并同一帧内的多次重绘请求。
   * rAF 之外必须再挂一个 setTimeout 兜底：标签页在后台、被隐藏，
   * 或页面跑在不可见的 iframe / 无头浏览器里时，rAF 可能**永远不回调**，
   * 那样图表就会一直停在旧状态（点开关没反应，看着像功能坏了）。
   */
  function scheduleRender() {
    if (rafId) cancelAnimationFrame(rafId);
    if (rafTimer) clearTimeout(rafTimer);
    const run = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (rafTimer) { clearTimeout(rafTimer); rafTimer = null; }
      renderChart();
    };
    rafId = requestAnimationFrame(run);
    rafTimer = setTimeout(run, 40);
  }

  function renderChart() {
    const d = ds();
    const host = $('chart-host');
    const empty = $('empty-state');
    if (!d || !data.flatten(d).length) {
      host.innerHTML = '';
      $('paper').style.width = presets.mm2px(S.style.size.w) + 'px';
      $('paper').style.height = presets.mm2px(S.style.size.h) + 'px';
      empty.hidden = false;
      renderPanelStats(null);
      return;
    }
    empty.hidden = true;
    const t0 = performance.now();
    let res;
    try {
      res = chart.render(host, { ds: d, style: S.style, type: S.type, mapping: mappingOf() });
    } catch (err) {
      console.error(err);
      host.innerHTML = '';
      ui.toast('渲染出错：' + err.message, 'err');
      return;
    }
    S.renderInfo = res;
    const ms = performance.now() - t0;
    const p = $('paper');
    p.style.width = res.W + 'px';
    p.style.height = res.H + 'px';
    $('sb-render').textContent = '渲染 ' + ms.toFixed(0) + ' ms';
    $('sb-size').textContent = S.style.size.w + ' × ' + S.style.size.h + ' mm';
    if (S.autoFit) fitZoom(false);
    // 恢复选中高亮
    if (S.sel) applyHighlight();
    renderPanelStats(res);
    if (S.type === 'roc' && res && res.rocs && !res.rocs.length) {
      setStatus('ROC 需要一列分类标签（0/1 或两组名称），请在「图形」里指定');
    } else {
      setStatus('图形已更新');
    }
  }

  function applyHighlight() {
    const svg = $('chart-host').querySelector('svg');
    if (!svg || !S.sel) return;
    const n = svg.querySelector('[data-oi="' + S.sel.key + '.' + S.sel.idx + '"]');
    if (n) n.classList.add('oi-hl');
  }

  function setStatus(msg) { $('status-msg').textContent = msg; }

  /* ════════════ 缩放 ════════════ */
  function fitZoom(animate) {
    const wrap = $('canvas-wrap');
    const p = $('paper');
    const W = parseFloat(p.style.width) || 400;
    const H = parseFloat(p.style.height) || 300;
    // 内边距随断点变化，直接读计算值，别把数字写死在两处
    const cs = getComputedStyle(wrap);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 16;
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + 14;
    const availW = wrap.clientWidth - padX;
    const availH = wrap.clientHeight - padY;
    const z = Math.min(1.25, Math.min(availW / W, availH / H));
    S.zoom = Math.max(0.2, z);
    applyZoom();
  }
  function applyZoom() {
    const p = $('paper');
    const wrap = $('canvas-wrap');
    const z = S.zoom;
    const w0 = parseFloat(p.style.width) || 0;
    const h0 = parseFloat(p.style.height) || 0;
    const csw = getComputedStyle(wrap);
    const pL = parseFloat(csw.paddingLeft) || 0, pR = parseFloat(csw.paddingRight) || 0;
    const pT = parseFloat(csw.paddingTop) || 0, pB = parseFloat(csw.paddingBottom) || 0;
    const aw = Math.max(0, wrap.clientWidth - pL - pR);      // 可用内容区
    const ah = Math.max(0, wrap.clientHeight - pT - pB);
    // transform-origin 是 top center：横向缩放以中轴为准，纵向只往下长。
    // 视觉盒 = 布局盒 + 这层偏移。目标是「装得下就居中，装不下就贴左上」——
    // 贴边而不是继续外扩，否则放大后上/左边缘会被推出滚动起点、再也滚不回来。
    const dx = Math.max(0, (aw - z * w0) / 2) - (aw > w0 ? (aw - w0) / 2 : 0) + (z - 1) * w0 / 2;
    const dy = Math.max(0, (ah - z * h0) / 2) - (ah > h0 ? (ah - h0) / 2 : 0);
    p.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) scale(' + z + ')';
    // 缩放不改变布局尺寸，滚动条量不到被放大的部分；用一块看不见的占位把
    // 放大后的尺寸撑进滚动区，否则放大后右下角滚不到。
    const shim = $('paper-shim');
    if (shim) {
      shim.style.width = Math.round(pL + Math.max(z * w0, aw)) + 'px';
      shim.style.height = Math.round(pT + Math.max(z * h0, ah)) + 'px';
    }
    $('zoom-val').textContent = Math.round(z * 100) + '%';
  }
  function setZoom(z) {
    S.zoom = Math.max(0.15, Math.min(4, z));
    applyZoom();
  }

  /* ════════════ 数据集 ════════════ */
  function refreshTabs() {
    const host = $('ds-tabs');
    host.innerHTML = '';
    S.datasets.forEach(d => {
      const b = ui.h('div', 'ds-tab' + (d.id === S.activeId ? ' on' : ''));
      b.appendChild(ui.h('span', 'kind', data.kind(d.kind).short));
      b.appendChild(ui.h('span', '', d.name));
      const x = ui.h('span', 'x', '×');
      x.title = '删除该数据表';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDataset(d.id);
      });
      b.appendChild(x);
      b.addEventListener('click', () => {
        if (S.activeId === d.id) return;
        S.activeId = d.id;
        autoType();
        S.sel = null;
        refreshTabs();
        grid.setDataset(d);
        refreshSheetKind();
        renderPanel();
        renderChart();
      });
      host.appendChild(b);
    });
  }

  function addDataset(d, silent) {
    S.datasets.push(d);
    S.activeId = d.id;
    if (!silent) { pushHistory('新建数据表'); }
    autoType();
    refreshTabs();
    grid.setDataset(d);
    refreshSheetKind();
    renderPanel();
    renderChart();
  }

  async function deleteDataset(id) {
    const d = S.datasets.find(x => x.id === id);
    if (!d) return;
    if (S.datasets.length === 1) { ui.toast('至少要保留一个数据表', 'err'); return; }
    const ok = await ui.confirm('确定删除数据表「' + d.name + '」？此操作可用 Ctrl+Z 撤销。', { title: '删除数据表', okText: '删除' });
    if (!ok) return;
    const i = S.datasets.indexOf(d);
    S.datasets.splice(i, 1);
    S.activeId = S.datasets[Math.max(0, i - 1)].id;
    pushHistory('删除数据表');
    S.sel = null;
    refreshTabs();
    grid.setDataset(ds());
    refreshSheetKind();
    renderPanel();
    renderChart();
  }

  /** 依据当前数据表自动挑一个合理图形 */
  function autoType() {
    const d = ds();
    if (!d) return;
    const cur = chart.type(S.type);
    if (cur.kind === d.kind) return;
    const prefer = {
      column: 'bar', xy: 'scatter', grouped: 'grouped-bar', survival: 'km'
    }[d.kind];
    if (prefer) S.type = prefer;
  }

  function refreshSheetKind() {
    const sel = $('sel-sheet-kind');
    const d = ds();
    if (!d) return;
    sel.innerHTML = '';
    data.KINDS.forEach(k => {
      const o = ui.h('option', '', k.name + '（' + k.desc + '）');
      o.value = k.id;
      sel.appendChild(o);
    });
    sel.value = d.kind;
    const kd = data.kind(d.kind);
    $('dh-text').innerHTML = kd.hint;
  }

  /** 状态栏左边那段统计文字：底栏右侧是表格字体缩放，宽度不够就省略，全文挂 title */
  function setDsStat(txt) {
    const el = $('ds-stat');
    el.textContent = txt;
    if (txt) el.title = txt; else el.removeAttribute('title');
  }

  function refreshGridStat() {
    const d = ds();
    if (!d) { setDsStat(''); return; }
    let n = 0;
    d.rows.forEach(r => r.forEach(v => { if (v !== '' && v !== null && v !== undefined) n++; }));
    setDsStat(d.rows.length + ' 行 × ' + d.columns.length + ' 列 · ' + n + ' 个数值');
  }
  function updateGridStat(sel, d) {
    const base = d.rows.length + ' 行 × ' + d.columns.length + ' 列';
    if (!sel) { setDsStat(base); return; }
    let n = 0;
    const nums = [];
    for (let r = sel.r1; r <= sel.r2; r++)
      for (let c = sel.c1; c <= sel.c2; c++) {
        const v = d.rows[r][c];
        if (v !== '' && v !== null && v !== undefined) {
          n++;
          if (data.isNum(v)) nums.push(+v);
        }
      }
    let txt = base + ' · 选中 ' + sel.rows + '×' + sel.cols + '（' + n + ' 格）';
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      txt += ' · 均值 ' + stats.fmt(sum / nums.length, 3) + ' · 求和 ' + stats.fmt(sum, 4) + ' · n=' + nums.length;
    }
    setDsStat(txt);
  }

  /* ════════════ 工具栏 ════════════ */
  const TYPE_ICONS = {
    bar: '<svg viewBox="0 0 20 20" width="15" height="15"><rect x="2.5" y="9" width="3.6" height="8.5" fill="currentColor"/><rect x="7.6" y="4.5" width="3.6" height="13" fill="currentColor"/><rect x="12.7" y="7" width="3.6" height="10.5" fill="currentColor"/></svg>',
    'grouped-bar': '<svg viewBox="0 0 20 20" width="15" height="15"><rect x="2" y="8" width="2.4" height="9.5" fill="currentColor"/><rect x="5" y="4.5" width="2.4" height="13" fill="currentColor" opacity=".55"/><rect x="9" y="8" width="2.4" height="9.5" fill="currentColor"/><rect x="12" y="4.5" width="2.4" height="13" fill="currentColor" opacity=".55"/><rect x="16" y="8" width="2.4" height="9.5" fill="currentColor"/></svg>',
    line: '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M2 15.5 6.5 10 11 12.5 18 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6.5" cy="10" r="1.7" fill="currentColor"/><circle cx="11" cy="12.5" r="1.7" fill="currentColor"/></svg>',
    scatter: '<svg viewBox="0 0 20 20" width="15" height="15"><circle cx="4" cy="14.5" r="1.9" fill="currentColor"/><circle cx="8" cy="10.5" r="1.9" fill="currentColor"/><circle cx="12.5" cy="8" r="1.9" fill="currentColor"/><circle cx="16.5" cy="4.5" r="1.9" fill="currentColor"/><path d="M2 17 18 3" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3,2" opacity=".6"/></svg>',
    box: '<svg viewBox="0 0 20 20" width="15" height="15"><rect x="5" y="6" width="10" height="8" fill="currentColor" opacity=".35" stroke="currentColor" stroke-width="1.2"/><path d="M10 2.5v3.5M10 14v3.5M6.5 2.5h7M6.5 17.5h7M5 10h10" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>',
    violin: '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M10 2c-3 3-4 5-4 8s1 5 4 8c3-3 4-5 4-8s-1-5-4-8z" fill="currentColor" opacity=".35" stroke="currentColor" stroke-width="1.1"/><path d="M10 6v8" stroke="currentColor" stroke-width="1.2"/></svg>',
    dose: '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M2 17C6 17 7 4 18 3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="4.5" cy="15" r="1.6" fill="currentColor"/><circle cx="8" cy="10" r="1.6" fill="currentColor"/><circle cx="14" cy="4.5" r="1.6" fill="currentColor"/></svg>',
    km: '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M2 3h4v3h3v3h3v4h6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 9v4M11 13v3" stroke="currentColor" stroke-width="1.2"/></svg>',
    heatmap: '<svg viewBox="0 0 20 20" width="15" height="15"><rect x="2" y="2" width="5" height="5" fill="currentColor" opacity=".9"/><rect x="8" y="2" width="5" height="5" fill="currentColor" opacity=".5"/><rect x="14" y="2" width="4" height="5" fill="currentColor" opacity=".2"/><rect x="2" y="8" width="5" height="5" fill="currentColor" opacity=".4"/><rect x="8" y="8" width="5" height="5" fill="currentColor" opacity=".75"/><rect x="14" y="8" width="4" height="5" fill="currentColor" opacity=".35"/><rect x="2" y="14" width="5" height="4" fill="currentColor" opacity=".25"/><rect x="8" y="14" width="5" height="4" fill="currentColor" opacity=".6"/><rect x="14" y="14" width="4" height="4" fill="currentColor" opacity=".95"/></svg>',
    dual: '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M2 14 8 8l5 3 5-6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2 17l6-4 5 4 5-9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3,2"/></svg>',
    roc: '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M3 17V3l14 14z" fill="currentColor" opacity=".18"/><path d="M3 17C7 17 9 5 17 3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 3 17 17" stroke="currentColor" stroke-width="1" stroke-dasharray="3,2"/></svg>'
  };

  function syncToolbar() {
    const t = chart.type(S.type);
    $('ct-label').textContent = t.name;
    $('ct-icon').innerHTML = TYPE_ICONS[t.id] || '';
    const pal = presets.palette(S.style.marks.palette);
    $('palette-label').textContent = pal.name;
    $('palette-chip').style.background = 'linear-gradient(90deg,' + pal.colors.slice(0, 6).join(',') + ')';
    $('sel-preset').value = S.style.preset;
    $('inp-w').value = S.style.size.w;
    $('inp-h').value = S.style.size.h;
    $('btn-undo').disabled = S.histIdx <= 0;
    $('btn-redo').disabled = S.histIdx >= S.history.length - 1;
  }

  function initToolbar() {
    const presetSel = $('sel-preset');
    presetSel.innerHTML = '';
    presets.journals.forEach(j => {
      const o = ui.h('option', '', j.name);
      o.value = j.id;
      o.title = j.note || '';
      presetSel.appendChild(o);
    });
    presetSel.value = S.style.preset;
    presetSel.addEventListener('change', () => {
      presets.applyPreset(S.style, presetSel.value);
      pushHistory('期刊预设');
      syncToolbar();
      renderPanel();
      renderChart();
      ui.toast('已套用「' + presets.journal(presetSel.value).name + '」：' +
        S.style.size.w + '×' + S.style.size.h + ' mm');
    });

    // 图表类型
    $('btn-charttype').addEventListener('click', function () {
      const groups = {};
      chart.TYPES.forEach(t => {
        (groups[t.group] = groups[t.group] || []).push(t);
      });
      const items = [];
      Object.keys(groups).forEach((gname, gi) => {
        if (gi) items.push({ sep: true });
        items.push({ title: gname });
        groups[gname].forEach(t => {
          items.push({
            label: t.name,
            desc: t.kind === data.kind(ds() && ds().kind).id ? '' : '',
            on: S.type === t.id,
            icon: TYPE_ICONS[t.id],
            onClick: () => setChartType(t.id)
          });
        });
      });
      ui.popmenu(this, items, { wide: true });
    });

    // 配色
    $('btn-palette').addEventListener('click', function () {
      const items = [{ title: '分类配色（用于分组 / 序列）' }];
      presets.palettes.forEach(p => {
        items.push({
          label: p.name,
          desc: p.note,
          on: S.style.marks.palette === p.id,
          icon: '<span style="display:inline-block;width:34px;height:10px;border-radius:2px;background:linear-gradient(90deg,' + p.colors.slice(0, 6).join(',') + ');box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></span>',
          onClick: () => {
            S.style.marks.palette = p.id;
            pushHistory('配色');
            S.style.overrides = {};
            syncToolbar();
            renderPanel();
            renderChart();
          }
        });
      });
      items.push({ sep: true }, { title: '连续色阶（热图 / 色阶图例）' });
      presets.ramps.forEach(r => {
        items.push({
          label: r.name,
          desc: r.note,
          on: S.style.marks.heat.ramp === r.id,
          icon: '<span style="display:inline-block;width:34px;height:10px;border-radius:2px;background:linear-gradient(90deg,' + r.stops.slice(0, 6).join(',') + ');box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></span>',
          onClick: () => {
            S.style.marks.heat.ramp = r.id;
            pushHistory('色阶');
            renderPanel();
            renderChart();
          }
        });
      });
      ui.popmenu(this, items, { wide: true });
    });

    // 尺寸
    const wIn = $('inp-w'), hIn = $('inp-h');
    const applySize = () => {
      const w = Math.max(20, Math.min(600, +wIn.value || 100));
      const h = Math.max(20, Math.min(600, +hIn.value || 70));
      if (w === S.style.size.w && h === S.style.size.h) return;
      S.style.size.w = w; S.style.size.h = h;
      pushHistory('画布尺寸');
      renderChart();
    };
    wIn.addEventListener('change', applySize);
    hIn.addEventListener('change', applySize);
    $('btn-swap-size').addEventListener('click', () => {
      const w = S.style.size.w;
      S.style.size.w = S.style.size.h; S.style.size.h = w;
      wIn.value = S.style.size.w; hIn.value = S.style.size.h;
      pushHistory('交换尺寸');
      renderChart();
    });

    $('btn-undo').addEventListener('click', undo);
    $('btn-redo').addEventListener('click', redo);
    $('btn-autofit').addEventListener('click', () => {
      S.autoFit = !S.autoFit;
      $('btn-autofit').classList.toggle('on', S.autoFit);
      if (S.autoFit) fitZoom();
    });
    $('btn-autofit').classList.add('on');

    $('btn-zoom-in').addEventListener('click', () => setZoom(S.zoom * 1.25));
    $('btn-zoom-out').addEventListener('click', () => setZoom(S.zoom / 1.25));
    $('btn-zoom-reset').addEventListener('click', () => fitZoom());

    $('btn-export').addEventListener('click', () => exportDialog());

    // 元素选择模式
    $('stage-mode').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      $('stage-mode').querySelectorAll('.seg-btn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      S.mode = b.dataset.mode;
      $('stage-hint').textContent = S.mode === 'pick'
        ? '点击图上任意元素（柱子/点/线/文字）→ 右侧「元素」里单独改它'
        : '提示：切到「元素选择」可以单独挑元素改样式';
      $('chart-host').style.cursor = S.mode === 'pick' ? 'crosshair' : 'default';
      if (S.mode !== 'pick') { S.sel = null; renderPanel(); clearHighlight(); }
    });

    $('btn-add-annot').addEventListener('click', addAnnotation);
    $('btn-fig-title').addEventListener('click', titleDialog);
  }

  function clearHighlight() {
    const svg = $('chart-host').querySelector('svg');
    if (svg) svg.querySelectorAll('.oi-hl').forEach(n => n.classList.remove('oi-hl'));
  }

  function setChartType(id) {
    const t = chart.type(id);
    S.type = id;
    S.sel = null;
    // 数据表类型不匹配时给出提示（不强制切换，用户可自行决定）
    const d = ds();
    if (d && d.kind !== t.kind) {
      const want = data.kind(t.kind).name;
      ui.toast('「' + t.name + '」通常需要' + want + '，当前是' + data.kind(d.kind).name +
        '——可点数据表工具栏的类型下拉切换', 'err', 4200);
    }
    pushHistory('切换图形');
    syncToolbar();
    renderPanel();
    renderChart();
  }

  /* ════════════ 数据表工具栏 ════════════ */
  function initDataToolbar() {
    /* 示例数据：内置 6 套，载入后自动切到最合适的图形，
       省得用户先载数据再猜该配哪种图。 */
    $('btn-samples').addEventListener('click', function () {
      const items = [{ title: '载入内置示例数据' }];
      data.sampleList.forEach(s => {
        const open = S.datasets.filter(d => d.sampleId === s.id).length;
        items.push({
          label: s.name,
          desc: s.note + (open ? ' · 已载入 ' + open + ' 份' : ''),
          onClick: () => {
            let d;
            try { d = data.samples[s.id](); }
            catch (err) { ui.toast('示例数据载入失败：' + err.message, 'err'); return; }
            d.sampleId = s.id;
            d.name = s.name;
            // 先定图形再入库：addDataset 里的 autoType 会看到类型已匹配而直接跳过，
            // 于是只渲染一次，不会出现「先闪一下别的图」。
            const t = s.chart && chart.type(s.chart);
            if (t && t.kind === d.kind) S.type = t.id;
            addDataset(d);
            syncToolbar();   // 示例改了 S.type，工具栏的图形名要跟着变
            ui.toast('已载入示例「' + s.name + '」· ' + d.rows.length + ' 行 × ' +
              d.columns.length + ' 列', 'ok');
          }
        });
      });
      ui.popmenu(this, items, { wide: true });
    });

    $('btn-new-table').addEventListener('click', function () {
      let chosen = 'column';
      let rows = 6, cols = 5;
      ui.modal({
        title: '新建数据表',
        build(b) {
          b.appendChild(ui.h('div', 'pm-title', '选择表类型'));
          const grid4 = ui.h('div', 'type-grid');
          data.KINDS.forEach(k => {
            const c = ui.h('div', 'type-card' + (k.id === 'column' ? ' on' : ''));
            c.appendChild(ui.el('div', 'tc-name', k.name));
            c.appendChild(ui.el('div', 'tc-desc', k.desc));
            c.addEventListener('click', () => {
              grid4.querySelectorAll('.type-card').forEach(x => x.classList.remove('on'));
              c.classList.add('on');
              chosen = k.id;
              rows = k.id === 'survival' ? 10 : 6;
              rowsIn.value = rows;
            });
            grid4.appendChild(c);
          });
          b.appendChild(grid4);
          const r1 = ui.h('div', 'field-row');
          r1.appendChild(ui.h('label', '', '初始行数'));
          const rowsIn = ui.h('input', ''); rowsIn.type = 'number'; rowsIn.min = 1; rowsIn.max = 500; rowsIn.value = rows;
          rowsIn.addEventListener('input', () => { rows = Math.max(1, Math.min(500, +rowsIn.value || 6)); });
          r1.appendChild(rowsIn);
          b.appendChild(r1);
          const r2 = ui.h('div', 'field-row');
          r2.appendChild(ui.h('label', '', '初始列数'));
          const colsIn = ui.h('input', ''); colsIn.type = 'number'; colsIn.min = 1; colsIn.max = 40; colsIn.value = cols;
          colsIn.addEventListener('input', () => { cols = Math.max(1, Math.min(40, +colsIn.value || 5)); });
          r2.appendChild(colsIn);
          b.appendChild(r2);
        },
        buttons: [
          { label: '取消' },
          {
            label: '创建', primary: true, onClick: () => {
              const d = data.newDataset(chosen, { rows, cols, title: '数据表' + (S.datasets.length + 1) });
              addDataset(d);
              ui.toast('已创建' + data.kind(chosen).name);
            }
          }
        ]
      });
    });

    $('btn-import').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (/\.xlsx?$/i.test(f.name)) {
        ui.modal({
          title: 'Excel 文件请用粘贴导入',
          build(b) {
            b.appendChild(ui.h('div', 'note-card',
              '浏览器无法直接读取 .xlsx。请：<br>1) 用 Excel / WPS 打开该文件；<br>' +
              '2) 选中数据区域，Ctrl+C 复制；<br>3) 回到这里点“取消”，再点数据表右上角的粘贴按钮或直接 Ctrl+V。<br><br>' +
              '表头、组名、单位都会原样保留。'));
          },
          buttons: [{ label: '知道了' }]
        });
        e.target.value = '';
        return;
      }
      const fr = new FileReader();
      fr.onload = () => {
        const r = data.fromText(String(fr.result), { title: f.name.replace(/\.[^.]+$/, '') });
        if (!r.ok) { ui.toast(r.msg, 'err'); return; }
        addDataset(r.dataset);
        ui.toast('已导入 ' + r.dataset.rows.length + ' 行 · ' + r.dataset.columns.length + ' 列', 'ok');
      };
      fr.readAsText(f, 'utf-8');
      e.target.value = '';
    });

    $('sel-sheet-kind').addEventListener('change', () => {
      const d = ds();
      if (!d) return;
      const nk = $('sel-sheet-kind').value;
      if (nk === d.kind) return;
      d.kind = nk;
      // 重置角色
      const kd = data.kind(nk);
      d.columns.forEach((c, i) => {
        if (nk === 'xy') c.role = i === 0 ? 'X' : (c.role === 'G' ? 'G' : 'Y');
        else if (nk === 'grouped') c.role = i === 0 ? 'G' : 'Y';
        else if (nk === 'survival') c.role = ['X', 'V', 'G'][i] || 'I';
        else c.role = 'Y';
      });
      pushHistory('切换表类型');
      grid.refresh();
      refreshSheetKind();
      renderPanel();
      renderChart();
    });

    $('btn-add-row').addEventListener('click', () => { grid.addRowBelow(); });
    $('btn-add-col').addEventListener('click', () => { grid.addColRight(); });
    $('btn-del-row').addEventListener('click', () => { grid.delRows(); });
    $('btn-del-col').addEventListener('click', () => { grid.delCols(); });

    initGridZoom();

    // 粘贴面板
    $('btn-paste-ok').addEventListener('click', () => {
      const txt = $('paste-area').value;

      if (!txt.trim()) { ui.toast('没有内容', 'err'); return; }
      const r = data.fromText(txt);
      if (!r.ok) { ui.toast(r.msg, 'err'); return; }
      addDataset(r.dataset);
      $('data-paste').hidden = true;
      $('paste-area').value = '';
      ui.toast('已导入 ' + r.dataset.rows.length + ' 行', 'ok');
    });
    $('btn-paste-cancel').addEventListener('click', () => {
      $('data-paste').hidden = true;
      $('paste-area').value = '';
    });
  }

  /* ════════════ 数据表字体缩放 ════════════ */
  /**
   * 用一套离散档位而不是任意百分比：每一档都保证表头、角色标记、列宽
   * 一起放大后仍然对得齐。Ctrl+滚轮 / Ctrl+加号减号 也能调。
   */
  const SS_LEVELS = [75, 85, 100, 115, 130, 150, 175, 200];
  const SS_ZOOM_KEY = 'figforge.ssZoom';
  let ssZoom = 100;

  /** 打开粘贴面板（剪贴板读不到时的兜底入口） */
  function openPastePanel() {
    $('data-paste').hidden = false;
    $('paste-area').focus();
  }

  function applySsZoom(pct, silent) {
    ssZoom = grid.setZoom(pct);
    const btn = $('btn-ss-zoom');
    btn.textContent = ssZoom + '%';
    btn.title = '表格字体 ' + ssZoom + '%（点此选档，或在表格上 Ctrl+滚轮）';
    try { localStorage.setItem(SS_ZOOM_KEY, String(ssZoom)); } catch (e) {}
    if (!silent) setStatus('数据表字体 ' + ssZoom + '%');
    return ssZoom;
  }

  /** 按档位方向走一格 */
  function stepSsZoom(dir) {
    const i = SS_LEVELS.indexOf(ssZoom);
    let next;
    if (i < 0) {
      next = dir > 0
        ? (SS_LEVELS.find(v => v > ssZoom) || SS_LEVELS[SS_LEVELS.length - 1])
        : (SS_LEVELS.slice().reverse().find(v => v < ssZoom) || SS_LEVELS[0]);
    } else {
      next = SS_LEVELS[Math.max(0, Math.min(SS_LEVELS.length - 1, i + dir))];
    }
    if (next === ssZoom) { ui.toast('已经是' + (dir > 0 ? '最大' : '最小') + '档 ' + ssZoom + '%'); return; }
    ui.toast('数据表字体 ' + applySsZoom(next) + '%', 'ok');
  }

  function initGridZoom() {
    let saved = 100;
    try { saved = parseInt(localStorage.getItem(SS_ZOOM_KEY) || '100', 10) || 100; } catch (e) { saved = 100; }
    applySsZoom(saved, true);

    $('btn-ss-minus').addEventListener('click', () => stepSsZoom(-1));
    $('btn-ss-plus').addEventListener('click', () => stepSsZoom(1));
    $('btn-ss-zoom').addEventListener('click', () => {
      const items = SS_LEVELS.map(v => ({
        label: v + '%',
        desc: v === 100 ? '默认' : '',
        on: v === ssZoom,
        onClick: () => applySsZoom(v)
      }));
      items.push({ sep: true }, { label: '复位为 100%', onClick: () => applySsZoom(100) });
      ui.popmenu($('btn-ss-zoom'), items, { align: 'right' });
    });

    // Ctrl+滚轮：鼠标在表格上直接缩放
    $('grid-scroll').addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      stepSsZoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  /* ════════════ 右侧面板 ════════════ */
  let activeTab = 'chart';
  function initTabs() {
    $('right-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.ptab');
      if (!b) return;
      activeTab = b.dataset.tab;
      $('right-tabs').querySelectorAll('.ptab').forEach(x => x.classList.toggle('on', x === b));
      renderPanel();
    });
  }

  /* 这些键会决定其它控件是否出现（schema 里的 if），改完得重建面板 */
  const PANEL_GATE_KEYS = [
    'fit.type', 'stats.compare', 'stats.annotStyle', 'stats.annot',
    'stats.show', 'title.show'
  ];

  /** 图标题的控件清单：右侧「样式」面板与标题弹窗共用同一份 */
  function titleItems() {
    const st = S.style.title;
    const items = [
      { key: 'title.show', label: '显示标题', type: 'switch' },
      {
        note: '标题会画进导出的矢量图里。也可以直接<b>点画布上的标题</b>回到这里。'
      },
      {
        key: 'title.text', label: '主标题', type: 'text',
        placeholder: '例：不同处理对种子发芽率的影响', tall: true
      },
      {
        key: 'title.sub', label: '副标题', type: 'text',
        placeholder: '例：数据以 mean ± SD 表示，n = 10', tall: true
      },
      {
        key: 'title.pos', label: '位置', type: 'btnrow',
        options: [{ v: 'top', name: '图上方' }, { v: 'bottom', name: '图下方' }]
      },
      {
        key: 'title.align', label: '对齐', type: 'btnrow',
        options: [{ v: 'left', name: '左' }, { v: 'center', name: '中' }, { v: 'right', name: '右' }]
      },
      {
        key: 'title.size', label: '标题字号', type: 'range',
        min: 4, max: 40, step: 0.5, def: st.size || S.style.font.title,
        fmt: v => v.toFixed(1) + ' pt'
      },
      { key: 'title.bold', label: '加粗', type: 'switch' }
    ];
    return st.show ? items : items.slice(0, 1);
  }

  /**
   * 「标题」按钮 / 点画布上的标题都走这里。
   * 标题控件放在右侧「样式」面板里，不做浮层 —— 中间栏是画布，
   * 浮层必然压住图，改字号、看对齐就没意义了。
   */
  function titleDialog() {
    if (!S.style.title.show && !S.style.title.text && !S.style.title.sub) {
      S.style.title.show = true;          // 首次点开直接打开开关，省一步
      pushHistory('显示标题');
      scheduleRender();
    }
    switchTab('style');
    delete S.collapsed['图标题'];          // 分组可能被折叠过，先展开
    if (isNarrow()) openDrawer('right');   // 窄屏时属性面板是抽屉（确保打开，不是切换）
    renderPanel();
    const host = $('right-body');
    const group = Array.prototype.find.call(host.querySelectorAll('.pgroup'), g => {
      const t = g.querySelector('.pgroup-title');
      return t && t.textContent.trim() === '图标题';
    });
    if (group) {
      // 图标题在「样式」里排第六个分组，靠 nearest 往往只露出半截，居中滚一下才看得全
      group.scrollIntoView({ block: 'center' });
      group.classList.add('flash');
      setTimeout(() => group.classList.remove('flash'), 1000);
      const inp = group.querySelector('input[type=text]');
      if (inp) { inp.focus(); inp.select(); }
    }
    setStatus('在右侧「图标题」里填主标题 / 副标题、选位置与字号');
  }

  const ctl = {
    get: (p) => getPath(S.style, p),
    set: (p, v) => setPath(S.style, p, v),
    changed: (p, v, live) => {
      if (!live) pushHistory('样式:' + p);
      if (p === 'marks.palette') { S.style.overrides = {}; syncToolbar(); }
      scheduleRender();
      if (!live && PANEL_GATE_KEYS.indexOf(p) >= 0) renderPanel();
    },
    onCollapse: (g, on) => { S.collapsed[g] = on; },
    collapsed: S.collapsed
  };

  function renderPanel() {
    const host = $('right-body');
    const d = ds();
    let schema = [];
    if (activeTab === 'chart') schema = schemaChart(d);
    else if (activeTab === 'style') schema = schemaStyle(d);
    else if (activeTab === 'stats') schema = schemaStats(d);
    else schema = schemaElem(d);
    ui.buildControls(host, schema, ctl);
  }

  /* ───── 图形 tab ───── */
  function schemaChart(d) {
    if (!d) return [{ group: '图形', items: [{ note: '先创建或导入一个数据表' }] }];
    const t = chart.type(S.type);
    const out = [];
    out.push({
      group: '数据映射', right: data.kind(d.kind).name,
      items: [
        { note: data.kind(d.kind).hint },
        colRoleControl(d),
        {
          note: t.kind === d.kind
            ? '当前图形与数据表类型匹配。'
            : '⚠ 当前图形通常需要「' + data.kind(t.kind).name + '」，但数据表是「' + data.kind(d.kind).name + '」，结果可能不符合预期。',
          warn: t.kind !== d.kind
        }
      ]
    });

    const items = [];
    if (['bar', 'box', 'violin'].indexOf(S.type) >= 0) {
      items.push({
        key: 'marks.err.type', label: '误差类型', type: 'btnrow',
        options: [{ v: 'sem', name: 'SEM' }, { v: 'sd', name: 'SD' }, { v: 'ci95', name: '95% CI' }, { v: 'iqr', name: 'IQR' }],
        if: () => S.type !== 'box' && S.type !== 'violin'
      });
      items.push({ key: 'marks.err.show', label: '显示误差棒', type: 'switch' });
      items.push({ key: 'marks.err.cap', label: '误差棒加帽', type: 'switch' });
      items.push({ key: 'marks.err.width', label: '误差棒粗细', type: 'range', min: 0.2, max: 2, step: 0.05, fmt: v => v.toFixed(2) + ' pt' });
    }
    if (['bar', 'grouped-bar'].indexOf(S.type) >= 0) {
      items.push({ key: 'marks.bar.width', label: '柱宽', type: 'range', min: 0.15, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%' });
      items.push({ key: 'marks.bar.opacity', label: '填充不透明度', type: 'range', min: 0.1, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
      items.push({
        key: 'marks.bar.outline', label: '边框', type: 'btnrow',
        options: [{ v: 'none', name: '无' }, { v: 'all', name: '黑色' }, { v: 'fill', name: '同色加深' }]
      });
      items.push({ key: 'marks.bar.corner', label: '圆角', type: 'range', min: 0, max: 3, step: 0.1, fmt: v => v.toFixed(1) + ' pt' });
      if (S.type === 'grouped-bar') {
        items.push({
          key: 'marks.bar.dodge', label: '排列方式', type: 'btnrow',
          options: [{ v: 'group', name: '并排' }, { v: 'stack', name: '堆叠' }]
        });
      }
    }
    if (['line', 'scatter', 'dose', 'km', 'dual'].indexOf(S.type) >= 0) {
      items.push({ key: 'marks.lineW', label: '线条粗细', type: 'range', min: 0.2, max: 4, step: 0.05, fmt: v => v.toFixed(2) + ' pt' });
    }
    if (S.type === 'line') {
      items.push({ key: 'marks.line.smooth', label: '平滑曲线', type: 'switch' });
      items.push({
        key: 'marks.line.style', label: '线型', type: 'btnrow',
        options: [{ v: 'solid', name: '实线' }, { v: 'dash', name: '虚线' }, { v: 'dot', name: '点线' }]
      });
      items.push({
        key: 'marks.line.marker', label: '点标记', type: 'select',
        options: [{ v: 'none', name: '不显示' }, { v: 'auto', name: '跟随配色' }].concat(presets.shapes.map(s => ({ v: s.id, name: s.name })))
      });
    }
    if (['scatter', 'dose'].indexOf(S.type) >= 0) {
      items.push({
        key: 'marks.dot.shape', label: '点形状', type: 'select',
        options: presets.shapes.map(s => ({ v: s.id, name: s.name }))
      });
      items.push({ key: 'marks.dot.size', label: '点大小', type: 'range', min: 1, max: 9, step: 0.1, fmt: v => v.toFixed(1) + ' pt' });
      items.push({ key: 'marks.dot.opacity', label: '点不透明度', type: 'range', min: 0.1, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
    }
    if (S.type === 'bar') {
      items.push({ key: 'marks.dot.jitter', label: '散点叠加', type: 'range', min: 0, max: 0.45, step: 0.01, fmt: v => v == 0 ? '不显示' : Math.round(v * 200) + '% 宽度' });
    }
    if (['box'].indexOf(S.type) >= 0) {
      items.push({
        key: 'marks.box.whisker', label: '须的定义', type: 'btnrow',
        options: [{ v: 'tukey', name: '1.5 IQR' }, { v: 'minmax', name: '最小-最大' }, { v: 'sem', name: 'SEM' }]
      });
      items.push({ key: 'marks.box.width', label: '箱体宽度', type: 'range', min: 0.1, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%' });
      items.push({ key: 'marks.box.opacity', label: '箱体不透明度', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
      items.push({
        key: 'marks.box.showPoints', label: '叠加数据点', type: 'btnrow',
        options: [{ v: 'none', name: '不显示' }, { v: 'outliers', name: '仅离群点' }, { v: 'all', name: '全部' }]
      });
    }
    if (S.type === 'violin') {
      items.push({ key: 'marks.violin.width', label: '轮廓宽度', type: 'range', min: 0.2, max: 1.2, step: 0.02, fmt: v => Math.round(v * 100 / 1.2) + '%' });
      items.push({ key: 'marks.violin.opacity', label: '填充不透明度', type: 'range', min: 0.05, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
      items.push({
        key: 'marks.violin.showBox', label: '内嵌', type: 'btnrow',
        options: [{ v: 'none', name: '仅轮廓' }, { v: 'box', name: '箱体+须' }, { v: 'quartile', name: '仅四分位' }]
      });
      items.push({ key: 'marks.violin.showPoints', label: '叠加散点', type: 'switch' });
      items.push({
        key: 'marks.violin.trim', label: '裁掉尾部', type: 'switch',
        hint: '开启后轮廓只画到数据的最小/最大值之间'
      });
      items.push({ key: 'marks.violin.bandwidth', label: '带宽', type: 'number', step: 0.1, min: 0, placeholder: '0 = 自动 (Silverman)', hint: '0 为自动' });
    }
    if (S.type === 'heatmap') {
      items.push({
        key: 'marks.heat.ramp', label: '色阶', type: 'select',
        options: presets.ramps.map(r => ({ v: r.id, name: r.name }))
      });
      items.push({ key: 'marks.heat.reverse', label: '反转色阶', type: 'switch' });
      items.push({ key: 'marks.heat.showValue', label: '显示数值', type: 'switch' });
      items.push({ key: 'marks.heat.valueSize', label: '数值字号', type: 'range', min: 4, max: 14, step: 0.5, fmt: v => v.toFixed(1) + ' pt' });
      items.push({ key: 'marks.heat.gap', label: '色块间隙', type: 'range', min: 0, max: 6, step: 0.5, fmt: v => v.toFixed(1) + ' px' });
      items.push({ key: 'marks.heat.borderW', label: '描边粗细', type: 'range', min: 0, max: 3, step: 0.1, fmt: v => v.toFixed(1) + ' pt' });
    }
    if (S.type === 'roc') {
      items.push({ key: 'marks.roc.diagonal', label: '显示对角线', type: 'switch' });
      items.push({ key: 'marks.roc.width', label: '曲线粗细', type: 'range', min: 0.3, max: 4, step: 0.05, fmt: v => v.toFixed(2) + ' pt' });
    }
    if (S.type === 'km') {
      items.push({ key: 'marks.km.censor', label: '显示删失标记', type: 'switch' });
      items.push({ key: 'marks.km.showCI', label: '显示 95% 置信带', type: 'switch' });
      items.push({ key: 'marks.km.width', label: '曲线粗细', type: 'range', min: 0.3, max: 4, step: 0.05, fmt: v => v.toFixed(2) + ' pt' });
    }
    if (S.type === 'dual') {
      items.push({ key: 'axes.y2.label', label: '右轴标题', type: 'text', placeholder: '如 温度 (°C)' });
      items.push({
        key: 'marks.y2.series', label: '右轴序列', type: 'select',
        options: [{ v: '', name: '自动（最后一列）' }].concat(
          seriesNamesOf(d).map(n => ({ v: n, name: n }))
        ),
        hint: '只有这一条会走右轴，其余都走左轴'
      });
      items.push({ note: '右轴刻度按该序列自己的数值域独立计算，不受左轴量纲影响。' });
    }
    out.push({ group: '图形参数', items: items });
    out.push({
      group: '整体配色', items: [
        {
          key: 'marks.palette', label: '分类配色', type: 'palette',
          options: presets.palettes.map(p => ({ v: p.id, name: p.name, desc: p.note, colors: p.colors }))
        },
        { note: '点击工具栏的配色按钮可查看配色说明与色阶。' }
      ]
    });
    return out;
  }

  /** 列角色一览（每列一个下拉，直接改角色） */
  function colRoleControl(d) {
    return {
      custom: () => {
        const wrap = ui.h('div', '');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px';
        d.columns.forEach((c, i) => {
          const row = ui.h('div', 'ctrl');
          const lab = ui.h('label', '', CG.Grid.colLetter(i) + ' ' + c.name);
          lab.title = c.name;
          row.appendChild(lab);
          const inp = ui.h('div', 'ctrl-in');
          const sel = ui.h('select', 'mini-select');
          data.ROLES.forEach(r => {
            const o = ui.h('option', '', r.id + ' · ' + r.name);
            o.value = r.id;
            o.title = r.desc;
            sel.appendChild(o);
          });
          sel.value = c.role;
          sel.addEventListener('change', () => {
            c.role = sel.value;
            pushHistory('列角色');
            grid.refresh();
            renderChart();
          });
          inp.appendChild(sel);
          row.appendChild(inp);
          wrap.appendChild(row);
        });
        return wrap;
      }
    };
  }

  /* ───── 样式 tab ───── */
  function schemaStyle(d) {
    return [
      {
        group: '画布与字体', items: [
          { key: 'bg.color', label: '背景色', type: 'color' },
          { key: 'bg.show', label: '填充背景', type: 'switch' },
          {
            key: 'font.family', label: '字体', type: 'select',
            options: presets.fonts.map(f => ({ v: f.css, name: f.name }))
          },
          { key: 'font.tick', label: '刻度字号', type: 'range', min: 4, max: 30, step: 0.5, fmt: v => v.toFixed(1) + ' pt' },
          { key: 'font.label', label: '轴标题字号', type: 'range', min: 4, max: 32, step: 0.5, fmt: v => v.toFixed(1) + ' pt' },
          { key: 'font.legend', label: '图例字号', type: 'range', min: 4, max: 30, step: 0.5, fmt: v => v.toFixed(1) + ' pt' },
          { key: 'font.title', label: '图标题字号', type: 'range', min: 4, max: 40, step: 0.5, fmt: v => v.toFixed(1) + ' pt' },
          { key: 'font.color', label: '文字颜色', type: 'color' }
        ]
      },
      {
        group: 'X 轴', items: [
          { key: 'axes.x.label', label: '轴标题', type: 'text', placeholder: '如 时间 (min)' },
          { key: 'axes.x.grid', label: '网格线', type: 'switch' },
          { key: 'axes.x.log', label: '对数刻度', type: 'switch' },
          { key: 'axes.x.reverse', label: '反向', type: 'switch' },
          { key: 'axes.x.ticks', label: '刻度个数', type: 'number', min: 2, max: 20, step: 1, placeholder: '自动' },
          { key: 'axes.x.min', label: '最小值', type: 'number', step: 1, placeholder: '自动' },
          { key: 'axes.x.max', label: '最大值', type: 'number', step: 1, placeholder: '自动' },
          { key: 'axes.x.rotate', label: '标签旋转',
            hint: '自动：标签排不下时才斜置，够宽就保持横排',
            type: 'btnrow',
            options: [{ v: 'auto', name: '自动' }, { v: 0, name: '0°' }, { v: 45, name: '45°' }, { v: 90, name: '90°' }] }
        ]
      },
      {
        group: 'Y 轴', items: [
          { key: 'axes.y.label', label: '轴标题', type: 'text', placeholder: '如 吸光度 (A₇₀₀)' },
          { key: 'axes.y.grid', label: '网格线', type: 'switch' },
          { key: 'axes.y.log', label: '对数刻度', type: 'switch' },
          { key: 'axes.y.reverse', label: '反向', type: 'switch' },
          { key: 'axes.y.ticks', label: '刻度个数', type: 'number', min: 2, max: 20, step: 1, placeholder: '自动' },
          { key: 'axes.y.min', label: '最小值', type: 'number', step: 1, placeholder: '自动' },
          { key: 'axes.y.max', label: '最大值', type: 'number', step: 1, placeholder: '自动' }
        ]
      },
      {
        group: '坐标框与刻度', items: [
          {
            key: 'axes.frame', label: '坐标框', type: 'btnrow',
            options: [{ v: 'left-bottom', name: 'L 形' }, { v: 'box', name: '全框' }, { v: 'none', name: '无' }]
          },
          { key: 'axes.spine', label: '轴线粗细', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) + ' pt' },
          { key: 'axes.tickLen', label: '刻度长度', type: 'range', min: 0, max: 8, step: 0.2, fmt: v => v.toFixed(1) + ' pt' },
          { key: 'axes.tickDir', label: '刻度方向', type: 'btnrow', options: [{ v: 'out', name: '朝外' }, { v: 'in', name: '朝内' }] }
        ]
      },
      {
        group: '图例', items: [
          { key: 'legend.show', label: '显示图例', type: 'switch' },
          {
            key: 'legend.pos', label: '位置', type: 'btnrow',
            options: [{ v: 'right', name: '右' }, { v: 'bottom', name: '下' }, { v: 'top', name: '上' }]
          },
          { key: 'legend.title', label: '图例标题', type: 'text' },
          { key: 'legend.frame', label: '加边框', type: 'switch' },
          { key: 'legend.itemGap', label: '条目间距', type: 'range', min: 0, max: 12, step: 0.5, fmt: v => v.toFixed(1) + ' px' },
          { key: 'legend.markerSize', label: '符号大小', type: 'range', min: 2, max: 12, step: 0.5, fmt: v => v.toFixed(1) + ' pt' }
        ]
      },
      {
        group: '图标题', items: titleItems()
      },
      {
        group: '网格线', items: [
          { key: 'grid.show', label: '显示网格', type: 'switch' },
          { key: 'grid.color', label: '网格颜色', type: 'color' },
          { key: 'grid.width', label: '网格粗细', type: 'range', min: 0.1, max: 2, step: 0.05, fmt: v => v.toFixed(2) + ' pt' },
          { note: '网格可通过上面 X/Y 轴各自的“网格线”开关单独控制。' }
        ]
      }
    ];
  }

  /* ───── 统计 tab ───── */
  function schemaStats(d) {
    if (!d) return [{ group: '统计', items: [{ note: '暂无数据' }] }];
    const t = chart.type(S.type);
    const out = [];
    const items = [];
    if (t.stat === true || ['bar', 'grouped-bar', 'box', 'violin'].indexOf(S.type) >= 0) {
      items.push({ key: 'stats.show', label: '图上标注显著性', type: 'switch' });
      items.push({
        key: 'stats.annot', label: '标注内容', type: 'btnrow',
        if: () => S.style.stats.show,
        options: [{ v: 'stars', name: '星号' }, { v: 'p', name: 'p 值' }, { v: 'both', name: '星号+p' }]
      });
      items.push({
        key: 'stats.annotStyle', label: '标注画法', type: 'btnrow',
        if: () => S.style.stats.show,
        options: [{ v: 'bracket', name: '括号' }, { v: 'bar', name: '横线' }, { v: 'star', name: '直接标柱顶' }]
      });
      items.push({
        key: 'stats.compare', label: '标注范围', type: 'select',
        if: () => S.style.stats.show,
        options: [
          { v: 'control', name: '每组 vs 第 1 组（对照）' },
          { v: 'adjacent', name: '仅相邻两组' },
          { v: 'all', name: '全部两两比较' }
        ]
      });
      items.push({
        key: 'stats.posthoc', label: '多重比较校正', type: 'select',
        if: () => S.style.stats.show,
        options: [
          { v: 'holm', name: 'Holm-Šidák（推荐）' },
          { v: 'bonferroni', name: 'Bonferroni' },
          { v: 'fdr', name: 'Benjamini-Hochberg (FDR)' },
          { v: 'none', name: '不校正（不推荐）' }
        ]
      });
      items.push({
        key: 'stats.view', label: '数据关系', type: 'btnrow',
        if: () => S.style.stats.show,
        options: [{ v: 'unpaired', name: '独立样本' }, { v: 'paired', name: '配对/重复测量' }]
      });
      items.push({ key: 'stats.showNS', label: '同时标出无差异(ns)', type: 'switch', if: () => S.style.stats.show });
      // 层间距只对会叠层的两种画法有意义，直接标柱顶时它完全不起作用
      items.push({
        key: 'stats.bracketStepPt', label: '括号层间距', type: 'range', min: 1, max: 8, step: 0.2,
        if: () => S.style.stats.show && S.style.stats.annotStyle !== 'star',
        fmt: v => v.toFixed(1) + ' pt'
      });
    }
    if (['line', 'scatter', 'dose', 'dual'].indexOf(S.type) >= 0) {
      items.push({
        key: 'fit.type', label: '拟合模型', type: 'select',
        options: [
          { v: 'none', name: '不拟合' },
          { v: 'linear', name: '线性回归' },
          { v: 'poly2', name: '二次多项式' },
          { v: 'poly3', name: '三次多项式' },
          { v: '4pl', name: '四参数 Logistic' },
          { v: 'sigmoid', name: 'S 型曲线' }
        ]
      });
      items.push({ key: 'marks.fit.showCI', label: '线性 95% 置信带', type: 'switch', if: () => S.style.fit.type === 'linear' });
      items.push({ key: 'marks.fit.showEq', label: '显示 EC50 参考线', type: 'switch', if: () => S.style.fit.type === '4pl' });
      items.push({ key: 'marks.fit.style', label: '拟合线型', type: 'btnrow', options: [{ v: 'solid', name: '实线' }, { v: 'dash', name: '虚线' }] });
      items.push({ key: 'marks.fit.width', label: '拟合线粗细', type: 'range', min: 0.3, max: 4, step: 0.05, fmt: v => v.toFixed(2) + ' pt' });
      items.push({ key: 'marks.fit.ciOpacity', label: '置信带浓度', type: 'range', min: 0.02, max: 0.6, step: 0.02, fmt: v => Math.round(v * 100) + '%' });
      if (S.style.fit.type === '4pl') {
        items.push({ note: '四参数 Logistic：<code>Y = Bottom + (Top−Bottom)/(1+10^((logEC50−X)·Hill))</code>。X 将自动按 log₁₀ 处理（要求全部为正）。' });
      }
    }
    out.push({ group: '统计设置', items: items });
    out.push({ group: '统计结果', items: [{ custom: () => statReportHost() }] });
    return out;
  }

  /* ───── 元素 tab ───── */
  function schemaElem(d) {
    const items = [];
    if (!S.sel) {
      items.push({
        note: '还没有选中元素。<br>1) 在画布上方切到 <b>元素选择</b>；<br>2) 点击图上任意柱子 / 点 / 线 / 文字；<br>3) 回到这里单独改它的颜色、粗细、透明度，或把它隐藏。'
      });
    } else {
      const desc = chart.describeElement(S.renderInfo && S.renderInfo.ctx, S.sel.key, S.sel.idx);
      const key = S.sel.key, idx = S.sel.idx;
      const base = S.sel;
      const override = S.style.overrides[key + '.' + idx] || {};
      items.push({
        note: '<b>已选中：</b>' + ui.esc(desc.label) +
          '<br><span style="color:#858e99">键：' + key + ' #' + (idx + 1) + '</span>'
      });
      items.push({
        custom: () => {
          const wrap = ui.h('div', '');
          wrap.style.cssText = 'display:flex;flex-direction:column;gap:7px';
          const mk = (label, node) => {
            const r = ui.h('div', 'ctrl');
            r.appendChild(ui.h('label', '', label));
            const i2 = ui.h('div', 'ctrl-in');
            i2.appendChild(node);
            r.appendChild(i2);
            wrap.appendChild(r);
          };
          const setOv = (k, v) => {
            const o = S.style.overrides[key + '.' + idx] || {};
            if (v === '' || v === null || v === undefined) delete o[k]; else o[k] = v;
            if (!Object.keys(o).length) delete S.style.overrides[key + '.' + idx];
            else S.style.overrides[key + '.' + idx] = o;
            pushHistory('元素样式');
            renderChart();
            renderPanel();
          };
          // 填充
          const fillSw = ui.h('div', 'swatch');
          const fillIn = ui.h('input', ''); fillIn.type = 'color';
          fillIn.value = override.fill || '#4e79a7';
          fillIn.addEventListener('input', () => setOv('fill', fillIn.value));
          fillSw.appendChild(fillIn);
          mk('填充色', fillSw);

          const strokeSw = ui.h('div', 'swatch');
          const strokeIn = ui.h('input', ''); strokeIn.type = 'color';
          strokeIn.value = override.stroke || '#000000';
          strokeIn.addEventListener('input', () => setOv('stroke', strokeIn.value));
          strokeSw.appendChild(strokeIn);
          mk('描边色', strokeSw);

          const wIn = ui.h('input', ''); wIn.type = 'number'; wIn.step = 0.1; wIn.min = 0; wIn.max = 20;
          wIn.value = override.strokeW === undefined ? '' : override.strokeW;
          wIn.placeholder = '默认';
          wIn.addEventListener('change', () => setOv('strokeW', wIn.value === '' ? '' : +wIn.value));
          mk('线宽 (pt)', wIn);

          const oWrap = ui.h('div', 'range-wrap');
          const oIn = ui.h('input', ''); oIn.type = 'range'; oIn.min = 0; oIn.max = 1; oIn.step = 0.05;
          oIn.value = override.opacity === undefined ? 1 : override.opacity;
          const oLab = ui.h('span', 'range-val', Math.round(oIn.value * 100) + '%');
          oIn.addEventListener('input', () => { oLab.textContent = Math.round(oIn.value * 100) + '%'; });
          oIn.addEventListener('change', () => setOv('opacity', +oIn.value));
          oWrap.appendChild(oIn); oWrap.appendChild(oLab);
          mk('不透明度', oWrap);

          const btnRow = ui.h('div', 'btnrow');
          const bAll = ui.h('button', '', '应用到同类全部');
          bAll.type = 'button';
          bAll.addEventListener('click', () => {
            const total = (S.renderInfo && S.renderInfo.index || []).filter(x => x.key === key).length;
            for (let i = 0; i < total; i++) {
              const o = Object.assign({}, S.style.overrides[key + '.' + i] || {}, override);
              S.style.overrides[key + '.' + i] = o;
            }
            pushHistory('批量元素样式');
            renderChart(); renderPanel();
            ui.toast('已应用到同类 ' + total + ' 个元素');
          });
          btnRow.appendChild(bAll);
          mk('', btnRow);

          const clear = ui.h('button', 'btn btn-sm btn-block', '清除该元素的定制样式');
          clear.addEventListener('click', () => {
            delete S.style.overrides[key + '.' + idx];
            pushHistory('清除元素样式');
            renderChart(); renderPanel();
          });
          wrap.appendChild(clear);
          return wrap;
        }
      });
    }
    // 已定制的元素列表
    const ovKeys = Object.keys(S.style.overrides || {});
    if (ovKeys.length) {
      items.push({ note: '<b>已定制 ' + ovKeys.length + ' 个元素</b>' });
      items.push({
        custom: () => {
          const list = ui.h('div', 'elem-list');
          ovKeys.forEach(k => {
            const o = S.style.overrides[k];
            const [kk, ii] = k.split('.');
            const row = ui.h('div', 'elem-item' + (S.sel && S.sel.key === kk && S.sel.idx == ii ? ' sel' : ''));
            const sw = ui.h('span', 'sw');
            sw.style.background = o.fill || o.stroke || '#999';
            row.appendChild(sw);
            const d2 = chart.describeElement(S.renderInfo && S.renderInfo.ctx, kk, +ii);
            row.appendChild(ui.h('span', 'nm', d2.name + ' #' + (+ii + 1)));
            const del = ui.h('span', 'del', '×');
            del.addEventListener('click', (e) => {
              e.stopPropagation();
              delete S.style.overrides[k];
              pushHistory('清除元素样式');
              renderChart(); renderPanel();
            });
            row.appendChild(del);
            row.addEventListener('click', () => {
              S.sel = { key: kk, idx: +ii };
              S.mode = 'pick';
              $('stage-mode').querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x.dataset.mode === 'pick'));
              clearHighlight(); applyHighlight();
              renderPanel();
            });
            list.appendChild(row);
          });
          return list;
        }
      });
    }
    // 自定义标注
    const annots = S.style.annots || [];
    items.push({ note: '<b>自定义标注</b>（文字 / 线段 / 箭头 / 方框）' });
    items.push({
      custom: () => {
        const wrap = ui.h('div', 'elem-list');
        if (!annots.length) wrap.appendChild(ui.h('div', 'note-card', '还没有标注。点画布上方的「+ 标注」添加。'));
        annots.forEach(a => {
          const row = ui.h('div', 'elem-item');
          row.appendChild(ui.h('span', 'sw', ''));
          row.appendChild(ui.h('span', 'nm', (a.type === 'text' ? '文字' : a.type === 'line' ? '线段' : a.type === 'arrow' ? '箭头' : '方框') + '：' + (a.text || '')));
          const del = ui.h('span', 'del', '×');
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            S.style.annots = annots.filter(x => x.id !== a.id);
            pushHistory('删除标注');
            renderChart(); renderPanel();
          });
          row.appendChild(del);
          row.addEventListener('click', () => {
            S.sel = { key: 'annot', idx: a.id };
            renderPanel();
          });
          wrap.appendChild(row);
        });
        return wrap;
      }
    });
    return [{ group: '元素编辑', items: items }];
  }

  /* ════════════ 统计报告 ════════════ */
  let statHostCache = null;
  function statReportHost() {
    if (!statHostCache) {
      statHostCache = ui.h('div', '');
      statHostCache.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    }
    return statHostCache;
  }

  function renderPanelStats(res) {
    const host = statHostCache;
    if (!host) return;
    host.innerHTML = '';
    const d = ds();
    if (!d) return;
    if (activeTab !== 'stats') return;

    const long = data.flatten(d);
    if (!long.length) { host.appendChild(ui.h('div', 'note-card', '数据不足')); return; }

    const km = d.kind === 'combined' ? '—' : d.kind;

    /* ── 描述统计 ── */
    if (['column', 'grouped', 'xy'].indexOf(d.kind) >= 0 && ctx_hasGroups(d)) {
      const gs = data.groups(d, long);
      const head = ['组', 'n', '均值', 'SD', 'SEM', '95% CI'];
      const rows = gs.map(g => {
        const s = stats.describe(g.values);
        const ci = stats.ci95(g.values);
        return [
          { text: g.name, cls: '' },
          String(s.n),
          { text: stats.fmt(s.mean, 4), cls: 'num' },
          { text: stats.fmt(s.sd, 3), cls: 'num' },
          { text: stats.fmt(s.sem, 3), cls: 'num' },
          { text: (isFinite(ci.lo) ? stats.fmt(ci.lo, 4) + ' ~ ' + stats.fmt(ci.hi, 4) : '—'), cls: 'num' }
        ];
      });
      const card = ui.h('div', '');
      card.appendChild(ui.h('div', 'pm-title', '描述统计'));
      card.appendChild(ui.statTable(head, rows));

      // 正态性 + 方差齐性
      const nr = stats.normality(gs[0].values);
      const lev = stats.levene(gs.map(g => g.values));
      const info = ui.h('div', 'note-card');
      info.style.marginTop = '6px';
      info.innerHTML =
        '正态性（D\'Agostino，首组）：' + (nr.ok
          ? 'K² = ' + stats.fmt(nr.K2, 3) + '，p = ' + stats.fmtP(nr.p) + ' → ' + (nr.normal ? '<b>符合正态</b>' : '<b>偏离正态</b>，建议用非参数检验')
          : nr.msg) +
        '<br>方差齐性（Levene）：' + (lev.ok
          ? 'F = ' + stats.fmt(lev.F, 3) + '，p = ' + stats.fmtP(lev.p) + ' → ' + (lev.equal ? '<b>方差齐</b>' : '<b>方差不齐</b>，建议 Welch 校正')
          : lev.msg);
      card.appendChild(info);
      host.appendChild(card);
    }

    /* ── 主检验 ── */
    const test = data.suggestTest(d);
    const gs = data.groups(d, long);
    const tcard = ui.h('div', '');
    tcard.appendChild(ui.h('div', 'pm-title', '统计检验'));
    const body = ui.h('div', '');

    if (d.kind === 'survival') {
      if (res && res.logrank) {
        const lr = res.logrank;
        body.appendChild(ui.statTable(['项目', '值'], [
          ['检验方法', 'log-rank (Mantel-Cox)'],
          ['χ²', { text: stats.fmt(lr.chi2, 4), cls: 'num' }],
          ['自由度', { text: String(lr.df), cls: 'num' }],
          ['p 值', { text: stats.fmtP(lr.p), cls: 'num' }],
          ['结论', { html: lr.p < 0.05 ? '<span class="pill sig">组间差异显著</span>' : '<span class="pill ns">无显著差异</span>' }]
        ]));
        if (res.hr) {
          body.appendChild(ui.statTable([], [
            ['风险比 HR', { text: stats.fmt(res.hr.HR, 4), cls: 'num' }],
            ['HR 95% CI', { text: stats.fmt(res.hr.ci[0], 3) + ' ~ ' + stats.fmt(res.hr.ci[1], 3), cls: 'num' }]
          ]));
        }
        const kmres = res.km || [];
        body.appendChild(ui.statTable(['组', 'n', '中位生存期'], kmres.map(k => [
          k.group, String(k.n), k.median === null ? '未达到' : String(k.median)
        ])));
      } else {
        body.appendChild(ui.h('div', 'note-card', '无法计算 log-rank，请检查事件列是否为 0/1。'));
      }
    } else if (test === 'ttest') {
      const view = S.style.stats.view === 'paired' ? 'paired' : 'unpaired';
      const r = view === 'paired'
        ? stats.ttestPaired(gs[0].values, gs[1].values)
        : stats.ttestUnpaired(gs[0].values, gs[1].values, S.style.stats.welch !== false);
      if (r.ok) {
        const rows = [
          ['检验方法', r.test],
          ['t', { text: stats.fmt(r.t, 4), cls: 'num' }],
          ['自由度 df', { text: stats.fmt(r.df, 3), cls: 'num' }],
          ['p 值', { text: stats.fmtP(r.p), cls: 'num' }],
          ['组 1 均值', { text: stats.fmt(r.m1, 4), cls: 'num' }],
          ['组 2 均值', { text: stats.fmt(r.m2, 4), cls: 'num' }],
          ['均值差', { text: stats.fmt(r.diff, 4), cls: 'num' }],
          ['差值 95% CI', { text: stats.fmt(r.ciLo, 3) + ' ~ ' + stats.fmt(r.ciHi, 3), cls: 'num' }],
          ['效应量 Cohen\'s d', { text: stats.fmt(r.cohensD, 3), cls: 'num' }],
          ['结论', { html: r.p < 0.05 ? '<span class="pill sig">差异显著</span>' : '<span class="pill ns">差异不显著</span>' }]
        ];
        body.appendChild(ui.statTable(['项目', '值'], rows));
        const mwu = stats.mannWhitney(gs[0].values, gs[1].values);
        if (mwu.ok) {
          body.appendChild(ui.h('div', 'note-card',
            '非参数对照 — Mann-Whitney U：U = ' + stats.fmt(mwu.U, 3) +
            '，z = ' + stats.fmt(mwu.z, 3) + '，p = ' + stats.fmtP(mwu.p)));
        }
      } else body.appendChild(ui.h('div', 'note-card', r.msg));
    } else if (test === 'anova') {
      const view = S.style.stats.view === 'paired' ? 'paired' : 'unpaired';
      const arrs = gs.map(g => g.values), names = gs.map(g => g.name);
      const r = view === 'paired' && gs.every(g => g.values.length === gs[0].values.length)
        ? stats.rmAnova(arrs, names) : stats.anova(arrs, names);
      if (r.ok) {
        body.appendChild(ui.statTable(['项目', '值'], [
          ['检验方法', r.test || 'One-way ANOVA'],
          ['F', { text: stats.fmt(r.F, 4), cls: 'num' }],
          ['自由度', { text: r.df1 + ', ' + r.df2, cls: 'num' }],
          ['p 值', { text: stats.fmtP(r.p), cls: 'num' }],
          ['组间平方和 SSB', { text: stats.fmt(r.ssb || r.ssCond, 4), cls: 'num' }],
          ['组内平方和 SSW', { text: stats.fmt(r.ssw || r.ssErr, 4), cls: 'num' }],
          ['效应量 η²', { text: stats.fmt(r.eta2 !== undefined ? r.eta2 : r.partialEta2, 3), cls: 'num' }],
          ['结论', { html: r.p < 0.05 ? '<span class="pill sig">组间差异显著</span>' : '<span class="pill ns">无显著差异</span>' }]
        ]));
        const ph = stats.posthoc(arrs, names, {
          method: S.style.stats.posthoc, view, welch: S.style.stats.welch !== false
        });
        if (ph.ok) {
          body.appendChild(ui.h('div', 'pm-title', '两两比较（' +
            { holm: 'Holm-Šidák', bonferroni: 'Bonferroni', fdr: 'FDR', none: '未校正' }[ph.method] + '）'));
          body.appendChild(ui.statTable(['比较', '均值差', '校正后 p', '显著性'], ph.comparisons.map(c => [
            c.a + ' vs ' + c.b,
            { text: stats.fmt(c.diff, 4), cls: 'num' },
            { text: stats.fmtP(c.pAdj), cls: 'num' },
            { html: '<span class="pill ' + (c.sig ? 'sig' : 'ns') + '">' + c.stars + '</span>' }
          ])));
        }
      } else body.appendChild(ui.h('div', 'note-card', r.msg));
    } else if (test === 'regression' || ['line', 'scatter', 'dose', 'dual'].indexOf(S.type) >= 0) {
      const fits = (res && res.fits) || [];
      if (!fits.length) {
        body.appendChild(ui.h('div', 'note-card', '当前未启用拟合。在「统计」里选择拟合模型后这里会给出参数与优度。'));
      }
      fits.forEach(f => {
        const blk = ui.h('div', '');
        blk.appendChild(ui.h('div', 'pm-title', f.series || ''));
        if (f.type === 'linear' || (f.slope !== undefined && f.intercept !== undefined)) {
          blk.appendChild(ui.statTable(['项目', '值'], [
            ['模型', 'y = a + b·x'],
            ['斜率 b', { text: stats.fmt(f.slope, 5), cls: 'num' }],
            ['斜率 SE', { text: stats.fmt(f.seSlope, 4), cls: 'num' }],
            ['斜率 95% CI', { text: stats.fmt(f.slopeCI[0], 4) + ' ~ ' + stats.fmt(f.slopeCI[1], 4), cls: 'num' }],
            ['截距 a', { text: stats.fmt(f.intercept, 5), cls: 'num' }],
            ['斜率 p 值', { text: stats.fmtP(f.pSlope), cls: 'num' }],
            ['R²', { text: stats.fmt(f.r2, 5), cls: 'num' }],
            ['调整 R²', { text: stats.fmt(f.adjR2, 5), cls: 'num' }],
            ['n / df', { text: f.n + ' / ' + f.df, cls: 'num' }]
          ]));
          blk.appendChild(ui.h('div', 'note-card', '方程：y = ' + stats.fmt(f.intercept, 5) + ' + ' + stats.fmt(f.slope, 5) + '·x'));
        } else if (f.model === 'four-parameter logistic' || f.EC50 !== undefined) {
          blk.appendChild(ui.statTable(['参数', '估计值', '标准误'], [
            ['Top', { text: stats.fmt(f.Top, 5), cls: 'num' }, { text: stats.fmt(f.seTop, 4), cls: 'num' }],
            ['Bottom', { text: stats.fmt(f.Bottom, 5), cls: 'num' }, { text: stats.fmt(f.seBottom, 4), cls: 'num' }],
            ['logEC50', { text: stats.fmt(f.logEC50, 5), cls: 'num' }, { text: stats.fmt(f.seLogEC50, 4), cls: 'num' }],
            ['EC50', { text: stats.fmt(f.EC50, 5), cls: 'num' }, { text: '—', cls: 'num' }],
            ['HillSlope', { text: stats.fmt(f.HillSlope, 4), cls: 'num' }, { text: stats.fmt(f.seHill, 4), cls: 'num' }]
          ]));
          blk.appendChild(ui.h('div', 'note-card',
            'EC50 = <b>' + stats.fmt(f.EC50, 5) + '</b>（95% CI ' + stats.fmt(f.ec50CI[0], 4) + ' ~ ' + stats.fmt(f.ec50CI[1], 4) + '）<br>' +
            'R² = ' + stats.fmt(f.r2, 5) + '　斜率方向：' + f.hillSign + '　n = ' + f.n));
        } else if (f.model === 'sigmoid') {
          blk.appendChild(ui.statTable(['参数', '估计值'], [
            ['Top', { text: stats.fmt(f.Top, 5), cls: 'num' }],
            ['Bottom', { text: stats.fmt(f.Bottom, 5), cls: 'num' }],
            ['x₀ (中点)', { text: stats.fmt(f.x0, 5), cls: 'num' }],
            ['斜率 k', { text: stats.fmt(f.k, 4), cls: 'num' }],
            ['R²', { text: stats.fmt(f.r2, 5), cls: 'num' }]
          ]));
        } else if (f.order) {
          blk.appendChild(ui.statTable(['项', '系数'], f.coef.map((c, i) => [
            'x^' + i, { text: stats.fmt(c, 5), cls: 'num' }
          ]).concat([['R²', { text: stats.fmt(f.r2, 5), cls: 'num' }]])));
        }
        body.appendChild(blk);
      });
    }
    if (['line', 'scatter', 'dose', 'dual'].indexOf(S.type) >= 0 && ctx_hasGroups(d)) {
      const gs2 = data.groups(d, long);
      if (gs2.length) {
        body.appendChild(ui.h('div', 'pm-title', '序列描述统计'));
        body.appendChild(ui.statTable(['序列', 'n', '均值', 'SD', 'SEM', '最小', '最大'],
          gs2.map(g => {
            const s = stats.describe(g.values);
            return [g.name, String(s.n),
              { text: stats.fmt(s.mean, 4), cls: 'num' },
              { text: stats.fmt(s.sd, 3), cls: 'num' },
              { text: stats.fmt(s.sem, 3), cls: 'num' },
              { text: stats.fmt(s.min, 4), cls: 'num' },
              { text: stats.fmt(s.max, 4), cls: 'num' }];
          })));
      }
    }
    if (S.type === 'roc') {
      const rocs = (res && res.rocs) || [];
      if (rocs.length) {
        const r = rocs[0];
        body.appendChild(ui.statTable(['项目', '值'], [
          ['AUC', { text: stats.fmt(r.auc, 5), cls: 'num' }],
          ['AUC 95% CI', { text: stats.fmt(r.ci[0], 4) + ' ~ ' + stats.fmt(r.ci[1], 4), cls: 'num' }],
          ['标准误', { text: stats.fmt(r.se, 4), cls: 'num' }],
          ['p（vs AUC=0.5）', { text: stats.fmtP(r.p), cls: 'num' }],
          ['阳性 / 阴性 n', { text: r.nPos + ' / ' + r.nNeg, cls: 'num' }],
          ['最佳截断值', { text: stats.fmt(r.bestCutoff, 4), cls: 'num' }],
          ['该点敏感度', { text: stats.fmt(r.bestSens, 3), cls: 'num' }],
          ['该点特异度', { text: stats.fmt(r.bestSpec, 3), cls: 'num' }]
        ]));
      } else if (res && res.ctx && res.ctx._rocErr) {
        body.appendChild(ui.h('div', 'note-card', 'ROC 无法计算：' + res.ctx._rocErr));
      }
    }
    tcard.appendChild(body);
    host.appendChild(tcard);

    /* ── 导出统计结果 ── */
    const exp = ui.h('button', 'btn btn-sm btn-block', '把统计结果导出为 CSV');
    exp.addEventListener('click', () => exportStatCSV());
    host.appendChild(exp);
  }

  function ctx_hasGroups(d) {
    return ['column', 'grouped', 'xy', 'survival'].indexOf(d.kind) >= 0;
  }

  function exportStatCSV() {
    const d = ds();
    if (!d) return;
    const long = data.flatten(d);
    const gs = data.groups(d, long);
    const rows = [['组', 'n', '均值', 'SD', 'SEM', '95%CI低', '95%CI高', '中位数', 'Q1', 'Q3']];
    gs.forEach(g => {
      const s = stats.describe(g.values);
      const ci = stats.ci95(g.values);
      rows.push([g.name, s.n, s.mean, s.sd, s.sem, ci.lo, ci.hi, s.median, s.q1, s.q3]);
    });
    const test = data.suggestTest(d);
    if (test === 'ttest' && gs.length === 2) {
      const r = stats.ttestUnpaired(gs[0].values, gs[1].values, true);
      if (r.ok) rows.push([], ['检验', r.test], ['t', r.t], ['df', r.df], ['p', r.p], ['均值差', r.diff],
        ['CI低', r.ciLo], ['CI高', r.ciHi], ["Cohen's d", r.cohensD]);
    } else if (test === 'anova' && gs.length > 2) {
      const r = stats.anova(gs.map(g => g.values), gs.map(g => g.name));
      if (r.ok) {
        rows.push([], ['检验', 'One-way ANOVA'], ['F', r.F], ['df1', r.df1], ['df2', r.df2], ['p', r.p], ['eta2', r.eta2]);
        const ph = stats.posthoc(gs.map(g => g.values), gs.map(g => g.name), { method: S.style.stats.posthoc });
        if (ph.ok) {
          rows.push([], ['比较 A', '比较 B', '均值差', 'p(校正)', '显著性']);
          ph.comparisons.forEach(c => rows.push([c.a, c.b, c.diff, c.pAdj, c.stars]));
        }
      }
    }
    exporter.exportStatsCSV(rows, (d.name || 'statistics') + '_统计结果');
    ui.toast('统计结果已导出', 'ok');
  }

  /* ════════════ 标注 ════════════ */
  function addAnnotation() {
    const res = S.renderInfo;
    if (!res) { ui.toast('请先渲染图表', 'err'); return; }
    const g = res.geom;
    // 默认放在绘图区左上角
    const dx = g.xDom && g.xDom[0] !== undefined ? g.xDom[0] : 0;
    const dy = g.yMax !== undefined ? g.yMax - (g.yMax - g.yMin) * 0.12 : 0;
    ui.modal({
      title: '添加标注',
      build(b) {
        const typeRow = ui.h('div', 'field-row');
        typeRow.appendChild(ui.h('label', '', '类型'));
        const sel = ui.h('select', 'mini-select');
        [['text', '文字'], ['arrow', '箭头'], ['line', '线段'], ['rect', '方框']].forEach(t => {
          const o = ui.h('option', '', t[1]); o.value = t[0]; sel.appendChild(o);
        });
        typeRow.appendChild(sel);
        b.appendChild(typeRow);

        const txtRow = ui.h('div', 'field-row');
        txtRow.appendChild(ui.h('label', '', '文字内容'));
        const txt = ui.h('input', ''); txt.type = 'text'; txt.value = '**'; txt.placeholder = '如 ** 或 p < 0.01';
        txtRow.appendChild(txt);
        b.appendChild(txtRow);

        const note = ui.h('div', 'note-card',
          '坐标使用<b>数据坐标</b>：X 填轴上的数值（分类轴可填组名），Y 填纵轴数值。' +
          '文字标注用 x1/y1；线段与箭头需要 x1,y1 → x2,y2。' +
          (g.bandNames
            ? '<br>当前 X 是分类轴，可用组名：<b>' + g.bandNames.join('、') +
              '</b>（也可只写前面的数字，如 <b>5</b> 或 <b>5%</b>）。'
            : ''));
        b.appendChild(note);

        const coords = [['x1', dx], ['y1', dy], ['x2', dx + (g.xDom ? (g.xDom[1] - g.xDom[0]) * 0.2 : 1)], ['y2', dy]];
        const inputs = {}, hints = {};
        const cw = ui.h('div', '');
        cw.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px 12px';
        [['x1', '起点 X'], ['y1', '起点 Y'], ['x2', '终点 X'], ['y2', '终点 Y']].forEach(([k, lab]) => {
          const r = ui.h('div', 'field-row');
          r.appendChild(ui.h('label', '', lab));
          const i2 = ui.h('input', ''); i2.type = 'text';
          i2.value = String(coords.find(c => c[0] === k)[1]);
          i2.dataset.k = k;
          if (g.bandNames && (k === 'x1' || k === 'x2')) {
            const hn = ui.h('span', 'field-hint', '');
            hn.style.cssText = 'font-size:11px;opacity:.7';
            hints[k] = hn;
            const upd = () => { hn.textContent = describeCoord(g, i2.value, 'x'); };
            i2.addEventListener('input', upd);
            r.appendChild(i2); r.appendChild(hn);
            setTimeout(upd, 0);
          } else {
            r.appendChild(i2);
          }
          inputs[k] = i2;
          cw.appendChild(r);
        });
        b.appendChild(cw);

        const sizeRow = ui.h('div', 'field-row');
        sizeRow.appendChild(ui.h('label', '', '字号 (pt)'));
        const sz = ui.h('input', ''); sz.type = 'number'; sz.value = S.style.font.tick * 1.05; sz.step = 0.5;
        sizeRow.appendChild(sz);
        b.appendChild(sizeRow);
        const colRow = ui.h('div', 'field-row');
        colRow.appendChild(ui.h('label', '', '颜色'));
        const col = ui.h('input', ''); col.type = 'color'; col.value = S.style.font.color;
        colRow.appendChild(col);
        b.appendChild(colRow);

        b._form = { sel, txt, inputs, sz, col };
      },
      buttons: [
        { label: '取消' },
        {
          label: '添加', primary: true,
          onClick: (body) => {
            const f = body._form;
            const type = f.sel.value;
            // 分类轴上填了认不出来的组名就别放进去 —— 否则标注会静默落到左边缘，
            // 用户还以为放对了位置。
            if (g.bandNames) {
              const bad = ['x1', 'x2'].filter(k => {
                const raw = String(f.inputs[k].value).trim();
                return raw !== '' && !data.isNum(raw) && g.xIndex(raw) < 0;
              });
              if (bad.length) {
                ui.toast('X 坐标「' + String(f.inputs[bad[0]].value).trim() +
                  '」不是有效组名。可选：' + g.bandNames.join(' / '), 'err', 4500);
                return false;   // 保持弹窗打开，方便改
              }
            }
            const a = {
              id: 'a' + Date.now().toString(36),
              type,
              x1: parseCoord(f.inputs.x1.value),
              y1: parseCoord(f.inputs.y1.value),
              x2: parseCoord(f.inputs.x2.value),
              y2: parseCoord(f.inputs.y2.value),
              text: f.txt.value,
              size: +f.sz.value || 7,
              color: f.col.value
            };
            S.style.annots.push(a);
            pushHistory('添加标注');
            renderChart();
            const at = g.bandNames ? describeCoord(g, a.x1, 'x') : '';
            ui.toast('已添加标注' + (at ? '（X ' + at + '）' : '') + '，可在「元素」里继续调整');
          }
        }
      ]
    });
  }
  /**
   * 标注坐标解析。数值原样返回；非数字原样返回字符串，
   * 交给 chart.bandIndexOf 去匹配组名（"150 mg/L" / "150" / "处理组" 都能认）。
   * 原来把组名转成组序号再传下去，而分类轴是拿组名匹配的 —— 必然匹配失败，
   * 标注会静默落到绘图区左边缘。
   */
  function parseCoord(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return 0;
    if (data.isNum(s)) return +s;
    return s;
  }

  /** 把用户填的坐标回显成「实际落点」，顺便做一次校验 */
  function describeCoord(geom, v, axis) {
    if (!geom) return '';
    if (axis === 'x' && geom.bandNames) {
      const i = geom.xIndex(v);
      return i >= 0 ? '→ ' + geom.bandNames[i] : '';
    }
    return '';
  }

  /* ════════════ 导出对话框 ════════════ */
  function exportDialog() {
    const res = S.renderInfo;
    if (!res) { ui.toast('请先渲染图表', 'err'); return; }
    const form = { fmt: 'svg', dpi: 600, bg: 'white', name: (ds() ? ds().name : 'figure') };
    ui.modal({
      title: '导出图表',
      build(b) {
        const info = ui.h('div', 'note-card');
        info.innerHTML = '当前画布 <b>' + S.style.size.w + ' × ' + S.style.size.h + ' mm</b>' +
          '（' + Math.round(S.style.size.w * S.style.size.h / 645.16 * 10) / 10 + ' inch²，' +
          '约 ' + Math.round(S.style.size.w / 25.4 * 100) / 100 + ' × ' + Math.round(S.style.size.h / 25.4 * 100) / 100 + ' 英寸）。';
        b.appendChild(info);

        const r1 = ui.h('div', 'field-row');
        r1.appendChild(ui.h('label', '', '文件名'));
        const nameIn = ui.h('input', ''); nameIn.type = 'text'; nameIn.value = form.name;
        nameIn.addEventListener('input', () => { form.name = nameIn.value; });
        r1.appendChild(nameIn);
        b.appendChild(r1);

        const r2 = ui.h('div', 'field-row');
        r2.appendChild(ui.h('label', '', '格式'));
        const fmts = ui.h('div', 'btnrow');
        [['svg', 'SVG 矢量'], ['png', 'PNG 位图'], ['pdf', 'PDF 矢量']].forEach(([v, n]) => {
          const btn = ui.h('button', form.fmt === v ? 'on' : '', n);
          btn.type = 'button';
          btn.addEventListener('click', () => {
            fmts.querySelectorAll('button').forEach(x => x.classList.remove('on'));
            btn.classList.add('on');
            form.fmt = v;
          });
          fmts.appendChild(btn);
        });
        r2.appendChild(fmts);
        b.appendChild(r2);

        const r3 = ui.h('div', 'field-row');
        r3.appendChild(ui.h('label', '', '分辨率'));
        const dpis = ui.h('div', 'btnrow');
        [300, 600, 1200].forEach(v => {
          const btn = ui.h('button', form.dpi === v ? 'on' : '', v + ' dpi');
          btn.type = 'button';
          btn.addEventListener('click', () => {
            dpis.querySelectorAll('button').forEach(x => x.classList.remove('on'));
            btn.classList.add('on');
            form.dpi = v;
          });
          dpis.appendChild(btn);
        });
        r3.appendChild(dpis);
        b.appendChild(r3);
        const dpiNote = ui.h('div', 'note-card');
        const upd = () => {
          const wpx = Math.round(presets.mm2px(S.style.size.w) * form.dpi / 96);
          const hpx = Math.round(presets.mm2px(S.style.size.h) * form.dpi / 96);
          dpiNote.innerHTML = '输出像素：<b>' + wpx + ' × ' + hpx + '</b> px　　满足 ≥300 dpi 的期刊投稿要求：' +
            (form.dpi >= 300 ? '<b style="color:#1f8a5f">是</b>' : '否');
        };
        upd();
        dpis.addEventListener('click', upd);
        b.appendChild(dpiNote);

        const r4 = ui.h('div', 'field-row');
        r4.appendChild(ui.h('label', '', '背景'));
        const bgs = ui.h('div', 'btnrow');
        [['white', '白底'], ['transparent', '透明']].forEach(([v, n]) => {
          const btn = ui.h('button', form.bg === v ? 'on' : '', n);
          btn.type = 'button';
          btn.addEventListener('click', () => {
            bgs.querySelectorAll('button').forEach(x => x.classList.remove('on'));
            btn.classList.add('on');
            form.bg = v;
          });
          bgs.appendChild(btn);
        });
        r4.appendChild(bgs);
        b.appendChild(r4);

        b.appendChild(ui.h('div', 'note-card',
          '<b>选哪种格式？</b><br>' +
          '· <b>SVG</b>：真矢量，文字仍是文字，可在 AI / Inkscape / Origin 里继续编辑 —— 投稿首选；<br>' +
          '· <b>PDF</b>：真矢量，尺寸精确到毫米，会调起系统打印面板，选“另存为 PDF”；<br>' +
          '· <b>PNG</b>：位图，适合 PPT、Word 与网页，600 dpi 以上即可印刷；<br>' +
          '· 需要 EPS / TIFF：先导 SVG，再用 Inkscape / ImageJ 转一次，无损。'));
      },
      buttons: [
        {
          label: '复制到剪贴板', onClick: () => {
            exporter.copyPNG(res.svg, S.style, 300, form.bg === 'white' ? '#ffffff' : 'transparent')
              .then(() => ui.toast('已复制 PNG 到剪贴板，可直接粘贴到 Word / PPT', 'ok'))
              .catch(e => ui.toast(e.message, 'err'));
          }
        },
        {
          label: '导出', primary: true, onClick: () => {
            try {
              if (form.fmt === 'svg') {
                const r = exporter.exportSVG(res.svg, S.style, form.name);
                ui.toast('SVG 已导出（' + Math.round(r.bytes / 1024) + ' KB，矢量可编辑）', 'ok');
              } else if (form.fmt === 'png') {
                exporter.exportPNG(res.svg, S.style, form.dpi, form.name,
                  form.bg === 'white' ? '#ffffff' : 'transparent')
                  .then(r => ui.toast('PNG 已导出：' + r.w + ' × ' + r.h + ' px', 'ok'))
                  .catch(e => ui.toast(e.message, 'err'));
              } else {
                exporter.exportPDF(res.svg, S.style, form.name);
                ui.toast('已打开打印面板 —— 目标选“另存为 PDF”，缩放保持 100%', 'ok', 4200);
              }
            } catch (e) { ui.toast('导出失败：' + e.message, 'err'); }
          }
        }
      ]
    });
  }

  /* ════════════ 画布交互 ════════════ */
  function initCanvas() {
    const host = $('chart-host');
    let hoverTag = null;

    host.addEventListener('click', (e) => {
      // 点画布上的标题文字 → 直接开标题编辑（两种模式都生效）
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-figtitle')) {
        titleDialog();
        return;
      }
      if (S.mode !== 'pick') return;
      const n = e.target.closest('[data-oi]');
      if (!n) {
        S.sel = null;
        clearHighlight();
        switchTab('elem');
        renderPanel();
        return;
      }
      S.sel = { key: n.getAttribute('data-oikey'), idx: +n.getAttribute('data-oiidx') };
      clearHighlight();
      n.classList.add('oi-hl');
      switchTab('elem');
      renderPanel();
      const desc = chart.describeElement(S.renderInfo && S.renderInfo.ctx, S.sel.key, S.sel.idx);
      setStatus('已选中 ' + desc.label);
    });

    host.addEventListener('mousemove', (e) => {
      if (S.mode !== 'pick') {
        if (hoverTag) { hoverTag.remove(); hoverTag = null; }
        return;
      }
      const n = e.target.closest('[data-oi]');
      if (!n) {
        if (hoverTag) { hoverTag.remove(); hoverTag = null; }
        return;
      }
      const key = n.getAttribute('data-oikey'), idx = +n.getAttribute('data-oiidx');
      if (hoverTag && hoverTag.dataset.k === key + idx) {
        positionTag(hoverTag, n);
        return;
      }
      if (hoverTag) hoverTag.remove();
      const desc = chart.describeElement(S.renderInfo && S.renderInfo.ctx, key, idx);
      hoverTag = ui.h('div', 'hover-tag', desc.label);
      hoverTag.dataset.k = key + idx;
      $('overlay-host').appendChild(hoverTag);
      positionTag(hoverTag, n);
    });
    host.addEventListener('mouseleave', () => { if (hoverTag) { hoverTag.remove(); hoverTag = null; } });

    function positionTag(tag, node) {
      const paperRect = $('paper').getBoundingClientRect();
      const r = node.getBoundingClientRect();
      const z = S.zoom || 1;
      tag.style.left = ((r.left + r.width / 2 - paperRect.left) / z) + 'px';
      tag.style.top = ((r.top - paperRect.top) / z) + 'px';
    }
  }
  function switchTab(tab) {
    activeTab = tab;
    $('right-tabs').querySelectorAll('.ptab').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  }

  /* ════════════ 快捷键 ════════════ */
  /* ════════════ 面板宽度拖拽 ════════════ */
  /**
   * 左右两栏拖拽调宽。宽度通过 CSS 变量喂给栅格，记住到 localStorage。
   * 拖动时只改 transform 缩放（fitZoom 不重绘图表），所以每帧跟着走也不卡。
   */
  function initResize() {
    const shell = document.querySelector('.shell');
    const KEY = 'figforge.panelW';
    const LIMIT = { left: [216, 620], right: [248, 680] };
    const VAR = { left: '--left-w', right: '--right-w' };
    const NAME = { left: '数据表', right: '属性面板' };

    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    ['left', 'right'].forEach(s => {
      if (+saved[s] > 0) shell.style.setProperty(VAR[s], +saved[s] + 'px');
    });
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

    document.querySelectorAll('.col-resize').forEach(h => {
      const side = h.dataset.resize;
      const panel = $(side === 'left' ? 'panel-left' : 'panel-right');
      let drag = null;

      h.addEventListener('pointerdown', (e) => {
        if (isNarrow()) return;                    // 抽屉模式下宽度由断点决定
        drag = { x: e.clientX, w: panel.getBoundingClientRect().width };
        // 捕获失败不能影响拖拽本身（指针已失效 / 合成事件没有活动指针）
        try { h.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        h.classList.add('on');
        document.body.classList.add('resizing-x');
        e.preventDefault();
      });

      h.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const lim = LIMIT[side];
        const w = Math.round(Math.max(lim[0], Math.min(lim[1], drag.w + (side === 'left' ? dx : -dx))));
        shell.style.setProperty(VAR[side], w + 'px');
        saved[side] = w;
        if (S.autoFit) fitZoom();
      });

      const end = (e) => {
        if (!drag) return;
        drag = null;
        h.classList.remove('on');
        document.body.classList.remove('resizing-x');
        if (e && e.pointerId !== undefined && h.hasPointerCapture && h.hasPointerCapture(e.pointerId)) {
          h.releasePointerCapture(e.pointerId);
        }
        persist();
        if (S.autoFit) fitZoom();
      };
      h.addEventListener('pointerup', end);
      h.addEventListener('pointercancel', end);

      h.addEventListener('dblclick', () => {
        shell.style.removeProperty(VAR[side]);
        delete saved[side];
        persist();
        if (S.autoFit) fitZoom();
        ui.toast(NAME[side] + '宽度已复位');
      });
    });
  }

  /* ════════════ 窄屏抽屉（≤1023px） ════════════ */
  /**
   * 宽屏是「数据表 | 画布 | 属性」三栏；窄屏（平板/手机）装不下，
   * 就把两侧面板变成抽屉，用工具栏左端两个按钮拉起。
   * 抽屉是固定定位的浮层，不参与栅格，所以开合不会重排画布；
   * 真正需要重算缩放的只有跨越断点那一次，交给已有的 resize 监听。
   */
  const isNarrow = () => window.matchMedia('(max-width:1023px)').matches;
  const drawerOpen = () => document.body.classList.contains('dw-left') ||
    document.body.classList.contains('dw-right');

  function closeDrawers() {
    if (!drawerOpen()) return;            // 幂等：resize 里会调它，写死循环就死在这
    document.body.classList.remove('dw-left', 'dw-right');
    $('drawer-scrim').hidden = true;
  }
  /** 确保某侧抽屉是打开的。别用 toggle —— 已经开着时再 toggle 会把它关掉，
   *  「点标题跳到属性面板」这种场景必须保证面板一定在。 */
  function openDrawer(side) {
    if (document.body.classList.contains('dw-' + side)) { $('drawer-scrim').hidden = false; return; }
    document.body.classList.remove('dw-left', 'dw-right');
    document.body.classList.add('dw-' + side);
    $('drawer-scrim').hidden = false;
    if (ui.closePopmenu) ui.closePopmenu();
  }
  function toggleDrawer(side) {
    if (document.body.classList.contains('dw-' + side)) { closeDrawers(); return; }
    openDrawer(side);
  }

  function initResponsive() {
    $('btn-view-left').addEventListener('click', () => toggleDrawer('left'));
    $('btn-view-right').addEventListener('click', () => toggleDrawer('right'));
    $('btn-close-left').addEventListener('click', closeDrawers);
    $('btn-close-right').addEventListener('click', closeDrawers);
    $('drawer-scrim').addEventListener('click', closeDrawers);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawers(); });
    // 回到宽屏时清掉抽屉状态，免得残留 class 影响三栏布局
    window.addEventListener('resize', () => { if (!isNarrow()) closeDrawers(); });
    // 触屏上选完数据表就收起，把画面让出来看效果
    document.addEventListener('click', (e) => {
      if (isNarrow() && e.target.closest && e.target.closest('.ds-tab')) closeDrawers();
    });
  }

  function initKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (inField && tag !== 'select') return;
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); exportDialog(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportDialog(); return; }
      // 数据表字体缩放（格子输入框里不拦，免得打不出减号）
      if (mod && !inField && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_' || e.key === '0')) {
        e.preventDefault();
        if (e.key === '0') applySsZoom(100);
        else stepSsZoom((e.key === '=' || e.key === '+') ? 1 : -1);
        return;
      }
      if (inField) return;
      if (e.key === 'Escape') { S.sel = null; clearHighlight(); renderPanel(); }
      if (e.key === 'v' && !mod) {
        S.mode = S.mode === 'pick' ? 'edit' : 'pick';
        $('stage-mode').querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x.dataset.mode === S.mode));
        $('chart-host').style.cursor = S.mode === 'pick' ? 'crosshair' : 'default';
        setStatus(S.mode === 'pick' ? '元素选择模式：点图上元素单独改样式' : '编辑模式');
      }
      if (mod && e.key === '0') { e.preventDefault(); fitZoom(); }
    });

    // 窗口尺寸变化 → 重新适应
    let rt = null;
    window.addEventListener('resize', () => {
      if (rt) clearTimeout(rt);
      rt = setTimeout(() => { if (S.autoFit) fitZoom(); }, 140);
    });
  }

  /* ════════════ 启动 ════════════ */
  function boot() {
    initToolbar();
    initDataToolbar();
    initTabs();
    initCanvas();
    initKeys();
    initResize();
    initResponsive();

    // 载入示例数据
    addDataset(data.samples.germination(), true);
    S.style.stats.show = true;
    pushHistory('初始化');

    syncToolbar();
    refreshGridStat();
    switchTab('chart');
    renderPanel();
    renderChart();
    setStatus('就绪 · 用左侧数据表开始，或点工具栏图形按钮切换图表');
    ui.toast('已载入示例数据「发芽率（浓度梯度）」，可直接改数据或换图形，也可点数据表右上角换其它示例', 'ok', 3800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
