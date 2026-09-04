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

// ---------- concept layouts tab ----------
const CP_STYLE = f => { const p = f.properties, k = p.kind;
  if (k === 'lot') return { color: '#7c4a03', weight: 1, fillColor: ({ 'base': '#fde68a', 'vista/alto (+10 %)': '#fdba74', 'pendiente 12-22 % (-15 %)': '#d9f99d', 'lote con vista (+25 %)': '#f9a8d4' })[p.tier] || '#fde68a', fillOpacity: .75 };
  if (k === 'plaza') return { color: '#3730a3', weight: 1.2, fillColor: '#c7d2fe', fillOpacity: .8 };
  if (k === 'park' || k === 'garden') return { color: '#166534', weight: 1.2, fillColor: '#bbf7d0', fillOpacity: .8 };
  if (k === 'green') return { color: '#9ca3af', weight: .8, fillColor: '#e5e7eb', fillOpacity: .6 };
  if (k === 'forest') return { color: '#166534', weight: 1, fillColor: '#86efac', fillOpacity: .3 };
  if (k === 'road') return { color: '#111', weight: 5, opacity: .9 };
  if (k === 'trail') return { color: '#166534', weight: 2, dashArray: '3 5' };
  return { color: '#333', weight: 1 }; };
const CP_POINT = (f, ll) => f.properties.kind === 'gate' ? L.circleMarker(ll, { radius: 7, color: '#000', fillColor: 'red', fillOpacity: 1 }) : L.circleMarker(ll, { radius: 6, color: '#000', fillColor: '#fff', fillOpacity: 1 });
function cpPopup(f) { const p = f.properties, fmt = n => Number(n).toLocaleString('en-US');
  if (p.kind === 'lot') return `<div class="popup"><h4>Lot ${p.id}</h4><table><tr><td>area</td><td><b>${fmt(p.area_m2)} m²</b></td></tr><tr><td>price</td><td><b>US$ ${fmt(p.price_usd)}</b> (${p.price_usd_m2}/m², ${p.tier})</td></tr><tr><td>ground slope</td><td>${p.slope_pct} %</td></tr><tr><td>elevation</td><td>${p.elev_m} m</td></tr></table></div>`;
  if (p.kind === 'road') return `<div class="popup"><h4>Street (${p.class})</h4><table><tr><td>length</td><td>${p.length_m} m</td></tr><tr><td>carriageway / right of way</td><td>${p.carriageway_m} / ${p.row_m} m</td></tr><tr><td>grade mean / max</td><td>${p.grade_mean_pct} / ${p.grade_max_pct} %</td></tr>${p.note ? `<tr><td>note</td><td>${p.note}</td></tr>` : ''}</table></div>`;
  return `<div class="popup"><h4>${p.label || p.kind}</h4>${p.area_m2 ? `${fmt(p.area_m2)} m²` : ''}</div>`; }
