'use strict';

// ── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'sleep_log';

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function upsertEntry(entry) {
  const entries = loadEntries();
  const idx = entries.findIndex(e => e.date === entry.date);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  saveEntries(entries);
}

// ── Calculations ─────────────────────────────────────────────────────────────
function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmtMin(min) {
  if (min == null || isNaN(min) || min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function calcMetrics(e) {
  const bed = toMin(e.bedTime);
  let sleep = toMin(e.sleepTime);
  let wake  = toMin(e.wakeTime);
  if (bed == null || sleep == null || wake == null) return null;

  // handle midnight crossings
  if (sleep < bed)  sleep += 1440;
  if (wake  <= bed) wake  += 1440;
  if (wake  < sleep) wake += 1440;

  const timeInBed  = wake - bed;
  const sol        = sleep - bed;
  const waso       = Math.max(0, Number(e.wakeUpMinutes) || 0);
  const totalSleep = Math.max(0, timeInBed - sol - waso);
  const se         = timeInBed > 0 ? (totalSleep / timeInBed) * 100 : 0;

  return { timeInBed, sol, waso, totalSleep, se };
}

function rolling7(entries) {
  const recent = entries.slice(-7);
  if (!recent.length) return null;
  const ms = recent.map(e => ({ ...calcMetrics(e), quality: e.quality })).filter(m => m && m.timeInBed);
  if (!ms.length) return null;
  const avg = k => ms.reduce((s, m) => s + (m[k] ?? 0), 0) / ms.length;
  return { timeInBed: avg('timeInBed'), totalSleep: avg('totalSleep'), se: avg('se'), quality: avg('quality') };
}

// ── Navigation ───────────────────────────────────────────────────────────────
let currentView  = 'log';
let chartRange   = 7;
const charts     = {};

function showView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');
  if (view === 'history') renderHistory();
  if (view === 'charts')  renderCharts();
}

document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => showView(btn.dataset.view)));

// ── Log tab ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const inputDate    = $('input-date');
const inputBed     = $('input-bed');
const inputSleep   = $('input-sleep');
const inputWake    = $('input-wake');
const inputWakeups = $('input-wakeups');
const inputWakemins= $('input-wakemins');
const inputQuality = $('input-quality');
const qualityVal   = $('quality-val');
const btnSave      = $('btn-save');
const resultsCard  = $('results-card');

function todayStr() {
  return new Date().toLocaleDateString('sv'); // sv locale gives YYYY-MM-DD
}

function loadDateIntoForm(date) {
  const e = loadEntries().find(x => x.date === date);
  if (e) {
    inputBed.value      = e.bedTime      || '';
    inputSleep.value    = e.sleepTime    || '';
    inputWake.value     = e.wakeTime     || '';
    inputWakeups.value  = e.wakeUps      ?? '';
    inputWakemins.value = e.wakeUpMinutes ?? '';
    inputQuality.value  = e.quality      ?? 7;
    qualityVal.textContent = e.quality   ?? 7;
    updatePreview();
  } else {
    inputBed.value = inputSleep.value = inputWake.value =
      inputWakeups.value = inputWakemins.value = '';
    inputQuality.value = 7;
    qualityVal.textContent = '7';
    resultsCard.classList.add('hidden');
  }
}

inputDate.value = todayStr();
loadDateIntoForm(todayStr());

inputDate.addEventListener('change', () => loadDateIntoForm(inputDate.value));

inputQuality.addEventListener('input', () => {
  qualityVal.textContent = inputQuality.value;
});

function updatePreview() {
  const entry = { bedTime: inputBed.value, sleepTime: inputSleep.value,
                  wakeTime: inputWake.value, wakeUpMinutes: Number(inputWakemins.value) || 0 };
  if (!entry.bedTime || !entry.sleepTime || !entry.wakeTime) return;
  const m = calcMetrics(entry);
  if (!m) return;
  $('res-inbed').textContent = fmtMin(m.timeInBed);
  $('res-sleep').textContent = fmtMin(m.totalSleep);
  $('res-se').textContent    = `${m.se.toFixed(1)}%`;
  $('res-sol').textContent   = fmtMin(m.sol);
  resultsCard.classList.remove('hidden');
}

[inputBed, inputSleep, inputWake, inputWakemins].forEach(el =>
  el.addEventListener('change', updatePreview));

