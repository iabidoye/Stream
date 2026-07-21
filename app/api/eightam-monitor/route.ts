import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
const root = process.cwd()
const strategyTags = new Set(['EIGHT_AM_NY_OPT', 'GOLD_100_PAPER', 'GOLD_SCALP_PAPER'])
const liveApprovedStrategyIds = new Set([
  'EIGHT_AM_NY_OPT',
  'ASIA_0000_0100_B_SL60_TP6_R20',
  'LONDON_1000_1130_M_SL60_TP8_R8',
  'UTC_1200_1330_B_SL60_TP12_R15',
  'NY_0800_0930_B_SL60_TP12_R20',
])

const configuredSessionOrder = new Map([
  ['ASIA_0000_0100_B_SL60_TP6_R20', 10],
  ['LONDON_1000_1130_M_SL60_TP8_R8', 20],
  ['EIGHT_AM_NY_OPT', 30],
  ['GOLD_100_NY_UTC_COMBINED', 40],
  ['UTC_1200_1330_B_SL60_TP12_R15', 40],
  ['NY_0800_0930_B_SL60_TP12_R20', 50],
  ['SCALP_ASIA_0000_R3_B_SL10_TP2_H1MATCH', 110],
  ['SCALP_LONDON_0800_R1_M_SL10_TP2_H1MATCH', 120],
  ['SCALP_NY_0900_R1_B_SL10_TP2_H1MATCH', 130],
  ['SCALP_UTC_1400_R1_M_SL10_TP2_H1MATCH', 140],
])

const monitoredStrategies = [
  {
    id: 'EIGHT_AM_NY_OPT',
    family: '8AM NY Optimised',
    label: '8AM NY Optimised',
    session: 'New York',
    group: 'New York',
    groupOrder: 2,
    timeZone: 'America/New_York',
    instruments: ['XAU_USD', 'XAG_USD'],
    setup: '08:00 range breakout -> 09:30 confirmation -> boundary retest',
    rangeStart: 8 * 60,
    decisionDelay: 90,
    entryCutoffDelay: 240,
    sessionStart: 8 * 60,
    sessionEnd: 17 * 60,
    risk: '50%',
  },
  {
    id: 'ASIA_0000_0100_B_SL60_TP6_R20',
    family: 'Gold 100',
    label: 'Asian UTC 00:00->01:00',
    session: 'Asian',
    group: 'Asian',
    groupOrder: 4,
    timeZone: 'UTC',
    instruments: ['XAU_USD'],
    setup: '00:00 range breakout -> 01:00 confirmation -> boundary retest',
    rangeStart: 0,
    decisionDelay: 60,
    entryCutoffDelay: 240,
    sessionStart: 0,
    sessionEnd: 4 * 60,
    risk: '50%',
  },
  {
    id: 'LONDON_1000_1130_M_SL60_TP8_R8',
    family: 'Gold 100',
    label: 'London 10:00->11:30',
    session: 'London',
    group: 'London',
    groupOrder: 1,
    timeZone: 'Europe/London',
    instruments: ['XAU_USD'],
    setup: '10:00 range breakout -> 11:30 confirmation -> midpoint retest',
    rangeStart: 10 * 60,
    decisionDelay: 90,
    entryCutoffDelay: 240,
    sessionStart: 8 * 60,
    sessionEnd: 16 * 60,
    risk: '50%',
  },
  {
    id: 'UTC_1200_1330_B_SL60_TP12_R15',
    family: 'Gold 100',
    label: 'UTC 12:00->13:30',
    session: 'UTC / New York equivalent',
    group: 'New York',
    groupOrder: 2,
    timeZone: 'UTC',
    instruments: ['XAU_USD'],
    setup: '12:00 range breakout -> 13:30 confirmation -> boundary retest',
    rangeStart: 12 * 60,
    decisionDelay: 90,
    entryCutoffDelay: 240,
    sessionStart: 12 * 60,
    sessionEnd: 16 * 60,
    risk: '50%',
  },
  {
    id: 'NY_0800_0930_B_SL60_TP12_R20',
    family: 'Gold 100',
    label: 'New York 08:00->09:30',
    session: 'New York',
    group: 'New York',
    groupOrder: 2,
    timeZone: 'America/New_York',
    instruments: ['XAU_USD'],
    setup: '08:00 range breakout -> 09:30 confirmation -> boundary retest',
    rangeStart: 8 * 60,
    decisionDelay: 90,
    entryCutoffDelay: 240,
    sessionStart: 8 * 60,
    sessionEnd: 17 * 60,
    risk: '50%',
  },
  {
    id: 'SCALP_ASIA_0000_R3_B_SL10_TP2_H1MATCH',
    family: 'Gold Scalp Paper',
    label: 'Scalp Asian 00:00',
    session: 'Asian',
    group: 'Asian',
    groupOrder: 4,
    timeZone: 'UTC',
    instruments: ['XAU_USD'],
    setup: '00:00 M5 x3 range breakout -> boundary retest -> H1 trend match',
    rangeStart: 0,
    decisionDelay: 15,
    entryCutoffDelay: 75,
    sessionStart: 0,
    sessionEnd: 3 * 60,
    risk: '50%',
  },
  {
    id: 'SCALP_LONDON_0800_R1_M_SL10_TP2_H1MATCH',
    family: 'Gold Scalp Paper',
    label: 'Scalp London 08:00',
    session: 'London',
    group: 'London',
    groupOrder: 1,
    timeZone: 'Europe/London',
    instruments: ['XAU_USD'],
    setup: '08:00 M5 range breakout -> midpoint retest -> H1 trend match',
    rangeStart: 8 * 60,
    decisionDelay: 15,
    entryCutoffDelay: 75,
    sessionStart: 8 * 60,
    sessionEnd: 11 * 60,
    risk: '50%',
  },
  {
    id: 'SCALP_NY_0900_R1_B_SL10_TP2_H1MATCH',
    family: 'Gold Scalp Paper',
    label: 'Scalp New York 09:00',
    session: 'New York',
    group: 'New York',
    groupOrder: 2,
    timeZone: 'America/New_York',
    instruments: ['XAU_USD'],
    setup: '09:00 M5 range breakout -> boundary retest -> H1 trend match',
    rangeStart: 9 * 60,
    decisionDelay: 5,
    entryCutoffDelay: 65,
    sessionStart: 9 * 60,
    sessionEnd: 12 * 60,
    risk: '50%',
  },
  {
    id: 'SCALP_UTC_1400_R1_M_SL10_TP2_H1MATCH',
    family: 'Gold Scalp Paper',
    label: 'Scalp UTC 14:00',
    session: 'UTC Midday',
    group: 'New York',
    groupOrder: 2,
    timeZone: 'UTC',
    instruments: ['XAU_USD'],
    setup: '14:00 M5 range breakout -> midpoint retest -> H1 trend match',
    rangeStart: 14 * 60,
    decisionDelay: 5,
    entryCutoffDelay: 65,
    sessionStart: 14 * 60,
    sessionEnd: 17 * 60,
    risk: '50%',
  },
]

