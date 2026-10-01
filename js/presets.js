/* ═══════════════════════════════════════════════════════════
   FigForge · 期刊预设 / 配色 / 单位换算  (js/presets.js)
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const CG = global.CG || (global.CG = {});
  const P = {};

  /* ───────────────── 单位换算 ───────────────── */
  // SVG 用户单位 = CSS px（96 dpi）
  const PX_PER_MM = 96 / 25.4;       // 3.7795275591
  const PX_PER_PT = 96 / 72;         // 1.3333333
  P.mm2px = (mm) => mm * PX_PER_MM;
  P.px2mm = (px) => px / PX_PER_MM;
  P.mm2pt = (mm) => mm * 72 / 25.4;
  P.pt2mm = (pt) => pt * 25.4 / 72;
  P.pt2px = (pt) => pt * PX_PER_PT;
  P.px2pt = (px) => px / PX_PER_PT;
  P.PX_PER_MM = PX_PER_MM;
  P.PX_PER_PT = PX_PER_PT;

  /* ───────────────── 字体 ───────────────── */
  P.fonts = [
    { id: 'arial', name: 'Arial / Helvetica', css: 'Arial, Helvetica, "Helvetica Neue", sans-serif', kind: 'sans' },
    { id: 'helvetica', name: 'Helvetica', css: 'Helvetica, Arial, sans-serif', kind: 'sans' },
    { id: 'times', name: 'Times New Roman', css: '"Times New Roman", Times, serif', kind: 'serif' },
    { id: 'georgia', name: 'Georgia', css: 'Georgia, "Times New Roman", serif', kind: 'serif' },
    { id: 'calibri', name: 'Calibri', css: 'Calibri, "Segoe UI", sans-serif', kind: 'sans' },
    { id: 'segoe', name: 'Segoe UI', css: '"Segoe UI", system-ui, sans-serif', kind: 'sans' },
    { id: 'simsun', name: '宋体 SimSun', css: 'SimSun, "Songti SC", serif', kind: 'cn-serif' },
    { id: 'simhei', name: '黑体 SimHei', css: 'SimHei, "Heiti SC", sans-serif', kind: 'cn-sans' },
    { id: 'yahei', name: '微软雅黑', css: '"Microsoft YaHei", "PingFang SC", sans-serif', kind: 'cn-sans' },
    { id: 'mono', name: '等宽 Consolas', css: 'Consolas, "SF Mono", Menlo, monospace', kind: 'mono' }
  ];
  P.fontCss = function (id) {
    const f = P.fonts.find(x => x.id === id);
    return f ? f.css : P.fonts[0].css;
  };
  P.fontOf = function (css) {
    return P.fonts.find(f => f.css === css) || P.fonts.find(f => css && css.indexOf(f.css.split(',')[0].replace(/"/g, '')) >= 0) || P.fonts[0];
  };

  /* ───────────────── 期刊 / 场景预设 ───────────────── */
  // 尺寸单位 mm；字号单位 pt（与投稿要求一致）
  P.journals = [
    {
      id: 'default', name: '通用默认', note: '100 × 70 mm，7 pt —— 适合绝大多数报告与预印本',
      w: 100, h: 70, font: 'arial', base: 7, label: 8, tick: 7, legend: 7, title: 9,
      spine: 0.75, tickLen: 2.4, lineW: 1.2, markerSize: 3
    },
    {
      id: 'nature', name: 'Nature', note: '单栏 89 mm / 双栏 183 mm，Arial 5–7 pt，线条 ≤0.75 pt',
      w: 89, h: 66, font: 'arial', base: 6, label: 7, tick: 6, legend: 6, title: 8,
      spine: 0.6, tickLen: 2, lineW: 1, markerSize: 2.6
    },
    {
      id: 'science', name: 'Science', note: '1 列 55 mm / 2 列 120 mm / 3 列 183 mm，Helvetica 6–7 pt',
      w: 120, h: 80, font: 'helvetica', base: 6.5, label: 7.5, tick: 6.5, legend: 6.5, title: 8.5,
      spine: 0.6, tickLen: 2, lineW: 1, markerSize: 2.6
    },
    {
      id: 'cell', name: 'Cell / Cell Press', note: '单栏 85 mm / 双栏 174 mm，Arial 6–8 pt',
      w: 85, h: 62, font: 'arial', base: 7, label: 8, tick: 7, legend: 7, title: 9,
      spine: 0.75, tickLen: 2.4, lineW: 1.2, markerSize: 3
    },
    {
      id: 'acs', name: 'ACS（美国化学会）', note: '单栏 82.6 mm / 双栏 178 mm，Helvetica 4.5–8 pt',
      w: 82.6, h: 60, font: 'helvetica', base: 7, label: 8, tick: 7, legend: 7, title: 9,
      spine: 0.75, tickLen: 2.4, lineW: 1.1, markerSize: 3
    },
    {
      id: 'elsevier', name: 'Elsevier', note: '单栏 90 mm / 双栏 190 mm，Arial 7–8 pt',
      w: 90, h: 65, font: 'arial', base: 7.5, label: 8.5, tick: 7.5, legend: 7.5, title: 9.5,
      spine: 0.75, tickLen: 2.4, lineW: 1.2, markerSize: 3
    },
    {
      id: 'wiley', name: 'Wiley', note: '单栏 84 mm / 双栏 174 mm，Arial 7–8 pt',
      w: 84, h: 62, font: 'arial', base: 7.5, label: 8.5, tick: 7.5, legend: 7.5, title: 9.5,
      spine: 0.75, tickLen: 2.4, lineW: 1.2, markerSize: 3
    },
    {
      id: 'ieee', name: 'IEEE', note: '单栏 88.9 mm / 双栏 181 mm，Times 8 pt',
      w: 88.9, h: 65, font: 'times', base: 8, label: 9, tick: 8, legend: 8, title: 10,
      spine: 0.8, tickLen: 2.6, lineW: 1.2, markerSize: 3
    },
    {
      id: 'plos', name: 'PLOS ONE', note: '宽度 79–190 mm，Arial 8–12 pt',
      w: 120, h: 85, font: 'arial', base: 9, label: 10, tick: 9, legend: 9, title: 11,
      spine: 0.8, tickLen: 2.6, lineW: 1.3, markerSize: 3.5
    },
    {
      id: 'thesis', name: '学位论文 / 报告（中文）', note: '160 × 110 mm，黑体/宋体，适合正文插图',
      w: 160, h: 110, font: 'simhei', base: 10.5, label: 11, tick: 10.5, legend: 10.5, title: 12,
      spine: 1, tickLen: 3, lineW: 1.5, markerSize: 4
    },
    {
      id: 'slide', name: '演示 / 海报', note: '220 × 130 mm，字号放大，适合 PPT 与墙报',
      w: 220, h: 130, font: 'yahei', base: 16, label: 18, tick: 16, legend: 16, title: 20,
      spine: 1.6, tickLen: 5, lineW: 2.4, markerSize: 6
    },
    {
      id: 'single-col', name: '单栏小图（55 mm）', note: '55 × 45 mm，极小版面维持可读性',
      w: 55, h: 45, font: 'arial', base: 6, label: 6.5, tick: 6, legend: 6, title: 7,
      spine: 0.5, tickLen: 1.8, lineW: 0.9, markerSize: 2.2
    },
    {
      id: 'square', name: '正方形（100 mm）', note: '100 × 100 mm，适合散点/相关/热图',
      w: 100, h: 100, font: 'arial', base: 7, label: 8, tick: 7, legend: 7, title: 9,
      spine: 0.75, tickLen: 2.4, lineW: 1.2, markerSize: 3
    },
    {
      id: 'wide', name: '宽幅时间序列（170 mm）', note: '170 × 70 mm，适合动力学/色谱/生存曲线',
      w: 170, h: 70, font: 'arial', base: 7, label: 8, tick: 7, legend: 7, title: 9,
      spine: 0.75, tickLen: 2.4, lineW: 1.2, markerSize: 2.8
    }
  ];

  /* ───────────────── 配色板 ───────────────── */
  P.palettes = [
    {
      id: 'okabe-ito', name: 'Okabe-Ito', note: '色盲友好，Nature Methods 推荐',
      colors: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000']
    },
    {
      id: 'npg', name: 'NPG（Nature）', note: 'Nature 系列期刊常用',
      colors: ['#E64B35', '#4DBBD5', '#00A087', '#3C5488', '#F39B7F', '#8491B4', '#91D1C2', '#DC0000', '#7E6148', '#B09C85']
    },
    {
      id: 'aaas', name: 'AAAS（Science）', note: 'Science 系列期刊常用',
      colors: ['#3B4992', '#EE0000', '#008B45', '#631879', '#008280', '#BB0021', '#5F559B', '#A20056', '#808180', '#1B1919']
    },
    {
      id: 'lancet', name: 'Lancet', note: '柳叶刀风格',
      colors: ['#00468B', '#ED0000', '#42B540', '#0099B4', '#925E9F', '#FDAF91', '#AD002A', '#ADB6B6', '#1B1919']
    },
    {
      id: 'nejm', name: 'NEJM', note: '新英格兰医学杂志风格',
      colors: ['#BC3C29', '#0072B5', '#E18727', '#20854E', '#7876B1', '#6F99AD', '#FFDC91', '#EE4C97']
    },
    {
      id: 'jco', name: 'JCO', note: '临床肿瘤学杂志风格',
      colors: ['#0073C2', '#EFC000', '#868686', '#CD534C', '#7AA6DC', '#003C67', '#8F7700', '#3B3B3B']
    },
    {
      id: 'jama', name: 'JAMA', note: '美国医学会杂志风格',
      colors: ['#374E55', '#DF8F44', '#00A1D5', '#B24745', '#79AF97', '#6A6599', '#80796B']
    },
    {
      id: 'prism', name: 'Prism 经典', note: 'GraphPad Prism 默认观感',
      colors: ['#1F4E79', '#C00000', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#4E342E']
    },
    {
      id: 'tableau', name: 'Tableau 10', note: '通用对比度好',
      colors: ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC']
    },
    {
      id: 'set2', name: 'Set2（柔和）', note: 'ColorBrewer 柔和分类色',
      colors: ['#66C2A5', '#FC8D62', '#8DA0CB', '#E78AC3', '#A6D854', '#FFD92F', '#E5C494', '#B3B3B3']
    },
    {
      id: 'dark2', name: 'Dark2（深色）', note: 'ColorBrewer 深色分类色',
      colors: ['#1B9E77', '#D95F02', '#7570B3', '#E7298A', '#66A61E', '#E6AB02', '#A6761D', '#666666']
    },
    {
      id: 'grayscale', name: '灰阶', note: '黑白印刷 / 单色投稿必备',
      colors: ['#000000', '#404040', '#787878', '#A8A8A8', '#C8C8C8', '#E0E0E0', '#F0F0F0', '#FFFFFF']
    },
    {
      id: 'warm', name: '暖色系', note: '强调"处理 / 升高"',
      colors: ['#7F2704', '#A63603', '#D94801', '#F16913', '#FD8D3C', '#FDAE6B', '#FDD0A2', '#FEE6CE']
    },
    {
      id: 'cool', name: '冷色系', note: '强调"对照 / 降低"',
      colors: ['#08306B', '#08519C', '#2171B5', '#4292C6', '#6BAED6', '#9ECAE1', '#C6DBEF', '#DEEBF7']
    },
    {
      id: 'twotone', name: '双色对比（蓝 / 橙）', note: '两组比较的最佳选择',
      colors: ['#0072B2', '#D55E00', '#009E73', '#CC79A7']
    }
  ];

  /** 热图 / 连续型色阶 */
  P.ramps = [
    {
      id: 'viridis', name: 'Viridis', type: 'sequential', note: '感知均匀，默认首选',
      stops: ['#440154', '#482878', '#3E4989', '#31688E', '#26828E', '#1F9E89', '#35B779', '#6DCD59', '#B4DE2C', '#FDE725']
    },
    {
      id: 'magma', name: 'Magma', type: 'sequential', note: '感知均匀，暗底亮顶',
      stops: ['#000004', '#1C1044', '#4F127B', '#812581', '#B5367A', '#E55063', '#FB8761', '#FEC287', '#FBFDBE', '#FCFDBF']
    },
    {
      id: 'rdbu', name: '红-蓝（双向）', type: 'diverging', note: '有正负中心的数据',
      stops: ['#053061', '#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B', '#67001F']
    },
    {
      id: 'rdylgn', name: '红-黄-绿（双向）', type: 'diverging', note: '表达量高低差异',
      stops: ['#A50026', '#D73027', '#F46D43', '#FDAE61', '#FEE08B', '#FFFFBF', '#D9EF8B', '#A6D96A', '#66BD63', '#1A9850', '#006837']
    },
    {
      id: 'blues', name: '蓝色渐变', type: 'sequential', note: '单色浓度 / 强度',
      stops: ['#F7FBFF', '#DEEBF7', '#C6DBEF', '#9ECAE1', '#6BAED6', '#4292C6', '#2171B5', '#08519C', '#08306B']
    },
    {
      id: 'greys', name: '灰阶渐变', type: 'sequential', note: '黑白印刷热图',
      stops: ['#FFFFFF', '#F0F0F0', '#D9D9D9', '#BDBDBD', '#969696', '#737373', '#525252', '#252525', '#000000']
    }
  ];

  P.palette = function (id) {
    return P.palettes.find(p => p.id === id) || P.palettes[0];
  };
  P.ramp = function (id) {
    return P.ramps.find(r => r.id === id) || P.ramps[0];
  };
  /** 取第 i 个颜色（超出长度则循环，灰阶则按比例取） */
  P.colorAt = function (id, i) {
    const pal = P.palette(id);
    const n = pal.colors.length;
    if (id === 'grayscale') {
      const t = n > 1 ? (i % n) / (n - 1) : 0;
      const v = Math.round(255 * (1 - t * 0.92));
      return 'rgb(' + v + ',' + v + ',' + v + ')';
    }
    return pal.colors[((i % n) + n) % n];
  };
  /** 色阶插值 */
  P.rampColor = function (id, t) {
    const stops = P.ramp(id).stops;
    t = Math.max(0, Math.min(1, t));
    const x = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i;
    const c1 = hex2rgb(stops[i]), c2 = hex2rgb(stops[i + 1]);
    return 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * f) + ',' +
      Math.round(c1[1] + (c2[1] - c1[1]) * f) + ',' +
      Math.round(c1[2] + (c2[2] - c1[2]) * f) + ')';
  };
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  P.hex2rgb = hex2rgb;
  P.rgb2hex = function (r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  };
  /** 明暗调整 */
  P.shade = function (hex, amt) {
    const c = hex2rgb(hex);
    return P.rgb2hex(
      amt >= 0 ? c[0] + (255 - c[0]) * amt : c[0] * (1 + amt),
      amt >= 0 ? c[1] + (255 - c[1]) * amt : c[1] * (1 + amt),
      amt >= 0 ? c[2] + (255 - c[2]) * amt : c[2] * (1 + amt)
    );
  };
  /** 相对亮度是否偏暗（用于决定叠加文字颜色） */
  P.isDark = function (hex) {
    const c = hex2rgb(hex);
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 140;
  };

  /* ───────────────── 形状 ───────────────── */
  P.shapes = [
    { id: 'circle', name: '实心圆' },
    { id: 'circle-open', name: '空心圆' },
    { id: 'square', name: '方块' },
    { id: 'square-open', name: '空心方块' },
    { id: 'triangle', name: '三角' },
    { id: 'triangle-down', name: '倒三角' },
    { id: 'diamond', name: '菱形' },
    { id: 'cross', name: '十字' },
    { id: 'x', name: '叉' },
    { id: 'star', name: '星形' },
    { id: 'plus', name: '加号' }
  ];

  /**
   * 生成形状的 SVG path（用于导出与渲染保持一致）
   * @param {string} id 形状 id
   * @param {number} r  半径（px）
   */
  P.shapePath = function (id, r) {
    const s = r * 0.92;
    switch (id) {
      case 'square': return 'M' + (-r) + ',' + (-r) + 'h' + (2 * r) + 'v' + (2 * r) + 'h' + (-2 * r) + 'Z';
      case 'square-open': return 'M' + (-r) + ',' + (-r) + 'h' + (2 * r) + 'v' + (2 * r) + 'h' + (-2 * r) + 'Z';
      case 'triangle': return 'M0,' + (-r) + 'L' + r + ',' + s + 'L' + (-r) + ',' + s + 'Z';
      case 'triangle-down': return 'M0,' + r + 'L' + r + ',' + (-s) + 'L' + (-r) + ',' + (-s) + 'Z';
      case 'diamond': return 'M0,' + (-r) + 'L' + r + ',0L0,' + r + 'L' + (-r) + ',0Z';
      case 'cross': return 'M' + (-r) + ',0H' + r + 'M0,' + (-r) + 'V' + r;
      case 'x': return 'M' + (-r * 0.75) + ',' + (-r * 0.75) + 'L' + (r * 0.75) + ',' + (r * 0.75) +
        'M' + (r * 0.75) + ',' + (-r * 0.75) + 'L' + (-r * 0.75) + ',' + (r * 0.75);
      case 'plus': return 'M' + (-r) + ',0H' + r + 'M0,' + (-r) + 'V' + r;
      case 'star': {
        let d = '';
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5;
          const rr = i % 2 ? r * 0.45 : r;
          d += (i ? 'L' : 'M') + (Math.cos(a) * rr).toFixed(3) + ',' + (Math.sin(a) * rr).toFixed(3);
        }
        return d + 'Z';
      }
      default: return null; // circle 用 <circle> 元素
    }
  };
  P.isOpenShape = (id) => /-open$/.test(id);
  P.isLineShape = (id) => id === 'cross' || id === 'x' || id === 'plus';

  /* ───────────────── 默认样式（图表配置的单一事实来源） ───────────────── */
  P.defaultStyle = function (presetId) {
    const jp = P.journals.find(j => j.id === (presetId || 'default')) || P.journals[0];
    return {
      preset: jp.id,
      size: { w: jp.w, h: jp.h, unit: 'mm' },
      font: {
        family: P.fontCss(jp.font),
        base: jp.base, label: jp.label, tick: jp.tick,
        legend: jp.legend, title: jp.title,
        color: '#000000', weight: 'normal'
      },
      axes: {
        frame: 'left-bottom',            // left-bottom | box | none | left
        spine: jp.spine, tickLen: jp.tickLen, tickDir: 'out', tickWidth: jp.spine,
        x: { label: '', log: false, reverse: false, ticks: null, min: null, max: null, rotate: 'auto', grid: false, showTickLabel: true },
        y: { label: '', log: false, reverse: false, ticks: null, min: null, max: null, grid: false, showTickLabel: true }
      },
      marks: {
        palette: 'okabe-ito',
        lineW: jp.lineW, markerSize: jp.markerSize,
        /* 双 Y 轴：走右轴的序列名。空字符串 = 自动取最后一个序列 */
        y2: { series: '' },
        bar: { width: 0.72, opacity: 1, strokeColor: null, strokeW: 0.5, corner: 0, outline: 'none', dodge: 'group' },
        line: { smooth: false, style: 'solid', marker: 'auto', markerFill: 'solid', showLine: true },
        dot: { size: jp.markerSize, shape: 'circle', opacity: 1, strokeW: 0.5, strokeColor: null, jitter: 0 },
        err: { show: true, type: 'sem', capSize: 2, width: jp.spine, color: null, cap: true, style: 'solid' },
        box: { width: 0.55, opacity: 0.28, medianW: 1.2, whisker: 'tukey', showPoints: 'none', pointSize: 2.4, capW: 0.4 },
        violin: { width: 0.82, opacity: 0.45, bandwidth: 0, showBox: 'box', showPoints: false, pointSize: 2.4, trim: true },
        heat: { ramp: 'viridis', gap: 1, showValue: false, valueSize: 6, borderW: 0.4, borderColor: '#ffffff', reverse: false },
        fit: { width: jp.lineW * 1.3, style: 'solid', ciOpacity: 0.16, showCI: true, showEq: true, eqSize: null },
        roc: { width: jp.lineW * 1.2, diagonal: true },
        km: { width: jp.lineW * 1.2, censor: true, censorSize: jp.markerSize * 0.9, showCI: false, ciOpacity: 0.14 }
      },
      legend: { show: true, pos: 'right', title: '', frame: false, itemGap: 3, markerSize: jp.markerSize, cols: null },
      /* 图标题：位置可在上/下，字号可单独覆盖预设（null = 跟 font.title） */
      title: { show: false, text: '', sub: '', subSize: null, pos: 'top', align: 'left', size: null, bold: true },
      grid: { show: false, color: '#EAEAEA', width: 0.4, style: 'solid', axis: 'y' },
      bg: { color: '#FFFFFF', show: true },
      stats: {
        show: false, test: 'auto', view: 'unpaired', welch: true,
        posthoc: 'holm',
        // 标注哪几组：control=每组与对照（默认，图面最干净）/ all / adjacent
        compare: 'control', control: 0,
        /* 两个字段各管一件事，别混：
           annot      标什么文字 → 'stars' 星号 / 'p' p 值 / 'both' 星号+p
           annotStyle 怎么画     → 'bracket' 括号 / 'bar' 横线 / 'star' 直接标柱顶 */
        annot: 'stars', annotStyle: 'bracket',
        // 默认只标显著项：6 组全两两是 15 条括号，即使最优着色也要 11 层，
        // 会把图面吃掉一半，所以默认只看显著的
        showNS: false,
        bracketStepPt: 2.6, starSize: null, pDigits: 3, showTestName: true
      },
      fit: { type: 'none', order: 2, logX: true, extend: 0 },
      /* 元素级覆盖：{ '<elemId>': {fill,stroke,strokeW,opacity,hidden,text,...} } */
      overrides: {},
      /* 自定义标注：{id,type:'text'|'line'|'arrow'|'rect'|'bracket', x1,y1,x2,y2,text,...} */
      annots: []
    };
  };

  /** 应用期刊预设到已有样式（保留数据映射与覆盖） */
  P.applyPreset = function (style, presetId) {
    const jp = P.journals.find(j => j.id === presetId);
    if (!jp) return style;
    const prev = P.journals.find(j => j.id === style.preset) || P.journals[0];
    const k = jp.base / (prev.base || 7);
    style.preset = jp.id;
    style.size = { w: jp.w, h: jp.h, unit: 'mm' };
    style.font.family = P.fontCss(jp.font);
    style.font.base = jp.base; style.font.label = jp.label; style.font.tick = jp.tick;
    style.font.legend = jp.legend; style.font.title = jp.title;
    style.axes.spine = jp.spine; style.axes.tickLen = jp.tickLen; style.axes.tickWidth = jp.spine;
    style.marks.lineW = jp.lineW;
    style.marks.markerSize = jp.markerSize;
    style.marks.dot.size = jp.markerSize;
    style.marks.err.width = jp.spine;
    style.marks.fit.width = jp.lineW * 1.3;
    style.marks.km.width = jp.lineW * 1.2;
    style.marks.roc.width = jp.lineW * 1.2;
    style.legend.markerSize = jp.markerSize;
    style._scale = k;
    return style;
  };

  P.journal = (id) => P.journals.find(j => j.id === id) || P.journals[0];

  CG.presets = P;
})(typeof window !== 'undefined' ? window : globalThis);
