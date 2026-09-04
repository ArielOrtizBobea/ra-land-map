// Zoom-aware contour layer shared by the portal and the share page.
// sets = { full: 10 m municipio set, outside: 10 m set with the 3 km window cut out, win: 5 m set for the 3 km window }
function makeContourLayer(map, sets, opts = {}) {
  const grp = L.layerGroup(); const font = opts.font || 'ui-monospace, Menlo, monospace';
  const colMinor = opts.minor || '#a0742b', colMajor = opts.major || '#6b3f00';
  const mid = part => part.length >= 6 ? part[Math.floor(part.length / 2)] : null;
  function addSet(fc, filter, isMajor, w) {
    grp.addLayer(L.geoJSON(fc, { filter, style: f => ({ color: isMajor(f) ? colMajor : colMinor, weight: isMajor(f) ? w * 1.9 : w, opacity: isMajor(f) ? .95 : .75 }),
      onEachFeature: (f, l) => l.bindTooltip(`${f.properties.level} m`, { sticky: true }) }));
  }
  function addLabels(fc, step, bounds, budget) {
    const cands = [];
    for (const f of fc.features) { if (f.properties.level % step) continue; const g = f.geometry;
      const parts = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
      for (const part of parts) { const c = mid(part); if (c && bounds.contains([c[1], c[0]])) cands.push([c[1], c[0], f.properties.level]); } }
    const every = Math.max(1, Math.ceil(cands.length / budget));
    cands.filter((_, i) => i % every === 0).forEach(([lat, lon, lv]) => grp.addLayer(L.marker([lat, lon], { interactive: false, icon: L.divIcon({ className: 'clbl', html: `<span style="font:600 10px ${font};color:${colMajor};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff;white-space:nowrap">${lv}</span>`, iconSize: [0, 0] }) })));
  }
  function render() {
    grp.clearLayers(); const z = map.getZoom(), b = map.getBounds().pad(0.1);
    if (z <= 12) addSet(sets.full, f => f.properties.level % 50 === 0, f => f.properties.level % 100 === 0, 0.7);
    else if (z === 13) { addSet(sets.full, f => f.properties.level % 20 === 0, f => f.properties.level % 100 === 0, 0.7); addLabels(sets.full, 100, b, 40); }
    else if (z === 14) { addSet(sets.full, () => true, f => f.properties.level % 50 === 0, 0.6); addLabels(sets.full, 50, b, 60); }
    else { addSet(sets.outside, () => true, f => f.properties.level % 50 === 0, 0.7); addSet(sets.win, () => true, f => f.properties.level % 25 === 0, z >= 16 ? 1 : 0.8);
      addLabels(sets.outside, 50, b, 50); addLabels(sets.win, z >= 17 ? 10 : 25, b, z >= 17 ? 120 : 60); }
  }
  map.on('zoomend moveend', () => { if (map.hasLayer(grp)) render(); }); grp.on('add', render);
  grp.describe = 'zoom ≤12: 50 m · 13: 20 m · 14: 10 m · ≥15: 10 m, 5 m within 1.5 km of the parcel · labels on major lines';
  return grp;
}
