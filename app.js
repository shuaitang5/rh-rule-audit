/* TradingView Lightweight Charts v5. Panes: price, volume, MACD, RSI, regime.
   Every array drawn here is the engine's own (see chart_data.py) — nothing is
   recomputed in the browser, so the picture cannot disagree with the backtest.

   Laid out for a phone first: toggleable panes, a crosshair readout instead of
   hover tooltips, prev/next event jumping, and cards instead of wide tables. */

const LWC = window.LightweightCharts;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fail = (m) => { const e = $('#err'); e.hidden = false; e.textContent = m; };

const C = { green: '#26a69a', red: '#ef5350', orange: '#ff9800', grey: '#787b86',
            blue: '#2962ff', purple: '#b39ddb', text: '#d1d4dc', grid: '#252932',
            bg: '#131722' };

const show = { vol: true, macd: true, rsi: true, regime: true, gate: true,
               blocked: true };
let chart, candles, series = {}, D = null, evIdx = -1;

const fmt = (v, n = 2) => (v === null || v === undefined || Number.isNaN(v))
  ? '—' : Number(v).toFixed(n);
const pct = (v, n = 1) => (v === null || v === undefined)
  ? '—' : (v * 100).toFixed(n) + '%';

/* ------------------------------------------------------------------ chart */
function render() {
  const d = D;
  $('#chart').innerHTML = '';
  series = {};

  chart = LWC.createChart($('#chart'), {
    autoSize: true,
    layout: {
      background: { color: C.bg }, textColor: C.text, fontSize: 9,
      attributionLogo: false,
      panes: { separatorColor: C.grid, separatorHoverColor: '#3a3f4b' },
    },
    grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    crosshair: { mode: 0 },
    rightPriceScale: { borderColor: C.grid, entireTextOnly: true,
                       minimumWidth: 46 },
    timeScale: { borderColor: C.grid, rightOffset: 4, fixLeftEdge: true },
    handleScale: { axisPressedMouseMove: false },
    localization: { priceFormatter: (p) => p.toFixed(0) },
  });

  // pane order has to be contiguous, so assign indexes to the visible panes only
  let n = 0;
  const idx = { price: n++ };
  if (show.vol) idx.vol = n++;
  if (show.macd) idx.macd = n++;
  if (show.rsi) idx.rsi = n++;
  if (show.regime) idx.regime = n++;

  candles = chart.addSeries(LWC.CandlestickSeries, {
    upColor: C.green, downColor: C.red, borderVisible: false,
    wickUpColor: C.green, wickDownColor: C.red,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  }, idx.price);
  candles.setData(d.bars);
  series.price = candles;

  if (show.gate && d.high_p95.length) {
    series.gate = chart.addSeries(LWC.LineSeries, {
      color: C.blue, lineWidth: 1, lineStyle: 2, priceLineVisible: false,
      lastValueVisible: false, crosshairMarkerVisible: false,
    }, idx.price);
    series.gate.setData(d.high_p95);
  }
  applyMarkers();

  if (show.vol) {
    series.vol = chart.addSeries(LWC.HistogramSeries, {
      priceFormat: { type: 'volume' }, priceLineVisible: false,
      lastValueVisible: false,
    }, idx.vol);
    series.vol.setData(d.volume);
  }

  if (show.macd) {
    series.mhist = chart.addSeries(LWC.HistogramSeries, {
      priceLineVisible: false, lastValueVisible: false,
    }, idx.macd);
    series.mhist.setData(d.macd.hist);
    series.mline = chart.addSeries(LWC.LineSeries, {
      color: C.blue, lineWidth: 1, priceLineVisible: false,
      lastValueVisible: false, crosshairMarkerVisible: false,
    }, idx.macd);
    series.mline.setData(d.macd.line);
    series.msig = chart.addSeries(LWC.LineSeries, {
      color: C.orange, lineWidth: 1, priceLineVisible: false,
      lastValueVisible: false, crosshairMarkerVisible: false,
    }, idx.macd);
    series.msig.setData(d.macd.signal);
  }

  if (show.rsi) {
    series.rsi = chart.addSeries(LWC.LineSeries, {
      color: C.purple, lineWidth: 1, priceLineVisible: false,
      lastValueVisible: false,
    }, idx.rsi);
    series.rsi.setData(d.rsi);
    const rail = (v, color, style) => {
      if (v === null || v === undefined) return;
      series.rsi.createPriceLine({ price: v, color, lineWidth: 1,
        lineStyle: style, axisLabelVisible: true, title: '' });
    };
    rail(d.rsi_levels.overbought, C.red, 2);
    rail(d.rsi_levels.uptrend, C.grey, 3);     // the RSI>=50 uptrend gate
    rail(d.rsi_levels.oversold, C.green, 2);
  }

  if (show.regime) {
    series.struct = chart.addSeries(LWC.LineSeries, {
      color: C.grey, lineWidth: 1, lineStyle: 2, lineType: 1,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, idx.regime);
    series.struct.setData(d.structure);
    series.regime = chart.addSeries(LWC.LineSeries, {
      color: C.green, lineWidth: 2, lineType: 1, priceLineVisible: false,
      lastValueVisible: false,
    }, idx.regime);
    series.regime.setData(d.regime);
  }

  // price pane keeps the room; study panes stay short
  try {
    const weights = { price: 6, vol: 1.1, macd: 1.8, rsi: 1.6, regime: 1 };
    chart.panes().forEach((p, i) => {
      const key = Object.keys(idx).find((k) => idx[k] === i);
      p.setStretchFactor(weights[key] ?? 1);
    });
  } catch (e) { /* even split still readable */ }

  chart.subscribeCrosshairMove(onCrosshair);
  chart.timeScale().setVisibleRange({
    from: D.trade_start, to: D.bars[D.bars.length - 1].time,
  });
  readout(D.bars[D.bars.length - 1].time);
}

function visibleMarkers() {
  return D.markers.filter((m) => show.blocked || !m.text.startsWith('blocked'));
}
function applyMarkers() {
  LWC.createSeriesMarkers(candles, visibleMarkers());
}

/* --------------------------------------------------------------- readout */
function onCrosshair(param) {
  if (!param || !param.time) return readout(null);
  const bar = param.seriesData.get(candles);
  const get = (s) => (s && param.seriesData.get(s)
    ? param.seriesData.get(s).value : null);
  readout(param.time, bar, {
    rsi: get(series.rsi), macd: get(series.mline), sig: get(series.msig),
    reg: get(series.regime),
  });
}

const REG = { 3: 'UP', 2: 'RANGE', 1: 'DOWN' };

function readout(time, bar, extra) {
  if (!time) return;
  if (!bar) {
    const i = D.bars.findIndex((b) => b.time === time);
    bar = i >= 0 ? D.bars[i] : null;
  }
  if (!bar) return;
  const e = extra || {};
  const at = (arr) => {
    const p = arr && arr.find((x) => x.time === time);
    return p ? p.value : null;
  };
  const parts = [
    `<b>${time}</b>`,
    `O${fmt(bar.open)} H${fmt(bar.high)} L${fmt(bar.low)} <b>C${fmt(bar.close)}</b>`,
  ];
  const r = e.rsi ?? at(D.rsi);
  if (r !== null) parts.push(`RSI <b>${fmt(r, 0)}</b>`);
  const ml = e.macd ?? at(D.macd.line), ms = e.sig ?? at(D.macd.signal);
  if (ml !== null && ms !== null) {
    parts.push(`MACD <b class="${ml > ms ? 'pos' : 'neg'}">${ml > ms ? '↑' : '↓'}</b>`);
  }
  const rg = e.reg ?? at(D.regime);
  if (rg !== null) parts.push(`<b>${REG[Math.round(rg)] || ''}</b>`);
  $('#readout').innerHTML = parts.join(' · ');
}

/* ----------------------------------------------------------------- cards */
function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function fillCards() {
  const ev = D.events.filter((e) => show.blocked || e.action !== 'BLOCKED');
  $('#evcount').textContent = `${ev.length}`;
  $('#events').innerHTML = ev.map((e, i) => `
    <div class="card ${e.action.toLowerCase()}" data-date="${e.date}" data-ev="${i}">
      <div class="crow">
        <span class="act">${e.action === 'BLOCKED' ? 'REFUSED' : e.action}</span>
        <span class="tag">${e.rule}</span>
        <span class="date">${e.date}</span>
        ${e.price ? `<span>@${fmt(e.price)}</span>` : ''}
        ${e.shares ? `<span class="dim">${fmt(e.shares)} sh</span>` : ''}
      </div>
      <div class="why">${esc(e.reason)}</div>
    </div>`).join('') || '<div class="dim">no events in this window</div>';

  $('#trades').innerHTML = D.trades.map((t) => `
    <div class="card ${t.pnl >= 0 ? 'win' : 'loss'}" data-date="${t.entry}">
      <div class="crow">
        <span class="act ${t.pnl >= 0 ? 'pos' : 'neg'}">${pct(t.ret, 2)}</span>
        <span class="${t.pnl >= 0 ? 'pos' : 'neg'}">$${fmt(t.pnl, 0)}</span>
        <span class="tag">${t.entry_rule} → ${t.exit_rules}</span>
        <span class="date">${t.entry} → ${t.exit ?? 'open'}</span>
        <span class="dim">${t.days}d</span>
      </div>
      <div class="why">${fmt(t.shares)} sh @ ${fmt(t.entry_px)}</div>
    </div>`).join('') || '<div class="dim">no closed trades</div>';

  $$('.card').forEach((el) => {
    el.onclick = () => {
      centre(el.dataset.date);
      if (el.dataset.ev !== undefined) evIdx = Number(el.dataset.ev);
      $('#chartwrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
}

function centre(dateStr) {
  const i = D.bars.findIndex((b) => b.time === dateStr);
  if (i < 0) return;
  const half = window.innerWidth < 700 ? 26 : 45;
  chart.timeScale().setVisibleLogicalRange({ from: i - half, to: i + half });
  readout(dateStr);
}

function step(dir) {
  const ev = D.events.filter((e) => show.blocked || e.action !== 'BLOCKED');
  if (!ev.length) return;
  evIdx = Math.max(0, Math.min(ev.length - 1, evIdx + dir));
  if (evIdx < 0) evIdx = 0;
  centre(ev[evIdx].date);
}

/* ---------------------------------------------------------------- header */
function header() {
  const m = D.metrics;
  const cells = [
    ['', `${m.start} → ${m.end}`],
    ['cap', pct(D.alloc, 0)],
    ['ret', pct(m.total_return)],
    ['DD', pct(m.max_drawdown)],
    ['trades', m.n_trades],
    ['win', pct(m.win_rate, 0)],
    ['expo', pct(m.exposure, 0)],
    ['equity', m.final_equity ? '$' + Math.round(m.final_equity).toLocaleString() : '—'],
  ];
  if (m.buyhold_SPY !== undefined) cells.push(['SPY', pct(m.buyhold_SPY)]);
  if (m.buyhold_QQQ !== undefined) cells.push(['QQQ', pct(m.buyhold_QQQ)]);
  const cls = (k, v) => (k === 'ret' && typeof v === 'string' && v !== '—')
    ? (v.startsWith('-') ? ' neg' : ' pos') : '';
  $('#metrics').innerHTML = cells.map(([k, v]) =>
    `<span class="kv${cls(k, v)}">${k ? `<b>${k}</b>` : ''}${v}</span>`).join('');
  $('#foot').textContent =
    `uptrend ${D.rules.uptrend} · 高位 ${D.rules.high_zone} · stop ${D.rules.stop}` +
    ` · min hold ${D.rules.min_hold} · max ${D.rules.max_positions} positions` +
    ` · ${D.rules.trades_per_day} new trade/day · warmup from ${D.warmup_start}`;
}

/* ------------------------------------------------------------------ boot */
async function load(tkr) {
  const r = await fetch(`data/${tkr}.json`, { cache: 'no-store' });
  if (!r.ok) return fail(`could not load data/${tkr}.json`);
  D = await r.json();
  evIdx = -1;
  header();
  render();
  fillCards();
}

async function main() {
  if (!LWC || !LWC.CandlestickSeries) {
    return fail('lightweight-charts v5 failed to load');
  }
  const r = await fetch('data/index.json', { cache: 'no-store' });
  if (!r.ok) return fail('no data/index.json — run run_backtest.py');
  const idx = await r.json();
  if (!idx.tickers || !idx.tickers.length) return fail('no tickers in index.json');

  const sel = $('#ticker');
  sel.innerHTML = idx.tickers.map((t) => `<option>${t}</option>`).join('');
  sel.onchange = () => load(sel.value);

  $$('.chip').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.pane;
      show[k] = !show[k];
      b.classList.toggle('on', show[k]);
      if (k === 'blocked') { applyMarkers(); fillCards(); } else { render(); }
    };
  });

  $('#prev').onclick = () => step(-1);
  $('#next').onclick = () => step(1);
  $('#full').onclick = () => {
    document.body.classList.toggle('full');
    setTimeout(() => chart && chart.timeScale().fitContent && null, 60);
  };

  await load(idx.tickers[0]);
}

main().catch((e) => fail(String((e && e.stack) || e)));
