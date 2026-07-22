#!/usr/bin/env node
// 8AM NY Optimised trader — XAU_USD + XAG_USD, OANDA demo/live profiles.
//
// Strategy:
//   - Use the 08:00 New York M15 candle high/low as the range.
//   - At the completed 09:30 New York M15 candle close:
//       close > 8AM high = long, close < 8AM low = short.
//   - Filters: range <= maxRange, H4 trend not opposite, DXY not blocking.
//   - Entry: limit order at the 8AM boundary retest, expiring 12:00 NY.
//   - Stop/target: Gold 40/12, Silver 0.40/0.12.
//
// Risk:
//   - 50% of current account NAV per instrument signal.
//
// Usage:
//   node scripts/eightam-ny-optimised-live.mjs --once                  # demo dry-run one scan
//   node scripts/eightam-ny-optimised-live.mjs --account=demo --trade  # place demo orders
//   node scripts/eightam-ny-optimised-live.mjs --account=live --trade  # place live orders, requires confirmation env

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const RISK_PCT = 0.50
const MAX_LIVE_BOT_TRADES = 1
const MARGIN_BUFFER_PCT = 0.90
const POLL_MS = 5_000
const ENTRY_CUTOFF_MIN = 12 * 60
const DECISION_SETTLE_MS = 2 * 60 * 1000
const OANDA_TIMEOUT_MS = 15_000
const INSTRUMENTS = [
  { symbol: 'XAU_USD', label: 'Gold', priceDp: 3, stop: 40, target: 12, maxRange: 15 },
  { symbol: 'XAG_USD', label: 'Silver', priceDp: 3, stop: 0.40, target: 0.12, maxRange: 0.15 },
]
const ENTRY_ORDER_TYPES = new Set(['LIMIT', 'STOP', 'MARKET_IF_TOUCHED'])

const DXY_INSTRUMENTS = ['EUR_USD', 'USD_JPY', 'GBP_USD', 'USD_CAD', 'USD_SEK', 'USD_CHF']
const DXY_WEIGHTS = {
  EUR_USD: -0.576,
  USD_JPY: 0.136,
  GBP_USD: -0.119,
  USD_CAD: 0.091,
  USD_SEK: 0.042,
  USD_CHF: 0.036,
}

const ONCE = process.argv.includes('--once')
const TRADE = process.argv.includes('--trade') || process.argv.includes('--live')
const DRY = !TRADE

function argValue(name, fallback = null) {
  const arg = process.argv.find((value) => value === name || value.startsWith(`${name}=`))
  if (!arg) return fallback
  if (arg === name) return 'true'
  return arg.slice(name.length + 1)
}

const ACCOUNT_PROFILE = argValue('--account', 'demo')
if (!['demo', 'live'].includes(ACCOUNT_PROFILE)) {
  console.error('Invalid --account. Use --account=demo or --account=live.')
  process.exit(1)
}

function parseEnvText(text) {
  return Object.fromEntries(
    text.split('\n').filter((line) => line.includes('=') && !line.trim().startsWith('#')).map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    }),
  )
}

let fileEnv = {}
try {
  fileEnv = parseEnvText(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8'))
} catch {
  fileEnv = {}
}

const env = {
  ...fileEnv,
  ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value != null)),
}

const profile = ACCOUNT_PROFILE === 'live'
  ? {
      label: 'Live',
      envName: 'live',
      base: 'https://api-fxtrade.oanda.com',
      token: env.OANDA_LIVE_TOKEN,
      accountId: env.OANDA_LIVE_ACCOUNT_ID,
      logName: 'eightam-ny-optimised-live-account.log',
      stateName: '.eightam-ny-optimised-live-state.json',
    }
  : {
      label: 'Demo',
      envName: 'practice',
      base: 'https://api-fxpractice.oanda.com',
      token: env.OANDA_TOKEN,
      accountId: env.OANDA_ACCOUNT_ID,
      logName: 'eightam-ny-optimised-demo.log',
      stateName: '.eightam-ny-optimised-demo-state.json',
    }

const BASE = profile.base
const TOKEN = profile.token
const ACCOUNT_ID = profile.accountId

if (!TOKEN || !ACCOUNT_ID) {
  const prefix = ACCOUNT_PROFILE === 'live' ? 'OANDA_LIVE' : 'OANDA'
  console.error(`Missing ${prefix}_TOKEN / ${prefix}_ACCOUNT_ID in .env.local`)
  process.exit(1)
}
if (ACCOUNT_PROFILE === 'live' && env.OANDA_LIVE_CONFIRM !== 'I_UNDERSTAND_LIVE_50_PERCENT_RISK') {
  console.error('Refusing live account trading: set OANDA_LIVE_CONFIRM=I_UNDERSTAND_LIVE_50_PERCENT_RISK in .env.local')
  process.exit(1)
}

