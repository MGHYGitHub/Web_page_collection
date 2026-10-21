/* MSA 数据分析中心：导入、分析、图表和 Excel 报告编排。 */
(function () {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const state = { rows: [], sourceName: '', results: {}, active: 'cgk', charts: {} };
  const fmt = (value, digits = 4) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numeric = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const match = String(value == null ? '' : value).replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
    return match ? Number(match[0]) : NaN;
  };
  const nums = values => values.map(numeric).filter(Number.isFinite);
  const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  const sd = values => { if (values.length < 2) return 0; const m = mean(values); return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1)); };
  const pct = (v, d = 2) => Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(d)}%` : '—';
  const parseSpec = text => {
    const source = String(text == null ? '' : text);
    let center, tol, lsl, usl;
    const pm = source.match(/([-+]?\d*\.?\d+)\s*±\s*([-+]?\d*\.?\d+)/);
    const range = source.match(/(?:LSL|下限)\s*[:=]?\s*([-+]?\d*\.?\d+).*?(?:USL|上限)\s*[:=]?\s*([-+]?\d*\.?\d+)/i);
    if (pm) { center = Number(pm[1]); tol = Math.abs(Number(pm[2])); lsl = center - tol; usl = center + tol; }
    else if (range) { lsl = Number(range[1]); usl = Number(range[2]); center = (lsl + usl) / 2; tol = (usl - lsl) / 2; }
    else {
      const all = source.match(/[-+]?\d*\.?\d+/g) || [];
      if (all.length >= 2) { center = Number(all[0]); tol = Math.abs(Number(all[1])); lsl = center - tol; usl = center + tol; }
    }
    if (![center, tol, lsl, usl].every(Number.isFinite) || tol <= 0 || usl <= lsl) return null;
    return { source, center, tolerance: tol, lsl, usl };
  };
  const regression = (x, y) => {
    const pairs = x.map((v, i) => [Number(v), Number(y[i])]).filter(p => p.every(Number.isFinite));
    if (pairs.length < 2) return { n: pairs.length, slope: NaN, intercept: NaN, r: NaN, rsq: NaN, rmse: NaN, pairs };
    const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]); const mx = mean(xs), my = mean(ys);
    const ssx = xs.reduce((s, v) => s + (v - mx) ** 2, 0), ssy = ys.reduce((s, v) => s + (v - my) ** 2, 0);
    const cov = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0);
    const slope = ssx ? cov / ssx : NaN, intercept = my - slope * mx;
    const r = ssx && ssy ? cov / Math.sqrt(ssx * ssy) : NaN;
    const residuals = pairs.map(([a, b]) => b - (intercept + slope * a));
    return { n: pairs.length, slope, intercept, r, rsq: Number.isFinite(r) ? r * r : NaN, rmse: Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / Math.max(1, pairs.length - 2)), pairs, residuals };
  };
  const col = (rows, index, start = 0) => rows.slice(start).map(row => numeric(row[index])).filter(Number.isFinite);
  const analyseCgk = rows => {
    const headers = rows[0] || []; const output = [];
    headers.forEach((header, index) => {
      const values = col(rows, index, 1); if (!values.length) return;
      const spec = parseSpec(header) || { source: header, center: mean(values), tolerance: Math.max(sd(values) * 6, 1), lsl: mean(values) - Math.max(sd(values) * 6, 1), usl: mean(values) + Math.max(sd(values) * 6, 1) };
      const m = mean(values), s = sd(values), totalTolerance = spec.usl - spec.lsl;
      // Reuse the shared MSA helper when the header contains a valid spec;
      // retain the local calculation as a no-network fallback.
      const core = window.MSAStats && window.MSAStats.cgk(values, header);
      const coreSpec = core && core.ok ? core.spec : null;
      const lsl = coreSpec ? coreSpec.lsl : spec.lsl;
      const usl = coreSpec ? coreSpec.usl : spec.usl;
      const center = coreSpec ? coreSpec.target : spec.center;
      const cg = core && core.ok ? core.cg : (s ? 0.2 * totalTolerance / (6 * s) : Infinity);
      const cgk = core && core.ok ? core.cgk : (s ? (0.1 * totalTolerance - Math.abs(m - center)) / (3 * s) : Infinity);
      output.push({ column: header || `列${index + 1}`, n: values.length, mean: m, sd: s, lsl, usl, cg, cgk, bias: m - center, status: cgk >= 1.33 ? '满足' : cgk >= 1 ? '关注' : '不满足', values });
    });
    return { type: 'cgk', columns: output, rows: output.flatMap(item => item.values.map((value, i) => ({ column: item.column, index: i + 1, value }))) };
  };
  const analyseXbarS = (rows, subgroupSize) => {
    const size = Math.max(2, Number(subgroupSize) || 5), headers = rows[0] || [], series = [];
    headers.forEach((header, index) => { const values = col(rows, index, 1); if (values.length) series.push({ header: header || `列${index + 1}`, values }); });
    const groups = [];
    series.forEach(s => { for (let i = 0; i < s.values.length; i += size) { const values = s.values.slice(i, i + size); if (values.length >= 2) groups.push({ header: s.header, index: Math.floor(i / size) + 1, xbar: mean(values), s: sd(values), n: values.length }); } });
    const xbars = groups.map(g => g.xbar), ss = groups.map(g => g.s), xcl = mean(xbars), scl = mean(ss), avgN = size;
    const a3 = ({ 2: 2.659, 3: 1.954, 4: 1.628, 5: 1.427, 6: 1.287, 7: 1.182, 8: 1.099, 9: 1.032, 10: .975 }[avgN] || 1.427);
    const b3 = ({ 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: .118, 8: .185, 9: .239, 10: .284 }[avgN] || 0), b4 = ({ 2: 3.267, 3: 2.574, 4: 2.282, 5: 2.114, 6: 2.004, 7: 1.924, 8: 1.864, 9: 1.816, 10: 1.777 }[avgN] || 2.114);
    const result = { type: 'xbar-s', subgroupSize: size, groups, xbar: { cl: xcl, ucl: xcl + a3 * scl, lcl: xcl - a3 * scl }, s: { cl: scl, ucl: b4 * scl, lcl: b3 * scl }, series };
    result.groups.forEach(g => { g.xOut = g.xbar > result.xbar.ucl || g.xbar < result.xbar.lcl; g.sOut = g.s > result.s.ucl || g.s < result.s.lcl; });
    return result;
  };
  const analyseCorrelation = (rows, pcs) => {
    const n = Math.max(2, Number(pcs) || 6), values = rows.slice(1).flatMap(r => r.map(numeric).filter(Number.isFinite));
    const usable = values.slice(0, n * 3), tri = usable.slice(0, n), aoi = usable.slice(n, n * 2), range = usable.slice(n * 2, n * 3), fit = regression(tri, aoi);
    return { type: 'correlation', pcs: n, tri, aoi, range, fit, meanDiff: mean(aoi.map((v, i) => v - tri[i])), maxDiff: Math.max(...aoi.map((v, i) => Math.abs(v - tri[i]))), minDiff: Math.min(...aoi.map((v, i) => Math.abs(v - tri[i]))) };
  };
  const variance = values => { const m = mean(values); return values.length > 1 ? values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1) : 0; };
  const analyseGrr = rows => {
    const headers = rows[0] || [], upper = rows[1] || [], lower = rows[2] || [], records = rows.slice(3).map(r => ({ part: r[0], operator: String(r[1] ?? ''), values: r.slice(2).map(numeric) })).filter(r => r.part !== undefined && r.values.some(Number.isFinite));
    const columns = headers.slice(2).map((header, j) => {
      const data = records.map(r => ({ part: r.part, operator: r.operator, value: r.values[j] })).filter(r => Number.isFinite(r.value));
      const partGroups = new Map(), opGroups = new Map(), cellGroups = new Map(); data.forEach(d => { if (!partGroups.has(d.part)) partGroups.set(d.part, []); partGroups.get(d.part).push(d.value); if (!opGroups.has(d.operator)) opGroups.set(d.operator, []); opGroups.get(d.operator).push(d.value); const key = `${d.part}¦${d.operator}`; if (!cellGroups.has(key)) cellGroups.set(key, []); cellGroups.get(key).push(d.value); });
      const ev = Math.sqrt(Math.max(0, mean(Array.from(cellGroups.values()).map(variance))));
      const opMeans = Array.from(opGroups.values()).map(mean), partMeans = Array.from(partGroups.values()).map(mean); const av = Math.sqrt(Math.max(0, variance(opMeans) - ev * ev / Math.max(1, records.length / Math.max(1, opGroups.size))));
      const pv = Math.sqrt(Math.max(0, variance(partMeans) - ev * ev / Math.max(1, records.length / Math.max(1, partGroups.size)))); const grr = Math.sqrt(ev * ev + av * av), tv = Math.sqrt(grr * grr + pv * pv), tolerance = Math.abs(numeric(upper[j + 2]) - numeric(lower[j + 2]));
      return { column: header || `规格${j + 1}`, n: data.length, ev, av, grr, pv, tv, tolerance, percentStudyVar: tv ? grr / tv : NaN, percentTolerance: tolerance ? 6 * grr / tolerance : NaN, percentContribution: tv ? grr * grr / (tv * tv) : NaN, ndc: grr ? 1.41 * pv / grr : Infinity, status: tv && grr / tv <= .3 ? '可接受' : '需关注' };
    });
    return { type: 'grr', columns, records };
  };
  const analyseBias = rows => {
    const data = rows.slice(1).map(r => ({ value: numeric(r[0]), reference: numeric(r[1]), bias: Number.isFinite(numeric(r[2])) ? numeric(r[2]) : numeric(r[0]) - numeric(r[1]) })).filter(r => Number.isFinite(r.value) && Number.isFinite(r.bias));
    const values = data.map(d => d.bias), m = mean(values), s = sd(values), se = s / Math.sqrt(Math.max(1, values.length)), t = se ? m / se : NaN;
    return { type: 'bias', data, n: values.length, mean: m, sd: s, ciLow: m - 1.96 * se, ciHigh: m + 1.96 * se, t, status: Math.abs(m) <= 1.96 * se ? '无明显偏倚' : '存在偏倚' };
  };
  const analyseLinearity = rows => {
    const data = rows.slice(1).map(r => ({ item: r[0], position: r[1], measurement: numeric(r[2]), standard: numeric(r[3]) })).filter(r => Number.isFinite(r.measurement) && Number.isFinite(r.standard)).map(r => ({ ...r, bias: r.measurement - r.standard }));
    const fit = regression(data.map(d => d.standard), data.map(d => d.bias));
    return { type: 'linearity', data, fit, meanBias: mean(data.map(d => d.bias)), sdBias: sd(data.map(d => d.bias)), groups: Array.from(new Set(data.map(d => String(d.item)))) };
  };
  const analyse = () => {
    const pcsSelect = $('#correlationPcs'); const pcs = pcsSelect?.value === 'custom' ? $('#correlationCustomPcs')?.value : pcsSelect?.value;
    const options = { cgk: analyseCgk, repeatability: rows => analyseXbarS(rows, $('#repeatGroupSize')?.value), correlation: rows => analyseCorrelation(rows, pcs), grr: analyseGrr, bias: analyseBias, linearity: analyseLinearity };
    try { state.results[state.active] = options[state.active](state.rows); renderResult(state.active, state.results[state.active]); setStatus(`已完成${moduleName(state.active)}分析，共读取 ${Math.max(0, state.rows.length - 1)} 行数据。`); }
    catch (error) { setStatus(`分析失败：${error.message}`, true); }
  };
  const moduleName = key => ({ cgk: 'CGK', repeatability: '重复性 Xbar-S', correlation: '相关性', grr: 'GRR', bias: '偏倚', linearity: '线性' }[key] || key);
  const metric = (label, value, note = '') => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  const renderResult = (key, result) => {
    const box = $(`#${key}Summary`); if (!box) return;
    let html = '';
    if (key === 'cgk') { const first = result.columns[0]; html = first ? [metric('列数', result.columns.length), metric('首列 Cg', fmt(first.cg)), metric('首列 Cgk', fmt(first.cgk)), metric('判定', first.status)].join('') : '<p class="empty">未识别到数值列。</p>'; renderTable($('#cgkTable'), result.columns, ['column', 'n', 'mean', 'sd', 'lsl', 'usl', 'cg', 'cgk', 'bias', 'status']); drawChart('cgkChart', result.columns.map(x => x.cgk), { kind: 'bar', labels: result.columns.map(x => x.column), title: 'CGK 各列结果' }); }
    else if (key === 'repeatability') { html = [metric('子组数', result.groups.length), metric('Xbar CL', fmt(result.xbar.cl)), metric('Xbar 控制界限', `${fmt(result.xbar.lcl)} ~ ${fmt(result.xbar.ucl)}`), metric('S 控制界限', `${fmt(result.s.lcl)} ~ ${fmt(result.s.ucl)}`), metric('超限点', result.groups.filter(g => g.xOut || g.sOut).length)].join(''); drawControlChart('xbarChart', result.groups.map(g => g.xbar), result.xbar, 'Xbar 图'); drawControlChart('sChart', result.groups.map(g => g.s), result.s, 'S 图'); renderTable($('#repeatTable'), result.groups, ['header', 'index', 'xbar', 's', 'xOut', 'sOut']); }
    else if (key === 'correlation') { const f = result.fit; html = [metric('PCS', result.pcs), metric('R', fmt(f.r)), metric('R-Sq', pct(f.rsq)), metric('拟合方程', `AOI = ${fmt(f.intercept)} + ${fmt(f.slope)} × 三坐标`), metric('平均差', fmt(result.meanDiff))].join(''); drawScatter('correlationChart', f.pairs, f, 'AOI vs 三坐标'); renderTable($('#correlationTable'), result.tri.map((x, i) => ({ pcs: i + 1, tri: x, aoi: result.aoi[i], range: result.range[i] })), ['pcs', 'tri', 'aoi', 'range']); }
    else if (key === 'grr') { const first = result.columns[0]; html = first ? [metric('规格列', result.columns.length), metric('GRR', fmt(first.grr)), metric('%Study Var', pct(first.percentStudyVar)), metric('%Tolerance', pct(first.percentTolerance)), metric('ndc', fmt(first.ndc, 1))].join('') : '<p class="empty">请按 GRR 模板导入数据。</p>'; renderTable($('#grrTable'), result.columns, ['column', 'n', 'ev', 'av', 'grr', 'pv', 'tv', 'percentStudyVar', 'percentTolerance', 'ndc', 'status']); drawChart('grrChart', result.columns.map(x => x.percentStudyVar * 100), { kind: 'bar', labels: result.columns.map(x => x.column), title: '%Study Var' }); }
    else if (key === 'bias') { html = [metric('样本数', result.n), metric('平均偏倚', fmt(result.mean)), metric('95% CI', `${fmt(result.ciLow)} ~ ${fmt(result.ciHigh)}`), metric('判定', result.status)].join(''); drawHistogram('biasHistogramChart', result.data.map(x => x.bias), '偏倚分布'); drawNormalPlot('biasProbabilityChart', result.data.map(x => x.bias), '正态概率图'); renderTable($('#biasTable'), result.data, ['value', 'reference', 'bias']); }
    else if (key === 'linearity') { html = [metric('样本数', result.data.length), metric('平均偏倚', fmt(result.meanBias)), metric('斜率', fmt(result.fit.slope)), metric('R-Sq', pct(result.fit.rsq))].join(''); drawScatter('linearityChart', result.data.map(x => [x.standard, x.bias]), result.fit, '线性与偏倚'); renderTable($('#linearityTable'), result.data.slice(0, 100), ['item', 'position', 'measurement', 'standard', 'bias']); }
    box.innerHTML = html;
  };
  const renderTable = (box, rows, fields) => { if (!box) return; const labels = { column: '规格/列', n: 'N', mean: '均值', sd: '标准差', lsl: 'LSL', usl: 'USL', cg: 'Cg', cgk: 'Cgk', bias: '偏倚', status: '判定', header: '序列', index: '子组', xbar: 'Xbar', s: 'S', xOut: 'Xbar超限', sOut: 'S超限', pcs: 'PCS', tri: '三坐标', aoi: 'AOI', range: '极差', ev: '重复性EV', av: '再现性AV', grr: 'GRR', pv: '零件PV', tv: '总变异TV', percentStudyVar: '%研究变异', percentTolerance: '%公差', ndc: 'ndc', value: '测量值', reference: '参考值', item: '测试项', position: '位置号', measurement: '测量值', standard: '标准值' }; box.innerHTML = `<table><thead><tr>${fields.map(f => `<th>${labels[f] || f}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${fields.map(f => `<td>${typeof row[f] === 'boolean' ? (row[f] ? '是' : '否') : esc(typeof row[f] === 'number' ? fmt(row[f]) : row[f])}</td>`).join('')}</tr>`).join('')}</tbody></table>`; };
  const canvasCtx = id => { const canvas = document.getElementById(id); if (!canvas) return null; const ratio = Math.max(1, window.devicePixelRatio || 1), width = Math.max(320, canvas.clientWidth || 640), height = Math.max(180, canvas.clientHeight || 260); canvas.width = width * ratio; canvas.height = height * ratio; const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height); return { canvas, ctx, width, height }; };
  const chartFrame = (id, title) => { const frame = canvasCtx(id); if (!frame) return null; const { ctx, width, height } = frame; ctx.fillStyle = '#172330'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#d9e8f3'; ctx.font = '600 14px sans-serif'; ctx.fillText(title, 16, 22); ctx.strokeStyle = '#496276'; ctx.lineWidth = 1; ctx.strokeRect(12, 34, width - 24, height - 48); return frame; };
  const drawChart = (id, values, opts) => { const f = chartFrame(id, opts.title); if (!f) return; const { ctx, width, height } = f, vals = values.map(Number).filter(Number.isFinite), max = Math.max(...vals, 1), min = Math.min(...vals, 0), left = 28, bottom = height - 25, plotH = height - 75, barW = Math.max(8, (width - 48) / Math.max(1, vals.length) - 5); vals.forEach((v, i) => { const x = left + i * ((width - 48) / Math.max(1, vals.length)); const h = (v - min) / Math.max(1e-9, max - min) * plotH; ctx.fillStyle = '#69c3ff'; ctx.fillRect(x, bottom - h, barW, h); }); };
  const drawControlChart = (id, values, limits, title) => { const f = chartFrame(id, title); if (!f) return; const { ctx, width, height } = f, vals = values.filter(Number.isFinite), all = vals.concat([limits.ucl, limits.lcl, limits.cl]), min = Math.min(...all), max = Math.max(...all), sx = i => 30 + i * ((width - 52) / Math.max(1, vals.length - 1)), sy = v => height - 28 - (v - min) / Math.max(1e-9, max - min) * (height - 70); ctx.strokeStyle = '#67d6a0'; ctx.lineWidth = 2; ctx.beginPath(); vals.forEach((v, i) => i ? (ctx.lineTo(sx(i), sy(v))) : ctx.moveTo(sx(i), sy(v))); ctx.stroke(); [['ucl', '#ff8f8f'], ['cl', '#f3c96b'], ['lcl', '#ff8f8f']].forEach(([k, color]) => { ctx.strokeStyle = color; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(24, sy(limits[k])); ctx.lineTo(width - 18, sy(limits[k])); ctx.stroke(); ctx.setLineDash([]); }); vals.forEach((v, i) => { ctx.fillStyle = v > limits.ucl || v < limits.lcl ? '#ff6f7d' : '#7ed6ff'; ctx.beginPath(); ctx.arc(sx(i), sy(v), 3, 0, Math.PI * 2); ctx.fill(); }); };
  const drawScatter = (id, pairs, fit, title) => { const f = chartFrame(id, title); if (!f) return; const { ctx, width, height } = f, xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]), min = Math.min(...xs, ...ys), max = Math.max(...xs, ...ys), sx = v => 30 + (v - min) / Math.max(1e-9, max - min) * (width - 55), sy = v => height - 28 - (v - min) / Math.max(1e-9, max - min) * (height - 70); ctx.fillStyle = '#6fd0ff'; pairs.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(sx(x), sy(y), 4, 0, Math.PI * 2); ctx.fill(); }); if (Number.isFinite(fit.slope)) { ctx.strokeStyle = '#f2c66d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx(min), sy(fit.intercept + fit.slope * min)); ctx.lineTo(sx(max), sy(fit.intercept + fit.slope * max)); ctx.stroke(); } };
  const drawHistogram = (id, values, title) => { const f = chartFrame(id, title); if (!f) return; const { ctx, width, height } = f, vals = values.filter(Number.isFinite), min = Math.min(...vals), max = Math.max(...vals), bins = 8, counts = Array(bins).fill(0), span = Math.max(1e-9, max - min); vals.forEach(v => counts[Math.min(bins - 1, Math.floor((v - min) / span * bins))]++); const bw = (width - 60) / bins, peak = Math.max(...counts, 1); counts.forEach((c, i) => { const h = c / peak * (height - 75); ctx.fillStyle = '#69c3ff'; ctx.fillRect(30 + i * bw, height - 28 - h, bw - 4, h); }); };
  const drawNormalPlot = (id, values, title) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b), pairs = sorted.map((v, i) => [i / Math.max(1, sorted.length - 1), v]); drawScatter(id, pairs, regression(pairs.map(p => p[0]), pairs.map(p => p[1])), title); };
  const drawAllCharts = () => { const result = state.results[state.active]; if (result) renderResult(state.active, result); };
  const parseText = text => text.trim().split(/\r?\n/).filter(line => line.trim()).map(line => line.split(/\t|,|;|\s{2,}/).map(cell => cell.trim()));
  const setRows = (rows, source = '') => { state.rows = rows; state.sourceName = source; const preview = $('#dataPreview'); if (preview) { const limit = rows.slice(0, 12); preview.innerHTML = `<table><thead><tr>${(limit[0] || []).map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${limit.slice(1).map(r => `<tr>${(limit[0] || []).map((_, i) => `<td>${esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`; } if ($('#dataMeta')) $('#dataMeta').hidden = !rows.length; if ($('#fileName')) $('#fileName').textContent = source || '粘贴数据'; if ($('#rowCount')) $('#rowCount').textContent = Math.max(0, rows.length - 1); if ($('#columnCount')) $('#columnCount').textContent = Math.max(0, ...rows.map(r => r.length)); setStatus(`已载入 ${rows.length} 行、${Math.max(0, ...rows.map(r => r.length))} 列${source ? `（${source}）` : ''}。`); };
  const setStatus = (message, error = false) => { const text = $('#statusText'); const bar = $('#statusBar'); if (text) text.textContent = message; if (bar) { bar.classList.toggle('error', error); bar.classList.toggle('success', !error); } };
  const readFile = file => { if (!file) return; const ext = file.name.toLowerCase().split('.').pop(); if (ext === 'csv' || ext === 'txt') { const reader = new FileReader(); reader.onload = () => setRows(parseText(reader.result), file.name); reader.readAsText(file, 'utf-8'); return; } if (!window.XLSX) return setStatus('Excel 解析库未加载，请刷新页面。', true); const reader = new FileReader(); reader.onload = e => { try { const book = XLSX.read(e.target.result, { type: 'array' }); const sheet = book.Sheets[book.SheetNames[0]]; setRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }), file.name); } catch (error) { setStatus(`Excel 读取失败：${error.message}`, true); } }; reader.readAsArrayBuffer(file); };
  const exportReport = () => {
    if (!window.XLSX) return setStatus('Excel 解析库未加载。', true);
    const book = XLSX.utils.book_new();
    const add = (name, rows) => { if (rows && rows.length) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31)); };
    add('原始数据', state.rows);
    Object.entries(state.results).forEach(([key, result]) => {
      if (!result) return;
      if (key === 'cgk') {
        add('CGK_结果', [['列', 'N', '均值', '标准差', 'LSL', 'USL', 'Cg', 'Cgk', '偏倚', '判定'], ...result.columns.map(x => [x.column, x.n, x.mean, x.sd, x.lsl, x.usl, x.cg, x.cgk, x.bias, x.status])]);
        add('CGK_图表数据', [['列', 'Cg', 'Cgk', '均值', 'LSL', 'USL'], ...result.columns.map(x => [x.column, x.cg, x.cgk, x.mean, x.lsl, x.usl])]);
      } else if (key === 'repeatability') {
        add('XbarS_结果', [['序列', '子组', 'Xbar', 'S', 'Xbar超限', 'S超限'], ...result.groups.map(x => [x.header, x.index, x.xbar, x.s, x.xOut, x.sOut])]);
        add('XbarS_图表数据', [['序列', '子组', 'Xbar', 'Xbar CL', 'Xbar UCL', 'Xbar LCL', 'S', 'S CL', 'S UCL', 'S LCL'], ...result.groups.map(x => [x.header, x.index, x.xbar, result.xbar.cl, result.xbar.ucl, result.xbar.lcl, x.s, result.s.cl, result.s.ucl, result.s.lcl])]);
      } else if (key === 'correlation') {
        add('相关性_结果', [['PCS', '三坐标', 'AOI', '极差'], ...result.tri.map((x, i) => [i + 1, x, result.aoi[i], result.range[i]]), [], ['R', result.fit.r], ['R-Sq', result.fit.rsq], ['斜率', result.fit.slope], ['截距', result.fit.intercept]]);
        add('相关性_图表数据', [['PCS', '三坐标', 'AOI', '拟合AOI'], ...result.fit.pairs.map((p, i) => [i + 1, p[0], p[1], result.fit.intercept + result.fit.slope * p[0]])]);
      } else if (key === 'grr') {
        add('GRR_结果', [['规格', 'N', 'EV', 'AV', 'GRR', 'PV', 'TV', '%Study Var', '%Tolerance', 'ndc', '判定'], ...result.columns.map(x => [x.column, x.n, x.ev, x.av, x.grr, x.pv, x.tv, x.percentStudyVar, x.percentTolerance, x.ndc, x.status])]);
        add('GRR_图表数据', [['规格', 'EV', 'AV', 'GRR', 'PV', 'TV'], ...result.columns.map(x => [x.column, x.ev, x.av, x.grr, x.pv, x.tv])]);
      } else if (key === 'bias') {
        add('偏倚_结果', [['N', '平均偏倚', '标准差', 'CI下限', 'CI上限', '判定'], [result.n, result.mean, result.sd, result.ciLow, result.ciHigh, result.status], [], ['测量值', '参考值', '偏倚'], ...result.data.map(x => [x.value, x.reference, x.bias])]);
        add('偏倚_图表数据', [['序号', '偏倚'], ...result.data.map((x, i) => [i + 1, x.bias])]);
      } else if (key === 'linearity') {
        add('线性_结果', [['样本数', '平均偏倚', '斜率', '截距', 'R-Sq'], [result.data.length, result.meanBias, result.fit.slope, result.fit.intercept, result.fit.rsq], [], ['测试项', '位置号', '测量值', '标准值', '偏倚'], ...result.data.map(x => [x.item, x.position, x.measurement, x.standard, x.bias])]);
        add('线性_图表数据', [['测试项', '位置号', '标准值', '测量值', '偏倚', '拟合偏倚'], ...result.data.map((x, i) => [x.item, x.position, x.standard, x.measurement, x.bias, result.fit.intercept + result.fit.slope * x.standard])]);
      }
    });
    XLSX.writeFile(book, `MSA分析报告_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setStatus('报告已导出：包含原始数据、结果子表和可制作 Excel 图表的图表数据子表。');
  };
  const bind = () => {
    $$('#moduleNav [data-module]').forEach(btn => btn.addEventListener('click', () => { state.active = btn.dataset.module; $$('#moduleNav [data-module]').forEach(x => x.classList.toggle('active', x === btn)); $$('[data-panel]').forEach(x => x.classList.toggle('active', x.dataset.panel === state.active)); const titles = { cgk: '量具研究 CGK', repeatability: '重复性 Xbar-S', correlation: '相关性', grr: 'GRR', bias: '偏倚', linearity: '线性' }; if ($('#moduleTitle')) $('#moduleTitle').textContent = titles[state.active]; }));
    $('#fileInput')?.addEventListener('change', e => readFile(e.target.files[0])); $('#togglePasteBtn')?.addEventListener('click', () => { const area = $('#pasteInput'); if (!area) return; area.hidden = !area.hidden; $('#togglePasteBtn').textContent = area.hidden ? '显示粘贴区' : '收起粘贴区'; }); $('#pasteInput')?.addEventListener('input', e => { if (e.target.value.trim()) setRows(parseText(e.target.value)); }); $('#analyzeBtn')?.addEventListener('click', analyse); $('#exportAllBtn')?.addEventListener('click', exportReport); $('#clearDataBtn')?.addEventListener('click', () => { state.rows = []; state.results = {}; if ($('#pasteInput')) $('#pasteInput').value = ''; if ($('#dataPreview')) $('#dataPreview').innerHTML = '<div class="empty-state"><span class="empty-icon">＋</span><p>尚未载入数据</p></div>'; setStatus('已清空当前数据。'); }); window.addEventListener('resize', drawAllCharts);
    const first = $('#moduleNav [data-module]'); first?.click(); setStatus('请导入 Excel/CSV，或粘贴带表头的制表符数据。');
  };
  window.MSA_APP = { state, analyse, setRows, parseText };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', bind) : bind();
})();
