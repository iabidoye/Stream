#!/usr/bin/env node
// Gold 100% historical-strategy runner - OANDA demo/live profiles.
//
// This runs the distinct perfect-win-rate Gold candidates found in the
// historical scan. Live trading requires OANDA_LIVE_CONFIRM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const RISK_PCT = 0.50
const MARGIN_BUFFER_PCT = 0.90
const POLL_MS = 5_000
const DECISION_SETTLE_MS = 2 * 60 * 1000
const INSTRUMENT = { symbol: 'XAU_USD', label: 'Gold', priceDp: 3 }
const TAG = 'GOLD_100_PAPER'
const ASIAN_STRATEGY_ID = 'ASIA_0000_0100_B_SL60_TP6_R20'

const STRATEGIES = [
  {
    id: 'UTC_1200_1330_B_SL60_TP12_R15',
    label: 'Best Overall UTC 12:00->13:30',
    timeZone: 'UTC',
    setup: 'breakout',
    rangeStart: 12 * 60,
    decisionDelay: 90,
    entry: 'boundary',
    entryCutoffDelay: 240,
    stop: 60,
    target: 12,
    minRange: 0,
    maxRange: 15,
    h4: 'none',
    dxy: 'notBlock',
    bounce: false,
  },
  {
    id: ASIAN_STRATEGY_ID,
    label: 'Asian UTC 00:00->01:00',
    timeZone: 'UTC',
    setup: 'breakout',
    rangeStart: 0,
    decisionDelay: 60,
    entry: 'boundary',
    entryCutoffDelay: 240,
    stop: 60,
    target: 6,
    minRange: 0,
    maxRange: 20,
    h4: 'none',
    dxy: 'notBlock',
    bounce: false,
    liveOverlapRiskPct: 0.20,
    allowLiveGoldOverlap: true,
  },
  {
    id: 'LONDON_1000_1130_M_SL60_TP8_R8',
    label: 'London 10:00->11:30',
    timeZone: 'Europe/London',
    setup: 'breakout',
    rangeStart: 10 * 60,
    decisionDelay: 90,
    entry: 'mid',
    entryCutoffDelay: 240,
    stop: 60,
    target: 8,
    minRange: 0,
    maxRange: 8,
    h4: 'none',
    dxy: 'notBlock',
    bounce: false,
  },
  {
    id: 'NY_0800_0930_B_SL60_TP12_R20',
    label: 'New York 08:00->09:30',
    timeZone: 'America/New_York',
    setup: 'breakout',
    rangeStart: 8 * 60,
    decisionDelay: 90,
    entry: 'boundary',
    entryCutoffDelay: 240,
    stop: 60,
    target: 12,
    minRange: 0,
    maxRange: 20,
    h4: 'notOpposite',
    dxy: 'notBlock',
    bounce: false,
  },
]

