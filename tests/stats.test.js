/* ═══════════════════════════════════════════════════════════
   FigForge 统计引擎 · 数值验证
   参考值全部由 SciPy 1.16.3 / scikit-learn 生成，非自证。
   ═══════════════════════════════════════════════════════════ */
require('../js/stats.js');
const S = globalThis.CG.stats;

let pass = 0, fail = 0;
const fails = [];
function ok(name, got, want, tol, unit) {
  tol = tol === undefined ? 1e-6 : tol;
  const good = typeof want === 'string'
    ? String(got) === want
    : Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!good) fails.push(name + ' → got ' + got + ', want ' + want);
  console.log((good ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + name +
    '  got=' + (typeof got === 'number' ? got.toPrecision(8) : got) +
    '  want=' + (typeof want === 'number' ? want.toPrecision(8) : want));
  good ? pass++ : fail++;
}
const hdr = (t) => console.log('\n\x1b[1m【' + t + '】\x1b[0m');

/* ───── 特殊函数与分布（对照解析值 / SciPy） ───── */
hdr('特殊函数与分布');
ok('lnGamma(5)=ln24', S.lnGamma(5), Math.log(24), 1e-14);
ok('lnGamma(0.5)=ln√π', S.lnGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-12);
ok('ibeta(0.5,2,3)=0.6875', S.ibeta(0.5, 2, 3), 0.6875, 1e-14);
ok('igamma(0.5,1)=0.8427007929', S.igamma(0.5, 1), 0.8427007929497149, 1e-13);
ok('ncdf(1.96)=0.9750021049', S.ncdf(1.96), 0.9750021048517795, 1e-13);
ok('ncdf(-1)=0.1586552539', S.ncdf(-1), 0.15865525393145707, 1e-13);
ok('nquant(0.975)=1.9599639845', S.nquant(0.975), 1.959963984540054, 1e-9);
ok('tinv(0.975,9)=2.2621571629', S.tinv(0.975, 9), 2.262157162854099, 1e-8);
ok('tinv(0.975,30)=2.0422724563', S.tinv(0.975, 30), 2.042272456301238, 1e-8);
ok('tinv(0.975,1)=12.7062047', S.tinv(0.975, 1), 12.706204736432095, 1e-8);
ok('tTest2p(2.2621571629,9)=0.05', S.tTest2p(2.262157162854099, 9), 0.05, 1e-10);
ok('F 临界(0.05;2,27)=3.3541308', (() => {
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (S.fTestP(m, 2, 27) > 0.05) lo = m; else hi = m; }
  return (lo + hi) / 2;
})(), 3.3541308294578435, 1e-8);
ok('χ² 临界(0.05;1)=3.8414588', (() => {
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (S.chi2UpperP(m, 1) > 0.05) lo = m; else hi = m; }
  return (lo + hi) / 2;
})(), 3.841458820694124, 1e-8);

/* ───── 描述统计 ───── */
hdr('描述统计');
const d1 = [1, 2, 3, 4, 5];
ok('mean(1..5)=3', S.describe(d1).mean, 3, 1e-15);
ok('sd(1..5)=1.5811388', S.describe(d1).sd, 1.5811388300841898, 1e-14);
ok('sem(1..5)=0.7071068', S.describe(d1).sem, 0.7071067811865476, 1e-14);
ok('median(1..5)=3', S.quantile(d1, 0.5), 3, 1e-15);
ok('q1(1..5)=2 (R type7)', S.quantile(d1, 0.25), 2, 1e-15);
ok('q3(1..5)=4 (R type7)', S.quantile(d1, 0.75), 4, 1e-15);
ok('IQR(1..5)=2', S.describe(d1).iqr, 2, 1e-15);
ok('CV(1..5)=52.7046%', S.describe(d1).cv, 52.70462766947299, 1e-12);
ok('errors: sd 半宽', S.errorBar(d1, 'sd').hi, 1.5811388300841898, 1e-14);
ok('errors: sem 半宽', S.errorBar(d1, 'sem').hi, 0.7071067811865476, 1e-14);

