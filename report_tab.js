// Report tab shared by the portal and the share page. renderAccessReport(container, A, figSrc)
function renderAccessReport(root, A, figSrc) {
  if (!A) return;
  const fmt = n => (n === null || n === undefined || isNaN(n)) ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const rows = [['strip', 'Straight up the strip', '—', A.strip.length_m, A.strip.mean_grade_pct, '>40', 0]];
  for (const r of A.routes) { if (r.design_grade_pct === 20) continue; if (!/^(A|D)/.test(r.start)) continue;
    rows.push([r.start[0], `${r.start.replace(/^[A-D] /, '')} → ${r.target}`, r.design_grade_pct + ' %', r.length_m, r.mean_grade_pct, r.max_grade_pct, r.pct_length_outside_own_land]); }
  const t = root.querySelector('#rep-routes');
  if (t) t.innerHTML = `<table class="rep"><thead><tr><th>Start</th><th>Route</th><th>Design grade</th><th>Length</th><th>Mean grade</th><th>Max grade</th><th>Off own land</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${r[0] === 'strip' ? '—' : r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${fmt(r[3])} m</td><td>${r[4]} %</td><td>${r[5]} %</td><td>${r[6]} %</td></tr>`).join('') + `</tbody></table>`;
  const c = root.querySelector('#rep-terrain'); const cls = A.terrain_slope_pct_classes;
  if (c && cls) c.innerHTML = `<table class="rep"><thead><tr><th>Ground slope</th><th>Parcel _3</th><th>Parcela 2</th></tr></thead><tbody>` + Object.keys(cls.parcel_2).map(k => `<tr><td>${k} %</td><td>${cls.parcel_3[k]} %</td><td>${cls.parcel_2[k]} %</td></tr>`).join('') + `</tbody></table>`;
  root.querySelectorAll('img[data-fig]').forEach(img => { img.src = figSrc(img.dataset.fig); });
}
function setupTabs(showMap, showReport) {
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b)); b.dataset.tab === 'map' ? showMap() : showReport(); }));
}

