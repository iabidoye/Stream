import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const envText = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const BASE = 'https://api-fxtrade.oanda.com'
const TOKEN = process.env.OANDA_LIVE_TOKEN
const ACCOUNT_ID = process.env.OANDA_LIVE_ACCOUNT_ID
const tradeId = process.argv.find((arg) => arg.startsWith('--trade='))?.split('=')[1]
const threshold = Number(process.argv.find((arg) => arg.startsWith('--profit='))?.split('=')[1] ?? '0')
const intervalMs = Number(process.argv.find((arg) => arg.startsWith('--interval='))?.split('=')[1] ?? '3000')

if (!TOKEN || !ACCOUNT_ID) throw new Error('Missing OANDA_LIVE_TOKEN / OANDA_LIVE_ACCOUNT_ID')
if (!tradeId) throw new Error('Pass --trade=<tradeId>')

const logDir = path.join(root, 'logs')
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, `close-live-profit-watch-${tradeId}.log`)

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  fs.appendFileSync(logFile, `${line}\n`)
}

async function oanda(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`OANDA ${res.status}: ${text.slice(0, 300)}`)
  return data
}

async function tick() {
  const data = await oanda(`/v3/accounts/${ACCOUNT_ID}/trades/${tradeId}`)
  const trade = data.trade
  if (!trade || trade.state !== 'OPEN') {
    log(`Trade ${tradeId} is no longer open. Stopping watcher.`)
    process.exit(0)
  }

  const pl = Number(trade.unrealizedPL)
  log(`Trade ${tradeId} unrealized P/L ${pl.toFixed(4)} ${trade.instrument} units ${trade.currentUnits}`)
  if (Number.isFinite(pl) && pl > threshold) {
    const result = await oanda(`/v3/accounts/${ACCOUNT_ID}/trades/${tradeId}/close`, {
      method: 'PUT',
      body: JSON.stringify({ units: 'ALL' }),
    })
    log(`Closed trade ${tradeId} because P/L ${pl.toFixed(4)} > ${threshold}. Result: ${JSON.stringify(result).slice(0, 500)}`)
    process.exit(0)
  }
}

log(`Watching live trade ${tradeId}; will close when unrealized P/L > ${threshold}.`)
while (true) {
  try {
    await tick()
  } catch (error) {
    log(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs))
}