const LIVE_STRATEGY_IDS = new Set([
  'UTC_1200_1330_B_SL60_TP12_R15',
  ASIAN_STRATEGY_ID,
  'LONDON_1000_1130_M_SL60_TP8_R8',
  'NY_0800_0930_B_SL60_TP12_R20',
])

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
const TRADE = process.argv.includes('--trade')
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
      base: 'https://api-fxtrade.oanda.com',
      token: env.OANDA_LIVE_TOKEN,
      accountId: env.OANDA_LIVE_ACCOUNT_ID,
      logName: 'gold-100pct-paper-live.log',
      stateName: '.gold-100pct-paper-live-state.json',
    }
  : {
      label: 'Demo',
      base: 'https://api-fxpractice.oanda.com',
      token: env.OANDA_TOKEN,
      accountId: env.OANDA_ACCOUNT_ID,
      logName: 'gold-100pct-paper-demo.log',
      stateName: '.gold-100pct-paper-demo-state.json',
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

const ACTIVE_STRATEGIES = ACCOUNT_PROFILE === 'live'
  ? STRATEGIES.filter((strategy) => LIVE_STRATEGY_IDS.has(strategy.id))
  : STRATEGIES

const LOG_DIR = path.join(ROOT, 'logs')
fs.mkdirSync(LOG_DIR, { recursive: true })
const LOG_FILE = path.join(LOG_DIR, profile.logName)
const STATE_FILE = path.join(__dirname, profile.stateName)

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
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

async function fetchSizingContext() {
  const [summary, instruments, pricing] = await Promise.all([
    api(`/v3/accounts/${ACCOUNT_ID}/summary`),
    api(`/v3/accounts/${ACCOUNT_ID}/instruments`),
    api(`/v3/accounts/${ACCOUNT_ID}/pricing?instruments=XAU_USD,GBP_USD`),
  ])
  const xauInfo = instruments.instruments.find((instrument) => instrument.name === INSTRUMENT.symbol)
  const gbpUsd = pricing.prices.find((price) => price.instrument === 'GBP_USD')
  const gbpBid = Number(gbpUsd?.bids?.[0]?.price)
  const gbpAsk = Number(gbpUsd?.asks?.[0]?.price)
  const gbpUsdMid = Number.isFinite(gbpBid + gbpAsk) ? (gbpBid + gbpAsk) / 2 : 1
  return {
    nav: Number(summary.account.NAV),
    marginAvailable: Number(summary.account.marginAvailable ?? summary.account.NAV),
    usdToGbp: 1 / gbpUsdMid,
    marginRate: Number(xauInfo?.marginRate ?? 0.05),
    tradeUnitsPrecision: Number(xauInfo?.tradeUnitsPrecision ?? 1),
    minimumTradeSize: Number(xauInfo?.minimumTradeSize ?? 0.1),
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

function hasOpenLiveGold(openTrades) {
  return ACCOUNT_PROFILE === 'live' && openTrades.some((trade) => (
    trade.instrument === INSTRUMENT.symbol && Number(trade.currentUnits) !== 0
  ))
}

function strategyRiskPct(strategy, openTrades) {
  if (canOverlapLiveGold(strategy) && hasOpenLiveGold(openTrades) && Number.isFinite(strategy.liveOverlapRiskPct)) {
    return strategy.liveOverlapRiskPct
  }
  return RISK_PCT
}

function canOverlapLiveGold(strategy) {
  return ACCOUNT_PROFILE === 'live' && strategy.allowLiveGoldOverlap === true
}

function hasBlockingLiveExposure({ strategy, pendingOrders, openTrades }) {
  if (ACCOUNT_PROFILE !== 'live') return false
  const pendingGold = pendingOrders.some((order) => order.instrument === INSTRUMENT.symbol)
  const openGold = hasOpenLiveGold(openTrades)
  return pendingGold || (openGold && !canOverlapLiveGold(strategy))
}

async function placeLimitOrder({ strategy, direction, units, entry, stop, target, gtdTime, clientId, riskPct }) {
  const body = {
    order: {
      type: 'LIMIT',
      instrument: INSTRUMENT.symbol,
      units: String(direction === 'long' ? units : -units),
      price: entry.toFixed(INSTRUMENT.priceDp),
      timeInForce: 'GTD',
      gtdTime: gtdTime.toISOString(),
      positionFill: 'DEFAULT',
      stopLossOnFill: { price: stop.toFixed(INSTRUMENT.priceDp), timeInForce: 'GTC' },
      takeProfitOnFill: { price: target.toFixed(INSTRUMENT.priceDp), timeInForce: 'GTC' },
      clientExtensions: {
        id: clientId,
        tag: TAG,
        comment: `${strategy.label} ${profile.label} ${Math.round(riskPct * 100)}pct risk`,
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

const formatterCache = new Map()
function partsFor(date, timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }))
  }
  return Object.fromEntries(formatterCache.get(timeZone).formatToParts(date).map((part) => [part.type, part.value]))
}

function localDayKey(date, timeZone) {
  const p = partsFor(date, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}

function localHm(date, timeZone) {
  const p = partsFor(date, timeZone)
  return `${p.hour}:${p.minute}`
}

function localMinutes(date, timeZone) {
  const p = partsFor(date, timeZone)
  return Number(p.hour) * 60 + Number(p.minute)
}

function minutesToHm(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function localDateTimeToUtc(day, hour, minute, timeZone) {
  const [year, month, date] = day.split('-').map(Number)
  const desiredLocal = Date.UTC(year, month - 1, date, hour, minute)
  let guess = Date.UTC(year, month - 1, date, hour, minute)
  for (let i = 0; i < 6; i++) {
    const p = partsFor(new Date(guess), timeZone)
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

function directionFromSetup(rangeCandle, decisionCandle, strategy) {
  if (strategy.setup === 'breakout') {
    if (decisionCandle.close > rangeCandle.high) return 'long'
    if (decisionCandle.close < rangeCandle.low) return 'short'
  }
  if (strategy.setup === 'sweepReversal') {
    if (decisionCandle.high > rangeCandle.high && decisionCandle.close < rangeCandle.high) return 'short'
    if (decisionCandle.low < rangeCandle.low && decisionCandle.close > rangeCandle.low) return 'long'
  }
  return null
}

function entryPrice(rangeCandle, direction, strategy) {
  if (strategy.entry === 'boundary') return direction === 'long' ? rangeCandle.high : rangeCandle.low
  if (strategy.entry === 'mid') return (rangeCandle.high + rangeCandle.low) / 2
  return null
}

function passFilters({ direction, h4Trend, dxyBias, strategy }) {
  if (strategy.h4 === 'match') {
    if (direction === 'long' && h4Trend !== 'bullish') return false
    if (direction === 'short' && h4Trend !== 'bearish') return false
  }
  if (strategy.h4 === 'notOpposite') {
    if (direction === 'long' && h4Trend === 'bearish') return false
    if (direction === 'short' && h4Trend === 'bullish') return false
  }
  if (strategy.dxy === 'confirm' && dxyBias !== 'confirms') return false
  if (strategy.dxy === 'notBlock' && dxyBias === 'blocks') return false
  return true
}

function detectSignal({ strategy, m15, h4, dxy }) {
  const today = localDayKey(new Date(), strategy.timeZone)
  const dayCandles = m15.filter((candle) => localDayKey(candle.time, strategy.timeZone) === today)
  const rangeHm = minutesToHm(strategy.rangeStart)
  const decisionHm = minutesToHm(strategy.rangeStart + strategy.decisionDelay)
  const rangeCandle = dayCandles.find((candle) => localHm(candle.time, strategy.timeZone) === rangeHm)
  if (!rangeCandle) return { today, status: 'waiting_range', reason: `No completed ${rangeHm} ${strategy.timeZone} candle yet.` }

  const decisionCandle = dayCandles.find((candle) => localHm(candle.time, strategy.timeZone) === decisionHm)
  if (!decisionCandle) return { today, status: 'waiting_decision', reason: `Range set; waiting for completed ${decisionHm} ${strategy.timeZone} candle.` }

  const decisionCloseTime = new Date(decisionCandle.time.getTime() + 15 * 60 * 1000)
  const settledAt = new Date(decisionCloseTime.getTime() + DECISION_SETTLE_MS)
  if (new Date() < settledAt) {
    return {
      today,
      status: 'waiting_decision',
      reason: `Decision candle closed at ${decisionCloseTime.toISOString()}; waiting for DXY settlement until ${settledAt.toISOString()}.`,
    }
  }

  const range = rangeCandle.high - rangeCandle.low
  if (range < strategy.minRange || range > strategy.maxRange) {
    return { today, status: 'no_trade', reason: `Range ${range.toFixed(3)} outside ${strategy.minRange}-${strategy.maxRange}.` }
  }

  const direction = directionFromSetup(rangeCandle, decisionCandle, strategy)
  if (!direction) return { today, status: 'no_trade', reason: 'Decision candle did not trigger direction.' }

  const h4Trend = latestBefore(h4, decisionCandle.time)?.trend ?? 'missing'
  const dxyBias = dxyState(dxy, decisionCandle.time, direction)
  if (dxyBias === 'missing') {
    return { today, status: 'waiting_dxy', reason: `DXY snapshot missing for ${decisionCandle.time.toISOString()}; no trade until fixed snapshot is available.` }
  }
  if (!passFilters({ direction, h4Trend, dxyBias, strategy })) {
    return { today, status: 'no_trade', reason: `Filtered out: H4 ${h4Trend}, DXY ${dxyBias}.` }
  }

  const cutoffMinute = strategy.rangeStart + strategy.entryCutoffDelay
  const nowMinute = localMinutes(new Date(), strategy.timeZone)
  if (nowMinute >= cutoffMinute) return { today, status: 'stale', reason: `Past ${minutesToHm(cutoffMinute)} ${strategy.timeZone} entry cutoff.` }

  const entry = entryPrice(rangeCandle, direction, strategy)
  const stop = direction === 'long' ? entry - strategy.stop : entry + strategy.stop
  const target = direction === 'long' ? entry + strategy.target : entry - strategy.target
  const [cutoffHour, cutoffMin] = minutesToHm(cutoffMinute).split(':').map(Number)
  const gtdTime = localDateTimeToUtc(today, cutoffHour, cutoffMin, strategy.timeZone)

  return {
    today,
    status: 'signal',
    signal: { direction, entry, stop, target, gtdTime, range, h4Trend, dxyBias },
  }
}

async function executeSignal({ strategy, signal, today, pendingOrders, openTrades }) {
  const clientId = `${TAG}_${strategy.id}_${today.replaceAll('-', '')}_${signal.direction.toUpperCase()}`
  const existing = pendingOrders.some((order) => order.clientExtensions?.id === clientId)
  if (existing) {
    log(`${strategy.id} ${today}: pending order already exists (${clientId}).`)
    return { placed: false, existing: true, clientId }
  }

  const sizing = await fetchSizingContext()
  const riskPct = strategyRiskPct(strategy, openTrades)
  const riskBudget = sizing.nav * riskPct
  const riskUnits = riskBudget / (strategy.stop * sizing.usdToGbp)
  const marginUnits = (sizing.marginAvailable * MARGIN_BUFFER_PCT) / (signal.entry * sizing.usdToGbp * sizing.marginRate)
  const units = floorUnits(Math.min(riskUnits, marginUnits), sizing.tradeUnitsPrecision)
  if (units < sizing.minimumTradeSize) {
    log(`${strategy.id} ${today}: SKIP, risk budget ${riskBudget.toFixed(2)} sizes below 0.1 unit.`)
    return { placed: false, clientId }
  }

  log(
    `${strategy.id} ${signal.direction.toUpperCase()} limit @ ${signal.entry.toFixed(INSTRUMENT.priceDp)} ` +
    `SL ${signal.stop.toFixed(INSTRUMENT.priceDp)} TP ${signal.target.toFixed(INSTRUMENT.priceDp)} ` +
    `range ${signal.range.toFixed(INSTRUMENT.priceDp)} H4 ${signal.h4Trend} DXY ${signal.dxyBias} ` +
    `NAV ${sizing.nav.toFixed(2)} riskPct ${(riskPct * 100).toFixed(0)}% risk ${riskBudget.toFixed(2)} units ${units.toFixed(1)} ` +
    `riskUnits ${riskUnits.toFixed(1)} marginUnits ${marginUnits.toFixed(1)} expires ${signal.gtdTime.toISOString()}`,
  )

  if (DRY) {
    log(`${strategy.id}: DRY RUN - no ${profile.label} order placed. Use --trade to place orders.`)
    return { placed: false, dryRun: true, clientId }
  }

  const response = await placeLimitOrder({
    strategy,
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
  log(`${strategy.id}: ${profile.label.toUpperCase()} ORDER CREATED ${order?.id ?? '?'} (${clientId}).`)
  return { placed: true, clientId, orderId: order?.id }
}

let lastStatus = ''
async function scan() {
  const [pendingOrders, openTrades, dxyLegs, m15, h4Raw] = await Promise.all([
    fetchPendingOrders(),
    fetchOpenTrades(),
    Promise.all(DXY_INSTRUMENTS.map((instrument) => fetchCandles(instrument, 'M15', 500))),
    fetchCandles(INSTRUMENT.symbol, 'M15', 700),
    fetchCandles(INSTRUMENT.symbol, 'H4', 300),
  ])

  const dxy = makeDxy(Object.fromEntries(DXY_INSTRUMENTS.map((instrument, index) => [instrument, dxyLegs[index]])))
  const h4 = addH4Trend(h4Raw)
  const state = loadState()
  const statusLines = []

  for (const strategy of ACTIVE_STRATEGIES) {
    const detected = detectSignal({ strategy, m15, h4, dxy })
    const todayState = state[detected.today] ?? {}
    if (detected.status !== 'signal') {
      statusLines.push(`${strategy.id}: ${detected.reason}`)
      continue
    }
    if (todayState[strategy.id]?.clientId) {
      statusLines.push(`${strategy.id}: already handled today (${todayState[strategy.id].clientId}).`)
      continue
    }
    if (hasBlockingLiveExposure({ strategy, pendingOrders, openTrades })) {
      statusLines.push(`${strategy.id}: skipped; live ${INSTRUMENT.symbol} exposure already open or pending.`)
      continue
    }

    const result = await executeSignal({ strategy, signal: detected.signal, today: detected.today, pendingOrders, openTrades })
    if (!result.dryRun) {
      state[detected.today] = {
        ...(state[detected.today] ?? {}),
        [strategy.id]: {
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
    statusLines.push(`${strategy.id}: ${result.dryRun ? 'dry-run signal found' : 'signal handled'} (${result.clientId}).`)
  }

  const status = statusLines.join(' | ')
  if (status && status !== lastStatus) {
    log(status)
    lastStatus = status
  }
}

log(
  `Gold 100% runner starting - ${ACTIVE_STRATEGIES.length} strategies on OANDA ${profile.label} account ${ACCOUNT_ID} ` +
  `risk ${RISK_PCT * 100}%/signal${DRY ? ' - DRY RUN' : ` - ${profile.label.toUpperCase()} ORDERS ENABLED`}`,
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