btnSave.addEventListener('click', () => {
  if (!inputDate.value || !inputBed.value || !inputSleep.value || !inputWake.value) {
    alert('Please fill in bed time, fell-asleep time, and wake-up time.');
    return;
  }
  upsertEntry({
    date:          inputDate.value,
    bedTime:       inputBed.value,
    sleepTime:     inputSleep.value,
    wakeUps:       Number(inputWakeups.value)  || 0,
    wakeUpMinutes: Number(inputWakemins.value) || 0,
    wakeTime:      inputWake.value,
    quality:       Number(inputQuality.value),
  });
  const orig = btnSave.textContent;
  btnSave.textContent = 'Saved ✓';
  setTimeout(() => { btnSave.textContent = orig; }, 1500);
  updatePreview();
});

// ── History tab ───────────────────────────────────────────────────────────────
function seClass(se) {
  return se >= 85 ? 'se-good' : se >= 70 ? 'se-ok' : 'se-bad';
}

function renderHistory() {
  const all = loadEntries();
  const tbody = $('history-body');

  if (!all.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No entries yet</td></tr>';
    $('avg-card').classList.add('hidden');
    return;
  }

  const avgs = rolling7(all);
  if (avgs) {
    $('avg-inbed').textContent   = fmtMin(Math.round(avgs.timeInBed));
    $('avg-sleep').textContent   = fmtMin(Math.round(avgs.totalSleep));
    $('avg-se').textContent      = `${avgs.se.toFixed(1)}%`;
    $('avg-quality').textContent = avgs.quality.toFixed(1);
    $('avg-card').classList.remove('hidden');
  }

  tbody.innerHTML = [...all].reverse().map(e => {
    const m = calcMetrics(e);
    return `<tr data-date="${e.date}">
      <td>${e.date.slice(5)}</td>
      <td>${e.bedTime  || '—'}</td>
      <td>${e.wakeTime || '—'}</td>
      <td>${m ? fmtMin(m.totalSleep) : '—'}</td>
      <td class="${m ? seClass(m.se) : ''}">${m ? m.se.toFixed(0) + '%' : '—'}</td>
      <td>${e.quality ?? '—'}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-date]').forEach(row =>
    row.addEventListener('click', () => {
      inputDate.value = row.dataset.date;
      loadDateIntoForm(row.dataset.date);
      showView('log');
    }));
}

// ── Charts tab ────────────────────────────────────────────────────────────────
const CHART_OPT = {
  responsive: true,
  animation:  false,
  plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
  scales: {
    x: { ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: '#2d2d4e' } },
    y: { ticks: { color: '#94a3b8', font: { size: 10 } },                   grid: { color: '#2d2d4e' } },
  },
};

function dataset(data, color, dashed = false) {
  return {
    data, borderColor: color, backgroundColor: color + '22',
    borderWidth: dashed ? 1.5 : 2, borderDash: dashed ? [5, 5] : [],
    pointRadius: dashed ? 0 : 3, pointHoverRadius: 5, tension: 0.3, fill: !dashed,
  };
}

function rollingAvg(vals, n = 7) {
  return vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - n + 1), i + 1).filter(v => v != null);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

function makeChart(id, existing, datasets, yExtra = {}) {
  if (existing) existing.destroy();
  return new Chart($(id), {
    type: 'line',
    data: { labels: datasets._labels, datasets: datasets._sets },
    options: { ...CHART_OPT, scales: { ...CHART_OPT.scales, y: { ...CHART_OPT.scales.y, ...yExtra } } },
  });
}

function renderCharts() {
  const all   = loadEntries();
  const slice = chartRange === 0 ? all : all.slice(-chartRange);
  if (!slice.length) return;

  const labels  = slice.map(e => e.date.slice(5));
  const sleepH  = slice.map(e => { const m = calcMetrics(e); return m ? +(m.totalSleep / 60).toFixed(2) : null; });
  const seVals  = slice.map(e => { const m = calcMetrics(e); return m ? +m.se.toFixed(1) : null; });
  const qualV   = slice.map(e => e.quality ?? null);

  charts.sleep   = makeChart('chart-sleep',   charts.sleep,
    { _labels: labels, _sets: [dataset(sleepH, '#6366f1'), dataset(rollingAvg(sleepH), '#a5b4fc', true)] },
    { min: 0 });
  charts.se      = makeChart('chart-se',      charts.se,
    { _labels: labels, _sets: [dataset(seVals, '#10b981'), dataset(rollingAvg(seVals), '#6ee7b7', true)] },
    { min: 0, max: 100 });
  charts.quality = makeChart('chart-quality', charts.quality,
    { _labels: labels, _sets: [dataset(qualV, '#f59e0b'), dataset(rollingAvg(qualV), '#fcd34d', true)] },
    { min: 0, max: 10 });
}

document.querySelectorAll('.toggle-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartRange = Number(btn.dataset.range);
    renderCharts();
  }));
