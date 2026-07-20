import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// Append-only Excel ledger of every logged trade.
// Rows are upserted by `id` — outcomes update in place, rows are NEVER removed.
// File lives outside .next so it survives rebuilds and is never auto-deleted.
const DIR  = path.join(process.cwd(), 'outputs', 'trade-journal')
const FILE = path.join(DIR, 'trade-journal.xlsx')
const SHEET = 'Trades'

interface Entry {
  id: string
  loggedAt: number
  tab: string
  label: string
  signalTime: number
  entryPrice: number
  stopPrice: number
  targetPrice?: number
  target2?: number
  target3?: number
  outcome: 'OPEN' | 'TP1' | 'TP2' | 'TP3' | 'STOP'
  exitPrice?: number
  notes?: string
  session?: string
}

interface Row {
  ID: string
  'Logged At': string
  Strategy: string
  Session: string
  Signal: string
  Direction: string
  'Signal Time': string
  Entry: number
  Stop: number
  'Risk (pts)': number
  TP1: number | string
  TP2: number | string
  TP3: number | string
  Outcome: string
  'Win/Loss': string
  'Exit Price': number | string
  'P&L (pts)': number | string
  R: number | string
  Notes: string
}

const fmtTime = (sec: number) =>
  new Date(sec * 1000).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

const fmtMs = (ms: number) =>
  new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

function entryToRow(e: Entry): Row {
  const dir   = e.stopPrice < e.entryPrice ? 'LONG' : 'SHORT'
  const sign  = dir === 'LONG' ? 1 : -1
  const risk  = Math.abs(e.entryPrice - e.stopPrice)
  const closed = e.outcome !== 'OPEN' && e.exitPrice != null
  const pnl   = closed ? (e.exitPrice! - e.entryPrice) * sign : null
  const r     = closed && risk ? pnl! / risk : null
  const winLoss = e.outcome === 'OPEN' ? '' : e.outcome === 'STOP' ? 'LOSS' : 'WIN'

  return {
    ID:            e.id,
    'Logged At':   fmtMs(e.loggedAt),
    Strategy:      e.tab,
    Session:       e.session ?? '',
    Signal:        e.label,
    Direction:     dir,
    'Signal Time': fmtTime(e.signalTime),
    Entry:         e.entryPrice,
    Stop:          e.stopPrice,
    'Risk (pts)':  Number(risk.toFixed(2)),
    TP1:           e.targetPrice ?? '',
    TP2:           e.target2 ?? '',
    TP3:           e.target3 ?? '',
    Outcome:       e.outcome,
    'Win/Loss':    winLoss,
    'Exit Price':  e.exitPrice ?? '',
    'P&L (pts)':   pnl != null ? Number(pnl.toFixed(2)) : '',
    R:             r != null ? Number(r.toFixed(2)) : '',
    Notes:         e.notes ?? '',
  }
}

async function readExisting(): Promise<Row[]> {
  try {
    const buf = await fs.readFile(FILE)
    const wb  = XLSX.read(buf, { type: 'buffer' })
    const ws  = wb.Sheets[SHEET]
    if (!ws) return []
    return XLSX.utils.sheet_to_json<Row>(ws)
  } catch {
    return []  // no file yet
  }
}

export async function POST(req: Request) {
  try {
    const { entries } = (await req.json()) as { entries: Entry[] }
    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: 'entries must be an array' }, { status: 400 })
    }

    await fs.mkdir(DIR, { recursive: true })

    // Upsert by ID: keep every existing row, update matches, append new. Never delete.
    const existing = await readExisting()
    const byId = new Map<string, Row>()
    for (const r of existing) if (r.ID) byId.set(String(r.ID), r)
    for (const e of entries) byId.set(e.id, entryToRow(e))

    const rows = [...byId.values()].sort((a, b) =>
      String(a['Logged At']).localeCompare(String(b['Logged At'])))

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['ID', 'Logged At', 'Strategy', 'Session', 'Signal', 'Direction', 'Signal Time',
        'Entry', 'Stop', 'Risk (pts)', 'TP1', 'TP2', 'TP3', 'Outcome', 'Win/Loss',
        'Exit Price', 'P&L (pts)', 'R', 'Notes'],
    })
    ws['!cols'] = [
      { wch: 22 }, { wch: 20 }, { wch: 9 }, { wch: 12 }, { wch: 14 }, { wch: 9 }, { wch: 20 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
      { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 7 }, { wch: 40 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, SHEET)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    await fs.writeFile(FILE, buf)

    return NextResponse.json({ ok: true, rows: rows.length, file: FILE })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  const rows = await readExisting()
  return NextResponse.json({ rows: rows.length, file: FILE, data: rows })
}
