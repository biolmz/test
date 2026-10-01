/* ═══════════════════════════════════════════════════════════
   FigForge · 数据表模型与导入  (js/data.js)
   四类数据表：XY / 分组 / 双因素 / 生存
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const CG = global.CG || (global.CG = {});
  const D = {};

  /* ───────────────── 表类型定义 ───────────────── */
  D.KINDS = [
    {
      id: 'column', name: '分组表', short: '分组',
      desc: '每列一组独立样本',
      hint: '每列 = 一个组（列名即组名），每行 = 一次重复。适合柱状图、箱线图、小提琴图与组间统计检验。',
      roles: ['Y']
    },
    {
      id: 'xy', name: 'XY 表', short: 'XY',
      desc: 'X 列 + 多列 Y',
      hint: '第一列作 <b>X（自变量）</b>，其后每列是一个 Y 序列。适合折线、散点、回归、剂量-反应与动力学曲线。',
      roles: ['X', 'Y']
    },
    {
      id: 'grouped', name: '双因素表', short: '双因素',
      desc: '行 = 主组，列 = 子组',
      hint: '第一列是<b>行标签（主组）</b>，其余列是<b>子组</b>（如时间点、剂量）。适合分组/堆叠柱状图与热图。',
      roles: ['G', 'Y']
    },
    {
      id: 'survival', name: '生存表', short: '生存',
      desc: '时间 + 事件 + 分组',
      hint: '三列：<b>时间</b>、<b>事件状态</b>（1 = 事件发生，0 = 删失）、<b>分组</b>。用于 Kaplan-Meier 曲线与 log-rank 检验。',
      roles: ['X', 'V', 'G']
    }
  ];
  D.kind = (id) => D.KINDS.find(k => k.id === id) || D.KINDS[0];

  /* 列角色 */
  D.ROLES = [
    { id: 'X', name: '自变量 X', desc: '数值或类别，作为横轴' },
    { id: 'Y', name: '测量值 Y', desc: '数值，每个 Y 列是一个序列/组' },
    { id: 'G', name: '分组', desc: '分类变量，决定颜色与分组' },
    { id: 'E', name: '误差', desc: '与同行 Y 配对的误差值（如 ±SD）' },
    { id: 'V', name: '事件 0/1', desc: '生存分析：1 = 事件，0 = 删失' },
    { id: 'L', name: '标签', desc: '数据点文字标签' },
    { id: 'I', name: '忽略', desc: '不参与绘图' }
  ];
  D.ROLE_NAME = (id) => (D.ROLES.find(r => r.id === id) || { name: id }).name;

  /* ───────────────── 工具 ───────────────── */
  let _seq = 0;
  D.uid = (p) => (p || 'id') + '_' + (++_seq) + '_' + Math.random().toString(36).slice(2, 7);

  /** 固定种子伪随机（示例数据可复现） */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  D.rng = rng;
  /** 正态分布采样（Box-Muller） */
  function gauss(r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  D.gauss = gauss;

  D.isNum = function (v) {
    if (v === null || v === undefined || v === '') return false;
    if (typeof v === 'number') return isFinite(v);
    return /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(String(v));
  };
  D.num = (v) => D.isNum(v) ? parseFloat(v) : NaN;

  /* ───────────────── 新建 ───────────────── */
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function makeCol(name, role) {
    return { id: D.uid('col'), name: name, role: role || 'Y' };
  }

  /**
   * 新建数据表
   * @param {string} kind 'column'|'xy'|'grouped'|'survival'
   * @param {object} opt {rows, cols, names, title}
   */
  D.newDataset = function (kind, opt) {
    opt = opt || {};
    kind = kind || 'column';
    const kdef = D.kind(kind);
    const nRows = opt.rows || 6;
    const nCols = opt.cols || (kind === 'xy' ? 4 : kind === 'survival' ? 3 : 5);
    const cols = [];
    for (let c = 0; c < nCols; c++) {
      let role = 'Y', name;
      if (kind === 'xy') { role = c === 0 ? 'X' : 'Y'; name = c === 0 ? 'X' : 'Y' + c; }
      else if (kind === 'grouped') { role = c === 0 ? 'G' : 'Y'; name = c === 0 ? '组别' : '子组' + c; }
      else if (kind === 'survival') { role = ['X', 'V', 'G'][c] || 'I'; name = ['时间', '事件', '分组'][c] || '列' + LETTERS[c]; }
      else { role = 'Y'; name = (opt.names && opt.names[c]) || ('组 ' + LETTERS[c]); }
      cols.push(makeCol(name, role));
    }
    const rows = [];
    for (let r = 0; r < nRows; r++) {
      const row = [];
      for (let c = 0; c < nCols; c++) {
        if (kind === 'xy' && c === 0) row.push(r + 1);
        else if (kind === 'survival' && cols[c].role === 'G') row.push('组 A');
        else if (kind === 'survival' && cols[c].role === 'V') row.push(1);
        else if (kind === 'grouped' && c === 0) row.push('处理 ' + (r + 1));
        else row.push('');
      }
      rows.push(row);
    }
    return {
      id: D.uid('ds'),
      name: opt.title || (kdef.name + ' ' + (_seq % 97 + 1)),
      kind: kind,
      columns: cols,
      rows: rows
    };
  };

  /** 深拷贝 */
  D.clone = function (ds) {
    return {
      id: ds.id, name: ds.name, kind: ds.kind,
      columns: ds.columns.map(c => Object.assign({}, c)),
      rows: ds.rows.map(r => r.slice())
    };
  };

  /* ───────────────── 文本解析 ───────────────── */
  /** 猜测分隔符 */
  function detectSep(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 12);
    if (!lines.length) return '\t';
    const cands = ['\t', ',', ';', '|'];
    let best = '\t', bestScore = -1;
    for (const sep of cands) {
      const counts = lines.map(l => l.split(sep).length);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const consistent = counts.every(c => c === counts[0]);
      const score = avg * (consistent ? 2 : 1);
      if (avg > 1 && score > bestScore) { bestScore = score; best = sep; }
    }
    if (bestScore <= 0) {
      // 用空白分隔（多空格 / 单空格）
      const wsCounts = lines.map(l => l.trim().split(/\s+/).length);
      if (wsCounts[0] > 1) return /\s+/;
    }
    return best;
  }
  D.detectSep = detectSep;

  /** 按行拆分（处理引号） */
  function splitLine(line, sep) {
    if (sep instanceof RegExp) return line.trim().split(sep);
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.replace(/^\s+|\s+$/g, ''));
  }

  /**
   * 解析文本为二维数组
   * @returns {{rows:string[][], sep:string, hasHeader:boolean}}
   */
  D.parseTable = function (text, sep) {
    text = String(text).replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
    sep = sep || detectSep(text);
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return { rows: [], sep: sep, hasHeader: false };
    const raw = lines.map(l => splitLine(l, sep));
    const width = Math.max.apply(null, raw.map(r => r.length));
    raw.forEach(r => { while (r.length < width) r.push(''); });

    // 判断首行是否为表头：首行含非数值且其余行某列是数值
    let hasHeader = false;
    if (raw.length > 1) {
      const first = raw[0];
      const rest = raw.slice(1);
      const firstNonNum = first.filter(v => v !== '' && !D.isNum(v)).length;
      const colHasNum = [];
      for (let c = 0; c < width; c++) {
        colHasNum[c] = rest.some(r => D.isNum(r[c]));
      }
      const headLooksText = firstNonNum >= Math.max(1, Math.floor(width * 0.5));
      if (headLooksText && colHasNum.some(Boolean)) hasHeader = true;
      // 第一行全非数值、第二行有数值 → 表头
      if (!hasHeader && first.every(v => !D.isNum(v)) && rest[0] && rest[0].some(v => D.isNum(v))) hasHeader = true;
    }
    return { rows: raw, sep: sep, hasHeader: hasHeader };
  };

  /**
   * 从文本创建数据表（自动判断类型与角色）
   */
  D.fromText = function (text, opt) {
    opt = opt || {};
    const parsed = D.parseTable(text, opt.sep);
    if (!parsed.rows.length) return { ok: false, msg: '没有解析到任何数据行' };
    const raw = parsed.rows;
    const width = raw[0].length;
    let header, body;
    if (parsed.hasHeader) { header = raw[0]; body = raw.slice(1); }
    else {
      header = [];
      for (let c = 0; c < width; c++) header.push('列 ' + LETTERS[c]);
      body = raw;
    }

    // 自动判断表类型
    let kind = opt.kind;
    if (!kind) {
      const col0AllNum = body.every(r => r[0] === '' || D.isNum(r[0]));
      const anyNum = [];
      for (let c = 1; c < width; c++) anyNum[c] = body.some(r => D.isNum(r[c]));
      const allColsNum = [];
      for (let c = 0; c < width; c++) allColsNum[c] = body.filter(r => r[c] !== '').length > 0 &&
        body.filter(r => r[c] !== '').every(r => D.isNum(r[c]));
      const nNumCols = allColsNum.filter(Boolean).length;
      if (!col0AllNum && nNumCols === width - 1) kind = 'grouped';      // 首列文本 + 其余数值
      else if (allColsNum.every(Boolean)) kind = 'xy';                   // 全数值
      else if (col0AllNum && nNumCols >= 2) kind = 'xy';
      else kind = 'column';
    }

    const cols = [];
    for (let c = 0; c < width; c++) {
      let role = 'Y';
      if (kind === 'xy') role = c === 0 ? 'X' : 'Y';
      else if (kind === 'grouped') role = c === 0 ? 'G' : 'Y';
      else if (kind === 'survival') role = ['X', 'V', 'G'][c] || 'I';
      // 若该列全是非数值 → 文本列
      const vals = body.map(r => r[c]).filter(v => v !== '');
      const allText = vals.length > 0 && vals.every(v => !D.isNum(v));
      if (allText && role === 'Y') role = 'G';
      if (allText && role === 'X') role = 'G';
      cols.push(makeCol(String(header[c] || ('列 ' + LETTERS[c])).trim() || ('列 ' + LETTERS[c]), role));
    }
    // 生存表：若第二列是 0/1 则标为 V
    if (kind === 'survival' && cols[1]) cols[1].role = 'V';

    // XY 表中取值仅 {0,1} 的列视为分类标签（如 ROC 的真值列、二分类结局）
    if (kind === 'xy') {
      for (let c = 1; c < width; c++) {
        const vals = body.map(r => String(r[c]).trim()).filter(v => v !== '');
        if (vals.length < 3) continue;
        const uniq = Array.from(new Set(vals));
        if (uniq.length <= 2 && uniq.every(v => v === '0' || v === '1' || v === '0.0' || v === '1.0')) {
          cols[c].role = 'G';
        }
      }
    }

    return { ok: true, dataset: { id: D.uid('ds'), name: opt.title || '导入的数据', kind, columns: cols, rows: body } };
  };

  /** 数据表 → CSV 文本 */
  D.toCSV = function (ds) {
    const esc = (v) => {
      v = (v === null || v === undefined) ? '' : String(v);
      return /[",\n\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [ds.columns.map(c => esc(c.name)).join(',')];
    ds.rows.forEach(r => lines.push(r.map(esc).join(',')));
    return lines.join('\r\n');
  };
  /** 数据表 → TSV（用于复制到 Excel） */
  D.toTSV = function (ds) {
    const lines = [ds.columns.map(c => c.name).join('\t')];
    ds.rows.forEach(r => lines.push(r.map(v => v === null || v === undefined ? '' : String(v)).join('\t')));
    return lines.join('\n');
  };

  /* ───────────────── 规范化长表 ───────────────── */
  /**
   * 把任意类型的数据表摊平成统一长表，供绘图消费
   * 每条记录：{ x, y, err, g, sub, s, row, col, label, raw }
   *   x   横轴值（数值或类别）
   *   y   纵轴值
   *   err 误差值（可选）
   *   g   主分组（决定颜色 / 统计分组）
   *   sub 次级分组（双因素表的子组，用于分组柱状图的横轴）
   *   s   序列名（图例名，一般等于 g）
   */
  D.flatten = function (ds) {
    const out = [];
    if (!ds) return out;
    const cols = ds.columns;
    const idxOf = (role) => cols.map((c, i) => c.role === role ? i : -1).filter(i => i >= 0);

    if (ds.kind === 'xy') {
      const xi = cols.findIndex(c => c.role === 'X');
      const xIdx = xi >= 0 ? xi : 0;
      const yIdx = idxOf('Y').filter(i => i !== xIdx);
      const gi = cols.findIndex(c => c.role === 'G');
      if (yIdx.length) {
        // 宽表：每个 Y 列是一条序列
        yIdx.forEach(ci => {
          const name = cols[ci].name;
          ds.rows.forEach((row, ri) => {
            const yv = row[ci];
            if (!D.isNum(yv)) return;
            out.push({
              x: row[xIdx], y: D.num(yv),
              err: NaN, g: name, sub: null, s: name,
              row: ri, col: ci, label: null, raw: row
            });
          });
        });
      } else if (gi >= 0 && gi !== xIdx) {
        // 窄表：单变量 + 分类标签（每行一个观测），如 ROC / 两组散点
        ds.rows.forEach((row, ri) => {
          const v = row[xIdx];
          if (!D.isNum(v)) return;
          const gname = String(row[gi] === '' || row[gi] === undefined ? '—' : row[gi]);
          out.push({
            x: D.num(v), y: D.num(v), err: NaN,
            g: gname, sub: null, s: gname,
            row: ri, col: xIdx, label: null, raw: row
          });
        });
      } else {
        // 只有一个数值列：当作单变量分布
        ds.rows.forEach((row, ri) => {
          const v = row[xIdx];
          if (!D.isNum(v)) return;
          out.push({
            x: D.num(v), y: D.num(v), err: NaN,
            g: cols[xIdx].name, sub: null, s: cols[xIdx].name,
            row: ri, col: xIdx, label: null, raw: row
          });
        });
      }
    } else if (ds.kind === 'column') {
      const yIdx = cols.map((c, i) => c.role === 'Y' || c.role === 'L' || c.role === 'E' ? i : -1).filter(i => i >= 0);
      const eIdx = cols.findIndex(c => c.role === 'E');
      const lIdx = cols.findIndex(c => c.role === 'L');
      const use = cols.map((c, i) => c.role === 'Y' ? i : -1).filter(i => i >= 0);
      (use.length ? use : yIdx).forEach(ci => {
        const name = cols[ci].name;
        ds.rows.forEach((row, ri) => {
          const yv = row[ci];
          if (!D.isNum(yv)) return;
          out.push({
            x: name, y: D.num(yv),
            err: eIdx >= 0 && D.isNum(row[eIdx]) ? D.num(row[eIdx]) : NaN,
            g: name, sub: null, s: name,
            row: ri, col: ci,
            label: lIdx >= 0 ? row[lIdx] : null,
            raw: row
          });
        });
      });
    } else if (ds.kind === 'grouped') {
      const gi = cols.findIndex(c => c.role === 'G');
      const gIdx = gi >= 0 ? gi : 0;
      cols.forEach((c, ci) => {
        if (ci === gIdx || c.role !== 'Y') return;
        const sub = c.name;
        ds.rows.forEach((row, ri) => {
          const yv = row[ci];
          if (!D.isNum(yv)) return;
          const gname = String(row[gIdx] || '').trim() || ('组 ' + (ri + 1));
          out.push({
            x: sub, y: D.num(yv), err: NaN,
            g: gname, sub: sub, s: gname,
            row: ri, col: ci, label: null, raw: row
          });
        });
      });
    } else if (ds.kind === 'survival') {
      const ti = cols.findIndex(c => c.role === 'X');
      const vi = cols.findIndex(c => c.role === 'V');
      const gi = cols.findIndex(c => c.role === 'G');
      const tIdx = ti >= 0 ? ti : 0;
      const vIdx = vi >= 0 ? vi : 1;
      const gIdx = gi >= 0 ? gi : 2;
      ds.rows.forEach((row, ri) => {
        if (!D.isNum(row[tIdx])) return;
        out.push({
          time: D.num(row[tIdx]),
          event: D.isNum(row[vIdx]) ? (D.num(row[vIdx]) ? 1 : 0) : 1,
          g: String(row[gIdx] === undefined || row[gIdx] === '' ? '组 1' : row[gIdx]),
          x: D.num(row[tIdx]), y: D.num(row[tIdx]),
          err: NaN, sub: null,
          s: String(row[gIdx] === undefined || row[gIdx] === '' ? '组 1' : row[gIdx]),
          row: ri, col: tIdx, label: null, raw: row
        });
      });
    }
    return out;
  };

  /** 取出分组列表 [{name, values:number[], key}]（按出现顺序，可用于配色） */
  D.groups = function (ds, maybeLong) {
    const long = maybeLong || D.flatten(ds);
    const map = new Map();
    long.forEach(d => {
      const k = d.g === null || d.g === undefined ? '—' : String(d.g);
      if (!map.has(k)) map.set(k, { name: k, key: k, values: [], rows: [] });
      const g = map.get(k);
      g.values.push(d.y);
      g.rows.push(d);
    });
    return Array.from(map.values());
  };

  /** 双因素下的子组列表 */
  D.subGroups = function (ds, maybeLong) {
    const long = maybeLong || D.flatten(ds);
    const s = [];
    long.forEach(d => { if (d.sub !== null && d.sub !== undefined && s.indexOf(d.sub) < 0) s.push(d.sub); });
    return s;
  };

  /** 热图矩阵：{rowLabels, colLabels, values[r][c], min, max} */
  D.matrix = function (ds) {
    const long = D.flatten(ds);
    const colLabels = [], rowLabels = [];
    const m = new Map();
    long.forEach(d => {
      let cl, rl;
      if (ds.kind === 'grouped') { cl = d.sub; rl = d.g; }
      else if (ds.kind === 'column') { cl = d.g; rl = '第 ' + (d.row + 1) + ' 次'; }
      else { cl = d.s; rl = String(d.x); }
      if (colLabels.indexOf(cl) < 0) colLabels.push(cl);
      if (rowLabels.indexOf(rl) < 0) rowLabels.push(rl);
      m.set(rl + '\u0000' + cl, d.y);
    });
    const values = rowLabels.map(rl => colLabels.map(cl => {
      const v = m.get(rl + '\u0000' + cl);
      return v === undefined ? NaN : v;
    }));
    let min = Infinity, max = -Infinity;
    values.forEach(r => r.forEach(v => { if (isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); } }));
    if (!isFinite(min)) { min = 0; max = 1; }
    return { rowLabels, colLabels, values, min, max };
  };

  /**
   * 回归 / 拟合用的点对（按序列分组）
   * @returns {{name:string, pts:[[x,y]], colorIndex:number}[]}
   */
  D.xySeries = function (ds) {
    const long = D.flatten(ds);
    const map = new Map();
    long.forEach(d => {
      if (ds.kind === 'survival') return;
      const k = d.s;
      if (!map.has(k)) map.set(k, { name: k, pts: [] });
      const x = D.num(d.x !== undefined && D.isNum(d.x) ? d.x : null);
      if (isFinite(x) && isFinite(d.y)) map.get(k).pts.push([x, d.y]);
    });
    const arr = Array.from(map.values());
    arr.forEach(s => s.pts.sort((a, b) => a[0] - b[0]));
    return arr;
  };

  /** 该表适合哪些统计检验 */
  D.suggestTest = function (ds) {
    if (ds.kind === 'survival') return 'logrank';
    if (ds.kind === 'xy') return 'regression';
    const g = D.groups(ds);
    if (g.length === 2) return 'ttest';
    if (g.length > 2) return 'anova';
    return 'descriptive';
  };

  /* ───────────────── 内置示例数据 ───────────────── */
  function build(seed, fn) {
    const r = rng(seed);
    return fn(r);
  }

  D.samples = {};

  // ① 发芽率 · 处理浓度梯度 —— 6 个浓度，10 次重复（%）
  D.samples.germination = function () {
    const levels = ['0 mg/L', '50 mg/L', '100 mg/L', '150 mg/L', '200 mg/L', '250 mg/L'];
    const base = [88.5, 87.6, 85.2, 78.4, 70.6, 61.3];
    const sp = [2.9, 3.1, 3.4, 4.2, 5.1, 6.0];
    const cols = levels.map(n => ({ id: D.uid('col'), name: n, role: 'Y' }));
    const rows = [];
    for (let i = 0; i < 10; i++) {
      const row = [];
      levels.forEach((n, j) => {
        const r = rng(1000 + j * 37 + i * 7);
        row.push((base[j] + gauss(r) * sp[j]).toFixed(1));
      });
      rows.push(row);
    }
    return { id: D.uid('ds'), name: '发芽率（浓度梯度）', kind: 'column', columns: cols, rows: rows };
  };

  // ② 抗氧化活性剂量-反应（DPPH 清除率 vs 提取物浓度）
  D.samples.dose = function () {
    const conc = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 400];
    const cols = [
      { id: D.uid('col'), name: '浓度 (µg/mL)', role: 'X' },
      { id: D.uid('col'), name: 'DPPH 清除率 (%)', role: 'Y' },
      { id: D.uid('col'), name: 'ABTS 清除率 (%)', role: 'Y' },
      { id: D.uid('col'), name: '还原力 (A700)', role: 'Y' }
    ];
    const model = (x, bot, top, ec, hill) => bot + (top - bot) / (1 + Math.pow(10, (Math.log10(ec) - Math.log10(x)) * hill));
    const rows = conc.map((x, i) => {
      const r = rng(2024 + i * 13);
      return [
        x,
        (model(x, 4.2, 92.5, 46, 1.34) + gauss(r) * 1.6).toFixed(2),
        (model(x, 2.8, 96.1, 22, 1.18) + gauss(r) * 2.1).toFixed(2),
        (model(x, 0.045, 1.42, 88, 1.05) + gauss(r) * 0.03).toFixed(3)
      ];
    });
    return { id: D.uid('ds'), name: '抗氧化剂量-反应', kind: 'xy', columns: cols, rows: rows };
  };

  // ③ 贮藏期质构变化（双因素：配方 × 贮藏天数）
  D.samples.storage = function () {
    const days = [0, 7, 14, 21, 28];
    const cols = [{ id: D.uid('col'), name: '配方', role: 'G' }];
    days.forEach(d => cols.push({ id: D.uid('col'), name: '第 ' + d + ' 天', role: 'Y' }));
    const formulas = [
      { name: '对照', v: [42.5, 40.1, 37.8, 34.2, 30.6] },
      { name: '配方 A', v: [41.8, 40.4, 38.9, 36.5, 33.8] },
      { name: '配方 B', v: [40.2, 39.1, 37.6, 35.4, 32.9] }
    ];
    const rows = formulas.map((f, fi) => {
      const r = rng(700 + fi * 91);
      return [f.name].concat(f.v.map(v => (v + gauss(r) * 0.9).toFixed(1)));
    });
    return { id: D.uid('ds'), name: '贮藏期硬度变化 (N)', kind: 'grouped', columns: cols, rows: rows };
  };

  // ④ 生存数据（两处理组，某指标达标时间）
  D.samples.survival = function () {
    const rows = [];
    const add = (g, times, censorIdx) => {
      const r = rng(3000 + g.length * 17);
      times.forEach((t, i) => {
        rows.push([t, censorIdx.indexOf(i) >= 0 ? 0 : 1, g]);
      });
    };
    add('对照组', [8, 11, 13, 15, 16, 18, 20, 22, 24, 27, 31, 35, 40, 46], [9, 12]);
    add('处理组', [14, 18, 21, 25, 28, 30, 34, 37, 41, 45, 48, 52, 55, 60], [10, 13]);
    return {
      id: D.uid('ds'), name: '生存分析（达标时间）', kind: 'survival',
      columns: [
        { id: D.uid('col'), name: '时间 (天)', role: 'X' },
        { id: D.uid('col'), name: '事件 (1/0)', role: 'V' },
        { id: D.uid('col'), name: '分组', role: 'G' }
      ],
      rows: rows
    };
  };

  // ⑤ 抑菌圈直径（4 组 × 6 重复，含离群点，适合做箱线/小提琴）
  D.samples.inhibition = function () {
    const groups = [
      { n: '空白对照', m: 0.4, s: 0.18 },
      { n: '水提物', m: 8.6, s: 0.95 },
      { n: '醇提物', m: 12.4, s: 1.35 },
      { n: '阳性对照', m: 16.2, s: 1.1 }
    ];
    const cols = groups.map(g => ({ id: D.uid('col'), name: g.n, role: 'Y' }));
    const rows = [];
    for (let i = 0; i < 6; i++) {
      rows.push(groups.map((g, j) => {
        const r = rng(555 + j * 29 + i * 11);
        return Math.max(0, g.m + gauss(r) * g.s).toFixed(2);
      }));
    }
    return { id: D.uid('ds'), name: '抑菌圈直径 (mm)', kind: 'column', columns: cols, rows: rows };
  };

  // ⑥ ROC 数据（某生化指标诊断效能）
  D.samples.roc = function () {
    const rows = [];
    const nr = rng(8888);
    for (let i = 0; i < 30; i++) rows.push([(4.1 + gauss(nr) * 1.25).toFixed(2), 0]);
    for (let i = 0; i < 30; i++) rows.push([(6.8 + gauss(nr) * 1.55).toFixed(2), 1]);
    return {
      id: D.uid('ds'), name: '诊断指标 ROC', kind: 'xy',
      columns: [
        { id: D.uid('col'), name: '指标值', role: 'X' },
        { id: D.uid('col'), name: '是否患病', role: 'G' }
      ],
      rows: rows
    };
  };

  /* sampleList 的 chart 字段是「这套数据最适合的图形」，
     载入后直接切过去，用户不用自己猜该选哪个图。 */
  D.sampleList = [
    { id: 'germination', name: '发芽率（浓度梯度）', note: '分组表 · 6 个浓度 × 10 次重复', chart: 'bar' },
    { id: 'dose', name: '抗氧化剂量-反应', note: 'XY 表 · 3 条清除率曲线', chart: 'dose' },
    { id: 'storage', name: '贮藏期硬度变化', note: '双因素表 · 3 配方 × 5 时间点', chart: 'heatmap' },
    { id: 'inhibition', name: '抑菌圈直径', note: '分组表 · 4 组，含个体差异', chart: 'box' },
    { id: 'survival', name: '生存分析', note: '生存表 · 2 组，含删失', chart: 'km' },
    { id: 'roc', name: '诊断指标 ROC', note: 'XY 表 · 30 阳性 / 30 阴性', chart: 'roc' }
  ];

  CG.data = D;
})(typeof window !== 'undefined' ? window : globalThis);
