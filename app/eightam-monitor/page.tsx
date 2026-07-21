'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
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

const alpha = (color: string, value: number) =>
  `${color.slice(0, color.lastIndexOf(')'))} / ${value})`

const C = {
  bg: 'hsl(var(--background))',
  card: 'hsl(var(--card))',
  inset: 'hsl(var(--muted) / .5)',
  border: 'hsl(var(--border))',
  borderFaint: 'hsl(var(--border) / .55)',
  text: 'hsl(var(--foreground))',
  muted: 'hsl(var(--muted-foreground))',
  gold: 'hsl(var(--gold))',
  bull: 'hsl(var(--bull))',
  bear: 'hsl(var(--bear))',
  blue: 'hsl(199 80% 62%)',
}

const css = {
  page: { height: '100vh', overflow: 'auto', background: C.bg, color: C.text } as CSSProperties,
  shell: { width: 'min(1440px, calc(100vw - 32px))', margin: '0 auto', padding: '18px 0 28px' } as CSSProperties,
  panel: { border: `1px solid ${C.border}`, background: C.card, borderRadius: 10, minWidth: 0 } as CSSProperties,
  mono: {
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontVariantNumeric: 'tabular-nums',
  } as CSSProperties,
  muted: { color: C.muted } as CSSProperties,
  label: {
    color: C.muted,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  } as CSSProperties,
  th: {
    padding: '9px 12px',
    borderBottom: `1px solid ${C.border}`,
    fontWeight: 600,
    color: C.muted,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: `1px solid ${C.borderFaint}` } as CSSProperties,
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    border: `1px solid ${C.border}`,
    background: 'transparent',
    color: C.text,
    cursor: 'pointer',
  } as CSSProperties,
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  const color = ok ? C.bull : C.bear
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      border: `1px solid ${alpha(color, 0.35)}`,
      color,
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 600,
    }}>
      {ok ? <PlayCircle size={13} /> : <Square size={12} />}
      {label}
    </span>
  )
}

function Banner({ text, tone }: { text: string; tone: 'error' | 'warn' | 'info' }) {
  const color = tone === 'error' ? C.bear : tone === 'warn' ? C.gold : C.blue
  return (
    <div style={{
      ...css.panel,
      borderColor: alpha(color, 0.35),
      padding: '12px 14px',
      marginBottom: 12,
      color,
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontSize: 13,
    }}>
      <AlertCircle size={16} style={{ flexShrink: 0 }} /> {text}
    </div>
  )
}