const LOG_DIR = path.join(ROOT, 'logs')
fs.mkdirSync(LOG_DIR, { recursive: true })
const LOG_FILE = path.join(LOG_DIR, profile.logName)
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

const STATE_FILE = path.join(__dirname, profile.stateName)
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
    signal: opts.signal ?? AbortSignal.timeout(OANDA_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) throw new Error(`OANDA ${res.status} ${pathname}: ${text.slice(0, 500)}`)
  return json
}

async function fetchCandles(instrument, granularity, count) {
  const data = await api(`/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`)
  return data.candles
    .filter((candle) => candle.complete)
    .map((candle) => ({
      time: new Date(candle.time),
      open: Number(candle.mid.o),
      high: Number(candle.mid.h),
      low: Number(candle.mid.l),
      close: Number(candle.mid.c),
    }))
    .sort((a, b) => a.time - b.time)
}

async function fetchNAV() {
  const data = await api(`/v3/accounts/${ACCOUNT_ID}/summary`)
  return Number(data.account.NAV)
}

async function fetchSizingContext(instrument) {
  const [summary, instruments, pricing] = await Promise.all([
    api(`/v3/accounts/${ACCOUNT_ID}/summary`),
    api(`/v3/accounts/${ACCOUNT_ID}/instruments`),
    api(`/v3/accounts/${ACCOUNT_ID}/pricing?instruments=${instrument.symbol},GBP_USD`),
  ])
  const instrumentInfo = instruments.instruments.find((item) => item.name === instrument.symbol)
  const gbpUsd = pricing.prices.find((price) => price.instrument === 'GBP_USD')
  const gbpBid = Number(gbpUsd?.bids?.[0]?.price)
  const gbpAsk = Number(gbpUsd?.asks?.[0]?.price)
  const gbpUsdMid = Number.isFinite(gbpBid + gbpAsk) ? (gbpBid + gbpAsk) / 2 : 1
  return {
    nav: Number(summary.account.NAV),
    marginAvailable: Number(summary.account.marginAvailable ?? summary.account.NAV),
    usdToGbp: 1 / gbpUsdMid,
    marginRate: Number(instrumentInfo?.marginRate ?? 0.05),
    tradeUnitsPrecision: Number(instrumentInfo?.tradeUnitsPrecision ?? 0),
    minimumTradeSize: Number(instrumentInfo?.minimumTradeSize ?? 1),
  }
}

function floorUnits(value, precision) {
  const factor = 10 ** precision
  return Math.floor(value * factor) / factor
}

async function fetchPendingOrders() {
  const data = await api(`/v3/accounts/${ACCOUNT_ID}/pendingOrders`)
  return data.orders ?? []
}

async function fetchOpenTrades() {
  const data = await api(`/v3/accounts/${ACCOUNT_ID}/openTrades`)
  return data.trades ?? []
}

function isBotInstrument(symbol) {
  return INSTRUMENTS.some((instrument) => instrument.symbol === symbol)
}

function countOpenLiveAccountTrades(openTrades) {
  if (ACCOUNT_PROFILE !== 'live') return 0
  return openTrades.filter((trade) => (
    Number(trade.currentUnits) !== 0
  )).length
}

function hasPendingLiveAccountEntry(pendingOrders) {
  return ACCOUNT_PROFILE === 'live' && pendingOrders.some((order) => (
    ENTRY_ORDER_TYPES.has(order.type) && !order.tradeID
  ))
}

function signalRiskPct(openTrades) {
  return RISK_PCT
}

function liveExposureBlockReason({ pendingOrders, openTrades }) {
  if (ACCOUNT_PROFILE !== 'live') return null
  if (hasPendingLiveAccountEntry(pendingOrders)) return 'live account entry order already pending'
  const openTradesCount = countOpenLiveAccountTrades(openTrades)
  if (openTradesCount >= MAX_LIVE_BOT_TRADES) return `${openTradesCount} live account trade already open`
  return null
}

