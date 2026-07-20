export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  complete?: boolean
}

export interface ValueArea {
  vah: number
  val: number
  poc: number
  orHigh: number
  orLow: number
  orBars: number
}

export interface FCVLevels {
  orOpen: number
  orHigh: number
  orMid: number
  orLow: number
  orClose: number
  orRange: number
  orBars: number
}

export interface LNDBLevels {
  londonHigh: number
  londonLow: number
  londonRange: number
  londonBars: number
}

export type SignalType = 'TRAP' | 'CONT'

export interface Signal {
  type: SignalType
  label: string
  time: number
  entryPrice: number
  stopPrice: number
  targetPrice?: number  // TP1 (1R)
  target2?: number      // TP2 (2R)
  target3?: number      // TP3 (3R)
}

export interface QuantFalseBreakData {
  rangeHigh: number
  rangeLow: number
  rangeBars: number
  atr: number
  atrThreshold: number
  buffer: number
  targetAtr: number
  stopAtr: number
  maxTrades: number
  activeWindow: boolean
  tradesToday: number
  signals: Signal[]
  invalidation: string
}

// ─── Time helpers ──────────────────────────────────────────────────────────────
function toNYDate(ts: number) {
  return new Date(new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' }))
}
function toCentralDate(ts: number) {
  return new Date(new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago' }))
}

// ─── Opening Range helpers (M1) ───────────────────────────────────────────────
export function getORCandles(
  candles: Candle[],
  sessionHour: number,
  sessionMinute: number,
  durationMinutes = 15,
): Candle[] {
  if (!candles.length) return []
  const lastNY = toNYDate(candles[candles.length - 1].time)
  const [y, m, d] = [lastNY.getFullYear(), lastNY.getMonth(), lastNY.getDate()]
  const startMins = sessionHour * 60 + sessionMinute
  const endMins   = startMins + durationMinutes
  return candles.filter(c => {
    const ny = toNYDate(c.time)
    if (ny.getFullYear() !== y || ny.getMonth() !== m || ny.getDate() !== d) return false
    const mins = ny.getHours() * 60 + ny.getMinutes()
    return mins >= startMins && mins < endMins
  })
}

// ─── OR Volume Profile ─────────────────────────────────────────────────────────
export function computeValueArea(orCandles: Candle[], vaPct = 70): ValueArea {
  const orHigh = Math.max(...orCandles.map(c => c.high))
  const orLow  = Math.min(...orCandles.map(c => c.low))
  const bars   = orCandles.map(c => ({ mid: (c.high + c.low) / 2, vol: Math.max(c.volume, 1) }))
  const total  = bars.reduce((s, b) => s + b.vol, 0)
  const target = total * (vaPct / 100)
  const sorted = [...bars].sort((a, b) => b.vol - a.vol)
  const poc    = sorted[0].mid
  let cum = 0, vaHi = poc, vaLo = poc
  for (const b of sorted) {
    if (cum >= target) break
    cum += b.vol; vaHi = Math.max(vaHi, b.mid); vaLo = Math.min(vaLo, b.mid)
  }
  return { vah: vaHi, val: vaLo, poc, orHigh, orLow, orBars: orCandles.length }
}

export function detectSignals(postOrCandles: Candle[], va: ValueArea): Signal[] {
  const signals: Signal[] = []
  const seen = new Set<number>()
  for (let i = 2; i < postOrCandles.length; i++) {
    const c = postOrCandles[i], p1 = postOrCandles[i-1], p2 = postOrCandles[i-2]
    if (seen.has(c.time)) continue
    if (c.high > va.vah && c.close < va.vah && c.close > va.val) {
      const entry = c.close, stop = c.high, r = stop - entry
      signals.push({
        type: 'TRAP', label: 'TRAP SHORT', time: c.time,
        entryPrice: entry, stopPrice: stop,
        targetPrice: entry - r, target2: entry - 2 * r, target3: entry - 3 * r,
      })
      seen.add(c.time); continue
    }
    if ((p1.close > va.vah || p2.close > va.vah) && c.low <= va.vah && c.close >= va.vah) {
      const entry = c.close, stop = c.low, r = entry - stop
      signals.push({
        type: 'CONT', label: 'CONT LONG', time: c.time,
        entryPrice: entry, stopPrice: stop,
        targetPrice: entry + r, target2: entry + 2 * r, target3: entry + 3 * r,
      })
      seen.add(c.time)
    }
  }
  return signals.sort((a, b) => a.time - b.time)
}

// ─── First Candle Value ────────────────────────────────────────────────────────
export function computeFCVLevels(orCandles: Candle[]): FCVLevels {
  const orOpen  = orCandles[0].open
  const orHigh  = Math.max(...orCandles.map(c => c.high))
  const orLow   = Math.min(...orCandles.map(c => c.low))
  const orClose = orCandles[orCandles.length - 1].close
  return { orOpen, orHigh, orLow, orClose, orMid: (orHigh + orLow) / 2, orRange: orHigh - orLow, orBars: orCandles.length }
}

export function detectFCVSignals(postOrCandles: Candle[], fcv: FCVLevels): Signal[] {
  const signals: Signal[] = []
  const seen = new Set<number>()
  for (let i = 2; i < postOrCandles.length; i++) {
    const c = postOrCandles[i], p1 = postOrCandles[i-1], p2 = postOrCandles[i-2]
    if (seen.has(c.time)) continue
    if (c.high > fcv.orHigh && c.close < fcv.orHigh && c.close > fcv.orLow) {
      signals.push({ type: 'TRAP', label: 'TRAP SHORT', time: c.time, entryPrice: c.close, stopPrice: c.high, targetPrice: fcv.orLow })
      seen.add(c.time); continue
    }
    if (c.low < fcv.orLow && c.close > fcv.orLow && c.close < fcv.orHigh) {
      signals.push({ type: 'CONT', label: 'TRAP LONG', time: c.time, entryPrice: c.close, stopPrice: c.low, targetPrice: fcv.orHigh })
      seen.add(c.time); continue
    }
    if ((p1.close > fcv.orHigh || p2.close > fcv.orHigh) && c.low <= fcv.orHigh && c.close >= fcv.orHigh) {
      signals.push({ type: 'CONT', label: 'CONT LONG', time: c.time, entryPrice: c.close, stopPrice: c.low })
      seen.add(c.time); continue
    }
    if ((p1.close < fcv.orLow || p2.close < fcv.orLow) && c.high >= fcv.orLow && c.close <= fcv.orLow) {
      signals.push({ type: 'TRAP', label: 'CONT SHORT', time: c.time, entryPrice: c.close, stopPrice: c.high })
      seen.add(c.time)
    }
  }
  return signals.sort((a, b) => a.time - b.time)
}

// ─── Session Context ──────────────────────────────────────────────────────────

export type SessionName = 'Asia' | 'London' | 'NY AM' | 'NY PM' | 'After Hours'

export interface SessionInfo {
  name: SessionName
  color: string
  rangeHigh: number | null  // high of this session so far
  rangeLow:  number | null
  bias: 'bullish' | 'bearish' | 'neutral'
  description: string       // plain-english context
  asiaHigh: number | null   // always available for context
  asiaLow:  number | null
}

const SESSION_DEFS: { name: SessionName; start: number; end: number; color: string }[] = [
  { name: 'Asia',       start:  0 * 60 + 0,  end:  8 * 60 + 0,  color: '#7c3aed' },
  { name: 'London',     start:  3 * 60 + 0,  end:  8 * 60 + 0,  color: '#06b6d4' },
  { name: 'NY AM',      start:  8 * 60 + 0,  end: 12 * 60 + 0,  color: '#f97316' },
  { name: 'NY PM',      start: 12 * 60 + 0,  end: 16 * 60 + 0,  color: '#6b7280' },
  { name: 'After Hours',start: 16 * 60 + 0,  end: 24 * 60 + 0,  color: '#374151' },
]

export function getCurrentSession(candles: Candle[]): SessionInfo {
  if (!candles.length) return { name: 'After Hours', color: '#374151', rangeHigh: null, rangeLow: null, bias: 'neutral', description: 'Awaiting data', asiaHigh: null, asiaLow: null }

  const last  = candles[candles.length - 1]
  const ct    = toCentralDate(last.time)
  const mins  = ct.getHours() * 60 + ct.getMinutes()
  const [y, m, d] = [ct.getFullYear(), ct.getMonth(), ct.getDate()]

  const todayCandles = (s: number, e: number) => candles.filter(c => {
    const t = toCentralDate(c.time)
    if (t.getFullYear() !== y || t.getMonth() !== m || t.getDate() !== d) return false
    const cm = t.getHours() * 60 + t.getMinutes()
    return cm >= s && cm < e
  })

  // Asia (midnight–8 AM CT, covers pre-London)
  const asiaC   = todayCandles(0, 8 * 60)
  const asiaHigh = asiaC.length ? Math.max(...asiaC.map(c => c.high)) : null
  const asiaLow  = asiaC.length ? Math.min(...asiaC.map(c => c.low))  : null

  // Current session
  let sess = SESSION_DEFS.find(s => mins >= s.start && mins < s.end) ?? SESSION_DEFS[SESSION_DEFS.length - 1]
  // London and Asia overlap — London takes priority 3–8 AM
  if (mins >= 3 * 60 && mins < 8 * 60) sess = SESSION_DEFS.find(s => s.name === 'London')!

  const sessC = todayCandles(sess.start, sess.end)
  const rangeHigh = sessC.length ? Math.max(...sessC.map(c => c.high)) : null
  const rangeLow  = sessC.length ? Math.min(...sessC.map(c => c.low))  : null

  // Bias: is current session pushing above or below Asia range?
  let bias: SessionInfo['bias'] = 'neutral'
  let description = ''

  if (sess.name === 'Asia') {
    bias = 'neutral'
    description = 'Asia building range. Note Hi/Lo — London will target these levels.'
  } else if (sess.name === 'London') {
    if (asiaHigh && rangeHigh && rangeHigh > asiaHigh) {
      bias = 'bullish'
      description = `London swept Asia High (${fmt(asiaHigh)}). Watch for FVG below → potential long retest.`
    } else if (asiaLow && rangeLow && rangeLow < asiaLow) {
      bias = 'bearish'
      description = `London swept Asia Low (${fmt(asiaLow)}). Watch for FVG above → potential short retest.`
    } else {
      bias = 'neutral'
      description = `London active. Asia Hi ${asiaHigh ? fmt(asiaHigh) : '—'} / Lo ${asiaLow ? fmt(asiaLow) : '—'} not yet swept.`
    }
  } else if (sess.name === 'NY AM') {
    const londonC    = todayCandles(3 * 60, 8 * 60)
    const londonHigh = londonC.length ? Math.max(...londonC.map(c => c.high)) : null
    const londonLow  = londonC.length ? Math.min(...londonC.map(c => c.low))  : null
    if (londonHigh && rangeHigh && rangeHigh > londonHigh) {
      bias = 'bullish'
      description = `NY extending London breakout above ${fmt(londonHigh)}. Continuation long bias.`
    } else if (londonLow && rangeLow && rangeLow < londonLow) {
      bias = 'bearish'
      description = `NY extending London breakdown below ${fmt(londonLow)}. Continuation short bias.`
    } else {
      bias = 'neutral'
      description = 'NY open inside London range. Possible reversal — wait for sweep + FVG retest.'
    }
  } else if (sess.name === 'NY PM') {
    bias = 'neutral'
    description = 'Low volume. Avoid new entries unless clear structure break.'
  } else {
    bias = 'neutral'
    description = 'After hours. Range-building for Asia session.'
  }

  return { name: sess.name, color: sess.color, rangeHigh, rangeLow, bias, description, asiaHigh, asiaLow }
}

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function toUTCDate(ts: number) {
  return new Date(ts * 1000)
}

function utcDayKey(ts: number): string {
  const d = toUTCDate(ts)
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
}

function utcMinutes(ts: number): number {
  const d = toUTCDate(ts)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function rollingAtr(candles: Candle[], period = 56): number[] {
  const trs: number[] = []
  const atr: number[] = new Array(candles.length).fill(0)
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const prev = candles[i - 1]
    const tr = !prev ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
    trs.push(tr)
    if (i >= period - 1) atr[i] = trs.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period
  }
  return atr
}

function percentile(values: number[], pct: number): number {
  const clean = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (!clean.length) return 0
  const idx = Math.min(clean.length - 1, Math.max(0, Math.floor((clean.length - 1) * pct)))
  return clean[idx]
}

// ─── Quant False Break — London first-hour failed breakout (M15) ─────────────
// Backtest candidate: build 07:00–07:59 UTC range, then fade M15 closes through
// that range from 08:00–11:59 UTC. Max 2 signals per UTC day.
export function computeQuantFalseBreakData(m15: Candle[], targetAtr: 0.15 | 0.25 = 0.25): QuantFalseBreakData {
  const empty: QuantFalseBreakData = {
    rangeHigh: 0, rangeLow: 0, rangeBars: 0, atr: 0, atrThreshold: 0, buffer: 0,
    targetAtr, stopAtr: 2.6, maxTrades: 2, activeWindow: false, tradesToday: 0,
    signals: [], invalidation: 'Need M15 data for London first-hour false-break setup.',
  }
  if (m15.length < 64) return empty

  const last = m15[m15.length - 1]
  const day = utcDayKey(last.time)
  const rangeBars = m15.filter(c => utcDayKey(c.time) === day && utcMinutes(c.time) >= 7 * 60 && utcMinutes(c.time) < 8 * 60)
  if (rangeBars.length < 4) {
    return { ...empty, rangeBars: rangeBars.length, invalidation: `Building 07:00–07:59 UTC London range (${rangeBars.length}/4 M15 bars).` }
  }

  const rangeHigh = Math.max(...rangeBars.map(c => c.high))
  const rangeLow = Math.min(...rangeBars.map(c => c.low))
  const rangeEndTime = rangeBars[rangeBars.length - 1].time
  const atrSeries = rollingAtr(m15, 56)
  const atrThreshold = percentile(atrSeries, 0.60)
  const lastAtr = atrSeries[m15.length - 1] || 0
  const activeWindow = utcMinutes(last.time) >= 8 * 60 && utcMinutes(last.time) < 12 * 60
  const signals: Signal[] = []
  const fired = new Set<'high' | 'low'>()

  for (let i = 0; i < m15.length; i++) {
    const c = m15[i]
    if (utcDayKey(c.time) !== day || c.time <= rangeEndTime) continue
    const mins = utcMinutes(c.time)
    if (mins < 8 * 60 || mins >= 12 * 60) continue
    if (signals.length >= 2) break

    const atr = atrSeries[i]
    if (!atr || atr < atrThreshold) continue
    if ((rangeHigh - rangeLow) / atr < 0.8) continue
    const buffer = atr * 0.05

    if (!fired.has('high') && c.close > rangeHigh + buffer) {
      fired.add('high')
      signals.push({
        type: 'TRAP',
        label: targetAtr === 0.25 ? 'QFB25 SHORT' : 'QFB15 SHORT',
        time: c.time,
        entryPrice: c.close,
        stopPrice: c.close + 2.6 * atr,
        targetPrice: c.close - targetAtr * atr,
      })
      continue
    }
    if (!fired.has('low') && c.close < rangeLow - buffer) {
      fired.add('low')
      signals.push({
        type: 'CONT',
        label: targetAtr === 0.25 ? 'QFB25 LONG' : 'QFB15 LONG',
        time: c.time,
        entryPrice: c.close,
        stopPrice: c.close - 2.6 * atr,
        targetPrice: c.close + targetAtr * atr,
      })
    }
  }

  const currentAtr = lastAtr || atrSeries.filter(Boolean).at(-1) || 0
  const buffer = currentAtr * 0.05
  const latest = signals[signals.length - 1]
  const p = (n: number) => n.toFixed(2)
  const invalidation =
    latest ? `${latest.label} @ ${p(latest.entryPrice)} · TP ${targetAtr} ATR · max 2/day.` :
    !activeWindow ? `Range set ${p(rangeLow)}–${p(rangeHigh)}. Trade window is 08:00–11:59 UTC.` :
    currentAtr < atrThreshold ? `Window live, but ATR ${p(currentAtr)} below high-vol threshold ${p(atrThreshold)}.` :
    (rangeHigh - rangeLow) / Math.max(currentAtr, 0.0001) < 0.8 ? `London first-hour range too small vs ATR. No trade.` :
    `Window live. Fade close above ${p(rangeHigh + buffer)} or below ${p(rangeLow - buffer)}.`

  return {
    rangeHigh, rangeLow, rangeBars: rangeBars.length, atr: currentAtr, atrThreshold, buffer,
    targetAtr, stopAtr: 2.6, maxTrades: 2, activeWindow, tradesToday: signals.length,
    signals: signals.sort((a, b) => a.time - b.time), invalidation,
  }
}

// ─── London Breakout (LNDB) — M5 candles ──────────────────────────────────────
// Session: 3 AM – 8 AM Central time (America/Chicago handles CST/CDT auto)
export function getLondonCandlesBySession(
  m5Candles: Candle[],
  startHour = 3,
  startMin  = 0,
  endHour   = 8,
  endMin    = 0,
): { today: Candle[]; prev: Candle[] } {
  const startMins = startHour * 60 + startMin
  const endMins   = endHour   * 60 + endMin
  const byDate = new Map<string, Candle[]>()
  for (const c of m5Candles) {
    const ct = toCentralDate(c.time)
    const mins = ct.getHours() * 60 + ct.getMinutes()
    if (mins < startMins || mins >= endMins) continue
    const key = `${ct.getFullYear()}-${String(ct.getMonth() + 1).padStart(2,'0')}-${String(ct.getDate()).padStart(2,'0')}`
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(c)
  }
  const dates = [...byDate.keys()].sort()
  const today = dates.length > 0 ? byDate.get(dates[dates.length - 1])! : []
  const prev  = dates.length > 1 ? byDate.get(dates[dates.length - 2])! : []
  return { today, prev }
}

export function getLondonCandles(
  m5Candles: Candle[],
  startHour = 3,
  startMin  = 0,
  endHour   = 8,
  endMin    = 0,
): Candle[] {
  if (!m5Candles.length) return []
  const lastC = toCentralDate(m5Candles[m5Candles.length - 1].time)
  const [y, m, d] = [lastC.getFullYear(), lastC.getMonth(), lastC.getDate()]
  const startMins = startHour * 60 + startMin
  const endMins   = endHour   * 60 + endMin
  return m5Candles.filter(c => {
    const ct = toCentralDate(c.time)
    if (ct.getFullYear() !== y || ct.getMonth() !== m || ct.getDate() !== d) return false
    const mins = ct.getHours() * 60 + ct.getMinutes()
    return mins >= startMins && mins < endMins
  })
}

export function computeLNDBLevels(londonCandles: Candle[]): LNDBLevels {
  const londonHigh = Math.max(...londonCandles.map(c => c.high))
  const londonLow  = Math.min(...londonCandles.map(c => c.low))
  return { londonHigh, londonLow, londonRange: londonHigh - londonLow, londonBars: londonCandles.length }
}

export function detectLNDBSignals(postLondonM5: Candle[], lndb: LNDBLevels): Signal[] {
  const signals: Signal[] = []
  let longFired  = false
  let shortFired = false

  for (const c of postLondonM5) {
    // LONG: first M5 candle body (close) that closes above London High
    if (!longFired && c.close > lndb.londonHigh) {
      longFired = true
      const risk = c.close - c.low
      signals.push({ type: 'CONT', label: 'LNDB LONG', time: c.time, entryPrice: c.close, stopPrice: c.low,
        targetPrice: c.close + 1 * risk,
        target2:     c.close + 2 * risk,
        target3:     c.close + 3 * risk,
      })
    }
    // SHORT: first M5 candle body (close) that closes below London Low
    if (!shortFired && c.close < lndb.londonLow) {
      shortFired = true
      const risk = c.high - c.close
      signals.push({ type: 'TRAP', label: 'LNDB SHORT', time: c.time, entryPrice: c.close, stopPrice: c.high,
        targetPrice: c.close - 1 * risk,
        target2:     c.close - 2 * risk,
        target3:     c.close - 3 * risk,
      })
    }
    if (longFired && shortFired) break
  }

  return signals.sort((a, b) => a.time - b.time)
}

// LNDB2: requires two consecutive M5 closes outside the box (confirmation)
export function detectLNDB2Signals(postLondonM5: Candle[], lndb: LNDBLevels): Signal[] {
  const signals: Signal[] = []
  let longFired  = false
  let shortFired = false

  for (let i = 1; i < postLondonM5.length; i++) {
    const c  = postLondonM5[i]
    const p  = postLondonM5[i - 1]

    if (!longFired && p.close > lndb.londonHigh && c.close > lndb.londonHigh) {
      longFired = true
      const risk = c.close - c.low
      signals.push({ type: 'CONT', label: 'LNDB2 LONG', time: c.time, entryPrice: c.close, stopPrice: c.low,
        targetPrice: c.close + risk, target2: c.close + 2 * risk, target3: c.close + 3 * risk })
    }
    if (!shortFired && p.close < lndb.londonLow && c.close < lndb.londonLow) {
      shortFired = true
      const risk = c.high - c.close
      signals.push({ type: 'TRAP', label: 'LNDB2 SHORT', time: c.time, entryPrice: c.close, stopPrice: c.high,
        targetPrice: c.close - risk, target2: c.close - 2 * risk, target3: c.close - 3 * risk })
    }
    if (longFired && shortFired) break
  }

  return signals.sort((a, b) => a.time - b.time)
}

// ─── Liquidity Zones & Fair Value Gaps ────────────────────────────────────────

export interface FVGZone {
  top: number
  bottom: number
  mid: number
  type: 'bullish' | 'bearish'
  time: number    // time of the middle candle (C2)
  filled: boolean // subsequent price entered the gap
}

export interface LiqZone {
  level: number
  type: 'BSL' | 'SSL'   // Buy-Side Liquidity | Sell-Side Liquidity
  time: number
  swept: boolean         // price has run through this level
  strength: number       // 1 = single swing, 2+ = equal-high/low cluster
}

export interface LQData {
  fvgs:      FVGZone[]
  liquidity: LiqZone[]
  pdh: number | null     // previous trading day high
  pdl: number | null     // previous trading day low
  signals:   Signal[]
}

export function findFVGs(candles: Candle[], minGapPts = 2.0): FVGZone[] {
  const gaps: FVGZone[] = []
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i]

    // Bullish FVG: gap between c1.high and c3.low (price jumped up, gap left below)
    if (c3.low > c1.high && c3.low - c1.high >= minGapPts) {
      const top = c3.low, bottom = c1.high
      const filled = candles.slice(i + 1).some(c => c.low <= top && c.high >= bottom)
      gaps.push({ top, bottom, mid: (top + bottom) / 2, type: 'bullish', time: c2.time, filled })
    }
    // Bearish FVG: gap between c3.high and c1.low (price jumped down, gap left above)
    if (c3.high < c1.low && c1.low - c3.high >= minGapPts) {
      const top = c1.low, bottom = c3.high
      const filled = candles.slice(i + 1).some(c => c.low <= top && c.high >= bottom)
      gaps.push({ top, bottom, mid: (top + bottom) / 2, type: 'bearish', time: c2.time, filled })
    }
  }
  return gaps
}

