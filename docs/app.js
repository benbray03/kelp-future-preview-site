// docs/app.js -- everything comes from data/manifest.json (written by R/export_static.R)
const CARTO = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_27v1_1_e8e199020203618a9f654282';
const state = { species: null, var: null, year: null };
const cache = {}, charts = {};
let M, map, timer = null, ready = false;

const $ = id => document.getElementById(id);
const fmt = x => (+x).toFixed(2);
// Each step is a 5-year window ending in that year: 2025 -> "2021–2025"
const span = y => `${y - 4}–${y}`;
const sp = () => M.species[state.species];
const pngUrl = (year = state.year) => `data/layers/${state.species}/${state.var}_${year}.png`;
const getJSON = url => cache[url] ??= fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); });
const loadImage = url => cache[url] ??= new Promise((ok, fail) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });

async function init() {
  M = await getJSON('data/manifest.json');
  $('footer').textContent = `Version ${M.version} · data built ${M.updated}`;
  $('leg-bar').style.background =
    `linear-gradient(to right, ${M.palette.filter((_, i) => i % 32 === 0 || i === 255).join(',')})`;
  $('var').onchange = () => { if (!ready) return; state.var = $('var').value; render(); };
  $('year').oninput = () => { if (!ready) return; state.year = sp().years[$('year').value]; render(); };
  $('play').onclick = () => ready && togglePlay();
  ['show_mpas', 'show_lat50', 'show_class'].forEach(id => $(id).onchange = () => ready && applyToggles());
  try {
    if (!localStorage.getItem('kfp-intro')) { $('intro').showModal(); localStorage.setItem('kfp-intro', '1'); }
  } catch (e) { /* storage blocked: skip the pop-up */ }

  map = new maplibregl.Map({ container: 'map', center: [-122, 37.5], zoom: 6, style: {
    version: 8,
    sources: { carto: { type: 'raster', tileSize: 256, maxzoom: 20,
      tiles: ['a', 'b', 'c', 'd'].map(s => CARTO.replace('{s}', s)),
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>' } },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }] } });
  map.addControl(new maplibregl.NavigationControl());
  map.on('load', addOverlays);
}

function addOverlays() {
  // Restoration classes (off by default)
  map.addSource('class', { type: 'geojson', data: 'data/class_zones.geojson' });
  map.addLayer({ id: 'class-line', type: 'line', source: 'class', layout: { visibility: 'none' },
    paint: { 'line-width': 2, 'line-color': ['match', ['get', 'class'],
      'Very_low', '#01a9f3', 'Low', '#12d045', 'Mid', '#ffca18', 'High', '#ed1c25', '#999999'] } });
  // MPAs, with an invisible fill so hovering anywhere inside shows the name
  map.addSource('mpa', { type: 'geojson', data: 'data/mpas.geojson' });
  map.addLayer({ id: 'mpa-fill', type: 'fill', source: 'mpa', paint: { 'fill-color': '#0a5c73', 'fill-opacity': 0 } });
  map.addLayer({ id: 'mpa-line', type: 'line', source: 'mpa',
    paint: { 'line-color': '#000000', 'line-width': 1.5, 'line-opacity': 0.85 } });
  // 50% density lines: grey dotted = first year, orange dashed = selected year
  map.addSource('lat50', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'lat50-base', type: 'line', source: 'lat50', filter: ['==', ['get', 'kind'], 'base'],
    paint: { 'line-color': '#555555', 'line-width': 2, 'line-dasharray': [1, 3] } });
  map.addLayer({ id: 'lat50-now', type: 'line', source: 'lat50', filter: ['==', ['get', 'kind'], 'now'],
    paint: { 'line-color': '#f4a261', 'line-width': 4, 'line-dasharray': [2.5, 1.5] } });

  const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
  map.on('mousemove', 'mpa-fill', e =>
    tip.setLngLat(e.lngLat).setHTML(`<b>${e.features[0].properties.mpa_label}</b>`).addTo(map));
  map.on('mouseleave', 'mpa-fill', () => tip.remove());
  map.on('click', showValue);

  $('species').innerHTML = M.species_order
    .map(id => `<button data-id="${id}">${M.species[id].label}</button>`).join(' ');
  $('species').onclick = e => e.target.dataset.id && setSpecies(e.target.dataset.id);

  ready = true;
  applyToggles();
  setSpecies(M.species_order[0]);
}

function setSpecies(id) {
  stopPlay();
  state.species = id;
  const s = sp();
  [...$('species').children].forEach(b => b.classList.toggle('active', b.dataset.id === id));
  // Rebuild the variable list BEFORE redrawing, so a bull-only variable never reaches giant kelp
  $('var').innerHTML = s.vars.map(v => `<option value="${v.id}">${v.label}</option>`).join('');
  state.var = s.response; $('var').value = s.response;
  $('year').max = s.years.length - 1; $('year').value = 0; state.year = s.years[0];
  $('year-min').textContent = span(s.years[0]); $('year-max').textContent = span(s.years.at(-1));
  const b = s.bounds;
  map.fitBounds([[b.lng1, b.lat1], [b.lng2, b.lat2]]);
  render();
}

async function render() {
  const s = sp(), L = s.layers[state.var], v = s.vars.find(x => x.id === state.var);

  // Map layer: swap the PNG, keep it under the overlays, no smoothing between 300 m cells
  const img = { url: pngUrl(), coordinates: L.corners };
  if (map.getSource('kelp')) map.getSource('kelp').updateImage(img);
  else {
    map.addSource('kelp', { type: 'image', ...img });
    map.addLayer({ id: 'kelp', type: 'raster', source: 'kelp', paint: {
      'raster-opacity': 0.88, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, 'class-line');
  }
  const i = s.years.indexOf(state.year);
  if (i < s.years.length - 1) loadImage(pngUrl(s.years[i + 1])).catch(() => {});   // preload next step

  $('year-label').textContent = span(state.year);
  $('map-title').textContent = `${s.label} — ${v.label} (${span(state.year)})`;
  $('hist-label').textContent = `${v.label} — Distribution (Selected Year)`;
  $('trend-label').textContent = `${v.label} — Mean Over Time`;
  $('lat50-label').textContent = `${s.label} — 50% Density Latitude Over Time`;
  $('leg-title').textContent = v.label;
  $('leg-lo').textContent = fmt(L.range[0]); $('leg-hi').textContent = fmt(L.range[1]);

  await Promise.all([drawHist(), drawTrend(), drawLat50()]);
}

function chart(id, type, labels, datasets) {
  if (charts[id]) {
    Object.assign(charts[id].data, { labels, datasets }); charts[id].update(); return;
  }
  charts[id] = new Chart($(id), { type, data: { labels, datasets }, options: {
    animation: false, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

async function drawHist() {
  const H = (await getJSON(`data/hist_${state.species}.json`))[state.var];
  const mids = H.breaks.slice(0, -1).map((b, i) => fmt((b + H.breaks[i + 1]) / 2));
  chart('hist', 'bar', mids, [{ data: H.counts[state.year] ?? [], backgroundColor: '#0a5c73',
    barPercentage: 1, categoryPercentage: 1 }]);
}

async function drawTrend() {
  const rows = (await getJSON('data/trend_means.json'))
    .filter(r => r.species === state.species && r.var === state.var);
  const sel = r => r.year === state.year;
  chart('trend', 'line', rows.map(r => r.year), [{ data: rows.map(r => r.mean_value), borderColor: '#0a5c73',
    pointRadius: rows.map(r => sel(r) ? 7 : 3), pointBorderWidth: rows.map(r => sel(r) ? 3 : 1),
    pointBorderColor: rows.map(r => sel(r) ? '#f4a261' : '#0a5c73'), pointBackgroundColor: '#0a5c73' }]);
}

async function drawLat50() {
  const s = sp(), rows = (await getJSON('data/lat50.json'))[state.species] ?? [];
  if (!rows.length) return;
  const xs = rows.map(r => r.year), ys = rows.map(r => r.lat_50);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx ? xs.reduce((a, x, k) => a + (x - mx) * (ys[k] - my), 0) / sxx : 0;
  const sel = r => r.year === state.year;
  chart('lat50', 'line', xs, [
    { data: ys, borderColor: '#0a5c73', pointRadius: rows.map(r => sel(r) ? 6 : 3),
      pointBackgroundColor: rows.map(r => sel(r) ? '#f4a261' : '#0a5c73') },
    { data: xs.map(x => my + slope * (x - mx)), borderColor: '#888888', borderDash: [6, 4],
      borderWidth: 1, pointRadius: 0 }]);

  // Map lines + shift box
  const now = rows.find(sel), base = rows[0], [x1, x2] = s.lat50_lng;
  const line = (lat, kind) => ({ type: 'Feature', properties: { kind },
    geometry: { type: 'LineString', coordinates: [[x1, lat], [x2, lat]] } });
  map.getSource('lat50').setData({ type: 'FeatureCollection',
    features: now ? [line(base.lat_50, 'base'), line(now.lat_50, 'now')] : [] });
  const km = now ? Math.round((now.lat_50 - base.lat_50) * 111) : 0;
  $('lat50-box').innerHTML = now ? `<b>50% density latitude</b><br>` +
    `<span style="color:#d9822b">▬▬</span> ${span(state.year)}: ${now.lat_50.toFixed(2)}°N<br>` +
    `<span style="color:#555">····</span> ${span(base.year)}: ${base.lat_50.toFixed(2)}°N<br>` +
    `Shift: ${km >= 0 ? '+' : ''}${km} km` : '';
}

function applyToggles() {
  const vis = on => on ? 'visible' : 'none';
  ['mpa-fill', 'mpa-line'].forEach(l => map.setLayoutProperty(l, 'visibility', vis($('show_mpas').checked)));
  ['lat50-base', 'lat50-now'].forEach(l => map.setLayoutProperty(l, 'visibility', vis($('show_lat50').checked)));
  map.setLayoutProperty('class-line', 'visibility', vis($('show_class').checked));
  $('lat50-box').hidden = !$('show_lat50').checked;
  $('class-legend').hidden = !$('show_class').checked;
}

function togglePlay() {
  if (timer) return stopPlay();
  const ys = sp().years;
  if (ys.indexOf(state.year) === ys.length - 1) { state.year = ys[0]; $('year').value = 0; render(); }
  $('play').textContent = '❚❚';
  timer = setInterval(() => {
    const i = ys.indexOf(state.year);
    if (i >= ys.length - 1) return stopPlay();
    state.year = ys[i + 1]; $('year').value = i + 1; render();
  }, 1000);
}
function stopPlay() { clearInterval(timer); timer = null; $('play').textContent = '▶'; }

// Click a cell: read its PNG color and map it back to the palette.
// Accurate to 1/255 of the variable's range -- fine for a popup, not for extracting values.
async function showValue(e) {
  if (!ready) return;
  const s = sp(), L = s.layers[state.var], v = s.vars.find(x => x.id === state.var);
  const mc = ll => maplibregl.MercatorCoordinate.fromLngLat(ll);
  const p = mc(e.lngLat), a = mc(L.corners[0]), b = mc(L.corners[2]);
  const fx = (p.x - a.x) / (b.x - a.x), fy = (p.y - a.y) / (b.y - a.y);
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return;
  const img = await loadImage(pngUrl());
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const [r, g, bl, alpha] = ctx.getImageData(Math.floor(fx * img.width), Math.floor(fy * img.height), 1, 1).data;
  if (alpha === 0) return;
  let best = 0, dist = Infinity;
  M.palette.forEach((hex, k) => {
    const q = parseInt(hex.slice(1), 16);
    const d = (r - (q >> 16)) ** 2 + (g - ((q >> 8) & 255)) ** 2 + (bl - (q & 255)) ** 2;
    if (d < dist) { dist = d; best = k; }
  });
  const val = L.range[0] + best / 255 * (L.range[1] - L.range[0]);
  new maplibregl.Popup().setLngLat(e.lngLat)
    .setHTML(`<b>${v.label}</b><br>≈ ${fmt(val)} (${span(state.year)})`).addTo(map);
}

init().catch(err => {
  document.querySelector('.layout').insertAdjacentHTML('afterbegin',
    `<p style="color:#b00">Couldn't load data/manifest.json (${err.message}). Run R/export_static.R, then serve docs/ with servr::httd("docs").</p>`);
});