/* ───── t 检验（SciPy 参考） ───── */
hdr("t 检验（SciPy: welch T=1.9573959488 df=5.6460496105 p=0.10106213756）");
const TA = [30.02, 29.99, 30.11, 29.97, 30.01];
const TB = [29.89, 29.93, 29.72, 29.98, 30.02];
const tw = S.ttestUnpaired(TA, TB, true);
ok('Welch t', tw.t, 1.9573959488125325, 1e-13);
ok('Welch df', tw.df, 5.646049610510142, 1e-12);
ok('Welch p', tw.p, 0.10106213756015384, 1e-11);
ok('Welch 均值差', tw.diff, 0.11200000000000187, 1e-12);
const ts = S.ttestUnpaired(TA, TB, false);
ok('Student t', ts.t, 1.9573959488125325, 1e-13);
ok('Student df=8', ts.df, 8, 1e-15);
ok('Student p=0.086003557613', ts.p, 0.0860035576133964, 1e-11);
ok("Student Cohen's d = 1.2379659", ts.cohensD, 1.2379658962067714, 1e-10);

hdr('配对 t 检验（SciPy: T=6.5 df=4 p=0.0028900071171）');
const tp = S.ttestPaired([200, 240, 190, 210, 220], [190, 220, 180, 200, 205]);
ok('配对 t', tp.t, 6.5, 1e-14);
ok('配对 df=4', tp.df, 4, 1e-15);
ok('配对 p', tp.p, 0.0028900071171007345, 1e-12);
ok('配对均值差=13', tp.diff, 13, 1e-14);
ok('配对 95%CI 下界', tp.ciLo, 13 - S.tinv(0.975, 4) * 13 / 6.5, 1e-12);

/* ───── 非参数检验（SciPy 参考） ───── */
hdr('Mann-Whitney U（SciPy: U=0 p=0.0021650293330）');
const mw = S.mannWhitney([12, 15, 18, 11, 14, 16, 13], [20, 24, 22, 26, 19, 23, 25]);
ok('MWU U', mw.U, 0, 1e-15);
ok('MWU U1', mw.U1, 0, 1e-15);
ok('MWU z=-3.0666', mw.z, -3.0666075120, 1e-5);
ok('MWU p', mw.p, 0.0021650293330383757, 1e-9);

hdr('Wilcoxon 符号秩（检验秩和统计量，p 用正态近似）');
const wil = S.wilcoxon([1, 2, 3, 4, 5, 6, 7, 8], [2, 1, 5, 3, 8, 6, 9, 11]);
// 差值 [-1,1,-2,1,-3,0,-2,-3] → 平均秩 1→2, 2→4.5, 3→6.5，正值项秩和 W+ = 2+2 = 4
ok('Wilcoxon W+ = 4 (scipy rankdata 核对)', wil.W, 4, 1e-12);
ok('Wilcoxon 非零对数', wil.n, 7, 1e-15);
ok('Wilcoxon p 在合理区间', wil.p > 0.05 && wil.p < 0.35 ? 1 : 0, 1, 1e-15);

/* ───── ANOVA（SciPy: F=66.4210526316 p=3.2338398214e-07） ───── */
hdr('单因素 ANOVA（SciPy: F=66.4210526316 p=3.2338398214e-07）');
const g1 = [6, 5, 7, 6, 6], g2 = [9, 8, 10, 9, 8], g3 = [12, 11, 13, 12, 11];
const an = S.anova([g1, g2, g3], ['A', 'B', 'C']);
ok('F', an.F, 66.42105263157899, 1e-13);
ok('p', an.p, 3.233839821394129e-07, 1e-11);
ok('df1=2', an.df1, 2, 1e-15);
ok('df2=12', an.df2, 12, 1e-15);
ok('SSB=84.1333333', an.ssb, 84.13333333333335, 1e-13);
ok('SSW=7.6', an.ssw, 7.6, 1e-14);
ok('η²=0.9171511628', an.eta2, 0.9171511627906977, 1e-13);
ok('RMSE=sqrt(0.6333333)', an.rmse, Math.sqrt(7.6 / 12), 1e-14);

hdr('重复测量 ANOVA');
const rm = S.rmAnova([[10, 12, 11, 13], [20, 22, 21, 23], [30, 33, 31, 32], [15, 16, 15, 17]], ['C1', 'C2', 'C3', 'C4']);
ok('RM ANOVA 可算', rm.ok ? 1 : 0, 1, 1e-15);
ok('RM ANOVA F>0', rm.F > 0 ? 1 : 0, 1, 1e-15);
ok('RM df2=(n-1)(k-1)=9', rm.df2, 9, 1e-15);