function clusterPoints(
  pts: { level: number; time: number; swept: boolean }[],
  type: 'BSL' | 'SSL',
  clusterPts: number,
): LiqZone[] {
  if (!pts.length) return []
  const sorted = [...pts].sort((a, b) => a.level - b.level)
  const result: LiqZone[] = []
  let group = [sorted[0]]
  for (let i = 1; i <= sorted.length; i++) {
    const pt = sorted[i]
    if (!pt || Math.abs(pt.level - group[0].level) > clusterPts) {
      result.push({
        level:    group.reduce((s, x) => s + x.level, 0) / group.length,
        type,
        time:     Math.max(...group.map(x => x.time)),
        swept:    group.some(x => x.swept),
        strength: group.length,
      })
      group = pt ? [pt] : []
    } else {
      group.push(pt)
    }
  }
  return result
}

export function findLiquidityZones(candles: Candle[], swing = 3, clusterPts = 5.0): LiqZone[] {
  const highs: { level: number; time: number; swept: boolean }[] = []
  const lows:  { level: number; time: number; swept: boolean }[] = []

  for (let i = swing; i < candles.length - swing; i++) {
    const c = candles[i]
    const isH = candles.slice(i-swing, i).every(x => x.high <= c.high) &&
                candles.slice(i+1, i+swing+1).every(x => x.high <= c.high)
    const isL = candles.slice(i-swing, i).every(x => x.low  >= c.low)  &&
                candles.slice(i+1, i+swing+1).every(x => x.low  >= c.low)
    if (isH) highs.push({ level: c.high, time: c.time, swept: candles.slice(i+1).some(x => x.high > c.high) })
    if (isL) lows.push({  level: c.low,  time: c.time, swept: candles.slice(i+1).some(x => x.low  < c.low)  })
  }

  return [
    ...clusterPoints(highs, 'BSL', clusterPts),
    ...clusterPoints(lows,  'SSL', clusterPts),
  ]
}

export function findPrevDayLevels(candles: Candle[]): { pdh: number | null; pdl: number | null } {
  if (!candles.length) return { pdh: null, pdl: null }
  const lastC = toCentralDate(candles[candles.length - 1].time)
  const [y, m, d] = [lastC.getFullYear(), lastC.getMonth(), lastC.getDate()]
  const prev = candles.filter(c => {
    const ct = toCentralDate(c.time)
    return !(ct.getFullYear() === y && ct.getMonth() === m && ct.getDate() === d)
  })
  if (!prev.length) return { pdh: null, pdl: null }
  return { pdh: Math.max(...prev.map(c => c.high)), pdl: Math.min(...prev.map(c => c.low)) }
}

export function detectLQSignals(candles: Candle[], lqData: Omit<LQData, 'signals'>): Signal[] {
  const signals: Signal[] = []
  const seen   = new Set<string>()

  const bslSorted = lqData.liquidity.filter(z => z.type === 'BSL').sort((a, b) => a.level - b.level)
  const sslSorted = lqData.liquidity.filter(z => z.type === 'SSL').sort((a, b) => a.level - b.level)

  const nearestBSLAbove = (price: number) => bslSorted.find(z => z.level > price)?.level
  const nearestSSLBelow = (price: number) => [...sslSorted].reverse().find(z => z.level < price)?.level

  // ── BSL Sweep → Short (wick above, body closes below) ────────────────────
  for (const z of bslSorted) {
    const post = candles.filter(c => c.time > z.time)
    for (const c of post) {
      if (c.high > z.level && c.close < z.level) {
        const key = `bsl-${z.time}-${c.time}`
        if (!seen.has(key)) {
          seen.add(key)
          const risk = c.high - c.close
          const ssl  = nearestSSLBelow(c.close)
          signals.push({
            type: 'TRAP', label: 'BSL SWEEP ↓', time: c.time,
            entryPrice: c.close, stopPrice: c.high,
            targetPrice: c.close - 1 * risk,
            target2:     ssl ?? c.close - 2 * risk,
            target3:     c.close - 3 * risk,
          })
        }
        break
      }
    }
  }

  // ── SSL Sweep → Long (wick below, body closes above) ─────────────────────
  for (const z of sslSorted) {
    const post = candles.filter(c => c.time > z.time)
    for (const c of post) {
      if (c.low < z.level && c.close > z.level) {
        const key = `ssl-${z.time}-${c.time}`
        if (!seen.has(key)) {
          seen.add(key)
          const risk = c.close - c.low
          const bsl  = nearestBSLAbove(c.close)
          signals.push({
            type: 'CONT', label: 'SSL SWEEP ↑', time: c.time,
            entryPrice: c.close, stopPrice: c.low,
            targetPrice: c.close + 1 * risk,
            target2:     bsl ?? c.close + 2 * risk,
            target3:     c.close + 3 * risk,
          })
        }
        break
      }
    }
  }

  // ── FVG Retest ────────────────────────────────────────────────────────────
  for (const g of lqData.fvgs) {
    if (g.filled) continue
    const gIdx = candles.findIndex(c => c.time === g.time)
    if (gIdx < 0) continue
    const post = candles.slice(gIdx + 2)
    for (const c of post) {
      if (c.low <= g.top && c.high >= g.bottom) {
        const key = `fvg-${g.time}-${c.time}`
        if (!seen.has(key)) {
          seen.add(key)
          const risk = g.top - g.bottom
          if (g.type === 'bullish') {
            const bsl = nearestBSLAbove(g.top)
            signals.push({
              type: 'CONT', label: 'FVG RETEST ↑', time: c.time,
              entryPrice: g.mid, stopPrice: g.bottom,
              targetPrice: g.mid + 1 * risk,
              target2:     bsl ?? g.mid + 2 * risk,
              target3:     g.mid + 3 * risk,
            })
          } else {
            const ssl = nearestSSLBelow(g.bottom)
            signals.push({
              type: 'TRAP', label: 'FVG RETEST ↓', time: c.time,
              entryPrice: g.mid, stopPrice: g.top,
              targetPrice: g.mid - 1 * risk,
              target2:     ssl ?? g.mid - 2 * risk,
              target3:     g.mid - 3 * risk,
            })
          }
        }
        break
      }
    }
  }

  return signals.sort((a, b) => a.time - b.time)
}

export function computeLQData(m5Candles: Candle[]): LQData {
  const fvgs      = findFVGs(m5Candles, 2.0)
  const liquidity = findLiquidityZones(m5Candles)
  const { pdh, pdl } = findPrevDayLevels(m5Candles)
  const signals   = detectLQSignals(m5Candles, { fvgs, liquidity, pdh, pdl })
  return { fvgs, liquidity, pdh, pdl, signals }
}

// ─── ORB Retest (NY Open 9:30 AM EST) ────────────────────────────────────────

export interface ORBData {
  orbHigh: number
  orbLow:  number
  orbBars: number
  signals: Signal[]
}

export function computeORBData(m1Candles: Candle[]): ORBData {
  const orCandles = getORCandles(m1Candles, 9, 30, 15)
  if (orCandles.length < 3) return { orbHigh: 0, orbLow: 0, orbBars: orCandles.length, signals: [] }
  const orbHigh    = Math.max(...orCandles.map(c => c.high))
  const orbLow     = Math.min(...orCandles.map(c => c.low))
  const lastOrTime = orCandles[orCandles.length - 1].time
  const post       = m1Candles.filter(c => c.time > lastOrTime)
  return { orbHigh, orbLow, orbBars: orCandles.length, signals: detectORBRetestSignals(post, orbHigh, orbLow) }
}

function detectORBRetestSignals(candles: Candle[], orbHigh: number, orbLow: number): Signal[] {
  const signals: Signal[] = []
  const seen    = new Set<string>()
  let brokHigh  = false, brokLow = false
  let breakHiT  = 0, breakLoT = 0

  for (const c of candles) {
    if (!brokHigh && c.close > orbHigh) { brokHigh = true; breakHiT = c.time }
    if (!brokLow  && c.close < orbLow)  { brokLow  = true; breakLoT = c.time }

    if (brokHigh && c.time > breakHiT) {
      const key = `orb-hi-${c.time}`
      if (!seen.has(key) && c.low <= orbHigh + 2 && c.close > orbHigh) {
        seen.add(key)
        const risk = c.close - c.low
        signals.push({ type: 'CONT', label: 'ORB RETEST ↑', time: c.time,
          entryPrice: c.close, stopPrice: c.low,
          targetPrice: c.close + risk, target2: c.close + 2 * risk, target3: c.close + 3 * risk })
        brokHigh = false
      }
    }
    if (brokLow && c.time > breakLoT) {
      const key = `orb-lo-${c.time}`
      if (!seen.has(key) && c.high >= orbLow - 2 && c.close < orbLow) {
        seen.add(key)
        const risk = c.high - c.close
        signals.push({ type: 'TRAP', label: 'ORB RETEST ↓', time: c.time,
          entryPrice: c.close, stopPrice: c.high,
          targetPrice: c.close - risk, target2: c.close - 2 * risk, target3: c.close - 3 * risk })
        brokLow = false
      }
    }
  }
  return signals.sort((a, b) => a.time - b.time)
}

// ─── Daily 3-Level ────────────────────────────────────────────────────────────

export interface Daily3Data {
  prevHigh: number
  prevLow:  number
  midLevel: number
  signals:  Signal[]
}

export function computeDaily3Data(dailyCandles: Candle[], m5Candles: Candle[]): Daily3Data {
  if (dailyCandles.length < 2) return { prevHigh: 0, prevLow: 0, midLevel: 0, signals: [] }
  const prev     = dailyCandles[dailyCandles.length - 2]
  const prevHigh = prev.high
  const prevLow  = prev.low
  const midLevel = (prevHigh + prevLow) / 2
  return { prevHigh, prevLow, midLevel, signals: detectDaily3Signals(m5Candles, prevHigh, prevLow, midLevel) }
}

function detectDaily3Signals(candles: Candle[], prevHigh: number, prevLow: number, midLevel: number): Signal[] {
  const signals: Signal[] = []
  const seen       = new Set<number>()
  const noTradeGap = (prevHigh - prevLow) * 0.15

  for (const c of candles) {
    if (seen.has(c.time)) continue
    if (c.high > prevHigh && c.close < prevHigh && c.close > midLevel + noTradeGap) {
      seen.add(c.time)
      const risk = c.high - c.close
      signals.push({ type: 'TRAP', label: 'D3 SHORT ↓', time: c.time,
        entryPrice: c.close, stopPrice: c.high,
        targetPrice: midLevel, target2: prevLow, target3: c.close - 3 * risk })
    } else if (c.low < prevLow && c.close > prevLow && c.close < midLevel - noTradeGap) {
      seen.add(c.time)
      const risk = c.close - c.low
      signals.push({ type: 'CONT', label: 'D3 LONG ↑', time: c.time,
        entryPrice: c.close, stopPrice: c.low,
        targetPrice: midLevel, target2: prevHigh, target3: c.close + 3 * risk })
    }
  }
  return signals.sort((a, b) => a.time - b.time)
}

// ─── Daily Sweep & Engulf ─────────────────────────────────────────────────────

export interface SweepData {
  prevHigh: number
  prevLow:  number
  signals:  Signal[]
}

export function computeSweepData(dailyCandles: Candle[], m5Candles: Candle[]): SweepData {
  if (dailyCandles.length < 2) return { prevHigh: 0, prevLow: 0, signals: [] }
  const prev     = dailyCandles[dailyCandles.length - 2]
  const prevHigh = prev.high
  const prevLow  = prev.low
  return { prevHigh, prevLow, signals: detectSweepEngulfSignals(m5Candles, prevHigh, prevLow) }
}

function detectSweepEngulfSignals(candles: Candle[], prevHigh: number, prevLow: number): Signal[] {
  const signals: Signal[] = []
  const seen    = new Set<string>()

  for (let i = 2; i < candles.length; i++) {
    const c  = candles[i]
    const p1 = candles[i - 1]
    const p2 = candles[i - 2]

    if (p1.high > prevHigh && p1.close <= prevHigh) {
      if (c.open >= p1.close && c.close < p1.open && c.close < p2.low) {
        const key = `swp-hi-${p1.time}`
        if (!seen.has(key)) {
          seen.add(key)
          const risk = p1.high - c.close
          signals.push({ type: 'TRAP', label: 'SWEEP ENGULF ↓', time: c.time,
            entryPrice: c.close, stopPrice: p1.high,
            targetPrice: c.close - risk, target2: prevLow, target3: c.close - 3 * risk })
        }
      }
    }
    if (p1.low < prevLow && p1.close >= prevLow) {
      if (c.open <= p1.close && c.close > p1.open && c.close > p2.high) {
        const key = `swp-lo-${p1.time}`
        if (!seen.has(key)) {
          seen.add(key)
          const risk = c.close - p1.low
          signals.push({ type: 'CONT', label: 'SWEEP ENGULF ↑', time: c.time,
            entryPrice: c.close, stopPrice: p1.low,
            targetPrice: c.close + risk, target2: prevHigh, target3: c.close + 3 * risk })
        }
      }
    }
  }
  return signals.sort((a, b) => a.time - b.time)
}

// ─── Asia Fib Breakout (10 AM AEDT first 15-min candle) ──────────────────────

