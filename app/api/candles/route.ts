import { NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const candles = await fetchCandles('XAU_USD', 'M1', 700)
    return NextResponse.json(candles)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
