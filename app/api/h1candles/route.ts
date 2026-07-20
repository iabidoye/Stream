import { NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 300 H1 candles = ~12 trading days — enough recent swing structure for zones.
    const candles = await fetchCandles('XAU_USD', 'H1', 300)
    return NextResponse.json(candles)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