function toAEDTDate(ts: number) {
  return new Date(new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
}

export interface AsiaFibData {
  asiaHigh: number
  asiaLow:  number
  fib236:   number
  fib50:    number
  fib618:   number
  fib786:   number
  orbBars:  number
  signals:  Signal[]
}

function getAsiaFibCandles(m5Candles: Candle[]): Candle[] {
  if (!m5Candles.length) return []
  const lastAEDT = toAEDTDate(m5Candles[m5Candles.length - 1].time)
  const [y, mo, d] = [lastAEDT.getFullYear(), lastAEDT.getMonth(), lastAEDT.getDate()]
  return m5Candles.filter(c => {
    const aedt = toAEDTDate(c.time)
    if (aedt.getFullYear() !== y || aedt.getMonth() !== mo || aedt.getDate() !== d) return false
    const mins = aedt.getHours() * 60 + aedt.getMinutes()
    return mins >= 600 && mins < 615  // 10:00–10:15 AEDT
  })
}

export function computeAsiaFibData(m5Candles: Candle[]): AsiaFibData {
  const empty: AsiaFibData = { asiaHigh: 0, asiaLow: 0, fib236: 0, fib50: 0, fib618: 0, fib786: 0, orbBars: 0, signals: [] }
  const asiaCandles = getAsiaFibCandles(m5Candles)
  if (!asiaCandles.length) return empty

  const asiaHigh = Math.max(...asiaCandles.map(c => c.high))
  const asiaLow  = Math.min(...asiaCandles.map(c => c.low))
  const range    = asiaHigh - asiaLow
  const fib236   = asiaHigh - 0.236 * range
  const fib50    = asiaHigh - 0.5   * range
  const fib618   = asiaHigh - 0.618 * range
  const fib786   = asiaHigh - 0.786 * range

  const lastAsiaTime = asiaCandles[asiaCandles.length - 1].time
  const post    = m5Candles.filter(c => c.time > lastAsiaTime)
  const signals = detectAsiaFibSignals(post, asiaHigh, asiaLow, fib50, fib618, fib786)
  return { asiaHigh, asiaLow, fib236, fib50, fib618, fib786, orbBars: asiaCandles.length, signals }
}

function detectAsiaFibSignals(
  candles: Candle[], asiaHigh: number, asiaLow: number,
  fib50: number, fib618: number, fib786: number,
): Signal[] {
  const signals: Signal[] = []
  const seen    = new Set<string>()
  const fibList = [
    { level: fib50,  name: '0.5' },
    { level: fib618, name: '0.618' },
    { level: fib786, name: '0.786' },
  ]
  const fvgs = findFVGs(candles, 1.5)

  for (const fvg of fvgs) {
    if (fvg.filled) continue
    for (const fib of fibList) {
      if (Math.abs(fvg.mid - fib.level) > 4) continue
      const gIdx = candles.findIndex(c => c.time === fvg.time)
      if (gIdx < 0) continue
      for (const c of candles.slice(gIdx + 2)) {
        if (c.low <= fvg.top && c.high >= fvg.bottom) {
          const key = `afib-fvg-${fvg.time}-${c.time}`
          if (!seen.has(key)) {
            seen.add(key)
            const risk = fvg.top - fvg.bottom
            if (fvg.type === 'bullish') {
              signals.push({ type: 'CONT', label: `ASIA ${fib.name} ↑`, time: c.time,
                entryPrice: fvg.mid, stopPrice: fvg.bottom - 1,
                targetPrice: fvg.mid + 1.2 * risk, target2: fvg.mid + 2.0 * risk, target3: asiaHigh })
            } else {
              signals.push({ type: 'TRAP', label: `ASIA ${fib.name} ↓`, time: c.time,
                entryPrice: fvg.mid, stopPrice: fvg.top + 1,
                targetPrice: fvg.mid - 1.2 * risk, target2: fvg.mid - 2.0 * risk, target3: asiaLow })
            }
          }
          break
        }
      }
    }
  }

  for (const c of candles) {
    for (const fib of fibList) {
      const key = `afib-rej-${Math.round(fib.level * 10)}-${c.time}`
      if (seen.has(key)) continue
      if (c.low <= fib.level + 1 && c.close > fib.level && c.close > c.open) {
        seen.add(key)
        const risk = c.close - c.low
        signals.push({ type: 'CONT', label: `ASIA ${fib.name} ↑`, time: c.time,
          entryPrice: c.close, stopPrice: c.low,
          targetPrice: c.close + 1.2 * risk, target2: c.close + 2.0 * risk, target3: asiaHigh })
      } else if (c.high >= fib.level - 1 && c.close < fib.level && c.close < c.open) {
        seen.add(key)
        const risk = c.high - c.close
        signals.push({ type: 'TRAP', label: `ASIA ${fib.name} ↓`, time: c.time,
          entryPrice: c.close, stopPrice: c.high,
          targetPrice: c.close - 1.2 * risk, target2: c.close - 2.0 * risk, target3: asiaLow })
      }
    }
  }

  return signals.sort((a, b) => a.time - b.time)
}

// ─── Fib Continuation Simple (M5 swing + retracement) ────────────────────────

export interface FibContData {
  swingHigh: number
  swingLow:  number
  trend:     'up' | 'down'
  fib236:    number
  fib50:     number
  fib618:    number
  fib786:    number
  signals:   Signal[]
}

export function computeFibContData(m5Candles: Candle[]): FibContData {
  const empty: FibContData = { swingHigh: 0, swingLow: 0, trend: 'up', fib236: 0, fib50: 0, fib618: 0, fib786: 0, signals: [] }
  if (m5Candles.length < 20) return empty

  const recent = m5Candles.slice(-60)
  let swingHC  = recent[0], swingLC = recent[0]
  for (const c of recent) {
    if (c.high > swingHC.high) swingHC = c
    if (c.low  < swingLC.low)  swingLC = c
  }
  const swingHigh = swingHC.high
  const swingLow  = swingLC.low
  const range     = swingHigh - swingLow
  const trend: 'up' | 'down' = swingHC.time > swingLC.time ? 'down' : 'up'

  let fib236: number, fib50: number, fib618: number, fib786: number
  if (trend === 'up') {
    fib236 = swingHigh - 0.236 * range
    fib50  = swingHigh - 0.5   * range
    fib618 = swingHigh - 0.618 * range
    fib786 = swingHigh - 0.786 * range
  } else {
    fib236 = swingLow + 0.236 * range
    fib50  = swingLow + 0.5   * range
    fib618 = swingLow + 0.618 * range
    fib786 = swingLow + 0.786 * range
  }

  const pivotTime = Math.max(swingHC.time, swingLC.time)
  const post      = m5Candles.filter(c => c.time > pivotTime)
  const signals   = detectFibContSignals(post, trend, swingHigh, swingLow, fib50, fib618, fib786)
  return { swingHigh, swingLow, trend, fib236, fib50, fib618, fib786, signals }
}

function detectFibContSignals(
  candles: Candle[], trend: 'up' | 'down',
  swingHigh: number, swingLow: number,
  fib50: number, fib618: number, fib786: number,
): Signal[] {
  const signals: Signal[] = []
  const seen    = new Set<string>()
  const fibList = [
    { level: fib50,  name: '0.5' },
    { level: fib618, name: '0.618' },
    { level: fib786, name: '0.786' },
  ]

  for (const c of candles) {
    for (const fib of fibList) {
      const key = `fc-${Math.round(fib.level * 10)}-${c.time}`
      if (seen.has(key)) continue
      if (trend === 'up' && c.low <= fib.level + 1 && c.close > fib.level && c.close > c.open) {
        seen.add(key)
        const risk = c.close - c.low
        signals.push({ type: 'CONT', label: `FIB ${fib.name} ↑`, time: c.time,
          entryPrice: c.close, stopPrice: c.low,
          targetPrice: c.close + risk, target2: swingHigh, target3: c.close + 3 * risk })
      } else if (trend === 'down' && c.high >= fib.level - 1 && c.close < fib.level && c.close < c.open) {
        seen.add(key)
        const risk = c.high - c.close
        signals.push({ type: 'TRAP', label: `FIB ${fib.name} ↓`, time: c.time,
          entryPrice: c.close, stopPrice: c.high,
          targetPrice: c.close - risk, target2: swingLow, target3: c.close - 3 * risk })
      }
    }
  }
  return signals.sort((a, b) => a.time - b.time)
}


// ─── No-Wick Candle Strategy (M15) ────────────────────────────────────────────

export interface NoWickData {
  trend:           'up' | 'down' | 'sideways'
  bosLevel:        number   // swing H/L that was broken to confirm trend
  bosTime:         number
  structureStop:   number   // recent HL (bull) or LH (bear) used as SL
  recentSwingHigh: number
  recentSwingLow:  number
  noWickCandles: Array<{
    time:          number
    open:          number
    high:          number
    low:           number
    close:         number
    direction:     'bull' | 'bear'
    validForTrend: boolean   // matches current BOS trend direction
  }>
  signals: Signal[]
}

function findSwings(candles: Candle[], n = 2) {
  const highs: Array<{ i: number; price: number }> = []
  const lows:  Array<{ i: number; price: number }> = []
  for (let i = n; i < candles.length - n; i++) {
    let isH = true, isL = true
    for (let k = 1; k <= n; k++) {
      if (candles[i - k].high >= candles[i].high || candles[i + k].high >= candles[i].high) isH = false
      if (candles[i - k].low  <= candles[i].low  || candles[i + k].low  <= candles[i].low)  isL = false
    }
    if (isH) highs.push({ i, price: candles[i].high })
    if (isL) lows.push({  i, price: candles[i].low  })
  }
  return { highs, lows }
}

function detectBOS(candles: Candle[]) {
  const n = 2
  const slice = candles.slice(-60)  // only look at last 60 bars for BOS
  const { highs, lows } = findSwings(slice, n)

  for (let i = slice.length - 1; i >= n * 2 + 2; i--) {
    const close = slice[i].close

    // Bullish BOS: close > a prior swing high (give at least n+1 bar gap)
    const brokenHigh = [...highs].reverse().find(h => h.i <= i - n - 1 && close > h.price)
    if (brokenHigh) {
      const priorLows = lows.filter(l => l.i < i)
      const structLow = priorLows.at(-1)?.price ?? (slice[i].low - 1)
      return {
        trend: 'up' as const,
        bosTime:         slice[i].time,
        bosLevel:        brokenHigh.price,
        structureStop:   structLow - 0.5,
        recentSwingHigh: highs.at(-1)?.price ?? slice[i].high,
        recentSwingLow:  lows.at(-1)?.price  ?? slice[i].low,
      }
    }

    // Bearish BOS: close < a prior swing low
    const brokenLow = [...lows].reverse().find(l => l.i <= i - n - 1 && close < l.price)
    if (brokenLow) {
      const priorHighs = highs.filter(h => h.i < i)
      const structHigh = priorHighs.at(-1)?.price ?? (slice[i].high + 1)
      return {
        trend: 'down' as const,
        bosTime:         slice[i].time,
        bosLevel:        brokenLow.price,
        structureStop:   structHigh + 0.5,
        recentSwingHigh: highs.at(-1)?.price ?? slice[i].high,
        recentSwingLow:  lows.at(-1)?.price  ?? slice[i].low,
      }
    }
  }
  return null
}

export function computeNoWickData(m15: Candle[]): NoWickData {
  const empty: NoWickData = {
    trend: 'sideways', bosLevel: 0, bosTime: 0, structureStop: 0,
    recentSwingHigh: 0, recentSwingLow: 0, noWickCandles: [], signals: [],
  }
  if (m15.length < 20) return empty

  const bos = detectBOS(m15)
  const trend           = bos?.trend           ?? 'sideways'
  const bosLevel        = bos?.bosLevel        ?? 0
  const bosTime         = bos?.bosTime         ?? 0
  const structureStop   = bos?.structureStop   ?? 0
  const recentSwingHigh = bos?.recentSwingHigh ?? 0
  const recentSwingLow  = bos?.recentSwingLow  ?? 0

  // Mark ALL no-wick candles in last 80 bars (both directions, regardless of trend)
  const window = m15.slice(-80)
  type NWC = NoWickData['noWickCandles'][0]
  const noWickCandles: NWC[] = []

  for (let i = 0; i < window.length - 1; i++) {
    const c          = window[i]
    const totalRange = c.high - c.low
    if (totalRange < 1) continue
    const bodyPct = Math.abs(c.close - c.open) / totalRange
    if (bodyPct < 0.6) continue

    if (c.close > c.open) {
      // Bullish: no bottom wick — open ≈ low
      if ((c.open - c.low) / totalRange <= 0.05) {
        noWickCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          direction: 'bull', validForTrend: trend === 'up' })
      }
    } else if (c.close < c.open) {
      // Bearish: no top wick — open ≈ high
      if ((c.high - c.open) / totalRange <= 0.05) {
        noWickCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          direction: 'bear', validForTrend: trend === 'down' })
      }
    }
  }

  // Signals: only trend-matching NWCs, 9-candle tap window, 1:1 TP, structural stop
  const signals: Signal[] = []
  const fired   = new Set<number>()

  if (trend !== 'sideways' && structureStop !== 0) {
    for (const nwc of noWickCandles) {
      if (!nwc.validForTrend || fired.has(nwc.time)) continue
      const idx = m15.findIndex(c => c.time === nwc.time)
      if (idx < 0 || idx >= m15.length - 1) continue

      const entryPrice = nwc.open  // the marked flat-side level
      if (trend === 'up'   && entryPrice <= structureStop) continue
      if (trend === 'down' && entryPrice >= structureStop) continue

      const risk = Math.abs(entryPrice - structureStop)
      if (risk < 1) continue

      // Max 9 candles to tap — 10th+ = invalid
      const window9 = m15.slice(idx + 1, idx + 10)
      for (const c of window9) {
        if (trend === 'up' && c.low <= entryPrice) {
          signals.push({
            type: 'CONT', label: 'NWC BUY', time: c.time,
            entryPrice, stopPrice: structureStop,
            targetPrice: entryPrice + risk,  // 1:1
          })
          fired.add(nwc.time)
          break
        }
        if (trend === 'down' && c.high >= entryPrice) {
          signals.push({
            type: 'TRAP', label: 'NWC SELL', time: c.time,
            entryPrice, stopPrice: structureStop,
            targetPrice: entryPrice - risk,  // 1:1
          })
          fired.add(nwc.time)
          break
        }
      }
    }
  }

  return { trend, bosLevel, bosTime, structureStop, recentSwingHigh, recentSwingLow,
    noWickCandles, signals: signals.sort((a, b) => a.time - b.time) }
}


// ─── Compensation Play — No-Wick Trend Continuation (M15) ─────────────────────
// Same setup family as the No-Wick Candle strategy, but per the Compensation
// Play spec: stop sits at the MOST RECENT swing low (buys) / swing high (sells),
// and there is NO cap on how long price may take to retrace to the marked level.
// Reuses the NoWickData shape so the dashboard draw/stat plumbing is shared.

export function computeCompPlayData(m15: Candle[]): NoWickData {
  const empty: NoWickData = {
    trend: 'sideways', bosLevel: 0, bosTime: 0, structureStop: 0,
    recentSwingHigh: 0, recentSwingLow: 0, noWickCandles: [], signals: [],
  }
  if (m15.length < 20) return empty

  const bos             = detectBOS(m15)
  const trend           = bos?.trend           ?? 'sideways'
  const bosLevel        = bos?.bosLevel        ?? 0
  const bosTime         = bos?.bosTime         ?? 0
  const recentSwingHigh = bos?.recentSwingHigh ?? 0
  const recentSwingLow  = bos?.recentSwingLow  ?? 0

  // Swing pivots used to anchor "most recent low/high" stops.
  const { highs, lows } = findSwings(m15, 2)

  // Data-level stop = most recent swing low (up) / high (down) for the draw line.
  const structureStop =
    trend === 'up'   ? (lows.at(-1)?.price  ?? 0) - 0.5 :
    trend === 'down' ? (highs.at(-1)?.price ?? 0) + 0.5 : 0

  // Mark ALL no-wick candles in last 80 bars (both directions, regardless of trend)
  const window = m15.slice(-80)
  type NWC = NoWickData['noWickCandles'][0]
  const noWickCandles: NWC[] = []

  for (let i = 0; i < window.length - 1; i++) {
    const c          = window[i]
    const totalRange = c.high - c.low
    if (totalRange < 1) continue
    const bodyPct = Math.abs(c.close - c.open) / totalRange
    if (bodyPct < 0.6) continue

    if (c.close > c.open) {
      // Bullish: no bottom wick — open ≈ low
      if ((c.open - c.low) / totalRange <= 0.05) {
        noWickCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          direction: 'bull', validForTrend: trend === 'up' })
      }
    } else if (c.close < c.open) {
      // Bearish: no top wick — open ≈ high
      if ((c.high - c.open) / totalRange <= 0.05) {
        noWickCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          direction: 'bear', validForTrend: trend === 'down' })
      }
    }
  }

  // Signals: trend-matching NWCs, NO retrace cap, stop at most recent swing
  // low/high, 1:1 TP.
  const signals: Signal[] = []
  const fired   = new Set<number>()

  if (trend !== 'sideways') {
    for (const nwc of noWickCandles) {
      if (!nwc.validForTrend || fired.has(nwc.time)) continue
      const idx = m15.findIndex(c => c.time === nwc.time)
      if (idx < 0 || idx >= m15.length - 1) continue

      const entryPrice = nwc.open  // the marked flat-side level

      // Scan every candle after the NWC (no cap) for the retrace tap.
      for (let j = idx + 1; j < m15.length; j++) {
        const c = m15[j]

        if (trend === 'up' && c.low <= entryPrice) {
          // Stop = most recent swing low before the tap.
          const recentLow = [...lows].reverse().find(l => l.i < j)?.price
            ?? Math.min(...m15.slice(Math.max(0, j - 10), j).map(k => k.low))
          const stopPrice = recentLow - 0.5
          const risk = entryPrice - stopPrice
          if (risk < 1) break
          signals.push({
            type: 'CONT', label: 'COMP BUY', time: c.time,
            entryPrice, stopPrice, targetPrice: entryPrice + risk,  // 1:1
          })
          fired.add(nwc.time)
          break
        }

        if (trend === 'down' && c.high >= entryPrice) {
          // Stop = most recent swing high before the tap.
          const recentHigh = [...highs].reverse().find(h => h.i < j)?.price
            ?? Math.max(...m15.slice(Math.max(0, j - 10), j).map(k => k.high))
          const stopPrice = recentHigh + 0.5
          const risk = stopPrice - entryPrice
          if (risk < 1) break
          signals.push({
            type: 'TRAP', label: 'COMP SELL', time: c.time,
            entryPrice, stopPrice, targetPrice: entryPrice - risk,  // 1:1
          })
          fired.add(nwc.time)
          break
        }
      }
    }
  }

  return { trend, bosLevel, bosTime, structureStop, recentSwingHigh, recentSwingLow,
    noWickCandles, signals: signals.sort((a, b) => a.time - b.time) }
}


// ─── NWC Breakout Strategy (M30) ──────────────────────────────────────────────

export interface SRZone {
  level:   number
  type:    'resistance' | 'support'
  touches: number
}

export interface NWCBreakoutData {
  srZones: SRZone[]
  signals: Signal[]
}

function detectSRZones(candles: Candle[], n = 3, tolerance = 5): SRZone[] {
  const { highs, lows } = findSwings(candles, n)

  const cluster = (prices: number[], type: SRZone['type']): SRZone[] => {
    const zones: SRZone[] = []
    for (const price of prices) {
      const existing = zones.find(z => Math.abs(z.level - price) <= tolerance)
      if (existing) {
        existing.level = (existing.level * existing.touches + price) / (existing.touches + 1)
        existing.touches++
      } else {
        zones.push({ level: price, type, touches: 1 })
      }
    }
    return zones.filter(z => z.touches >= 2)
  }

  return [
    ...cluster(highs.map(h => h.price), 'resistance'),
    ...cluster(lows.map(l => l.price),  'support'),
  ]
}

export function computeNWCBreakoutData(m30: Candle[]): NWCBreakoutData {
  if (m30.length < 20) return { srZones: [], signals: [] }

  const slice  = m30.slice(-120)         // ~60 hours of M30 data
  const zones  = detectSRZones(slice)
  const signals: Signal[] = []
  const fired   = new Set<number>()

  for (let i = 3; i < slice.length - 2; i++) {
    const c    = slice[i]
    const prev = slice[i - 1]

    for (const zone of zones) {
      const key = Math.round(zone.level * 100)  // int key to avoid float collisions
      if (fired.has(key)) continue

      // ── Bullish breakout: body close above resistance ──────────────────
      if (zone.type === 'resistance' && prev.close <= zone.level && c.close > zone.level) {
        const next = slice[i + 1]
        if (!next || next.close >= next.open) continue         // must be bearish
        const rng        = next.high - next.low
        if (rng < 0.5) continue
        const bodyPct    = (next.open - next.close) / rng
        const topWickPct = (next.high - next.open)  / rng
        if (bodyPct < 0.6 || topWickPct > 0.05) continue      // bearish no-top-wick

        const entryPrice = zone.level
        const botWick    = next.close - next.low               // wick below NWC body
        const stop       = botWick >= 1 ? next.low - 0.5 : c.low - 0.5
        if (entryPrice <= stop) continue
        const risk = entryPrice - stop
        if (risk < 1) continue

        for (const r of slice.slice(i + 2, i + 17)) {
          if (r.low <= entryPrice) {
            signals.push({ type: 'CONT', label: 'NWCBO BUY', time: r.time,
              entryPrice, stopPrice: stop,
              targetPrice: entryPrice + risk,
              target2:     entryPrice + 2 * risk,
              target3:     entryPrice + 3 * risk })
            fired.add(key)
            break
          }
        }
      }

      // ── Bearish breakout: body close below support ─────────────────────
      if (zone.type === 'support' && prev.close >= zone.level && c.close < zone.level) {
        const next = slice[i + 1]
        if (!next || next.close <= next.open) continue         // must be bullish
        const rng        = next.high - next.low
        if (rng < 0.5) continue
        const bodyPct    = (next.close - next.open) / rng
        const botWickPct = (next.open  - next.low)  / rng
        if (bodyPct < 0.6 || botWickPct > 0.05) continue      // bullish no-bottom-wick

        const entryPrice = zone.level
        const topWick    = next.high - next.close              // wick above NWC body
        const stop       = topWick >= 1 ? next.high + 0.5 : c.high + 0.5
        if (entryPrice >= stop) continue
        const risk = stop - entryPrice
        if (risk < 1) continue

        for (const r of slice.slice(i + 2, i + 17)) {
          if (r.high >= entryPrice) {
            signals.push({ type: 'TRAP', label: 'NWCBO SELL', time: r.time,
              entryPrice, stopPrice: stop,
              targetPrice: entryPrice - risk,
              target2:     entryPrice - 2 * risk,
              target3:     entryPrice - 3 * risk })
            fired.add(key)
            break
          }
        }
      }
    }
  }

  return { srZones: zones, signals: signals.sort((a, b) => a.time - b.time) }
}

// ─── OR 15-Min Opening Range ────────────────────────────────────────────────

export interface OR15Data {
  orHigh:    number
  orLow:     number
  orBars:    number
  direction: 'bullish' | 'bearish' | 'neutral'
  signals:   Signal[]
}

export interface EightAmNYData {
  rangeHigh: number
  rangeLow: number
  rangeBars: number
  rangePts: number
  ref930: number | null
  direction: 'long' | 'short' | 'none'
  h4Trend: GoldBias | 'missing'
  dxyState: 'confirms' | 'blocks' | 'neutral' | 'missing'
  entry: number | null
  stop: number | null
  target: number | null
  status: 'building' | 'waiting_930' | 'inside_range' | 'range_too_wide' | 'h4_block' | 'dxy_block' | 'waiting_retest' | 'signal_ready' | 'no_data'
  invalidation: string
  signals: Signal[]
}

