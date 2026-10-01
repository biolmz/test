/* FigForge 数据层验证 */
require('../js/stats.js');
require('../js/data.js');
const CG = globalThis.CG;
const D = CG.data, S = CG.stats;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  cond ? pass++ : fail++;
  console.log((cond ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + name + (extra !== undefined ? '  ' + extra : ''));
}

console.log('\n\x1b[1m【分隔符与表头识别】\x1b[0m');
let t = D.fromText('组别\t重复1\t重复2\n对照\t5.2\t5.6\n处理\t7.8\t8.1');
ok('TSV 解析', t.ok, '→ ' + t.dataset.rows.length + ' 行');
ok('识别为双因素表（首列文本 + 其余数值）', t.dataset.kind === 'grouped', t.dataset.kind);
ok('列名保留', t.dataset.columns.map(c => c.name).join('|') === '组别|重复1|重复2');
ok('角色：首列 G', t.dataset.columns[0].role === 'G');

t = D.fromText('X,Y1,Y2\n1,2.1,3.2\n2,4.3,6.1\n3,5.9,9.4');
ok('CSV 解析', t.ok);
ok('识别为 XY 表', t.dataset.kind === 'xy', t.dataset.kind);
ok('角色：X + 多 Y', t.dataset.columns.map(c => c.role).join('') === 'XYY');

t = D.fromText('1.5\n2.5\n3.5\n4.5');
ok('无表头单列', t.ok && t.dataset.rows.length === 4, 'kind=' + t.dataset.kind);

t = D.fromText('A,B,C\n1,2,3\n4,5,6');
ok('纯数字 CSV → xy', t.dataset.kind === 'xy', t.dataset.kind);

t = D.fromText('浓度 时间 温度\n1 2 3\n4 5 6');
ok('空格分隔', t.ok && t.dataset.columns.length === 3, '列数=' + t.dataset.columns.length);

t = D.fromText('"组别,含逗号",值\n"a,b",1.5\nc,2.5');
ok('引号内逗号不分割', t.dataset.rows[0][0] === 'a,b', JSON.stringify(t.dataset.rows[0][0]));

console.log('\n\x1b[1m【规范化长表】\x1b[0m');
const germ = D.samples.germination();
ok('示例：发芽率（浓度梯度）', germ.kind === 'column' && germ.columns.length === 6, germ.rows.length + ' 行');
ok('组名带浓度单位', germ.columns[1].name === '50 mg/L', germ.columns.map(c => c.name).join(' / '));
const lb = D.flatten(germ);
ok('长表记录数 = 6 组 × 10 行 = 60', lb.length === 60, lb.length);
const gs = D.groups(germ, lb);
ok('分组数 = 6', gs.length === 6);
ok('每组 10 个值', gs.every(g => g.values.length === 10));
const m0 = S.mean(gs[0].values), m5 = S.mean(gs[5].values);
ok('最低浓度组均值最高 (~88)', m0 > 84 && m0 < 92, m0.toFixed(2));
ok('最高浓度组均值最低 (~61)', m5 > 55 && m5 < 68, m5.toFixed(2));
ok('低浓度段下降 ≤5（缓）', (m0 - S.mean(gs[2].values)) < 5, (m0 - S.mean(gs[2].values)).toFixed(2));
ok('高浓度段下降 >18（陡）', (S.mean(gs[2].values) - m5) > 18, (S.mean(gs[2].values) - m5).toFixed(2));
const anv = S.anova(gs.map(g => g.values), gs.map(g => g.name));
ok('组间 ANOVA 显著 p<1e-10', anv.ok && anv.p < 1e-10, 'F=' + anv.F.toFixed(1) + ' p=' + S.fmtP(anv.p));
const ph = S.posthoc(gs.map(g => g.values), gs.map(g => g.name), { method: 'holm' });
ok('Holm 事后比较 15 对', ph.comparisons.length === 15, ph.comparisons.filter(c => c.sig).length + ' 对显著');

const dose = D.samples.dose();
const ld = D.flatten(dose);
ok('剂量-反应长表 = 10 点 × 3 序列', ld.length === 30, ld.length);
const fd = S.fit4PL(ld.filter(d => d.s === 'DPPH 清除率 (%)').map(d => d.x),
  ld.filter(d => d.s === 'DPPH 清除率 (%)').map(d => d.y), { logX: true });
