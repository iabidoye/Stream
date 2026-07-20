#!/usr/bin/env node
// LNDB live trader — London Breakout on XAU_USD, OANDA practice account.
//
// Strategy (mirrors lib/strategy.ts detectLNDBSignals):
//   - London box = high/low of M5 candles 3:00–7:59 AM Central (America/Chicago)
//   - After 8:00 AM CT: first complete M5 close above box → LONG
//                       first complete M5 close below box → SHORT
//   - Entry: market on signal candle close. Stop: signal candle low (long) / high (short).
//   - Exits: position split into 3 tranches with TPs at 1R / 2R / 3R, same stop.
//   - Max one long + one short per day.
//
// Risk: RISK_PCT of account NAV per signal (default 1%).
// State persisted to scripts/.lndb-state.json so restarts never double-fire.
//
// Usage:  node scripts/lndb-live.mjs           # run forever
//         node scripts/lndb-live.mjs --once    # single scan pass (no loop)
//         node scripts/lndb-live.mjs --dry     # detect + log, place no orders

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ── Config ────────────────────────────────────────────────────────────────────
const INSTRUMENT   = 'XAU_USD'
const RISK_PCT     = 0.01          // 1% of NAV per signal
const LONDON_START = 3 * 60        // 3:00 AM CT
const LONDON_END   = 8 * 60        // 8:00 AM CT
const POLL_MS      = 20_000
const FRESH_SECS   = 15 * 60       // only trade signals whose candle closed < 15 min ago
const PRICE_DP     = 3             // XAU_USD display precision

const ONCE = process.argv.includes('--once')
const DRY  = process.argv.includes('--dry')

// ── Env ───────────────────────────────────────────────────────────────────────
const envFile = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }),
)
const BASE = env.OANDA_ENV === 'practice'
  ? 'https://api-fxpractice.oanda.com'
  : 'https://api-fxtrade.oanda.com'
const TOKEN = env.OANDA_TOKEN
const ACCOUNT_ID = env.OANDA_ACCOUNT_ID
if (!TOKEN || !ACCOUNT_ID) { console.error('Missing OANDA_TOKEN / OANDA_ACCOUNT_ID in .env.local'); process.exit(1) }
if (env.OANDA_ENV !== 'practice') { console.error('Refusing to run: OANDA_ENV is not "practice".'); process.exit(1) }

// ── Logging ───────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(ROOT, 'logs')
fs.mkdirSync(LOG_DIR, { recursive: true })
const LOG_FILE = path.join(LOG_DIR, 'lndb-live.log')
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

// ── State ─────────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, '.lndb-state.json')
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)) }

// ── OANDA API ─────────────────────────────────────────────────────────────────
async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Accept-Datetime-Format': 'UNIX',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) throw new Error(`OANDA ${res.status} ${pathname}: ${text.slice(0, 500)}`)
  return json
}

async function fetchM5(count = 500) {
  const data = await api(`/v3/instruments/${INSTRUMENT}/candles?granularity=M5&count=${count}&price=M`)
  return data.candles.map(c => ({
    time: Math.floor(parseFloat(c.time)),
    open: parseFloat(c.mid.o),
    high: parseFloat(c.mid.h),
    low: parseFloat(c.mid.l),
    close: parseFloat(c.mid.c),
    complete: c.complete,
  }))
}

async function fetchNAV() {
  const data = await api(`/v3/accounts/${ACCOUNT_ID}/summary`)
  return parseFloat(data.account.NAV)
}

async function placeMarketOrder(units, slPrice, tpPrice, tag) {
  const body = {
    order: {
      type: 'MARKET',
      instrument: INSTRUMENT,
      units: String(units),
      timeInForce: 'FOK',
      positionFill: 'DEFAULT',
      stopLossOnFill:   { price: slPrice.toFixed(PRICE_DP), timeInForce: 'GTC' },
      takeProfitOnFill: { price: tpPrice.toFixed(PRICE_DP), timeInForce: 'GTC' },
      clientExtensions: { tag: 'LNDB', comment: tag },
    },
  }
  return api(`/v3/accounts/${ACCOUNT_ID}/orders`, { method: 'POST', body: JSON.stringify(body) })
}

