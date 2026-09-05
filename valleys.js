// Mountain valleys tab: DR-wide comparison of mountain valley systems (stage-1/2 outputs of scripts/82-84).
// initValleysTab(root, data, bg, bgSrc) -> Leaflet map. data = dr_valleys.geojson (features + criteria + default_weights), bg = dr_background.json.
function initValleysTab(root, data, bg, bgSrc, roads) {
  const C = data.criteria, W = Object.assign({}, data.default_weights), feats = data.features;
  const SHORT = { cool: 'Cool', near_sd: 'Sto Dgo', near_sti: 'Santiago', health: 'Hospital', river: 'River', scenic: 'Scenic', quiet: 'Quiet', tourism: 'Tourism' };
  const TYPES = ['town valley', 'rural valley', 'uninhabited upland', 'plain']; const show = { 'town valley': true, 'rural valley': true, 'uninhabited upland': true, plain: false };
  let minElev = 400, pinned = null, selRow = null;
  root.innerHTML = `<div class="vl-wrap"><div class="vl-map" id="vlMap"></div><div class="vl-side">
    <div class="vl-card" id="vlCard"><h3>Hover a valley</h3><div class="cl">Gentle floors above 400 m in the DR's mountain ranges, grouped into systems and scored on eight criteria. Hover for the profile, click to pin, drag the weights to re-rank. Rancho Arriba is outlined in dark red.</div></div>
    <div class="vl-weights" id="vlWeights"></div><div class="vl-filters" id="vlFilters"></div><div id="vlTable"></div>
    <div class="cl" style="margin-top:8px">Sources: Copernicus GLO-90 terrain (floors = slope ≤ 10 % above 400 m, ≥ 1 km², grouped within 1.5 km); WorldClim 2.1 temperature downscaled with a 6.1 °C/km lapse rate; WorldPop 2020 population; OpenStreetMap places, hospitals, hotels, rivers; OSRM demo routing (optimistic on mountain roads, real trips run 20-50 % longer). Straight-line fallbacks where routing failed.</div></div></div>`;
  const fmt = (n, d = 0) => n === null || n === undefined || Number.isNaN(n) ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const score = p => { let s = 0, w = 0; for (const k in C) { s += W[k] * (p.criteria[k] || 0); w += W[k]; } return w ? s / w : 0; };
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const col = s => { const stops = [[0.15, [205, 216, 224]], [0.45, [251, 197, 122]], [0.65, [231, 111, 81]], [0.85, [156, 31, 31]]]; if (s <= stops[0][0]) return `rgb(${stops[0][1]})`; for (let i = 1; i < stops.length; i++) if (s <= stops[i][0]) { const t = (s - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return `rgb(${lerp(stops[i - 1][1], stops[i][1], t)})`; } return `rgb(${stops[stops.length - 1][1]})`; };
  const visible = p => show[p.type] && p.floor_elev_m >= minElev;
  const style = f => { const p = f.properties, s = score(p), vis = visible(p);
    if (p.type === 'uninhabited upland') return { color: '#2e7d32', weight: 1, dashArray: '3 3', fillColor: '#66bb6a', fillOpacity: vis ? 0.45 : 0, opacity: vis ? 0.9 : 0 };
    if (p.type === 'plain') return { color: '#777', weight: 1, fillColor: '#999', fillOpacity: vis ? 0.35 : 0, opacity: vis ? 0.8 : 0 };
    return { color: p.ours ? '#7f0000' : '#4a2a12', weight: p.ours ? 3 : 1, fillColor: col(s), fillOpacity: vis ? 0.85 : 0, opacity: vis ? 1 : 0 }; };
  // ---- map ----
  const el = root.querySelector('#vlMap'); const [Wb, Sb, Eb, Nb] = bg.bounds_wgs84;
  const m = L.map(el, { preferCanvas: false, zoomSnap: 0.25, minZoom: 7, maxZoom: 14, attributionControl: true });
  m.attributionControl.setPrefix(false).addAttribution('Terrain: Copernicus GLO-90 · Roads and places: OpenStreetMap · WorldClim, WorldPop, OSRM');
  L.imageOverlay(bgSrc, [[Sb, Wb], [Nb, Eb]], { opacity: 1 }).addTo(m); m.fitBounds([[17.55, -71.95], [19.95, -68.4]]);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
  for (const [name, lat, lon] of [['Santo Domingo', 18.4861, -69.9312], ['Santiago', 19.4517, -70.697]]) L.circleMarker([lat, lon], { radius: 5, color: '#111', fillColor: '#111', fillOpacity: 1, weight: 1 }).addTo(m).bindTooltip(name, { permanent: true, direction: 'right', className: 'vl-label' });
  const roadStyle = f => f.properties.highway === 'primary' ? { color: '#6b6b6b', weight: 1.1, opacity: 0.8 } : { color: '#3b3b3b', weight: 2.2, opacity: 0.9 };
  const roadLayer = roads ? L.geoJSON(roads, { style: roadStyle, interactive: false }).addTo(m) : null;
  const layer = L.geoJSON(data, { style, onEachFeature: (f, ly) => { const p = f.properties;
    ly.bindTooltip(() => `<b>${p.name}</b><br>${p.type} · ${fmt(p.floor_elev_m)} m · ${fmt(p.tavg_c, 1)} °C · score ${(100 * score(p)).toFixed(0)}`, { sticky: true, direction: 'top', opacity: 0.95, className: 'vl-tip' });
    ly.on('mouseover', () => { if (!pinned) card(p); ly.setStyle({ weight: 3 }); }); ly.on('mouseout', () => { if (!pinned) cardHint(); layer.resetStyle(ly); }); ly.on('click', e => { L.DomEvent.stop(e); pin(f, ly); }); } }).addTo(m);
  const labels = L.layerGroup().addTo(m);
  function drawLabels() { labels.clearLayers(); const z = m.getZoom(); const ranked = feats.map(f => f.properties).filter(visible).sort((a, b) => score(b) - score(a)); const top = new Set(ranked.slice(0, z < 8 ? 7 : z < 9 ? 16 : 80).map(p => p.id));
    for (const f of feats) { const p = f.properties; if (!visible(p)) continue; if (!(top.has(p.id) || p.ours || (p.type === 'town valley' && z >= 9))) continue;
      L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'vl-label' + (p.ours ? ' ours' : ''), html: p.name, iconSize: null }), interactive: false }).addTo(labels); } }
  m.on('zoomend', drawLabels);
  // ---- card with star chart ----
  function radar(p, ref) { const keys = Object.keys(C), n = keys.length, R = 88, cx = 120, cy = 112; const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n; const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
    const ring = r => keys.map((k, i) => pt(i, r).join(',')).join(' '); const poly = q => keys.map((k, i) => pt(i, R * (q.criteria[k] || 0)).join(',')).join(' ');
    return `<svg viewBox="0 0 240 232" width="240" height="232" style="display:block">${[0.25, 0.5, 0.75, 1].map(r => `<polygon points="${ring(R * r)}" fill="none" stroke="#ddd" stroke-width="1"/>`).join('')}
      ${keys.map((k, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" stroke="#ddd"/>`).join('')}
      ${ref && ref !== p ? `<polygon points="${poly(ref)}" fill="rgba(127,0,0,0.08)" stroke="#7f0000" stroke-width="1.2" stroke-dasharray="4 3"/>` : ''}
      <polygon points="${poly(p)}" fill="rgba(231,111,81,0.35)" stroke="#c0392b" stroke-width="2"/>
      ${keys.map((k, i) => { const [x, y] = pt(i, R + 16); return `<text x="${x}" y="${y}" font-size="10" text-anchor="middle" dominant-baseline="middle" fill="#333">${SHORT[k]}</text>`; }).join('')}
      ${keys.map((k, i) => { const [x, y] = pt(i, R * (p.criteria[k] || 0)); return `<circle cx="${x}" cy="${y}" r="2.5" fill="#c0392b"/>`; }).join('')}</svg>`; }
  const ours = feats.map(f => f.properties).find(p => p.ours);
  function card(p) { const s = score(p); root.querySelector('#vlCard').innerHTML = `<h3>${p.name} <span class="vl-score" style="background:${col(s)}">${(100 * s).toFixed(0)}</span></h3>
    <div class="cl">${p.type} · ${p.places || 'no mapped settlement nearby'}</div>
    <div class="vl-grid"><table class="vl">
      <tr><td>Valley floor</td><td>${fmt(p.floor_km2, 1)} km² at ${fmt(p.floor_elev_min)}–${fmt(p.floor_elev_max)} m</td></tr>
      <tr><td>Mean temperature</td><td>${fmt(p.tavg_c, 1)} °C (WorldClim cell ${fmt(p.tavg_cell_c, 1)} °C)</td></tr>
      <tr><td>Drive to Santo Domingo</td><td>${fmt(p.drive_sd_min)} min · ${fmt(p.drive_sd_km)} km</td></tr>
      <tr><td>Drive to Santiago</td><td>${fmt(p.drive_sti_min)} min · ${fmt(p.drive_sti_km)} km</td></tr>
      <tr><td>Hospital by road</td><td>${fmt(p.drive_hospital_min)} min${p.hospital_by_road ? ' · ' + p.hospital_by_road : ''}</td></tr>
      <tr><td>Large river</td><td>${p.big_river ? `${p.big_river}, ${fmt(p.big_river_km, 1)} km` : (p.river_near ? 'small: ' + p.river_near : '–')}</td></tr>
      <tr><td>Relief within 10 km</td><td>+${fmt(p.relief_10km_m)} m above the floor</td></tr>
      <tr><td>People within 5 / 10 km</td><td>${fmt(p.pop_5km)} / ${fmt(p.pop_10km)}</td></tr>
      <tr><td>Hotels within 10 km</td><td>${fmt(p.hotels_10km)}</td></tr>
      <tr><td>Nearest airport</td><td>${p.airport || '–'}</td></tr></table>
      <div>${radar(p, ours)}<div class="cl" style="text-align:center">solid = this valley · dashed = Rancho Arriba</div></div></div>`; }
  function cardHint() { if (pinned) return; root.querySelector('#vlCard').innerHTML = `<h3>Hover a valley</h3><div class="cl">Hover for the profile, click to pin, drag the weights to re-rank.</div>`; }
  function pin(f, ly) { pinned = f.properties; card(pinned); if (selRow) selRow.classList.remove('sel'); selRow = root.querySelector(`tr[data-id="${pinned.id}"]`); if (selRow) { selRow.classList.add('sel'); selRow.scrollIntoView({ block: 'nearest' }); } }
  m.on('click', () => { pinned = null; if (selRow) selRow.classList.remove('sel'); cardHint(); });
  // ---- weights + filters ----
  const wEl = root.querySelector('#vlWeights'); wEl.innerHTML = `<div style="grid-column:1/-1;font-weight:600;margin-top:4px">Weights</div>` + Object.entries(C).map(([k, lab]) => `<label title="${lab}"><span style="width:64px;display:inline-block">${SHORT[k]}</span><input type="range" min="0" max="3" step="0.5" value="${W[k]}" data-k="${k}"><b style="width:22px;text-align:right">${W[k]}</b></label>`).join('');
  wEl.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { W[inp.dataset.k] = Number(inp.value); inp.nextElementSibling.textContent = inp.value; refresh(); }));
  const fEl = root.querySelector('#vlFilters'); fEl.innerHTML = TYPES.map(t => `<label><input type="checkbox" data-t="${t}" ${show[t] ? 'checked' : ''}> ${t}</label>`).join('') + `<label>floor above <select id="vlElev">${[400, 500, 600, 800, 1000].map(v => `<option value="${v}">${v} m</option>`).join('')}</select></label>` + (roadLayer ? `<label><input type="checkbox" id="vlRoads" checked> main roads</label>` : '');
  if (roadLayer) fEl.querySelector('#vlRoads').addEventListener('change', e => { if (e.target.checked) roadLayer.addTo(m); else m.removeLayer(roadLayer); });
  fEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => { show[cb.dataset.t] = cb.checked; refresh(); }));
  fEl.querySelector('#vlElev').addEventListener('change', e => { minElev = Number(e.target.value); refresh(); });
  // ---- ranking table ----
  function table() { const rows = feats.map(f => f.properties).filter(visible).map(p => [score(p), p]).sort((a, b) => b[0] - a[0]);
    root.querySelector('#vlTable').innerHTML = `<table class="vlrank"><thead><tr><th>#</th><th>Valley</th><th>Type</th><th>Floor m</th><th>°C</th><th>SD min</th><th>STI min</th><th>Hosp min</th><th>Score</th></tr></thead><tbody>` +
      rows.map(([s, p], i) => `<tr data-id="${p.id}" class="${p.ours ? 'ours' : ''}${pinned && pinned.id === p.id ? ' sel' : ''}"><td>${i + 1}</td><td>${p.name}</td><td>${p.type.replace('uninhabited ', '')}</td><td>${fmt(p.floor_elev_m)}</td><td>${fmt(p.tavg_c, 1)}</td><td>${fmt(p.drive_sd_min)}</td><td>${fmt(p.drive_sti_min)}</td><td>${fmt(p.drive_hospital_min)}</td><td><span class="vl-score" style="background:${col(s)}">${(100 * s).toFixed(0)}</span></td></tr>`).join('') + `</tbody></table>`;
    root.querySelectorAll('#vlTable tbody tr').forEach(tr => tr.addEventListener('click', () => { const id = Number(tr.dataset.id); layer.eachLayer(ly => { if (ly.feature.properties.id === id) { m.fitBounds(ly.getBounds().pad(1.5), { maxZoom: 11 }); pin(ly.feature, ly); } }); })); }
  function refresh() { layer.setStyle(style); drawLabels(); table(); if (pinned) card(pinned); }
  const home = () => m.fitBounds([[17.55, -71.95], [19.95, -68.4]], { padding: [10, 10] }); window.__vlMap = m;
  refresh(); cardHint(); m.home = home; const t0 = Date.now();
  const fit = () => { m.invalidateSize(); if (Date.now() - t0 < 2500 && el.clientWidth > 50 && el.clientHeight > 50) { home(); drawLabels(); } };   // re-fit while the pane settles
  if (window.ResizeObserver) new ResizeObserver(fit).observe(el); setTimeout(fit, 150); setTimeout(fit, 900);
  return m;
}