const profiles = {
  demo: {
    key: 'demo',
    label: 'Demo',
    environment: 'practice',
    base: 'https://api-fxpractice.oanda.com',
    token: process.env.OANDA_TOKEN,
    accountId: process.env.OANDA_ACCOUNT_ID,
    logFile: path.join(root, 'logs', 'eightam-ny-optimised-demo.log'),
    extraLogFiles: [path.join(root, 'logs', 'gold-100pct-paper-demo.log'), path.join(root, 'logs', 'gold-scalp-paper-demo.log')],
    legacyLogFile: path.join(root, 'logs', 'eightam-ny-optimised-live.log'),
    stateFile: path.join(root, 'scripts', '.eightam-ny-optimised-demo-state.json'),
    extraStateFiles: [path.join(root, 'scripts', '.gold-100pct-paper-demo-state.json'), path.join(root, 'scripts', '.gold-scalp-paper-demo-state.json')],
    legacyStateFile: path.join(root, 'scripts', '.eightam-ny-optimised-state.json'),
  },
  live: {
    key: 'live',
    label: 'Live',
    environment: 'live',
    base: 'https://api-fxtrade.oanda.com',
    token: process.env.OANDA_LIVE_TOKEN,
    accountId: process.env.OANDA_LIVE_ACCOUNT_ID,
    logFile: path.join(root, 'logs', 'eightam-ny-optimised-live-account.log'),
    extraLogFiles: [path.join(root, 'logs', 'gold-100pct-paper-live.log')],
    stateFile: path.join(root, 'scripts', '.eightam-ny-optimised-live-state.json'),
    extraStateFiles: [path.join(root, 'scripts', '.gold-100pct-paper-live-state.json')],
  },
} as const

type Profile = typeof profiles[keyof typeof profiles]