export function computeOR15Data(m1: Candle[]): OR15Data {
  const SL  = 25
  const TP1 = 50
  const TP2 = 75

  // 9:30–9:44 AM EST = 8:30–8:44 AM CT (America/Chicago handles DST)
  const orCandles = m1.filter(c => {
    const d   = new Date(new Date(c.time * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago' }))
    const tot = d.getHours() * 60 + d.getMinutes()
    return tot >= 8 * 60 + 30 && tot < 8 * 60 + 45
  })

  if (orCandles.length === 0) return { orHigh: 0, orLow: 0, orBars: 0, direction: 'neutral', signals: [] }

  const orHigh     = Math.max(...orCandles.map(c => c.high))
  const orLow      = Math.min(...orCandles.map(c => c.low))
  const lastOrTime = orCandles[orCandles.length - 1].time

  const postOr = m1.filter(c => c.time > lastOrTime)
  const signals: Signal[] = []

  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral'
  let breakIdx = -1
  for (let i = 0; i < postOr.length; i++) {
    const c = postOr[i]
    if (c.close > orHigh) { direction = 'bullish'; breakIdx = i; break }
    if (c.close < orLow)  { direction = 'bearish'; breakIdx = i; break }
  }

  if (direction === 'bullish' && breakIdx >= 0) {
    for (let i = breakIdx + 1; i < postOr.length; i++) {
      const c = postOr[i]
      // Wick back to OR high, close above → bullish rejection
      if (c.low <= orHigh && c.close > orHigh && c.close > c.open) {
        signals.push({ type: 'CONT', label: 'OR15 BUY', time: c.time,
          entryPrice: orHigh, stopPrice: orHigh - SL,
          targetPrice: orHigh + TP1, target2: orHigh + TP2 })
        break
      }
    }
  } else if (direction === 'bearish' && breakIdx >= 0) {
    for (let i = breakIdx + 1; i < postOr.length; i++) {
      const c = postOr[i]
      // Wick back to OR low, close below → bearish rejection
      if (c.high >= orLow && c.close < orLow && c.close < c.open) {
        signals.push({ type: 'TRAP', label: 'OR15 SELL', time: c.time,
          entryPrice: orLow, stopPrice: orLow + SL,
          targetPrice: orLow - TP1, target2: orLow - TP2 })
        break
      }
    }
  }

  return { orHigh, orLow, orBars: orCandles.length, direction, signals }
}

function latestBefore(candles: Candle[], time: number): Candle | null {
  let lo = 0, hi = candles.length - 1, found: Candle | null = null
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (candles[mid].time <= time) { found = candles[mid]; lo = mid + 1 }
    else hi = mid - 1
  }
  return found
}

function eightAmNyDayKey(ts: number): string {
  const d = toNYDate(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function eightAmNyMinutes(ts: number): number {
  const d = toNYDate(ts)
  return d.getHours() * 60 + d.getMinutes()
}

function h4OptimizedTrend(h4: Candle[], time: number): GoldBias | 'missing' {
  const scoped = h4.filter(c => c.time <= time)
  if (scoped.length < 210) return 'missing'
  return getGoldTrend(scoped)
}

function dxyOptimizedState(dxy: Candle[], time: number, direction: 'long' | 'short'): EightAmNYData['dxyState'] {
  const scoped = dxy.filter(c => c.time <= time)
  if (scoped.length < 25) return 'missing'
  const ema20 = computeEMA(scoped, 20)
  const cur = scoped[scoped.length - 1]
  const prev = scoped[scoped.length - 2]
  const e20 = ema20[ema20.length - 1]
  if (!cur || !prev || !e20) return 'missing'
  const bull = cur.close > e20 && cur.close > prev.close
  const bear = cur.close < e20 && cur.close < prev.close
  if (direction === 'long' && bear) return 'confirms'
  if (direction === 'short' && bull) return 'confirms'
  if (direction === 'long' && bull) return 'blocks'
  if (direction === 'short' && bear) return 'blocks'
  return 'neutral'
}

export function computeEightAmNYOptimisedData(m15: Candle[], h4: Candle[], dxy: Candle[]): EightAmNYData {
  const empty: EightAmNYData = {
    rangeHigh: 0, rangeLow: 0, rangeBars: 0, rangePts: 0, ref930: null,
    direction: 'none', h4Trend: 'missing', dxyState: 'missing',
    entry: null, stop: null, target: null, status: 'no_data',
    invalidation: 'Need M15, H4, and DXY data for 8AM NY Optimised.',
    signals: [],
  }
  if (!m15.length) return empty

  const day = eightAmNyDayKey(m15[m15.length - 1].time)
  const today = m15.filter(c => eightAmNyDayKey(c.time) === day)
  const c8 = today.find(c => eightAmNyMinutes(c.time) === 8 * 60)
  if (!c8) return { ...empty, status: 'building', invalidation: 'Waiting for the 08:00 NY M15 candle.' }

  const rangeHigh = c8.high
  const rangeLow = c8.low
  const rangePts = rangeHigh - rangeLow
  const base = { ...empty, rangeHigh, rangeLow, rangeBars: 1, rangePts }
  const c930 = today.find(c => eightAmNyMinutes(c.time) === 9 * 60 + 30)
  if (!c930) return { ...base, status: 'waiting_930', invalidation: `8AM range set ${fmt(rangeLow)}-${fmt(rangeHigh)}. Waiting for 09:30 NY close.` }

  if (rangePts > 15) return { ...base, ref930: c930.close, status: 'range_too_wide', invalidation: `8AM range ${fmt(rangePts)} pts is wider than 15 pts. No trade.` }

  const direction: EightAmNYData['direction'] = c930.close > rangeHigh ? 'long' : c930.close < rangeLow ? 'short' : 'none'
  if (direction === 'none') return { ...base, ref930: c930.close, status: 'inside_range', invalidation: '09:30 close stayed inside the 8AM range. No trade.' }

  const h4Trend = h4OptimizedTrend(h4, c930.time)
  if ((direction === 'long' && h4Trend === 'bearish') || (direction === 'short' && h4Trend === 'bullish')) {
    return { ...base, ref930: c930.close, direction, h4Trend, status: 'h4_block', invalidation: `Blocked: H4 trend is ${h4Trend}, opposite ${direction}.` }
  }

  const dxyState = dxyOptimizedState(dxy, c930.time, direction)
  if (dxyState === 'blocks') return { ...base, ref930: c930.close, direction, h4Trend, dxyState, status: 'dxy_block', invalidation: 'Blocked: DXY move contradicts the Gold direction.' }

  const entry = direction === 'long' ? rangeHigh : rangeLow
  const stop = direction === 'long' ? entry - 40 : entry + 40
  const target = direction === 'long' ? entry + 12 : entry - 12
  const post930 = today.filter(c => c.time >= c930.time && eightAmNyMinutes(c.time) <= 12 * 60)
  const retest = post930.find(c => c.low <= entry && c.high >= entry)
  if (!retest) {
    return { ...base, ref930: c930.close, direction, h4Trend, dxyState, entry, stop, target, status: 'waiting_retest', invalidation: `Setup valid. Waiting for boundary retest at ${fmt(entry)} before 12:00 NY.` }
  }

  const signal: Signal = {
    type: direction === 'long' ? 'CONT' : 'TRAP',
    label: direction === 'long' ? '8AM NY OPT LONG' : '8AM NY OPT SHORT',
    time: retest.time,
    entryPrice: entry,
    stopPrice: stop,
    targetPrice: target,
  }
  return { ...base, ref930: c930.close, direction, h4Trend, dxyState, entry, stop, target, status: 'signal_ready', invalidation: `Ready: ${direction.toUpperCase()} at ${fmt(entry)} · SL 40 pts · TP 12 pts.`, signals: [signal] }
}

// ─── P1 Model — Three-Layer Confirmation Strategy ─────────────────────────────
// Layer 1: 15-min FVG sets directional bias
// Layer 2: 5-min sweep of liquidity confirms entry direction
// Layer 3: 1-min close after sweep = precise entry

export interface P1Sweep {
  type:       'bullish' | 'bearish'  // bullish = swept SSL → reversal up; bearish = swept BSL → reversal down
  sweepLevel: number                  // swing high/low that got swept
  sweepHigh:  number                  // wick high of sweep candle
  sweepLow:   number                  // wick low of sweep candle
  time:       number                  // M5 candle time
}

export interface P1Data {
  bias:      'bullish' | 'bearish' | 'neutral'
  m15Fvgs:  FVGZone[]       // recent unfilled M15 FVGs
  activeFvg: FVGZone | null  // most recent unfilled FVG driving bias
  sweeps:    P1Sweep[]       // today's M5 sweeps aligned with bias
  signals:   Signal[]
}

export function computeP1Data(m15: Candle[], m5: Candle[], m1: Candle[]): P1Data {
  const EMPTY: P1Data = { bias: 'neutral', m15Fvgs: [], activeFvg: null, sweeps: [], signals: [] }
  if (m15.length < 3 || m5.length < 10 || m1.length < 5) return EMPTY

  // ── Layer 1: M15 FVG → bias ──────────────────────────────────────────────────
  const recent15  = m15.slice(-120)
  const allFvgs15 = findFVGs(recent15, 1.0)
  const unfilled  = allFvgs15.filter(g => !g.filled)
  const activeFvg = unfilled.length > 0 ? unfilled[unfilled.length - 1] : null
  const bias: 'bullish' | 'bearish' | 'neutral' = activeFvg?.type ?? 'neutral'

  if (bias === 'neutral') return { ...EMPTY, m15Fvgs: unfilled }

  // ── Layer 2: today's M5 sweeps aligned with bias ─────────────────────────────
  const lastM5 = m5[m5.length - 1]
  const todayCT = toCentralDate(lastM5.time)
  const [ty, tm, td] = [todayCT.getFullYear(), todayCT.getMonth(), todayCT.getDate()]
  const todayM5 = m5.filter(c => {
    const ct = toCentralDate(c.time)
    return ct.getFullYear() === ty && ct.getMonth() === tm && ct.getDate() === td
  })

  const sweeps: P1Sweep[] = []
  const LOOKBACK = 10

  for (let i = LOOKBACK; i < todayM5.length; i++) {
    const c    = todayM5[i]
    const prev = todayM5.slice(i - LOOKBACK, i)
    const swingHigh = Math.max(...prev.map(x => x.high))
    const swingLow  = Math.min(...prev.map(x => x.low))

    if (bias === 'bullish' && c.low < swingLow && c.close > swingLow) {
      sweeps.push({ type: 'bullish', sweepLevel: swingLow, sweepHigh: c.high, sweepLow: c.low, time: c.time })
    } else if (bias === 'bearish' && c.high > swingHigh && c.close < swingHigh) {
      sweeps.push({ type: 'bearish', sweepLevel: swingHigh, sweepHigh: c.high, sweepLow: c.low, time: c.time })
    }
  }

  // ── Layer 3: M1 entry confirmation after each sweep ──────────────────────────
  const signals: Signal[] = []
  const M1_WINDOW = 15

  for (const sw of sweeps) {
    const postM1 = m1.filter(c => c.time > sw.time).slice(0, M1_WINDOW)

    for (const c of postM1) {
      if (sw.type === 'bullish' && c.close > c.open && c.close > sw.sweepLevel) {
        const stop = sw.sweepLow - 0.5
        const risk = c.close - stop
        if (risk < 0.5) continue
        signals.push({
          type: 'CONT', label: 'P1 LONG ↑', time: c.time,
          entryPrice: c.close, stopPrice: stop,
          targetPrice: c.close + risk,
          target2:     c.close + 2 * risk,
          target3:     c.close + 3 * risk,
        })
        break
      } else if (sw.type === 'bearish' && c.close < c.open && c.close < sw.sweepLevel) {
        const stop = sw.sweepHigh + 0.5
        const risk = stop - c.close
        if (risk < 0.5) continue
        signals.push({
          type: 'TRAP', label: 'P1 SHORT ↓', time: c.time,
          entryPrice: c.close, stopPrice: stop,
          targetPrice: c.close - risk,
          target2:     c.close - 2 * risk,
          target3:     c.close - 3 * risk,
        })
        break
      }
    }
  }

  return { bias, m15Fvgs: unfilled, activeFvg, sweeps, signals: signals.sort((a, b) => a.time - b.time) }
}

// ─── Simple Flow Model (Command Center Playbook) ──────────────────────────────
// Step 1: Map HTF imbalance — find M30 FVG, follow market structure (HH/HL)
// Step 2: Drop to M5, mark resting liquidity INSIDE HTF FVG — wait for sweep
// Step 3: In window 9:30–10:20 EST, high-vol 13 EMA break = entry trigger
//         Also detects FVG breakdown short (close below bullish FVG = structure failed)

export interface FlowModelData {
  bias:          'bullish' | 'bearish' | 'neutral'
  htfFvg:       FVGZone | null        // M30 FVG driving bias
  restingLiq:    number | null         // M5 swing H/L inside HTF FVG
  swept:         boolean               // resting liquidity swept today
  sweepTime:     number | null
  currentEma13:  number | null         // latest M5 13 EMA value
  signals:       Signal[]
}

function computeEMA(candles: Candle[], period: number): number[] {
  const k    = 2 / (period + 1)
  const emas = new Array(candles.length).fill(0) as number[]
  if (candles.length < period) return emas
  emas[period - 1] = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = period; i < candles.length; i++) {
    emas[i] = candles[i].close * k + emas[i - 1] * (1 - k)
  }
  return emas
}

export function computeFlowModelData(m30: Candle[], m5: Candle[]): FlowModelData {
  const EMPTY: FlowModelData = { bias: 'neutral', htfFvg: null, restingLiq: null, swept: false, sweepTime: null, currentEma13: null, signals: [] }
  if (m30.length < 3 || m5.length < 20) return EMPTY

  // ── Step 1: HTF FVG from M30 ──────────────────────────────────────────────
  const fvgs30   = findFVGs(m30.slice(-200), 0.5)
  const unfilled = fvgs30.filter(g => !g.filled)
  const htfFvg   = unfilled.length > 0 ? unfilled[unfilled.length - 1] : null
  const bias: 'bullish' | 'bearish' | 'neutral' = htfFvg?.type ?? 'neutral'
  if (bias === 'neutral' || !htfFvg) return EMPTY
  const fvg = htfFvg  // non-null reference for TypeScript

  // ── 13 EMA on M5 ──────────────────────────────────────────────────────────
  const emas        = computeEMA(m5, 13)
  const lastEma     = emas[emas.length - 1]
  const currentEma13 = lastEma > 0 ? lastEma : null

  // ── Step 2: Resting liquidity INSIDE HTF FVG (M5 swing H/L) ──────────────
  const SWING = 3
  let restingLiq: number | null = null
  if (bias === 'bullish') {
    const inside: number[] = []
    for (let i = SWING; i < m5.length - SWING; i++) {
      const c = m5[i]
      const isL = m5.slice(i - SWING, i).every(x => x.low  >= c.low)  &&
                  m5.slice(i + 1, i + SWING + 1).every(x => x.low  >= c.low)
      if (isL && c.low >= fvg.bottom && c.low <= fvg.top) inside.push(c.low)
    }
    restingLiq = inside.length > 0 ? Math.min(...inside) : fvg.bottom
  } else {
    const inside: number[] = []
    for (let i = SWING; i < m5.length - SWING; i++) {
      const c = m5[i]
      const isH = m5.slice(i - SWING, i).every(x => x.high <= c.high) &&
                  m5.slice(i + 1, i + SWING + 1).every(x => x.high <= c.high)
      if (isH && c.high >= fvg.bottom && c.high <= fvg.top) inside.push(c.high)
    }
    restingLiq = inside.length > 0 ? Math.max(...inside) : fvg.top
  }

  // ── Today's M5 candles + liquidity zones for TP targeting ────────────────
  const lastM5   = m5[m5.length - 1]
  const todayCT  = toCentralDate(lastM5.time)
  const [ty, tm, td] = [todayCT.getFullYear(), todayCT.getMonth(), todayCT.getDate()]
  const todayM5  = m5.filter(c => {
    const ct = toCentralDate(c.time)
    return ct.getFullYear() === ty && ct.getMonth() === tm && ct.getDate() === td
  })
  const offset   = m5.length - todayM5.length

  const liqZones = findLiquidityZones(m5)
  const bslAbove = (p: number) => liqZones.filter(z => z.type === 'BSL' && !z.swept && z.level > p).sort((a, b) => a.level - b.level)[0]?.level
  const sslBelow = (p: number) => liqZones.filter(z => z.type === 'SSL' && !z.swept && z.level < p).sort((a, b) => b.level - a.level)[0]?.level

  // Trading window: 9:30–10:20 AM EST = 8:30–9:20 AM CT
  const WIN_START = 8 * 60 + 30
  const WIN_END   = 9 * 60 + 20

  const signals: Signal[] = []
  const seen    = new Set<number>()
  let swept     = false
  let sweepTime: number | null = null
  let sweepIdx  = -1

  for (let i = 0; i < todayM5.length; i++) {
    const c   = todayM5[i]
    const ema = emas[offset + i]
    if (!ema) continue
    if (seen.has(c.time)) continue

    const ct   = toCentralDate(c.time)
    const mins = ct.getHours() * 60 + ct.getMinutes()

    // ── Detect resting-liquidity sweep ────────────────────────────────────
    if (!swept && restingLiq !== null) {
      if (bias === 'bullish' && c.low < restingLiq && c.close > restingLiq) {
        swept = true; sweepTime = c.time; sweepIdx = i
      } else if (bias === 'bearish' && c.high > restingLiq && c.close < restingLiq) {
        swept = true; sweepTime = c.time; sweepIdx = i
      }
    }

    // ── Step 3: After sweep, 13 EMA break in window ───────────────────────
    if (swept && i > sweepIdx && mins >= WIN_START && mins <= WIN_END) {
      const range = c.high - c.low
      if (range < 0.1) continue

      if (bias === 'bullish' && c.close > ema && c.close > c.open) {
        // Long: bullish close above 13 EMA — entry wick ≤ 25% of range
        const bottomWick = Math.min(c.open, c.close) - c.low
        if (range > 0 && bottomWick / range > 0.25) continue
        const stop = c.low - 0.5
        const risk = c.close - stop
        if (risk < 0.5) continue
        signals.push({
          type: 'CONT', label: 'FLOW LONG ↑', time: c.time,
          entryPrice: c.close, stopPrice: stop,
          targetPrice: c.close + risk,
          target2:     bslAbove(c.close) ?? c.close + 2 * risk,
          target3:     c.close + 3 * risk,
        })
        seen.add(c.time)
        swept = false; sweepIdx = -1
      } else if (bias === 'bearish' && c.close < ema && c.close < c.open) {
        // Short: bearish close below 13 EMA — entry wick ≤ 25% of range
        const topWick = c.high - Math.max(c.open, c.close)
        if (range > 0 && topWick / range > 0.25) continue
        const stop = c.high + 0.5
        const risk = stop - c.close
        if (risk < 0.5) continue
        signals.push({
          type: 'TRAP', label: 'FLOW SHORT ↓', time: c.time,
          entryPrice: c.close, stopPrice: stop,
          targetPrice: c.close - risk,
          target2:     sslBelow(c.close) ?? c.close - 2 * risk,
          target3:     c.close - 3 * risk,
        })
        seen.add(c.time)
        swept = false; sweepIdx = -1
      }
    }

    // ── FVG Breakdown SHORT (bullish FVG fails → close below bottom) ──────
    // Waiting for structure to fail: bearish candle closes below FVG bottom in window
    if (!seen.has(c.time) && bias === 'bullish' && mins >= WIN_START && mins <= WIN_END) {
      if (c.close < fvg.bottom && c.close < c.open) {
        const stop = fvg.top + 0.5   // above inverse FVG = resistance
        const risk = stop - c.close
        if (risk >= 0.5) {
          signals.push({
            type: 'TRAP', label: 'FVG BREAK ↓', time: c.time,
            entryPrice: c.close, stopPrice: stop,
            targetPrice: c.close - risk,
            target2:     sslBelow(c.close) ?? c.close - 2 * risk,
            target3:     c.close - 3 * risk,
          })
          seen.add(c.time)
        }
      }
    }
  }

  return {
    bias, htfFvg, restingLiq,
    swept, sweepTime, currentEma13,
    signals: signals.sort((a, b) => a.time - b.time),
  }
}

// ─── London Kill Zone (ICT) — @niccofx playbook ───────────────────────────────
// Window: 2:00–5:00 AM EST. Golden window 2:33–3:00.
// Model: mark Asian range → in KZ sweep Asian Low/High → displacement leaves FVG
//        → enter at CE (Consequent Encroachment = FVG 50%) → SL beyond sweep
//        → TP1 = opposite Asian level, TP2 = range-extension runner.

export type MacroWindow = 1 | 2 | 3 | null

export interface LondonKZData {
  asianHigh:   number | null
  asianLow:    number | null
  dailyBias:   'bullish' | 'bearish' | 'neutral'
  sweepType:   'bullish' | 'bearish' | null   // bullish = Asian-low swept → long; bearish = Asian-high swept → short
  sweepLevel:  number | null
  sweepTime:   number | null
  sweepLow:    number | null
  sweepHigh:   number | null
  fvgTop:      number | null
  fvgBottom:   number | null
  ceEntry:     number | null                   // FVG 50% — the entry level
  inWindow:    boolean                          // last candle is inside 2:00–5:00 EST
  macroWindow: MacroWindow                       // which macro window the last candle sits in
  signals:     Signal[]
}

function getDailyBias(daily: Candle[]): 'bullish' | 'bearish' | 'neutral' {
  if (daily.length < 3) return 'neutral'
  const a = daily[daily.length - 3], b = daily[daily.length - 2], c = daily[daily.length - 1]
  const hh = c.high > b.high && b.high > a.high
  const hl = c.low  > b.low  && b.low  > a.low
  const lh = c.high < b.high && b.high < a.high
  const ll = c.low  < b.low  && b.low  < a.low
  if (hh || hl) return 'bullish'
  if (lh || ll) return 'bearish'
  return 'neutral'
}

function macroWindowFor(mins: number): MacroWindow {
  if (mins >= 2 * 60      && mins < 2 * 60 + 15) return 1   // 2:00–2:15
  if (mins >= 2 * 60 + 33 && mins < 3 * 60)      return 2   // 2:33–3:00 (golden)
  if (mins >= 4 * 60      && mins < 4 * 60 + 15) return 3   // 4:00–4:15
  return null
}

export function computeLondonKZData(daily: Candle[], m5: Candle[]): LondonKZData {
  const EMPTY: LondonKZData = {
    asianHigh: null, asianLow: null, dailyBias: 'neutral',
    sweepType: null, sweepLevel: null, sweepTime: null, sweepLow: null, sweepHigh: null,
    fvgTop: null, fvgBottom: null, ceEntry: null,
    inWindow: false, macroWindow: null, signals: [],
  }
  if (m5.length < 20) return EMPTY

  const dailyBias = getDailyBias(daily)

  // ── Asian range: prev-day 19:00 EST through today 02:00 EST (NY time) ──────
  const lastNY = toNYDate(m5[m5.length - 1].time)
  const [ty, tm, tdd] = [lastNY.getFullYear(), lastNY.getMonth(), lastNY.getDate()]
  const todayKey = `${ty}-${tm}-${tdd}`
  const yest = new Date(ty, tm, tdd - 1)
  const yestKey = `${yest.getFullYear()}-${yest.getMonth()}-${yest.getDate()}`

  const asianCandles = m5.filter(c => {
    const ny  = toNYDate(c.time)
    const key = `${ny.getFullYear()}-${ny.getMonth()}-${ny.getDate()}`
    const tod = ny.getHours() * 60 + ny.getMinutes()
    if (key === yestKey  && tod >= 19 * 60) return true   // 7 PM–midnight prev day
    if (key === todayKey && tod <  2 * 60)  return true   // midnight–2 AM today
    return false
  })
  if (asianCandles.length < 3) return { ...EMPTY, dailyBias }

  const asianHigh = Math.max(...asianCandles.map(c => c.high))
  const asianLow  = Math.min(...asianCandles.map(c => c.low))

  // ── Today's London KZ candles: 2:00–5:00 AM EST ────────────────────────────
  const kz = m5.filter(c => {
    const ny  = toNYDate(c.time)
    const key = `${ny.getFullYear()}-${ny.getMonth()}-${ny.getDate()}`
    if (key !== todayKey) return false
    const tod = ny.getHours() * 60 + ny.getMinutes()
    return tod >= 2 * 60 && tod < 5 * 60
  })

  const lastTod = lastNY.getHours() * 60 + lastNY.getMinutes()
  const inWindow = lastTod >= 2 * 60 && lastTod < 5 * 60
  const macroWindow = macroWindowFor(lastTod)

  if (kz.length === 0) {
    return { ...EMPTY, asianHigh, asianLow, dailyBias, inWindow, macroWindow }
  }

  // ── Detect first sweep of an Asian level (reclaimed) inside KZ ──────────────
  let sweepType: 'bullish' | 'bearish' | null = null
  let sweepLevel: number | null = null
  let sweepTime:  number | null = null
  let sweepLow:   number | null = null
  let sweepHigh:  number | null = null
  let sweepIdx = -1

  for (let i = 0; i < kz.length; i++) {
    const c = kz[i]
    // Long: sweep Asian Low (SSL) — wick below, close back above
    if (c.low < asianLow && c.close > asianLow && dailyBias !== 'bearish') {
      sweepType = 'bullish'; sweepLevel = asianLow; sweepTime = c.time; sweepLow = c.low; sweepHigh = c.high; sweepIdx = i; break
    }
    // Short: sweep Asian High (BSL) — wick above, close back below
    if (c.high > asianHigh && c.close < asianHigh && dailyBias !== 'bullish') {
      sweepType = 'bearish'; sweepLevel = asianHigh; sweepTime = c.time; sweepLow = c.low; sweepHigh = c.high; sweepIdx = i; break
    }
  }

  if (sweepType === null || sweepIdx < 0) {
    return { ...EMPTY, asianHigh, asianLow, dailyBias, inWindow, macroWindow }
  }

  // ── Displacement FVG after the sweep (aligned with sweep direction) ─────────
  const postSweep = kz.slice(sweepIdx)            // include sweep candle as c1 of the gap
  const fvgs = findFVGs(postSweep, 0.8)
  const wantType = sweepType === 'bullish' ? 'bullish' : 'bearish'
  const dispFvg = fvgs.filter(g => g.type === wantType).sort((a, b) => a.time - b.time)[0] ?? null

  let fvgTop: number | null = null
  let fvgBottom: number | null = null
  let ceEntry: number | null = null
  const signals: Signal[] = []

  if (dispFvg) {
    fvgTop = dispFvg.top; fvgBottom = dispFvg.bottom
    ceEntry = dispFvg.mid                          // Consequent Encroachment = 50% of FVG
    const range = asianHigh - asianLow

    // Find the CE retest after the FVG forms → entry trigger
    const gIdx = postSweep.findIndex(c => c.time === dispFvg.time)
    const afterFvg = gIdx >= 0 ? postSweep.slice(gIdx + 2) : []

    for (const c of afterFvg) {
      if (sweepType === 'bullish' && c.low <= ceEntry && c.close >= fvgBottom) {
        const entry = ceEntry
        const stop  = (sweepLow ?? fvgBottom) - 0.5
        const risk  = entry - stop
        if (risk < 0.3) break
        signals.push({
          type: 'CONT', label: 'LKZ LONG ↑', time: c.time,
          entryPrice: entry, stopPrice: stop,
          targetPrice: asianHigh,                          // TP1 = opposite Asian level
          target2:     asianHigh + range * 0.5,            // TP2 = range-extension runner
          target3:     entry + 3 * risk,
        })
        break
      }
      if (sweepType === 'bearish' && c.high >= ceEntry && c.close <= fvgTop) {
        const entry = ceEntry
        const stop  = (sweepHigh ?? fvgTop) + 0.5
        const risk  = stop - entry
        if (risk < 0.3) break
        signals.push({
          type: 'TRAP', label: 'LKZ SHORT ↓', time: c.time,
          entryPrice: entry, stopPrice: stop,
          targetPrice: asianLow,                           // TP1 = opposite Asian level
          target2:     asianLow - range * 0.5,             // TP2 = range-extension runner
          target3:     entry - 3 * risk,
        })
        break
      }
    }
  }

  return {
    asianHigh, asianLow, dailyBias,
    sweepType, sweepLevel, sweepTime, sweepLow, sweepHigh,
    fvgTop, fvgBottom, ceEntry,
    inWindow, macroWindow,
    signals: signals.sort((a, b) => a.time - b.time),
  }
}

// ─── Gold Signal Model ───────────────────────────────────────────────────────
// Macro-filtered session strategy:
// H4 trend gives the trade direction, D1 alignment adds confidence, Asia/London/NY
// liquidity gives the entry trap, M15 structure break confirms the signal.

export type GoldBias = 'bullish' | 'bearish' | 'neutral'
export type GoldSessionName = 'Asia' | 'London' | 'London/NY Overlap' | 'New York' | 'After Hours'

export interface GoldSignalData {
  bias: GoldBias
  d1Trend: GoldBias
  h4Trend: GoldBias
  dxyState: 'confirms' | 'contradicts' | 'neutral' | 'missing'
  dxyClose: number | null
  dxyEma20: number | null
  session: GoldSessionName
  sessionActive: boolean
  asiaHigh: number | null
  asiaLow: number | null
  sweepType: 'bullish' | 'bearish' | null
  sweepLevel: number | null
  sweepTime: number | null
  m15Structure: number | null
  ema20: number | null
  atr14: number | null
  technicalScore: number
  scoreReasons: string[]
  invalidation: string
  signals: Signal[]
}

function toLondonDate(ts: number) {
  return new Date(new Date(ts * 1000).toLocaleString('en-GB', { timeZone: 'Europe/London' }))
}

function computeATR(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const p = candles[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
  }
  const recent = trs.slice(-period)
  return recent.reduce((s, tr) => s + tr, 0) / recent.length
}

function getGoldTrend(candles: Candle[]): GoldBias {
  if (candles.length < 210) return 'neutral'
  const ema50 = computeEMA(candles, 50)
  const ema200 = computeEMA(candles, 200)
  const last = candles[candles.length - 1]
  const e50 = ema50[ema50.length - 1]
  const e200 = ema200[ema200.length - 1]
  if (!e50 || !e200) return 'neutral'
  if (last.close > e200 && e50 > e200) return 'bullish'
  if (last.close < e200 && e50 < e200) return 'bearish'
  return 'neutral'
}

function getGoldSession(ts: number): { name: GoldSessionName; active: boolean } {
  const ldn = toLondonDate(ts)
  const mins = ldn.getHours() * 60 + ldn.getMinutes()
  if (mins >= 0 && mins < 7 * 60) return { name: 'Asia', active: false }
  if (mins >= 7 * 60 && mins < 13 * 60) return { name: 'London', active: true }
  if (mins >= 13 * 60 && mins < 17 * 60) return { name: 'London/NY Overlap', active: true }
  if (mins >= 17 * 60 && mins < 22 * 60) return { name: 'New York', active: true }
  return { name: 'After Hours', active: false }
}

function currentLondonDayCandles(candles: Candle[]) {
  if (!candles.length) return []
  const last = toLondonDate(candles[candles.length - 1].time)
  const [y, m, d] = [last.getFullYear(), last.getMonth(), last.getDate()]
  return candles.filter(c => {
    const ldn = toLondonDate(c.time)
    return ldn.getFullYear() === y && ldn.getMonth() === m && ldn.getDate() === d
  })
}

function getAsiaRange(m5: Candle[]) {
  const today = currentLondonDayCandles(m5)
  const asia = today.filter(c => {
    const ldn = toLondonDate(c.time)
    const mins = ldn.getHours() * 60 + ldn.getMinutes()
    return mins >= 0 && mins < 7 * 60
  })
  if (asia.length < 4) return { high: null, low: null }
  return {
    high: Math.max(...asia.map(c => c.high)),
    low: Math.min(...asia.map(c => c.low)),
  }
}

function lastM15Structure(m15: Candle[], bias: GoldBias) {
  const recent = m15.slice(-32, -1)
  if (recent.length < 10) return null
  if (bias === 'bullish') return Math.max(...recent.map(c => c.high))
  if (bias === 'bearish') return Math.min(...recent.map(c => c.low))
  return null
}

function getDxyState(dxy: Candle[], bias: GoldBias, ts?: number): Pick<GoldSignalData, 'dxyState' | 'dxyClose' | 'dxyEma20'> {
  if (bias === 'neutral' || dxy.length < 25) return { dxyState: 'missing', dxyClose: null, dxyEma20: null }
  const scoped = ts ? dxy.filter(c => c.time <= ts) : dxy
  if (scoped.length < 25) return { dxyState: 'missing', dxyClose: null, dxyEma20: null }
  const emas = computeEMA(scoped, 20)
  const last = scoped[scoped.length - 1]
  const prev = scoped[scoped.length - 2]
  const ema20 = emas[emas.length - 1]
  if (!last || !prev || !ema20) return { dxyState: 'missing', dxyClose: null, dxyEma20: null }

  const dxyBullish = last.close > ema20 && last.close > prev.close
  const dxyBearish = last.close < ema20 && last.close < prev.close
  const confirms =
    (bias === 'bullish' && dxyBearish) ||
    (bias === 'bearish' && dxyBullish)
  const contradicts =
    (bias === 'bullish' && dxyBullish) ||
    (bias === 'bearish' && dxyBearish)

  return {
    dxyState: confirms ? 'confirms' : contradicts ? 'contradicts' : 'neutral',
    dxyClose: last.close,
    dxyEma20: ema20,
  }
}

export function computeGoldSignalData(daily: Candle[], h4: Candle[], m15: Candle[], m5: Candle[], dxy: Candle[] = []): GoldSignalData {
  const EMPTY: GoldSignalData = {
    bias: 'neutral', d1Trend: 'neutral', h4Trend: 'neutral',
    dxyState: 'missing', dxyClose: null, dxyEma20: null,
    session: 'After Hours', sessionActive: false,
    asiaHigh: null, asiaLow: null,
    sweepType: null, sweepLevel: null, sweepTime: null,
    m15Structure: null, ema20: null, atr14: null,
    technicalScore: 0, scoreReasons: [],
    invalidation: 'Waiting for H4 trend, Asia range, session sweep, and M15 confirmation.',
    signals: [],
  }
  if (m5.length < 30 || m15.length < 40) return EMPTY

  const lastM5 = m5[m5.length - 1]
  const { name: session, active: sessionActive } = getGoldSession(lastM5.time)
  const d1Trend = getGoldTrend(daily)
  const h4Trend = getGoldTrend(h4)
  const bias: GoldBias = h4Trend
  const dxyNow = getDxyState(dxy, bias)
  const { high: asiaHigh, low: asiaLow } = getAsiaRange(m5)
  const ema20s = computeEMA(m15, 20)
  const ema20 = ema20s[ema20s.length - 1] || null
  const atr14 = computeATR(m15, 14)
  const m15Structure = lastM15Structure(m15, bias)

  const scoreReasons: string[] = []
  let technicalScore = 0
  if (h4Trend === bias && bias !== 'neutral') { technicalScore += 2; scoreReasons.push('H4 trend aligned') }
  if (d1Trend === bias && bias !== 'neutral') { technicalScore += 1; scoreReasons.push('D1 trend confirms') }
  if (dxyNow.dxyState === 'confirms') { technicalScore += 1; scoreReasons.push('DXY inverse confirms') }
  if (dxyNow.dxyState === 'contradicts') { technicalScore -= 1; scoreReasons.push('DXY contradicts') }
  if (sessionActive) { technicalScore += 1; scoreReasons.push(`${session} liquidity window`) }
  if (atr14 && atr14 >= 1) { technicalScore += 1; scoreReasons.push('ATR supports movement') }

  let sweepType: 'bullish' | 'bearish' | null = null
  let sweepLevel: number | null = null
  let sweepTime: number | null = null
  let sweepHigh: number | null = null
  let sweepLow: number | null = null

  const todayM5 = currentLondonDayCandles(m5)
  const postAsia = todayM5.filter(c => {
    const ldn = toLondonDate(c.time)
    return ldn.getHours() * 60 + ldn.getMinutes() >= 7 * 60
  })
  if (bias === 'bullish' && asiaLow !== null) {
    const sw = postAsia.find(c => c.low < asiaLow && c.close > asiaLow)
    if (sw) {
      sweepType = 'bullish'; sweepLevel = asiaLow; sweepTime = sw.time; sweepHigh = sw.high; sweepLow = sw.low
      technicalScore += 1; scoreReasons.push('Asia low swept and reclaimed')
    }
  } else if (bias === 'bearish' && asiaHigh !== null) {
    const sw = postAsia.find(c => c.high > asiaHigh && c.close < asiaHigh)
    if (sw) {
      sweepType = 'bearish'; sweepLevel = asiaHigh; sweepTime = sw.time; sweepHigh = sw.high; sweepLow = sw.low
      technicalScore += 1; scoreReasons.push('Asia high swept and rejected')
    }
  }

  const signals: Signal[] = []
  if (bias !== 'neutral' && sessionActive && sweepTime && m15Structure && ema20 && atr14 && sweepHigh !== null && sweepLow !== null) {
    const postSweepM15 = m15.filter(c => c.time > sweepTime)
    for (const c of postSweepM15) {
      const range = c.high - c.low
      if (range <= 0) continue
      if (bias === 'bullish' && c.close > m15Structure && c.close > ema20 && c.close > c.open) {
        const dxyAtEntry = getDxyState(dxy, bias, c.time)
        if (dxyAtEntry.dxyState === 'contradicts') break
        technicalScore += 1; scoreReasons.push('M15 broke structure above 20 EMA')
        const stop = sweepLow - atr14 * 0.3
        const risk = c.close - stop
        if (risk >= 0.5) {
          signals.push({
            type: 'CONT', label: 'GOLD LONG ↑', time: c.time,
            entryPrice: c.close, stopPrice: stop,
            targetPrice: c.close + risk,
            target2: asiaHigh && asiaHigh > c.close ? asiaHigh : c.close + 2 * risk,
            target3: c.close + 3 * risk,
          })
        }
        break
      }
      if (bias === 'bearish' && c.close < m15Structure && c.close < ema20 && c.close < c.open) {
        const dxyAtEntry = getDxyState(dxy, bias, c.time)
        if (dxyAtEntry.dxyState === 'contradicts') break
        technicalScore += 1; scoreReasons.push('M15 broke structure below 20 EMA')
        const stop = sweepHigh + atr14 * 0.3
        const risk = stop - c.close
        if (risk >= 0.5) {
          signals.push({
            type: 'TRAP', label: 'GOLD SHORT ↓', time: c.time,
            entryPrice: c.close, stopPrice: stop,
            targetPrice: c.close - risk,
            target2: asiaLow && asiaLow < c.close ? asiaLow : c.close - 2 * risk,
            target3: c.close - 3 * risk,
          })
        }
        break
      }
    }
  }

  const invalidation = bias === 'bullish'
    ? 'Invalid if price closes back below the sweep low or H4 trend flips neutral/bearish.'
    : bias === 'bearish'
      ? 'Invalid if price closes back above the sweep high or H4 trend flips neutral/bullish.'
      : 'No directional signal until H4 trend is clear.'

  return {
    bias, d1Trend, h4Trend, session, sessionActive,
    ...dxyNow,
    asiaHigh, asiaLow, sweepType, sweepLevel, sweepTime,
    m15Structure, ema20, atr14,
    technicalScore: Math.min(8, technicalScore),
    scoreReasons, invalidation,
    signals: signals.sort((a, b) => a.time - b.time),
  }
}

// ─── DXY-Gold Correlation Strategy ───────────────────────────────────────────
// When DXY makes a big directional push but gold fails to move inversely
// (the mismatch), a DXY pullback triggers gold's catch-up move.

export interface DXYCorrelData {
  dxyPushDir: 'up' | 'down' | null
  dxyPushMag: number | null
  dxyPushPct: number | null
  dxyPushStartTime: number | null
  dxyPushEndTime: number | null
  dxyPushStartPrice: number | null
  dxyPushEndPrice: number | null
  dxyCurrentPrice: number | null
  dxyPullbackDetected: boolean
  dxyPullbackPct: number | null
  goldMoveActual: number | null
  goldMovePct: number | null
  goldExpectedDir: 'up' | 'down' | null
  mismatchRatio: number | null
  mismatchSeverity: 'strong' | 'moderate' | 'weak' | 'none'
  status: 'scanning' | 'no_setup' | 'mismatch_found' | 'pullback_detected' | 'signal_ready'
  signals: Signal[]
  invalidation: string
}

export function computeDXYCorrelData(dxy: Candle[], m15Gold: Candle[]): DXYCorrelData {
  const EMPTY: DXYCorrelData = {
    dxyPushDir: null, dxyPushMag: null, dxyPushPct: null,
    dxyPushStartTime: null, dxyPushEndTime: null,
    dxyPushStartPrice: null, dxyPushEndPrice: null, dxyCurrentPrice: null,
    dxyPullbackDetected: false, dxyPullbackPct: null,
    goldMoveActual: null, goldMovePct: null, goldExpectedDir: null,
    mismatchRatio: null, mismatchSeverity: 'none',
    status: 'scanning', signals: [],
    invalidation: 'Scanning for DXY directional push (last 12 hours)…',
  }
  if (dxy.length < 20 || m15Gold.length < 20) return EMPTY

  // Step 1: find biggest net move in any 4–20 bar window over last 48 M15 bars
  const dxyWindow = dxy.slice(-48)
  let bestStart = -1, bestEnd = -1, bestNet = 0
  for (let sz = 4; sz <= 20; sz++) {
    for (let i = 0; i <= dxyWindow.length - sz; i++) {
      const net = dxyWindow[i + sz - 1].close - dxyWindow[i].open
      if (Math.abs(net) > Math.abs(bestNet)) { bestNet = net; bestStart = i; bestEnd = i + sz - 1 }
    }
  }
  if (bestStart === -1 || Math.abs(bestNet) < 0.12) {
    return { ...EMPTY, invalidation: 'No significant DXY push in last 12 hours.' }
  }

  const pushStartCandle = dxyWindow[bestStart]
  const pushEndCandle   = dxyWindow[bestEnd]
  const dxyPushDir: 'up' | 'down' = bestNet > 0 ? 'up' : 'down'
  const dxyPushMag      = Math.abs(pushEndCandle.close - pushStartCandle.open)
  const dxyPushPct      = (dxyPushMag / pushStartCandle.open) * 100
  const dxyCurrentPrice = dxy[dxy.length - 1].close

  // Step 2: measure gold's move during the same window
  const pushGold = m15Gold.filter(c => c.time >= pushStartCandle.time && c.time <= pushEndCandle.time)
  if (pushGold.length < 1) {
    return {
      ...EMPTY, dxyPushDir, dxyPushMag, dxyPushPct, dxyCurrentPrice,
      dxyPushStartTime: pushStartCandle.time, dxyPushEndTime: pushEndCandle.time,
      dxyPushStartPrice: pushStartCandle.open, dxyPushEndPrice: pushEndCandle.close,
      invalidation: 'Gold data not aligned with DXY push window.',
    }
  }
  const goldMoveActual = pushGold[pushGold.length - 1].close - pushGold[0].open
  const goldMovePct    = (goldMoveActual / pushGold[0].open) * 100
  const goldExpectedDir: 'up' | 'down' = dxyPushDir === 'up' ? 'down' : 'up'
  const expectedSign = dxyPushDir === 'up' ? -1 : 1

  // Mismatch: how much did gold FAIL to move inversely?
  const actualAligned = expectedSign * goldMovePct
  let mismatchRatio: number
  if (actualAligned >= dxyPushPct * 0.8) {
    mismatchRatio = 0
  } else if (actualAligned < 0) {
    mismatchRatio = Math.min(1, 0.65 + Math.abs(goldMovePct) / (dxyPushPct + 0.01) * 0.35)
  } else {
    mismatchRatio = Math.min(1, (dxyPushPct - actualAligned) / (dxyPushPct + 0.01))
  }
  const mismatchSeverity: DXYCorrelData['mismatchSeverity'] =
    mismatchRatio >= 0.6 ? 'strong' : mismatchRatio >= 0.35 ? 'moderate' :
    mismatchRatio > 0.1 ? 'weak' : 'none'

  const baseReturn = {
    dxyPushDir, dxyPushMag, dxyPushPct,
    dxyPushStartTime: pushStartCandle.time, dxyPushEndTime: pushEndCandle.time,
    dxyPushStartPrice: pushStartCandle.open, dxyPushEndPrice: pushEndCandle.close,
    dxyCurrentPrice, goldMoveActual, goldMovePct, goldExpectedDir,
    mismatchRatio, mismatchSeverity,
  }

  if (mismatchSeverity === 'none' || mismatchSeverity === 'weak') {
    return { ...EMPTY, ...baseReturn, status: 'no_setup',
      invalidation: `Gold tracked DXY (${(mismatchRatio * 100).toFixed(0)}% lag). No catch-up trade.` }
  }

  // Step 3: detect DXY pullback ≥25% of push magnitude after push end
  const postPushDXY = dxy.filter(c => c.time > pushEndCandle.time)
  let dxyPullbackDetected = false
  let dxyPullbackPct: number | null = null
  let pullbackTime: number | null = null

  if (postPushDXY.length > 0) {
    if (dxyPushDir === 'up') {
      const lowest = Math.min(...postPushDXY.map(c => c.low))
      dxyPullbackPct = ((pushEndCandle.close - lowest) / dxyPushMag) * 100
      if (dxyPullbackPct >= 25) {
        dxyPullbackDetected = true
        pullbackTime = (postPushDXY.find(c => c.close < pushEndCandle.close - dxyPushMag * 0.1) ?? postPushDXY[0]).time
      }
    } else {
      const highest = Math.max(...postPushDXY.map(c => c.high))
      dxyPullbackPct = ((highest - pushEndCandle.close) / dxyPushMag) * 100
      if (dxyPullbackPct >= 25) {
        dxyPullbackDetected = true
        pullbackTime = (postPushDXY.find(c => c.close > pushEndCandle.close + dxyPushMag * 0.1) ?? postPushDXY[0]).time
      }
    }
  }

  if (!dxyPullbackDetected) {
    return { ...EMPTY, ...baseReturn, dxyPullbackDetected, dxyPullbackPct: dxyPullbackPct ?? null,
      status: 'mismatch_found',
      invalidation: `${mismatchSeverity.toUpperCase()} mismatch (${(mismatchRatio * 100).toFixed(0)}% lag). Wait for DXY pullback ≥25%.` }
  }

  // Step 4: gold catch-up entry after DXY pullback
  const goldDir = goldExpectedDir === 'up' ? 1 : -1
  const postPullbackGold = m15Gold.filter(c => pullbackTime !== null && c.time >= pullbackTime)
  const atr = computeATR(m15Gold, 14) ?? (Math.abs(goldMoveActual) * 0.5 + 1)

  const signals: Signal[] = []
  for (const c of postPullbackGold) {
    const confirmsDir = goldDir === 1 ? c.close > c.open : c.close < c.open
    if (!confirmsDir) continue
    const entry = c.close
    const stop  = goldDir === 1
      ? Math.min(c.low, entry - atr) - atr * 0.2
      : Math.max(c.high, entry + atr) + atr * 0.2
    const risk  = Math.abs(entry - stop)
    if (risk < 0.5) continue
    const lagPts  = Math.abs(goldMoveActual) * (mismatchRatio / Math.max(0.01, 1 - mismatchRatio))
    const catchUp = Math.max(2 * risk, lagPts)
    signals.push({
      type: goldDir === 1 ? 'CONT' : 'TRAP',
      label: goldDir === 1 ? 'DXY CORR LONG ↑' : 'DXY CORR SHORT ↓',
      time: c.time, entryPrice: entry, stopPrice: stop,
      targetPrice: goldDir === 1 ? entry + risk    : entry - risk,
      target2:     goldDir === 1 ? entry + catchUp : entry - catchUp,
      target3:     goldDir === 1 ? entry + 3 * risk : entry - 3 * risk,
    })
    break
  }

  const invalidation = dxyPushDir === 'up'
    ? 'Invalid if DXY resumes above push high — catch-up trade canceled.'
    : 'Invalid if DXY resumes below push low — catch-up trade canceled.'

  return {
    ...baseReturn, dxyPullbackDetected, dxyPullbackPct,
    status: signals.length > 0 ? 'signal_ready' : 'pullback_detected',
    signals, invalidation,
  }
}

// ─── Zone Ping-Pong (MTF Zone Strategy) ──────────────────────────────────────

export interface ZonePP {
  level: number
  type: 'buy' | 'sell'
  touches: number
  strength: 'weak' | 'moderate' | 'strong'
}

export interface ZonePingPongData {
  h4Trend: 'bullish' | 'bearish' | 'neutral'
  h2Trend: 'bullish' | 'bearish' | 'neutral'
  h1Trend: 'bullish' | 'bearish' | 'neutral'
  overallBias: 'bullish' | 'bearish' | 'neutral'
  buyZones: ZonePP[]
  sellZones: ZonePP[]
  activeZoneType: 'buy' | 'sell' | null
  activeZone: ZonePP | null
  confirmType: 'engulfing' | 'morning_star' | 'evening_star' | 'fvg_inv' | null
  atr4h: number | null
  signals: Signal[]
  invalidation: string
}

function aggregateCandles(candles: Candle[], factor: number): Candle[] {
  const result: Candle[] = []
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const slice = candles.slice(i, i + factor)
    result.push({
      time: slice[0].time,
      open: slice[0].open,
      high: Math.max(...slice.map(c => c.high)),
      low: Math.min(...slice.map(c => c.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((s, c) => s + c.volume, 0),
      complete: slice[slice.length - 1].complete,
    })
  }
  return result
}

function detectTrendByEma(candles: Candle[], period = 20): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < period + 5) return 'neutral'
  const emas = computeEMA(candles, period)
  const last = candles[candles.length - 1]
  const e = emas[emas.length - 1]
  if (!e) return 'neutral'
  const diff = (last.close - e) / e
  if (diff > 0.0003) return 'bullish'
  if (diff < -0.0003) return 'bearish'
  return 'neutral'
}

function findSwingHighs(candles: Candle[], lookback = 3): number[] {
  const highs: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high
    const isHigh = candles.slice(i - lookback, i).every(c => c.high <= h) &&
                   candles.slice(i + 1, i + lookback + 1).every(c => c.high < h)
    if (isHigh) highs.push(h)
  }
  return highs
}

