'use client'
import { useState, useEffect, useCallback } from 'react'
import { BookOpen, X, Trash2 } from 'lucide-react'

export interface JournalEntry {
  id: string
  loggedAt: number
  tab: 'vp' | 'fcv' | 'eightam' | 'lndb' | 'lndb2' | 'lq' | 'orb' | 'daily3' | 'sweep' | 'asiafib' | 'fibcont' | 'nwc' | 'comp' | 'nwcbo' | 'or15' | 'p1' | 'flow' | 'lkz' | 'gold' | 'dxycorr' | 'zones' | 'cont' | 'sgr' | 'qfb25' | 'qfb15'
  label: string
  signalTime: number
  entryPrice: number
  stopPrice: number
  targetPrice?: number
  target2?: number
  target3?: number
  outcome: 'OPEN' | 'TP1' | 'TP2' | 'TP3' | 'STOP'
  exitPrice?: number
  notes: string
  session?: SessionLabel
}

export type SessionLabel = 'Asia' | 'London' | 'NY AM' | 'NY PM' | 'After Hours'

// Derive trading session from a unix-seconds timestamp, in New York time (EST/EDT auto)
export function sessionFromTime(ts: number): SessionLabel {
  const ny   = new Date(new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const mins = ny.getHours() * 60 + ny.getMinutes()
  if (mins >= 18 * 60 || mins < 3 * 60)        return 'Asia'         // 18:00–03:00
  if (mins >= 3 * 60 && mins < 9 * 60 + 30)    return 'London'       // 03:00–09:30
  if (mins >= 9 * 60 + 30 && mins < 12 * 60)   return 'NY AM'        // 09:30–12:00
  if (mins >= 12 * 60 && mins < 16 * 60)       return 'NY PM'        // 12:00–16:00
  return 'After Hours'                                               // 16:00–18:00
}

const STORAGE_KEY = 'fvg-journal-v1'
const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

function calcPnl(e: JournalEntry): number | null {
  if (!e.exitPrice || e.outcome === 'OPEN') return null
  // stop < entry → long; stop > entry → short
  const dir = e.stopPrice < e.entryPrice ? 1 : -1
  return (e.exitPrice - e.entryPrice) * dir
}

function calcR(e: JournalEntry): number | null {
  const pnl  = calcPnl(e)
  const risk = Math.abs(e.entryPrice - e.stopPrice)
  if (pnl === null || !risk) return null
  return pnl / risk
}

// ── Persistence hook ──────────────────────────────────────────────────────────
export function useJournal(): [JournalEntry[], (entries: JournalEntry[]) => void] {
  const [entries, setEntriesState] = useState<JournalEntry[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as JournalEntry[]
        // Backfill session for entries logged before the field existed
        setEntriesState(parsed.map(e => e.session ? e : { ...e, session: sessionFromTime(e.signalTime) }))
      }
    } catch { /* ignore */ }
  }, [])

  const setEntries = useCallback((next: JournalEntry[]) => {
    setEntriesState(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    // Mirror to server-side Excel ledger (append-only upsert; never deletes rows)
    try {
      fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: next }),
      }).catch(() => { /* offline / dev — localStorage still holds it */ })
    } catch { /* ignore */ }
  }, [])

  return [entries, setEntries]
}