function Card({ icon, label, value, sub, tone }: {
  icon: ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'green' | 'red'
}) {
  const color = tone === 'green' ? C.bull : tone === 'red' ? C.bear : C.text
  return (
    <div style={{ ...css.panel, padding: 14, minHeight: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={css.label}>{label}</div>
        <div style={{ color: C.muted }}>{icon}</div>
      </div>
      <div style={{ ...css.mono, color, fontSize: 22, fontWeight: 600, marginTop: 12, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{sub}</div> : null}
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={{ ...css.panel, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 18, color: C.muted, fontSize: 13 }}>{text}</div>
}

function SideTag({ long }: { long: boolean }) {
  const color = long ? C.bull : C.bear
  return (
    <span style={{
      color,
      border: `1px solid ${alpha(color, 0.3)}`,
      borderRadius: 999,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
    }}>
      {long ? 'LONG' : 'SHORT'}
    </span>
  )
}

function toneColor(tone: StrategyStatus['tone']) {
  if (tone === 'green') return C.bull
  if (tone === 'gold') return C.gold
  if (tone === 'blue') return C.blue
  return C.muted
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
      border: `1px solid ${featured ? alpha(color, 0.4) : C.border}`,
      background: featured ? alpha(color, 0.05) : C.card,
      borderRadius: 10,
      padding: featured ? 16 : 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...css.label, color }}>
              {item.phase === 'Session open' ? 'Session open' : item.atPlay ? 'Strategy at play' : item.phase}
            </span>
            <span style={{ color: C.muted, fontSize: 11 }}>{item.session}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: featured ? 18 : 14, fontWeight: 600, lineHeight: 1.2 }}>
            {item.label}
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
            {item.detail}
          </div>
        </div>
        <div style={{ ...css.mono, color, fontSize: featured ? 26 : 18, fontWeight: 600, lineHeight: 1, textAlign: 'right' }}>
          {statusValue(item)}
          {item.phase !== 'Order pending' && item.phase !== 'Trade open' && item.phase !== 'Closed today' ? (
            <div style={{ color: C.muted, fontSize: 10, marginTop: 5, fontFamily: 'inherit' }}>setup</div>
          ) : null}
        </div>
      </div>

      <div style={{ height: 4, background: C.inset, borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ width: `${Math.max(0, Math.min(100, item.setupPct))}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: featured ? 'repeat(auto-fit, minmax(120px, 1fr))' : '1fr 1fr', gap: 8, marginTop: 12, fontSize: 11, lineHeight: 1.5 }}>
        <div><span style={css.muted}>Setup</span><br />{item.setup}</div>
        <div>
          <span style={css.muted}>Window</span><br />
          {item.window.range} · {item.window.decision} · {item.window.cutoff}
          {item.window.utcRange ? (
            <div style={css.muted}>UTC {item.window.utcRange} · {item.window.utcDecision} · {item.window.utcCutoff}</div>
          ) : null}
        </div>
        <div><span style={css.muted}>Market</span><br />{item.instruments.join(', ')}</div>
        <div><span style={css.muted}>Local time</span><br />{item.localTime}</div>
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
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!monitorOnly ? (
              <a href="/" style={{ ...css.chip, width: 34, height: 34, padding: 0, color: C.muted }} aria-label="Back to chart dashboard">
                <ArrowLeft size={16} />
              </a>
            ) : null}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>8AM NY Strategy Monitor</h1>
                {profile ? (
                  <StatusPill
                    ok={!botAvailable || profile.bot.running}
                    label={!botAvailable ? 'Status local-only' : `${profile.label} ${profile.bot.running ? 'running' : 'stopped'}`}
                  />
                ) : null}
              </div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                {profile?.account?.id ?? 'not connected'} · updated {profile ? time(profile.generatedAt) : '-'} · refreshes every 2s
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
                    ...css.chip,
                    borderColor: active ? alpha(C.gold, 0.5) : C.border,
                    color: active ? C.gold : C.muted,
                  }}
                >
                  {item?.label ?? key.toUpperCase()}
                </a>
              )
            })}
            <a href="https://fxtrade.oanda.com/" target="_blank" rel="noreferrer" style={{ ...css.chip, gap: 6 }}>
              OANDA <ExternalLink size={13} />
            </a>
            <button onClick={load} style={{
              ...css.chip,
              gap: 6,
              color: 'hsl(222 15% 8%)',
              border: 0,
              background: C.gold,
            }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </header>

        {error ? <Banner text={error} tone="error" /> : null}
        {profile?.error ? <Banner text={profile.error} tone="warn" /> : null}
        {profile && !profile.configured ? <Banner text={`${profile.label} account is not configured. Add API credentials to enable it.`} tone="warn" /> : null}
        {profile?.bot.note ? <Banner text={profile.bot.note} tone="info" /> : null}

        {featuredStrategy ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(520px, 100%), 1.25fr) minmax(min(420px, 100%), .75fr)', gap: 12, marginBottom: 12 }}>
            <StrategyCard item={featuredStrategy} featured />
            <section style={{ ...css.panel, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={css.label}>Configured Sessions</div>
                <div style={{ color: C.muted, fontSize: 12 }}>
                  {strategyStatus.filter((item) => item.atPlay).length} active / {strategyStatus.length} configured
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 2 }}>
                {strategyStatus.map((item) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10, border: `1px solid ${item.atPlay ? alpha(toneColor(item.tone), 0.35) : C.borderFaint}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: toneColor(item.tone), fontSize: 11, fontWeight: 600 }}>
                        {item.session} · {item.family} · {item.phase}
                      </div>
                      <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                    </div>
                    <div style={{ ...css.mono, color: toneColor(item.tone), fontWeight: 600 }}>{statusValue(item)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          <Card
            icon={<Bot size={16} />}
            label="Automation"
            value={!botAvailable ? 'Local-only' : profile?.bot.running ? 'Running' : loading ? 'Loading' : 'Stopped'}
            sub={`${profile?.label ?? selected} profile`}
            tone={!botAvailable || profile?.bot.running ? 'green' : 'red'}
          />
          <Card
            icon={<Wallet size={16} />}
            label="NAV"
            value={money(profile?.account?.nav, currency)}
            sub={`Balance ${money(profile?.account?.balance, currency)}`}
          />
          <Card
            icon={<Activity size={16} />}
            label="Unrealized P/L"
            value={money(profile?.account?.unrealizedPL, currency)}
            sub={`Total P/L ${money(profile?.account?.pl, currency)}`}
            tone={(profile?.account?.unrealizedPL ?? 0) >= 0 ? 'green' : 'red'}
          />
          <Card
            icon={<ShieldCheck size={16} />}
            label="Margin Used"
            value={money(profile?.account?.marginUsed, currency)}
            sub={`Available ${money(profile?.account?.marginAvailable, currency)}`}
          />
          <Card
            icon={<Activity size={16} />}
            label="Exposure"
            value={`${profile?.openTrades.length ?? 0} open`}
            sub={`${profile?.pendingOrders.length ?? 0} pending orders`}
          />
          <Card
            icon={<ShieldCheck size={16} />}
            label="Win Rate"
            value={pct(performance?.winRate)}
            sub={`${performance?.closed ?? 0} closed · ${performance?.wins ?? 0}W ${performance?.losses ?? 0}L · ${money(performance?.totalPL, currency)}`}
            tone={performance?.closed ? ((performance?.totalPL ?? 0) >= 0 ? 'green' : 'red') : undefined}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: 10, marginBottom: 12 }}>
          {[gold, silver].map((price, index) => (
            <div key={price?.instrument ?? `price-${index}`} style={{ ...css.panel, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...css.label, color: C.text }}>{price?.instrument?.replace('_', '/') ?? '-'}</div>
                <span style={{ color: price?.tradeable ? C.bull : C.bear, fontSize: 12, fontWeight: 600 }}>
                  {price?.tradeable ? 'Tradeable' : 'Closed'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12, ...css.mono, fontSize: 14 }}>
                <div><div style={{ ...css.muted, fontSize: 11 }}>Bid</div>{num(price?.bid)}</div>
                <div><div style={{ ...css.muted, fontSize: 11 }}>Ask</div>{num(price?.ask)}</div>
                <div><div style={{ ...css.muted, fontSize: 11 }}>Mid</div>{num(price?.mid)}</div>
                <div><div style={{ ...css.muted, fontSize: 11 }}>Spread</div>{num(price?.spread, 5)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(560px, 100%), 1fr))', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
            <Section title="Pending Strategy Orders">
              {profile?.pendingOrders.length ? (
                <div style={{ padding: 12, display: 'grid', gap: 10, minWidth: 0, maxHeight: 460, overflow: 'auto' }}>
                  {profile.pendingOrders.map((order) => {
                    const isLong = order.units > 0
                    return (
                      <div key={order.id} style={{ border: `1px solid ${C.borderFaint}`, borderRadius: 8, padding: 12, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <strong style={{ fontWeight: 600 }}>{order.instrument}</strong>
                            <SideTag long={isLong} />
                          </div>
                          <span style={{ color: C.gold, fontSize: 12 }}>Pending until {time(order.gtdTime)}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12, minWidth: 0 }}>
                          {[
                            ['Entry', num(order.price)],
                            ['Stop', num(order.stopLoss)],
                            ['Target', num(order.takeProfit)],
                            ['Units', num(Math.abs(order.units), 1)],
                          ].map(([label, value]) => (
                            <div key={label} style={{ minWidth: 0 }}>
                              <div style={{ ...css.label, fontSize: 10 }}>{label}</div>
                              <div style={{ ...css.mono, marginTop: 4, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                            </div>
                          ))}
                        </div>

                        <div title={order.clientId || order.id} style={{ marginTop: 10, color: C.muted, fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...css.mono }}>
                          {shortId(order.clientId || order.id)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : <Empty text="No pending 8AM NY limit orders right now." />}
            </Section>

            <Section title="Open Trades">
              {profile?.openTrades.length ? (
                <div style={{ overflowX: 'auto', minWidth: 0 }}>
                  <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>{['Instrument', 'Units', 'Entry', 'SL', 'TP', 'Unrealized', 'Opened'].map((head) => <th key={head} style={css.th}>{head}</th>)}</tr>
                    </thead>
                    <tbody>
                      {profile.openTrades.map((trade) => (
                        <tr key={trade.id}>
                          <td style={css.td}>{trade.instrument}</td>
                          <td style={{ ...css.td, ...css.mono, color: trade.currentUnits > 0 ? C.bull : C.bear }}>{trade.currentUnits}</td>
                          <td style={{ ...css.td, ...css.mono }}>{num(trade.price)}</td>
                          <td style={{ ...css.td, ...css.mono }}>{num(trade.stopLoss)}</td>
                          <td style={{ ...css.td, ...css.mono }}>{num(trade.takeProfit)}</td>
                          <td style={{ ...css.td, ...css.mono, color: (trade.unrealizedPL ?? 0) >= 0 ? C.bull : C.bear }}>{money(trade.unrealizedPL, currency)}</td>
                          <td style={{ ...css.td, whiteSpace: 'nowrap' }}>{time(trade.openTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty text="No open trades right now." />}
            </Section>

            <Section
              title="Trade Transactions"
              action={<span style={{ color: C.muted, fontSize: 12 }}>{tradeHistory.length} closed</span>}
            >
              {tradeHistory.length ? (
                <div style={{ maxHeight: 420, overflow: 'auto', minWidth: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
                    <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
                      <tr>
                        {['Exit', 'Strategy', 'Market', 'Side', 'Entry', 'Exit Price', 'P/L', 'Result', 'Held'].map((head) => (
                          <th key={head} style={css.th}>{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tradeHistory.map((trade) => (
                        <tr key={trade.id}>
                          <td style={{ ...css.td, whiteSpace: 'nowrap' }}>{time(trade.exitTime)}</td>
                          <td title={trade.clientId || trade.strategy} style={{ ...css.td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trade.strategy}</td>
                          <td style={css.td}>{trade.instrument}</td>
                          <td style={{ ...css.td, color: trade.side === 'Long' ? C.bull : C.bear }}>{trade.side}</td>
                          <td style={{ ...css.td, ...css.mono }}>{num(trade.entryPrice)}</td>
                          <td style={{ ...css.td, ...css.mono }}>{num(trade.exitPrice)}</td>
                          <td style={{ ...css.td, ...css.mono, color: trade.pl >= 0 ? C.bull : C.bear }}>{money(trade.pl, currency)}</td>
                          <td style={css.td}>
                            <span style={{ color: trade.result === 'Win' ? C.bull : trade.result === 'Loss' ? C.bear : C.muted, fontWeight: 600 }}>{trade.result}</span>
                          </td>
                          <td style={{ ...css.td, whiteSpace: 'nowrap' }}>{duration(trade.durationMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty text="No closed strategy trades found in recent OANDA transactions." />}
            </Section>
          </div>

          <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
            <Section title="Handled Signals">
              {latestState.length ? (
                <div style={{ padding: 12, display: 'grid', gap: 8, maxHeight: 460, overflow: 'auto' }}>
                  {latestState.map(([day, value]) => (
                    <div key={day}>
                      <div style={{ ...css.label, marginBottom: 8 }}>{day}</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {handledRows(value).map((row) => (
                          <div key={row.id} style={{ border: `1px solid ${C.borderFaint}`, borderRadius: 8, padding: 10, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.id.replaceAll('_', ' ')}</span>
                              <span style={{ color: row.placed ? C.bull : C.muted, fontSize: 11, fontWeight: 600 }}>{row.placed ? 'PLACED' : 'SKIPPED'}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 8, color: C.muted, fontSize: 11, ...css.mono }}>
                              <span>{row.direction.toUpperCase()}</span>
                              <span>E {num(row.entry)}</span>
                              <span>SL {num(row.stop)}</span>
                              <span>TP {num(row.target)}</span>
                            </div>
                            <div title={row.clientId} style={{ marginTop: 6, color: C.muted, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...css.mono }}>
                              {shortId(row.clientId)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty text="No handled 8AM NY signals saved yet." />}
            </Section>

            <Section title="Bot Log" action={<span style={{ color: C.muted, fontSize: 12 }}>{profile?.logs.length ?? 0} lines</span>}>
              <pre style={{ margin: 0, padding: 12, maxHeight: 480, overflow: 'auto', whiteSpace: 'pre-wrap', color: C.muted, fontSize: 11, lineHeight: 1.55, ...css.mono }}>
                {profile?.logs.length ? profile.logs.join('\n') : 'No log lines yet.'}
              </pre>
            </Section>
          </div>
        </div>
      </div>
    </main>
  )
}
