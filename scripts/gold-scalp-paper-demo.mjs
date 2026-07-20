#!/usr/bin/env node
// Demo-only Gold scalp paper runner.
//
// These are research candidates, not live strategies. They only use the OANDA
// practice account and deliberately do not accept a live account profile.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const RISK_PCT = 0.5
const MARGIN_BUFFER_PCT = 0.9
const POLL_MS = 5_000
const TAG = 'GOLD_SCALP_PAPER'
const INSTRUMENT = { symbol: 'XAU_USD', priceDp: 3 }

const STRATEGIES = [
  {
    id: 'SCALP_ASIA_0000_R3_B_SL10_TP2_H1MATCH',
    label: 'Asian 00:00 M5 boundary scalp',
    timeZone: 'UTC',
    rangeStart: 0,
    rangeBars: 3,
    decisionBars: 1,
    setup: 'breakout',
    entry: 'boundary',
    entryWindowBars: 12,
    stop: 10,
    target: 2,
    maxRange: 20,
    maxHoldBars: 24,
    h1: 'match',
  },
  {
    id: 'SCALP_LONDON_0800_R1_M_SL10_TP2_H1MATCH',
    label: 'London 08:00 M5 midpoint scalp',
    timeZone: 'Europe/London',
    rangeStart: 8 * 60,
    rangeBars: 1,
    decisionBars: 3,
    setup: 'breakout',
    entry: 'mid',
    entryWindowBars: 12,
    stop: 10,
    target: 2,
    maxRange: 20,
    maxHoldBars: 24,
    h1: 'match',
  },
  {
    id: 'SCALP_NY_0900_R1_B_SL10_TP2_H1MATCH',
    label: 'New York 09:00 M5 boundary scalp',
    timeZone: 'America/New_York',
    rangeStart: 9 * 60,
    rangeBars: 1,
    decisionBars: 1,
    setup: 'breakout',
    entry: 'boundary',
    entryWindowBars: 12,
    stop: 10,
    target: 2,
    maxRange: 3,
    maxHoldBars: 24,
    h1: 'match',
  },
  {
    id: 'SCALP_UTC_1400_R1_M_SL10_TP2_H1MATCH',
    label: 'UTC 14:00 M5 midpoint scalp',
    timeZone: 'UTC',
    rangeStart: 14 * 60,
    rangeBars: 1,
    decisionBars: 1,
    setup: 'breakout',
    entry: 'mid',
    entryWindowBars: 12,
    stop: 10,
    target: 2,
    maxRange: 20,
    maxHoldBars: 12,
    h1: 'match',
  },
]

const ONCE = process.argv.includes('--once')
const TRADE = process.argv.includes('--trade')
const DRY = !TRADE