hdr('多重比较校正（Holm / Bonferroni / BH）');
const ph = S.posthoc([g1, g2, g3], ['A', 'B', 'C'], { method: 'holm' });
ok('比较对数=3', ph.comparisons.length, 3, 1e-15);
ok('Holm 校正单调（最小 p 保留）', ph.comparisons.every(c => c.pAdj >= c.pRaw - 1e-15) ? 1 : 0, 1, 1e-15);
const phb = S.posthoc([g1, g2, g3], ['A', 'B', 'C'], { method: 'bonferroni' });
ok('Bonferroni p = raw×3', phb.comparisons[0].pAdj,
  Math.min(1, phb.comparisons[0].pRaw * 3), 1e-12);
ok('全部显著 (A vs B)', ph.comparisons[0].stars !== 'ns' ? 1 : 0, 1, 1e-15);

/* ───── 分布检验（SciPy 参考） ───── */
hdr("分布检验（SciPy D'Agostino: K²=0.1323314021 p=0.9359757593）");
const nn = [-1.2, -0.8, -0.5, -0.2, 0.1, 0.3, 0.6, 0.9, 1.4, 0.2, -0.4, 0.05];
const nrm = S.normality(nn);
ok('K²', nrm.K2, 0.13233140207101263, 1e-8);
ok('正态性 p', nrm.p, 0.935975759288921, 1e-7);
ok('偏度 = 0.1584667793', nrm.skew, 0.158466779303152, 1e-11);
ok('超额峰度 = -0.4670049843', nrm.kurt, -0.467004984324741, 1e-11);
ok('判定为正态', nrm.normal ? 1 : 0, 1, 1e-15);

hdr('方差齐性 Levene（SciPy: W=0.2222222222 p=0.8039599174）');
const lev = S.levene([g1, g2, g3]);
ok('Levene F', lev.F, 0.22222222222222207, 1e-10);
ok('Levene p', lev.p, 0.8039599174006208, 1e-9);

/* ───── 线性回归（SciPy: slope=1.97 intercept=0.15 R²=0.9988932359 p=1.5632043e-05） ───── */
hdr('线性回归（SciPy linregress）');
const rx = [1, 2, 3, 4, 5], ry = [2.1, 4.2, 5.9, 8.1, 10.0];
const lr = S.linreg(rx, ry);
ok('斜率=1.97', lr.slope, 1.97, 1e-13);
ok('截距=0.15', lr.intercept, 0.15, 1e-12);
ok('R²=0.9988932359', lr.r2, 0.9988932359, 1e-9);
ok('斜率 p=1.5632043e-05', lr.pSlope, 1.56320428644e-05, 1e-8);
ok('斜率 SE=0.0378593890 (scipy stderr)', lr.seSlope, 0.037859388972005, 1e-9);
ok('截距 SE=0.1255653880 (scipy)', lr.seIntercept, 0.125565388012260, 1e-9);
ok('df=3', lr.df, 3, 1e-15);
ok('predict(3).y=6.06', lr.predict(3).y, 6.06, 1e-12);
ok('95%CI 含真斜率', (lr.slopeCI[0] < 1.97 && lr.slopeCI[1] > 1.97) ? 1 : 0, 1, 1e-15);

hdr('高阶多项式（二次曲线精确恢复）');
const px = [], py = [];
for (let x = -3; x <= 3; x += 0.5) { px.push(x); py.push(2 - 1.5 * x + 0.75 * x * x); }
const pf = S.polyfit(px, py, 2);
ok('c0=2', pf.coef[0], 2, 1e-9);
ok('c1=-1.5', pf.coef[1], -1.5, 1e-9);
ok('c2=0.75', pf.coef[2], 0.75, 1e-9);
ok('R²=1', pf.r2, 1, 1e-11);
// 病态尺度下仍应稳定（x 取 1e6 量级）
const bx = px.map(v => v * 1e6), bf = S.polyfit(bx, py, 2);
ok('大尺度 x 仍精确 c2', bf.coef[2], 0.75e-12, 1e-8);
ok('大尺度 x 仍精确 c1', bf.coef[1], -1.5e-6, 1e-8);

