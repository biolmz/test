/* ═══════════════════════════════════════════════════════════
   FigForge · 统计与拟合引擎  (js/stats.js)
   纯计算，无 DOM 依赖。

   分布函数用不完全 Beta / 不完全 Gamma 的连分式展开实现，
   数值精度 ~1e-12，可放心用于 p 值报告。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const CG = global.CG || (global.CG = {});
  const S = {};

  /* ───────────────── 特殊函数 ───────────────── */

  const LANCZOS = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];

  /** log Γ(x)，x>0 */
  function lnGamma(x) {
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += LANCZOS[j] / (++y);
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /** 正则化不完全 Beta 的连分式（Numerical Recipes betacf） */
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  /** 正则化不完全 Beta 函数 I_x(a,b) */
  function ibeta(x, a, b) {
    if (!(a > 0) || !(b > 0)) return NaN;
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }

  function gser(a, x) {
    const ITMAX = 500, EPS = 3e-14;
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n <= ITMAX; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }

  function gcf(a, x) {
    const ITMAX = 500, EPS = 3e-14, FPMIN = 1e-300;
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i <= ITMAX; i++) {
      const an = -i * (i - a);
      b += 2; d = an * d + b;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }

  /** 下不完全 Gamma P(a,x)（正则化） */
  function igamma(a, x) {
    if (!(a > 0) || x < 0) return NaN;
    if (x === 0) return 0;
    return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
  }

  /* ───────────────── 分布 CDF ───────────────── */

  /** 标准正态 CDF */
  function ncdf(z) {
    if (z === 0) return 0.5;
    const upper = 1 - igamma(0.5, z * z / 2); // P(|Z|>|z|)
    return z > 0 ? 1 - upper / 2 : upper / 2;
  }
  /** 标准正态分位数（Acklam 近似，精度 1.15e-9） */
  function nquant(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00];
    const pl = 0.02425, ph = 1 - pl;
    let q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > ph) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /** t 分布 CDF */
  function tcdf(t, df) {
    if (!(df > 0)) return NaN;
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5);
    return t > 0 ? 1 - p : p;
  }
  /** t 分布分位数 */
  function tinv(p, df) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    // 二分法，稳健
    let lo = -1e4, hi = 1e4;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (tcdf(mid, df) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /** t 分布双尾 p 值 */
  function tTest2p(t, df) { return 2 * (1 - tcdf(Math.abs(t), df)); }

  /** F 分布 CDF */
  function fcdf(f, df1, df2) {
    if (f <= 0) return 0;
    return ibeta(df1 * f / (df1 * f + df2), df1 / 2, df2 / 2);
  }
  /** F 分布上尾 p 值 */
  function fTestP(f, df1, df2) { return 1 - fcdf(f, df1, df2); }

  /** 卡方分布上尾 p 值 */
  function chi2UpperP(x2, df) { return 1 - igamma(df / 2, x2 / 2); }

  S.lnGamma = lnGamma; S.ibeta = ibeta; S.igamma = igamma;
  S.ncdf = ncdf; S.nquant = nquant; S.tcdf = tcdf; S.tinv = tinv;
  S.tTest2p = tTest2p; S.fcdf = fcdf; S.fTestP = fTestP; S.chi2UpperP = chi2UpperP;

  /* ───────────────── 描述统计 ───────────────── */

  function clean(arr) {
    return arr.filter(v => v !== null && v !== undefined && v !== '' && isFinite(+v)).map(Number);
  }
  S.clean = clean;

  function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }

  function variance(a, ddof) {
    const n = a.length; ddof = ddof === undefined ? 1 : ddof;
    if (n <= ddof) return NaN;
    const m = mean(a);
    return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (n - ddof);
  }
  function sd(a) { const v = variance(a, 1); return Math.sqrt(v); }
  function sem(a) { const n = a.length; return n ? sd(a) / Math.sqrt(n) : NaN; }

  /** 线性插值分位数（type 7，与 R 默认一致） */
  function quantile(a, p) {
    if (!a.length) return NaN;
    const s = a.slice().sort((x, y) => x - y);
    const n = s.length;
    if (n === 1) return s[0];
    const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  }

  /**
   * 描述统计
   * @param {number[]} raw
   * @returns {object}
   */
  S.describe = function (raw) {
    const a = clean(raw);
    const n = a.length;
    if (!n) return { n: 0 };
    const m = mean(a), s = sd(a), se = sem(a);
    return {
      n, mean: m, sd: s, sem: se, variance: variance(a, 1),
      median: quantile(a, 0.5), q1: quantile(a, 0.25), q3: quantile(a, 0.75),
      iqr: quantile(a, 0.75) - quantile(a, 0.25),
      min: Math.min.apply(null, a), max: Math.max.apply(null, a),
      sum: a.reduce((x, y) => x + y, 0),
      cv: m !== 0 ? Math.abs(s / m) * 100 : NaN,
      range: Math.max.apply(null, a) - Math.min.apply(null, a)
    };
  };

  /** 均值差/比例的 95% CI 半宽 */
  S.ci95 = function (raw) {
    const a = clean(raw);
    if (a.length < 2) return { lo: NaN, hi: NaN, margin: NaN };
    const t = tinv(0.975, a.length - 1);
    const m = t * sem(a);
    return { lo: mean(a) - m, hi: mean(a) + m, margin: m };
  };

  /** 根据误差棒类型算上下半宽 */
  S.errorBar = function (raw, type) {
    const a = clean(raw);
    if (!a.length) return { lo: NaN, hi: NaN };
    const d = S.describe(a);
    let h;
    switch (type) {
      case 'sd': h = d.sd; break;
      case 'sem': h = d.sem; break;
      case 'ci95': h = S.ci95(a).margin; break;
      case 'iqr': h = d.iqr / 2; break;
      case 'range': return { lo: d.mean - d.min, hi: d.max - d.mean };
      default: h = d.sd;
    }
    if (!isFinite(h)) h = 0;
    return { lo: h, hi: h };
  };

  /* ───────────────── 分布检验 ───────────────── */

  /**
   * D'Agostino-Pearson 正态性检验
   * 返回 {K2, p, skew, kurt}；n>=8 时有意义
   */
  S.normality = function (raw) {
    const a = clean(raw), n = a.length;
    if (n < 8) return { n, ok: false, msg: '样本量 < 8，不做正态性检验' };
    const m = mean(a);
    let m2 = 0, m3 = 0, m4 = 0;
    for (const v of a) { const d = v - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
    m2 /= n; m3 /= n; m4 /= n;
    if (!(m2 > 0)) return { n, ok: false, msg: '方差为 0' };

    // 偏度：D'Agostino 变换
    const g1 = m3 / Math.pow(m2, 1.5);
    const Y = g1 * Math.sqrt((n + 1) * (n + 3) / (6 * (n - 2)));
    const beta2 = 3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3) /
      ((n - 2) * (n + 5) * (n + 7) * (n + 9));
    const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
    const delta = 1 / Math.sqrt(0.5 * Math.log(W2));
    const alphaS = Math.sqrt(2 / (W2 - 1));
    const Z1 = delta * Math.asinh(Y / alphaS);

    // 峰度：Anscombe-Glynn 变换
    const b2 = m4 / (m2 * m2);
    const Eb2 = 3 * (n - 1) / (n + 1);
    const varb2 = 24 * n * (n - 2) * (n - 3) / ((n + 1) * (n + 1) * (n + 3) * (n + 5));
    const x = (b2 - Eb2) / Math.sqrt(varb2);
    const sqrtBeta1 = 6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9)) *
      Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)));
    const A = 6 + 8 / sqrtBeta1 * (2 / sqrtBeta1 + Math.sqrt(1 + 4 / (sqrtBeta1 * sqrtBeta1)));
    const Z2 = ((1 - 2 / (9 * A)) - Math.cbrt((1 - 2 / A) / (1 + x * Math.sqrt(2 / (A - 4))))) /
      Math.sqrt(2 / (9 * A));

    const K2 = Z1 * Z1 + Z2 * Z2;
    const p = chi2UpperP(K2, 2);
    return {
      n, ok: true, K2, p, Z1, Z2,
      skew: g1, kurt: b2 - 3, normal: p > 0.05
    };
  };

  /** Brown-Forsythe / Levene 方差齐性检验 */
  S.levene = function (groups) {
    const g = groups.map(x => clean(x)).filter(x => x.length >= 2);
    if (g.length < 2) return { ok: false, msg: '至少需要 2 组有效数据' };
    const z = g.map(arr => {
      const med = quantile(arr, 0.5);
      return arr.map(v => Math.abs(v - med));
    });
    const N = z.reduce((s, a) => s + a.length, 0);
    const k = z.length;
    const gm = mean([].concat.apply([], z));
    let ssb = 0, ssw = 0;
    for (const a of z) {
      const am = mean(a);
      ssb += a.length * (am - gm) * (am - gm);
      for (const v of a) ssw += (v - am) * (v - am);
    }
    const df1 = k - 1, df2 = N - k;
    if (df2 <= 0 || ssw <= 0) return { ok: false, msg: '组内方差为 0' };
    const F = (ssb / df1) / (ssw / df2);
    const p = fTestP(F, df1, df2);
    return { ok: true, F, df1, df2, p, equal: p > 0.05 };
  };

  /* ───────────────── 假设检验 ───────────────── */

  /** 非配对 t 检验（可选 Welch 校正） */
  S.ttestUnpaired = function (a0, b0, welch) {
    const a = clean(a0), b = clean(b0);
    const n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return { ok: false, msg: '每组至少需要 2 个数据点' };
    const m1 = mean(a), m2 = mean(b), v1 = variance(a, 1), v2 = variance(b, 1);
    const diff = m1 - m2;
    let se, df;
    if (welch !== false) {
      se = Math.sqrt(v1 / n1 + v2 / n2);
      const num = Math.pow(v1 / n1 + v2 / n2, 2);
      const den = Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1);
      df = den > 0 ? num / den : n1 + n2 - 2;
    } else {
      const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
      se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
      df = n1 + n2 - 2;
    }
    if (!(se > 0)) return { ok: false, msg: '组内方差为 0，无法计算' };
    const t = diff / se;
    const p = tTest2p(t, df);
    const tc = tinv(0.975, df);
    // Cohen's d（合并 SD）
    const sdPool = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
    return {
      ok: true, test: welch !== false ? "Welch's t-test" : "Student's t-test",
      t, df, p, diff, se, m1, m2, n1, n2,
      ciLo: diff - tc * se, ciHi: diff + tc * se,
      cohensD: sdPool > 0 ? diff / sdPool : NaN
    };
  };

  /** 配对 t 检验 */
  S.ttestPaired = function (a0, b0) {
    const a = [], b = [];
    const n = Math.min(a0.length, b0.length);
    for (let i = 0; i < n; i++) {
      const x = a0[i], y = b0[i];
      if (x !== '' && y !== '' && isFinite(+x) && isFinite(+y)) { a.push(+x); b.push(+y); }
    }
    const pairs = a.length;
    if (pairs < 2) return { ok: false, msg: '有效配对 < 2' };
    const d = a.map((v, i) => v - b[i]);
    const md = mean(d), sdd = sd(d), sed = sdd / Math.sqrt(pairs);
    if (!(sed > 0)) return { ok: false, msg: '配对差值为常数，无法检验' };
    const t = md / sed, df = pairs - 1;
    const p = tTest2p(t, df);
    const tc = tinv(0.975, df);
    return {
      ok: true, test: 'Paired t-test', t, df, p, diff: md, se: sed, n: pairs,
      m1: mean(a), m2: mean(b),
      ciLo: md - tc * sed, ciHi: md + tc * sed,
      cohensD: sdd > 0 ? md / sdd : NaN
    };
  };

  /** Mann-Whitney U（正态近似，含连续性校正） */
  S.mannWhitney = function (a0, b0) {
    const a = clean(a0), b = clean(b0);
    const n1 = a.length, n2 = b.length, N = n1 + n2;
    if (n1 < 2 || n2 < 2) return { ok: false, msg: '每组至少需要 2 个数据点' };
    const all = a.map(v => ({ v, g: 0 })).concat(b.map(v => ({ v, g: 1 })));
    all.sort((x, y) => x.v - y.v);
    // 平均秩（处理并列）
    const ranks = new Array(N);
    let i = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && all[j + 1].v === all[i].v) j++;
      const r = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[k] = r;
      i = j + 1;
    }
    let R1 = 0;
    for (let k = 0; k < N; k++) if (all[k].g === 0) R1 += ranks[k];
    const U1 = R1 - n1 * (n1 + 1) / 2;
    const U2 = n1 * n2 - U1;
    const U = Math.min(U1, U2);
    const mU = n1 * n2 / 2;
    // 并列校正
    let tieSum = 0;
    i = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && all[j + 1].v === all[i].v) j++;
      const t = j - i + 1;
      tieSum += t * t * t - t;
      i = j + 1;
    }
    const sigU = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tieSum / (N * (N - 1))));
    let z = (U - mU + 0.5 * Math.sign(mU - U)) / sigU;
    if (!isFinite(z)) z = 0;
    const p = 2 * (1 - ncdf(Math.abs(z)));
    return {
      ok: true, test: 'Mann-Whitney U', U, U1, U2, z, p,
      n1, n2, median1: quantile(a, 0.5), median2: quantile(b, 0.5),
      diff: quantile(a, 0.5) - quantile(b, 0.5)
    };
  };

  /** Wilcoxon 符号秩检验（配对，正态近似） */
  S.wilcoxon = function (a0, b0) {
    const d = [];
    const n = Math.min(a0.length, b0.length);
    for (let i = 0; i < n; i++) {
      const x = a0[i], y = b0[i];
      if (x !== '' && y !== '' && isFinite(+x) && isFinite(+y)) d.push(+x - +y);
    }
    if (d.length < 5) return { ok: false, msg: '有效配对 < 5' };
    const nz = d.filter(v => v !== 0);
    const N = nz.length;
    if (N < 5) return { ok: false, msg: '非零差值 < 5' };
    const abs = nz.map(Math.abs);
    const sorted = abs.slice().sort((x, y) => x - y);
    const ranks = abs.map(v => {
      const idx = sorted.indexOf(v);
      let j = idx;
      while (j + 1 < N && sorted[j + 1] === v) j++;
      return (idx + j) / 2 + 1;
    });
    let Wp = 0;
    nz.forEach((v, i) => { if (v > 0) Wp += ranks[i]; });
    const mW = N * (N + 1) / 4;
    const tieSum = (function () {
      let s = 0, i = 0;
      while (i < N) {
        let j = i;
        while (j + 1 < N && sorted[j + 1] === sorted[i]) j++;
        const t = j - i + 1;
        s += t * t * t - t;
        i = j + 1;
      }
      return s;
    })();
    const sigW = Math.sqrt(N * (N + 1) * (2 * N + 1) / 24 - tieSum / 48);
    const z = (Wp - mW) / sigW;
    const p = 2 * (1 - ncdf(Math.abs(z)));
    return { ok: true, test: 'Wilcoxon signed-rank', W: Wp, z, p, n: N, medianDiff: quantile(d, 0.5) };
  };

  /** 单因素 ANOVA（含 η²、ω²） */
  S.anova = function (groups, names) {
    const g = groups.map(x => clean(x));
    const valid = [];
    g.forEach((arr, i) => { if (arr.length >= 2) valid.push({ arr, name: (names && names[i]) || ('组 ' + (i + 1)) }); });
    if (valid.length < 2) return { ok: false, msg: '至少需要 2 组、每组 ≥2 个数据点' };
    const all = [].concat.apply([], valid.map(v => v.arr));
    const N = all.length, k = valid.length;
    const gm = mean(all);
    let ssb = 0, ssw = 0;
    for (const v of valid) {
      const am = mean(v.arr);
      ssb += v.arr.length * (am - gm) * (am - gm);
      for (const x of v.arr) ssw += (x - am) * (x - am);
    }
    const sst = ssb + ssw;
    const df1 = k - 1, df2 = N - k;
    if (df2 <= 0) return { ok: false, msg: '自由度不足' };
    const msb = ssb / df1, msw = ssw / df2;
    const F = msw > 0 ? msb / msw : Infinity;
    const p = fTestP(F, df1, df2);
    return {
      ok: true, test: 'One-way ANOVA', F, df1, df2, p,
      ssb, ssw, sst, msb, msw, rmse: Math.sqrt(msw), N, k,
      eta2: sst > 0 ? ssb / sst : NaN,
      omega2: (ssb - df1 * msw) / (sst + msw) || 0,
      groups: valid.map(v => ({
        name: v.name, n: v.arr.length, mean: mean(v.arr),
        sd: sd(v.arr), sem: sem(v.arr), data: v.arr
      }))
    };
  };

  /** 单因素重复测量 ANOVA */
  S.rmAnova = function (groups, names) {
    const k = groups.length;
    const n = Math.min.apply(null, groups.map(g => g.length));
    if (k < 2 || n < 2) return { ok: false, msg: '至少 2 个条件下的 ≥2 次完整测量' };
    const mat = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < k; j++) {
        const v = groups[j][i];
        if (v === '' || !isFinite(+v)) { row.length = 0; break; }
        row.push(+v);
      }
      if (row.length === k) mat.push(row);
    }
    const N = mat.length;
    if (N < 3) return { ok: false, msg: '完整配对 < 3' };
    const all = [].concat.apply([], mat);
    const gm = mean(all);
    const subjMeans = mat.map(r => mean(r));
    const condMeans = [];
    for (let j = 0; j < k; j++) condMeans.push(mean(mat.map(r => r[j])));
    let ssTotal = 0, ssSubj = 0, ssCond = 0;
    mat.forEach((r, i) => {
      r.forEach((v, j) => { ssTotal += (v - gm) * (v - gm); });
      ssSubj += k * (subjMeans[i] - gm) * (subjMeans[i] - gm);
    });
    condMeans.forEach((m) => { ssCond += N * (m - gm) * (m - gm); });
    const ssErr = ssTotal - ssSubj - ssCond;
    const df1 = k - 1, df2 = (N - 1) * (k - 1);
    if (df2 <= 0 || ssErr <= 0) return { ok: false, msg: '误差项为 0，数据可能无变异' };
    const F = (ssCond / df1) / (ssErr / df2);
    return {
      ok: true, test: 'RM ANOVA', F, df1, df2, p: fTestP(F, df1, df2),
      ssCond, ssErr, n: N, k,
      partialEta2: ssCond / (ssCond + ssErr),
      groups: groups.map((g, j) => ({ name: (names && names[j]) || ('条件 ' + (j + 1)), mean: condMeans[j], n: N }))
    };
  };

  /* ───────────────── 两两比较与多重校正 ───────────────── */

  /**
   * 事后两两比较：成对 t 检验 + 多重比较校正
   * @param {number[][]} groups
   * @param {string[]} names
   * @param {object} opt {method:'holm'|'bonferroni'|'fdr'|'none', view:'unpaired'|'paired', welch:bool}
   */
  S.posthoc = function (groups, names, opt) {
    opt = opt || {};
    const method = opt.method || 'holm';
    const view = opt.view || 'unpaired';
    // 比较集：默认全部两两；也可只比指定组合（例如「每组 vs 对照组」），
    // 此时多重校正的族大小 m 只算被选中的那些比较。
    const pairs = [];
    const seen = new Set();
    const push = (i, j) => {
      const a = Math.min(i, j), b = Math.max(i, j);
      if (a === b || !groups[a] || !groups[b]) return;
      const k = a + ':' + b;
      if (seen.has(k)) return;
      seen.add(k);
      pairs.push([a, b]);
    };
    if (opt.pairs && opt.pairs.length) {
      opt.pairs.forEach(p => push(p[0], p[1]));
    } else {
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) push(i, j);
      }
    }
    const list = [];
    pairs.forEach(([i, j]) => {
      const r = view === 'paired'
        ? S.ttestPaired(groups[i], groups[j])
        : S.ttestUnpaired(groups[i], groups[j], opt.welch !== false);
      if (!r.ok) return;
      list.push({
        i, j,
        a: (names && names[i]) || ('组 ' + (i + 1)),
        b: (names && names[j]) || ('组 ' + (j + 1)),
        diff: view === 'paired' ? r.diff : r.m1 - r.m2,
        t: r.t, df: r.df, pRaw: r.p,
        ciLo: r.ciLo, ciHi: r.ciHi,
        cohensD: r.cohensD
      });
    });
    if (!list.length) return { ok: false, msg: '无可比较的组' };
    const m = list.length;

    // 多重校正
    if (method === 'bonferroni') {
      list.forEach(c => { c.pAdj = Math.min(1, c.pRaw * m); });
    } else if (method === 'holm') {
      const idx = list.map((c, i) => i).sort((x, y) => list[x].pRaw - list[y].pRaw);
      let prev = 0;
      idx.forEach((k, rank) => {
        let v = Math.min(1, list[k].pRaw * (m - rank));
        v = Math.max(v, prev); // 单调不减
        prev = v;
        list[k].pAdj = v;
      });
    } else if (method === 'fdr') {
      const idx = list.map((c, i) => i).sort((x, y) => list[x].pRaw - list[y].pRaw);
      let prev = 1;
      for (let rank = m - 1; rank >= 0; rank--) {
        const k = idx[rank];
        let v = Math.min(1, list[k].pRaw * m / (rank + 1));
        v = Math.min(v, prev);
        prev = v;
        list[k].pAdj = v;
      }
    } else {
      list.forEach(c => { c.pAdj = c.pRaw; });
    }

    list.forEach(c => {
      c.p = c.pAdj;
      c.stars = S.stars(c.pAdj);
      c.sig = c.pAdj < 0.05;
    });
    return { ok: true, method, comparisons: list };
  };

  /** p 值 → 显著性星号 */
  S.stars = function (p) {
    if (!isFinite(p)) return 'ns';
    if (p < 1e-4) return '****';
    if (p < 1e-3) return '***';
    if (p < 1e-2) return '**';
    if (p < 0.05) return '*';
    return 'ns';
  };

  /** p 值格式化 */
  S.fmtP = function (p) {
    if (!isFinite(p)) return '—';
    if (p < 1e-15) return '< 1e-15';
    if (p < 0.0001) return p.toExponential(2).replace('e-', ' × 10⁻');
    if (p < 0.001) return p.toFixed(5);
    if (p < 0.01) return p.toFixed(4);
    return p.toFixed(3);
  };

  /** 数字格式化（有效数字；过小/过大自动转科学计数） */
  S.fmt = function (v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    digits = digits === undefined ? 3 : digits;
    const av = Math.abs(v);
    if (av !== 0 && (av < 1e-3 || av >= 1e5)) return v.toExponential(Math.max(1, digits - 1));
    const d = Math.max(0, digits - Math.max(0, Math.floor(Math.log10(av)) + 1));
    return v.toFixed(Math.min(8, av === 0 ? digits : d));
  };

  /* ───────────────── 线性代数（小型稠密） ───────────────── */

  /** 高斯-约当求逆 */
  S.inv = function (A0) {
    const n = A0.length;
    const A = A0.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-300) return null;
      const tmp = A[c]; A[c] = A[piv]; A[piv] = tmp;
      const d = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c];
        if (f === 0) continue;
        for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
      }
    }
    return A.map(r => r.slice(n));
  };

  /** 解 Ax=b */
  S.solve = function (A0, b0) {
    const n = A0.length;
    const A = A0.map(r => r.slice()), b = b0.slice();
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-300) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / A[c][c];
        if (f === 0) continue;
        for (let j = c; j < n; j++) A[r][j] -= f * A[c][j];
        b[r] -= f * b[c];
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let j = r + 1; j < n; j++) s -= A[r][j] * x[j];
      x[r] = s / A[r][r];
    }
    return x;
  };

  /* ───────────────── 回归与拟合 ───────────────── */

  /**
   * 一般最小二乘多项式拟合
   * @returns {coef:[c0,c1,...], ...}
   */
  S.polyfit = function (xs, ys, order) {
    const n = xs.length;
    if (n <= order) return { ok: false, msg: '数据点不足以拟合 ' + order + ' 阶多项式' };
    const m = order + 1;
    // 先中心化 + 缩放，避免高阶正规方程病态；拟合完再把系数精确变换回 x 空间
    const xm = mean(xs);
    let sxs = 0;
    for (const x of xs) sxs += (x - xm) * (x - xm);
    sxs = Math.sqrt(sxs / n);
    if (!(sxs > 0)) sxs = 1;
    const U = xs.map(x => (x - xm) / sxs);

    const XtX = Array.from({ length: m }, () => new Array(m).fill(0));
    const Xty = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      const p = new Array(m);
      p[0] = 1;
      for (let j = 1; j < m; j++) p[j] = p[j - 1] * U[i];
      for (let a = 0; a < m; a++) {
        Xty[a] += p[a] * ys[i];
        for (let b = 0; b < m; b++) XtX[a][b] += p[a] * p[b];
      }
    }
    const cu = S.solve(XtX, Xty);
    if (!cu) return { ok: false, msg: '设计矩阵奇异（自变量可能无变化或存在完全共线）' };

    // p(x) = Σ_k cu[k]·((x−xm)/sxs)^k  →  展开为 Σ_j coef[j]·x^j
    const binom = (a, b) => {
      if (b < 0 || b > a) return 0;
      let r = 1;
      for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1);
      return r;
    };
    // M[j][k] = (x−xm)^k 展开式中 x^j 的系数 / sxs^k
    const M = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let k = 0; k < m; k++) {
      const inv = 1 / Math.pow(sxs, k);
      for (let j = 0; j <= k; j++) M[j][k] = binom(k, j) * Math.pow(-xm, k - j) * inv;
    }
    const coef = new Array(m).fill(0);
    for (let k = 0; k < m; k++) for (let j = 0; j <= k; j++) coef[j] += M[j][k] * cu[k];

    const pred = xs.map(x => coef.reduce((s, c, j) => s + c * Math.pow(x, j), 0));
    let sse = 0, sst = 0;
    const ym = mean(ys);
    for (let i = 0; i < n; i++) {
      const r = ys[i] - pred[i]; sse += r * r; sst += (ys[i] - ym) * (ys[i] - ym);
    }
    const df = n - m;
    const mse = df > 0 ? sse / df : NaN;

    // 参数协方差经线性变换传递到 x 空间
    let se = null, cov = null;
    const covU = S.inv(XtX);
    if (covU) {
      cov = Array.from({ length: m }, () => new Array(m).fill(0));
      for (let j = 0; j < m; j++) {
        for (let k2 = j; k2 < m; k2++) {
          let v = 0;
          for (let p = 0; p < m; p++) {
            if (!M[j][p]) continue;
            for (let q = 0; q < m; q++) {
              if (!M[k2][q]) continue;
              v += M[j][p] * M[k2][q] * mse * covU[p][q];
            }
          }
          cov[j][k2] = v; cov[k2][j] = v;
        }
      }
      se = cov.map((r, i) => Math.sqrt(Math.max(0, r[i])));
    }

    return {
      ok: true, order, coef, se, cov, sse, mse, df, n,
      r2: sst > 0 ? 1 - sse / sst : NaN,
      adjR2: (sst > 0 && df > 0) ? 1 - (sse / df) / (sst / (n - 1)) : NaN,
      rmse: Math.sqrt(mse),
      eval: (x) => coef.reduce((s, c, j) => s + c * Math.pow(x, j), 0)
    };
  };

  /** 简单线性回归（含参数 CI、p 值） */
  S.linreg = function (xs, ys) {
    const fit = S.polyfit(xs, ys, 1);
    if (!fit.ok) return fit;
    const [a, b] = fit.coef; // coef = [截距, 斜率]，y = a + b·x
    const n = fit.n, df = fit.df;
    const sa = fit.se ? fit.se[0] : NaN, sb = fit.se ? fit.se[1] : NaN;
    const tb = sb > 0 ? b / sb : Infinity;
    const ta = sa > 0 ? a / sa : Infinity;
    const tc = df > 0 ? tinv(0.975, df) : NaN;
    // 斜率 95% CI
    const slopeCI = [b - tc * sb, b + tc * sb];
    // 换回截距形式的检验（H0: slope=0）
    return {
      ok: true, slope: b, intercept: a,
      seSlope: sb, seIntercept: sa,
      tSlope: tb, pSlope: tTest2p(tb, df),
      tIntercept: ta, pIntercept: tTest2p(ta, df),
      slopeCI, r2: fit.r2, adjR2: fit.adjR2, df, n, rmse: fit.rmse,
      sse: fit.sse,
      /** 在 x 处的预测值与 95% 置信带半宽 */
      predict: function (x) {
        const yh = a + b * x;
        const xm = mean(xs);
        const sxx = xs.reduce((s, v) => s + (v - xm) * (v - xm), 0);
        const seMean = Math.sqrt(fit.mse * (1 / n + Math.pow(x - xm, 2) / sxx));
        const sePred = Math.sqrt(fit.mse * (1 + 1 / n + Math.pow(x - xm, 2) / sxx));
        return { y: yh, ci: tc * seMean, pi: tc * sePred };
      }
    };
  };

  /**
   * Levenberg-Marquardt 非线性最小二乘
   * @param {(x:number, p:number[])=>number} model
   */
  S.fitLM = function (xs, ys, model, p0, opt) {
    opt = opt || {};
    const maxIter = opt.maxIter || 260;
    const n = xs.length, np = p0.length;
    let p = p0.slice();
    const sse = (pp) => {
      let s = 0;
      for (let i = 0; i < n; i++) { const r = ys[i] - model(xs[i], pp); s += r * r; }
      return s;
    };
    let cur = sse(p);
    let lambda = 1e-3;
    // 数值 Jacobian 步长
    const hstep = p.map(v => Math.max(1e-7, Math.abs(v) * 1e-5));
    let converged = false;
    for (let iter = 0; iter < maxIter; iter++) {
      const J = Array.from({ length: n }, () => new Array(np).fill(0));
      for (let j = 0; j < np; j++) {
        const pp = p.slice(); pp[j] += hstep[j];
        const pm = p.slice(); pm[j] -= hstep[j];
        for (let i = 0; i < n; i++) {
          J[i][j] = (model(xs[i], pp) - model(xs[i], pm)) / (2 * hstep[j]);
        }
      }
      const JtJ = Array.from({ length: np }, () => new Array(np).fill(0));
      const Jtr = new Array(np).fill(0);
      for (let a = 0; a < np; a++) {
        for (let b = a; b < np; b++) {
          let s = 0;
          for (let i = 0; i < n; i++) s += J[i][a] * J[i][b];
          JtJ[a][b] = s; JtJ[b][a] = s;
        }
        let s2 = 0;
        for (let i = 0; i < n; i++) s2 += J[i][a] * (ys[i] - model(xs[i], p));
        Jtr[a] = s2;
      }
      let improved = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const A = JtJ.map((r, a) => r.map((v, b) => a === b ? v * (1 + lambda) + 1e-12 : v));
        const delta = S.solve(A, Jtr);
        if (!delta) { lambda *= 10; continue; }
        const pn = p.map((v, a) => v + delta[a]);
        const sn = sse(pn);
        if (isFinite(sn) && sn < cur) {
          const rel = (cur - sn) / Math.max(cur, 1e-300);
          p = pn; cur = sn; lambda = Math.max(lambda / 8, 1e-12);
          improved = true;
          if (rel < 1e-12) { converged = true; }
          break;
        } else {
          lambda *= 10;
        }
      }
      if (converged) break;
      if (!improved) break;
    }
    // 参数标准误
    const J = Array.from({ length: n }, () => new Array(np).fill(0));
    for (let j = 0; j < np; j++) {
      const pp = p.slice(); pp[j] += hstep[j];
      const pm = p.slice(); pm[j] -= hstep[j];
      for (let i = 0; i < n; i++) J[i][j] = (model(xs[i], pp) - model(xs[i], pm)) / (2 * hstep[j]);
    }
    const JtJ = Array.from({ length: np }, () => new Array(np).fill(0));
    for (let a = 0; a < np; a++)
      for (let b = 0; b < np; b++) {
        let s = 0; for (let i = 0; i < n; i++) s += J[i][a] * J[i][b];
        JtJ[a][b] = s;
      }
    const inv = S.inv(JtJ);
    const df = Math.max(1, n - np);
    const mse = cur / df;
    const se = inv ? p.map((v, a) => Math.sqrt(Math.max(0, mse * inv[a][a]))) : p.map(() => NaN);

    let sst = 0; const ym = mean(ys);
    for (const y of ys) sst += (y - ym) * (y - ym);

    return {
      ok: true, params: p, se, sse: cur, mse, df, n,
      r2: sst > 0 ? 1 - cur / sst : NaN,
      converged: converged || cur < sst * 1e-10,
      eval: (x) => model(x, p),
      t: p.map((v, a) => se[a] > 0 ? v / se[a] : NaN),
      pval: p.map((v, a) => se[a] > 0 ? tTest2p(v / se[a], df) : NaN)
    };
  };

  /**
   * 四参数 Logistic（剂量-反应 / 竞争结合 / 抑制曲线）
   * Y = Bottom + (Top - Bottom) / (1 + 10^((logEC50 - X) * HillSlope))
   * @param {number[]} xs 若 logX=false 则传原始浓度（自动取 log10）
   */
  S.fit4PL = function (xs0, ys0, opt) {
    opt = opt || {};
    const pts = [];
    for (let i = 0; i < xs0.length; i++) {
      const x = +xs0[i], y = +ys0[i];
      if (isFinite(x) && isFinite(y) && x !== '') pts.push([x, y]);
    }
    if (pts.length < 5) return { ok: false, msg: '四参数拟合至少需要 5 个数据点（建议 ≥8）' };
    const useLog = opt.logX !== false;
    const X = pts.map(p => useLog ? (p[0] > 0 ? Math.log10(p[0]) : NaN) : p[0]);
    if (X.some(v => !isFinite(v))) return { ok: false, msg: 'X 含非正数值，无法取对数（请改为“X 已是 log 值”或去掉 0）' };
    const Y = pts.map(p => p[1]);
    const yMax = Math.max.apply(null, Y), yMin = Math.min.apply(null, Y);
    // 模型的 Top 恒为上渐近线、Bottom 恒为下渐近线；
    // 曲线上升还是下降完全由 HillSlope 的符号决定（正向刺激型 / 反向抑制型）
    const Top = yMax, Bottom = yMin;

    const model = (x, p) => {
      const [bot, top, logC, hill] = p;
      return bot + (top - bot) / (1 + Math.pow(10, (logC - x) * hill));
    };
    const midX = mean(X);
    const starts = [
      [Bottom, Top, midX, 1],
      [Bottom, Top, midX, -1],
      [Bottom, Top, quantile(X, 0.25), 2],
      [Bottom, Top, quantile(X, 0.75), -2]
    ];
    let best = null;
    for (const s of starts) {
      const r = S.fitLM(X, Y, model, s, { maxIter: 400 });
      if (r.ok && (!best || r.sse < best.sse)) best = r;
    }
    if (!best) return { ok: false, msg: '拟合未收敛' };
    let [bot, top, logC, hill] = best.params;
    let [sBot, sTop, sLogC, sHill] = best.se;
    // 规范化参数化：保证 Top 是上渐近线（top ≥ bot）。
    // 该变换对模型完全等价（f(x) 不变），但让输出与 Prism 约定一致：
    // 抑制型曲线的 HillSlope 为负、Top 仍为无药时的上平台。
    if (bot > top) {
      const tb = bot; bot = top; top = tb;
      const tb2 = sBot; sBot = sTop; sTop = tb2;
      hill = -hill;
    }
    const tc = tinv(0.975, best.df);
    const P = [bot, top, logC, hill];
    return {
      ok: true, model: 'four-parameter logistic',
      useLog, xRaw: pts.map(p => p[0]), yRaw: Y,
      Bottom: bot, Top: top, logEC50: logC, EC50: Math.pow(10, logC), HillSlope: hill,
      seBottom: sBot, seTop: sTop, seLogEC50: sLogC, seHill: sHill,
      ec50CI: [Math.pow(10, logC - tc * sLogC), Math.pow(10, logC + tc * sLogC)],
      logEC50CI: [logC - tc * sLogC, logC + tc * sLogC],
      r2: best.r2, sse: best.sse, df: best.df, n: best.n,
      eval: (x) => useLog ? model(Math.log10(x), P) : model(x, P),
      evalLog: (lx) => model(lx, P),
      hillSign: hill > 0 ? '正向（刺激型）' : '反向（抑制型）',
      /** 生成平滑曲线点 */
      curve: function (n) {
        n = n || 220;
        const lo = Math.min.apply(null, X), hi = Math.max.apply(null, X);
        const out = [];
        for (let i = 0; i < n; i++) {
          const lx = lo + (hi - lo) * i / (n - 1);
          out.push([useLog ? Math.pow(10, lx) : lx, model(lx, P), lx]);
        }
        return out;
      }
    };
  };

  /** S 型曲线（对称，用于替代 Prism 的 "sigmoid" 场景） */
  S.fitSigmoid = function (xs, ys, opt) {
    const pts = [];
    for (let i = 0; i < xs.length; i++) {
      const x = +xs[i], y = +ys[i];
      if (isFinite(x) && isFinite(y)) pts.push([x, y]);
    }
    if (pts.length < 4) return { ok: false, msg: '至少需要 4 个数据点' };
    const X = pts.map(p => p[0]), Y = pts.map(p => p[1]);
    const yMin = Math.min.apply(null, Y), yMax = Math.max.apply(null, Y);
    const asc = Y[Y.length - 1] > Y[0];
    const model = (x, p) => {
      const [bot, top, x0, k] = p;
      return bot + (top - bot) / (1 + Math.exp(-k * (x - x0)));
    };
    const r = S.fitLM(X, Y, model, [
      asc ? yMin : yMax, asc ? yMax : yMin, mean(X), 1
    ], { maxIter: 400 });
    if (!r.ok) return r;
    const [bot, top, x0, k] = r.params;
    return {
      ok: true, model: 'sigmoid', Bottom: bot, Top: top, x0, k,
      se: r.se, r2: r.r2, df: r.df, n: r.n, sse: r.sse,
      ec50: x0, hillSign: k > 0 ? '正向' : '反向',
      eval: (x) => model(x, r.params),
      curve: function (n) {
        n = n || 220;
        const lo = Math.min.apply(null, X), hi = Math.max.apply(null, X);
        const out = [];
        for (let i = 0; i < n; i++) {
          const x = lo + (hi - lo) * i / (n - 1);
          out.push([x, model(x, r.params)]);
        }
        return out;
      }
    };
  };

  /* ───────────────── 生存分析 ───────────────── */

  /**
   * Kaplan-Meier 生存估计
   * @param {object[]} rows [{time, event(0/1), group}]
   */
  S.kaplanMeier = function (rows) {
    const byGroup = new Map();
    rows.forEach(r => {
      const g = r.group === undefined || r.group === '' ? 'All' : String(r.group);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push({ t: +r.time, e: +r.event });
    });
    const out = [];
    for (const [g, arr] of byGroup) {
      const data = arr.filter(d => isFinite(d.t)).sort((a, b) => a.t - b.t);
      const n0 = data.length;
      const times = Array.from(new Set(data.map(d => d.t))).sort((a, b) => a - b);
      let S0 = 1, cumVar = 0;
      const t0 = times.length ? times[0] : 0;
      const steps = [{ t: 0, s: 1, nRisk: n0, events: 0, censor: 0, se: 0, ciLo: 1, ciHi: 1 }];
      const censorMarks = [];
      for (const t of times) {
        const atRisk = data.filter(d => d.t >= t).length;
        const events = data.filter(d => d.t === t && d.e === 1).length;
        const censored = data.filter(d => d.t === t && d.e !== 1).length;
        if (events > 0 && atRisk > 0) {
          S0 *= (1 - events / atRisk);
          if (atRisk - events > 0) cumVar += events / (atRisk * (atRisk - events));
        }
        const se = S0 * Math.sqrt(cumVar);
        steps.push({
          t, s: S0, nRisk: atRisk, events, censor: censored, se,
          ciLo: Math.max(0, S0 - 1.96 * se), ciHi: Math.min(1, S0 + 1.96 * se)
        });
        if (censored > 0) censorMarks.push({ t, s: S0 });
      }
      if (t0 > 0) steps[0].t = 0;
      // 中位生存时间
      let median = null;
      for (const st of steps) { if (st.s <= 0.5) { median = st.t; break; } }
      out.push({
        group: g, n: n0, steps, censorMarks, median, raw: data,
        sAt: (tt) => {
          let v = 1;
          for (const st of steps) { if (st.t <= tt) v = st.s; else break; }
          return v;
        }
      });
    }
    return out;
  };

  /**
   * log-rank（Mantel-Cox）检验，支持 k 组
   * χ² = (O−E)′ V⁻¹ (O−E)，df = k−1
   */
  S.logRank = function (surv) {
    if (surv.length < 2) return { ok: false, msg: '至少需要 2 组才可做 log-rank 检验' };
    if (surv.some(s => !s.raw)) return { ok: false, msg: '缺少原始事件数据' };
    const K = surv.length;
    const timeSet = new Set();
    surv.forEach(s => s.raw.forEach(d => { if (d.e === 1) timeSet.add(d.t); }));
    const times = Array.from(timeSet).sort((a, b) => a - b);
    if (!times.length) return { ok: false, msg: '没有任何事件发生，无法比较' };

    const O = new Array(K).fill(0), E = new Array(K).fill(0);
    const V = Array.from({ length: K }, () => new Array(K).fill(0));

    for (const t of times) {
      const nk = [], dk = [];
      let n = 0, d = 0;
      for (let i = 0; i < K; i++) {
        const raw = surv[i].raw;
        const risk = raw.filter(x => x.t >= t).length;
        const ev = raw.filter(x => x.t === t && x.e === 1).length;
        nk[i] = risk; dk[i] = ev; n += risk; d += ev;
      }
      if (n < 2 || d === 0) continue;
      for (let i = 0; i < K; i++) { O[i] += dk[i]; E[i] += d * nk[i] / n; }
      const f = d * (n - d) / (n - 1);
      for (let i = 0; i < K; i++) {
        const pi = nk[i] / n;
        V[i][i] += f * pi * (1 - pi);
        for (let j = i + 1; j < K; j++) {
          const c = -f * pi * (nk[j] / n);
          V[i][j] += c; V[j][i] += c;
        }
      }
    }

    // V 秩为 k−1，用前 k−1 维子矩阵求逆
    const m = K - 1;
    const sub = Array.from({ length: m }, (_, i) => V[i].slice(0, m));
    const inv = S.inv(sub);
    let chi2 = NaN;
    if (inv) {
      const diff = O.slice(0, m).map((o, i) => o - E[i]);
      chi2 = 0;
      for (let i = 0; i < m; i++)
        for (let j = 0; j < m; j++) chi2 += diff[i] * inv[i][j] * diff[j];
    }
    const df = K - 1;
    return {
      ok: isFinite(chi2), chi2, df, p: isFinite(chi2) ? chi2UpperP(chi2, df) : NaN,
      O, E, groups: surv.map(s => s.group),
      msg: isFinite(chi2) ? '' : '方差矩阵奇异，无法计算'
    };
  };

  /** 两组 log-rank 的风险比 HR（O/E 法近似）+ 95% CI */
  S.hazardRatio = function (surv) {
    const r = S.logRank(surv);
    if (!r.ok) return r;
    const O1 = r.O[0], E1 = r.E[0];
    if (O1 <= 0 || E1 <= 0) return { ok: false, msg: '第 1 组无事件，无法估计 HR' };
    const logHR = Math.log(O1 / E1);
    const seLogHR = Math.sqrt(1 / O1 + 1 / E1);
    return {
      ok: true, HR: Math.exp(logHR), logHR, seLogHR,
      ci: [Math.exp(logHR - 1.96 * seLogHR), Math.exp(logHR + 1.96 * seLogHR)]
    };
  };

  /* ───────────────── ROC ───────────────── */

  S.roc = function (scores, labels) {
    const pts = [];
    for (let i = 0; i < scores.length; i++) {
      const s = +scores[i], l = labels[i];
      if (!isFinite(s) || l === '' || l === null || l === undefined) continue;
      const pos = (String(l).toLowerCase() === '1' || /^pos|positive|yes|true|case/i.test(String(l)));
      pts.push({ s, pos });
    }
    const nPos = pts.filter(p => p.pos).length;
    const nNeg = pts.length - nPos;
    if (nPos < 2 || nNeg < 2) return { ok: false, msg: '需要至少 2 个阳性与 2 个阴性样本' };
    pts.sort((a, b) => b.s - a.s);
    let tp = 0, fp = 0;
    const curve = [{ fpr: 0, tpr: 0 }];
    let i = 0;
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && pts[j + 1].s === pts[i].s) j++;
      for (let k = i; k <= j; k++) { if (pts[k].pos) tp++; else fp++; }
      curve.push({ fpr: fp / nNeg, tpr: tp / nPos, thr: pts[i].s });
      i = j + 1;
    }
    // AUC：梯形积分
    let auc = 0;
    for (let k = 1; k < curve.length; k++) {
      auc += (curve[k].fpr - curve[k - 1].fpr) * (curve[k].tpr + curve[k - 1].tpr) / 2;
    }
    // Hanley-McNeil SE
    const A = auc;
    const q1 = A / (2 - A), q2 = 2 * A * A / (1 + A);
    const se = Math.sqrt((A * (1 - A) + (nPos - 1) * (q1 - A * A) + (nNeg - 1) * (q2 - A * A)) / (nPos * nNeg));
    // Youden 指数最大者；同分时取离左上角最近的那一点
    let best = curve[1] || { fpr: 0, tpr: 0 };
    const score = (c) => (c.tpr - c.fpr) * 1e6 - ((1 - c.tpr) * (1 - c.tpr) + c.fpr * c.fpr);
    curve.forEach(c => { if (score(c) > score(best)) best = c; });
    return {
      ok: true, auc, se, nPos, nNeg, curve,
      ci: [Math.max(0, auc - 1.96 * se), Math.min(1, auc + 1.96 * se)],
      bestCutoff: best.thr, bestSens: best.tpr, bestSpec: 1 - best.fpr,
      p: (function () {
        const z = se > 0 ? (auc - 0.5) / se : NaN;
        return 2 * (1 - ncdf(Math.abs(z)));
      })()
    };
  };

  /* ───────────────── 核密度（小提琴图用） ───────────────── */

  /** 高斯核密度估计 */
  S.kde = function (raw, opt) {
    opt = opt || {};
    const a = clean(raw);
    if (a.length < 2) return { x: [], y: [] };
    const n = a.length;
    const s = sd(a), iqr = quantile(a, 0.75) - quantile(a, 0.25);
    let h = opt.bandwidth;
    if (!h) {
      const spread = Math.min(s, iqr / 1.349) || s;
      h = 0.9 * spread * Math.pow(n, -0.2);
    }
    if (!(h > 0)) h = 1e-6;
    const lo = (opt.min !== undefined ? opt.min : Math.min.apply(null, a)) - 3 * h;
    const hi = (opt.max !== undefined ? opt.max : Math.max.apply(null, a)) + 3 * h;
    const steps = opt.steps || 120;
    const xs = [], ys = [];
    let peak = 0;
    for (let i = 0; i < steps; i++) {
      const x = lo + (hi - lo) * i / (steps - 1);
      let sum = 0;
      for (const v of a) {
        const u = (x - v) / h;
        sum += Math.exp(-0.5 * u * u);
      }
      const y = sum / (n * h * Math.sqrt(2 * Math.PI));
      peak = Math.max(peak, y);
      xs.push(x); ys.push(y);
    }
    return { x: xs, y: ys, bandwidth: h, peak };
  };

  /** 累积分布（ECDF） */
  S.ecdf = function (raw) {
    const a = clean(raw).sort((x, y) => x - y);
    const n = a.length;
    return a.map((v, i) => [v, (i + 1) / n]);
  };

  /* ───────────────── 导出 ───────────────── */

  S.mean = mean; S.sd = sd; S.sem = sem; S.quantile = quantile; S.variance = variance;

  CG.stats = S;
})(typeof window !== 'undefined' ? window : globalThis);
