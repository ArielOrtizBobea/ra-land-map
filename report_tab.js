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