function makeConceptLayer(fc) { return L.geoJSON(fc, { style: CP_STYLE, pointToLayer: CP_POINT, onEachFeature: (f, l) => { l.bindPopup(cpPopup(f)); if (f.properties.kind === 'lot') l.bindTooltip(`${f.properties.area_m2} m² · US$ ${Number(f.properties.price_usd).toLocaleString('en-US')}`, { sticky: true }); } }); }
function initConceptTab(root, summary, layouts, opts) {
  const host = root.querySelector('#cp-map'); if (!host || !summary) return null;
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
  const map = L.map('cp-map', { preferCanvas: true, attributionControl: false }); opts.base(map);
  if (opts.parcels) L.geoJSON(opts.parcels, { style: { color: '#ff0000', weight: 2.5, fill: false } }).addTo(map);
  let cur = null;
  function show(k) { if (cur) map.removeLayer(cur); cur = makeConceptLayer(layouts[k]).addTo(map); map.fitBounds(cur.getBounds().pad(0.08));
    const st = summary.options.find(o => o.option === k); if (!st) return;
    root.querySelector('#cp-summary').innerHTML = `<table class="rep"><tbody>
      <tr><td>Option</td><td>${st.title}</td></tr>
      <tr><td>Lots</td><td><b>${st.lots}</b> (${fmt(st.lot_min_m2)} to ${fmt(st.lot_max_m2)} m², mean ${fmt(st.lot_mean_m2)} m²)</td></tr>
      <tr><td>Sellable area</td><td>${fmt(st.sellable_m2)} m² of the 86,700 m² developable envelope</td></tr>
      <tr><td>Streets</td><td>${fmt(st.road_m)} m (right of way ${fmt(st.row_m2)} m²); max grades: ${Object.entries(st.road_grades).map(([a, b]) => `${a} ${b} %`).join(', ')}</td></tr>
      <tr><td>Plaza / green reserve</td><td>${fmt(st.plaza_m2)} m² / ${fmt(st.green_m2)} m²</td></tr>
      <tr><td>Sticker revenue</td><td><b>US$ ${fmt(st.revenue_usd)}</b> (US$ ${fmt(st.revenue_usd / st.lots)} per lot on average)</td></tr>
      <tr><td>Infrastructure</td><td><b>US$ ${fmt(st.cost_total_usd)}</b> = US$ ${fmt(st.cost_per_lot_usd)} per lot = US$ ${st.cost_per_sellable_m2_usd} per sellable m²</td></tr>
      <tr><td>Margin before land, marketing, commissions and taxes</td><td><b>US$ ${fmt(st.margin_before_land_usd)}</b> (${fmt(100 * st.margin_before_land_usd / st.revenue_usd)} % of revenue)</td></tr></tbody></table>`; }
  root.querySelector('#cp-option').addEventListener('change', e => show(e.target.value));
  // costs table (all options)
  const opts3 = summary.options; const keys = Object.keys(opts3[0].costs);
  root.querySelector('#cp-costs').innerHTML = `<table class="rep"><thead><tr><th>Item (US$)</th>${opts3.map(o => `<th>${o.option}</th>`).join('')}</tr></thead><tbody>` + keys.map(k => `<tr><td>${k}</td>${opts3.map(o => `<td>${fmt(o.costs[k])}</td>`).join('')}</tr>`).join('') +
    `<tr><th>Total</th>${opts3.map(o => `<th>${fmt(o.cost_total_usd)}</th>`).join('')}</tr><tr><th>Per lot</th>${opts3.map(o => `<th>${fmt(o.cost_per_lot_usd)}</th>`).join('')}</tr><tr><th>Revenue at sticker</th>${opts3.map(o => `<th>${fmt(o.revenue_usd)}</th>`).join('')}</tr><tr><th>Margin before land etc.</th>${opts3.map(o => `<th>${fmt(o.margin_before_land_usd)}</th>`).join('')}</tr></tbody></table>`;
  root.querySelector('#cp-reading').innerHTML = `<ul>
    <li><b>A, villa loops</b> (${opts3[0].lots} lots): the capital-weekender product, most lots, most street per lot, tightest margins but fastest absorption at US$60-80,000 a lot. Two parallel streets make a loop so no one drives past everyone else's house.</li>
    <li><b>B, finca lots</b> (${opts3[1].lots} lots): one spine, half the street, the diaspora-retiree product at US$100-150,000 a lot with room for a casita and fruit trees; best margin per dollar of infrastructure, slower sales.</li>
    <li><b>C, mixed</b> (${opts3[2].lots} lots): villa lots near the plaza and park, finca lots behind, and the premium view lots on the crest of Parcela 2 that only exist if the north right of way is secured. Highest revenue; carries the extra north road.</li>
    <li>In all three the plaza sits on the carretera outside the gate, 400 m from the village, so it can serve outsiders (mini-market, liquor store, café) without opening the residential streets; the park behind the gate is the buffer between the plaza and the homes; the garden reuses a greenhouse; trails start at the strip and climb to the mirador.</li>
    <li>Costs are the biggest uncertainty: the per-lot figure is dominated by fixed items (wells, tank, treatment plant, clubhouse, plaza, gate). Phasing the clubhouse and plaza, or starting with septic per lot instead of a treatment plant, cuts the upfront by US$400,000-600,000.</li></ul>`;
  show('C');
  return map;
}
