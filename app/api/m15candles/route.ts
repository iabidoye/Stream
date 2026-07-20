import { NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 200 M15 candles = ~50 hours (covers 2+ trading sessions)
    const candles = await fetchCandles('XAU_USD', 'M15', 200)
    return NextResponse.json(candles)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
