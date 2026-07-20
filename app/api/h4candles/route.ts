import { NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 300 H4 candles = ~50 trading days for higher-timeframe trend context.
    const candles = await fetchCandles('XAU_USD', 'H4', 300)
    return NextResponse.json(candles)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