function findSwingLows(candles: Candle[], lookback = 3): number[] {
  const lows: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const l = candles[i].low
    const isLow = candles.slice(i - lookback, i).every(c => c.low >= l) &&
                  candles.slice(i + 1, i + lookback + 1).every(c => c.low > l)
    if (isLow) lows.push(l)
  }
  return lows
}

function clusterLevels(levels: number[], tolerance: number): { level: number; touches: number }[] {
  if (!levels.length) return []
  const sorted = [...levels].sort((a, b) => a - b)
  const clusters: { level: number; touches: number }[] = []
  let group = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= tolerance) {
      group.push(sorted[i])
    } else {
      clusters.push({ level: group.reduce((s, v) => s + v, 0) / group.length, touches: group.length })
      group = [sorted[i]]
    }
  }
  clusters.push({ level: group.reduce((s, v) => s + v, 0) / group.length, touches: group.length })
  return clusters.filter(c => c.touches >= 2)
}

function detectEngulfing(candles: Candle[], dir: 'bull' | 'bear'): boolean {
  if (candles.length < 2) return false
  const curr = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  if (dir === 'bull') return curr.close > curr.open && curr.close > prev.high && curr.open < prev.low
  return curr.close < curr.open && curr.close < prev.low && curr.open > prev.high
}