ok('DPPH 曲线 4PL 拟合成功', fd.ok, 'EC50=' + fd.EC50.toFixed(1) + ' µg/mL, R²=' + fd.r2.toFixed(5));
ok('EC50 落在设计浓度范围内', fd.EC50 > 5 && fd.EC50 < 200, fd.EC50.toFixed(1));
const fa = S.fit4PL(ld.filter(d => d.s === 'ABTS 清除率 (%)').map(d => d.x),
  ld.filter(d => d.s === 'ABTS 清除率 (%)').map(d => d.y), { logX: true });
ok('ABTS EC50 < DPPH EC50（ABTS 更敏感）', fa.EC50 < fd.EC50, fa.EC50.toFixed(1) + ' < ' + fd.EC50.toFixed(1));

const sto = D.samples.storage();
const ls = D.flatten(sto);
ok('双因素长表 = 3 行 × 5 列 = 15', ls.length === 15, ls.length);
ok('主组 = 配方名', D.groups(sto, ls).length === 3);
ok('子组 = 5 个时间点', D.subGroups(sto, ls).length === 5, D.subGroups(sto, ls).join(', '));
const mx = D.matrix(sto);
ok('热图矩阵 3×5', mx.rowLabels.length === 3 && mx.colLabels.length === 5);
ok('热图取值完整', mx.values.every(r => r.every(v => isFinite(v))));
ok('热图 min<max', mx.min < mx.max, mx.min.toFixed(1) + ' ~ ' + mx.max.toFixed(1));

const sur = D.samples.survival();
const surv = S.kaplanMeier(D.flatten(sur).map(d => ({ time: d.time, event: d.event, group: d.g })));
ok('生存数据 2 组', surv.length === 2);
const lr = S.logRank(surv);
ok('log-rank 可算', lr.ok, 'χ²=' + lr.chi2.toFixed(3) + ' p=' + S.fmtP(lr.p));
ok('处理组中位生存期更长', surv[1].median > surv[0].median,
  surv[0].median + ' 天 vs ' + surv[1].median + ' 天');

const rocd = D.samples.roc();
const loroc = D.flatten(rocd);
ok('ROC 数据 60 条', loroc.length === 60, loroc.length);
const rc = S.roc(loroc.map(d => d.x), loroc.map(d => d.g === '1' ? 1 : 0));
ok('ROC 可算', rc.ok, 'AUC=' + rc.auc.toFixed(3));
ok('AUC 合理 (>0.85)', rc.auc > 0.85, rc.auc.toFixed(3));

console.log('\n\x1b[1m【新建 / 往返】\x1b[0m');
for (const k of ['column', 'xy', 'grouped', 'survival']) {
  const ds = D.newDataset(k, { rows: 5 });
  ok('新建 ' + D.kind(k).name + ' 结构正确',
    ds.columns.length > 0 && ds.rows.length === 5 && ds.rows[0].length === ds.columns.length,
    ds.columns.map(c => c.name + ':' + c.role).join(', '));
}
const r1 = D.samples.inhibition();
const csv = D.toCSV(r1);
const re = D.fromText(csv, { kind: 'column' });
ok('CSV 往返行数一致', re.dataset.rows.length === r1.rows.length, re.dataset.rows.length);
ok('CSV 往返列名一致', re.dataset.columns.map(c => c.name).join('|') === r1.columns.map(c => c.name).join('|'));
const tsv = D.toTSV(r1);
ok('TSV 制表符分隔', tsv.split('\n')[0].split('\t').length === 4);

console.log('\n\x1b[1m【角色切换对绘图的影响】\x1b[0m');
const custom = D.newDataset('column', { rows: 3, cols: 3 });
custom.rows = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
ok('3 列全为 Y 时 flatten = 9 条', D.flatten(custom).length === 9, D.flatten(custom).length);
custom.columns[0].role = 'G';
ok('首列改为 G 后只剩 2 列 Y → 6 条', D.flatten(custom).length === 6, D.flatten(custom).length);
custom.columns[0].role = 'Y';
custom.columns[2].role = 'I';
ok('列改为忽略后不参与绘图 → 6 条', D.flatten(custom).length === 6, D.flatten(custom).length);
custom.columns[2].role = 'Y';
custom.columns[1].role = 'E';
ok('列改为误差后不单独成序列 → 6 条', D.flatten(custom).length === 6, D.flatten(custom).length);
custom.columns[1].role = 'Y';
ok('角色还原后回到 9 条', D.flatten(custom).length === 9, D.flatten(custom).length);

console.log('\n══════════════════════════════════════════');
console.log(fail ? '  \x1b[31m通过 ' + pass + ' / ' + (pass + fail) + '，失败 ' + fail + '\x1b[0m'
  : '  \x1b[32m全部通过：' + pass + ' / ' + pass + '\x1b[0m');
console.log('══════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
