'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  Clock3,
  ExternalLink,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Square,
  Wallet,
} from 'lucide-react'

type ProfileKey = 'demo' | 'live'
const monitorOnly = process.env.NEXT_PUBLIC_MONITOR_ONLY === 'true'

interface Account {
  id: string
  alias?: string
  currency: string
  balance: number | null
  nav: number | null
  unrealizedPL: number | null
  pl: number | null
  marginUsed: number | null
  marginAvailable: number | null
  openTradeCount: number
  pendingOrderCount: number
}

interface Price {
  instrument: string
  bid: number
  ask: number
  mid: number | null
  spread: number | null
  tradeable: boolean
}

interface Order {
  id: string
  instrument: string
  units: number
  price: number | null
  gtdTime: string | null
  clientId: string
  stopLoss: number | null
  takeProfit: number | null
}

interface Trade {
  id: string
  openTime: string
  instrument: string
  currentUnits: number
  price: number | null
  unrealizedPL: number | null
  stopLoss: number | null
  takeProfit: number | null
}

interface TradeHistoryRow {
  id: string
  tradeId: string
  clientId: string
  strategy: string
  instrument: string
  side: 'Long' | 'Short'
  units: number
  entryPrice: number | null
  exitPrice: number | null
  entryTime: string
  exitTime: string
  reason: string
  pl: number
  result: 'Win' | 'Loss' | 'Flat'
  durationMinutes: number | null
}

interface Performance {
  closed: number
  wins: number
  losses: number
  flats: number
  winRate: number | null
  totalPL: number
}

interface StrategyStatus {
  id: string
  family: string
  label: string
  session: string
  group?: string
  groupOrder?: number
  timeZone: string
  localTime: string
  instruments: string[]
  setup: string
  setupPct: number
  phase: string
  detail: string
  atPlay: boolean
  sessionActive?: boolean
  nextRangeMinutes?: number
  tone: 'green' | 'gold' | 'blue' | 'muted'
  risk: string
  window: {
    range: string
    decision: string
    cutoff: string
    utcRange?: string
    utcDecision?: string
    utcCutoff?: string
  }
}

interface ProfileData {
  key: ProfileKey
  label: string
  environment: string
  configured: boolean
  generatedAt: string
  account: Account | null
  bot: { available?: boolean; running: boolean; processes: string[]; note?: string }
  prices: Price[]
  pendingOrders: Order[]
  openTrades: Trade[]
  tradeHistory?: TradeHistoryRow[]
  performance?: Performance
  strategyStatus?: StrategyStatus[]
  state: Record<string, unknown> | null
  logs: string[]
  error?: string
}

interface MonitorResponse {
  generatedAt: string
  runtime?: 'local' | 'vercel'
  profiles: Record<ProfileKey, ProfileData>
}

const money = (value: number | null | undefined, currency = 'GBP') =>
  value == null
    ? '-'
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)

const num = (value: number | null | undefined, digits = 3) =>
  value == null ? '-' : value.toLocaleString('en-GB', { maximumFractionDigits: digits })

const time = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '-'

const pct = (value: number | null | undefined) =>
  value == null ? '-' : `${Math.max(0, Math.min(100, Math.round(value)))}%`

const duration = (value: number | null | undefined) => {
  if (value == null) return '-'
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  return `${minutes}m`
}

const shortId = (value: string | null | undefined) => {
  if (!value) return '-'
  if (value.length <= 30) return value
  return `${value.slice(0, 18)}...${value.slice(-8)}`
}

function handledRows(value: unknown) {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, Record<string, unknown>>).map(([id, signal]) => ({
    id,
    direction: String(signal.direction ?? '-'),
    entry: typeof signal.entry === 'number' ? signal.entry : null,
    stop: typeof signal.stop === 'number' ? signal.stop : null,
    target: typeof signal.target === 'number' ? signal.target : null,
    placed: Boolean(signal.placed),
    existing: Boolean(signal.existing),
    at: typeof signal.at === 'string' ? signal.at : null,
    clientId: typeof signal.clientId === 'string' ? signal.clientId : '',
  }))
}