async function placeLimitOrder({ instrument, direction, units, entry, stop, target, gtdTime, clientId, riskPct }) {
  const body = {
    order: {
      type: 'LIMIT',
      instrument: instrument.symbol,
      units: String(direction === 'long' ? units : -units),
      price: entry.toFixed(instrument.priceDp),
      timeInForce: 'GTD',
      gtdTime: gtdTime.toISOString(),
      positionFill: 'DEFAULT',
      stopLossOnFill: { price: stop.toFixed(instrument.priceDp), timeInForce: 'GTC' },
      takeProfitOnFill: { price: target.toFixed(instrument.priceDp), timeInForce: 'GTC' },
      clientExtensions: {
        id: clientId,
        tag: 'EIGHT_AM_NY_OPT',
        comment: `${instrument.label} 8AM NY Optimised ${Math.round(riskPct * 100)}pct risk`,
      },
    },
  }
  return api(`/v3/accounts/${ACCOUNT_ID}/orders`, { method: 'POST', body: JSON.stringify(body) })
}

function ema(values, period) {
  const out = Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let e = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  out[period - 1] = e
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k)
    out[i] = e
  }
  return out
}

function nyParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date).map((part) => [part.type, part.value]))
}

function nyDayKey(date) {
  const p = nyParts(date)
  return `${p.year}-${p.month}-${p.day}`
}

function nyHm(date) {
  const p = nyParts(date)
  return `${p.hour}:${p.minute}`
}

function nyMinutes(date) {
  const p = nyParts(date)
  return Number(p.hour) * 60 + Number(p.minute)
}

function nyDateTimeToUtc(day, hour, minute) {
  const [year, month, date] = day.split('-').map(Number)
  const desiredLocal = Date.UTC(year, month - 1, date, hour, minute)
  let guess = Date.UTC(year, month - 1, date, hour + 5, minute)
  for (let i = 0; i < 4; i++) {
    const p = nyParts(new Date(guess))
    const actualLocal = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
    guess += desiredLocal - actualLocal
  }
  return new Date(guess)
}