// ── Entry row ─────────────────────────────────────────────────────────────────
function EntryRow({ entry, onChange, onDelete }: {
  entry: JournalEntry
  onChange: (e: JournalEntry) => void
  onDelete: () => void
}) {
  const isBull = entry.stopPrice < entry.entryPrice
  const pnl    = calcPnl(entry)
  const rMult  = calcR(entry)
  const risk   = Math.abs(entry.entryPrice - entry.stopPrice)

  const priceRows = [
    { l: 'Entry', v: fmt(entry.entryPrice), c: '#fbbf24' },
    { l: 'Stop',  v: fmt(entry.stopPrice),  c: '#ef4444' },
    ...(entry.targetPrice ? [{ l: 'TP1', v: fmt(entry.targetPrice), c: '#86efac' }] : []),
    ...(entry.target2     ? [{ l: 'TP2', v: fmt(entry.target2),     c: '#22c55e' }] : []),
    ...(entry.target3     ? [{ l: 'TP3', v: fmt(entry.target3),     c: '#4ade80' }] : []),
    { l: 'Risk',  v: `${fmt(risk)} pts`,    c: '#6b7280' },
  ]

  const outcomeColor = entry.outcome === 'OPEN' ? '#6b7280' : entry.outcome === 'STOP' ? '#ef4444' : '#22c55e'

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${isBull ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`, background: isBull ? 'rgba(34,197,94,.04)' : 'rgba(239,68,68,.04)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#1f2937', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{entry.tab}</span>
          {entry.session && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(124,58,237,.15)', color: '#a78bfa', fontWeight: 600 }}>{entry.session}</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: isBull ? '#22c55e' : '#ef4444' }}>
            {isBull ? '▲' : '▼'} {entry.label}
          </span>
          {entry.outcome !== 'OPEN' && (
            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: entry.outcome === 'STOP' ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.15)', color: outcomeColor, fontWeight: 600 }}>
              {entry.outcome}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {rMult !== null && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: rMult >= 0 ? '#22c55e' : '#ef4444' }}>
              {rMult >= 0 ? '+' : ''}{rMult.toFixed(2)}R
            </span>
          )}
          <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', padding: 2, display: 'flex', alignItems: 'center' }}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Price grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', fontFamily: 'monospace', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
        {priceRows.map(r => (
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#4b5563' }}>{r.l}</span>
            <span style={{ fontWeight: 600, color: r.c }}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* Outcome + exit price */}
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={entry.outcome}
          onChange={e => onChange({ ...entry, outcome: e.target.value as JournalEntry['outcome'] })}
          style={{ flex: 1, background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#f9fafb', cursor: 'pointer', outline: 'none' }}
        >
          <option value="OPEN">🔄  Open</option>
          <option value="TP1">✅  TP1 Hit</option>
          <option value="TP2">✅  TP2 Hit</option>
          <option value="TP3">✅  TP3 Hit</option>
          <option value="STOP">❌  Stop Hit</option>
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Exit px"
          value={entry.exitPrice ?? ''}
          onChange={e => onChange({ ...entry, exitPrice: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
          style={{ width: 88, background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', color: '#f9fafb', outline: 'none' }}
        />
      </div>

      {/* PnL bar */}
      {pnl !== null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderRadius: 6, background: pnl >= 0 ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', border: `1px solid ${pnl >= 0 ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>P&amp;L</span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
            {pnl >= 0 ? '+' : ''}{fmt(pnl)} pts
          </span>
        </div>
      )}

      {/* Notes */}
      <textarea
        value={entry.notes}
        onChange={e => onChange({ ...entry, notes: e.target.value })}
        placeholder="Notes…"
        rows={2}
        style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#9ca3af', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none' }}
      />

      <div style={{ fontSize: 10, color: '#374151' }}>
        {new Date(entry.loggedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

// ── Journal panel ─────────────────────────────────────────────────────────────
export function JournalPanel({ entries, onChange, onClose }: {
  entries: JournalEntry[]
  onChange: (entries: JournalEntry[]) => void
  onClose: () => void
}) {
  const closed  = entries.filter(e => e.outcome !== 'OPEN')
  const wins    = closed.filter(e => e.outcome !== 'STOP')
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : null
  const winsWithR = wins.filter(e => calcR(e) !== null)
  const avgR    = winsWithR.length > 0 ? winsWithR.reduce((s, e) => s + (calcR(e) ?? 0), 0) / winsWithR.length : null
  const totalPnl = closed.reduce((s, e) => s + (calcPnl(e) ?? 0), 0)

  const stats = [
    { l: 'Trades', v: String(entries.length),                                                    c: '#f9fafb' },
    { l: 'Win %',  v: winRate !== null ? `${winRate}%` : '—',                                   c: winRate !== null ? (winRate >= 50 ? '#22c55e' : '#ef4444') : '#6b7280' },
    { l: 'Avg R',  v: avgR    !== null ? `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—',   c: avgR    !== null ? (avgR >= 0    ? '#22c55e' : '#ef4444') : '#6b7280' },
    { l: 'PnL',    v: closed.length > 0 ? `${totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}` : '—', c: totalPnl >= 0 ? '#22c55e' : '#ef4444' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width: 420, height: '100%', background: '#080b10', borderLeft: '1px solid #1f2937', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={14} color="#fbbf24" />
            <span style={{ fontWeight: 700, fontSize: 13, color: '#f9fafb' }}>Trade Journal</span>
            {entries.length > 0 && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#1f2937', color: '#6b7280' }}>{entries.length}</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', padding: 4 }}>
            <X size={14} />
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          {stats.map((s, i) => (
            <div key={s.l} style={{ flex: 1, padding: '10px 0 10px 12px', borderRight: i < stats.length - 1 ? '1px solid #1f2937' : 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4b5563' }}>{s.l}</span>
              <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: s.c, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
            </div>
          ))}
        </div>

        {/* Entries */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <BookOpen size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.12, color: '#6b7280' }} />
              <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>No trades logged</div>
              <div style={{ fontSize: 11, color: '#1f2937' }}>Tap &quot;+ Log&quot; on any signal card</div>
            </div>
          ) : (
            [...entries].reverse().map(entry => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onChange={updated => onChange(entries.map(e => e.id === entry.id ? updated : e))}
                onDelete={() => onChange(entries.filter(e => e.id !== entry.id))}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