function detectMorningStar(candles: Candle[]): boolean {
  if (candles.length < 3) return false
  const [a, b, c] = candles.slice(-3)
  return a.close < a.open &&
    Math.abs(b.close - b.open) < (a.open - a.close) * 0.3 &&
    c.close > c.open &&
    c.close > (a.open + a.close) / 2
}

function detectEveningStar(candles: Candle[]): boolean {
  if (candles.length < 3) return false
  const [a, b, c] = candles.slice(-3)
  return a.close > a.open &&
    Math.abs(b.close - b.open) < (a.close - a.open) * 0.3 &&
    c.close < c.open &&
    c.close < (a.open + a.close) / 2
}

export function computeZonePingPongData(h4: Candle[], m30: Candle[], m15: Candle[], m5: Candle[]): ZonePingPongData {
  const EMPTY: ZonePingPongData = {
    h4Trend: 'neutral', h2Trend: 'neutral', h1Trend: 'neutral', overallBias: 'neutral',
    buyZones: [], sellZones: [], activeZoneType: null, activeZone: null,
    confirmType: null, atr4h: null, signals: [], invalidation: 'Need H4 + M30 data',
  }

  if (h4.length < 30 || m30.length < 20) return EMPTY

  const h2 = aggregateCandles(m30, 4)
  const h1 = aggregateCandles(m30, 2)

  const h4Trend = detectTrendByEma(h4, 20)
  const h2Trend = detectTrendByEma(h2, 20)
  const h1Trend = detectTrendByEma(h1, 20)

  const bullCount = [h4Trend, h2Trend, h1Trend].filter(t => t === 'bullish').length
  const bearCount = [h4Trend, h2Trend, h1Trend].filter(t => t === 'bearish').length
  const overallBias = bullCount >= 2 ? 'bullish' : bearCount >= 2 ? 'bearish' : 'neutral'

  const atr4h = computeATR(h4, 14)
  const tol = (atr4h ?? 5) * 0.5

  const allHighs = [...findSwingHighs(h4, 3), ...findSwingHighs(h2, 3), ...findSwingHighs(h1, 3)]
  const allLows  = [...findSwingLows(h4, 3),  ...findSwingLows(h2, 3),  ...findSwingLows(h1, 3)]

  const toZone = (c: { level: number; touches: number }, type: 'buy' | 'sell'): ZonePP => ({
    level: c.level, type, touches: c.touches,
    strength: c.touches >= 4 ? 'strong' : c.touches === 3 ? 'moderate' : 'weak',
  })

  const sellZones = clusterLevels(allHighs, tol).map(c => toZone(c, 'sell')).sort((a, b) => b.level - a.level)
  const buyZones  = clusterLevels(allLows, tol).map(c => toZone(c, 'buy')).sort((a, b) => b.level - a.level)

  if (!sellZones.length && !buyZones.length) {
    return { ...EMPTY, h4Trend, h2Trend, h1Trend, overallBias, atr4h, invalidation: 'No multi-touch zones found. Need more H4 structure.' }
  }

  const lastCandle = m15.length > 0 ? m15[m15.length - 1] : (m30.length > 0 ? m30[m30.length - 1] : null)
  if (!lastCandle) return { ...EMPTY, h4Trend, h2Trend, h1Trend, overallBias, sellZones, buyZones, atr4h, invalidation: 'No M15 data' }

  const price = lastCandle.close
  const proximity = (atr4h ?? 5) * 1.0

  const nearSell = sellZones.find(z => Math.abs(price - z.level) <= proximity)
  const nearBuy  = buyZones.find(z => Math.abs(price - z.level) <= proximity)
  const activeZone = nearSell ?? nearBuy ?? null
  const activeZoneType: 'buy' | 'sell' | null = nearSell ? 'sell' : nearBuy ? 'buy' : null

  if (!activeZone) {
    const nearest = [...sellZones, ...buyZones].sort((a, b) => Math.abs(price - a.level) - Math.abs(price - b.level))[0]
    return {
      ...EMPTY, h4Trend, h2Trend, h1Trend, overallBias, sellZones, buyZones, atr4h,
      invalidation: nearest
        ? `Price ${price.toFixed(2)} — nearest zone at ${nearest.level.toFixed(2)} (${nearest.type}). Waiting for price to reach it.`
        : 'Waiting for price to reach a zone.',
    }
  }

  const confirmCandles = m15.length >= 3 ? m15 : m30
  const dir = activeZoneType === 'buy' ? 'bull' : 'bear'
  let confirmType: ZonePingPongData['confirmType'] = null

  if (detectEngulfing(confirmCandles, dir)) {
    confirmType = 'engulfing'
  } else if (dir === 'bull' && detectMorningStar(confirmCandles)) {
    confirmType = 'morning_star'
  } else if (dir === 'bear' && detectEveningStar(confirmCandles)) {
    confirmType = 'evening_star'
  } else if (m5.length >= 4) {
    const m5Slice = m5.slice(-5)
    for (let i = 1; i < m5Slice.length - 1; i++) {
      const a = m5Slice[i - 1], c = m5Slice[i + 1]
      if (dir === 'bull' && a.high < c.low  && c.close > c.open) { confirmType = 'fvg_inv'; break }
      if (dir === 'bear' && a.low  > c.high && c.close < c.open) { confirmType = 'fvg_inv'; break }
    }
  }

  const signals: Signal[] = []
  if (confirmType) {
    const atr = computeATR(m15, 14) ?? (atr4h ?? 5) * 0.25
    const isLong = activeZoneType === 'buy'
    const entry = lastCandle.close
    const stop = isLong
      ? Math.min(...m15.slice(-5).map(c => c.low)) - atr * 0.3
      : Math.max(...m15.slice(-5).map(c => c.high)) + atr * 0.3
    const risk = Math.abs(entry - stop)
    if (risk >= 0.5) {
      const oppositeZone = isLong
        ? sellZones.sort((a, b) => a.level - b.level)[0]
        : buyZones.sort((a, b) => b.level - a.level)[0]
      const tp1 = isLong ? entry + risk : entry - risk
      const tp2 = oppositeZone ? oppositeZone.level : (isLong ? entry + 2 * risk : entry - 2 * risk)
      signals.push({
        type: isLong ? 'CONT' : 'TRAP',
        label: isLong ? `ZONE BUY ↑ (${confirmType.replace('_', ' ')})` : `ZONE SELL ↓ (${confirmType.replace('_', ' ')})`,
        time: lastCandle.time,
        entryPrice: entry, stopPrice: stop,
        targetPrice: tp1, target2: tp2, target3: isLong ? entry + 3 * risk : entry - 3 * risk,
      })
    }
  }

  const zoneStr = activeZone.strength.toUpperCase()
  const inval = activeZoneType === 'sell'
    ? `Sell zone ×${activeZone.touches} (${zoneStr}) at ${activeZone.level.toFixed(2)}. Invalid if close above zone high.`
    : `Buy zone ×${activeZone.touches} (${zoneStr}) at ${activeZone.level.toFixed(2)}. Invalid if close below zone low.`

  return {
    h4Trend, h2Trend, h1Trend, overallBias,
    buyZones, sellZones, activeZone, activeZoneType,
    confirmType, atr4h, signals,
    invalidation: signals.length ? inval : (confirmType ? inval : `In ${activeZoneType} zone — waiting for ${dir === 'bull' ? 'bullish' : 'bearish'} confirmation.`),
  }
}

// ─── Low Drawdown Continuation Model (LDCM) ──────────────────────────────────

export interface LDCMData {
  htfBias: 'bullish' | 'bearish' | 'neutral'
  rangeHigh: number | null
  rangeLow: number | null
  equilibrium: number | null
  priceZone: 'premium' | 'discount' | 'equilibrium' | null
  retracementComplete: boolean
  displacementConfirmed: boolean
  displacementHigh: number | null
  displacementLow: number | null
  displacementTime: number | null
  ifvgTop: number | null
  ifvgBottom: number | null
  ifvgType: 'bullish' | 'bearish' | null
  entryReady: boolean
  checklistScore: number
  signals: Signal[]
  invalidation: string
}

