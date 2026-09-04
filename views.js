// views.js — "what can you see from here?" probe. Click the map, ray-march the 30 m DEM in the browser, draw the skyline.
// Same definitions as scripts/70_view_quality.py (66 distances 30 m .. 14.7 km, eye 2 m, curvature + refraction corrected).
// Expects the globals `fmt` and `popup` defined by the page and a 16-bit DEM PNG (z = R*256 + G) with its grid metadata.
function loadDemProbe(src, meta) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
      const d = cx.getImageData(0, 0, im.width, im.height).data, z = new Float32Array(im.width * im.height);
      for (let i = 0; i < z.length; i++) z[i] = d[i * 4] * 256 + d[i * 4 + 1];
      resolve(Object.assign({ z, w: im.width, h: im.height }, meta)); };
    im.onerror = reject; im.src = src;
  });
}
function demSample(D, lon, lat) { // bilinear, clamped to the grid
  let c = (lon - D.lon0) / D.dlon - 0.5, r = (D.lat1 - lat) / D.dlat - 0.5;
  c = Math.min(Math.max(c, 0), D.w - 1.001); r = Math.min(Math.max(r, 0), D.h - 1.001);
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, i = r0 * D.w + c0;
  return D.z[i] * (1 - fc) * (1 - fr) + D.z[i + 1] * fc * (1 - fr) + D.z[i + D.w] * (1 - fc) * fr + D.z[i + D.w + 1] * fc * fr;
}
function inDem(D, lon, lat) { return lon >= D.lon0 && lon <= D.lon0 + D.w * D.dlon && lat <= D.lat1 && lat >= D.lat1 - D.h * D.dlat; }
function viewProfile(D, lat, lon, eye = 2, naz = 72) {
  const DIST = []; for (let k = 0; k < 66; k++) DIST.push(30 * Math.pow(1.1, k));
  const zo = demSample(D, lon, lat), mlat = 110574, mlon = 111320 * Math.cos(lat * Math.PI / 180), rays = [];
  for (let a = 0; a < naz; a++) {
    const th = a * 2 * Math.PI / naz; let runmax = -90, dh = 0, depth = 0, relief = 0, clipped = false;
    for (let k = 0; k < DIST.length; k++) {
      const d = DIST[k], ln = lon + Math.sin(th) * d / mlon, lt = lat + Math.cos(th) * d / mlat;
      if (!inDem(D, ln, lt)) { clipped = true; break; }
      const zs = demSample(D, ln, lt), ang = Math.atan2(zs - zo - eye - d * d / (2 * 6371000) * 0.87, d) * 180 / Math.PI;
      if (ang >= runmax - 1e-4) { runmax = ang; dh = d; if (d <= 4000) depth = Math.max(depth, zo - zs); if (d >= 800 && ang > 1) relief = Math.max(relief, zs - zo); }
    }
    rays.push({ az: a * 360 / naz, hz: runmax, dh, depth, relief, blocked: runmax > 12 && dh < 350, clipped });
  }
  const K = Math.round(naz / 4), top = arr => arr.slice().sort((x, y) => y - x).slice(0, K).reduce((s, v) => s + v, 0) / K;
  const depth = top(rays.map(o => o.depth)), relief = top(rays.map(o => o.relief)), open = rays.filter(o => o.dh >= 1500).length / naz, encl = rays.filter(o => o.blocked).length / naz;
  const score = 100 * Math.min(1, Math.max(0, 0.40 * Math.pow(Math.min(depth / 150, 1), 0.7) + 0.35 * Math.pow(Math.min(relief / 400, 1), 0.7) + 0.25 * open - 0.5 * encl));
  let cls = 'little to see';
  if (open >= 0.6 && relief < 200 && depth < 60) cls = 'open but flat';
  if (relief >= 200 && depth < 60) cls = 'mountain backdrop';
  if (depth >= 60) cls = 'looking down over the valley';
  if (depth >= 60 && open >= 0.6 && relief >= 150) cls = 'panoramic';
  if (encl >= 0.4) cls = 'enclosed';
  return { zo, eye, rays, depth, relief, open, encl, score, cls, clipped: rays.some(o => o.clipped) };
}
function drawSkyline(canvas, P) {
  const W = canvas.width, H = canvas.height, cx = canvas.getContext('2d'), amin = -12, amax = 25, base = H - 14;
  const y = a => base - (Math.min(Math.max(a, amin), amax) - amin) / (amax - amin) * (base - 6);
  const g = cx.createLinearGradient(0, 0, 0, base); g.addColorStop(0, '#8fc3ee'); g.addColorStop(1, '#eaf3fb'); cx.fillStyle = g; cx.fillRect(0, 0, W, base);
  const n = P.rays.length;
  for (let i = 0; i < n; i++) { const r = P.rays[i], x0 = Math.round(i * W / n), x1 = Math.round((i + 1) * W / n), t = Math.min(r.dh / 12000, 1);
    cx.fillStyle = `rgb(${Math.round(56 + 120 * t)},${Math.round(104 + 70 * t)},${Math.round(52 + 150 * t)})`; cx.fillRect(x0, y(r.hz), x1 - x0, base - y(r.hz)); }
  cx.strokeStyle = 'rgba(255,255,255,.75)'; cx.setLineDash([4, 3]); cx.beginPath(); cx.moveTo(0, y(0)); cx.lineTo(W, y(0)); cx.stroke(); cx.setLineDash([]);
  cx.fillStyle = '#222'; cx.fillRect(0, base, W, 14); cx.fillStyle = '#fff'; cx.font = '10px sans-serif';
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, a]) => { const x = a / 360 * W; cx.fillRect(x, base, 1, 4); cx.fillText(l, x + 3, H - 3); });
  cx.fillStyle = 'rgba(255,255,255,.9)'; cx.fillText('eye level', 3, y(0) - 2); cx.fillText('+' + amax + '°', 3, 10);
}
function makeViewProbe(map, src, meta, opts = {}) {
  const grp = L.layerGroup(); let D = null, marker = null;
  async function onClick(e) {
    if (!D) { try { D = await loadDemProbe(src, meta); } catch (err) { console.error('view probe: DEM image failed to load', err); return; } }
    const { lat, lng } = e.latlng; if (!inDem(D, lng, lat)) return;
    const eye = opts.eye || 2, P = viewProfile(D, lat, lng, eye), id = 'sky' + Date.now();
    const html = `<div class="popup" style="min-width:330px"><h4>What you would see from here (${fmt(P.zo)} m, eye ${eye} m)</h4>` +
      `<canvas id="${id}" width="330" height="120" style="width:330px;height:120px;border-radius:4px;display:block"></canvas>` +
      `<table><tr><td>view score</td><td><b>${fmt(P.score)} / 100 · ${P.cls}</b></td></tr>` +
      `<tr><td>looking down</td><td><b>${fmt(P.depth)} m</b> below you (best quarter turn)</td></tr>` +
      `<tr><td>mountains in view</td><td><b>${fmt(P.relief)} m</b> above you, ≥ 800 m away</td></tr>` +
      `<tr><td>open horizon</td><td><b>${fmt(P.open * 100)} %</b> of directions see ≥ 1.5 km</td></tr>` +
      `<tr><td>enclosed</td><td><b>${fmt(P.encl * 100)} %</b> of directions blocked within 350 m</td></tr></table>` +
      `<div class="cl">Skyline colour = distance to the horizon (dark green near, hazy blue far). Copernicus 30 m surface model: trees and buildings are part of it, so treat as concept.${P.clipped ? ' Some rays reached the edge of the loaded terrain.' : ''}</div></div>`;
    if (marker) grp.removeLayer(marker);
    marker = L.circleMarker(e.latlng, { radius: 6, color: '#7a0177', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(grp);
    marker.bindPopup(html, { maxWidth: 380 }).openPopup();
    setTimeout(() => { const cv = document.getElementById(id); if (cv) drawSkyline(cv, P); }, 40);
  }
  const panes = ['overlayPane', 'markerPane', 'shadowPane'];   // while probing, clicks go to the map, not to parcels or markers
  grp.on('add', () => { map.on('click', onClick); map.getContainer().style.cursor = 'crosshair'; map.closePopup(); panes.forEach(p => { map.getPane(p).style.pointerEvents = 'none'; }); });
  grp.on('remove', () => { map.off('click', onClick); map.getContainer().style.cursor = ''; panes.forEach(p => { map.getPane(p).style.pointerEvents = ''; }); if (marker) { grp.removeLayer(marker); marker = null; } });
  return grp;
}
function makeViewSpots(summary) {
  const g = L.featureGroup();
  (summary.best_spots || []).forEach((s, i) => L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div style="background:#7a0177;color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px #0006">★ ${Math.round(s.score)}</div>`, iconAnchor: [12, 10] }) })
    .bindPopup(popup(`Best view spot ${i + 1} · ${String(s.parcel).replace('6642024034813_1-1-1', 'parcel')}`, [['view score', Math.round(s.score) + ' / 100'], ['elevation', Math.round(s.elev) + ' m'], ['looking down', Math.round(s.depth) + ' m below'], ['mountains in view', Math.round(s.relief) + ' m above'], ['open horizon', Math.round(s.open * 100) + ' %']])).addTo(g));
  return g;
}
