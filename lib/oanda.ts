const BASE =
  process.env.OANDA_ENV === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com'

const TOKEN      = process.env.OANDA_TOKEN!
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID!

export interface RawCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  complete: boolean
}

export async function fetchCandles(
  instrument = 'XAU_USD',
  granularity = 'M1',
  count = 700,
): Promise<RawCandle[]> {
  const url = `${BASE}/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Accept-Datetime-Format': 'UNIX',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`OANDA ${res.status}: ${text}`)
  }
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.candles.map((c: any) => ({
    time: Math.floor(parseFloat(c.time)),
    open: parseFloat(c.mid.o),
    high: parseFloat(c.mid.h),
    low: parseFloat(c.mid.l),
    close: parseFloat(c.mid.c),
    volume: c.volume as number,
    complete: c.complete as boolean,
  }))
}

export async function fetchPrice(instrument = 'XAU_USD'): Promise<number> {
  const url = `${BASE}/v3/accounts/${ACCOUNT_ID}/pricing?instruments=${instrument}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`OANDA price ${res.status}`)
  const data = await res.json()
  const p = data.prices[0]
  return (parseFloat(p.asks[0].price) + parseFloat(p.bids[0].price)) / 2
}