function latestBefore(candles, time) {
  let lo = 0
  let hi = candles.length - 1
  let found = null
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (candles[mid].time <= time) {
      found = candles[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

function exactAt(candles, time) {
  const ms = time.getTime()
  return candles.find((candle) => candle.time.getTime() === ms) ?? null
}

function addH4Trend(candles) {
  const ema50 = ema(candles.map((candle) => candle.close), 50)
  const ema200 = ema(candles.map((candle) => candle.close), 200)
  return candles.map((candle, index) => ({
    ...candle,
    trend: candle.close > ema50[index] && ema50[index] > ema200[index]
      ? 'bullish'
      : candle.close < ema50[index] && ema50[index] < ema200[index]
        ? 'bearish'
        : 'neutral',
  }))
}

function makeDxy(seriesByInstrument) {
  const maps = new Map(Object.entries(seriesByInstrument).map(([instrument, candles]) => [
    instrument,
    new Map(candles.map((candle) => [candle.time.getTime(), candle])),
  ]))
  const out = []
  const baseTimes = [...maps.values()][0]

  for (const time of [...baseTimes.keys()].sort((a, b) => a - b)) {
    let value = 50.14348112
    let ok = true
    for (const instrument of DXY_INSTRUMENTS) {
      const candle = maps.get(instrument).get(time)
      if (!candle) {
        ok = false
        break
      }
      value *= Math.pow(candle.close, DXY_WEIGHTS[instrument])
    }
    if (ok) out.push({ time: new Date(time), close: value })
  }

  const ema20 = ema(out.map((candle) => candle.close), 20)
  return out.map((candle, index) => ({ ...candle, ema20: ema20[index] }))
}

function dxyState(dxy, time, direction) {
  const current = exactAt(dxy, time)
  if (!current?.ema20) return 'missing'
  const index = dxy.findIndex((candle) => candle.time.getTime() === current.time.getTime())
  const prev = index > 0 ? dxy[index - 1] : null
  if (!prev) return 'missing'

  const dxyBull = current.close > current.ema20 && current.close > prev.close
  const dxyBear = current.close < current.ema20 && current.close < prev.close
  if (direction === 'long' && dxyBear) return 'confirms'
  if (direction === 'short' && dxyBull) return 'confirms'
  if (direction === 'long' && dxyBull) return 'blocks'
  if (direction === 'short' && dxyBear) return 'blocks'
  return 'neutral'
}

function detectSignal({ instrument, m15, h4, dxy }) {
  const today = nyDayKey(new Date())
  const dayCandles = m15.filter((candle) => nyDayKey(candle.time) === today)
  const c8 = dayCandles.find((candle) => nyHm(candle.time) === '08:00')
  if (!c8) return { today, status: 'waiting_8am', reason: 'No completed 08:00 NY M15 candle yet.' }

  const c930 = dayCandles.find((candle) => nyHm(candle.time) === '09:30')
  if (!c930) {
    return {
      today,
      status: 'waiting_930',
      reason: `8AM range ${c8.low.toFixed(instrument.priceDp)}-${c8.high.toFixed(instrument.priceDp)} set; waiting for completed 09:30 NY candle.`,
    }
  }

  const decisionCloseTime = new Date(c930.time.getTime() + 15 * 60 * 1000)
  const settledAt = new Date(decisionCloseTime.getTime() + DECISION_SETTLE_MS)
  if (new Date() < settledAt) {
    return {
      today,
      status: 'waiting_930',
      reason: `09:30 candle closed at ${decisionCloseTime.toISOString()}; waiting for DXY settlement until ${settledAt.toISOString()}.`,
    }
  }

  const range = c8.high - c8.low
  if (range > instrument.maxRange) {
    return { today, status: 'no_trade', reason: `Range too wide: ${range.toFixed(instrument.priceDp)} > ${instrument.maxRange}.` }
  }

  const direction = c930.close > c8.high ? 'long' : c930.close < c8.low ? 'short' : null
  if (!direction) return { today, status: 'no_trade', reason: '09:30 close stayed inside the 8AM range.' }

  const h4Trend = latestBefore(h4, c930.time)?.trend ?? 'missing'
  if ((direction === 'long' && h4Trend === 'bearish') || (direction === 'short' && h4Trend === 'bullish')) {
    return { today, status: 'no_trade', reason: `H4 is opposite: ${h4Trend}.` }
  }

  const dxyBias = dxyState(dxy, c930.time, direction)
  if (dxyBias === 'missing') {
    return { today, status: 'waiting_dxy', reason: `DXY snapshot missing for ${c930.time.toISOString()}; no trade until fixed snapshot is available.` }
  }
  if (dxyBias === 'blocks') return { today, status: 'no_trade', reason: 'DXY blocks the trade.' }

  const nowNyMinutes = nyMinutes(new Date())
  if (nowNyMinutes >= ENTRY_CUTOFF_MIN) return { today, status: 'stale', reason: 'Past 12:00 NY entry cutoff.' }

  const entry = direction === 'long' ? c8.high : c8.low
  const stop = direction === 'long' ? entry - instrument.stop : entry + instrument.stop
  const target = direction === 'long' ? entry + instrument.target : entry - instrument.target
  const gtdTime = nyDateTimeToUtc(today, 12, 0)

  return {
    today,
    status: 'signal',
    signal: { direction, entry, stop, target, gtdTime, range, h4Trend, dxyBias },
  }
}

async function executeSignal({ instrument, signal, today, pendingOrders, openTrades }) {
  const clientId = `EIGHTAM_${instrument.symbol.replace('_', '')}_${today.replaceAll('-', '')}_${signal.direction.toUpperCase()}`
  const existing = pendingOrders.some((order) => order.clientExtensions?.id === clientId)
  if (existing) {
    log(`${instrument.symbol} ${today}: pending order already exists (${clientId}).`)
    return { placed: false, existing: true, clientId }
  }
  const liveBlockReason = liveExposureBlockReason({ pendingOrders, openTrades })
  if (liveBlockReason) {
    log(`${instrument.symbol} ${today}: SKIP, ${liveBlockReason}.`)
    return { placed: false, blockedByExposure: true, clientId }
  }

  const sizing = await fetchSizingContext(instrument)
  const riskPct = signalRiskPct(openTrades)
  const riskBudget = sizing.nav * riskPct
  const riskUnits = riskBudget / (instrument.stop * sizing.usdToGbp)
  const marginUnits = (sizing.marginAvailable * MARGIN_BUFFER_PCT) / (signal.entry * sizing.usdToGbp * sizing.marginRate)
  const units = floorUnits(Math.min(riskUnits, marginUnits), sizing.tradeUnitsPrecision)
  if (units < sizing.minimumTradeSize) {
    log(`${instrument.symbol} ${today}: SKIP, risk budget ${riskBudget.toFixed(2)} sizes below 1 unit.`)
    return { placed: false, skipped: true, clientId }
  }

  log(
    `${instrument.symbol} ${signal.direction.toUpperCase()} limit @ ${signal.entry.toFixed(instrument.priceDp)} ` +
    `SL ${signal.stop.toFixed(instrument.priceDp)} TP ${signal.target.toFixed(instrument.priceDp)} ` +
    `range ${signal.range.toFixed(instrument.priceDp)} H4 ${signal.h4Trend} DXY ${signal.dxyBias} ` +
    `NAV ${sizing.nav.toFixed(2)} riskPct ${(riskPct * 100).toFixed(0)}% risk ${riskBudget.toFixed(2)} units ${units} ` +
    `riskUnits ${riskUnits.toFixed(1)} marginUnits ${marginUnits.toFixed(1)} expires ${signal.gtdTime.toISOString()}`,
  )

  if (DRY) {
    log(`${instrument.symbol}: DRY RUN - no order placed. Use --live to place practice orders.`)
    return { placed: false, dryRun: true, clientId }
  }

  const [latestPendingOrders, latestOpenTrades] = await Promise.all([
    fetchPendingOrders(),
    fetchOpenTrades(),
  ])
  const latestLiveBlockReason = liveExposureBlockReason({
    pendingOrders: latestPendingOrders,
    openTrades: latestOpenTrades,
  })
  if (latestLiveBlockReason) {
    log(`${instrument.symbol} ${today}: SKIP before order placement, ${latestLiveBlockReason}.`)
    return { placed: false, blockedByExposure: true, clientId }
  }

  const response = await placeLimitOrder({
    instrument,
    direction: signal.direction,
    units,
    entry: signal.entry,
    stop: signal.stop,
    target: signal.target,
    gtdTime: signal.gtdTime,
    clientId,
    riskPct,
  })
  const order = response.orderCreateTransaction
  log(`${instrument.symbol}: ORDER CREATED ${order?.id ?? '?'} (${clientId}).`)
  return { placed: true, clientId, orderId: order?.id }
}

let lastStatus = ''
async function scan() {
  const [pendingOrders, openTrades, dxyLegs, ...instrumentData] = await Promise.all([
    fetchPendingOrders(),
    fetchOpenTrades(),
    Promise.all(DXY_INSTRUMENTS.map((instrument) => fetchCandles(instrument, 'M15', 500))),
    ...INSTRUMENTS.flatMap((instrument) => [
      fetchCandles(instrument.symbol, 'M15', 500),
      fetchCandles(instrument.symbol, 'H4', 300),
    ]),
  ])

  const dxy = makeDxy(Object.fromEntries(DXY_INSTRUMENTS.map((instrument, index) => [instrument, dxyLegs[index]])))
  const state = loadState()
  const statusLines = []
  const detections = INSTRUMENTS.map((instrument, index) => {
    const m15 = instrumentData[index * 2]
    const h4 = addH4Trend(instrumentData[index * 2 + 1])
    return {
      instrument,
      detected: detectSignal({ instrument, m15, h4, dxy }),
    }
  })

  for (const { instrument, detected } of detections) {
    const todayState = state[detected.today] ?? {}
    const key = instrument.symbol

    if (detected.status !== 'signal') {
      statusLines.push(`${instrument.symbol}: ${detected.reason}`)
      continue
    }

    if (todayState[key]?.clientId) {
      statusLines.push(`${instrument.symbol}: already handled today (${todayState[key].clientId ?? todayState[key].reason}).`)
      continue
    }

    const result = await executeSignal({ instrument, signal: detected.signal, today: detected.today, pendingOrders, openTrades })
    if (!result.dryRun && !result.blockedByExposure && !result.skipped) {
      state[detected.today] = {
        ...(state[detected.today] ?? {}),
        [key]: {
          clientId: result.clientId,
          placed: result.placed,
          existing: result.existing ?? false,
          at: new Date().toISOString(),
          direction: detected.signal.direction,
          entry: detected.signal.entry,
          stop: detected.signal.stop,
          target: detected.signal.target,
        },
      }
      saveState(state)
    }
    statusLines.push(`${instrument.symbol}: ${result.blockedByExposure ? 'blocked by existing live exposure' : result.skipped ? 'skipped' : result.dryRun ? 'dry-run signal found' : 'signal handled'} (${result.clientId}).`)
  }

  const status = statusLines.join(' | ')
  if (status && status !== lastStatus) {
    log(status)
    lastStatus = status
  }
}

log(
  `8AM NY Optimised trader starting - ${INSTRUMENTS.map((instrument) => instrument.symbol).join(', ')} ` +
  `on OANDA ${profile.label} account ${ACCOUNT_ID} - risk ${RISK_PCT * 100}% with one live account trade maximum` +
  (DRY ? ' - DRY RUN' : ` - ${profile.label.toUpperCase()} ORDERS ENABLED`),
)

if (ONCE) {
  scan().then(() => process.exit(0)).catch((error) => {
    log(`ERROR: ${error.message}`)
    process.exit(1)
  })
} else {
  const tick = async () => {
    try { await scan() } catch (error) { log(`ERROR: ${error.message}`) }
    setTimeout(tick, POLL_MS)
  }
  tick()
}