function parseEnvText(text) {
  return Object.fromEntries(
    text.split('\n').filter((line) => line.includes('=') && !line.trim().startsWith('#')).map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
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

const BASE = 'https://api-fxpractice.oanda.com'
const TOKEN = env.OANDA_TOKEN
const ACCOUNT_ID = env.OANDA_ACCOUNT_ID
if (!TOKEN || !ACCOUNT_ID) {
  console.error('Missing OANDA_TOKEN / OANDA_ACCOUNT_ID in .env.local')
  process.exit(1)
}

const LOG_DIR = path.join(ROOT, 'logs')
fs.mkdirSync(LOG_DIR, { recursive: true })
const LOG_FILE = path.join(LOG_DIR, 'gold-scalp-paper-demo.log')
const STATE_FILE = path.join(__dirname, '.gold-scalp-paper-demo-state.json')

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, `${line}\n`)
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
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

async function fetchCandles(instrument, granularity, count, price = 'M') {
  const data = await api(`/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=${price}`)
  return data.candles
    .filter((candle) => candle.complete)
    .map((candle) => ({
      time: new Date(candle.time),
      mid: candle.mid ? {
        open: Number(candle.mid.o),
        high: Number(candle.mid.h),
        low: Number(candle.mid.l),
        close: Number(candle.mid.c),
      } : {
        open: (Number(candle.bid.o) + Number(candle.ask.o)) / 2,
        high: (Number(candle.bid.h) + Number(candle.ask.h)) / 2,
        low: (Number(candle.bid.l) + Number(candle.ask.l)) / 2,
        close: (Number(candle.bid.c) + Number(candle.ask.c)) / 2,
      },
      bid: candle.bid ? {
        open: Number(candle.bid.o),
        high: Number(candle.bid.h),
        low: Number(candle.bid.l),
        close: Number(candle.bid.c),
      } : null,
      ask: candle.ask ? {
        open: Number(candle.ask.o),
        high: Number(candle.ask.h),
        low: Number(candle.ask.l),
        close: Number(candle.ask.c),
      } : null,
    }))
    .sort((a, b) => a.time - b.time)
}

function ema(values, period) {
  const out = Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  out[period - 1] = current
  for (let i = period; i < values.length; i += 1) {
    current = values[i] * k + current * (1 - k)
    out[i] = current
  }
  return out
}

function addH1Trend(candles) {
  const closes = candles.map((candle) => candle.mid.close)
  const fast = ema(closes, 20)
  const slow = ema(closes, 50)
  return candles.map((candle, index) => ({
    ...candle,
    trend: candle.mid.close > fast[index] && fast[index] > slow[index]
      ? 'bullish'
      : candle.mid.close < fast[index] && fast[index] < slow[index]
        ? 'bearish'
        : 'neutral',
  }))
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
      hourCycle: 'h23',
    }))
  }
  return Object.fromEntries(formatterCache.get(timeZone).formatToParts(date).map((part) => [part.type, part.value]))
}