/* ───── 四参数 Logistic（SciPy curve_fit: [10, 90, 1, 1.5]） ───── */
hdr('四参数 Logistic 拟合（SciPy curve_fit 对照）');
const x4 = [], y4 = [];
for (let lx = -2; lx <= 4.0001; lx += 0.5) {
  x4.push(Math.pow(10, lx));
  y4.push(10 + (90 - 10) / (1 + Math.pow(10, (1 - lx) * 1.5)));
}
const f4 = S.fit4PL(x4, y4, { logX: true });
ok('拟合成功', f4.ok ? 1 : 0, 1, 1e-15);
ok('Bottom=10', f4.Bottom, 10, 1e-6);
ok('Top=90', f4.Top, 90, 1e-7);
ok('logEC50=1', f4.logEC50, 1, 1e-7);
ok('HillSlope=1.5', f4.HillSlope, 1.5, 1e-6);
ok('EC50=10', f4.EC50, 10, 1e-6);
ok('R²=1', f4.r2, 1, 1e-12);
ok('曲线取样点数', f4.curve(60).length, 60, 1e-15);
ok('反向曲线也能拟合（抑制型）', (() => {
  const yi = y4.map(v => 100 - v);
  const r = S.fit4PL(x4, yi, { logX: true });
  // 抑制型：Top 仍为上平台 90、Bottom 为下平台 10，HillSlope 为负
  return r.ok && Math.abs(r.HillSlope + 1.5) < 1e-3 &&
    Math.abs(r.Top - 90) < 1e-3 && Math.abs(r.Bottom - 10) < 1e-3 ? 1 : 0;
})(), 1, 1e-15);

hdr('S 型曲线拟合');
const sg = S.fitSigmoid([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => 10 + (90 - 10) / (1 + Math.exp(-0.8 * (x - 5)))));
ok('拟合成功', sg.ok ? 1 : 0, 1, 1e-15);
ok('基于可调用', typeof sg.eval(5), 'number', 1e-15);
ok('R²>0.999', sg.r2 > 0.999 ? 1 : 0, 1, 1e-15);

/* ───── 生存分析 ───── */
hdr('Kaplan-Meier 与 log-rank');
const rowsKM = [];
[['Ctrl', 12, 0, 20, 1, 25, 1, 30, 0, 35, 1, 40, 1, 18, 0, 22, 1, 28, 1, 33, 0],
['Drug', 20, 0, 28, 0, 32, 0, 38, 1, 42, 0, 45, 0, 50, 0, 26, 0, 36, 0, 44, 0]]
  .forEach(row => {
    for (let i = 1; i < row.length; i += 2) {
      rowsKM.push({ time: row[i], event: row[i + 1], group: row[0] });
    }
  });
const km = S.kaplanMeier(rowsKM);
ok('分组数=2', km.length, 2, 1e-15);
ok('S(0)=1', km[0].steps[0].s, 1, 1e-15);
ok('生存函数单调不增', km[0].steps.every((st, i, a) => i === 0 || st.s <= a[i - 1].s + 1e-14) ? 1 : 0, 1, 1e-15);
ok('Ctrl 组 n=10', km[0].n, 10, 1e-15);
// Ctrl 组 t=20 时风险集 = 8（t=12、t=18 已删失），S = 1×(1−1/8) = 7/8
const ctrl = km.find(k => k.group === 'Ctrl');
const s20 = ctrl.steps.find(st => st.t === 20);
ok('Ctrl 组 t=20 风险集 = 8', s20.nRisk, 8, 1e-15);
ok('Ctrl S(20) = 7/8', s20.s, 0.875, 1e-14);
const lrk = S.logRank(km);
ok('log-rank 可算', lrk.ok ? 1 : 0, 1, 1e-15);
ok('log-rank df=1', lrk.df, 1, 1e-15);
ok('log-rank 两组差异显著', lrk.p < 0.05 ? 1 : 0, 1, 1e-15);
console.log('     χ²=' + lrk.chi2.toFixed(4) + '  p=' + S.fmtP(lrk.p) +
  '  O=[' + lrk.O.join(', ') + ']  E=[' + lrk.E.map(v => v.toFixed(2)).join(', ') + ']');
const hr = S.hazardRatio(km);
ok('HR 可算', hr.ok ? 1 : 0, 1, 1e-15);
console.log('     HR=' + hr.HR.toFixed(3) + '  95%CI [' + hr.ci.map(v => v.toFixed(3)).join(', ') + ']');

