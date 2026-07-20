import { NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 300 M5 candles = 25 hours — covers full current London session + post-session
    const candles = await fetchCandles('XAU_USD', 'M5', 300)
    return NextResponse.json(candles)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