const css = {
  page: { height: '100vh', overflow: 'auto', background: '#080b10', color: '#f9fafb' } as CSSProperties,
  shell: { width: 'min(1440px, calc(100vw - 32px))', margin: '0 auto', padding: '18px 0 28px' } as CSSProperties,
  panel: {
    border: '1px solid #1f2937',
    background: 'linear-gradient(180deg, rgba(17,24,39,.78), rgba(8,11,16,.88))',
    borderRadius: 8,
    boxShadow: '0 18px 40px -28px rgba(0,0,0,.85)',
  } as CSSProperties,
  mono: { fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)' } as CSSProperties,
  muted: { color: '#8b949e' } as CSSProperties,
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      border: `1px solid ${ok ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)'}`,
      color: ok ? '#22c55e' : '#ef4444',
      background: ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
      borderRadius: 999,
      padding: '5px 9px',
      fontSize: 12,
      fontWeight: 800,
    }}>
      {ok ? <PlayCircle size={14} /> : <Square size={14} />}
      {label}
    </span>
  )
}

function Card({ icon, label, value, sub, tone }: {
  icon: ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'green' | 'red' | 'gold'
}) {
  const color = tone === 'green' ? '#22c55e' : tone === 'red' ? '#ef4444' : tone === 'gold' ? '#fbbf24' : '#e5e7eb'
  return (
    <div style={{ ...css.panel, padding: 14, minHeight: 106 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>{label}</div>
        <div style={{ color }}>{icon}</div>
      </div>
      <div style={{ ...css.mono, color, fontSize: 24, fontWeight: 900, marginTop: 14, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>{sub}</div> : null}
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={css.panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: '1px solid #1f2937' }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 900, letterSpacing: '.03em', textTransform: 'uppercase' }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 18, color: '#6b7280', fontSize: 13 }}>{text}</div>
}

function toneColor(tone: StrategyStatus['tone']) {
  if (tone === 'green') return '#22c55e'
  if (tone === 'gold') return '#fbbf24'
  if (tone === 'blue') return '#38bdf8'
  return '#8b949e'
}

function statusValue(item: StrategyStatus) {
  if (item.phase === 'Trade open') return 'OPEN'
  if (item.phase === 'Order pending') return 'PENDING'
  if (item.phase === 'Closed today') return 'CLOSED'
  return pct(item.setupPct)
}

function StrategyCard({ item, featured = false }: { item: StrategyStatus; featured?: boolean }) {
  const color = toneColor(item.tone)
  return (
    <div style={{
      border: `1px solid ${featured ? color : '#1f2937'}`,
      background: featured ? `linear-gradient(135deg, ${color}1f, rgba(8,11,16,.92) 58%)` : '#0b1118',
      borderRadius: 8,
      padding: featured ? 16 : 12,
      boxShadow: featured ? `0 18px 44px -30px ${color}` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {item.phase === 'Session open' ? 'Session open' : item.atPlay ? 'Strategy at play' : item.phase}
            </span>
            <span style={{ color: '#8b949e', fontSize: 11, fontWeight: 800 }}>{item.session}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: featured ? 20 : 14, fontWeight: 950, lineHeight: 1.15 }}>
            {item.label}
          </div>
          <div style={{ color: '#8b949e', fontSize: featured ? 13 : 12, marginTop: 6, lineHeight: 1.45 }}>
            {item.detail}
          </div>
        </div>
        <div style={{ ...css.mono, color, fontSize: featured ? 30 : 20, fontWeight: 950, lineHeight: 1, textAlign: 'right' }}>
          {statusValue(item)}
          {item.phase !== 'Order pending' && item.phase !== 'Trade open' && item.phase !== 'Closed today' ? (
            <div style={{ color: '#8b949e', fontSize: 10, marginTop: 5, fontFamily: 'inherit' }}>setup</div>
          ) : null}
        </div>
      </div>

      <div style={{ height: 7, background: '#111827', borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ width: `${Math.max(0, Math.min(100, item.setupPct))}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: featured ? 'repeat(auto-fit, minmax(120px, 1fr))' : '1fr 1fr', gap: 8, marginTop: 12, fontSize: 11 }}>
        <div><span style={css.muted}>Setup</span><br /><strong>{item.setup}</strong></div>
        <div>
          <span style={css.muted}>Window</span><br />
          <strong>{item.window.range} · {item.window.decision} · {item.window.cutoff}</strong>
          {item.window.utcRange ? (
            <div style={{ color: '#8b949e', marginTop: 3 }}>UTC {item.window.utcRange} · {item.window.utcDecision} · {item.window.utcCutoff}</div>
          ) : null}
        </div>
        <div><span style={css.muted}>Market</span><br /><strong>{item.instruments.join(', ')}</strong></div>
        <div><span style={css.muted}>Local time</span><br /><strong>{item.localTime}</strong></div>
      </div>
    </div>
  )
}

export default function EightAmMonitorPage() {
  const [selected, setSelected] = useState<ProfileKey>('demo')
  const [data, setData] = useState<MonitorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/eightam-monitor', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const setFromUrl = () => {
      const account = new URLSearchParams(window.location.search).get('account')
      if (account === 'demo' || account === 'live') setSelected(account)
    }
    setFromUrl()
    load()
    const id = setInterval(load, 2_000)
    window.addEventListener('popstate', setFromUrl)
    return () => {
      clearInterval(id)
      window.removeEventListener('popstate', setFromUrl)
    }
  }, [])

  const switchProfile = (key: ProfileKey) => {
    setSelected(key)
    const url = new URL(window.location.href)
    url.searchParams.set('account', key)
    window.history.pushState({}, '', url)
  }

  const profile = data?.profiles[selected] ?? null
  const botAvailable = profile?.bot.available !== false
  const currency = profile?.account?.currency ?? 'GBP'
  const gold = profile?.prices.find((price) => price.instrument === 'XAU_USD')
  const silver = profile?.prices.find((price) => price.instrument === 'XAG_USD')
  const latestState = useMemo(() => {
    if (!profile?.state) return []
    return Object.entries(profile.state).slice(-5).reverse()
  }, [profile?.state])
  const strategyStatus = profile?.strategyStatus ?? []
  const tradeHistory = profile?.tradeHistory ?? []
  const performance = profile?.performance
  const featuredStrategy = strategyStatus.find((item) => item.atPlay) ?? strategyStatus.find((item) => item.phase !== 'Closed today') ?? strategyStatus[0]

  return (
    <main style={css.page}>
      <div style={css.shell}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!monitorOnly ? (
              <a href="/" style={{
                width: 34,
                height: 34,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d1d5db',
                border: '1px solid #1f2937',
                borderRadius: 8,
                background: '#0b1118',
              }} aria-label="Back to chart dashboard">
                <ArrowLeft size={17} />
              </a>
            ) : null}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 0 }}>8AM NY Strategy Monitor</h1>
                {profile ? <StatusPill ok={!botAvailable || profile.bot.running} label={!botAvailable ? 'Status local-only' : `${profile.label} ${profile.bot.running ? 'running' : 'stopped'}`} /> : null}
              </div>
              <div style={{ color: '#8b949e', fontSize: 13, marginTop: 5 }}>
                Demo is the current practice bot. Live uses separate live-account API credentials.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['demo', 'live'] as ProfileKey[]).map((key) => {
              const item = data?.profiles[key]
              const active = selected === key
              return (
                <a
                  key={key}
                  href={`/eightam-monitor?account=${key}`}
                  onClick={(event) => {
                    event.preventDefault()
                    switchProfile(key)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    border: `1px solid ${active ? '#fbbf24' : '#1f2937'}`,
                    background: active ? 'rgba(251,191,36,.12)' : '#0b1118',
                    color: active ? '#fbbf24' : '#d1d5db',
                    borderRadius: 8,
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {item?.label ?? key.toUpperCase()}
                </a>
              )
            })}
            <a href="https://fxtrade.oanda.com/" target="_blank" rel="noreferrer" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              color: '#f9fafb',
              textDecoration: 'none',
              border: '1px solid #1f2937',
              borderRadius: 8,
              padding: '9px 11px',
              background: '#0b1118',
              fontSize: 13,
              fontWeight: 800,
            }}>
              OANDA <ExternalLink size={14} />
            </a>
            <button onClick={load} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              color: '#111827',
              border: 0,
              borderRadius: 8,
              padding: '9px 11px',
              background: '#fbbf24',
              fontSize: 13,
              fontWeight: 900,
              cursor: 'pointer',
            }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div style={{ ...css.panel, borderColor: 'rgba(239,68,68,.4)', padding: 14, marginBottom: 14, color: '#fca5a5', display: 'flex', gap: 10, alignItems: 'center' }}>
            <AlertCircle size={18} /> {error}
          </div>
        ) : null}

        {profile?.error ? (
          <div style={{ ...css.panel, borderColor: 'rgba(251,191,36,.38)', padding: 14, marginBottom: 14, color: '#fde68a', display: 'flex', gap: 10, alignItems: 'center' }}>
            <AlertCircle size={18} /> {profile.error}
          </div>
        ) : null}

        {profile?.bot.note ? (
          <div style={{ ...css.panel, borderColor: 'rgba(125,211,252,.32)', padding: 14, marginBottom: 14, color: '#bae6fd', display: 'flex', gap: 10, alignItems: 'center' }}>
            <AlertCircle size={18} /> {profile.bot.note}
          </div>
        ) : null}

        <div style={{ ...css.panel, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#8b949e', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Selected Account</div>
            <div style={{ marginTop: 4, fontWeight: 900, color: selected === 'live' ? '#fbbf24' : '#7dd3fc' }}>
              {profile?.label ?? selected.toUpperCase()} · {profile?.account?.id ?? 'not connected'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusPill ok={Boolean(profile?.configured)} label={profile?.configured ? 'Configured' : 'Not configured'} />
            <StatusPill ok={!botAvailable || Boolean(profile?.bot.running)} label={!botAvailable ? 'Bot status local-only' : profile?.bot.running ? 'Bot running' : 'Bot stopped'} />
          </div>
        </div>

        {featuredStrategy ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(520px, 100%), 1.25fr) minmax(min(420px, 100%), .75fr)', gap: 12, marginBottom: 12 }}>
            <StrategyCard item={featuredStrategy} featured />
            <section style={{ ...css.panel, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 900 }}>Configured Sessions</div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {strategyStatus.filter((item) => item.atPlay).length} active / {strategyStatus.length} configured
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 2 }}>
                {strategyStatus.map((item) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10, border: '1px solid #1f2937', borderRadius: 8, padding: '9px 10px', background: item.atPlay ? `${toneColor(item.tone)}12` : '#0b1118' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: toneColor(item.tone), fontSize: 11, fontWeight: 900 }}>
                        {item.session} · {item.family} · {item.phase}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                    </div>
                    <div style={{ ...css.mono, color: toneColor(item.tone), fontWeight: 950 }}>{statusValue(item)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
          <Card icon={<Bot size={18} />} label="Automation" value={!botAvailable ? 'Local-only' : profile?.bot.running ? 'Running' : loading ? 'Loading' : 'Stopped'} sub={`${profile?.label ?? selected} profile`} tone={!botAvailable || profile?.bot.running ? 'green' : 'red'} />
          <Card icon={<Wallet size={18} />} label="NAV" value={money(profile?.account?.nav, currency)} sub={`Balance ${money(profile?.account?.balance, currency)}`} tone="gold" />
          <Card icon={<Activity size={18} />} label="Unrealized P/L" value={money(profile?.account?.unrealizedPL, currency)} sub={`Total P/L ${money(profile?.account?.pl, currency)}`} tone={(profile?.account?.unrealizedPL ?? 0) >= 0 ? 'green' : 'red'} />
          <Card icon={<ShieldCheck size={18} />} label="Margin Used" value={money(profile?.account?.marginUsed, currency)} sub={`Available ${money(profile?.account?.marginAvailable, currency)}`} />
          <Card icon={<Clock3 size={18} />} label="Pending Orders" value={String(profile?.pendingOrders.length ?? 0)} sub={`${profile?.openTrades.length ?? 0} open trades`} />
          <Card icon={<Activity size={18} />} label="Trades Taken" value={String(performance?.closed ?? 0)} sub={`${performance?.wins ?? 0} wins · ${performance?.losses ?? 0} losses`} tone="green" />
          <Card icon={<ShieldCheck size={18} />} label="Win Rate" value={pct(performance?.winRate)} sub={`Closed P/L ${money(performance?.totalPL, currency)}`} tone={(performance?.totalPL ?? 0) >= 0 ? 'green' : 'red'} />
          <Card icon={<RefreshCw size={18} />} label="Last Refresh" value={profile ? time(profile.generatedAt) : '-'} sub="auto-refreshes every 2s" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: 10, marginBottom: 12 }}>
          {[gold, silver].map((price, index) => (
            <div key={price?.instrument ?? `price-${index}`} style={{ ...css.panel, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: '#8b949e', fontWeight: 900 }}>{price?.instrument ?? '-'}</div>
                <span style={{ color: price?.tradeable ? '#22c55e' : '#ef4444', fontSize: 12, fontWeight: 900 }}>
                  {price?.tradeable ? 'Tradeable' : 'Closed'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12, ...css.mono }}>
                <div><div style={css.muted}>Bid</div><strong>{num(price?.bid)}</strong></div>
                <div><div style={css.muted}>Ask</div><strong>{num(price?.ask)}</strong></div>
                <div><div style={css.muted}>Mid</div><strong>{num(price?.mid)}</strong></div>
                <div><div style={css.muted}>Spread</div><strong>{num(price?.spread, 5)}</strong></div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(520px, 100%), 1fr))', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Section title={`${profile?.label ?? 'Selected'} Pending Strategy Orders`}>
              {profile?.pendingOrders.length ? (
                <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                  {profile.pendingOrders.map((order) => {
                    const isLong = order.units > 0
                    return (
                      <div key={order.id} style={{ border: '1px solid #1f2937', borderRadius: 8, background: '#0b1118', padding: 12, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <strong>{order.instrument}</strong>
                            <span style={{ color: isLong ? '#22c55e' : '#ef4444', background: isLong ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', border: `1px solid ${isLong ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)'}`, borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>
                              {isLong ? 'LONG' : 'SHORT'}
                            </span>
                          </div>
                          <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 900 }}>Pending until {time(order.gtdTime)}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10, marginTop: 12 }}>
                          {[
                            ['Entry', num(order.price)],
                            ['Stop', num(order.stopLoss)],
                            ['Target', num(order.takeProfit)],
                            ['Units', num(Math.abs(order.units), 1)],
                          ].map(([label, value]) => (
                            <div key={label} style={{ border: '1px solid #111827', borderRadius: 8, padding: '9px 10px', background: 'rgba(15,23,42,.55)', minWidth: 0 }}>
                              <div style={{ color: '#8b949e', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 900 }}>{label}</div>
                              <div style={{ ...css.mono, marginTop: 5, fontSize: 14, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                            </div>
                          ))}
                        </div>

                        <div title={order.clientId || order.id} style={{ marginTop: 10, color: '#8b949e', fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...css.mono }}>
                          {shortId(order.clientId || order.id)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : <Empty text={`No pending ${profile?.label ?? selected} 8AM NY limit orders right now.`} />}
            </Section>

            <Section title={`${profile?.label ?? 'Selected'} Open Trades`}>
              {profile?.openTrades.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ color: '#8b949e', textAlign: 'left' }}>
                      <tr>{['Instrument', 'Units', 'Entry', 'SL', 'TP', 'Unrealized', 'Opened'].map((head) => <th key={head} style={{ padding: '10px 12px', borderBottom: '1px solid #1f2937', fontWeight: 900 }}>{head}</th>)}</tr>
                    </thead>
                    <tbody>
                      {profile.openTrades.map((trade) => (
                        <tr key={trade.id}>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827' }}>{trade.instrument}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', color: trade.currentUnits > 0 ? '#22c55e' : '#ef4444', fontWeight: 900 }}>{trade.currentUnits}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', ...css.mono }}>{num(trade.price)}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', ...css.mono }}>{num(trade.stopLoss)}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', ...css.mono }}>{num(trade.takeProfit)}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', color: (trade.unrealizedPL ?? 0) >= 0 ? '#22c55e' : '#ef4444', ...css.mono }}>{money(trade.unrealizedPL, currency)}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827' }}>{time(trade.openTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty text={`No open ${profile?.label ?? selected} trades right now.`} />}
            </Section>

            <Section
              title={`${profile?.label ?? 'Selected'} Trade Transactions`}
              action={<span style={{ color: '#8b949e', fontSize: 12 }}>{tradeHistory.length} closed</span>}
            >
              {tradeHistory.length ? (
                <div style={{ maxHeight: 420, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
                    <thead style={{ color: '#8b949e', textAlign: 'left', position: 'sticky', top: 0, background: '#111827', zIndex: 1 }}>
                      <tr>
                        {['Exit', 'Strategy', 'Market', 'Side', 'Entry', 'Exit Price', 'P/L', 'Result', 'Held'].map((head) => (
                          <th key={head} style={{ padding: '10px 12px', borderBottom: '1px solid #1f2937', fontWeight: 900 }}>{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tradeHistory.map((trade) => (
                        <tr key={trade.id}>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', whiteSpace: 'nowrap' }}>{time(trade.exitTime)}</td>
                          <td title={trade.clientId || trade.strategy} style={{ padding: '11px 12px', borderBottom: '1px solid #111827', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trade.strategy}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', fontWeight: 850 }}>{trade.instrument}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', color: trade.side === 'Long' ? '#22c55e' : '#ef4444', fontWeight: 900 }}>{trade.side}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', ...css.mono }}>{num(trade.entryPrice)}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', ...css.mono }}>{num(trade.exitPrice)}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', color: trade.pl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 900, ...css.mono }}>{money(trade.pl, currency)}</td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827' }}>
                            <span style={{ color: trade.result === 'Win' ? '#22c55e' : trade.result === 'Loss' ? '#ef4444' : '#8b949e', fontWeight: 900 }}>{trade.result}</span>
                          </td>
                          <td style={{ padding: '11px 12px', borderBottom: '1px solid #111827', whiteSpace: 'nowrap' }}>{duration(trade.durationMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty text={`No closed ${profile?.label ?? selected} strategy trades found in recent OANDA transactions.`} />}
            </Section>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <Section title={`${profile?.label ?? 'Selected'} Handled Signals`}>
              {latestState.length ? (
                <div style={{ padding: 12, display: 'grid', gap: 8, maxHeight: 460, overflow: 'auto' }}>
                  {latestState.map(([day, value]) => (
                    <div key={day} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#0b1118' }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>{day}</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {handledRows(value).map((row) => (
                          <div key={row.id} style={{ border: '1px solid #111827', borderRadius: 8, padding: 9, background: 'rgba(15,23,42,.55)', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.id.replaceAll('_', ' ')}</strong>
                              <span style={{ color: row.placed ? '#22c55e' : '#8b949e', fontSize: 11, fontWeight: 900 }}>{row.placed ? 'PLACED' : 'SKIPPED'}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 8, color: '#8b949e', fontSize: 11 }}>
                              <span>{row.direction.toUpperCase()}</span>
                              <span>Entry {num(row.entry)}</span>
                              <span>SL {num(row.stop)}</span>
                              <span>TP {num(row.target)}</span>
                            </div>
                            <div title={row.clientId} style={{ marginTop: 7, color: '#6b7280', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...css.mono }}>
                              {shortId(row.clientId)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty text={`No handled ${profile?.label ?? selected} 8AM NY signals saved yet.`} />}
            </Section>

            <Section title={`${profile?.label ?? 'Selected'} Bot Log`} action={<span style={{ color: '#8b949e', fontSize: 12 }}>{profile?.logs.length ?? 0} lines</span>}>
              <pre style={{ margin: 0, padding: 12, maxHeight: 480, overflow: 'auto', whiteSpace: 'pre-wrap', color: '#c9d1d9', fontSize: 11, lineHeight: 1.55, ...css.mono }}>
                {profile?.logs.length ? profile.logs.join('\n') : 'No log lines yet.'}
              </pre>
            </Section>
          </div>
        </div>
      </div>
    </main>
  )
}
