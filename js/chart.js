/* ═══════════════════════════════════════════════════════════
   FigForge · 图表渲染引擎  (js/chart.js)
   基于 Observable Plot 做数据图形，轴标题 / 图例 / 显著性标注 /
   自定义标注由引擎自绘，以保证像素级可控与矢量导出的干净。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const CG = global.CG || (global.CG = {});
  const C = {};
  const Plot = global.Plot;

  /* ═════════ 图表类型定义 ═════════ */
  C.TYPES = [
    { id: 'bar', name: '柱状图', kind: 'column', group: '基础', fit: false, stat: true,
      hint: '均值 ± 误差棒，可叠加个体散点与显著性标注' },
    { id: 'grouped-bar', name: '分组柱状图', kind: 'grouped', group: '基础', fit: false, stat: true,
      hint: '按行标签（主组）并排显示，x 轴为子组' },
    { id: 'line', name: '折线图', kind: 'xy', group: '基础', fit: true, stat: false,
      hint: '每个 Y 列一条折线，可加点标记与拟合' },
    { id: 'scatter', name: '散点图', kind: 'xy', group: '基础', fit: true, stat: false,
      hint: '点图 + 线性/多项式回归与置信带' },
    { id: 'box', name: '箱线图', kind: 'column', group: '分布', fit: false, stat: true,
      hint: '中位数 / 四分位 / 1.5 IQR 须，可标注离群点' },
    { id: 'violin', name: '小提琴图', kind: 'column', group: '分布', fit: false, stat: true,
      hint: '核密度轮廓 + 内嵌箱体，展示完整分布' },
    { id: 'dose', name: '剂量-反应曲线', kind: 'xy', group: '曲线', fit: true, stat: false,
      hint: '四参数 Logistic 拟合，直接给出 EC50 / IC50' },
    { id: 'km', name: '生存曲线', kind: 'survival', group: '曲线', fit: false, stat: 'logrank',
      hint: 'Kaplan-Meier 阶梯曲线 + 删失标记 + log-rank 检验' },
    { id: 'heatmap', name: '热图', kind: 'grouped', group: '矩阵', fit: false, stat: false,
      hint: '行 × 列矩阵填色，可叠加数值，支持双向色阶' },
    { id: 'dual', name: '双 Y 轴', kind: 'xy', group: '组合', fit: true, stat: false,
      hint: '左右两套纵轴，用于不同量纲的两个序列对比' },
    { id: 'roc', name: 'ROC 曲线', kind: 'xy', group: '组合', fit: false, stat: 'roc',
      hint: '敏感度 vs 1−特异度，给出 AUC 与最佳截断点' }
  ];
  C.type = (id) => C.TYPES.find(t => t.id === id) || C.TYPES[0];

  /* ═════════ 基础工具 ═════════ */
  const S = CG.stats;                       // 统计引擎别名（stats.js 必须先于本文件加载）
  const pt = (p) => CG.presets.pt2px(p || 1);
  const mm = (v) => CG.presets.mm2px(v);

  /** 粗略估算文本像素宽度（中文按 1em，西文按 0.55em） */
  function textW(s, fontSize) {
    if (!s) return 0;
    let w = 0;
    for (const ch of String(s)) {
      w += /[\u2E80-\u9FFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? fontSize : fontSize * 0.55;
    }
    return w;
  }
  C.textW = textW;

  /**
   * 分类轴定位：把用户写的坐标解析成组序号。
   * 依次尝试 ①原样全等 ②组名里的数值（"150" → "150 mg/L"）③数字当组序号 ④前缀/包含。
   * 之前只做原样全等，而调用方传进来的是被转成序号的数字，于是必然匹配失败、
   * 标注悄悄跑到绘图区左边缘 —— 现在两边都走这一个函数，不会再错位。
   */
  function bandIndexOf(names, v) {
    if (!names || !names.length) return -1;
    if (v === null || v === undefined || v === '') return -1;
    const sv = String(v).trim();
    for (let i = 0; i < names.length; i++) if (String(names[i]) === sv) return i;
    if (/^-?\d+(?:\.\d+)?$/.test(sv)) {
      const n = parseFloat(sv);
      for (let i = 0; i < names.length; i++) {
        const m = String(names[i]).match(/^-?\d+(?:\.\d+)?/);
        if (m && parseFloat(m[0]) === n) return i;
      }
      if (Number.isInteger(n) && n >= 0 && n < names.length) return n;
    }
    for (let i = 0; i < names.length; i++) if (String(names[i]).indexOf(sv) >= 0) return i;
    return -1;
  }
  C.bandIndexOf = bandIndexOf;

  function el(tag, attrs, text) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  C.el = el;

  function num(v, d) {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(1);
    const digits = d === undefined ? (a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3) : d;
    return v.toFixed(Math.min(6, digits));
  }
  C.num = num;

  /** 确定性抖动（保证刷新后位置不变） */
  function jitter(i, seed) {
    let s = (i * 2654435761 + (seed || 0) * 40503) >>> 0;
    s = (s ^ (s >>> 13)) >>> 0;
    return (s / 4294967296 - 0.5) * 2;
  }
  C.jitter = jitter;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ═════════ 缩放与刻度 ═════════ */
  /** 生成"好看"的线性刻度 */
  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max) || min === max) return [min];
    count = count || 5;
    const span = max - min;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let v = start; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  /** 对数刻度 */
  function logTicks(min, max) {
    if (!(min > 0)) return [];
    const lo = Math.floor(Math.log10(min)), hi = Math.ceil(Math.log10(max));
    const out = [];
    for (let e = lo; e <= hi; e++) {
      for (const m of [1, 2, 5]) {
        const v = m * Math.pow(10, e);
        if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
      }
    }
    return out;
  }
  C.niceTicks = niceTicks; C.logTicks = logTicks;

  function fmtTick(v, isLog) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-4) return v.toExponential(0).replace('e+', 'e');
    const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return String(+v.toFixed(d));
  }
  C.fmtTick = fmtTick;

  /* ═════════ 尺寸与边距 ═════════ */
  /**
   * 刻度标签要不要竖起来？比「一格分到多少像素」和「最长标签占多宽」。
   * 中文组名（如「150 mg/L」）在 100 mm 宽、6 组时横向必然贴到一起，
   * 与其等用户自己发现再手动调，不如默认就自动躲开。
   */
  function autoRotate(ctx, tickPx) {
    const labs = ctx._xTickLabels || [];
    if (labs.length < 2) return 0;
    const avail = ctx.canvas.W - ctx.canvas.m.left - ctx.canvas.m.right;
    if (!(avail > 0)) return 0;
    const bw = avail / labs.length;
    let maxW = 0;
    labs.forEach(s => { maxW = Math.max(maxW, textW(s, tickPx)); });
    if (maxW + 4 <= bw) return 0;                       // 平放放得下
    if (maxW * Math.SQRT1_2 + 4 <= bw) return 45;       // 斜 45° 放得下
    return 90;
  }

  function measure(ctx) {
    const st = ctx.style;
    const W = mm(st.size.w), H = mm(st.size.h);
    const f = st.font;
    const tickPx = pt(f.tick), labPx = pt(f.label), legPx = pt(f.legend);
    // 标题字号允许单独覆盖预设：预设只给一个基准，标题常需要更醒目
    const titlePx = st.title.size ? pt(st.title.size) : pt(f.title);

    const m = { top: 4, right: 6, bottom: 4, left: 6 };

    // 标签旋转：'auto' 由当前标签与可用宽度现算，数值则直接用
    ctx._xRotate = (st.axes.x.rotate === 'auto')
      ? autoRotate(ctx, tickPx)
      : (st.axes.x.rotate || 0);

    // 左：y 刻度标签 + 轴标题
    const yTicks = ctx._yTickLabels || [];
    let yTickW = 0;
    yTicks.forEach(s => { yTickW = Math.max(yTickW, textW(s, tickPx)); });
    m.left += yTickW + (yTicks.length ? 4 + (ctx._tickLen || 0) : 0);
    if (st.axes.y.label) m.left += labPx + 4;

    // 右：第二轴或图例
    if (ctx._rightAxis) {
      let rw = 0;
      (ctx._y2TickLabels || []).forEach(s => { rw = Math.max(rw, textW(s, tickPx)); });
      rw += 8;
      if (st.axes.y2 && st.axes.y2.label) rw += labPx + 4;
      ctx._rightAxisW = rw;          // 单独记下来，图例要靠它右侧排
      m.right += rw;
    } else {
      ctx._rightAxisW = 0;
    }
    if (ctx.type === 'heatmap' && st.legend.show && st.legend.pos === 'right') {
      // 热图画的是色阶条，不是普通图例：色带 9 + 间隔 4 + 刻度数字 + 余量
      ctx._rampLegendW = 9 + 4 + textW('0000.00', tickPx) + 8;
      m.right += ctx._rampLegendW;
    } else if (st.legend.show && st.legend.pos === 'right') {
      let lw = 0;
      (ctx._legendItems || []).forEach(it => { lw = Math.max(lw, textW(it.label, legPx)); });
      m.right += lw + 22 + (st.legend.title ? legPx + 6 : 0) + 8;
    }

    // 下：x 刻度标签 + 轴标题
    let xTickH = tickPx * 1.15;
    if (ctx._xRotate) {
      let maxW = 0;
      (ctx._xTickLabels || []).forEach(s => { maxW = Math.max(maxW, textW(s, tickPx)); });
      // 竖排时要整段标签的长度，别再卡死在小数值上（中文组名动辄 40~60 px），
      // 上限跟画布高度挂钩，留够绘图区即可。
      xTickH = Math.min(maxW * Math.sin(Math.abs(ctx._xRotate) * Math.PI / 180) + tickPx, H * 0.45);
    }
    m.bottom += xTickH + (ctx._xTickLabels && ctx._xTickLabels.length ? 4 : 0);
    if (st.axes.x.label) m.bottom += labPx + 4;

    // 上：图例（上）+ 标题
    if (st.legend.show && st.legend.pos === 'top') m.top += legPx + 8;
    if (st.title.show) {
      const th = titleLayout(st.title, titlePx, H).h;
      if (st.title.pos === 'bottom') m.bottom += th; else m.top += th;
    }
    // 顶部给显著性括号留空间（由 annotPlan 预先算好，见 C.render）
    if (st.stats.show && ctx._annotPx) m.top += ctx._annotPx;

    // 图例（下）
    if (st.legend.show && st.legend.pos === 'bottom') m.bottom += legPx + 10;

    const minSide = 40;
    if (W - m.left - m.right < minSide) m.right = Math.max(6, W - m.left - minSide);
    if (H - m.top - m.bottom < minSide) m.bottom = Math.max(6, H - m.top - minSide);
    return { W, H, m, tickPx, labPx, legPx, titlePx };
  }
  C.measure = measure;

  /* ═════════ 显著性标注：排版规划 ═════════
     必须在 measure/builders 之前跑一次：括号的层数只取决于两两比较的
     「跨度」，与像素几何无关，所以可以先算出来，把顶部留白一次性定好，
     避免括号被挤到画布顶外面叠成一团。                            */

  /** 显著性比较集：all=全部两两 / control=每组与对照 / adjacent=仅相邻组 */
  function comparePairs(n, s) {
    const mode = (s && s.compare) || 'all';
    const out = [];
    if (mode === 'control') {
      const c = Math.min(Math.max(0, (s.control | 0) || 0), Math.max(0, n - 1));
      for (let i = 0; i < n; i++) if (i !== c) out.push([Math.min(i, c), Math.max(i, c)]);
    } else if (mode === 'adjacent') {
      for (let i = 0; i + 1 < n; i++) out.push([i, i + 1]);
    } else {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
    }
    return out;
  }
  C.comparePairs = comparePairs;

  function annotPlan(ctx) {
    const st = ctx.style, t = ctx.type;
    if (!st.stats.show) return null;
    if (['bar', 'grouped-bar', 'box', 'violin'].indexOf(t) < 0) return null;
    const gs = ctx._groups;
    if (!gs || gs.length < 2) return null;

    const view = st.stats.view === 'paired' ? 'paired' : 'unpaired';
    const ph = S.posthoc(gs.map(g => g.values), gs.map(g => g.name), {
      method: st.stats.posthoc, view, welch: st.stats.welch !== false,
      pairs: comparePairs(gs.length, st.stats)
    });
    if (!ph.ok) return null;

    const comps = ph.comparisons.filter(c => st.stats.showNS ? true : c.sig);
    if (!comps.length) return null;

    // 跨度小的排下面（同跨度按 p 值）——实测与「按左端点」同为区间图最优层数
    const sorted = comps.slice().sort((a, b) => {
      const sa = Math.abs(a.i - a.j), sb = Math.abs(b.i - b.j);
      return sa !== sb ? sa - sb : a.pAdj - b.pAdj;
    });
    const levels = [];
    /* 「直接标在柱顶」不叠层，分不分层对它都没意义，
       跳过这段还能省掉 O(n·层数) 的重复扫描。 */
    const flat = (st.stats.annotStyle === 'star');
    if (!flat) {
      sorted.forEach(c => {
        let lv = 0;
        while (levels[lv] && levels[lv].some(o => !(o.i > c.j || o.j < c.i))) lv++;
        if (!levels[lv]) levels[lv] = [];
        levels[lv].push(c);
        c._level = lv;
      });
    } else {
      sorted.forEach(c => { c._level = 0; });
    }

    const fs = st.stats.starSize ? pt(st.stats.starSize) : pt(st.font.tick) * 1.05;
    const labelH = fs * 1.35;
    // 层间距至少容得下一个星号标签，否则相邻两层会互相压住
    const stepPx = Math.max(9, pt(st.stats.bracketStepPt) * 2.2, labelH);
    /* 直接标柱顶时不叠层，不需要按层数留白 —— 否则 6 组 15 条比较
       会在顶部空出一大片。 */
    const needPx = flat ? labelH + 2 : levels.length * stepPx + labelH + 3;

    return { ph, comps: sorted, levels, stepPx, labelH, fs, flat, needPx };
  }
  C.annotPlan = annotPlan;

  /* ═════════ 颜色 ═════════ */
  function makeColorMap(ctx) {
    const palId = ctx.style.marks.palette;
    const names = ctx._seriesNames || [];
    const map = new Map();
    names.forEach((n, i) => map.set(n, CG.presets.colorAt(palId, i)));
    return {
      of(nameOrIndex) {
        if (typeof nameOrIndex === 'number') return CG.presets.colorAt(palId, nameOrIndex);
        if (map.has(nameOrIndex)) return map.get(nameOrIndex);
        const c = CG.presets.colorAt(palId, map.size);
        map.set(nameOrIndex, c);
        return c;
      },
      idx(name) { return names.indexOf(name) < 0 ? 0 : names.indexOf(name); },
      list: names.map((n, i) => ({ name: n, color: CG.presets.colorAt(palId, i) }))
    };
  }
  C.makeColorMap = makeColorMap;

  /** 读取元素级覆盖 */
  function ov(ctx, key, i) {
    const o = ctx.style.overrides;
    return o ? (o[key + '.' + i] || null) : null;
  }
  C.ov = ov;

  /* ═════════ 数据准备 ═════════ */
  function prep(ctx) {
    const ds = ctx.ds;
    const long = CG.data.flatten(ds);
    const groups = CG.data.groups(ds, long);
    const series = long.map(d => d.s);
    const seen = [];
    series.forEach(s => { if (seen.indexOf(s) < 0) seen.push(s); });
    ctx._long = long;
    ctx._groups = groups;
    ctx._seriesNames = seen;
    ctx.colors = makeColorMap(ctx);
    return { long, groups, seriesNames: seen };
  }
  C.prep = prep;

  /* ═════════ 各类型的图形构建 ═════════ */
  const builders = {};

  /* ── 公共：坐标轴配置 ── */
  function axisOpts(ctx, which, o) {
    const st = ctx.style;
    const a = st.axes[which] || {};
    const c = ctx.canvas;
    const conf = {
      label: null,           // 标题由引擎自绘
      tickSize: (st.axes.tickDir === 'in' ? -1 : 1) * pt(st.axes.tickLen),
      tickPadding: pt(2.2),
      tickFormat: o.tickFormat,
      ticks: o.ticks,
      domain: o.domain,
      grid: !!a.grid,
      line: st.axes.frame !== 'none',
      nice: o.nice !== false,
      reverse: !!a.reverse,
      inset: o.inset
    };
    if (a.log) { conf.type = 'log'; conf.ticks = o.logTicks; }
    if (a.min !== null && a.min !== undefined && a.min !== '') conf.domain = [a.min, conf.domain ? conf.domain[1] : undefined].filter(x => x !== undefined);
    return conf;
  }

  /* ── ① 柱状图 ── */
  builders.bar = function (ctx) {
    const st = ctx.style, gs = ctx._groups, col = ctx.colors;
    const errType = st.marks.err.type;
    const stats = gs.map((g, i) => {
      const d = S.describe(g.values);
      const e = S.errorBar(g.values, errType);
      return { g: g.name, i, mean: d.mean, lo: d.mean - e.lo, hi: d.mean + e.hi, n: d.n, sd: d.sd, sem: d.sem, median: d.median };
    });
    const n = stats.length;
    const plotW = ctx.canvas.W - ctx.canvas.m.left - ctx.canvas.m.right;
    const band = plotW / Math.max(1, n);
    const wfrac = st.marks.bar.width;
    const inset = band * (1 - wfrac) / 2;
    const marks = [];
    const barO = st.marks.bar;

    marks.push(Plot.rectY(stats, {
      className: 'oi-bar',
      x: 'g', y: 'mean',
      fill: (d, i) => { const o = ov(ctx, 'bar', i); return (o && o.fill) || col.of(i); },
      fillOpacity: (d, i) => { const o = ov(ctx, 'bar', i); return o && o.opacity !== undefined ? o.opacity : barO.opacity; },
      stroke: barO.outline === 'all' || barO.outline === 'fill' ? ((d, i) => {
        const o = ov(ctx, 'bar', i);
        return (o && o.stroke) || barO.strokeColor || (barO.outline === 'fill' ? CG.presets.shade(col.of(i), -0.35) : '#000');
      }) : null,
      strokeWidth: barO.outline === 'none' ? 0 : pt(barO.strokeW),
      insetLeft: inset, insetRight: inset,
      insetTop: 0,
      rx: pt(barO.corner)
    }));

    // 误差棒
    if (st.marks.err.show && errType !== 'none') {
      const e = st.marks.err;
      const marksErr = [
        Plot.ruleX(stats, {
          className: 'oi-err',
          x: 'g', y1: 'lo', y2: 'hi',
          stroke: (d, i) => { const o = ov(ctx, 'err', i); return (o && o.stroke) || e.color || '#000'; },
          strokeWidth: pt(e.width)
        })
      ];
      if (e.cap) {
        marksErr.push(Plot.tickY(stats, {
          className: 'oi-errcap',
          x: 'g', y: 'lo',
          stroke: e.color || '#000', strokeWidth: pt(e.width),
          tickSpacing: Math.min(band * 0.42, pt(e.capSize) * 2)
        }));
        marksErr.push(Plot.tickY(stats, {
          className: 'oi-errcap2',
          x: 'g', y: 'hi',
          stroke: e.color || '#000', strokeWidth: pt(e.width),
          tickSpacing: Math.min(band * 0.42, pt(e.capSize) * 2)
        }));
      }
      marks.push.apply(marks, marksErr);
    }

    // 个体散点
    if (st.marks.dot.jitter > 0 || st.marks.bar.showPoints) {
      const byG = new Map();
      ctx._long.forEach(d => {
        const i = gs.findIndex(g => g.name === d.g);
        if (i < 0) return;
        if (!byG.has(i)) byG.set(i, []);
        byG.get(i).push(d);
      });
      const pts = [];
      byG.forEach((arr, gi) => {
        arr.forEach((d, k) => {
          const jw = band * clamp(st.marks.dot.jitter, 0, 0.45);
          pts.push({ g: gs[gi].name, y: d.y, gi, dx: jitter(k * 7 + gi * 31, gi) * jw, k });
        });
      });
      marks.push(Plot.dot(pts, {
        className: 'oi-dotpt',
        x: 'g', y: 'y', dx: 'dx',
        fill: (d, i) => { const o = ov(ctx, 'dotpt', i); return (o && o.fill) || st.marks.dot.strokeColor || '#2b2b2b'; },
        r: pt(st.marks.dot.size) * 0.34,
        fillOpacity: (d, i) => { const o = ov(ctx, 'dotpt', i); return o && o.opacity !== undefined ? o.opacity : st.marks.dot.opacity; },
        stroke: null
      }));
    }

    ctx._stats = stats;
    return { marks, xTicks: stats.map(s => s.g), yFrom: stats };
  };

  /* ── ② 分组柱状图 ── */
  builders['grouped-bar'] = function (ctx) {
    const st = ctx.style, col = ctx.colors;
    const subs = CG.data.subGroups(ctx.ds, ctx._long);
    const gs = ctx._groups;
    const nG = Math.max(1, gs.length), nS = Math.max(1, subs.length);
    const errType = st.marks.err.type;
    const cluster = st.marks.bar.dodge === 'stack' ? 1 : nG;
    const bw = st.marks.bar.width / cluster;
    const half = (nG - 1) / 2;

    const rows = [];
    gs.forEach((g, gi) => {
      const bySub = new Map();
      g.rows.forEach(d => {
        const k = d.sub === null ? '全部' : d.sub;
        if (!bySub.has(k)) bySub.set(k, []);
        bySub.get(k).push(d.y);
      });
      subs.forEach((sub, si) => {
        const vals = bySub.get(sub);
        if (!vals || !vals.length) return;
        const d = S.describe(vals);
        const e = S.errorBar(vals, errType);
        const x = st.marks.bar.dodge === 'stack'
          ? si + 0.5
          : si + 0.5 + (gi - half) * bw;
        rows.push({
          sub, subIdx: si, g: g.name, gi, x,
          mean: d.mean, lo: d.mean - e.lo, hi: d.mean + e.hi, n: d.n,
          base: st.marks.bar.dodge === 'stack' ? (gi > 0 ? 0 : 0) : 0
        });
      });
    });

    // 堆叠：累加基值
    if (st.marks.bar.dodge === 'stack') {
      const acc = {};
      rows.forEach(r => {
        acc[r.subIdx] = acc[r.subIdx] || 0;
        r.base = acc[r.subIdx];
        r.top = r.base + r.mean;
        acc[r.subIdx] = r.top;
      });
    }

    const marks = [];
    // 每组占 1 个数据单位；band = 每单位对应的像素数，便于 px ↔ 数据单位换算
    const band = (ctx.canvas.W - ctx.canvas.m.left - ctx.canvas.m.right) / nS;
    const barPx = band * bw;
    /* 注意：分组柱状图的 x 是「连续」坐标（用数值偏移做并排），
       而 Plot 的 rectY({x}) / tickY 会把位置通道声明成 band 标度，与连续轴冲突
       （报 scale incompatible with channel: linear !== band）。
       所以这里一律改用显式的 x1/x2，端帽用水平 ruleY。 */
    if (st.marks.bar.dodge === 'stack') {
      const halfW = st.marks.bar.width / 2;
      marks.push(Plot.rectY(rows, {
        className: 'oi-bar', x1: d => d.x - halfW, x2: d => d.x + halfW, y1: 'base', y2: 'top',
        fill: (d, i) => { const o = ov(ctx, 'bar', i); return (o && o.fill) || col.of(d.g); },
        fillOpacity: st.marks.bar.opacity,
        stroke: st.marks.bar.outline !== 'none' ? '#fff' : null,
        strokeWidth: st.marks.bar.outline !== 'none' ? pt(0.5) : 0,
        rx: pt(st.marks.bar.corner)
      }));
    } else {
      const halfW = bw * 0.45;   // 柱半宽（数据单位），两侧各留 10% 缝
      marks.push(Plot.rectY(rows, {
        className: 'oi-bar', x1: d => d.x - halfW, x2: d => d.x + halfW, y1: 0, y2: 'mean',
        fill: (d, i) => { const o = ov(ctx, 'bar', i); return (o && o.fill) || col.of(d.g); },
        fillOpacity: (d, i) => { const o = ov(ctx, 'bar', i); return o && o.opacity !== undefined ? o.opacity : st.marks.bar.opacity; },
        stroke: st.marks.bar.outline !== 'none' ? ((d, i) => {
          const o = ov(ctx, 'bar', i);
          return (o && o.stroke) || st.marks.bar.strokeColor || '#000';
        }) : null,
        strokeWidth: st.marks.bar.outline !== 'none' ? pt(st.marks.bar.strokeW) : 0,
        rx: pt(st.marks.bar.corner)
      }));
      if (st.marks.err.show && errType !== 'none') {
        const e = st.marks.err;
        marks.push(Plot.ruleX(rows, {
          className: 'oi-err', x: 'x', y1: 'lo', y2: 'hi',
          stroke: e.color || '#000', strokeWidth: pt(e.width)
        }));
        if (e.cap) {
          // 端帽长度按 1 像素换算成 x 数据单位
          const capHalf = Math.min(barPx * 0.5, pt(e.capSize) * 2) / band / 2;
          [['lo', 'oi-errcap'], ['hi', 'oi-errcap2']].forEach(([k, cls]) => {
            marks.push(Plot.ruleY(rows, {
              className: cls, y: k, x1: d => d.x - capHalf, x2: d => d.x + capHalf,
              stroke: e.color || '#000', strokeWidth: pt(e.width)
            }));
          });
        }
      }
    }

    // 散点
    if (st.marks.dot.jitter > 0) {
      const pts = [];
      rows.forEach((r, i) => {
        const arr = ctx._long.filter(d => d.g === r.g && (d.sub === null ? '全部' : d.sub) === r.sub);
        arr.forEach((d, k) => {
          pts.push({
            // jitter 的偏移量必须落在 x 的数据单位上（bw），不能用像素宽度 barPx
            x: r.x + jitter(k * 13 + i * 7, i) * bw * clamp(st.marks.dot.jitter, 0, 0.45),
            y: st.marks.bar.dodge === 'stack' ? r.base + d.y : d.y
          });
        });
      });
      marks.push(Plot.dot(pts, {
        className: 'oi-dotpt', x: 'x', y: 'y',
        fill: st.marks.dot.strokeColor || '#2b2b2b',
        r: pt(st.marks.dot.size) * 0.34, opacity: st.marks.dot.opacity
      }));
    }

    ctx._stats = rows;
    return {
      marks,
      xDomain: [-0.02, nS + 0.02],
      xTicks: subs.map((s, i) => i + 0.5),
      xTickFormat: (v) => subs[Math.round(v - 0.5)] || '',
      xKind: 'linear'
    };
  };

  /* ── ③ 折线图 ── */
  builders.line = function (ctx) {
    const st = ctx.style, col = ctx.colors;
    const marks = [];
    const byS = new Map();
    ctx._long.forEach(d => {
      const x = parseFloat(d.x);
      if (!isFinite(x)) return;
      if (!byS.has(d.s)) byS.set(d.s, []);
      byS.get(d.s).push({ x, y: d.y });
    });
    byS.forEach(arr => arr.sort((a, b) => a.x - b.x));

    const series = Array.from(byS.keys());
    series.forEach((name) => {
      const arr = byS.get(name);
      const si = series.indexOf(name);
      marks.push(Plot.lineY(arr, {
        className: 'oi-line',
        x: 'x', y: 'y',
        stroke: (d, i) => { const o = ov(ctx, 'line', si); return (o && o.stroke) || col.of(name); },
        strokeWidth: (d, i) => { const o = ov(ctx, 'line', si); return o && o.strokeW !== undefined ? pt(o.strokeW) : pt(st.marks.lineW); },
        strokeOpacity: (d, i) => { const o = ov(ctx, 'line', si); return o && o.opacity !== undefined ? o.opacity : 1; },
        strokeDasharray: st.marks.line.style === 'dash' ? '4,2.5' : st.marks.line.style === 'dot' ? '1,2' : null,
        curve: st.marks.line.smooth ? 'catmull-rom' : 'linear'
      }));
      const mk = st.marks.line.marker;
      if (mk && mk !== 'none') {
        const shape = mk === 'auto' ? 'circle' : mk;
        marks.push(Plot.dot(arr, {
          className: 'oi-linemark',
          x: 'x', y: 'y',
          fill: (d, i) => {
            const o = ov(ctx, 'linemark', si);
            const c = (o && o.fill) || col.of(name);
            return CG.presets.isOpenShape(shape) || CG.presets.isLineShape(shape) ? 'none' : c;
          },
          stroke: (d, i) => {
            const o = ov(ctx, 'linemark', si);
            return (o && o.stroke) || col.of(name);
          },
          strokeWidth: pt(st.marks.dot.strokeW),
          r: pt(st.marks.dot.size) * 0.45,
          symbol: shapePathFn(shape)
        }));
      }
    });

    // 拟合
    addFit(ctx, marks);
    return { marks };
  };

  /* ── ④ 散点图 ── */
  builders.scatter = function (ctx) {
    const st = ctx.style, col = ctx.colors;
    const marks = [];
    const byS = new Map();
    ctx._long.forEach(d => {
      const x = parseFloat(d.x);
      if (!isFinite(x)) return;
      if (!byS.has(d.s)) byS.set(d.s, []);
      byS.get(d.s).push({ x, y: d.y });
    });
    const series = Array.from(byS.keys());
    series.forEach(name => {
      const si = series.indexOf(name);
      const shape = st.marks.dot.shape;
      marks.push(Plot.dot(byS.get(name), {
        className: 'oi-dot',
        x: 'x', y: 'y',
        fill: (d, i) => {
          const o = ov(ctx, 'dot', i);
          const c = (o && o.fill) || col.of(name);
          return CG.presets.isOpenShape(shape) ? 'none' : c;
        },
        stroke: (d, i) => {
          const o = ov(ctx, 'dot', i);
          return (o && o.stroke) || st.marks.dot.strokeColor || col.of(name);
        },
        strokeWidth: pt(st.marks.dot.strokeW),
        fillOpacity: (d, i) => { const o = ov(ctx, 'dot', i); return o && o.opacity !== undefined ? o.opacity : st.marks.dot.opacity; },
        r: pt(st.marks.dot.size) * 0.45,
        symbol: shapePathFn(shape)
      }));
    });
    addFit(ctx, marks);
    return { marks };
  };

  /* ── 拟合（折线/散点共用） ── */
  function addFit(ctx, marks) {
    const st = ctx.style;
    const type = st.fit.type;
    if (!type || type === 'none') return;
    const fitO = st.marks.fit;
    const byS = new Map();
    ctx._long.forEach(d => {
      const x = parseFloat(d.x);
      if (!isFinite(x)) return;
      if (!byS.has(d.s)) byS.set(d.s, []);
      byS.get(d.s).push([x, d.y]);
    });
    ctx._fits = [];
    let si = 0;
    byS.forEach((pts, name) => {
      pts.sort((a, b) => a[0] - b[0]);
      if (pts.length < 3) { si++; return; }
      const color = ctx.colors.of(name);
      let r = null, curvePts = [], isCurve = false;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      if (type === 'linear') {
        r = S.linreg(xs, ys);
        if (r.ok) {
          const lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
          const ext = (hi - lo) * (st.fit.extend || 0);
          curvePts = niceRange(lo - ext, hi + ext, 100).map(x => ({ x, y: r.predict(x).y, ci: r.predict(x).ci }));
        }
      } else if (type === 'poly2' || type === 'poly3') {
        const ord = type === 'poly2' ? 2 : 3;
        const pf = S.polyfit(xs, ys, ord);
        if (pf.ok) {
          r = { ok: true, r2: pf.r2, coef: pf.coef, df: pf.df, n: pf.n, type: 'poly' + ord, eval: pf.eval };
          const lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
          curvePts = niceRange(lo, hi, 140).map(x => ({ x, y: pf.eval(x) }));
        }
      } else if (type === '4pl') {
        const useLog = xs.every(v => v > 0);
        r = S.fit4PL(xs, ys, { logX: useLog });
        if (r.ok) {
          isCurve = true;
          curvePts = r.curve(220).map(p => ({ x: p[0], y: p[1] }));
        }
      } else if (type === 'sigmoid') {
        r = S.fitSigmoid(xs, ys);
        if (r.ok) { isCurve = true; curvePts = r.curve(220).map(p => ({ x: p[0], y: p[1] })); }
      }
      if (!r || !r.ok) { si++; return; }
      r.series = name;
      ctx._fits.push(r);

      if (fitO.showCI && type === 'linear' && curvePts.length && curvePts[0].ci !== undefined) {
        marks.push(Plot.areaY(curvePts, {
          className: 'oi-fitci',
          x: 'x', y1: d => d.y - d.ci, y2: d => d.y + d.ci,
          fill: color, fillOpacity: fitO.ciOpacity, stroke: null
        }));
      }
      marks.push(Plot.line(curvePts, {
        className: 'oi-fit',
        x: 'x', y: 'y',
        stroke: (d, i) => { const o = ov(ctx, 'fit', si); return (o && o.stroke) || color; },
        strokeWidth: pt(fitO.width),
        strokeDasharray: fitO.style === 'dash' ? '4,2.5' : fitO.style === 'dot' ? '1,2' : null,
        strokeOpacity: (d, i) => { const o = ov(ctx, 'fit', si); return o && o.opacity !== undefined ? o.opacity : 1; }
      }));
      si++;
    });
  }
  function niceRange(lo, hi, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * i / (n - 1));
    return out;
  }

  /* ── 形状 → d3 symbol 类型 或 自定义 path ── */
  function shapePathFn(shape) {
    switch (shape) {
      case 'square': case 'square-open': return 'square';
      case 'triangle': return 'triangle';
      case 'triangle-down': return 'triangle2';
      case 'diamond': return 'diamond';
      case 'star': return 'star';
      case 'cross': case 'x': case 'plus': return 'cross';
      default: return 'circle';
    }
  }

  /* ── ⑤ 箱线图 ── */
  builders.box = function (ctx) {
    const st = ctx.style, gs = ctx._groups, col = ctx.colors;
    const b = st.marks.box;
    const n = gs.length;
    const plotW = ctx.canvas.W - ctx.canvas.m.left - ctx.canvas.m.right;
    const band = plotW / Math.max(1, n);
    const bw = b.width;
    const inset = band * (1 - bw) / 2;
    const capSpacing = Math.min(band * bw * 0.9, pt(6));

    const rows = gs.map((g, i) => {
      const v = S.clean(g.values).slice().sort((a, c) => a - c);
      const q1 = S.quantile(v, 0.25), q2 = S.quantile(v, 0.5), q3 = S.quantile(v, 0.75);
      const iqr = q3 - q1;
      let lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
      const out = [];
      if (b.whisker === 'tukey') {
        const f1 = q1 - 1.5 * iqr, f3 = q3 + 1.5 * iqr;
        lo = Math.min.apply(null, v.filter(x => x >= f1).concat([q1]));
        hi = Math.max.apply(null, v.filter(x => x <= f3).concat([q3]));
        v.forEach(x => { if (x < f1 || x > f3) out.push(x); });
      } else if (b.whisker === 'minmax') {
        lo = Math.min.apply(null, v); hi = Math.max.apply(null, v);
      } else { // sem
        const d = S.describe(v);
        lo = d.mean - d.sem; hi = d.mean + d.sem;
      }
      return { g: g.name, i, q1, q2, q3, lo, hi, outliers: out, n: v.length, mean: S.mean(v), values: v };
    });

    const marks = [];
    // 须
    marks.push(Plot.ruleX(rows, {
      className: 'oi-boxwhisker',
      x: 'g', y1: 'lo', y2: 'q1',
      stroke: (d, i) => { const o = ov(ctx, 'boxwhisker', i); return (o && o.stroke) || col.of(i); },
      strokeWidth: pt(st.marks.lineW * 0.85)
    }));
    marks.push(Plot.ruleX(rows, {
      className: 'oi-boxwhisker2',
      x: 'g', y1: 'q3', y2: 'hi',
      stroke: (d, i) => { const o = ov(ctx, 'boxwhisker2', i); return (o && o.stroke) || col.of(i); },
      strokeWidth: pt(st.marks.lineW * 0.85)
    }));
    if (b.capW > 0) {
      [['lo', 'oi-boxcap'], ['hi', 'oi-boxcap2']].forEach(([k, cls]) => {
        marks.push(Plot.tickY(rows, {
          className: cls, x: 'g', y: k,
          stroke: (d, i) => { const o = ov(ctx, cls, i); return (o && o.stroke) || col.of(i); },
          strokeWidth: pt(st.marks.lineW * 0.85), tickSpacing: capSpacing
        }));
      });
    }
    // 箱体
    marks.push(Plot.rectY(rows, {
      className: 'oi-box',
      x: 'g', y1: 'q1', y2: 'q3',
      fill: (d, i) => { const o = ov(ctx, 'box', i); return (o && o.fill) || col.of(i); },
      fillOpacity: (d, i) => { const o = ov(ctx, 'box', i); return o && o.opacity !== undefined ? o.opacity : b.opacity; },
      stroke: (d, i) => { const o = ov(ctx, 'box', i); return (o && o.stroke) || col.of(i); },
      strokeWidth: pt(b.medianW * 0.7),
      insetLeft: inset, insetRight: inset
    }));
    // 中位线
    marks.push(Plot.tickY(rows, {
      className: 'oi-boxmed',
      x: 'g', y: 'q2',
      stroke: (d, i) => { const o = ov(ctx, 'boxmed', i); return (o && o.stroke) || st.marks.box.medianColor || '#111'; },
      strokeWidth: pt(b.medianW),
      tickSpacing: band * bw
    }));
    // 离群点
    const outs = [];
    rows.forEach(r => r.outliers.forEach(v => outs.push({ g: r.g, y: v, gi: r.i })));
    if (b.showPoints === 'all') {
      const all = [];
      rows.forEach(r => r.values.forEach(v => all.push({ g: r.g, y: v, gi: r.i, dx: jitter(all.length, r.i) * band * 0.28 })));
      marks.push(Plot.dot(all, {
        className: 'oi-boxpt', x: 'g', y: 'y', dx: 'dx',
        fill: st.marks.dot.strokeColor || '#333', r: pt(b.pointSize) * 0.34, opacity: 0.75
      }));
    } else if (b.showPoints === 'outliers' || outs.length) {
      marks.push(Plot.dot(outs, {
        className: 'oi-boxpt', x: 'g', y: 'y',
        fill: null, stroke: '#c0392b', strokeWidth: pt(0.9),
        r: pt(b.pointSize) * 0.36
      }));
    }
    ctx._stats = rows;
    return { marks, xTicks: rows.map(r => r.g) };
  };

  /* ── ⑥ 小提琴图 ── */
  builders.violin = function (ctx) {
    const st = ctx.style, gs = ctx._groups, col = ctx.colors;
    const v = st.marks.violin;
    const n = gs.length;
    const plotW = ctx.canvas.W - ctx.canvas.m.left - ctx.canvas.m.right;
    const band = plotW / Math.max(1, n);
    // x 用连续坐标，每组占 1 单位
    const halfW = v.width / 2;

    // 全局范围，保证各组密度可比
    const allVals = [];
    gs.forEach(g => g.values.forEach(x => allVals.push(x)));
    const gmin = Math.min.apply(null, allVals), gmax = Math.max.apply(null, allVals);
    const pad = (gmax - gmin) * 0.08 || 1;
    const lo = gmin - pad, hi = gmax + pad;
    const steps = 110;

    const densPts = [], boxRows = [], ptRows = [];
    gs.forEach((g, gi) => {
      const vals = S.clean(g.values);
      if (vals.length < 2) return;
      const k = S.kde(vals, {
        bandwidth: v.bandwidth > 0 ? v.bandwidth : undefined,
        min: lo, max: hi, steps: steps
      });
      let peak = 0;
      k.y.forEach(y => { peak = Math.max(peak, y); });
      if (!(peak > 0)) return;
      const cx = gi + 0.5;
      /* trim=true 时把轮廓裁到数据实际范围（标准小提琴画法）；
         关掉则保留 KDE 的完整支撑集，尾部会拖到数据之外。 */
      const dmin = Math.min.apply(null, vals), dmax = Math.max.apply(null, vals);
      for (let i = 0; i < k.x.length; i++) {
        if (v.trim !== false && (k.x[i] < dmin || k.x[i] > dmax)) continue;
        const w = (k.y[i] / peak) * halfW;
        densPts.push({ gi, x1: cx - w, x2: cx + w, y: k.x[i] });
      }
      const d = S.describe(vals), e = S.errorBar(vals, st.marks.err.type);
      boxRows.push({
        gi, cx, q1: d.q1, q2: d.median, q3: d.q3,
        lo: d.min, hi: d.max, mean: d.mean, n: d.n,
        whi: e.lo
      });
      if (v.showPoints) {
        vals.forEach((val, k2) => {
          ptRows.push({ x: cx + jitter(k2 * 11 + gi * 5, gi) * halfW * 0.75, y: val, gi });
        });
      }
    });

    const marks = [];
    marks.push(Plot.areaX(densPts, {
      className: 'oi-violin',
      x1: 'x1', x2: 'x2', y: 'y',
      fill: (d, i) => { const o = ov(ctx, 'violin', d.gi); return (o && o.fill) || col.of(d.gi); },
      fillOpacity: (d, i) => { const o = ov(ctx, 'violin', d.gi); return o && o.opacity !== undefined ? o.opacity : v.opacity; },
      stroke: (d, i) => { const o = ov(ctx, 'violin', d.gi); return (o && o.stroke) || col.of(d.gi); },
      strokeWidth: pt(st.marks.lineW * 0.6),
      curve: 'basis'
    }));
    if (v.showBox === 'box' || v.showBox === 'quartile') {
      const iw = halfW * 0.16;
      marks.push(Plot.rectY(boxRows, {
        className: 'oi-violinbox',
        x1: d => d.cx - iw, x2: d => d.cx + iw, y1: 'q1', y2: 'q3',
        fill: (d, i) => { const o = ov(ctx, 'violinbox', d.gi); return (o && o.fill) || '#ffffff'; },
        fillOpacity: 0.92,
        stroke: (d, i) => { const o = ov(ctx, 'violinbox', d.gi); return (o && o.stroke) || CG.presets.shade(col.of(d.gi), -0.4); },
        strokeWidth: pt(st.marks.lineW * 0.7)
      }));
      // 中位线：x 是连续坐标，tickY 需要 band 标度，改用水平 ruleY
      marks.push(Plot.ruleY(boxRows, {
        className: 'oi-violinmed', y: 'q2', x1: d => d.cx - iw, x2: d => d.cx + iw,
        stroke: CG.presets.shade(col.of(0), -0.4), strokeWidth: pt(st.marks.lineW * 0.9)
      }));
    }
    if (v.showBox === 'box') {
      marks.push(Plot.ruleX(boxRows, {
        className: 'oi-violinwhisk', x: 'cx', y1: 'lo', y2: 'hi',
        stroke: CG.presets.shade(col.of(0), -0.3), strokeWidth: pt(st.marks.lineW * 0.6)
      }));
    }
    if (v.showPoints && ptRows.length) {
      marks.push(Plot.dot(ptRows, {
        className: 'oi-violinpt', x: 'x', y: 'y',
        fill: '#2b2b2b', fillOpacity: 0.5, r: pt(v.pointSize) * 0.3
      }));
    }
    ctx._stats = boxRows;
    return {
      marks,
      xDomain: [0, n],
      xTicks: gs.map((g, i) => i + 0.5),
      xTickFormat: (x) => { const i = Math.round(x - 0.5); return gs[i] ? gs[i].name : ''; },
      xKind: 'linear',
      yDomain: [lo, hi]
    };
  };

  /* ── ⑦ 剂量-反应 ── */
  builders.dose = function (ctx) {
    const st = ctx.style, col = ctx.colors;
    const marks = [];
    const byS = new Map();
    ctx._long.forEach(d => {
      const x = parseFloat(d.x);
      if (!isFinite(x) || x <= 0) return;
      if (!byS.has(d.s)) byS.set(d.s, []);
      byS.get(d.s).push({ x, y: d.y });
    });
    const series = Array.from(byS.keys());
    ctx._fits = [];
    series.forEach((name, si) => {
      const pts = byS.get(name).slice().sort((a, b) => a.x - b.x);
      const color = col.of(name);
      // 散点
      const shape = st.marks.dot.shape;
      marks.push(Plot.dot(pts, {
        className: 'oi-dot', x: 'x', y: 'y',
        fill: CG.presets.isOpenShape(shape) ? 'none' : color,
        stroke: st.marks.dot.strokeColor || color,
        strokeWidth: pt(st.marks.dot.strokeW),
        r: pt(st.marks.dot.size) * 0.45,
        opacity: st.marks.dot.opacity,
        symbol: shapePathFn(shape)
      }));
      // 4PL
      const r = S.fit4PL(pts.map(p => p.x), pts.map(p => p.y), { logX: true });
      if (r.ok) {
        r.series = name;
        ctx._fits.push(r);
        const curve = r.curve(240).map(p => ({ x: p[0], y: p[1] }));
        marks.push(Plot.line(curve, {
          className: 'oi-fit', x: 'x', y: 'y',
          stroke: (d, i) => { const o = ov(ctx, 'fit', si); return (o && o.stroke) || color; },
          strokeWidth: pt(st.marks.fit.width),
          strokeDasharray: st.marks.fit.style === 'dash' ? '4,2.5' : null
        }));
        // EC50 参考线
        if (st.marks.fit.showEq !== false) {
          const ec = r.EC50;
          marks.push(Plot.ruleX([{ x: ec }], {
            className: 'oi-ec50', x: 'x',
            stroke: color, strokeWidth: pt(0.6), strokeDasharray: '2,2', opacity: 0.85
          }));
        }
      }
    });
    return { marks, xLog: true };
  };

  /* ── ⑧ 生存曲线 ── */
  builders.km = function (ctx) {
    const st = ctx.style, col = ctx.colors;
    const rows = ctx._long.map(d => ({ time: d.time, event: d.event, group: d.g }));
    const surv = S.kaplanMeier(rows);
    ctx._km = surv;
    const lr = S.logRank(surv);
    ctx._logrank = lr.ok ? lr : null;
    const hr = surv.length === 2 ? S.hazardRatio(surv) : null;
    ctx._hr = hr && hr.ok ? hr : null;

    const marks = [];
    const build = (s, si) => {
      const color = col.of(s.group);
      const steps = [];
      for (let i = 0; i < s.steps.length; i++) {
        steps.push({ t: s.steps[i].t, s: s.steps[i].s });
        if (i < s.steps.length - 1) steps.push({ t: s.steps[i + 1].t, s: s.steps[i].s });
      }
      if (st.marks.km.showCI) {
        const ci = [];
        s.steps.forEach(x => ci.push({ t: x.t, lo: x.ciLo, hi: x.ciHi }));
        marks.push(Plot.areaY(ci, {
          className: 'oi-kmci', x: 't', y1: 'lo', y2: 'hi',
          fill: color, fillOpacity: st.marks.km.ciOpacity, stroke: null
        }));
      }
      marks.push(Plot.line(steps, {
        className: 'oi-kmline', x: 't', y: 's',
        stroke: (d, i) => { const o = ov(ctx, 'kmline', si); return (o && o.stroke) || color; },
        strokeWidth: pt(st.marks.km.width),
        strokeDasharray: si === 0 ? null : (si === 1 ? '5,2.5' : (si === 2 ? '1.5,2' : null))
      }));
      if (st.marks.km.censor && s.censorMarks.length) {
        marks.push(Plot.dot(s.censorMarks, {
          className: 'oi-kmcensor', x: 't', y: 's',
          stroke: (d, i) => { const o = ov(ctx, 'kmcensor', si); return (o && o.stroke) || color; },
          strokeWidth: pt(1), fill: '#fff',
          r: pt(st.marks.km.censorSize) * 0.42,
          symbol: 'plus'
        }));
      }
    };
    surv.forEach(build);

    ctx._seriesNames = surv.map(s => s.group);
    ctx.colors = makeColorMap(ctx);
    return { marks, yDomain: [0, 1], yTicks: [0, 0.25, 0.5, 0.75, 1], yTickFormat: (v) => v.toFixed(2) };
  };

  /* ── ⑨ 热图 ── */
  builders.heatmap = function (ctx) {
    const st = ctx.style;
    const h = st.marks.heat;
    const mx = CG.data.matrix(ctx.ds);
    const cells = [];
    mx.values.forEach((row, r) => row.forEach((v, c) => {
      if (isFinite(v)) cells.push({ row: mx.rowLabels[r], col: mx.colLabels[c], v, r, c });
    }));
    const rampId = h.ramp;
    const marks = [];
    marks.push(Plot.cell(cells, {
      className: 'oi-cell',
      x: 'col', y: 'row',
      fill: (d, i) => {
        const o = ov(ctx, 'cell', i);
        if (o && o.fill) return o.fill;
        const t = mx.max > mx.min ? (d.v - mx.min) / (mx.max - mx.min) : 0.5;
        return CG.presets.rampColor(rampId, h.reverse ? 1 - t : t);
      },
      inset: h.gap,
      stroke: h.borderW > 0 ? h.borderColor : null,
      strokeWidth: pt(h.borderW)
    }));
    if (h.showValue) {
      marks.push(Plot.text(cells, {
        className: 'oi-celltext',
        x: 'col', y: 'row',
        text: d => num(d.v, 2),
        fill: d => {
          const t = mx.max > mx.min ? (d.v - mx.min) / (mx.max - mx.min) : 0.5;
          return t > 0.62 ? '#ffffff' : '#1b2026';
        },
        fontSize: pt(h.valueSize),
        pointerEvents: 'none'
      }));
    }
    ctx._heat = mx;
    return { marks, xTicks: mx.colLabels, yTicks: mx.rowLabels, xKind: 'band', yKind: 'band' };
  };

  /* ── ⑩ 双 Y 轴 ── */
  builders.dual = function (ctx) {
    const st = ctx.style, col = ctx.colors;
    const marks = [];
    const byS = new Map();
    ctx._long.forEach(d => {
      const x = parseFloat(d.x);
      if (!isFinite(x)) return;
      if (!byS.has(d.s)) byS.set(d.s, []);
      byS.get(d.s).push({ x, y: d.y });
    });
    const series = Array.from(byS.keys());
    if (!series.length) return { marks };
    /* 右轴序列：默认取最后一个序列。面板里明确告诉用户「把要放到右轴的
       那一列调到最后一列即可」，所以这里必须真的取最后一个 —— 早前写的是
       series[0]（第一个），与提示正好相反，用户按提示调列反而放错轴。 */
    const rightName = (ctx.mapping && ctx.mapping.y2 && byS.has(ctx.mapping.y2))
      ? ctx.mapping.y2
      : series[series.length - 1];

    // 左轴：除右轴序列外的所有序列；右轴：上面选定的那一条
    const leftSeries = series.filter(n => n !== rightName);
    const useLeft = leftSeries.length ? leftSeries : [rightName];
    const rightPts = byS.get(rightName) || [];

    const allY = [];
    useLeft.forEach(n => byS.get(n).forEach(p => allY.push(p.y)));
    const y1min = Math.min.apply(null, allY), y1max = Math.max.apply(null, allY);
    const pad1 = (y1max - y1min) * 0.08 || 1;
    const d1 = [y1min - pad1, y1max + pad1];

    const ry = rightPts.map(p => p.y);
    const y2min = Math.min.apply(null, ry), y2max = Math.max.apply(null, ry);
    const pad2 = (y2max - y2min) * 0.08 || 1;
    const d2 = [y2min - pad2, y2max + pad2];

    // 把右轴数据线性映射到左轴坐标
    const map2 = (v) => d1[0] + (v - d2[0]) * (d1[1] - d1[0]) / (d2[1] - d2[0]);

    ctx._dual = { left: useLeft, right: rightName, d1, d2, map2, y2Ticks: niceTicks(d2[0], d2[1], 5) };

    useLeft.forEach(name => {
      const pts = byS.get(name).slice().sort((a, b) => a.x - b.x);
      marks.push(Plot.lineY(pts, {
        className: 'oi-line', x: 'x', y: 'y',
        stroke: col.of(name), strokeWidth: pt(st.marks.lineW * 1.15)
      }));
      marks.push(Plot.dot(pts, {
        className: 'oi-linemark', x: 'x', y: 'y',
        fill: col.of(name), r: pt(st.marks.dot.size) * 0.42, symbol: shapePathFn(st.marks.dot.shape)
      }));
    });
    const rPts = rightPts.slice().sort((a, b) => a.x - b.x).map(p => ({ x: p.x, y: map2(p.y), raw: p.y }));
    marks.push(Plot.lineY(rPts, {
      className: 'oi-line2', x: 'x', y: 'y',
      stroke: col.of(rightName), strokeWidth: pt(st.marks.lineW * 1.15),
      strokeDasharray: '5,2.5'
    }));
    marks.push(Plot.dot(rPts, {
      className: 'oi-linemark2', x: 'x', y: 'y',
      fill: '#fff', stroke: col.of(rightName), strokeWidth: pt(0.9),
      r: pt(st.marks.dot.size) * 0.42, symbol: 'square'
    }));

    return { marks, yDomain: d1, rightAxis: true };
  };

  /* ── ⑪ ROC ── */
  builders.roc = function (ctx) {
    const st = ctx.style, col = ctx.colors;
    const gs = ctx._groups;
    const marks = [];
    ctx._rocs = [];
    // 取正类：标签为 1 / positive 的组
    const posNames = gs.filter(g => /^(1|pos|positive|yes|true|case|患|阳)/i.test(String(g.name).trim())).map(g => g.name);
    const negNames = gs.filter(g => posNames.indexOf(g.name) < 0).map(g => g.name);
    const scores = [], labels = [];
    ctx._long.forEach(d => {
      const g = String(d.g);
      const isPos = posNames.length ? posNames.indexOf(g) >= 0 : false;
      scores.push(d.y);
      labels.push(posNames.length ? (isPos ? 1 : 0) : (/^(1|pos|positive|yes|true|case|患|阳)/i.test(g) ? 1 : 0));
    });
    const r = S.roc(scores, labels);
    if (!r.ok) { ctx._rocErr = r.msg; return { marks, rocError: r.msg }; }
    ctx._rocs.push(r);
    // ROC 的「分组」其实是分类标签（0/1），当图例毫无意义 —— 改成显示 AUC
    ctx._legendItems = [{
      label: 'ROC（AUC = ' + r.auc.toFixed(3) + '）',
      color: col.of(0)
    }];

    if (st.marks.roc.diagonal) {
      marks.push(Plot.line([{ x: 0, y: 0 }, { x: 1, y: 1 }], {
        className: 'oi-diag', x: 'x', y: 'y',
        stroke: '#9aa3ad', strokeWidth: pt(0.6), strokeDasharray: '3,2.5'
      }));
    }
    const curve = r.curve.map(c => ({ x: c.fpr, y: c.tpr }));
    marks.push(Plot.line(curve, {
      className: 'oi-rocline', x: 'x', y: 'y',
      stroke: (d, i) => { const o = ov(ctx, 'rocline', 0); return (o && o.stroke) || col.of(0); },
      strokeWidth: pt(st.marks.roc.width)
    }));
    marks.push(Plot.dot([{ x: r.bestCutoff !== undefined ? 1 - r.bestSpec : 0, y: r.bestSens }], {
      className: 'oi-rocbest', x: 'x', y: 'y',
      fill: '#fff', stroke: col.of(0), strokeWidth: pt(1.1), r: pt(2.6)
    }));
    return {
      marks, xDomain: [0, 1], yDomain: [0, 1],
      xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1], yTicks: [0, 0.2, 0.4, 0.6, 0.8, 1],
      xTickFormat: v => v.toFixed(1), yTickFormat: v => v.toFixed(1)
    };
  };

  /* ═════════ 数据范围与刻度 ═════════ */
  function yRangeOf(ctx) {
    const st = ctx.style, t = ctx.type, long = ctx._long;
    if (t === 'km' || t === 'roc') return [0, 1];
    if (t === 'heatmap' || t === 'dual') return null;
    const vals = [];
    if (t === 'bar' || t === 'box' || t === 'violin') {
      ctx._groups.forEach(g => {
        const d = S.describe(g.values);
        const e = S.errorBar(g.values, st.marks.err.type);
        vals.push(d.mean - e.lo, d.mean + e.hi, d.min, d.max);
      });
    } else if (t === 'grouped-bar') {
      const map = new Map();
      long.forEach(d => {
        const k = d.g + '\u0000' + d.sub;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(d.y);
      });
      map.forEach(arr => {
        const d = S.describe(arr);
        const e = S.errorBar(arr, st.marks.err.type);
        vals.push(d.mean - e.lo, d.mean + e.hi, d.min, d.max);
      });
    } else {
      long.forEach(d => { if (isFinite(d.y)) vals.push(d.y); });
    }
    if (!vals.length) return [0, 1];
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const rawLo = lo, rawHi = hi;
    const pad = (hi - lo) * 0.04;
    lo -= pad; hi += pad;
    /* 数据里没有负值，就别因为那 4% padding 把下界推到负数：
       否则 nice 取整会把 0.045 这种下界一路退到 -50，
       整张图一半是空白（实测折线/散点/剂量-反应都会这样）。*/
    if (rawLo >= 0 && lo < 0) lo = 0;
    if (rawHi <= 0 && hi > 0) hi = 0;
    /* 柱状图基线必须落在 0 上——注意要在加完 padding 之后再夹，
       否则 0 会被 padding 顶成负数，坐标轴下界出现 -20 这种值 */
    if (t === 'bar' || t === 'grouped-bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    return [lo, hi];
  }

  function xRangeOf(ctx) {
    const t = ctx.type, long = ctx._long;
    if (t === 'km') {
      let hi = 1;
      long.forEach(d => { if (isFinite(d.time)) hi = Math.max(hi, d.time); });
      return [0, hi * 1.02];
    }
    if (t === 'roc') return [0, 1];
    if (t === 'dose') {
      const xs = [];
      long.forEach(d => { const x = parseFloat(d.x); if (isFinite(x) && x > 0) xs.push(x); });
      if (!xs.length) return [0, 1];
      return [Math.min.apply(null, xs) * 0.8, Math.max.apply(null, xs) * 1.25];
    }
    const xs = [];
    long.forEach(d => { const x = parseFloat(d.x); if (isFinite(x)) xs.push(x); });
    if (!xs.length) return [0, 1];
    const lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
    if (lo === hi) return [lo - 1, hi + 1];
    return [lo - (hi - lo) * 0.04, hi + (hi - lo) * 0.04];
  }

  /** 由刻度数组得到"好看"的 domain */
  function niceDomain(lo, hi, isLog) {
    if (isLog) return [lo, hi];
    const tk = niceTicks(lo, hi, 5);
    if (!tk.length) return [lo, hi];
    return [Math.min(tk[0], lo), Math.max(tk[tk.length - 1], hi)];
  }

  /* ═════════ 主渲染 ═════════ */
  /**
   * @param {HTMLElement} hostEl 容器（会被清空）
   * @param {object} ctx {ds, style, type, mapping, selected}
   * @returns {object} {svg, W, H, geom, ...}
   */
  C.render = function (hostEl, ctx) {
    const st = ctx.style;
    const built = null;
    ctx._rightAxis = false;

    const W = mm(st.size.w), H = mm(st.size.h);
    ctx.canvas = { W, H, m: { top: 8, right: 12, bottom: 24, left: 40 } };
    ctx._tickLen = pt(st.axes.tickLen);

    prep(ctx);
    const nG = Math.max(1, ctx._groups.length);
    ctx._xRotate = 0;   // 真正的值由 measure 解析（'auto' 要按标签宽度现算）

    // 按类型提供标签，供边距估算
    const t = ctx.type;
    if (t === 'heatmap') {
      const mx = CG.data.matrix(ctx.ds);
      ctx._xTickLabels = mx.colLabels;
      ctx._yTickLabels = mx.rowLabels;
      ctx._legendItems = [];
    } else if (t === 'km' || t === 'roc' || t === 'line' || t === 'scatter' || t === 'dose' || t === 'dual') {
      ctx._xTickLabels = ['0.0', '0.0'];
      ctx._yTickLabels = ['0.0', '0.0'];
      ctx._legendItems = ctx._seriesNames.map((n, i) => ({ label: n, color: CG.presets.colorAt(st.marks.palette, i) }));
    } else if (t === 'grouped-bar') {
      ctx._xTickLabels = CG.data.subGroups(ctx.ds, ctx._long);
      ctx._yTickLabels = ['0', '0'];
      ctx._legendItems = ctx._groups.map((g, i) => ({ label: g.name, color: CG.presets.colorAt(st.marks.palette, i) }));
    } else {
      ctx._xTickLabels = ctx._groups.map(g => g.name);
      ctx._yTickLabels = ['0', '0'];
      ctx._legendItems = ctx._groups.map((g, i) => ({ label: g.name, color: CG.presets.colorAt(st.marks.palette, i) }));
    }
    ctx._annotHeight = 0;
    // 显著性括号排版规划 → 顶部留白
    ctx._annotPlan = annotPlan(ctx);
    ctx._annotPx = ctx._annotPlan ? ctx._annotPlan.needPx : 0;

    // 迭代 2 次收敛边距（band 宽度依赖边距，边距又依赖标签宽度）
    let meas = null, result = null;
    for (let iter = 0; iter < 2; iter++) {
      meas = measure(ctx);
      ctx.canvas.m = meas.m;
      result = builders[t](ctx);
      if (!result) result = { marks: [] };
      if (result.xTicks && result.xTicks.length) {
        ctx._xTickLabels = result.xTickFormat ? result.xTicks.map(result.xTickFormat) : result.xTicks.map(String);
      }
      if (result.yTicks && result.yTicks.length) {
        ctx._yTickLabels = result.yTickFormat ? result.yTicks.map(result.yTickFormat) : result.yTicks.map(String);
      }
      if (result.rightAxis) ctx._rightAxis = true;
      if (t === 'heatmap') ctx._legendItems = [];
    }
    meas = measure(ctx);
    ctx.canvas.m = meas.m;

    /* ── 轴配置 ── */
    // builder 可以显式要求对数轴（如剂量-反应返回 xLog:true），优先级高于样式
    const yIsLog = (result.yLog !== undefined) ? !!result.yLog : !!st.axes.y.log;
    const xIsLog = (result.xLog !== undefined) ? !!result.xLog : !!st.axes.x.log;

    let yDom = null;
    if (result.yDomain) yDom = result.yDomain.slice();
    else {
      const r = yRangeOf(ctx);
      if (r) {
        if (yIsLog) {
          const tk = logTicks(r[0], r[1]);
          yDom = tk.length > 1 ? [tk[0], tk[tk.length - 1]] : [r[0], r[1]];
        } else {
          /* 关键：值域必须先真正覆盖数据，再把上下界凑到整刻度。
             早前直接用「最后一个刻度」当上界，会把数据裁掉
             （例如数据到 91 而刻度只到 80 → 柱子溢出到坐标区外面）。 */
          const round = (v) => +v.toPrecision(12);
          let lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
          const tk = niceTicks(lo, hi, 5);
          let step = tk.length > 1 ? tk[1] - tk[0] : (hi - lo) / 5;
          if (!(step > 0)) step = Math.abs(hi) > 0 ? Math.abs(hi) / 5 : 1;
          lo = round(Math.floor(lo / step) * step);
          hi = round(Math.ceil(hi / step) * step);
          if (!(hi > lo)) hi = round(lo + step);
          yDom = [lo, hi];
        }
      }
    }
    if (yDom && st.axes.y.min !== null && st.axes.y.min !== '' && st.axes.y.min !== undefined) yDom[0] = +st.axes.y.min;
    if (yDom && st.axes.y.max !== null && st.axes.y.max !== '' && st.axes.y.max !== undefined) yDom[1] = +st.axes.y.max;
    if (!yDom) yDom = [0, 1];

    const yTicksV = (result.yTicks && result.yTicks.length)
      ? result.yTicks
      : (yIsLog ? logTicks(yDom[0], yDom[1]) : niceTicks(yDom[0], yDom[1], st.axes.y.ticks || 5));

    // x
    let xConf = null, xDom = null, xTicksV = null, xTickFmt = null;
    const xKind = result.xKind || (result.xTicks && ['bar', 'box', 'heatmap'].indexOf(t) >= 0 ? 'band' : (result.xDomain ? 'linear' : 'linear'));

    if (xKind === 'band' && (t === 'bar' || t === 'box' || t === 'heatmap')) {
      const names = result.xTicks || ctx._groups.map(g => g.name);
      xConf = {
        type: 'band', domain: names, padding: t === 'heatmap' ? 0 : (t === 'bar' ? 0.2 : 0.3),
        label: null, tickSize: (st.axes.tickDir === 'in' ? -1 : 1) * pt(st.axes.tickLen),
        tickPadding: pt(2.2), grid: !!st.axes.x.grid,
        line: st.axes.frame !== 'none', reverse: !!st.axes.x.reverse
      };
      xDom = null;
    } else {
      let lo, hi;
      if (result.xDomain) { lo = result.xDomain[0]; hi = result.xDomain[1]; }
      else {
        if (t === 'grouped-bar') {
          const nSub = Math.max(1, CG.data.subGroups(ctx.ds, ctx._long).length);
          lo = -0.02; hi = nSub + 0.02;
        } else if (t === 'violin') { lo = 0; hi = nG; }
        else { const r = xRangeOf(ctx); lo = r[0]; hi = r[1]; }
      }
      xTicksV = result.xTicks || (xIsLog ? logTicks(lo, hi) : niceTicks(lo, hi, 6));
      xTickFmt = result.xTickFormat || (xIsLog ? (v) => fmtTick(v, true) : (v) => fmtTick(v, false));
      xDom = [Math.min(lo, xTicksV.length ? xTicksV[0] : lo), Math.max(hi, xTicksV.length ? xTicksV[xTicksV.length - 1] : hi)];
      if (st.axes.x.min !== null && st.axes.x.min !== '' && st.axes.x.min !== undefined) xDom[0] = +st.axes.x.min;
      if (st.axes.x.max !== null && st.axes.x.max !== '' && st.axes.x.max !== undefined) xDom[1] = +st.axes.x.max;
      xConf = {
        type: xIsLog ? 'log' : 'linear', domain: xDom, ticks: xTicksV, tickFormat: xTickFmt,
        label: null, tickSize: (st.axes.tickDir === 'in' ? -1 : 1) * pt(st.axes.tickLen),
        tickPadding: pt(2.2), grid: !!st.axes.x.grid,
        line: st.axes.frame !== 'none', reverse: !!st.axes.x.reverse, nice: false
      };
    }

    // y 轴：builder 可以声明 yKind:'band'（热图的行标签用 band 标度）
    let yConf;
    if (result.yKind === 'band') {
      yConf = {
        type: 'band', domain: (result.yTicks || []).slice(), padding: 0,
        label: null, tickSize: (st.axes.tickDir === 'in' ? -1 : 1) * pt(st.axes.tickLen),
        tickPadding: pt(2.2), grid: !!st.axes.y.grid,
        line: st.axes.frame !== 'none', reverse: !!st.axes.y.reverse
      };
    } else {
      yConf = {
        type: yIsLog ? 'log' : 'linear', domain: yDom, ticks: yTicksV,
        tickFormat: result.yTickFormat || (v => fmtTick(v, yIsLog)),
        label: null, tickSize: (st.axes.tickDir === 'in' ? -1 : 1) * pt(st.axes.tickLen),
        tickPadding: pt(2.2), grid: !!st.axes.y.grid,
        line: st.axes.frame !== 'none', reverse: !!st.axes.y.reverse, nice: false
      };
    }

    /* ── 组装 ── */
    const marks = result.marks.slice();
    if (st.axes.frame === 'box') marks.push(Plot.frame({ stroke: st.font.color, strokeWidth: pt(st.axes.spine) }));
    if (result.rocError) { /* ROC 无法计算，仍渲染空图 */ }

    const colorConf = {
      domain: ctx._seriesNames,
      range: ctx._seriesNames.map((n, i) => CG.presets.colorAt(st.marks.palette, i))
    };

    const plotOpts = {
      width: W, height: H,
      marginTop: ctx.canvas.m.top, marginRight: ctx.canvas.m.right,
      marginBottom: ctx.canvas.m.bottom, marginLeft: ctx.canvas.m.left,
      style: {
        fontSize: meas.tickPx + 'px',
        fontFamily: st.font.family,
        color: st.font.color,
        background: st.bg.show ? st.bg.color : 'transparent',
        overflow: 'visible',
        maxWidth: 'none'
      },
      x: Object.assign({}, xConf, { axis: t === 'heatmap' && false ? null : undefined }),
      y: yConf,
      color: colorConf,
      marks: marks
    };
    if (xConf.axis === null) delete plotOpts.x;
    // 轴显示开关
    if (st.axes.frame === 'none') { plotOpts.x = Object.assign({}, plotOpts.x, { line: false, ticks: null }); plotOpts.y = Object.assign({}, plotOpts.y, { line: false, ticks: null }); }

    let svg;
    try {
      svg = Plot.plot(plotOpts);
    } catch (err) {
      const e = el('text', { x: 12, y: 24, fill: '#cf3b3b', 'font-size': 12, 'font-family': 'sans-serif' }, '渲染失败：' + err.message);
      svg = el('svg', { width: W, height: H, xmlns: 'http://www.w3.org/2000/svg' });
      svg.appendChild(e);
      hostEl.innerHTML = '';
      hostEl.appendChild(svg);
      return { svg, W, H, error: err.message };
    }

    /* ── 几何信息（自绘用） ── */
    const px = ctx.canvas.m.left, py = ctx.canvas.m.top;
    const pw = W - ctx.canvas.m.left - ctx.canvas.m.right;
    const ph = H - ctx.canvas.m.top - ctx.canvas.m.bottom;
    const geom = ctx.geom = {
      x0: px, y0: py, w: pw, h: ph,
      yMin: yDom[0], yMax: yDom[1], yLog: yIsLog,
      xKind: xKind, xDom: xDom, xTicks: xTicksV,
      bandOf: function (name) {
        const names = result.xTicks || ctx._groups.map(g => g.name);
        const i = bandIndexOf(names, name);
        if (i < 0) return null;
        const pad = t === 'bar' ? 0.2 : 0.3;
        const bw = pw / names.length;
        const inner = bw * (1 - pad);
        return { center: px + bw * (i + 0.5), width: inner, left: px + bw * i + (bw - inner) / 2 };
      },
      /** 分类轴的组名清单与「坐标 → 组序号」解析（供面板校验用） */
      bandNames: xKind === 'band' ? (result.xTicks || ctx._groups.map(g => g.name)) : null,
      xIndex: function (v) {
        return xKind === 'band' ? bandIndexOf(this.bandNames, v) : NaN;
      },
      yOf: function (v) {
        if (yIsLog) {
          const lg = Math.log10;
          const t2 = (lg(v) - lg(yDom[0])) / (lg(yDom[1]) - lg(yDom[0]));
          return st.axes.y.reverse ? py + ph * t2 : py + ph * (1 - t2);
        }
        const t2 = (v - yDom[0]) / (yDom[1] - yDom[0]);
        return st.axes.y.reverse ? py + ph * t2 : py + ph * (1 - t2);
      },
      xOf: function (v) {
        if (xKind === 'band') {
          const names = result.xTicks || ctx._groups.map(g => g.name);
          const i = bandIndexOf(names, v);
          if (i < 0) return px;
          const bw = pw / names.length;
          return px + bw * (i + 0.5);
        }
        if (xIsLog) {
          const t2 = (Math.log10(v) - Math.log10(xDom[0])) / (Math.log10(xDom[1]) - Math.log10(xDom[0]));
          return st.axes.x.reverse ? px + pw * (1 - t2) : px + pw * t2;
        }
        const t2 = (v - xDom[0]) / (xDom[1] - xDom[0]);
        return st.axes.x.reverse ? px + pw * (1 - t2) : px + pw * t2;
      }
    };

    /* ── 后处理 ── */
    tuneAxisText(svg, meas, ctx);
    drawTitle(svg, ctx, meas);
    drawAxisLabels(svg, ctx, meas, xKind === 'band' ? null : xDom, xKind === 'band' ? (result.xTicks || ctx._groups.map(g => g.name)) : null);
    if (ctx._rightAxis) drawRightAxis(svg, ctx, meas);
    drawLegend(svg, ctx, meas);
    if (st.stats.show) drawStats(svg, ctx, meas);
    drawAnnots(svg, ctx, meas);
    const index = tagElements(svg, ctx);

    hostEl.innerHTML = '';
    hostEl.appendChild(svg);

    return {
      svg: svg, W: W, H: H, geom: geom, ctx: ctx, index: index,
      fits: ctx._fits, stats: ctx._stats, logrank: ctx._logrank, hr: ctx._hr,
      rocs: ctx._rocs, km: ctx._km, heat: ctx._heat
    };
  };

  /* ═════════ 后处理：字号 ═════════ */
  /**
   * Plot 用 aria-label 给轴分组，实际取值是 'x-axis tick label'（刻度文字）、
   * 'x-axis tick'（刻度线）这类**带后缀**的名字。这里按前缀匹配，
   * 免得写死某个叫法。
   */
  function axisTexts(svg, axis, kind) {
    const exact = 'g[aria-label="' + axis + '-axis ' + kind + '"] text';
    const n = svg.querySelectorAll(exact);
    return n.length ? n : svg.querySelectorAll('g[aria-label^="' + axis + '-axis"] text');
  }

  function tuneAxisText(svg, meas, ctx) {
    svg.querySelectorAll('.oi-celltext').forEach(t => {
      t.setAttribute('font-size', meas.tickPx);
      t.style.fontSize = meas.tickPx + 'px';
    });
    axisTexts(svg, 'x').forEach(t => { t.setAttribute('font-size', meas.tickPx); t.style.fontSize = meas.tickPx + 'px'; });
    axisTexts(svg, 'y').forEach(t => { t.setAttribute('font-size', meas.tickPx); t.style.fontSize = meas.tickPx + 'px'; });

    /* 刻度标签旋转。Plot 没有这个能力，只能事后给每个标签挂 transform。
       标签是 <text transform="translate(X,Y)"> 这种定位方式，所以在原 transform
       后面接一个 rotate 就绕锚点转；再配 text-anchor="end"，字符串会从锚点往
       左下（45°）或正下（90°）铺开——末字正好落在原位置上，整体不会跑偏。 */
    const ang = ctx && ctx._xRotate;
    if (!ang) return;
    // 只转刻度文字，别把轴标题也转了
    axisTexts(svg, 'x', 'tick label').forEach(t => {
      const tr = t.getAttribute('transform') || '';
      let anchor = tr;
      if (!/translate/.test(tr)) {
        // 没有现成的 translate，就按当前 x/y 自己造一个锚点（y 可能是 "0.32em" 这类相对值）
        const x = parseFloat(t.getAttribute('x')), y = parseFloat(t.getAttribute('y'));
        if (!isFinite(x) || !isFinite(y)) return;
        anchor = 'translate(' + x + ',' + y + ')';
        t.removeAttribute('x');
        t.removeAttribute('y');
      }
      t.setAttribute('transform', anchor + ' rotate(' + (-ang) + ')');
      t.setAttribute('text-anchor', 'end');
    });
  }

  /* ═════════ 自绘：标题 ═════════ */
  /**
   * 标题排版。留白、行距、总高度都算在这里，measure 与 drawTitle 共用，
   * 否则改了留白而边距没跟着改，标题会贴边或压到绘图区。
   *
   * 排法：每行一个「行盒」，盒高 = 字号 × 1.3，基线落在盒顶往下一个字身处；
   * 整个块上下各留 0.6 个字号的空白，跟着标题字号一起放大。
   */
  function titleLayout(t, px, H) {
    const pad = px * 0.6;
    const sizes = [];
    if (t.text) sizes.push(px);
    if (t.sub) sizes.push(px * 0.82);
    const boxes = sizes.map(s => s * 1.3);
    const h = pad * 2 + boxes.reduce((a, b) => a + b, 0);
    const top = t.pos === 'bottom' ? Math.max(0, H - h) : 0;
    return {
      h,
      count: sizes.length,
      /** 第 i 行的基线 y */
      baseline(i) {
        let y = top + pad;
        for (let k = 0; k < i; k++) y += boxes[k];
        return y + sizes[i];
      }
    };
  }

  function drawTitle(svg, ctx, meas) {
    const st = ctx.style, t = st.title;
    if (!t.show || !(t.text || t.sub)) return;
    const f = st.font;
    const px = meas.titlePx;
    const W = ctx.canvas.W, H = ctx.canvas.H;
    const x = t.align === 'center' ? W / 2 : t.align === 'right' ? W - ctx.canvas.m.right : ctx.canvas.m.left;
    const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
    const weight = t.bold === false ? 400 : 700;
    const tl = titleLayout(t, px, H);
    // data-figtitle 让画布上的标题可点（点一下开标题编辑）
    const base = {
      x, 'text-anchor': anchor, 'font-family': f.family, fill: f.color,
      'data-figtitle': '1', style: 'cursor:pointer'
    };
    if (t.text) {
      svg.appendChild(el('text', Object.assign({}, base, {
        y: tl.baseline(0), 'font-size': px, 'font-weight': weight
      }), t.text));
    }
    if (t.sub) {
      svg.appendChild(el('text', Object.assign({}, base, {
        y: tl.baseline(t.text ? 1 : 0), 'font-size': px * 0.82,
        'font-weight': 400, opacity: 0.82
      }), t.sub));
    }
  }

  /* ═════════ 自绘：轴标题 ═════════ */
  function drawAxisLabels(svg, ctx, meas, xDom, bandNames) {
    const st = ctx.style, f = st.font;
    const g = ctx.geom;
    const cx = g.x0 + g.w / 2, cy = g.y0 + g.h / 2;
    if (st.axes.x.label) {
      svg.appendChild(el('text', {
        x: cx, y: ctx.canvas.H - 1.5, 'text-anchor': 'middle',
        'font-size': meas.labPx, 'font-family': f.family, fill: f.color
      }, st.axes.x.label));
    }
    if (st.axes.y.label) {
      svg.appendChild(el('text', {
        x: 1.5, y: cy, 'text-anchor': 'middle', 'font-size': meas.labPx,
        'font-family': f.family, fill: f.color,
        transform: 'rotate(-90,' + 1.5 + ',' + cy + ')'
      }, st.axes.y.label));
    }
  }

  /* ═════════ 自绘：右轴（双 Y） ═════════ */
  function drawRightAxis(svg, ctx, meas) {
    const d = ctx._dual;
    if (!d) return;
    const st = ctx.style, f = st.font;
    const g = ctx.geom;
    const x = g.x0 + g.w;
    svg.appendChild(el('line', {
      x1: x, y1: g.y0, x2: x, y2: g.y0 + g.h,
      stroke: f.color, 'stroke-width': pt(st.axes.spine),
      'stroke-dasharray': st.axes.y2 && st.axes.y2.tickDir === 'in' ? null : null
    }));
    const ticks = d.y2Ticks;
    ticks.forEach(v => {
      const y = g.yOf(d.map2(v));
      if (y < g.y0 - 1 || y > g.y0 + g.h + 1) return;
      svg.appendChild(el('line', {
        x1: x, y1: y, x2: x + (st.axes.tickDir === 'in' ? -1 : 1) * pt(st.axes.tickLen), y2: y,
        stroke: f.color, 'stroke-width': pt(st.axes.spine)
      }));
      svg.appendChild(el('text', {
        x: x + pt(st.axes.tickLen) + pt(2.2), y: y + meas.tickPx * 0.35,
        'font-size': meas.tickPx, 'font-family': f.family, fill: f.color
      }, fmtTick(v, false)));
    });
    if (st.axes.y2 && st.axes.y2.label) {
      const cy = g.y0 + g.h / 2;
      const lx = ctx.canvas.W - 1.5;
      svg.appendChild(el('text', {
        x: lx, y: cy, 'text-anchor': 'middle', 'font-size': meas.labPx,
        'font-family': f.family, fill: f.color,
        transform: 'rotate(90,' + lx + ',' + cy + ')'
      }, st.axes.y2.label));
    }
  }

  /* ═════════ 自绘：图例 ═════════ */
  function drawLegend(svg, ctx, meas) {
    const st = ctx.style, f = st.font;
    const items = ctx._legendItems || [];
    const g = ctx.geom;

    if (ctx.type === 'heatmap') {
      drawRampLegend(svg, ctx, meas, g);
      return;
    }
    if (!st.legend.show || st.legend.pos === 'none' || !items.length) return;
    const fs = meas.legPx;
    const gap = st.legend.itemGap || 3;
    const sym = st.legend.markerSize || 3;
    const rowH = Math.max(fs * 1.5, 10);
    const pos = st.legend.pos;

    let x0, y0, vertical = true;
    if (pos === 'right') {
      let w = 0;
      items.forEach(it => { w = Math.max(w, textW(it.label, fs)); });
      /* 靠右对齐，并且必须让开第二轴 ——
         早前用「W - m.right」定位，而 m.right 同时含右轴与图例，
         图例就正好压在右轴线和它的刻度上。 */
      const ownW = w + sym * 2.6 + 5 + 2;
      const afterAxis = g.x0 + g.w + (ctx._rightAxisW || 0) + 2;
      x0 = Math.max(ctx.canvas.W - ownW, afterAxis);
      y0 = g.y0 + Math.max(0, (g.h - items.length * rowH) / 2);
      vertical = true;
    } else if (pos === 'top' || pos === 'bottom') {
      const widths = items.map(it => textW(it.label, fs) + sym * 3 + 10);
      const total = widths.reduce((a, b) => a + b, 0);
      x0 = g.x0 + Math.max(0, (g.w - total) / 2);
      y0 = pos === 'top' ? (st.title.show ? ctx.canvas.m.top - rowH - 2 : 2) : ctx.canvas.H - rowH - 1;
      vertical = false;
    } else { // left
      x0 = 4; y0 = g.y0;
      vertical = true;
    }

    const grp = el('g', { 'class': 'oi-legend' });
    if (st.legend.title) {
      grp.appendChild(el('text', {
        x: x0, y: y0 - (vertical ? 3 : 0) - (vertical ? 0 : rowH), 'font-size': fs * 0.95,
        'font-family': f.family, fill: f.color, 'font-weight': 600
      }, st.legend.title));
      if (vertical) y0 += fs * 1.2;
    }
    let cx = x0, cy = y0;
    items.forEach((it, i) => {
      const r = (sym / 2) * (fs / 6.5);
      const markKind = legendMarkKind(ctx.type);
      const mk = el('g', {});
      if (markKind === 'line') {
        mk.appendChild(el('line', { x1: cx, y1: cy + rowH / 2, x2: cx + sym * 2.4, y2: cy + rowH / 2, stroke: it.color, 'stroke-width': pt(st.marks.lineW * 1.2) }));
        mk.appendChild(el('circle', { cx: cx + sym * 1.2, cy: cy + rowH / 2, r: Math.max(1.2, r * 0.9), fill: it.color }));
      } else if (markKind === 'box') {
        mk.appendChild(el('rect', { x: cx, y: cy + rowH / 2 - sym * 0.6, width: sym * 2, height: sym * 1.2, fill: it.color, 'fill-opacity': 0.35, stroke: it.color, 'stroke-width': pt(0.7) }));
        mk.appendChild(el('line', { x1: cx, y1: cy + rowH / 2, x2: cx + sym * 2, y2: cy + rowH / 2, stroke: it.color, 'stroke-width': pt(1) }));
      } else {
        mk.appendChild(el('rect', { x: cx, y: cy + rowH / 2 - sym * 0.62, width: sym * 1.5, height: sym * 1.24, fill: it.color, stroke: st.marks.bar.outline === 'none' ? 'none' : CG.presets.shade(it.color, -0.2), 'stroke-width': pt(0.5) }));
      }
      const tw = sym * 2.6 + 5;
      mk.appendChild(el('text', {
        x: cx + tw, y: cy + rowH / 2 + fs * 0.34, 'font-size': fs,
        'font-family': f.family, fill: f.color
      }, it.label));
      grp.appendChild(mk);
      if (vertical) cy += rowH + gap;
      else cx += tw + textW(it.label, fs) + 12;
    });
    if (st.legend.frame) {
      const bb = grp.getBBox();
      const rect = el('rect', {
        x: bb.x - 4, y: bb.y - 3, width: bb.width + 8, height: bb.height + 6,
        fill: 'none', stroke: '#b9c0c9', 'stroke-width': pt(0.6)
      });
      grp.insertBefore(rect, grp.firstChild);
    }
    svg.appendChild(grp);
  }
  function legendMarkKind(type) {
    if (type === 'line' || type === 'dose' || type === 'dual') return 'line';
    if (type === 'box' || type === 'violin') return 'box';
    if (type === 'km') return 'line';
    return 'bar';
  }

  /** 热图色阶图例 */
  function drawRampLegend(svg, ctx, meas, g) {
    const st = ctx.style;
    if (!st.legend.show || st.legend.pos === 'none') return;
    const mx = ctx._heat;
    if (!mx) return;
    const f = st.font, fs = meas.legPx;
    const w = 9, hgt = Math.min(70, g.h * 0.6);
    const slot = ctx._rampLegendW || 34;
    const x = ctx.canvas.W - slot + 4;
    const y = g.y0 + (g.h - hgt) / 2;
    const grad = el('linearGradient', { id: 'oi-ramp', x1: '0', y1: '1', x2: '0', y2: '0' });
    const stops = CG.presets.ramp(st.marks.heat.ramp).stops;
    stops.forEach((c, i) => {
      const off = i / (stops.length - 1);
      grad.appendChild(el('stop', { offset: (st.marks.heat.reverse ? 1 - off : off) * 100 + '%', 'stop-color': c }));
    });
    const defs = el('defs', {});
    defs.appendChild(grad);
    svg.appendChild(defs);
    svg.appendChild(el('rect', { x, y, width: w, height: hgt, fill: 'url(#oi-ramp)', stroke: '#c9cfd6', 'stroke-width': pt(0.4) }));
    const n = 5;
    for (let i = 0; i < n; i++) {
      const v = mx.min + (mx.max - mx.min) * i / (n - 1);
      const yy = y + hgt - hgt * i / (n - 1);
      svg.appendChild(el('line', { x1: x + w, y1: yy, x2: x + w + 2, y2: yy, stroke: f.color, 'stroke-width': pt(0.5) }));
      svg.appendChild(el('text', { x: x + w + 4, y: yy + fs * 0.34, 'font-size': fs, 'font-family': f.family, fill: f.color }, num(v, 2)));
    }
  }

  /* ═════════ 自绘：显著性标注 ═════════ */
  function drawStats(svg, ctx, meas) {
    const st = ctx.style;
    const t = ctx.type;
    if (['bar', 'grouped-bar', 'box', 'violin'].indexOf(t) < 0) return;
    const stats = ctx._stats;
    if (!stats || stats.length < 2) return;

    // 分组数据
    let groupsArr, names, posOf;
    if (t === 'grouped-bar') {
      // 每个子组内比较主组 —— 暂以子组为整体做标注太复杂，改为按子组分组比较
      groupsArr = [];
      names = [];
      ctx._groups.forEach(gp => {
        groupsArr.push(gp.values);
        names.push(gp.name);
      });
      posOf = (i) => {
        const rows = stats.filter(s => s.g === ctx._groups[i].name);
        if (!rows.length) return null;
        const c = ctx.geom.xOf(rows[0].x);
        const w = rows.length > 1 ? Math.abs(ctx.geom.xOf(rows[rows.length - 1].x) - c) : 10;
        return { x: c, half: Math.max(6, w / 2 + 4), top: Math.max.apply(null, rows.map(r => r.hi)) };
      };
    } else {
      groupsArr = ctx._groups.map(g => g.values);
      names = ctx._groups.map(g => g.name);
      posOf = (i) => {
        const s = stats[i];
        if (!s) return null;
        const b = ctx.geom.bandOf(names[i]);
        return { x: b ? b.center : ctx.geom.xOf(names[i]), half: b ? b.width / 2 : 8, top: s.hi };
      };
    }

    const view = st.stats.view === 'paired' ? 'paired' : 'unpaired';
    const plan = ctx._annotPlan;
    if (!plan) return;
    const ph = plan.ph;

    // 位置与高度：括号锚在两侧柱顶「较高」的那个（像素 y 更小 = 更高）
    const yPixOf = ctx.geom.yOf;
    plan.comps.forEach(c => {
      const a = posOf(c.i), b = posOf(c.j);
      c._a = a; c._b = b;
      if (a && b) c._h = Math.min(yPixOf(a.top), yPixOf(b.top));
    });
    const comps = plan.comps.filter(c => c._a && c._b);
    if (!comps.length) return;

    const plotBot = ctx.geom.y0 + ctx.geom.h;
    const stepPx = plan.stepPx;

    const grp = el('g', { 'class': 'oi-stats' });
    const label = (c) => {
      if (st.stats.annot === 'p') return 'p = ' + S.fmtP(c.pAdj);
      if (st.stats.annot === 'both') return c.stars === 'ns' ? 'ns' : c.stars + ' (p=' + S.fmtP(c.pAdj) + ')';
      return c.stars;
    };
    comps.forEach(c => {
      /* 自然位置 = 略高于本组两侧柱顶。顶部留白已由 annotPlan 预留，
         整摞括号落在绘图区「之上」是正常的；只有当最靠上那条连画布顶
         都放不下时，才整体下移（不是逐层下移，那样会把括号压进柱子里）。 */
      c._nat = Math.min(c._h, plotBot) - stepPx * 0.5 - c._level * stepPx;
    });
    const minNat = Math.min.apply(null, comps.map(c => c._nat));
    const shift = Math.max(0, (plan.labelH + 2) - minNat);

    comps.forEach(c => {
      const style = st.stats.annotStyle;
      const x1 = c._a.x, x2 = c._b.x;
      const txt = label(c);
      const fs = plan.fs;
      const ns = c.stars === 'ns';

      if (style === 'star') {
        // 直接标在两侧柱顶中较高的那个上方，不画连接线、不叠层
        grp.appendChild(el('text', {
          x: (x1 + x2) / 2, y: Math.min(yPixOf(c._a.top), yPixOf(c._b.top)) - 3,
          'text-anchor': 'middle', 'font-size': fs, 'font-family': st.font.family,
          'font-weight': ns ? 400 : 600, fill: st.font.color
        }, txt));
        return;
      }

      const yb = c._nat + shift;
      if (style === 'bar') {
        // 一条水平横线 + 线中央上方的文字
        grp.appendChild(el('line', {
          x1: x1, y1: yb, x2: x2, y2: yb,
          stroke: st.font.color, 'stroke-width': pt(st.axes.spine)
        }));
        grp.appendChild(el('text', {
          x: (x1 + x2) / 2, y: yb - 3, 'text-anchor': 'middle',
          'font-size': fs, 'font-family': st.font.family,
          'font-weight': ns ? 400 : 600, fill: st.font.color
        }, txt));
        return;
      }

      // 默认：方括号（两端下垂的折线）+ 缺口上方的文字
      grp.appendChild(el('path', {
        d: 'M' + x1 + ',' + yb + 'V' + (yb - 3.2) + 'H' + x2 + 'V' + yb,
        fill: 'none', stroke: st.font.color, 'stroke-width': pt(st.axes.spine * 0.85),
        'stroke-linecap': 'round'
      }));
      grp.appendChild(el('text', {
        x: (x1 + x2) / 2, y: yb - 4.2, 'text-anchor': 'middle',
        'font-size': fs, 'font-family': st.font.family,
        'font-weight': ns ? 400 : 600,
        fill: st.font.color
      }, txt));
    });
    ctx._posthocResult = ph;
    svg.appendChild(grp);
  }

  /* ═════════ 自绘：自定义标注 ═════════ */
  function drawAnnots(svg, ctx, meas) {
    const list = ctx.style.annots || [];
    if (!list.length) return;
    const f = ctx.style.font, g = ctx.geom;
    const grp = el('g', { 'class': 'oi-annots' });
    list.forEach(a => {
      const X = (v) => ctx.geom.xOf(v), Y = (v) => ctx.geom.yOf(v);
      if (a.type === 'text') {
        const t = el('text', {
          x: X(a.x1), y: Y(a.y1),
          'text-anchor': a.anchor || 'start', 'font-size': pt(a.size || f.tick * 1.05),
          'font-family': f.family, fill: a.color || f.color,
          'font-weight': a.bold ? 600 : 400,
          'data-oi': 'annot.' + a.id, 'data-annid': a.id,
          'dominant-baseline': a.baseline || 'auto'
        }, a.text || '');
        grp.appendChild(t);
      } else if (a.type === 'line' || a.type === 'arrow') {
        const l = el('line', {
          x1: X(a.x1), y1: Y(a.y1), x2: X(a.x2), y2: Y(a.y2),
          stroke: a.color || f.color, 'stroke-width': pt(a.width || 0.8),
          'stroke-dasharray': a.dash ? '3,2' : null,
          'marker-end': a.type === 'arrow' ? 'url(#oi-arrow)' : null,
          'data-oi': 'annot.' + a.id, 'data-annid': a.id
        });
        grp.appendChild(l);
      } else if (a.type === 'rect') {
        const x1 = X(a.x1), x2 = X(a.x2), y1 = Y(a.y1), y2 = Y(a.y2);
        grp.appendChild(el('rect', {
          x: Math.min(x1, x2), y: Math.min(y1, y2),
          width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
          fill: a.fill || 'none', stroke: a.color || f.color,
          'stroke-width': pt(a.width || 0.8), opacity: a.opacity || 1,
          'data-oi': 'annot.' + a.id, 'data-annid': a.id
        }));
      }
    });
    // 箭头 marker
    if (list.some(a => a.type === 'arrow')) {
      const defs = el('defs', {});
      const mk = el('marker', { id: 'oi-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
      mk.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: ctx.style.font.color }));
      defs.appendChild(mk);
      svg.appendChild(defs);
    }
    svg.appendChild(grp);
  }

  /* ═════════ 元素索引 ═════════ */
  function tagElements(svg, ctx) {
    const index = [];
    ctx._markKeys = ctx._markKeys || [];
    const groups = svg.querySelectorAll('g[class*="oi-"]');
    groups.forEach(g => {
      const cls = g.getAttribute('class') || '';
      const m = cls.match(/oi-([a-z0-9]+)/);
      if (!m) return;
      const key = m[1];
      const kids = Array.from(g.children);
      kids.forEach((k, i) => {
        if (k.tagName === 'title') return;
        k.setAttribute('data-oi', key + '.' + i);
        k.setAttribute('data-oikey', key);
        k.setAttribute('data-oiidx', i);
        index.push({ key, i, node: k });
      });
    });
    return index;
  }
  C.tagElements = tagElements;

  /** 给选中元素加高亮（不改变图形本身） */
  C.highlight = function (svg, sel) {
    svg.querySelectorAll('.oi-hl').forEach(n => n.classList.remove('oi-hl'));
    if (!sel) return null;
    const node = svg.querySelector('[data-oi="' + sel + '"]');
    if (!node) return null;
    node.classList.add('oi-hl');
    try {
      return node.getBoundingClientRect();
    } catch (e) { return null; }
  };

  /* ═════════ 元素信息（用于属性面板与悬停提示） ═════════ */
  C.describeElement = function (ctx, key, idx) {
    const map = {
      bar: '柱子', err: '误差棒', errcap: '误差棒帽', dotpt: '散点', dot: '数据点',
      line: '折线', linemark: '点标记', fit: '拟合曲线', fitci: '置信带',
      box: '箱体', boxwhisker: '须', boxcap: '须帽', boxmed: '中位线', boxpt: '离群点',
      violin: '密度轮廓', violinbox: '内嵌箱体', violinmed: '内嵌中位线', violinwhisk: '内嵌须', violinpt: '散点',
      cell: '色块', celltext: '数值', ec50: 'EC50 参考线',
      kmline: '生存曲线', kmcensor: '删失标记', kmci: '置信带',
      rocline: 'ROC 曲线', diag: '对角线', rocbest: '最佳截断点',
      line2: '右轴曲线', linemark2: '右轴点'
    };
    const name = map[key] || key;
    const parts = [];
    if (ctx.type === 'bar' || ctx.type === 'box' || ctx.type === 'violin') {
      const g = ctx._groups[idx];
      if (g) parts.push(g.name);
      const s = ctx._stats && ctx._stats[idx];
      if (s && isFinite(s.mean)) parts.push('均值 ' + num(s.mean, 3) + ' / n=' + (s.n || 0));
      if (s && isFinite(s.q2)) parts.push('中位 ' + num(s.q2, 3));
    } else if (ctx.type === 'grouped-bar') {
      const s = ctx._stats && ctx._stats[idx];
      if (s) parts.push(s.g + ' · ' + s.sub, '均值 ' + num(s.mean, 3) + ' / n=' + s.n);
    } else if (ctx._long && ctx._long[idx]) {
      const d = ctx._long[idx];
      parts.push('x=' + num(parseFloat(d.x), 3) + ', y=' + num(d.y, 3));
      if (d.s && d.s !== '—') parts.push(d.s);
    }
    return { key, idx, label: name + (parts.length ? '：' + parts.join('，') : ''), name, parts };
  };

  C.builders = builders;
  CG.chart = C;
})(typeof window !== 'undefined' ? window : globalThis);