// ---------- interactive route explorer (second tab) ----------
const GRADE_CLASSES = [[8, '#1a9641', 'up to 8 %: any vehicle, gravel ok'], [12, '#a6d96a', '8-12 %: lotification-street ceiling, pave it'], [15, '#fdae61', '12-15 %: short concrete pitches only'], [20, '#f46d43', '15-20 %: 4x4 pitches, not approvable'], [1e9, '#a50026', 'over 20 %: track territory']];
function gradeColor(g) { for (const [lim, col] of GRADE_CLASSES) if (g <= lim) return col; return '#a50026'; }
function initRouteExplorer(root, A, routesFC, opts) {
  const host = root.querySelector('#rep-explorer'); if (!host || !A || !routesFC) return null;
  const fmt = (n, d = 0) => (n === null || n === undefined || isNaN(n)) ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
  const starts = Object.keys(A.starts); const targets = Object.keys(A.targets);
  host.innerHTML = `<div class="rx-controls">
      <label>Start <select id="rx-start">${starts.map(s => `<option value="${s}">${s}</option>`).join('')}</select></label>
      <label>Target <select id="rx-target">${targets.map(t => `<option value="${t}">${t}</option>`).join('')}</select></label>
      <label>Design grade <select id="rx-grade"><option value="12">12 % (local street)</option><option value="15">15 % (concrete pitches)</option><option value="20">20 % (track)</option></select></label>
      <label><input type="checkbox" id="rx-strip"> the strip instead (straight up)</label>
      <span class="cl">or click any alignment on the map</span></div>
    <div id="rx-map"></div>
    <div id="rx-stats"></div>
    <svg id="rx-profile" viewBox="0 0 900 250" preserveAspectRatio="none"></svg>
    <div id="rx-legend">${GRADE_CLASSES.map(([l, c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>`;
  const map = L.map('rx-map', { preferCanvas: true, zoomControl: true, attributionControl: false });
  opts.base(map);
  if (opts.slope) L.imageOverlay(opts.slope.src, opts.slope.bounds, { opacity: .55, interactive: false }).addTo(map);
  if (opts.parcels) L.geoJSON(opts.parcels, { style: { color: '#ff0000', weight: 2.5, fill: false } }).addTo(map);
  const all = L.geoJSON(routesFC, { style: f => ({ color: f.properties.kind === 'strip' ? '#ff00ff' : '#666', weight: 1.5, opacity: .7, dashArray: f.properties.kind === 'strip' ? '5 4' : null }),
    onEachFeature: (f, l) => { l.bindTooltip(f.properties.kind === 'strip' ? 'the strip' : `${f.properties.start.slice(0, 1)} → ${f.properties.target}, design ${f.properties.design_grade_pct} %`, { sticky: true }); l.on('click', () => select(f)); } }).addTo(map);
  let selLayer = null;
  const key = f => f.properties.kind === 'strip' ? 'strip' : `${f.properties.start}|${f.properties.target}|${f.properties.design_grade_pct}`;
  const profileOf = f => f.properties.kind === 'strip' ? A.strip.profile : (A.routes.find(r => r.start === f.properties.start && r.target === f.properties.target && r.design_grade_pct === f.properties.design_grade_pct) || {}).profile;
  function segments(f, pr) {
    const c = f.geometry.coordinates; const out = [];
    for (let i = 0; i < c.length - 1 && i < pr.seg.length; i++) { const g = Math.abs(pr.z[i + 1] - pr.z[i]) / pr.seg[i] * 100; out.push({ type: 'Feature', properties: { grade: g }, geometry: { type: 'LineString', coordinates: [c[i], c[i + 1]] } }); }
    return { type: 'FeatureCollection', features: out };
  }
  function drawProfile(pr) {
    const svg = host.querySelector('#rx-profile'); const W = 900, H = 250, ml = 52, mr = 14, mt = 18, mb = 34;
    const cum = [0]; for (const s of pr.seg) cum.push(cum[cum.length - 1] + s);
    const L0 = cum[cum.length - 1] || 1, zmin = Math.min(...pr.z), zmax = Math.max(...pr.z), zr = Math.max(zmax - zmin, 10);
    const X = d => ml + d / L0 * (W - ml - mr), Y = z => mt + (1 - (z - zmin) / zr) * (H - mt - mb);
    let h = '';
    for (let k = 0; k <= 4; k++) { const z = zmin + zr * k / 4; h += `<line x1="${ml}" x2="${W - mr}" y1="${Y(z)}" y2="${Y(z)}" stroke="currentColor" stroke-opacity=".15"/><text x="${ml - 6}" y="${Y(z) + 4}" font-size="11" text-anchor="end" fill="currentColor">${z.toFixed(0)}</text>`; }
    for (let d = 0; d <= L0; d += L0 > 1200 ? 250 : L0 > 500 ? 100 : 50) h += `<line x1="${X(d)}" x2="${X(d)}" y1="${mt}" y2="${H - mb}" stroke="currentColor" stroke-opacity=".1"/><text x="${X(d)}" y="${H - mb + 14}" font-size="11" text-anchor="middle" fill="currentColor">${d}</text>`;
    for (let i = 0; i < pr.seg.length; i++) { const g = Math.abs(pr.z[i + 1] - pr.z[i]) / pr.seg[i] * 100; h += `<line x1="${X(cum[i])}" y1="${Y(pr.z[i])}" x2="${X(cum[i + 1])}" y2="${Y(pr.z[i + 1])}" stroke="${gradeColor(g)}" stroke-width="4" stroke-linecap="round"><title>${g.toFixed(1)} % at ${cum[i].toFixed(0)} m</title></line>`; }
    h += `<text x="${W / 2}" y="${H - 4}" font-size="11" text-anchor="middle" fill="currentColor">distance along the alignment (m)</text><text x="12" y="${mt - 4}" font-size="11" fill="currentColor">elevation (m)</text>`;
    svg.innerHTML = h;
  }
  function verdict(pr, f) {
    const L0 = pr.seg.reduce((a, b) => a + b, 0); const bins = [0, 0, 0, 0, 0];
    for (let i = 0; i < pr.seg.length; i++) { const g = Math.abs(pr.z[i + 1] - pr.z[i]) / pr.seg[i] * 100; bins[GRADE_CLASSES.findIndex(([l]) => g <= l)] += pr.seg[i]; }
    const pct = bins.map(b => b / L0 * 100);
    const bar = `<div class="rx-bar">${pct.map((p, i) => p > 0 ? `<span style="width:${p}%;background:${GRADE_CLASSES[i][1]}" title="${GRADE_CLASSES[i][2]}: ${p.toFixed(0)} %"></span>` : '').join('')}</div>`;
    const over12 = pct[2] + pct[3] + pct[4], over15 = pct[3] + pct[4], over20 = pct[4];
    let text;
    if (f.properties.kind === 'strip') text = `Not a road: ${over20.toFixed(0)} % of the strip is steeper than 20 % and the corridor is too narrow for switchbacks.`;
    else if (over15 < 1) text = over12 < 5 ? `Meets the 12 % local-street standard over practically its whole length.` : `Within the 15 % limit; ${over12.toFixed(0)} % of the length needs concrete pitches between 12 and 15 %.`;
    else if (over20 < 1) text = `${over15.toFixed(0)} % of the length is between 15 and 20 %: only defensible as short concrete pitches on a private drive, not as a lotification street.`;
    else text = `${over20.toFixed(0)} % of the length is steeper than 20 %: a track, not a street.`;
    const own = f.properties.pct_length_outside_own_land || 0;
    return `${bar}<p class="rx-verdict"><b>Verdict.</b> ${text}${own ? ` About ${fmt(own / 100 * L0)} m (${own} %) runs off the family's land and would need a right of way.` : ' Entirely on the family\'s land.'}</p>`;
  }
  function select(f) {
    const pr = profileOf(f); if (!pr) return;
    if (selLayer) map.removeLayer(selLayer);
    selLayer = L.geoJSON(segments(f, pr), { style: s => ({ color: gradeColor(s.properties.grade), weight: 6, opacity: .95 }), onEachFeature: (s, l) => l.bindTooltip(`${s.properties.grade.toFixed(1)} %`, { sticky: true }) }).addTo(map);
    map.fitBounds(selLayer.getBounds().pad(0.35));
    const p = f.properties;
    host.querySelector('#rx-stats').innerHTML = `<table class="rep"><tbody>
      <tr><td>Route</td><td>${p.kind === 'strip' ? p.label : `${p.start} → ${p.target}, design grade ${p.design_grade_pct} %`}</td></tr>
      <tr><td>Length / climb</td><td>${fmt(p.length_m)} m / ${fmt(p.gain_m, 1)} m (${fmt(p.z_start)} → ${fmt(p.z_end)} m)</td></tr>
      <tr><td>Mean / max grade</td><td>${p.mean_grade_pct} % / ${p.max_grade_pct} %</td></tr>
      <tr><td>Length steeper than 12 / 15 / 20 %</td><td>${p.pct_length_over_12} % / ${p.pct_length_over_15} % / ${p.pct_length_over_20} %</td></tr>
      <tr><td>Off the family's land</td><td>${p.pct_length_outside_own_land || 0} %</td></tr></tbody></table>` + verdict(pr, f);
    drawProfile(pr);
    if (p.kind !== 'strip') { host.querySelector('#rx-start').value = p.start; host.querySelector('#rx-target').value = p.target; host.querySelector('#rx-grade').value = String(p.design_grade_pct); host.querySelector('#rx-strip').checked = false; } else host.querySelector('#rx-strip').checked = true;
  }
  function fromControls() {
    if (host.querySelector('#rx-strip').checked) { const s = routesFC.features.find(f => f.properties.kind === 'strip'); if (s) select(s); return; }
    const st = host.querySelector('#rx-start').value, tg = host.querySelector('#rx-target').value, g = +host.querySelector('#rx-grade').value;
    const f = routesFC.features.find(x => x.properties.kind === 'route' && x.properties.start === st && x.properties.target === tg && x.properties.design_grade_pct === g); if (f) select(f);
  }
  ['#rx-start', '#rx-target', '#rx-grade', '#rx-strip'].forEach(id => host.querySelector(id).addEventListener('change', fromControls));
  const d = routesFC.features.find(x => x.properties.kind === 'route' && x.properties.start.startsWith('D') && x.properties.target === targets[0] && x.properties.design_grade_pct === 12) || routesFC.features[0];
  select(d);
  return map;
}
