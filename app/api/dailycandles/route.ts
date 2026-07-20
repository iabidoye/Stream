import { NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 260 daily candles gives the Gold Signal model enough history for 50/200 EMA bias.
    const candles = await fetchCandles('XAU_USD', 'D', 260)
    return NextResponse.json(candles)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