// ── Time helpers (Central time, matches lib/strategy.ts) ─────────────────────
function toCT(tsSec) {
  return new Date(new Date(tsSec * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago' }))
}
function ctMinutes(d) { return d.getHours() * 60 + d.getMinutes() }
function ctDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Signal detection ──────────────────────────────────────────────────────────
function detect(candles) {
  const nowCT = toCT(Date.now() / 1000)
  const today = ctDateKey(nowCT)

  const london = candles.filter(c => {
    if (!c.complete) return false
    const ct = toCT(c.time)
    if (ctDateKey(ct) !== today) return false
    const m = ctMinutes(ct)
    return m >= LONDON_START && m < LONDON_END
  })
  if (london.length < 2) return { today, box: null, signals: [] }

  const box = {
    high: Math.max(...london.map(c => c.high)),
    low:  Math.min(...london.map(c => c.low)),
    bars: london.length,
  }
  const lastLondonTime = london[london.length - 1].time

  const post = candles.filter(c => {
    if (!c.complete || c.time <= lastLondonTime) return false
    const ct = toCT(c.time)
    return ctDateKey(ct) === today && ctMinutes(ct) >= LONDON_END
  })

  const signals = []
  let longFired = false, shortFired = false
  for (const c of post) {
    if (!longFired && c.close > box.high) {
      longFired = true
      signals.push({ dir: 'long', time: c.time, entry: c.close, stop: c.low, risk: c.close - c.low })
    }
    if (!shortFired && c.close < box.low) {
      shortFired = true
      signals.push({ dir: 'short', time: c.time, entry: c.close, stop: c.high, risk: c.high - c.close })
    }
    if (longFired && shortFired) break
  }
  return { today, box, signals }
}

// ── Order placement ───────────────────────────────────────────────────────────
async function execute(sig) {
  const nav = await fetchNAV()
  const riskUSD = nav * RISK_PCT
  if (sig.risk <= 0.01) { log(`SKIP ${sig.dir}: degenerate risk ${sig.risk.toFixed(3)}`); return }

  const totalUnits = Math.floor(riskUSD / sig.risk)
  if (totalUnits < 1) { log(`SKIP ${sig.dir}: sized to 0 units (risk/unit ${sig.risk.toFixed(2)} > budget ${riskUSD.toFixed(2)})`); return }

  const sign = sig.dir === 'long' ? 1 : -1
  const tps = [1, 2, 3].map(r => sig.entry + sign * r * sig.risk)

  // Split into 3 tranches (TP1/TP2/TP3). If too small to split, single order at TP2.
  let tranches
  if (totalUnits >= 3) {
    const base = Math.floor(totalUnits / 3)
    tranches = [
      { units: base, tp: tps[0], tag: 'LNDB-TP1' },
      { units: base, tp: tps[1], tag: 'LNDB-TP2' },
      { units: totalUnits - 2 * base, tp: tps[2], tag: 'LNDB-TP3' },
    ]
  } else {
    tranches = [{ units: totalUnits, tp: tps[1], tag: 'LNDB-TP2' }]
  }

  log(`SIGNAL ${sig.dir.toUpperCase()} @ ${sig.entry.toFixed(2)} SL ${sig.stop.toFixed(2)} ` +
      `(risk/unit $${sig.risk.toFixed(2)}) NAV $${nav.toFixed(0)} → ${totalUnits} units, budget $${riskUSD.toFixed(0)}`)

  if (DRY) { log('DRY RUN — no orders placed'); return }

  for (const t of tranches) {
    try {
      const resp = await placeMarketOrder(sign * t.units, sig.stop, t.tp, t.tag)
      const fill = resp.orderFillTransaction
      if (fill) {
        log(`FILLED ${t.tag}: ${fill.units} units @ ${fill.price} (trade ${fill.tradeOpened?.tradeID ?? '?'}) SL ${sig.stop.toFixed(2)} TP ${t.tp.toFixed(2)}`)
      } else {
        log(`ORDER ${t.tag} response: ${JSON.stringify(resp).slice(0, 400)}`)
      }
    } catch (e) {
      log(`ORDER FAILED ${t.tag}: ${e.message}`)
    }
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastStatus = ''
async function scan() {
  const candles = await fetchM5()
  const { today, box, signals } = detect(candles)
  const state = loadState()
  if (!state[today]) state[today] = {}

  const nowSec = Date.now() / 1000
  const status = box
    ? `box ${box.low.toFixed(2)}–${box.high.toFixed(2)} (${box.bars} bars) fired:${Object.keys(state[today]).join(',') || 'none'}`
    : `no London box yet for ${today}`
  if (status !== lastStatus) { log(status); lastStatus = status }

  for (const sig of signals) {
    if (state[today][sig.dir]) continue
    state[today][sig.dir] = { time: sig.time, entry: sig.entry, stop: sig.stop }
    saveState(state)

    const age = nowSec - (sig.time + 300) // candle close = open time + 5 min
    if (age > FRESH_SECS) {
      log(`STALE ${sig.dir} signal from ${new Date(sig.time * 1000).toISOString()} (${Math.round(age / 60)} min old) — recorded, not traded`)
      continue
    }
    await execute(sig)
  }
}

log(`LNDB live trader starting — ${INSTRUMENT} on ${env.OANDA_ENV} account ${ACCOUNT_ID}` +
    ` · risk ${RISK_PCT * 100}%/signal · London box ${LONDON_START / 60}:00–${LONDON_END / 60}:00 CT` +
    (DRY ? ' · DRY RUN' : ''))

if (ONCE) {
  scan().then(() => process.exit(0)).catch(e => { log(`ERROR: ${e.message}`); process.exit(1) })
} else {
  const tick = async () => {
    try { await scan() } catch (e) { log(`ERROR: ${e.message}`) }
    setTimeout(tick, POLL_MS)
  }
  tick()
}