function localDayKey(date, timeZone) {
  const parts = partsFor(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function localMinutes(date, timeZone) {
  const parts = partsFor(date, timeZone)
  return Number(parts.hour) * 60 + Number(parts.minute)
}

function minutesToHm(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function localDateTimeToUtc(day, hour, minute, timeZone) {
  const [year, month, date] = day.split('-').map(Number)
  const desiredLocal = Date.UTC(year, month - 1, date, hour, minute)
  let guess = Date.UTC(year, month - 1, date, hour, minute)
  for (let i = 0; i < 6; i += 1) {
    const parts = partsFor(new Date(guess), timeZone)
    const actualLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
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

function directionFromSetup(strategy, range, decision) {
  if (strategy.setup !== 'breakout') return null
  if (decision.mid.close > range.high) return 'long'
  if (decision.mid.close < range.low) return 'short'
  return null
}

function passTrend(direction, trend) {
  return direction === 'long' ? trend === 'bullish' : trend === 'bearish'
}

function detectSignal({ strategy, m5, h1 }) {
  const today = localDayKey(new Date(), strategy.timeZone)
  const dayCandles = m5.filter((candle) => localDayKey(candle.time, strategy.timeZone) === today)
  const startIndex = dayCandles.findIndex((candle) => localMinutes(candle.time, strategy.timeZone) === strategy.rangeStart)
  if (startIndex < 0) return { today, status: 'waiting_range', reason: `No completed ${minutesToHm(strategy.rangeStart)} ${strategy.timeZone} M5 range yet.` }

  const rangeRows = dayCandles.slice(startIndex, startIndex + strategy.rangeBars)
  const decisionIndex = startIndex + strategy.rangeBars + strategy.decisionBars - 1
  const decision = dayCandles[decisionIndex]
  if (rangeRows.length !== strategy.rangeBars || !decision) {
    return { today, status: 'waiting_decision', reason: `Range set; waiting for decision candle.` }
  }

  const range = {
    high: Math.max(...rangeRows.map((row) => row.mid.high)),
    low: Math.min(...rangeRows.map((row) => row.mid.low)),
  }
  const rangeSize = range.high - range.low
  if (rangeSize > strategy.maxRange) {
    return { today, status: 'no_trade', reason: `Range ${rangeSize.toFixed(3)} > ${strategy.maxRange}.` }
  }

  const direction = directionFromSetup(strategy, range, decision)
  if (!direction) return { today, status: 'no_trade', reason: 'Decision candle did not break range.' }

  const h1Trend = latestBefore(h1, decision.time)?.trend ?? 'neutral'
  if (!passTrend(direction, h1Trend)) {
    return { today, status: 'no_trade', reason: `H1 trend ${h1Trend} does not match ${direction}.` }
  }

  const entry = strategy.entry === 'mid'
    ? (range.high + range.low) / 2
    : direction === 'long'
      ? range.high
      : range.low
  const stop = direction === 'long' ? entry - strategy.stop : entry + strategy.stop
  const target = direction === 'long' ? entry + strategy.target : entry - strategy.target
  const cutoffMinute = strategy.rangeStart + ((strategy.rangeBars + strategy.decisionBars - 1) * 5) + (strategy.entryWindowBars * 5)
  const nowMinute = localMinutes(new Date(), strategy.timeZone)
  if (nowMinute >= cutoffMinute) return { today, status: 'stale', reason: `Past ${minutesToHm(cutoffMinute)} ${strategy.timeZone} entry cutoff.` }

  const [cutoffHour, cutoffMin] = minutesToHm(cutoffMinute).split(':').map(Number)
  const gtdTime = localDateTimeToUtc(today, cutoffHour, cutoffMin, strategy.timeZone)
  return {
    today,
    status: 'signal',
    signal: { direction, entry, stop, target, gtdTime, range: rangeSize, h1Trend },
  }
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
  const gbpMid = Number.isFinite(gbpBid + gbpAsk) ? (gbpBid + gbpAsk) / 2 : 1
  return {
    nav: Number(summary.account.NAV),
    marginAvailable: Number(summary.account.marginAvailable ?? summary.account.NAV),
    usdToGbp: 1 / gbpMid,
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

async function closeTrade(trade, reason) {
  if (DRY) {
    log(`${trade.id}: DRY RUN - would close scalp trade, ${reason}.`)
    return
  }
  await api(`/v3/accounts/${ACCOUNT_ID}/trades/${trade.id}/close`, { method: 'PUT', body: JSON.stringify({ units: 'ALL' }) })
  log(`${trade.id}: DEMO TRADE CLOSED (${reason}).`)
}

async function manageTimeouts(openTrades) {
  const now = Date.now()
  for (const trade of openTrades) {
    const clientId = trade.clientExtensions?.id ?? ''
    if (!clientId.startsWith(TAG)) continue
    const strategyId = clientId.split('_').slice(3, -2).join('_')
    const strategy = STRATEGIES.find((item) => clientId.includes(item.id))
    if (!strategy) continue
    const openTime = new Date(trade.openTime).getTime()
    const maxMs = strategy.maxHoldBars * 5 * 60 * 1000
    if (Number.isFinite(openTime) && now - openTime >= maxMs) {
      await closeTrade(trade, `max hold ${strategy.maxHoldBars * 5}m reached`)
    }
  }
}

async function placeLimitOrder({ strategy, signal, today, pendingOrders }) {
  const clientId = `${TAG}_${strategy.id}_${today.replaceAll('-', '')}_${signal.direction.toUpperCase()}`
  const existing = pendingOrders.some((order) => order.clientExtensions?.id === clientId)
  if (existing) {
    log(`${strategy.id} ${today}: pending order already exists (${clientId}).`)
    return { placed: false, existing: true, clientId }
  }

  const sizing = await fetchSizingContext()
  const riskBudget = sizing.nav * RISK_PCT
  const riskUnits = riskBudget / (strategy.stop * sizing.usdToGbp)
  const marginUnits = (sizing.marginAvailable * MARGIN_BUFFER_PCT) / (signal.entry * sizing.usdToGbp * sizing.marginRate)
  const units = floorUnits(Math.min(riskUnits, marginUnits), sizing.tradeUnitsPrecision)
  if (units < sizing.minimumTradeSize) {
    log(`${strategy.id} ${today}: SKIP, size below minimum. riskUnits ${riskUnits.toFixed(1)} marginUnits ${marginUnits.toFixed(1)}.`)
    return { placed: false, clientId }
  }

  log(
    `${strategy.id} ${signal.direction.toUpperCase()} limit @ ${signal.entry.toFixed(INSTRUMENT.priceDp)} ` +
    `SL ${signal.stop.toFixed(INSTRUMENT.priceDp)} TP ${signal.target.toFixed(INSTRUMENT.priceDp)} ` +
    `range ${signal.range.toFixed(INSTRUMENT.priceDp)} H1 ${signal.h1Trend} NAV ${sizing.nav.toFixed(2)} ` +
    `units ${units.toFixed(1)} riskUnits ${riskUnits.toFixed(1)} marginUnits ${marginUnits.toFixed(1)} expires ${signal.gtdTime.toISOString()}`,
  )

  if (DRY) {
    log(`${strategy.id}: DRY RUN - no Demo scalp order placed. Use --trade to place orders.`)
    return { placed: false, dryRun: true, clientId }
  }

  const body = {
    order: {
      type: 'LIMIT',
      instrument: INSTRUMENT.symbol,
      units: String(signal.direction === 'long' ? units : -units),
      price: signal.entry.toFixed(INSTRUMENT.priceDp),
      timeInForce: 'GTD',
      gtdTime: signal.gtdTime.toISOString(),
      positionFill: 'DEFAULT',
      stopLossOnFill: { price: signal.stop.toFixed(INSTRUMENT.priceDp), timeInForce: 'GTC' },
      takeProfitOnFill: { price: signal.target.toFixed(INSTRUMENT.priceDp), timeInForce: 'GTC' },
      clientExtensions: {
        id: clientId,
        tag: TAG,
        comment: `${strategy.label} Demo paper scalp`,
      },
      tradeClientExtensions: {
        id: clientId,
        tag: TAG,
        comment: `${strategy.label} Demo paper scalp`,
      },
    },
  }
  const response = await api(`/v3/accounts/${ACCOUNT_ID}/orders`, { method: 'POST', body: JSON.stringify(body) })
  const order = response.orderCreateTransaction
  log(`${strategy.id}: DEMO SCALP ORDER CREATED ${order?.id ?? '?'} (${clientId}).`)
  return { placed: true, clientId, orderId: order?.id }
}

let lastStatus = ''
async function scan() {
  const [pendingOrders, openTrades, m5, h1Raw] = await Promise.all([
    fetchPendingOrders(),
    fetchOpenTrades(),
    fetchCandles(INSTRUMENT.symbol, 'M5', 600, 'BA'),
    fetchCandles(INSTRUMENT.symbol, 'H1', 200, 'M'),
  ])
  await manageTimeouts(openTrades)
  const h1 = addH1Trend(h1Raw)
  const state = loadState()
  const todayState = state[new Date().toISOString().slice(0, 10)] ?? {}
  const statusLines = []

  for (const strategy of STRATEGIES) {
    const detected = detectSignal({ strategy, m5, h1 })
    if (detected.status !== 'signal') {
      statusLines.push(`${strategy.id}: ${detected.reason}`)
      continue
    }
    if (todayState[strategy.id]?.clientId) {
      statusLines.push(`${strategy.id}: already handled today (${todayState[strategy.id].clientId}).`)
      continue
    }
    const result = await placeLimitOrder({ strategy, signal: detected.signal, today: detected.today, pendingOrders })
    if (result.placed || result.dryRun || result.existing) {
      state[detected.today] = {
        ...(state[detected.today] ?? {}),
        [strategy.id]: {
          clientId: result.clientId,
          placed: Boolean(result.placed),
          existing: Boolean(result.existing),
          dryRun: Boolean(result.dryRun),
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

log(`Gold scalp demo paper runner starting - ${STRATEGIES.length} strategies on OANDA Demo account ${ACCOUNT_ID} risk ${RISK_PCT * 100}%/signal${DRY ? ' - DRY RUN' : ' - DEMO ORDERS ENABLED'}`)

do {
  try {
    await scan()
  } catch (error) {
    log(`ERROR: ${error.message}`)
  }
  if (ONCE) break
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
} while (true)