async function oanda(profile: Profile, pathname: string) {
  if (!profile.token || !profile.accountId) throw new Error(`Missing ${profile.label} credentials`)
  const res = await fetch(`${profile.base}${pathname}`, {
    headers: { Authorization: `Bearer ${profile.token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`OANDA ${res.status}: ${text.slice(0, 300)}`)
  return data
}

async function oandaUrl(profile: Profile, url: string) {
  if (!profile.token) throw new Error(`Missing ${profile.label} credentials`)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${profile.token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`OANDA ${res.status}: ${text.slice(0, 300)}`)
  return data
}

async function recentTransactions(profile: Profile) {
  try {
    const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const index = await oanda(profile, `/v3/accounts/${profile.accountId}/transactions?from=${encodeURIComponent(from)}&pageSize=1000`)
    const pages: string[] = Array.isArray(index.pages) ? index.pages.slice(-3) : []
    const results = await Promise.all(pages.map((page) => oandaUrl(profile, page).catch(() => ({ transactions: [] }))))
    return results.flatMap((page) => Array.isArray(page.transactions) ? page.transactions : [])
  } catch {
    return []
  }
}

function strategyLabelFromText(text: string) {
  const match = monitoredStrategies.find((strategy) => matchesStrategyId(text, strategy))
  return match ? `${match.family} · ${match.label}` : 'Strategy trade'
}

function normalizeTradeHistory(transactions: any[]) {
  const entryByTradeId = new Map<string, {
    tradeId: string
    clientId: string
    strategy: string
    instrument: string
    side: 'Long' | 'Short'
    units: number
    entryPrice: number | null
    entryTime: string
    orderId: string
  }>()

  const rows: Array<{
    id: string
    tradeId: string
    clientId: string
    strategy: string
    instrument: string
    side: 'Long' | 'Short'
    units: number
    entryPrice: number | null
    exitPrice: number | null
    entryTime: string
    exitTime: string
    reason: string
    pl: number
    result: 'Win' | 'Loss' | 'Flat'
    durationMinutes: number | null
  }> = []

  for (const transaction of transactions) {
    if (transaction.type !== 'ORDER_FILL') continue
    const opened = transaction.tradeOpened
    if (opened?.tradeID) {
      const clientId = String(transaction.clientOrderID ?? '')
      if (!monitoredStrategies.some((strategy) => matchesStrategyId(clientId, strategy))) continue
      const units = Number(opened.units ?? transaction.units)
      entryByTradeId.set(String(opened.tradeID), {
        tradeId: String(opened.tradeID),
        clientId,
        strategy: strategyLabelFromText(clientId),
        instrument: String(transaction.instrument ?? ''),
        side: units >= 0 ? 'Long' : 'Short',
        units: Math.abs(units),
        entryPrice: money(opened.price ?? transaction.price),
        entryTime: String(transaction.time ?? ''),
        orderId: String(transaction.orderID ?? ''),
      })
    }
  }

  for (const transaction of transactions) {
    if (transaction.type !== 'ORDER_FILL' || !Array.isArray(transaction.tradesClosed)) continue
    for (const closed of transaction.tradesClosed) {
      const tradeId = String(closed.tradeID ?? '')
      const entry = entryByTradeId.get(tradeId)
      if (!entry) continue
      const pl = Number(closed.realizedPL ?? transaction.pl ?? 0)
      const entryTime = entry?.entryTime ?? ''
      const exitTime = String(transaction.time ?? '')
      const durationMinutes = entryTime && exitTime
        ? Math.max(0, Math.round((new Date(exitTime).getTime() - new Date(entryTime).getTime()) / 60000))
        : null
      rows.push({
        id: String(transaction.id ?? `${tradeId}-${exitTime}`),
        tradeId,
        clientId: entry.clientId,
        strategy: entry.strategy,
        instrument: String(transaction.instrument ?? entry.instrument ?? ''),
        side: entry.side,
        units: Math.abs(Number(closed.units ?? entry.units ?? 0)),
        entryPrice: entry.entryPrice,
        exitPrice: money(closed.price ?? transaction.price),
        entryTime,
        exitTime,
        reason: String(transaction.reason ?? ''),
        pl: Number.isFinite(pl) ? pl : 0,
        result: pl > 0 ? 'Win' : pl < 0 ? 'Loss' : 'Flat',
        durationMinutes,
      })
    }
  }

  return rows.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime())
}

function performanceSummary(tradeHistory: ReturnType<typeof normalizeTradeHistory>) {
  const closed = tradeHistory.length
  const wins = tradeHistory.filter((trade) => trade.pl > 0).length
  const losses = tradeHistory.filter((trade) => trade.pl < 0).length
  const flats = closed - wins - losses
  const totalPL = tradeHistory.reduce((sum, trade) => sum + trade.pl, 0)
  return {
    closed,
    wins,
    losses,
    flats,
    winRate: closed ? (wins / closed) * 100 : null,
    totalPL,
  }
}

async function readTail(file: string, lines = 80) {
  try {
    const text = await fs.readFile(file, 'utf8')
    return text.trim().split(/\r?\n/).filter(Boolean).slice(-lines)
  } catch {
    return []
  }
}

async function readTailWithFallback(profile: Profile) {
  const primary = await readTail(profile.logFile)
  const extra = 'extraLogFiles' in profile
    ? (await Promise.all(profile.extraLogFiles.map((file) => readTail(file, 50)))).flat()
    : []
  if (primary.length || extra.length || !('legacyLogFile' in profile)) return [...primary, ...extra].slice(-100)
  return readTail(profile.legacyLogFile)
}

async function readJson(file: string) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function readState(profile: Profile) {
  const primary = await readJson(profile.stateFile)
  const extra = 'extraStateFiles' in profile
    ? Object.assign({}, ...(await Promise.all(profile.extraStateFiles.map((file) => readJson(file)))).filter(Boolean))
    : null
  if (primary || extra || !('legacyStateFile' in profile)) return { ...(primary ?? {}), ...(extra ?? {}) }
  return readJson(profile.legacyStateFile)
}

async function botStatus(profileKey: 'demo' | 'live') {
  if (process.env.VERCEL) {
    return {
      available: false,
      running: false,
      processes: [],
      note: 'Bot process status is only available on the local Mac/VPS that runs the strategy worker.',
    }
  }
  try {
    const outputs = await Promise.all([
      execFileAsync('pgrep', ['-fl', 'eightam-ny-optimised-live'], { timeout: 2000 }).then(({ stdout }) => stdout).catch(() => ''),
      execFileAsync('pgrep', ['-fl', 'gold-100pct-paper-demo'], { timeout: 2000 }).then(({ stdout }) => stdout).catch(() => ''),
      execFileAsync('pgrep', ['-fl', 'gold-scalp-paper-demo'], { timeout: 2000 }).then(({ stdout }) => stdout).catch(() => ''),
    ])
    const all = outputs.join('\n').trim().split(/\r?\n/).filter(Boolean)
    const processes = all.filter((line) => {
      const isLive = line.includes('--account=live') || line.includes('eightam-live')
      const isDemo = line.includes('--account=demo') || line.includes('eightam-demo')
      const isGoldPaper = line.includes('gold-100pct-paper-demo')
      const isGoldPaperLive = isGoldPaper && (line.includes('--account=live') || line.includes('gold100-live'))
      const isGoldPaperDemo = isGoldPaper && (line.includes('--account=demo') || line.includes('gold100-demo'))
      const isGoldScalpDemo = line.includes('gold-scalp-paper-demo') || line.includes('goldscalp-demo')
      if (profileKey === 'demo' && (isGoldPaperDemo || isGoldScalpDemo)) return true
      if (profileKey === 'live') return isLive || isGoldPaperLive
      return isDemo
    })
    return { available: true, running: processes.length > 0, processes }
  } catch {
    return { available: true, running: false, processes: [] }
  }
}

function money(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeOrders(orders: any[]) {
  return orders
    .filter((order) => !order.clientExtensions?.tag || strategyTags.has(order.clientExtensions.tag))
    .map((order) => ({
      id: order.id,
      createTime: order.createTime,
      instrument: order.instrument,
      type: order.type,
      state: order.state,
      units: Number(order.units),
      price: money(order.price),
      timeInForce: order.timeInForce,
      gtdTime: order.gtdTime ?? null,
      tag: order.clientExtensions?.tag ?? '',
      comment: order.clientExtensions?.comment ?? '',
      clientId: order.clientExtensions?.id ?? '',
      stopLoss: money(order.stopLossOnFill?.price),
      takeProfit: money(order.takeProfitOnFill?.price),
    }))
}

function normalizeTrades(trades: any[]) {
  return trades.map((trade) => ({
    id: trade.id,
    openTime: trade.openTime,
    instrument: trade.instrument,
    currentUnits: Number(trade.currentUnits),
    price: money(trade.price),
    unrealizedPL: money(trade.unrealizedPL),
    realizedPL: money(trade.realizedPL),
    marginUsed: money(trade.marginUsed),
    state: trade.state,
    tag: trade.clientExtensions?.tag ?? '',
    comment: trade.clientExtensions?.comment ?? '',
    clientId: trade.clientExtensions?.id ?? '',
    stopLoss: money(trade.stopLossOrder?.price),
    takeProfit: money(trade.takeProfitOrder?.price),
  }))
}

function normalizePrices(prices: any[]) {
  return prices.map((price) => {
    const bid = Number(price.bids?.[0]?.price)
    const ask = Number(price.asks?.[0]?.price)
    return {
      instrument: price.instrument,
      time: price.time,
      bid,
      ask,
      mid: Number.isFinite(bid + ask) ? (bid + ask) / 2 : null,
      spread: Number.isFinite(bid + ask) ? ask - bid : null,
      tradeable: price.tradeable,
    }
  })
}

function hm(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function localParts(date: Date, timeZone: string) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]))
}

function localNumericParts(date: Date, timeZone: string) {
  const raw = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    hour: Number(raw.hour),
    minute: Number(raw.minute),
  }
}

function localMinutes(date: Date, timeZone: string) {
  const parts = localParts(date, timeZone)
  return Number(parts.hour) * 60 + Number(parts.minute)
}

function localDayKey(date: Date, timeZone: string) {
  const parts = localNumericParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function localStamp(date: Date, timeZone: string) {
  const parts = localParts(date, timeZone)
  return `${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`
}

function utcHmForLocalMinute(date: Date, timeZone: string, minute: number) {
  const base = localNumericParts(date, timeZone)
  const dayOffset = Math.floor(minute / 1440)
  const normalized = ((minute % 1440) + 1440) % 1440
  const targetLocalMs = Date.UTC(
    base.year,
    base.month - 1,
    base.day + dayOffset,
    Math.floor(normalized / 60),
    normalized % 60,
  )
  let guess = new Date(targetLocalMs)
  for (let i = 0; i < 4; i += 1) {
    const got = localNumericParts(guess, timeZone)
    const gotLocalMs = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute)
    const diff = targetLocalMs - gotLocalMs
    if (diff === 0) break
    guess = new Date(guess.getTime() + diff)
  }
  return `${String(guess.getUTCHours()).padStart(2, '0')}:${String(guess.getUTCMinutes()).padStart(2, '0')}`
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function minutesUntil(currentMinute: number, targetMinute: number) {
  const diff = targetMinute - currentMinute
  return diff >= 0 ? diff : diff + 1440
}

function waitLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours && mins) return `${hours}h ${mins}m`
  if (hours) return `${hours}h`
  return `${mins}m`
}

function inMinuteWindow(currentMinute: number, startMinute: number, endMinute: number) {
  if (startMinute === endMinute) return false
  if (startMinute < endMinute) return currentMinute >= startMinute && currentMinute < endMinute
  return currentMinute >= startMinute || currentMinute < endMinute
}

function matchesStrategyId(text: string, strategy: typeof monitoredStrategies[number]) {
  if (!text) return false
  if (strategy.id === 'EIGHT_AM_NY_OPT') return text.includes('EIGHT_AM_NY_OPT') || text.includes('8AM')
  return text.includes(strategy.id)
}

function stateHandledToday(state: Record<string, unknown> | null, dayKey: string, strategyId: string) {
  const day = state?.[dayKey]
  return Boolean(day && typeof day === 'object' && strategyId in day)
}

function transactionHandledToday(transactions: any[], dayKey: string, strategyId: string) {
  const compactDay = dayKey.replaceAll('-', '')
  return transactions.some((transaction) => {
    const text = JSON.stringify(transaction)
    return text.includes(strategyId) && text.includes(compactDay)
  })
}

function displayToneRank(tone: 'green' | 'gold' | 'blue' | 'muted') {
  return { green: 4, gold: 3, blue: 2, muted: 1 }[tone]
}

function displayPhaseRank(phase: string) {
  if (phase === 'Trade open') return 7
  if (phase === 'Order pending') return 6
  if (phase === 'Handled today') return 5
  if (phase === 'Entry window') return 4
  if (phase === 'Decision candle forming') return 3
  if (phase === 'Waiting confirmation' || phase === 'Range candle forming') return 2
  if (phase === 'Pre-session build-up' || phase === 'Session open') return 1
  return 0
}

function mergeEquivalentGoldWindows<T extends {
  id: string
  family: string
  label: string
  session: string
  group: string
  groupOrder: number
  instruments: string[]
  setup: string
  setupPct: number
  phase: string
  detail: string
  atPlay: boolean
  sessionActive: boolean
  nextRangeMinutes: number
  tone: 'green' | 'gold' | 'blue' | 'muted'
  risk: string
  window: {
    range: string
    decision: string
    cutoff: string
    utcRange: string
    utcDecision: string
    utcCutoff: string
  }
}>(rows: T[]): T[] {
  const mergeIds = new Set(['UTC_1200_1330_B_SL60_TP12_R15', 'NY_0800_0930_B_SL60_TP12_R20'])
  const out: T[] = []
  const buckets = new Map<string, T[]>()

  for (const row of rows) {
    if (!mergeIds.has(row.id)) {
      out.push(row)
      continue
    }
    const key = [
      row.family,
      row.instruments.join(','),
      row.window.utcRange,
      row.window.utcDecision,
      row.window.utcCutoff,
    ].join('|')
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(row)
  }

  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      out.push(bucket[0])
      continue
    }

    const primary = [...bucket].sort((a, b) => (
      displayPhaseRank(b.phase) - displayPhaseRank(a.phase)
      || b.setupPct - a.setupPct
      || displayToneRank(b.tone) - displayToneRank(a.tone)
      || (a.id === 'NY_0800_0930_B_SL60_TP12_R20' ? -1 : 1)
    ))[0]
    const ny = bucket.find((row) => row.id === 'NY_0800_0930_B_SL60_TP12_R20')
    const utc = bucket.find((row) => row.id === 'UTC_1200_1330_B_SL60_TP12_R15')
    const tone = [...bucket].sort((a, b) => displayToneRank(b.tone) - displayToneRank(a.tone))[0].tone
    const phase = [...bucket].sort((a, b) => displayPhaseRank(b.phase) - displayPhaseRank(a.phase))[0].phase

    out.push({
      ...primary,
      id: 'GOLD_100_NY_UTC_COMBINED',
      label: `${ny?.label ?? 'New York 08:00->09:30'} / ${utc?.label ?? 'UTC 12:00->13:30'}`,
      session: 'New York / UTC equivalent',
      group: 'New York',
      groupOrder: 2,
      setup: `${ny?.setup ?? primary.setup}; duplicate UTC equivalent is joined and deduped before order placement`,
      setupPct: Math.max(...bucket.map((row) => row.setupPct)),
      phase,
      detail: phase === 'Handled today'
        ? 'Equivalent UTC and New York window handled as one trade opportunity'
        : primary.detail,
      atPlay: bucket.some((row) => row.atPlay),
      sessionActive: bucket.some((row) => row.sessionActive),
      nextRangeMinutes: Math.min(...bucket.map((row) => row.nextRangeMinutes)),
      tone,
      risk: '50% max; one live trade only',
    })
  }

  return out
}

function buildStrategyStatus(
  profileKey: 'demo' | 'live',
  pendingOrders: ReturnType<typeof normalizeOrders>,
  openTrades: ReturnType<typeof normalizeTrades>,
  state: Record<string, unknown> | null,
  transactions: any[],
) {
  const now = new Date()
  const visibleStrategies = profileKey === 'live'
    ? monitoredStrategies.filter((strategy) => liveApprovedStrategyIds.has(strategy.id))
    : monitoredStrategies

  const rows = visibleStrategies.map((strategy) => {
    const dayKey = localDayKey(now, strategy.timeZone)
    const currentMinute = localMinutes(now, strategy.timeZone)
    const decisionMinute = strategy.rangeStart + strategy.decisionDelay
    const decisionEndMinute = decisionMinute + 15
    const cutoffMinute = strategy.rangeStart + strategy.entryCutoffDelay
    const rangeEndMinute = strategy.rangeStart + 15
    const sessionActive = inMinuteWindow(currentMinute, strategy.sessionStart, strategy.sessionEnd)
    const nextRangeMinutes = minutesUntil(currentMinute, strategy.rangeStart)
    const openTrade = openTrades.find((trade) => {
      const text = `${trade.clientId ?? ''} ${trade.tag ?? ''} ${trade.comment ?? ''}`
      return strategy.instruments.includes(trade.instrument) && matchesStrategyId(text, strategy)
    })
    const pendingOrder = pendingOrders.find((order) => {
      const text = `${order.clientId ?? ''} ${order.tag ?? ''} ${order.comment ?? ''}`
      return strategy.instruments.includes(order.instrument) && matchesStrategyId(text, strategy)
    })
    const handledToday = stateHandledToday(state, dayKey, strategy.id) || transactionHandledToday(transactions, dayKey, strategy.id)

    let phase = 'Waiting'
    let detail = `Next range candle at ${hm(strategy.rangeStart)} ${strategy.timeZone}`
    let setupPct = 0
    let atPlay = false
    let tone: 'green' | 'gold' | 'blue' | 'muted' = 'muted'

    if (openTrade) {
      phase = 'Trade open'
      detail = `${openTrade.instrument} ${Number(openTrade.currentUnits) > 0 ? 'long' : 'short'} is live`
      setupPct = 100
      atPlay = true
      tone = 'green'
    } else if (pendingOrder) {
      phase = 'Order pending'
      detail = `${pendingOrder.instrument} ${Number(pendingOrder.units) > 0 ? 'long' : 'short'} limit waiting at ${pendingOrder.price ?? '-'}`
      setupPct = 100
      atPlay = true
      tone = 'gold'
    } else if (handledToday) {
      phase = 'Handled today'
      detail = `Today's ${strategy.session} signal has already been handled; waiting for the next session`
      setupPct = 100
      tone = 'green'
    } else if (nextRangeMinutes <= 60 && (currentMinute < strategy.rangeStart || currentMinute >= cutoffMinute)) {
      phase = 'Pre-session build-up'
      detail = `${strategy.session} range starts at ${hm(strategy.rangeStart)} in ${waitLabel(nextRangeMinutes)}`
      setupPct = clamp(((60 - nextRangeMinutes) / 60) * 20, 1, 20)
      atPlay = true
      tone = 'blue'
    } else if (currentMinute >= strategy.rangeStart && currentMinute < rangeEndMinute) {
      phase = 'Range candle forming'
      detail = `Building the ${hm(strategy.rangeStart)} setup candle`
      setupPct = clamp(((currentMinute - strategy.rangeStart) / Math.max(1, rangeEndMinute - strategy.rangeStart)) * 25)
      atPlay = true
      tone = 'blue'
    } else if (currentMinute >= rangeEndMinute && currentMinute < decisionMinute) {
      phase = 'Waiting confirmation'
      detail = `Range set; waiting for ${hm(decisionMinute)} decision candle`
      setupPct = clamp(25 + ((currentMinute - rangeEndMinute) / Math.max(1, decisionMinute - rangeEndMinute)) * 40)
      atPlay = true
      tone = 'blue'
    } else if (currentMinute >= decisionMinute && currentMinute < decisionEndMinute) {
      phase = 'Decision candle forming'
      detail = `${hm(decisionMinute)} candle is forming; bot can act after it closes at ${hm(decisionEndMinute)}`
      setupPct = clamp(65 + ((currentMinute - decisionMinute) / Math.max(1, decisionEndMinute - decisionMinute)) * 10)
      atPlay = true
      tone = 'blue'
    } else if (currentMinute >= decisionEndMinute && currentMinute < cutoffMinute) {
      phase = 'Entry window'
      detail = `Decision window active until ${hm(cutoffMinute)}`
      setupPct = clamp(75 + ((currentMinute - decisionEndMinute) / Math.max(1, cutoffMinute - decisionEndMinute)) * 25)
      atPlay = true
      tone = 'gold'
    } else if (currentMinute >= cutoffMinute) {
      phase = nextRangeMinutes <= 240 ? 'Waiting next setup' : 'Closed today'
      detail = nextRangeMinutes <= 240
        ? `Next ${strategy.session} range starts at ${hm(strategy.rangeStart)} in ${waitLabel(nextRangeMinutes)}`
        : `Today's entry cutoff passed at ${hm(cutoffMinute)}`
      setupPct = 0
      tone = 'muted'
    } else if (sessionActive) {
      phase = 'Session open'
      detail = `${strategy.session} session is open; strategy range starts at ${hm(strategy.rangeStart)}`
      setupPct = 0
      atPlay = true
      tone = 'blue'
    }

    return {
      id: strategy.id,
      family: strategy.family,
      label: strategy.label,
      session: strategy.session,
      group: strategy.group,
      groupOrder: strategy.groupOrder,
      timeZone: strategy.timeZone,
      localTime: localStamp(now, strategy.timeZone),
      instruments: strategy.instruments,
      setup: strategy.setup,
      setupPct: Math.round(setupPct),
      phase,
      detail,
      atPlay,
      sessionActive,
      nextRangeMinutes,
      tone,
      risk: strategy.risk,
      window: {
        range: `${hm(strategy.rangeStart)}-${hm(rangeEndMinute)}`,
        decision: `${hm(decisionMinute)}-${hm(decisionEndMinute)}`,
        cutoff: hm(cutoffMinute),
        utcRange: `${utcHmForLocalMinute(now, strategy.timeZone, strategy.rangeStart)}-${utcHmForLocalMinute(now, strategy.timeZone, rangeEndMinute)}`,
        utcDecision: `${utcHmForLocalMinute(now, strategy.timeZone, decisionMinute)}-${utcHmForLocalMinute(now, strategy.timeZone, decisionEndMinute)}`,
        utcCutoff: utcHmForLocalMinute(now, strategy.timeZone, cutoffMinute),
      },
    }
  })

  return mergeEquivalentGoldWindows(rows).sort((a, b) => (
    (configuredSessionOrder.get(a.id) ?? 999) - (configuredSessionOrder.get(b.id) ?? 999)
    || a.groupOrder - b.groupOrder
    || a.nextRangeMinutes - b.nextRangeMinutes
    || a.label.localeCompare(b.label)
  ))
}

async function loadProfile(profile: Profile) {
  const [logs, state, bot] = await Promise.all([
    readTailWithFallback(profile),
    readState(profile),
    botStatus(profile.key),
  ])

  if (!profile.token || !profile.accountId) {
    const missing = [
      !profile.token ? `${profile.key === 'live' ? 'OANDA_LIVE_TOKEN' : 'OANDA_TOKEN'}` : '',
      !profile.accountId ? `${profile.key === 'live' ? 'OANDA_LIVE_ACCOUNT_ID' : 'OANDA_ACCOUNT_ID'}` : '',
    ].filter(Boolean)
    return {
      key: profile.key,
      label: profile.label,
      environment: profile.environment,
      configured: false,
      generatedAt: new Date().toISOString(),
      bot,
      logs,
      state,
      error: `Add ${missing.join(' and ')} to .env.local.`,
      account: null,
      prices: [],
      pendingOrders: [],
      openTrades: [],
      tradeHistory: [],
      performance: performanceSummary([]),
    }
  }

  let summary
  let pending
  let openTrades
  let pricing
  let transactions: any[] = []
  try {
    ;[summary, pending, openTrades, pricing, transactions] = await Promise.all([
      oanda(profile, `/v3/accounts/${profile.accountId}/summary`),
      oanda(profile, `/v3/accounts/${profile.accountId}/pendingOrders`),
      oanda(profile, `/v3/accounts/${profile.accountId}/openTrades`),
      oanda(profile, `/v3/accounts/${profile.accountId}/pricing?instruments=XAU_USD,XAG_USD`),
      recentTransactions(profile),
    ])
  } catch (err) {
    return {
      key: profile.key,
      label: profile.label,
      environment: profile.environment,
      configured: true,
      generatedAt: new Date().toISOString(),
      account: null,
      bot,
      prices: [],
      pendingOrders: [],
      openTrades: [],
      tradeHistory: [],
      performance: performanceSummary([]),
      state,
      logs,
      error: String(err),
    }
  }

  const account = summary.account
  const pendingOrders = normalizeOrders(pending.orders ?? [])
  const openTradeRows = normalizeTrades(openTrades.trades ?? [])
  const tradeHistory = normalizeTradeHistory(transactions)
  return {
    key: profile.key,
    label: profile.label,
    environment: profile.environment,
    configured: true,
    generatedAt: new Date().toISOString(),
    account: {
      id: account.id,
      alias: account.alias,
      currency: account.currency,
      balance: money(account.balance),
      nav: money(account.NAV),
      unrealizedPL: money(account.unrealizedPL),
      pl: money(account.pl),
      marginUsed: money(account.marginUsed),
      marginAvailable: money(account.marginAvailable),
      openTradeCount: Number(account.openTradeCount ?? 0),
      pendingOrderCount: Number(account.pendingOrderCount ?? 0),
    },
    bot,
    prices: normalizePrices(pricing.prices ?? []),
    pendingOrders,
    openTrades: openTradeRows,
    tradeHistory,
    performance: performanceSummary(tradeHistory),
    strategyStatus: buildStrategyStatus(profile.key, pendingOrders, openTradeRows, state, transactions),
    state,
    logs,
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const account = url.searchParams.get('account')

    if (account === 'demo' || account === 'live') {
      return NextResponse.json(await loadProfile(profiles[account]))
    }

    const [demo, live] = await Promise.all([
      loadProfile(profiles.demo),
      loadProfile(profiles.live),
    ])
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      runtime: process.env.VERCEL ? 'vercel' : 'local',
      profiles: { demo, live },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