/* ───── ROC（sklearn: AUC=0.95） ───── */
hdr('ROC / AUC（scikit-learn roc_auc_score 对照）');
const rocScores = [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9,
  3.6, 3.8, 4.0, 4.1, 4.2, 4.3, 4.5, 4.6, 4.8, 5.0];
const rocLabels = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const roc = S.roc(rocScores, rocLabels);
ok('AUC=0.95', roc.auc, 0.95, 1e-12);
ok('nPos=10 / nNeg=10', roc.nPos * 100 + roc.nNeg, 1010, 1e-15);
ok('曲线起于 (0,0)', roc.curve[0].fpr + roc.curve[0].tpr, 0, 1e-15);
ok('终点 TPR=1', roc.curve[roc.curve.length - 1].tpr, 1, 1e-15);
// 该数据中 3.6/3.8 两点为阴/阳共有 → 曲线在 (0,0.8) 与 (0.2,0.9) 处 Youden 并列取 0.8，
// 按"离左上角最近"规则取 (0,0.8)
ok('最佳截断敏感度=0.8', roc.bestSens, 0.8, 1e-12);
ok('最佳截断特异度=1.0', roc.bestSpec, 1.0, 1e-12);
ok('最佳截断阈值=4.0', roc.bestCutoff, 4.0, 1e-12);
ok('完全分离 AUC=1', S.roc([1, 2, 3, 4, 5, 6], [0, 0, 0, 1, 1, 1]).auc, 1, 1e-12);

/* ───── 密度估计 ───── */
hdr('核密度估计 / ECDF');
const kde = S.kde([1, 2, 2, 3, 3, 3, 4, 4, 5, 20]);
ok('取样点数=120', kde.x.length, 120, 1e-15);
ok('带宽>0', kde.bandwidth > 0 ? 1 : 0, 1, 1e-15);
ok('密度积分≈1', (() => {
  let a = 0;
  for (let i = 1; i < kde.x.length; i++) a += (kde.x[i] - kde.x[i - 1]) * (kde.y[i] + kde.y[i - 1]) / 2;
  return a;
})(), 1, 5e-3);
ok('ECDF 末点=1', S.ecdf([3, 1, 2])[2][1], 1, 1e-15);

/* ───── 线性代数 ───── */
hdr('线性代数');
const Minv = S.inv([[4, 7], [2, 6]]);
ok('inv 2x2 (0,0)=0.6', Minv[0][0], 0.6, 1e-13);
ok('inv 2x2 (0,1)=-0.7', Minv[0][1], -0.7, 1e-13);
ok('A·A⁻¹=I', (() => {
  const A = [[2, 1, 0.5], [1, 3, -1], [0.5, -1, 4]];
  const I = S.inv(A);
  let e = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0; for (let k = 0; k < 3; k++) s += A[i][k] * I[k][j];
    e = Math.max(e, Math.abs(s - (i === j ? 1 : 0)));
  }
  return e < 1e-12 ? 1 : 0;
})(), 1, 1e-15);
ok('solve 3x3', (() => {
  const x = S.solve([[2, 1, 1], [1, 3, 2], [1, 0, 0]], [4, 5, 6]);
  return Math.abs(x[0] - 6) + Math.abs(x[1] - 15) + Math.abs(x[2] - (-23));
})(), 0, 1e-11);

/* ───── 格式化 ───── */
hdr('p 值与数字格式化');
ok('p<0.05 星号 *', S.stars(0.03), '*', 1e-15);
ok('p<0.01 星号 **', S.stars(0.005), '**', 1e-15);
ok('p<0.001 星号 ***', S.stars(0.0005), '***', 1e-15);
ok('p<1e-4 星号 ****', S.stars(0.00005), '****', 1e-15);
ok('p>0.05 → ns', S.stars(0.4), 'ns', 1e-15);
ok('fmt(3.14159,3)=3.14', S.fmt(3.14159, 3), 3.14, 1e-15);
ok('fmt(0.00012,3) 科学计数', S.fmt(0.00012, 3), '1.20e-4', 1e-15);

console.log('\n══════════════════════════════════════════════════');
if (fail) {
  console.log('  \x1b[31m通过 ' + pass + ' / ' + (pass + fail) + '　失败项：\x1b[0m');
  fails.forEach(f => console.log('    · ' + f));
} else {
  console.log('  \x1b[32m全部通过：' + pass + ' / ' + pass + '\x1b[0m');
}
console.log('══════════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
