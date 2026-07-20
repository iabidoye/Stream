import { NextResponse } from 'next/server'
import { fetchCandles, type RawCandle } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

const DXY_BASE = 50.14348112
const LEGS = [
  ['EUR_USD', -0.576],
  ['USD_JPY', 0.136],
  ['GBP_USD', -0.119],
  ['USD_CAD', 0.091],
  ['USD_SEK', 0.042],
  ['USD_CHF', 0.036],
] as const

function valueAt(legs: Map<string, RawCandle>, field: 'open' | 'high' | 'low' | 'close') {
  let value = DXY_BASE
  for (const [instrument, weight] of LEGS) {
    const candle = legs.get(instrument)
    if (!candle) return null
    value *= Math.pow(candle[field], weight)
  }
  return value
}

export async function GET() {
  try {
    const rows = await Promise.all(
      LEGS.map(async ([instrument]) => [instrument, await fetchCandles(instrument, 'M15', 300)] as const),
    )
    const byInstrument = new Map(rows)
    const times = new Set<number>()
    for (const candles of byInstrument.values()) {
      for (const candle of candles) times.add(candle.time)
    }

    const candles = [...times].sort((a, b) => a - b).flatMap(time => {
      const legs = new Map<string, RawCandle>()
      for (const [instrument, source] of byInstrument) {
        const candle = source.find(c => c.time === time)
        if (candle) legs.set(instrument, candle)
      }
      if (legs.size !== LEGS.length) return []

      const open = valueAt(legs, 'open')
      const highRaw = valueAt(legs, 'high')
      const lowRaw = valueAt(legs, 'low')
      const close = valueAt(legs, 'close')
      if (open === null || highRaw === null || lowRaw === null || close === null) return []
      const high = Math.max(open, highRaw, lowRaw, close)
      const low = Math.min(open, highRaw, lowRaw, close)
      const volume = [...legs.values()].reduce((sum, candle) => sum + candle.volume, 0)
      const complete = [...legs.values()].every(candle => candle.complete)
      return [{ time, open, high, low, close, volume, complete }]
    })

    return NextResponse.json(candles)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
