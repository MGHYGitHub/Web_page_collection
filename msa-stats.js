/*
 * MSA statistics helpers
 *
 * The functions in this file deliberately do not depend on a charting or Excel
 * library.  They return plain, serialisable objects so the MSA page can use the
 * same results for cards, charts and worksheet export.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MSAStats = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var D2 = {
    2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534,
    7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078, 11: 3.173,
    12: 3.258, 13: 3.336, 14: 3.407, 15: 3.472
  };
  var A3 = { 2: 2.659, 3: 1.954, 4: 1.628, 5: 1.427, 6: 1.287,
    7: 1.182, 8: 1.099, 9: 1.032, 10: 0.975 };
  var B3 = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0.118,
    8: 0.185, 9: 0.239, 10: 0.284 };
  var B4 = { 2: 3.267, 3: 2.574, 4: 2.282, 5: 2.114, 6: 2.004,
    7: 1.924, 8: 1.864, 9: 1.816, 10: 1.777 };

  function finite(x) {
    if (x === null || x === undefined || x === '') return null;
    var n = typeof x === 'number' ? x : Number(String(x).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }
  function values(input) {
    var out = [];
    (Array.isArray(input) ? input : []).forEach(function (v) {
      if (Array.isArray(v)) out = out.concat(values(v));
      else { var n = finite(v); if (n !== null) out.push(n); }
    });
    return out;
  }
  function mean(a) {
    var x = values(a); return x.length ? x.reduce(function (s, v) { return s + v; }, 0) / x.length : null;
  }
  function sd(a) {
    var x = values(a);
    if (x.length < 2) return x.length ? 0 : null;
    var m = mean(x);
    return Math.sqrt(x.reduce(function (s, v) { return s + Math.pow(v - m, 2); }, 0) / (x.length - 1));
  }
  function range(a) {
    var x = values(a); return x.length ? Math.max.apply(null, x) - Math.min.apply(null, x) : null;
  }
  function round(n, p) {
    if (!Number.isFinite(n)) return null;
    var f = Math.pow(10, p == null ? 6 : p); return Math.round(n * f) / f;
  }
  function safeSqrt(n) { return n != null && n >= 0 ? Math.sqrt(n) : null; }

  /** Parse strings such as ISO(0±50), 10 +/- 0.2, [9.8,10.2], LSL=9 USL=11. */
  function parseSpecification(spec) {
    if (spec && typeof spec === 'object') {
      var lo = finite(spec.lsl != null ? spec.lsl : (spec.lower != null ? spec.lower : spec.min));
      var hi = finite(spec.usl != null ? spec.usl : (spec.upper != null ? spec.upper : spec.max));
      var target = finite(spec.target != null ? spec.target : spec.nominal);
      if (lo !== null && hi !== null && hi >= lo) return { lsl: lo, usl: hi, target: target === null ? (lo + hi) / 2 : target, text: spec.text || '' };
      return null;
    }
    if (typeof spec !== 'string') return null;
    var s = spec.trim();
    var pair = s.match(/(?:LSL|下限)\s*[:=]\s*([-+]?\d*\.?\d+).*?(?:USL|上限)\s*[:=]\s*([-+]?\d*\.?\d+)/i);
    if (pair) return { lsl: Number(pair[1]), usl: Number(pair[2]), target: (Number(pair[1]) + Number(pair[2])) / 2, text: s };
    var bracket = s.match(/[\[（(]\s*([-+]?\d*\.?\d+)\s*[,，]\s*([-+]?\d*\.?\d+)\s*[\]）)]/);
    if (bracket) { var a = Number(bracket[1]), b = Number(bracket[2]); return { lsl: Math.min(a, b), usl: Math.max(a, b), target: (a + b) / 2, text: s }; }
    var pm = s.match(/([-+]?\d*\.?\d+)\s*(?:±|\+\/\-|\+\-|-\+?)\s*([-+]?\d*\.?\d+)/);
    if (pm) { var c = Number(pm[1]), t = Math.abs(Number(pm[2])); return { lsl: c - t, usl: c + t, target: c, text: s }; }
    var nums = s.match(/[-+]?\d*\.?\d+/g);
    if (nums && nums.length >= 2) { var n1 = Number(nums[0]), n2 = Number(nums[1]); return { lsl: Math.min(n1, n2), usl: Math.max(n1, n2), target: (n1 + n2) / 2, text: s }; }
    return null;
  }

  function cgk(data, specification) {
    var x = values(data), spec = parseSpecification(specification), n = x.length;
    if (!spec) return { ok: false, error: '无法识别规格上下限', n: n, values: x };
    if (!n) return { ok: false, error: '没有有效测量值', spec: spec, n: 0 };
    var m = mean(x), sigma = sd(x), six = sigma == null ? null : 6 * sigma;
    var tolerance = spec.usl - spec.lsl;
    // Minitab Gauge Capability's Cg/Cgk use 20% of the tolerance for the
    // gauge error.  Cp/Cpk are returned as well for users comparing a plain
    // process capability calculation.
    var cp = six && six > 0 ? tolerance / six : null;
    var cgu = sigma > 0 ? (spec.usl - m) / (3 * sigma) : null;
    var cgl = sigma > 0 ? (m - spec.lsl) / (3 * sigma) : null;
    var cpk = sigma > 0 ? Math.min(cgu, cgl) : null;
    var cg = sigma > 0 ? 0.2 * tolerance / six : null;
    var cgkValue = sigma > 0 ? (0.1 * tolerance - Math.abs(m - spec.target)) / (3 * sigma) : null;
    return { ok: true, n: n, mean: m, sd: sigma, spec: spec, cg: cg, cgk: cgkValue,
      cgu: cgu, cgl: cgl, cp: cp, cpk: cpk,
      withinSpec: x.filter(function (v) { return v >= spec.lsl && v <= spec.usl; }).length,
      outOfSpec: x.filter(function (v) { return v < spec.lsl || v > spec.usl; }).length,
      values: x };
  }

  function cgkTable(rows, headers, specifications) {
    var data = Array.isArray(rows) ? rows : [], cols = Number.isFinite(headers) ? headers : (Array.isArray(headers) ? headers.length : (headers || (data[0] || []).length));
    var out = [];
    for (var c = 0; c < cols; c++) {
      var column = data.map(function (r) { return Array.isArray(r) ? r[c] : r && r[c]; });
      var h = Array.isArray(headers) ? headers[c] : '列' + (c + 1);
      var sp = Array.isArray(specifications) ? specifications[c] : (specifications && (specifications[h] || specifications[c]));
      out.push(Object.assign({ column: c + 1, header: h }, cgk(column, sp || h)));
    }
    return { rows: data.length, columns: out };
  }

  function subgroup(row) { return values(Array.isArray(row) ? row : [row]); }
  /** Xbar-S chart. Each inner array is a subgroup; a flat array is treated as one subgroup. */
  function xbarS(groups, options) {
    options = options || {};
    var gs = Array.isArray(groups) ? groups : [];
    if (gs.length && !Array.isArray(gs[0])) gs = [gs];
    gs = gs.map(subgroup).filter(function (g) { return g.length; });
    var n = options.subgroupSize || (gs[0] && gs[0].length) || 1;
    var means = gs.map(mean), sds = gs.map(sd), xbar = mean(means), sbar = mean(sds);
    var a3 = A3[n], b3 = B3[n], b4 = B4[n];
    var xucl = a3 != null && sbar != null ? xbar + a3 * sbar : null;
    var xlcl = a3 != null && sbar != null ? xbar - a3 * sbar : null;
    var sucl = b4 != null && sbar != null ? b4 * sbar : null;
    var slcl = b3 != null && sbar != null ? b3 * sbar : null;
    var points = gs.map(function (g, i) { return { subgroup: i + 1, n: g.length, mean: means[i], sd: sds[i], xbarOut: xucl != null && (means[i] > xucl || means[i] < xlcl), sOut: sucl != null && (sds[i] > sucl || sds[i] < slcl), values: g }; });
    return { ok: gs.length > 0, subgroupSize: n, subgroupCount: gs.length, xbarbar: xbar, sbar: sbar,
      xbarLimits: { center: xbar, ucl: xucl, lcl: xlcl }, sLimits: { center: sbar, ucl: sucl, lcl: slcl }, points: points };
  }

  function regression(xInput, yInput) {
    var x = [], y = [];
    var n0 = Math.max(Array.isArray(xInput) ? xInput.length : 0, Array.isArray(yInput) ? yInput.length : 0);
    for (var i = 0; i < n0; i++) { var xi = finite(xInput[i]), yi = finite(yInput[i]); if (xi !== null && yi !== null) { x.push(xi); y.push(yi); } }
    var n = x.length, mx = mean(x), my = mean(y), sxx = 0, sxy = 0, syy = 0;
    for (var j = 0; j < n; j++) { sxx += Math.pow(x[j] - mx, 2); sxy += (x[j] - mx) * (y[j] - my); syy += Math.pow(y[j] - my, 2); }
    var slope = sxx > 0 ? sxy / sxx : null, intercept = slope == null ? null : my - slope * mx;
    var r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, r2 = r == null ? null : r * r;
    var fitted = slope == null ? y.map(function () { return null; }) : x.map(function (v) { return intercept + slope * v; });
    var residuals = slope == null ? y.map(function () { return null; }) : y.map(function (v, k) { return v - fitted[k]; });
    return { ok: n >= 2, n: n, x: x, y: y, meanX: mx, meanY: my, slope: slope, intercept: intercept, r: r, r2: r2, rSquared: r2, fitted: fitted, residuals: residuals,
      points: x.map(function (v, k) { return { x: v, y: y[k], fitted: fitted[k], residual: residuals[k] }; }) };
  }
  function correlation(input, options) {
    options = options || {};
    var x = input && input.x, y = input && input.y;
    if (input && input.coordinate && input.aoi) { x = input.coordinate; y = input.aoi; }
    if (input && Array.isArray(input.rows)) {
      var pcs = Number(input.pcs || options.pcs || 0), rows = input.rows;
      if (pcs > 0) { x = rows.slice(0, pcs).map(function (r) { return Array.isArray(r) ? r[0] : r; }); y = rows.slice(pcs, pcs * 2).map(function (r) { return Array.isArray(r) ? r[0] : r; }); }
    }
    return regression(x || [], y || []);
  }

  function grr(input, options) {
    options = options || {};
    var rows = Array.isArray(input) ? input : (input && input.rows) || [];
    // Accept the common worksheet layout directly: header, upper limit, lower
    // limit, then Product/Operator/measurement rows (possibly multiple specs).
    if (rows.length >= 4 && Array.isArray(rows[0]) && rows[0].length >= 3 &&
      rows[1] && rows[2] && rows[1].length >= 3 && rows[2].length >= 3) {
      var matrix = rows, expanded = [];
      for (var mi = 3; mi < matrix.length; mi++) {
        var mr = matrix[mi] || [];
        for (var mj = 2; mj < Math.max(matrix[0].length, mr.length); mj++) {
          var mv = finite(mr[mj]);
          if (mv !== null) expanded.push({ part: mr[0], operator: mr[1], value: mv, specColumn: mj - 2 });
        }
      }
      var matrixHeaders = matrix[0].slice(2), matrixUpper = matrix[1].slice(2), matrixLower = matrix[2].slice(2);
      var matrixColumns = matrixHeaders.map(function (header, columnIndex) {
        var columnRows = expanded.filter(function (r) { return r.specColumn === columnIndex; });
        var tol = finite(matrixUpper[columnIndex]) !== null && finite(matrixLower[columnIndex]) !== null ? Math.abs(finite(matrixUpper[columnIndex]) - finite(matrixLower[columnIndex])) : null;
        var result = grr(columnRows, Object.assign({}, options, tol === null ? {} : { tolerance: tol }));
        result.column = header || ('规格' + (columnIndex + 1));
        result.specification = { upper: finite(matrixUpper[columnIndex]), lower: finite(matrixLower[columnIndex]), tolerance: tol };
        return result;
      });
      return { ok: matrixColumns.some(function (c) { return c.ok; }), columns: matrixColumns, records: expanded, parts: [], operators: [] };
    }
    var recs = [];
    rows.forEach(function (r) {
      var part = r && (r.part != null ? r.part : (r.product != null ? r.product : (Array.isArray(r) ? r[0] : null)));
      var op = r && (r.operator != null ? r.operator : (r.operatorId != null ? r.operatorId : (Array.isArray(r) ? r[1] : null)));
      var val = r && (r.value != null ? r.value : (r.measurement != null ? r.measurement : (Array.isArray(r) ? r[2] : null)));
      var n = finite(val); if (n !== null && part != null && op != null) recs.push({ part: String(part), operator: String(op), value: n, specColumn: r.specColumn });
    });
    var parts = [], ops = [];
    recs.forEach(function (r) { if (parts.indexOf(r.part) < 0) parts.push(r.part); if (ops.indexOf(r.operator) < 0) ops.push(r.operator); });
    var cells = {}, i;
    recs.forEach(function (r) { var k = r.part + '\u0000' + r.operator; (cells[k] || (cells[k] = [])).push(r.value); });
    var repeats = 0, cellStats = [];
    Object.keys(cells).forEach(function (k) { var v = cells[k], bits = k.split('\u0000'); repeats = Math.max(repeats, v.length); cellStats.push({ part: bits[0], operator: bits[1], n: v.length, mean: mean(v), range: range(v), sd: sd(v), values: v }); });
    var ev = null, av = null, pv = null;
    if (repeats >= 2 && D2[repeats]) { var rbar = mean(cellStats.map(function (c) { return c.range; })); ev = rbar / D2[repeats]; }
    var opMeans = ops.map(function (op) { return mean(recs.filter(function (r) { return r.operator === op; }).map(function (r) { return r.value; })); });
    var partMeans = parts.map(function (p) { return mean(recs.filter(function (r) { return r.part === p; }).map(function (r) { return r.value; })); });
    if (ops.length >= 2 && D2[ops.length] && ev != null) { var opDiff = Math.max.apply(null, opMeans) - Math.min.apply(null, opMeans); av = safeSqrt(Math.pow(opDiff / D2[ops.length], 2) - Math.pow(ev, 2) / (parts.length * repeats)); }
    if (parts.length >= 2 && D2[parts.length]) { var pDiff = Math.max.apply(null, partMeans) - Math.min.apply(null, partMeans); pv = pDiff / D2[parts.length]; }
    var grrValue = ev != null && av != null ? Math.sqrt(ev * ev + av * av) : null;
    var tv = grrValue != null && pv != null ? Math.sqrt(grrValue * grrValue + pv * pv) : null;
    var tolerance = finite(options.tolerance != null ? options.tolerance : (options.usl != null && options.lsl != null ? options.usl - options.lsl : null));
    var study = tv == null ? null : 6 * tv;
    return { ok: recs.length > 0, rows: recs.length, parts: parts, operators: ops, repeatCount: repeats,
      cellStats: cellStats, operatorMeans: ops.map(function (v, k) { return { operator: v, mean: opMeans[k] }; }),
      partMeans: parts.map(function (v, k) { return { part: v, mean: partMeans[k] }; }),
      components: { ev: ev, av: av, grr: grrValue, pv: pv, tv: tv, repeatability: ev, reproducibility: av, partVariation: pv },
      studyVariation: { ev: ev == null ? null : ev * 6, av: av == null ? null : av * 6, grr: grrValue == null ? null : grrValue * 6, pv: pv == null ? null : pv * 6, tv: study },
      percentStudy: study ? { ev: ev * 6 / study * 100, av: av * 6 / study * 100, grr: grrValue * 6 / study * 100, pv: pv * 6 / study * 100, total: 100 } : null,
      percentTolerance: tolerance && grrValue != null ? grrValue * 6 / tolerance * 100 : null,
      tolerance: tolerance, ndc: grrValue && pv != null ? 1.41 * pv / grrValue : null };
  }

  function normalQuantile(p) {
    // Peter John Acklam's rational approximation (sufficient for plot guides).
    if (!(p > 0 && p < 1)) return null;
    var a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    var b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    var c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    var d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    var q, r;
    if (p < 0.02425) {
      q = Math.sqrt(-2 * Math.log(p));
      var nl = c[0] * q + c[1]; nl = nl * q + c[2]; nl = nl * q + c[3]; nl = nl * q + c[4]; nl = nl * q + c[5];
      var dl = d[0] * q + d[1]; dl = dl * q + d[2]; dl = dl * q + d[3]; dl = dl * q + 1;
      return nl / dl;
    }
    if (p > 0.97575) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      var nu = c[0] * q + c[1]; nu = nu * q + c[2]; nu = nu * q + c[3]; nu = nu * q + c[4]; nu = nu * q + c[5];
      var du = d[0] * q + d[1]; du = du * q + d[2]; du = du * q + d[3]; du = du * q + 1;
      return -nu / du;
    }
    q = p - 0.5; r = q * q;
    var nm = a[0] * r + a[1]; nm = nm * r + a[2]; nm = nm * r + a[3]; nm = nm * r + a[4]; nm = nm * r + a[5]; nm *= q;
    var dm = b[0] * r + b[1]; dm = dm * r + b[2]; dm = dm * r + b[3]; dm = dm * r + b[4]; dm = dm * r + 1;
    return nm / dm;
  }
  function bias(input, options) {
    options = options || {};
    var rows = Array.isArray(input) ? input : (input && input.rows) || [], a = [], b = [], c = [];
    rows.forEach(function (r) {
      var av = Array.isArray(r) ? finite(r[0]) : finite(r && (r.a != null ? r.a : r.data));
      var bv = Array.isArray(r) ? finite(r[1]) : finite(r && (r.b != null ? r.b : r.reference));
      var cv = Array.isArray(r) ? finite(r[2]) : finite(r && r.bias);
      if (av !== null) { a.push(av); if (bv !== null) b.push(bv); c.push(cv === null && bv !== null ? av - bv : cv); }
    });
    c = c.filter(function (v) { return v !== null; });
    var m = mean(c), s = sd(c), n = c.length, se = s != null && n ? s / Math.sqrt(n) : null, t = se ? m / se : null;
    var confidence = Number(options.confidence == null ? 0.95 : options.confidence);
    if (!(confidence > 0 && confidence < 1)) confidence = 0.95;
    var z = n ? normalQuantile((1 + confidence) / 2) : null;
    var ci = se == null ? null : { lower: m - z * se, upper: m + z * se };
    var sorted = c.slice().sort(function (x, y) { return x - y; });
    var probability = sorted.map(function (v, i) { return { value: v, z: normalQuantile((i + 0.5) / n), rank: i + 1 }; });
    var bins = [], count = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(n || 1))));
    if (n) { var lo = sorted[0], hi = sorted[n - 1], width = hi === lo ? 1 : (hi - lo) / count; for (var q = 0; q < count; q++) bins.push({ from: lo + q * width, to: q === count - 1 ? hi : lo + (q + 1) * width, count: 0 }); sorted.forEach(function (v) { var idx = width ? Math.min(count - 1, Math.floor((v - lo) / width)) : 0; bins[idx].count++; }); }
    return { ok: n > 0, n: n, data: { a: a, reference: b, bias: c }, meanBias: m, sd: s, standardError: se, t: t,
      confidence: confidence, confidenceInterval: ci, confidence95: confidence === 0.95 ? ci : null,
      significant: ci ? !(ci.lower <= 0 && ci.upper >= 0) : null, significantAt95: confidence === 0.95 && ci ? !(ci.lower <= 0 && ci.upper >= 0) : null,
      probability: probability, histogram: bins };
  }

  function linearity(input, options) {
    options = options || {};
    var rows = Array.isArray(input) ? input : (input && input.rows) || [], ref = [], measured = [], records = [];
    rows.forEach(function (r) {
      var test = Array.isArray(r) ? r[0] : r && r.test;
      var pos = Array.isArray(r) ? r[1] : r && r.position;
      var mv = Array.isArray(r) ? finite(r[2]) : finite(r && r.measurement);
      var rv = Array.isArray(r) ? finite(r[3]) : finite(r && (r.standard != null ? r.standard : r.reference));
      if (mv !== null && rv !== null) { ref.push(rv); measured.push(mv); records.push({ test: test, position: pos, measurement: mv, standard: rv, bias: mv - rv }); }
    });
    var fit = regression(ref, records.map(function (r) { return r.bias; }));
    records.forEach(function (r, i) { r.fittedBias = fit.fitted[i]; });
    return { ok: records.length >= 2, n: records.length, rows: records, reference: ref, measured: measured, bias: records.map(function (r) { return r.bias; }), regression: fit, slope: fit.slope, intercept: fit.intercept, r2: fit.r2, meanBias: mean(records.map(function (r) { return r.bias; })) };
  }

  return { finite: finite, values: values, mean: mean, sd: sd, range: range, parseSpecification: parseSpecification,
    cgk: cgk, cgkTable: cgkTable, xbarS: xbarS, regression: regression, correlation: correlation, grr: grr,
    bias: bias, linearity: linearity, constants: { D2: D2, A3: A3, B3: B3, B4: B4 } };
});