export function computeLDCMData(h4: Candle[], m30: Candle[], m15: Candle[], m5: Candle[]): LDCMData {
  const EMPTY: LDCMData = {
    htfBias: 'neutral', rangeHigh: null, rangeLow: null, equilibrium: null,
    priceZone: null, retracementComplete: false, displacementConfirmed: false,
    displacementHigh: null, displacementLow: null, displacementTime: null,
    ifvgTop: null, ifvgBottom: null, ifvgType: null,
    entryReady: false, checklistScore: 0, signals: [], invalidation: 'Need H4 + M30 + M15 data',
  }

  if (h4.length < 25 || m30.length < 20 || m15.length < 10) return EMPTY

  // Step 1: HTF bias from H4 20 EMA
  const htfBias = detectTrendByEma(h4, 20)

  // Step 2: Range = swing high/low of last 40 M30 bars
  const rangeSlice = m30.slice(-40)
  const rangeHigh = Math.max(...rangeSlice.map(c => c.high))
  const rangeLow  = Math.min(...rangeSlice.map(c => c.low))
  const equilibrium = (rangeHigh + rangeLow) / 2

  // Step 3: Price zone relative to equilibrium
  const lastM5 = m5.length > 0 ? m5[m5.length - 1] : m15[m15.length - 1]
  const price = lastM5.close
  const eqTol = (rangeHigh - rangeLow) * 0.05
  const priceZone: LDCMData['priceZone'] =
    price > equilibrium + eqTol ? 'premium' :
    price < equilibrium - eqTol ? 'discount' : 'equilibrium'

  // Step 4: Retracement complete — bullish = price in discount, bearish = premium
  const retracementComplete =
    (htfBias === 'bullish' && priceZone === 'discount') ||
    (htfBias === 'bearish' && priceZone === 'premium')

  // Step 5: Displacement — strong momentum candle on M15 (body ≥ 1.5× ATR)
  const atr15 = computeATR(m15, 14)
  const dispThreshold = (atr15 ?? 5) * 1.5
  const recentM15 = m15.slice(-20)
  let dHigh: number | null = null, dLow: number | null = null, dTime: number | null = null
  for (let i = recentM15.length - 1; i >= 0; i--) {
    const c = recentM15[i]
    const body = Math.abs(c.close - c.open)
    const inDir = htfBias === 'bullish' ? c.close > c.open : c.close < c.open
    if (body >= dispThreshold && inDir) {
      dHigh = c.high; dLow = c.low; dTime = c.time; break
    }
  }
  const displacementConfirmed = dTime !== null

  // Step 6: IFVG — 3-candle gap on M15 after displacement, in bias direction
  let ifvgTop: number | null = null, ifvgBottom: number | null = null
  let ifvgType: LDCMData['ifvgType'] = null
  if (dTime !== null) {
    const postDisp = m15.filter(c => c.time >= dTime!)
    for (let i = 1; i < postDisp.length - 1; i++) {
      const a = postDisp[i - 1], c = postDisp[i + 1]
      if (htfBias === 'bullish' && a.high < c.low) {
        ifvgBottom = a.high; ifvgTop = c.low; ifvgType = 'bullish'; break
      }
      if (htfBias === 'bearish' && a.low > c.high) {
        ifvgTop = a.low; ifvgBottom = c.high; ifvgType = 'bearish'; break
      }
    }
  }

  // Step 7: Entry ready — price retraced into IFVG zone
  const entryReady = !!(ifvgTop && ifvgBottom &&
    price >= ifvgBottom && price <= ifvgTop)

  // Checklist score (8 steps)
  const checks = [
    htfBias !== 'neutral',           // 1. HTF bias
    rangeHigh !== null,              // 2. Range identified
    priceZone !== null,              // 3. Zone identified
    retracementComplete,             // 4. Retracement into zone
    displacementConfirmed,           // 5. Displacement candle
    ifvgType !== null,               // 6. IFVG formed
    entryReady,                      // 7. Price in IFVG (entry timing)
    dLow !== null || dHigh !== null, // 8. Risk placement possible
  ]
  const checklistScore = checks.filter(Boolean).length

  // Signals
  const signals: Signal[] = []
  if (entryReady && checklistScore >= 6 && dHigh !== null && dLow !== null) {
    const atr5 = computeATR(m5.length >= 15 ? m5 : m15, 14) ?? 2
    const isLong = htfBias === 'bullish'
    const entry = price
    const stop = isLong ? dLow - atr5 * 0.2 : dHigh + atr5 * 0.2
    const risk = Math.abs(entry - stop)
    if (risk >= 0.5) {
      signals.push({
        type: isLong ? 'CONT' : 'TRAP',
        label: isLong ? 'LDCM LONG ↑ (IFVG)' : 'LDCM SHORT ↓ (IFVG)',
        time: lastM5.time,
        entryPrice: entry, stopPrice: stop,
        targetPrice: isLong ? entry + risk     : entry - risk,
        target2:     isLong ? entry + 2 * risk : entry - 2 * risk,
        target3:     isLong ? entry + 3 * risk : entry - 3 * risk,
      })
    }
  }

  const p = (n: number) => n.toFixed(2)
  const invalidation =
    signals.length        ? `Stop at displacement ${htfBias === 'bullish' ? 'low' : 'high'} ${dLow !== null && htfBias === 'bullish' ? p(dLow) : dHigh !== null ? p(dHigh) : '—'}. Invalid if price closes back through displacement origin.` :
    htfBias === 'neutral' ? 'No clear H4 bias. Wait for HTF trend to establish.' :
    !retracementComplete  ? `H4 ${htfBias}. Wait for retracement to ${htfBias === 'bullish' ? 'discount' : 'premium'} zone (equil ${p(equilibrium)}).` :
    !displacementConfirmed ? 'Retracement in zone. Wait for displacement candle (body ≥ 1.5× ATR, in bias direction).' :
    !ifvgType             ? 'Displacement confirmed. Wait for IFVG to form after the displacement move.' :
    !entryReady           ? `IFVG ${ifvgBottom ? p(ifvgBottom) : '—'}–${ifvgTop ? p(ifvgTop) : '—'} formed. Wait for price to retrace into it — not during the pullback.` :
    'IFVG reached. Enter AFTER M5 close confirms direction — no anticipation.'

  return {
    htfBias, rangeHigh, rangeLow, equilibrium, priceZone,
    retracementComplete, displacementConfirmed,
    displacementHigh: dHigh, displacementLow: dLow, displacementTime: dTime,
    ifvgTop, ifvgBottom, ifvgType, entryReady,
    checklistScore, signals, invalidation,
  }
}

// ─── Three-Session Gold Reversal (SGR) ───────────────────────────────────────
// Trade gold only in three windows (ET): 2nd hour of Asia, 2nd hour of London,
// 1st hour of New York. Mark recent H1 swing high/low as the day's reversal
// zones. On M5 price taps a zone; on M1 confirm with a 2-candle reversal pair
// (bear-close → bull-close for longs, bull-close → bear-close for shorts).
// Enter after the pair, stop just past the confirm low/high, target opposite zone.

export interface SessionReversalData {
  highZone:      number | null   // recent H1 swing high — short reversal zone
  lowZone:       number | null   // recent H1 swing low  — long reversal zone
  activeSession: string | null   // session window price is currently in
  highTapped:    boolean         // price reached the high zone today
  lowTapped:     boolean         // price reached the low zone today
  signals:       Signal[]
  invalidation:  string
}

// Session windows in ET minutes-from-midnight. London H2 dropped — it was the
// only net-losing session in the Apr–May 2026 backtest (41.7% win, −1.29R).
const SR_WINDOWS: { name: string; start: number; end: number }[] = [
  { name: 'NY H1',     start:  8 * 60, end:  9 * 60 },  // 1st hour of New York
  { name: 'Asia H2',   start: 20 * 60, end: 21 * 60 },  // 2nd hour of Asia
]

function srSessionAt(ts: number): string | null {
  const ny   = toNYDate(ts)
  const mins = ny.getHours() * 60 + ny.getMinutes()
  return SR_WINDOWS.find(w => mins >= w.start && mins < w.end)?.name ?? null
}

function nyDayKey(ts: number): string {
  const d = toNYDate(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Latest confirmed H1 swing high & low (pivot strength `lookback`)
function recentH1Swings(candles: Candle[], lookback = 3): { high: number | null; low: number | null } {
  let high: number | null = null, low: number | null = null
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high
    if (candles.slice(i - lookback, i).every(c => c.high <= h) &&
        candles.slice(i + 1, i + lookback + 1).every(c => c.high < h)) high = h
    const l = candles[i].low
    if (candles.slice(i - lookback, i).every(c => c.low >= l) &&
        candles.slice(i + 1, i + lookback + 1).every(c => c.low > l)) low = l
  }
  return { high, low }
}

export function computeSessionReversalData(h1: Candle[], m5: Candle[], m1: Candle[]): SessionReversalData {
  const EMPTY: SessionReversalData = {
    highZone: null, lowZone: null, activeSession: null,
    highTapped: false, lowTapped: false, signals: [], invalidation: 'Need H1 + M1 data',
  }
  if (h1.length < 12 || m1.length < 5) return EMPTY

  const { high: highZone, low: lowZone } = recentH1Swings(h1.slice(-72), 3)
  if (highZone === null || lowZone === null || highZone <= lowZone) {
    return { ...EMPTY, highZone, lowZone, invalidation: 'No clear H1 swing high/low yet.' }
  }

  const tol      = Math.max(1.0, (highZone - lowZone) * 0.03)  // zone-tap tolerance
  const ATR_MULT = 1.5      // stop distance = 1.5× M1 ATR(14) — survives noise vs a raw wick stop
  const TGT_R    = 1.0      // take-profit = 1R — backtest-tuned for win rate (Apr–May 2026: ~64%)

  // M1 ATR(14) by index, for the stop distance.
  const atr: number[] = new Array(m1.length).fill(0)
  const trs: number[] = []
  for (let i = 0; i < m1.length; i++) {
    const c = m1[i]
    const tr = i === 0 ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - m1[i - 1].close), Math.abs(c.low - m1[i - 1].close))
    trs.push(tr)
    if (i >= 14) atr[i] = trs.slice(i - 13, i + 1).reduce((s, v) => s + v, 0) / 14
  }

  const signals: Signal[] = []
  const fired   = new Set<string>()   // one trade per `${session}-${day}`

  let curDay = '', lowTappedDay = false, highTappedDay = false
  for (let i = 1; i < m1.length; i++) {
    const c1 = m1[i - 1], c2 = m1[i]
    const day = nyDayKey(c2.time)
    if (day !== curDay) { curDay = day; lowTappedDay = false; highTappedDay = false }

    // Track zone taps (M5 tap precondition — M1 lows/highs capture the same touch)
    if (c2.low  <= lowZone  + tol) lowTappedDay  = true
    if (c2.high >= highZone - tol) highTappedDay = true

    const session = srSessionAt(c2.time)
    if (!session) continue
    const key = `${session}-${day}`
    if (fired.has(key)) continue

    const a = atr[i] || tol
    const risk = a * ATR_MULT

    // LONG: low zone tapped, then bearish-close → bullish-close on M1
    if (lowTappedDay && c1.close < c1.open && c2.close > c2.open) {
      const entry = c2.close
      const stop  = entry - risk
      fired.add(key)
      signals.push({ type: 'CONT', label: `${session} REV ↑`, time: c2.time,
        entryPrice: entry, stopPrice: stop, targetPrice: entry + TGT_R * risk })
      continue
    }
    // SHORT: high zone tapped, then bullish-close → bearish-close on M1
    if (highTappedDay && c1.close > c1.open && c2.close < c2.open) {
      const entry = c2.close
      const stop  = entry + risk
      fired.add(key)
      signals.push({ type: 'TRAP', label: `${session} REV ↓`, time: c2.time,
        entryPrice: entry, stopPrice: stop, targetPrice: entry - TGT_R * risk })
    }
  }

  const last          = m1[m1.length - 1]
  const activeSession = srSessionAt(last.time)
  const lastDay       = nyDayKey(last.time)
  const todayM1       = m1.filter(c => nyDayKey(c.time) === lastDay)
  const highTapped    = todayM1.some(c => c.high >= highZone - tol)
  const lowTapped     = todayM1.some(c => c.low  <= lowZone  + tol)

  const p = (n: number) => n.toFixed(2)
  const invalidation =
    signals.length            ? `Last entry ${p(signals[signals.length - 1].entryPrice)} → TP 1R, stop 1.5× ATR.` :
    !activeSession            ? `Outside windows. Trade only NY H1 (08:00 ET) & Asia H2 (20:00 ET). Zones ${p(lowZone)} / ${p(highZone)}.` :
    (!highTapped && !lowTapped) ? `In ${activeSession}. Waiting for a zone tap — low ${p(lowZone)} or high ${p(highZone)}.` :
                                `In ${activeSession}. Zone tapped — waiting for tight M1 2-candle confirm (${lowTapped ? 'bear→bull for long' : 'bull→bear for short'}).`

  return { highZone, lowZone, activeSession, highTapped, lowTapped, signals: signals.sort((a, b) => a.time - b.time), invalidation }
}

// ─── Power of Three — Multi-Session Liquidity (Asia → London → New York) ───────
// Asia (19:00–04:00 ET) builds the liquidity range. London (03:00–09:30 ET)
// manipulates by sweeping ONE side of that range. New York (09:30 ET) opens with
// a fake continuation of London's move, then reverses to the UNTAPPED Asia side.
export interface PowerOfThreeData {
  asiaHigh:      number | null
  asiaLow:       number | null
  londonSwept:   'high' | 'low' | null   // side London took (the tapped liquidity)
  bias:          'long' | 'short' | 'none'
  target:        number | null           // untapped Asia side = the trade target
  fakeDone:      boolean                  // NY printed its fake in London's direction
  activeSession: 'Asia' | 'London' | 'New York' | null
  signals:       Signal[]
  invalidation:  string
}

// Session day rolls over at 18:00 ET — Asia (19:00+) feeds the NEXT ET date's setup.
function p3SessionDayKey(ts: number): string {
  const d = toNYDate(ts)
  const roll = new Date(d)
  if (d.getHours() >= 18) roll.setDate(roll.getDate() + 1)
  return `${roll.getFullYear()}-${roll.getMonth()}-${roll.getDate()}`
}

function p3SessionAt(ts: number): 'Asia' | 'London' | 'New York' | null {
  const d = toNYDate(ts)
  const mins = d.getHours() * 60 + d.getMinutes()
  if (mins >= 570 && mins < 16 * 60) return 'New York'  // 09:30–16:00
  if (mins >= 180 && mins < 570)     return 'London'    // 03:00–09:30
  if (d.getHours() >= 19 || d.getHours() < 4) return 'Asia'  // 19:00–04:00
  return null
}

export function computePowerOfThreeData(m5: Candle[], m1: Candle[]): PowerOfThreeData {
  const EMPTY: PowerOfThreeData = {
    asiaHigh: null, asiaLow: null, londonSwept: null, bias: 'none',
    target: null, fakeDone: false, activeSession: null,
    signals: [], invalidation: 'Need M5 + M1 data',
  }
  if (m5.length < 12 || m1.length < 5) return EMPTY

  const lastTs        = m1[m1.length - 1].time
  const sd            = p3SessionDayKey(lastTs)
  const activeSession = p3SessionAt(lastTs)

  // ── Asia range (current session day, 19:00–04:00 ET) ──
  const asiaBars = m5.filter(c => {
    const h = toNYDate(c.time).getHours()
    return p3SessionDayKey(c.time) === sd && (h >= 19 || h < 4)
  })
  if (asiaBars.length < 3) {
    return { ...EMPTY, activeSession, invalidation: 'Building Asia range (19:00–04:00 ET)…' }
  }
  const asiaHigh = Math.max(...asiaBars.map(c => c.high))
  const asiaLow  = Math.min(...asiaBars.map(c => c.low))
  const range    = asiaHigh - asiaLow

  // ── London sweep (03:00–09:30 ET) — which side did London take? ──
  const lonBars = m5.filter(c => {
    const d = toNYDate(c.time)
    const mn = d.getHours() * 60 + d.getMinutes()
    return p3SessionDayKey(c.time) === sd && mn >= 180 && mn < 570
  })
  const sweptHighBy = lonBars.length ? Math.max(0, Math.max(...lonBars.map(c => c.high)) - asiaHigh) : 0
  const sweptLowBy  = lonBars.length ? Math.max(0, asiaLow - Math.min(...lonBars.map(c => c.low)))  : 0
  let londonSwept: 'high' | 'low' | null = null
  if (sweptHighBy > 0 || sweptLowBy > 0) londonSwept = sweptHighBy >= sweptLowBy ? 'high' : 'low'

  const p = (n: number) => n.toFixed(2)

  if (!londonSwept) {
    return {
      asiaHigh, asiaLow, londonSwept: null, bias: 'none', target: null, fakeDone: false,
      activeSession, signals: [],
      invalidation: lonBars.length
        ? `London hasn't swept the Asia range yet (Hi ${p(asiaHigh)} / Lo ${p(asiaLow)}).`
        : 'Waiting for London (03:00 ET) to sweep one side of Asia.',
    }
  }

  // London took one side → trade the NY reversal back to the UNTAPPED side.
  const bias: 'long' | 'short' = londonSwept === 'low' ? 'long' : 'short'
  const target = londonSwept === 'low' ? asiaHigh : asiaLow

  // ── NY entry (09:30–12:00 ET): fake in London's direction, then reverse ──
  const tol = Math.max(1.0, range * 0.05)
  const nyBars = m1.filter(c => {
    const d = toNYDate(c.time)
    const mn = d.getHours() * 60 + d.getMinutes()
    return p3SessionDayKey(c.time) === sd && mn >= 570 && mn < 720
  })

  const signals: Signal[] = []
  let fakeDone = false
  let fakeExtreme = bias === 'long' ? Infinity : -Infinity
  for (let i = 1; i < nyBars.length; i++) {
    const c1 = nyBars[i - 1], c2 = nyBars[i]
    if (bias === 'long') {
      fakeExtreme = Math.min(fakeExtreme, c2.low)
      // fake = NY pushes below the swept side, continuing London's down move
      if (c2.low <= asiaLow + tol) fakeDone = true
      if (fakeDone && c1.close < c1.open && c2.close > c2.open) {
        const entry = c2.close
        signals.push({ type: 'CONT', label: 'NY REV ↑ → Asia Hi', time: c2.time,
          entryPrice: entry, stopPrice: Math.min(fakeExtreme, c2.low) - tol, targetPrice: target })
        break
      }
    } else {
      fakeExtreme = Math.max(fakeExtreme, c2.high)
      if (c2.high >= asiaHigh - tol) fakeDone = true
      if (fakeDone && c1.close > c1.open && c2.close < c2.open) {
        const entry = c2.close
        signals.push({ type: 'TRAP', label: 'NY REV ↓ → Asia Lo', time: c2.time,
          entryPrice: entry, stopPrice: Math.max(fakeExtreme, c2.high) + tol, targetPrice: target })
        break
      }
    }
  }

  const untapped = londonSwept === 'low' ? 'high' : 'low'
  const invalidation =
    signals.length                ? `Entry ${p(signals[0].entryPrice)} → untapped Asia ${untapped} ${p(target)}. Stop beyond NY fake extreme.` :
    activeSession !== 'New York'   ? `London took Asia ${londonSwept}s. Bias ${bias.toUpperCase()} → ${p(target)}. Wait for 09:30 ET NY open.` :
    !fakeDone                      ? `NY open. Waiting for fake ${bias === 'long' ? 'lower (below Asia low)' : 'higher (above Asia high)'} before reversal.` :
                                     `Fake done. Waiting for M1 ${bias === 'long' ? 'bear→bull' : 'bull→bear'} confirm to enter ${bias}.`

  return { asiaHigh, asiaLow, londonSwept, bias, target, fakeDone, activeSession, signals, invalidation }
}

// ─── Fiji Entry Model ─────────────────────────────────────────────────────────

export interface FijiData {
  orHigh:     number
  orLow:      number
  orbBars:    number
  sweepType:  'high' | 'low' | null
  sweepTime:  number | null
  ifvg:       FVGZone | null
  signals:    Signal[]
  invalidation: string
}

