import { NextResponse } from 'next/server'
import { fetchPrice } from '@/lib/oanda'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const price = await fetchPrice('XAU_USD')
    return NextResponse.json({ price })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