function getFijiORCandles(m1: Candle[]): Candle[] {
  if (!m1.length) return []
  const last = new Date(new Date(m1[m1.length - 1].time * 1000).toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const [y, mo, d] = [last.getFullYear(), last.getMonth(), last.getDate()]
  return m1.filter(c => {
    const aedt = new Date(new Date(c.time * 1000).toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
    if (aedt.getFullYear() !== y || aedt.getMonth() !== mo || aedt.getDate() !== d) return false
    const mins = aedt.getHours() * 60 + aedt.getMinutes()
    return mins >= 480 && mins < 600  // 8:00–10:00 AM AEDT
  })
}

export function computeFijiData(m1: Candle[], m15: Candle[], h4: Candle[]): FijiData {
  const p = (n: number) => n.toFixed(2)
  const empty: FijiData = { orHigh: 0, orLow: 0, orbBars: 0, sweepType: null, sweepTime: null, ifvg: null, signals: [], invalidation: 'Waiting for 8 AM AEDT Asia futures open…' }

  const orCandles = getFijiORCandles(m1)
  if (orCandles.length < 4) {
    if (orCandles.length > 0) return { ...empty, orbBars: orCandles.length, invalidation: `OR building (${orCandles.length} bars)… wait for 10 AM AEDT` }
    return empty
  }

  const orHigh = Math.max(...orCandles.map(c => c.high))
  const orLow  = Math.min(...orCandles.map(c => c.low))
  const lastOrTime = orCandles[orCandles.length - 1].time
  const post = m1.filter(c => c.time > lastOrTime)

  if (!post.length) {
    return { ...empty, orHigh, orLow, orbBars: orCandles.length, invalidation: `OR complete (Hi ${p(orHigh)} Lo ${p(orLow)}). Wait for sweep after 10 AM AEDT…` }
  }

  // Find first sweep of OR High or OR Low
  let sweepIdx = -1
  let sweepType: 'high' | 'low' | null = null
  for (let i = 0; i < post.length; i++) {
    if (sweepType !== null) break
    if (post[i].high > orHigh) { sweepType = 'high'; sweepIdx = i }
    else if (post[i].low < orLow) { sweepType = 'low'; sweepIdx = i }
  }

  if (sweepType === null) {
    return { ...empty, orHigh, orLow, orbBars: orCandles.length, invalidation: `OR Hi ${p(orHigh)} · Lo ${p(orLow)}. Waiting for sweep…` }
  }

  const sweepTime = post[sweepIdx].time
  // Include the sweep candle itself so FVGs from it are detected
  const postSweep = post.slice(sweepIdx)

  // IFVG = FVG that forms during/after the sweep move
  // High sweep (short) → price pumped up → look for bullish FVG (gap left below candles) as IFVG
  // Low sweep (long)  → price dumped down → look for bearish FVG (gap left above candles) as IFVG
  const fvgs = findFVGs(postSweep, 0.5)
  const targetFvgType = sweepType === 'high' ? 'bullish' : 'bearish'
  const ifvg = fvgs.find(f => f.type === targetFvgType && !f.filled) ?? null

  if (!ifvg) {
    return { orHigh, orLow, orbBars: orCandles.length, sweepType, sweepTime, ifvg: null, signals: [],
      invalidation: `OR ${sweepType === 'high' ? 'High' : 'Low'} swept. Waiting for IFVG to form…` }
  }

  // Find entry: V-shape reversal — price closes back through IFVG
  const ifvgIdx = postSweep.findIndex(c => c.time === ifvg.time)
  const afterIfvg = ifvgIdx >= 0 ? postSweep.slice(ifvgIdx + 2) : []
  const signals: Signal[] = []

  if (sweepType === 'high') {
    for (const c of afterIfvg) {
      if (c.close < ifvg.top && c.close < c.open) {
        const risk = Math.max(ifvg.top + 1 - c.close, 1)
        signals.push({ type: 'TRAP', label: 'FIJI SHORT', time: c.time,
          entryPrice: c.close, stopPrice: ifvg.top + 1,
          targetPrice: c.close - risk,
          target2: c.close - 2 * risk,
          target3: orLow,
        })
        break
      }
    }
  } else {
    for (const c of afterIfvg) {
      if (c.close > ifvg.bottom && c.close > c.open) {
        const risk = Math.max(c.close - (ifvg.bottom - 1), 1)
        signals.push({ type: 'CONT', label: 'FIJI LONG', time: c.time,
          entryPrice: c.close, stopPrice: ifvg.bottom - 1,
          targetPrice: c.close + risk,
          target2: c.close + 2 * risk,
          target3: orHigh,
        })
        break
      }
    }
  }

  const invalidation = signals.length
    ? `${signals[0].label} @ ${p(signals[0].entryPrice)} · SL ${p(signals[0].stopPrice)} · TP3 OR ${sweepType === 'high' ? 'Lo' : 'Hi'} ${p(sweepType === 'high' ? orLow : orHigh)}`
    : `IFVG ${p(ifvg.bottom)}–${p(ifvg.top)}. Wait for V-shape close ${sweepType === 'high' ? 'below' : 'above'} IFVG…`

  return { orHigh, orLow, orbBars: orCandles.length, sweepType, sweepTime, ifvg, signals, invalidation }
}

// ─── MY GOLD — Zone Mapping + BOS + FVG Strategy ──────────────────────────────
// Combines @thetraderrichie Zone Mapping (D/H4/H1) with BOS + FVG entry model

export interface MyGoldZone {
  level: number
  type: 'supply' | 'demand'
  timeframe: 'daily' | 'h4' | 'h1'
}

export interface MyGoldFVG {
  top: number
  bottom: number
  mid: number
  type: 'bullish' | 'bearish'
  time: number
  filled: boolean
}

export interface MyGoldData {
  zones: MyGoldZone[]
  nearestSupplyZone: number | null
  nearestDemandZone: number | null
  activeZoneType: 'supply' | 'demand' | null
  htfBias: 'bullish' | 'bearish' | 'neutral'
  dailyTrend: 'bullish' | 'bearish' | 'neutral'
  sweepDetected: boolean
  sweepType: 'bullish' | 'bearish' | null
  sweepLevel: number | null
  sweepTime: number | null
  bosDetected: boolean
  bosLevel: number | null
  bosType: 'bullish' | 'bearish' | null
  bosTime: number | null
  activeFvg: MyGoldFVG | null
  fvg50eq: number | null
  checklistScore: number
  signals: Signal[]
  invalidation: string
}

export function computeMyGoldData(
  daily: Candle[], h4: Candle[], h1: Candle[], m5: Candle[]
): MyGoldData {
  const p = (n: number) => n.toFixed(2)

  const empty: MyGoldData = {
    zones: [], nearestSupplyZone: null, nearestDemandZone: null, activeZoneType: null,
    htfBias: 'neutral', dailyTrend: 'neutral',
    sweepDetected: false, sweepType: null, sweepLevel: null, sweepTime: null,
    bosDetected: false, bosLevel: null, bosType: null, bosTime: null,
    activeFvg: null, fvg50eq: null, checklistScore: 0,
    signals: [], invalidation: 'Insufficient candle data',
  }

  if (daily.length < 5 || h4.length < 10 || m5.length < 20) return empty

  // ── Step 1: Daily swing highs/lows — wick only ────────────────────────────
  const dailyZones: MyGoldZone[] = []
  for (let i = 3; i < daily.length - 3; i++) {
    const c = daily[i]
    const isSwingHigh = daily.slice(i - 3, i).every(x => x.high <= c.high) &&
                        daily.slice(i + 1, i + 4).every(x => x.high <= c.high)
    const isSwingLow  = daily.slice(i - 3, i).every(x => x.low >= c.low) &&
                        daily.slice(i + 1, i + 4).every(x => x.low >= c.low)
    if (isSwingHigh) dailyZones.push({ level: c.high, type: 'supply', timeframe: 'daily' })
    if (isSwingLow)  dailyZones.push({ level: c.low,  type: 'demand', timeframe: 'daily' })
  }

  // ── Step 2: H4 — refine zones ────────────────────────────────────────────
  const h4Zones: MyGoldZone[] = []
  for (let i = 2; i < h4.length - 2; i++) {
    const c = h4[i]
    const isH = h4[i-1].high <= c.high && h4[i-2].high <= c.high && h4[i+1].high <= c.high && h4[i+2].high <= c.high
    const isL = h4[i-1].low  >= c.low  && h4[i-2].low  >= c.low  && h4[i+1].low  >= c.low  && h4[i+2].low  >= c.low
    if (isH) h4Zones.push({ level: c.high, type: 'supply', timeframe: 'h4' })
    if (isL) h4Zones.push({ level: c.low,  type: 'demand', timeframe: 'h4' })
  }

  // ── Step 3: H1 — precision zones ─────────────────────────────────────────
  const h1Zones: MyGoldZone[] = []
  if (h1.length >= 6) {
    for (let i = 2; i < h1.length - 2; i++) {
      const c = h1[i]
      const isH = h1[i-1].high <= c.high && h1[i-2].high <= c.high && h1[i+1].high <= c.high && h1[i+2].high <= c.high
      const isL = h1[i-1].low  >= c.low  && h1[i-2].low  >= c.low  && h1[i+1].low  >= c.low  && h1[i+2].low  >= c.low
      if (isH) h1Zones.push({ level: c.high, type: 'supply', timeframe: 'h1' })
      if (isL) h1Zones.push({ level: c.low,  type: 'demand', timeframe: 'h1' })
    }
  }

  const zones: MyGoldZone[] = [
    ...dailyZones.slice(-8),
    ...h4Zones.slice(-10),
    ...h1Zones.slice(-8),
  ]

  const currentPrice = m5[m5.length - 1]?.close ?? 0
  if (!currentPrice) return { ...empty, zones }

  // ── HTF bias — Daily HH/HL vs LH/LL ─────────────────────────────────────
  let dailyTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral'
  if (daily.length >= 4) {
    const d = daily.slice(-4)
    const hhhl = d[1].high > d[0].high && d[2].high > d[1].high && d[1].low > d[0].low && d[2].low > d[1].low
    const lhll = d[1].high < d[0].high && d[2].high < d[1].high && d[1].low < d[0].low && d[2].low < d[1].low
    dailyTrend = hhhl ? 'bullish' : lhll ? 'bearish' : 'neutral'
  }

  // H4 bias from swings
  let h4Bias: 'bullish' | 'bearish' | 'neutral' = 'neutral'
  const recentH4Supply = h4Zones.slice(-6).filter(z => z.type === 'supply').map(z => z.level)
  const recentH4Demand = h4Zones.slice(-6).filter(z => z.type === 'demand').map(z => z.level)
  if (recentH4Supply.length >= 2 && recentH4Demand.length >= 2) {
    const hhhl = recentH4Supply.at(-1)! > recentH4Supply.at(-2)! && recentH4Demand.at(-1)! > recentH4Demand.at(-2)!
    const lhll = recentH4Supply.at(-1)! < recentH4Supply.at(-2)! && recentH4Demand.at(-1)! < recentH4Demand.at(-2)!
    h4Bias = hhhl ? 'bullish' : lhll ? 'bearish' : 'neutral'
  }

  const htfBias = dailyTrend !== 'neutral' ? dailyTrend : h4Bias

  // Nearest supply/demand zone
  const supplyAbove = zones.filter(z => z.type === 'supply' && z.level > currentPrice).sort((a, b) => a.level - b.level)
  const demandBelow = zones.filter(z => z.type === 'demand' && z.level < currentPrice).sort((a, b) => b.level - a.level)
  const nearestSupplyZone = supplyAbove[0]?.level ?? null
  const nearestDemandZone = demandBelow[0]?.level ?? null

  // ATR for proximity
  const m5ATR = (() => {
    const trs = m5.slice(-14).map((c, i, a) =>
      i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - a[i-1].close), Math.abs(c.low - a[i-1].close))
    )
    return trs.reduce((s, v) => s + v, 0) / trs.length
  })()

  const ZONE_PROX = m5ATR * 4
  let activeZoneType: 'supply' | 'demand' | null = null
  if (nearestSupplyZone && Math.abs(currentPrice - nearestSupplyZone) < ZONE_PROX) activeZoneType = 'supply'
  else if (nearestDemandZone && Math.abs(currentPrice - nearestDemandZone) < ZONE_PROX) activeZoneType = 'demand'

  // ── Step 4: Liquidity sweep on H4 ────────────────────────────────────────
  let sweepDetected = false, sweepType: 'bullish' | 'bearish' | null = null
  let sweepLevel: number | null = null, sweepTime: number | null = null

  const h4Recent = h4.slice(-30)
  const h4SupplyLevels = h4Zones.slice(-8).filter(z => z.type === 'supply').map(z => z.level)
  const h4DemandLevels = h4Zones.slice(-8).filter(z => z.type === 'demand').map(z => z.level)

  for (let i = h4Recent.length - 1; i >= h4Recent.length - 12; i--) {
    if (i < 0) break
    const c = h4Recent[i]
    const sweptLow = h4DemandLevels.find(lv => c.low < lv && c.close > lv)
    if (sweptLow && !sweepDetected) {
      sweepDetected = true; sweepType = 'bullish'; sweepLevel = sweptLow; sweepTime = c.time; break
    }
    const sweptHigh = h4SupplyLevels.find(lv => c.high > lv && c.close < lv)
    if (sweptHigh && !sweepDetected) {
      sweepDetected = true; sweepType = 'bearish'; sweepLevel = sweptHigh; sweepTime = c.time; break
    }
  }

  // ── Step 2 (BOS + FVG entry): BOS on M5 ──────────────────────────────────
  let bosDetected = false, bosLevel: number | null = null
  let bosType: 'bullish' | 'bearish' | null = null, bosTime: number | null = null

  const m5Recent = m5.slice(-80)
  const m5SwingH: { level: number; idx: number }[] = []
  const m5SwingL: { level: number; idx: number }[] = []
  for (let i = 2; i < m5Recent.length - 2; i++) {
    const c = m5Recent[i]
    if (m5Recent[i-1].high <= c.high && m5Recent[i-2].high <= c.high &&
        m5Recent[i+1].high <= c.high && m5Recent[i+2].high <= c.high)
      m5SwingH.push({ level: c.high, idx: i })
    if (m5Recent[i-1].low >= c.low && m5Recent[i-2].low >= c.low &&
        m5Recent[i+1].low >= c.low && m5Recent[i+2].low >= c.low)
      m5SwingL.push({ level: c.low, idx: i })
  }

  for (let i = m5Recent.length - 1; i >= m5Recent.length - 25; i--) {
    const c = m5Recent[i]
    const prevH = m5SwingH.filter(s => s.idx < i).at(-1)
    const prevL = m5SwingL.filter(s => s.idx < i).at(-1)
    if (prevH && c.close > prevH.level && !bosDetected) {
      bosDetected = true; bosLevel = prevH.level; bosType = 'bullish'; bosTime = c.time; break
    }
    if (prevL && c.close < prevL.level && !bosDetected) {
      bosDetected = true; bosLevel = prevL.level; bosType = 'bearish'; bosTime = c.time; break
    }
  }

  // ── FVG after BOS on M5 ───────────────────────────────────────────────────
  let activeFvg: MyGoldFVG | null = null

  if (bosDetected && bosTime) {
    const afterBos = m5Recent.filter(c => c.time >= bosTime!)
    const fvgs: MyGoldFVG[] = []
    for (let i = 1; i < afterBos.length - 1; i++) {
      const c1 = afterBos[i - 1], c2 = afterBos[i], c3 = afterBos[i + 1]
      if (bosType === 'bullish' && c1.high < c3.low) {
        const top = c3.low, bottom = c1.high
        const filled = afterBos.slice(i + 2).some(c => c.low <= top && c.high >= bottom)
        fvgs.push({ top, bottom, mid: (top + bottom) / 2, type: 'bullish', time: c2.time, filled })
      }
      if (bosType === 'bearish' && c1.low > c3.high) {
        const top = c1.low, bottom = c3.high
        const filled = afterBos.slice(i + 2).some(c => c.low <= top && c.high >= bottom)
        fvgs.push({ top, bottom, mid: (top + bottom) / 2, type: 'bearish', time: c2.time, filled })
      }
    }
    activeFvg = fvgs.filter(f => !f.filled).at(-1) ?? fvgs.at(-1) ?? null
  }

  const fvg50eq = activeFvg ? activeFvg.mid : null

  // ── Signal: entry on retrace into FVG ────────────────────────────────────
  const signals: Signal[] = []

  if (activeFvg && !activeFvg.filled && bosType && bosTime) {
    const afterFvg = m5Recent.filter(c => c.time > activeFvg!.time)
    if (bosType === 'bullish') {
      for (const c of afterFvg) {
        if (c.low <= activeFvg.top && c.high >= activeFvg.bottom && c.close > c.open) {
          const entry = activeFvg.mid
          const sl    = activeFvg.bottom - m5ATR * 0.5
          const risk  = Math.max(entry - sl, m5ATR)
          signals.push({
            type: 'CONT', label: 'MY GOLD LONG', time: c.time,
            entryPrice: entry, stopPrice: sl,
            targetPrice: entry + risk,
            target2: entry + risk * 2,
            target3: nearestSupplyZone ?? entry + risk * 3,
          })
          break
        }
      }
    } else {
      for (const c of afterFvg) {
        if (c.low <= activeFvg.top && c.high >= activeFvg.bottom && c.close < c.open) {
          const entry = activeFvg.mid
          const sl    = activeFvg.top + m5ATR * 0.5
          const risk  = Math.max(sl - entry, m5ATR)
          signals.push({
            type: 'TRAP', label: 'MY GOLD SHORT', time: c.time,
            entryPrice: entry, stopPrice: sl,
            targetPrice: entry - risk,
            target2: entry - risk * 2,
            target3: nearestDemandZone ?? entry - risk * 3,
          })
          break
        }
      }
    }
  }

  // ── Pre-trade checklist score ─────────────────────────────────────────────
  const checks = [
    htfBias !== 'neutral',                    // 1. HTF trend defined
    sweepDetected,                            // 2. Liquidity sweep occurred
    bosDetected,                              // 3. BOS confirmed (close, not wick)
    activeFvg !== null,                       // 4. FVG identified on impulse
    activeFvg !== null,                       // 5. Limit order ready at FVG/50% EQ
    activeFvg !== null,                       // 6. SL beyond FVG candle
    nearestSupplyZone !== null || nearestDemandZone !== null,  // 7. TP targets liquidity
    activeZoneType !== null,                  // 8. Price at mapped zone
  ]
  const checklistScore = checks.filter(Boolean).length

  // ── Invalidation message ──────────────────────────────────────────────────
  let invalidation: string
  if (signals.length) {
    const s = signals[signals.length - 1]
    invalidation = `${s.label} @ ${p(s.entryPrice)} · SL ${p(s.stopPrice)} · TP3 ${p(s.target3 ?? s.target2 ?? s.targetPrice ?? 0)}`
  } else if (htfBias === 'neutral') {
    invalidation = 'No HTF bias — check Daily/H4 trend direction first'
  } else if (!sweepDetected) {
    invalidation = `HTF ${htfBias.toUpperCase()}. Waiting for liquidity sweep of old ${htfBias === 'bullish' ? 'low' : 'high'}…`
  } else if (!bosDetected) {
    invalidation = `Sweep ✓ (${sweepType === 'bullish' ? 'low swept' : 'high swept'}). Waiting for M5 BOS candle close…`
  } else if (!activeFvg) {
    invalidation = `BOS ${bosType?.toUpperCase()} confirmed. Looking for FVG in impulse leg…`
  } else {
    invalidation = `FVG ${p(activeFvg.bottom)}–${p(activeFvg.top)} · 50% EQ ${p(activeFvg.mid)}. Wait for retrace into gap…`
  }

  return {
    zones, nearestSupplyZone, nearestDemandZone, activeZoneType,
    htfBias, dailyTrend,
    sweepDetected, sweepType, sweepLevel, sweepTime,
    bosDetected, bosLevel, bosType, bosTime,
    activeFvg, fvg50eq, checklistScore,
    signals, invalidation,
  }
}
