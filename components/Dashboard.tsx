'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type Time, type IPriceLine,
} from 'lightweight-charts'
import {
  getORCandles, computeValueArea, detectSignals,
  computeFCVLevels, detectFCVSignals,
  getLondonCandlesBySession, computeLNDBLevels, detectLNDBSignals, detectLNDB2Signals,
  computeLQData, getCurrentSession,
  computeORBData, computeDaily3Data, computeSweepData, computeAsiaFibData, computeFibContData, computeNoWickData, computeCompPlayData, computeNWCBreakoutData, computeOR15Data, computeP1Data, computeFlowModelData, computeLondonKZData,
  computeGoldSignalData, computeDXYCorrelData, computeZonePingPongData, computeLDCMData, computeSessionReversalData, computePowerOfThreeData, computeFijiData, computeQuantFalseBreakData, computeMyGoldData, computeEightAmNYOptimisedData,
  type Candle, type ValueArea, type FCVLevels, type LNDBLevels, type Signal, type LQData, type SessionInfo,
  type ORBData, type Daily3Data, type SweepData, type AsiaFibData, type FibContData, type NoWickData, type NWCBreakoutData, type OR15Data, type P1Data, type FlowModelData, type LondonKZData,
  type GoldSignalData, type DXYCorrelData, type ZonePingPongData, type LDCMData, type SessionReversalData, type PowerOfThreeData, type FijiData, type QuantFalseBreakData, type MyGoldData, type EightAmNYData,
} from '@/lib/strategy'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Settings, AlertTriangle, BookOpen, Bell, BellOff } from 'lucide-react'
import { JournalPanel, useJournal, sessionFromTime, type JournalEntry } from '@/components/Journal'

const CANDLE_POLL = 10_000
const PRICE_POLL  = 5_000
type Tab = 'vp' | 'fcv' | 'eightam' | 'lndb' | 'lndb2' | 'compare' | 'lq' | 'orb' | 'daily3' | 'sweep' | 'asiafib' | 'fibcont' | 'nwc' | 'comp' | 'nwcbo' | 'or15' | 'p1' | 'flow' | 'lkz' | 'gold' | 'dxycorr' | 'zones' | 'cont' | 'sgr' | 'p3' | 'fiji' | 'qfb25' | 'qfb15' | 'mygold'
type MacroState = 'supportive' | 'neutral' | 'hostile'

const fmt  = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const cTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' })

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: color ?? '#f9fafb', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: '#6b7280' }}>{sub}</span>}
    </div>
  )
}

// ─── Signal Card ──────────────────────────────────────────────────────────────
function SignalCard({ signal, index, onLog }: { signal: Signal; index: number; onLog?: () => void }) {
  const isBull  = signal.type === 'CONT'
  const isNWC   = signal.label.startsWith('NWC') || signal.label.startsWith('COMP')
  const risk    = Math.abs(signal.stopPrice - signal.entryPrice)
  const timeStr = cTime(signal.time) + ' CT'

  const rows = [
    { l: 'Entry',  v: fmt(signal.entryPrice), c: '#fbbf24', bold: true },
    { l: 'Stop',   v: fmt(signal.stopPrice),  c: '#ef4444', bold: true },
    ...(signal.targetPrice ? [{ l: isNWC ? 'TP · 1:1' : 'TP1 · 1R', v: fmt(signal.targetPrice), c: '#86efac', bold: false }] : []),
    ...(signal.target2     ? [{ l: 'TP2 · 2R', v: fmt(signal.target2), c: '#22c55e', bold: true  }] : []),
    ...(signal.target3     ? [{ l: 'TP3 · 3R', v: fmt(signal.target3), c: '#4ade80', bold: false }] : []),
  ]

  return (
    <div className="animate-fade-up" style={{ borderRadius: 12, border: `1px solid ${isBull ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, background: isBull ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.07)', padding: 10, fontSize: 11, animationDelay: `${index * 60}ms` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: isBull ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
          {isBull ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {signal.label}
        </span>
        <span style={{ color: '#6b7280', fontSize: 10 }}>{timeStr}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono,monospace)', fontVariantNumeric: 'tabular-nums', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(r => (
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>{r.l}</span>
            <span style={{ fontWeight: r.bold ? 700 : 500, color: r.c }}>{r.v}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1f2937', paddingTop: 4, marginTop: 2 }}>
          <span style={{ color: '#6b7280' }}>Risk</span>
          <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono,monospace)' }}>{fmt(risk)} pts</span>
        </div>
        {!signal.targetPrice && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Exit</span>
            <span style={{ color: '#6b7280' }}>Trail candle low</span>
          </div>
        )}
      </div>
      {onLog && (
        <button onClick={onLog} style={{ marginTop: 6, width: '100%', padding: '5px 0', borderRadius: 7, border: '1px solid #1f2937', background: '#0d1117', fontSize: 11, fontWeight: 600, color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <BookOpen size={10} /> + Log Trade
        </button>
      )}
    </div>
  )
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({ label, badge, active, onClick }: { label: string; badge?: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', border: active ? '1px solid rgba(251,191,36,.35)' : '1px solid #1f2937', background: active ? 'rgba(251,191,36,.1)' : 'transparent', color: active ? '#fbbf24' : '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
      {label}
      {badge && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: active ? 'rgba(251,191,36,.2)' : '#1f2937', color: active ? '#fbbf24' : '#4b5563' }}>{badge}</span>}
    </button>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef          = useRef<IChartApi | null>(null)
  const seriesRef         = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const allPriceLines     = useRef<IPriceLine[]>([])
  const m1Ref             = useRef<Candle[]>([])
  const m5Ref             = useRef<Candle[]>([])
  const m15Ref            = useRef<Candle[]>([])
  const m30Ref            = useRef<Candle[]>([])
  const h4Ref             = useRef<Candle[]>([])
  const h1Ref             = useRef<Candle[]>([])
  const dxyRef            = useRef<Candle[]>([])
  const dailyCandlesRef   = useRef<Candle[]>([])

  const [activeTab, setActiveTab]       = useState<Tab>('vp')
  const [va, setVa]                     = useState<ValueArea | null>(null)
  const [fcvLevels, setFcvLevels]       = useState<FCVLevels | null>(null)
  const [lndbLevels, setLndbLevels]           = useState<LNDBLevels | null>(null)
  const [prevLndbLevels, setPrevLndbLevels]   = useState<LNDBLevels | null>(null)
  const [lndbStart, setLndbStart]             = useState(3)
  const [lndbEnd, setLndbEnd]                 = useState(8)
  const [lqData, setLqData]             = useState<LQData | null>(null)
  const [session, setSession]           = useState<SessionInfo | null>(null)
  const [vpSignals, setVpSignals]       = useState<Signal[]>([])
  const [fcvSignals, setFcvSignals]     = useState<Signal[]>([])
  const [lndbSignals, setLndbSignals]   = useState<Signal[]>([])
  const [lndb2Signals, setLndb2Signals] = useState<Signal[]>([])
  const [livePrice, setLivePrice]       = useState<number | null>(null)
  const [prevPrice, setPrevPrice]       = useState<number | null>(null)
  const [lastUpdate, setLastUpdate]     = useState('')
  const [status, setStatus]             = useState<'loading'|'live'|'error'|'waiting'>('loading')
  const [errMsg, setErrMsg]             = useState('')
  const [refreshing, setRefreshing]     = useState(false)
  const [sessionHour, setSessionHour]   = useState(8)
  const [sessionMin, setSessionMin]     = useState(0)
  const [vaPct, setVaPct]               = useState(70)
  const [showSettings, setShowSettings] = useState(false)
  // Journal
  const [journalOpen, setJournalOpen]   = useState(false)
  const [journalEntries, setJournalEntries] = useJournal()
  // LNDB / LNDB2 sound alerts — always on by default
  const [lndbAlertsOn, setLndbAlertsOn] = useState(true)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastLndbSigTimeRef  = useRef<number>(0)
  const lastLndb2SigTimeRef = useRef<number>(0)
  const lastVpSigTimeRef    = useRef<number>(0)
  const lastSgrSigTimeRef   = useRef<number>(0)
  const lastAsiaSigTimeRef  = useRef<number>(0)
  const asiaArmedRef        = useRef<boolean>(false)  // "about to go live" pre-alert fired
  const lastLkzSigTimeRef   = useRef<number>(0)
  const lastP3SigTimeRef    = useRef<number>(0)
  const lastFijiSigTimeRef  = useRef<number>(0)

  const [orbData, setOrbData]         = useState<ORBData | null>(null)
  const [daily3Data, setDaily3Data]   = useState<Daily3Data | null>(null)
  const [sweepData, setSweepData]     = useState<SweepData | null>(null)
  const [asiaFibData, setAsiaFibData] = useState<AsiaFibData | null>(null)
  const [fibContData, setFibContData] = useState<FibContData | null>(null)
  const [nwcData, setNwcData]         = useState<NoWickData | null>(null)
  const [compData, setCompData]       = useState<NoWickData | null>(null)
  const [nwcBoData, setNwcBoData]     = useState<NWCBreakoutData | null>(null)
  const [or15Data, setOr15Data]       = useState<OR15Data | null>(null)
  const [eightAmData, setEightAmData] = useState<EightAmNYData | null>(null)
  const [p1Data, setP1Data]           = useState<P1Data | null>(null)
  const [flowData, setFlowData]       = useState<FlowModelData | null>(null)
  const [lkzData, setLkzData]         = useState<LondonKZData | null>(null)
  const [goldData, setGoldData]       = useState<GoldSignalData | null>(null)
  const [dxyCorrData, setDxyCorrData] = useState<DXYCorrelData | null>(null)
  const [zonesData, setZonesData]     = useState<ZonePingPongData | null>(null)
  const [ldcmData, setLdcmData]       = useState<LDCMData | null>(null)
  const [sgrData, setSgrData]         = useState<SessionReversalData | null>(null)
  const [p3Data, setP3Data]           = useState<PowerOfThreeData | null>(null)
  const [fijiData, setFijiData]       = useState<FijiData | null>(null)
  const [qfb25Data, setQfb25Data]     = useState<QuantFalseBreakData | null>(null)
  const [qfb15Data, setQfb15Data]     = useState<QuantFalseBreakData | null>(null)
  const [myGoldData, setMyGoldData]   = useState<MyGoldData | null>(null)
  const [macroDollar, setMacroDollar] = useState<MacroState>('neutral')
  const [macroYields, setMacroYields] = useState<MacroState>('neutral')

  const activeSignals =
    activeTab === 'vp'      ? vpSignals :
    activeTab === 'fcv'     ? fcvSignals :
    activeTab === 'eightam' ? (eightAmData?.signals ?? []) :
    activeTab === 'lndb'    ? lndbSignals :
    activeTab === 'lndb2'   ? lndb2Signals :
    activeTab === 'compare' ? lndbSignals :
    activeTab === 'lq'      ? (lqData?.signals ?? []) :
    activeTab === 'orb'     ? (orbData?.signals ?? []) :
    activeTab === 'daily3'  ? (daily3Data?.signals ?? []) :
    activeTab === 'sweep'   ? (sweepData?.signals ?? []) :
    activeTab === 'asiafib' ? (asiaFibData?.signals ?? []) :
    activeTab === 'nwc'     ? (nwcData?.signals ?? []) :
    activeTab === 'comp'    ? (compData?.signals ?? []) :
    activeTab === 'nwcbo'   ? (nwcBoData?.signals ?? []) :
    activeTab === 'or15'    ? (or15Data?.signals ?? []) :
    activeTab === 'p1'      ? (p1Data?.signals ?? []) :
    activeTab === 'flow'    ? (flowData?.signals ?? []) :
    activeTab === 'lkz'     ? (lkzData?.signals ?? []) :
    activeTab === 'gold'    ? (goldData?.signals ?? []) :
    activeTab === 'dxycorr' ? (dxyCorrData?.signals ?? []) :
    activeTab === 'zones'   ? (zonesData?.signals ?? []) :
    activeTab === 'cont'    ? (ldcmData?.signals ?? []) :
    activeTab === 'sgr'     ? (sgrData?.signals ?? []) :
    activeTab === 'p3'      ? (p3Data?.signals ?? []) :
    activeTab === 'fiji'    ? (fijiData?.signals ?? []) :
    activeTab === 'qfb25'   ? (qfb25Data?.signals ?? []) :
    activeTab === 'qfb15'   ? (qfb15Data?.signals ?? []) :
    activeTab === 'mygold'  ? (myGoldData?.signals ?? []) :
    (fibContData?.signals ?? [])
  const lastSig = activeSignals[activeSignals.length - 1] ?? null

  const handleLog = useCallback((sig: Signal) => {
    if (activeTab === 'compare') return
    const dup = journalEntries.find(e => e.signalTime === sig.time && e.tab === activeTab)
    if (dup) { setJournalOpen(true); return }
    const entry: JournalEntry = {
      id: `${activeTab}-${sig.time}-${Date.now()}`,
      loggedAt: Date.now(),
      tab: activeTab as JournalEntry['tab'],
      label: sig.label,
      signalTime: sig.time,
      entryPrice: sig.entryPrice,
      stopPrice:  sig.stopPrice,
      targetPrice: sig.targetPrice,
      target2:     sig.target2,
      target3:     sig.target3,
      outcome: 'OPEN',
      notes: '',
      session: sessionFromTime(sig.time),
    }
    setJournalEntries([...journalEntries, entry])
    setJournalOpen(true)
  }, [activeTab, journalEntries, setJournalEntries])

  // ── LNDB / LNDB2 alert sound (WebAudio) — always on ────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    const unlock = () => {
      const ctx = audioCtxRef.current ?? (() => {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return null
        audioCtxRef.current = new Ctx()
        return audioCtxRef.current
      })()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const ensureAudioCtx = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current
    if (typeof window === 'undefined') return null
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    audioCtxRef.current = new Ctx()
    return audioCtxRef.current
  }, [])

  const playBeep = useCallback((freq: number, duration: number, delay = 0) => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }, [])

  const playAlert = useCallback((kind: 'lndb' | 'lndb2' | 'vp' | 'sgr') => {
    const ctx = ensureAudioCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    if (kind === 'lndb') {
      playBeep(660, 0.18, 0)
      playBeep(880, 0.22, 0.22)
    } else if (kind === 'lndb2') {
      playBeep(880, 0.14, 0)
      playBeep(1100, 0.14, 0.17)
      playBeep(1320, 0.22, 0.34)
    } else if (kind === 'sgr') {
      // sgr — chime: low-high-low bell, distinct from the others
      playBeep(523, 0.16, 0)
      playBeep(784, 0.16, 0.20)
      playBeep(523, 0.30, 0.40)
    } else {
      // vp — descending sweep
      playBeep(1200, 0.12, 0)
      playBeep(900, 0.12, 0.14)
      playBeep(600, 0.24, 0.28)
    }
  }, [ensureAudioCtx, playBeep])

  const notify = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      try { new Notification(title, { body, tag: title }) } catch { /* ignore */ }
    }
  }, [])

  const testLndbAlerts = useCallback(() => {
    const ctx = ensureAudioCtx()
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    if (activeTab === 'sgr') {
      playAlert('sgr')
      notify('3-SESSION TEST LONG', 'Entry 2345.67 · Stop 2342.10')
      return
    }
    if (activeTab === 'p3') {
      playAlert('sgr')
      notify('POWER OF 3 TEST · NY REV ↑ → Asia Hi', 'Entry 2345.67 · Stop 2342.10 · TP 2358.40')
      return
    }
    playAlert('lndb')
    notify('LNDB TEST SHORT', 'Entry 2345.67 · Stop 2349.00 · TP1 1R')
    setTimeout(() => {
      playAlert('lndb2')
      notify('LNDB2 TEST SHORT', 'Entry 2348.20 · Stop 2351.40 · TP1 1R')
    }, 1100)
  }, [ensureAudioCtx, playAlert, notify, activeTab])

  const toggleLndbAlerts = useCallback(() => {
    const next = !lndbAlertsOn
    setLndbAlertsOn(next)
    if (next) {
      const ctx = ensureAudioCtx()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }
      // confirmation chirp so user knows audio is unlocked
      playBeep(880, 0.12, 0)
    }
  }, [lndbAlertsOn, ensureAudioCtx, playBeep])

  // Fire on new LNDB signal
  useEffect(() => {
    const sigs = lndbSignals
    if (sigs.length === 0) return
    const last = sigs[sigs.length - 1]
    if (lastLndbSigTimeRef.current === 0) { lastLndbSigTimeRef.current = last.time; return }
    if (last.time > lastLndbSigTimeRef.current) {
      lastLndbSigTimeRef.current = last.time
      if (lndbAlertsOn) {
        playAlert('lndb')
        notify(`LNDB ${last.label}`, `Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)}`)
      }
    }
  }, [lndbSignals, lndbAlertsOn, playAlert, notify])

  // ── Asia Fib: "about to go live" pre-alert (price approaching a fib level) ──
  useEffect(() => {
    if (!lndbAlertsOn || activeTab !== 'asiafib' || !asiaFibData || !livePrice) return
    if (!asiaFibData.orbBars) return
    const fibs = [asiaFibData.fib50, asiaFibData.fib618, asiaFibData.fib786].filter(Boolean)
    const NEAR = Math.max(2, (asiaFibData.asiaHigh - asiaFibData.asiaLow) * 0.05)  // ~5% of range
    const approaching = fibs.some(f => Math.abs(livePrice - f) <= NEAR)
    // No live signal yet this session → only pre-arm once
    const hasFreshSignal = asiaFibData.signals.some(s => s.time > lastAsiaSigTimeRef.current)
    if (approaching && !asiaArmedRef.current && !hasFreshSignal) {
      asiaArmedRef.current = true
      playAlert('sgr')  // distinct bell = "setup forming"
      notify('ASIA FIB — setup forming', `Price ${fmt(livePrice)} tapping fib zone. Watch for entry trigger.`)
    }
    if (!approaching) asiaArmedRef.current = false  // re-arm when price leaves the zone
  }, [asiaFibData, livePrice, lndbAlertsOn, activeTab, playAlert, notify])

  // ── Asia Fib: fire on new signal (entry live) ──────────────────────────────
  useEffect(() => {
    const sigs = asiaFibData?.signals ?? []
    if (sigs.length === 0) return
    const last = sigs[sigs.length - 1]
    if (lastAsiaSigTimeRef.current === 0) { lastAsiaSigTimeRef.current = last.time; return }
    if (last.time > lastAsiaSigTimeRef.current) {
      lastAsiaSigTimeRef.current = last.time
      asiaArmedRef.current = false
      if (lndbAlertsOn) {
        playAlert('vp')
        notify(`ASIA FIB ${last.label}`, `Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)} · TP1 ${last.targetPrice ? fmt(last.targetPrice) : '—'}`)
      }
    }
  }, [asiaFibData, lndbAlertsOn, playAlert, notify])

  // ── London KZ: fire on new signal (CE entry triggered) ─────────────────────
  useEffect(() => {
    const sigs = lkzData?.signals ?? []
    if (sigs.length === 0) return
    const last = sigs[sigs.length - 1]
    if (lastLkzSigTimeRef.current === 0) { lastLkzSigTimeRef.current = last.time; return }
    if (last.time > lastLkzSigTimeRef.current) {
      lastLkzSigTimeRef.current = last.time
      if (lndbAlertsOn) {
        playAlert('lndb2')
        notify(`LONDON KZ ${last.label}`, `CE Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)} · TP1 ${last.targetPrice ? fmt(last.targetPrice) : '—'}`)
      }
    }
  }, [lkzData, lndbAlertsOn, playAlert, notify])

  // Fire on new LNDB2 signal
  useEffect(() => {
    const sigs = lndb2Signals
    if (sigs.length === 0) return
    const last = sigs[sigs.length - 1]
    if (lastLndb2SigTimeRef.current === 0) { lastLndb2SigTimeRef.current = last.time; return }
    if (last.time > lastLndb2SigTimeRef.current) {
      lastLndb2SigTimeRef.current = last.time
      if (lndbAlertsOn) {
        playAlert('lndb2')
        notify(`LNDB2 ${last.label}`, `Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)}`)
      }
    }
  }, [lndb2Signals, lndbAlertsOn, playAlert, notify])

  // Fire on new VP signal (OR Vol Profile)
  useEffect(() => {
    if (vpSignals.length === 0) return
    const last = vpSignals[vpSignals.length - 1]
    if (lastVpSigTimeRef.current === 0) { lastVpSigTimeRef.current = last.time; return }
    if (last.time > lastVpSigTimeRef.current) {
      lastVpSigTimeRef.current = last.time
      if (lndbAlertsOn) {
        playAlert('vp')
        notify(`VP ${last.label}`, `Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)}`)
      }
    }
  }, [vpSignals, lndbAlertsOn, playAlert, notify])

  // Fire on new 3-Session Reversal signal
  useEffect(() => {
    const sigs = sgrData?.signals ?? []
    if (sigs.length === 0) return
    const last = sigs[sigs.length - 1]
    if (lastSgrSigTimeRef.current === 0) { lastSgrSigTimeRef.current = last.time; return }
    if (last.time > lastSgrSigTimeRef.current) {
      lastSgrSigTimeRef.current = last.time
      if (lndbAlertsOn) {
        playAlert('sgr')
        notify(`3-Session ${last.label}`, `Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)}`)
      }
    }
  }, [sgrData, lndbAlertsOn, playAlert, notify])

  // Fire on new Power of Three signal (NY reversal entry)
  useEffect(() => {
    const sigs = p3Data?.signals ?? []
    if (sigs.length === 0) return
    const last = sigs[sigs.length - 1]
    if (lastP3SigTimeRef.current === 0) { lastP3SigTimeRef.current = last.time; return }
    if (last.time > lastP3SigTimeRef.current) {
      lastP3SigTimeRef.current = last.time
      if (lndbAlertsOn) {
        playAlert('sgr')
        notify(`Power of 3 ${last.label}`, `Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)} · TP ${last.targetPrice ? fmt(last.targetPrice) : '—'}`)
      }
    }
  }, [p3Data, lndbAlertsOn, playAlert, notify])

  // Fire on new Fiji signal
  useEffect(() => {
    const sigs = fijiData?.signals ?? []
    if (sigs.length === 0) return
    const last = sigs[sigs.length - 1]
    if (lastFijiSigTimeRef.current === 0) { lastFijiSigTimeRef.current = last.time; return }
    if (last.time > lastFijiSigTimeRef.current) {
      lastFijiSigTimeRef.current = last.time
      if (lndbAlertsOn) {
        playAlert('lndb')
        notify(`FIJI ${last.label}`, `Entry ${fmt(last.entryPrice)} · Stop ${fmt(last.stopPrice)} · TP3 ${last.target3 ? fmt(last.target3) : '—'}`)
      }
    }
  }, [fijiData, lndbAlertsOn, playAlert, notify])

  // ── Clear all price lines ──────────────────────────────────────────────────
  const clearLines = useCallback(() => {
    const series = seriesRef.current
    if (!series) return
    for (const pl of allPriceLines.current) {
      try { series.removePriceLine(pl) } catch { /* already removed */ }
    }
    allPriceLines.current = []
  }, [])

  const addLine = useCallback((series: ISeriesApi<'Candlestick'>, opts: Parameters<typeof series.createPriceLine>[0]) => {
    try {
      const pl = series.createPriceLine(opts)
      allPriceLines.current.push(pl)
    } catch { /* series disposed */ }
  }, [])

  // ── Draw VP levels ─────────────────────────────────────────────────────────
  const drawVPLevels = useCallback((va: ValueArea) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    addLine(s, { price: va.orHigh, color: '#3b82f6', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `OR Hi  ${fmt(va.orHigh)}` })
    addLine(s, { price: va.vah,    color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `VAH  ${fmt(va.vah)}` })
    addLine(s, { price: va.poc,    color: '#f97316', lineWidth: 1, lineStyle: LineStyle.Dotted,       axisLabelVisible: true, title: `POC  ${fmt(va.poc)}` })
    addLine(s, { price: va.val,    color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `VAL  ${fmt(va.val)}` })
    addLine(s, { price: va.orLow,  color: '#3b82f6', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `OR Lo  ${fmt(va.orLow)}` })
  }, [clearLines, addLine])

  // ── Draw FCV levels ────────────────────────────────────────────────────────
  const drawFCVLevels = useCallback((fcv: FCVLevels) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    addLine(s, { price: fcv.orHigh,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,       axisLabelVisible: true, title: `1C Hi  ${fmt(fcv.orHigh)}` })
    addLine(s, { price: fcv.orMid,   color: '#6b7280', lineWidth: 1, lineStyle: LineStyle.Dotted,      axisLabelVisible: true, title: `1C Mid  ${fmt(fcv.orMid)}` })
    addLine(s, { price: fcv.orLow,   color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Solid,       axisLabelVisible: true, title: `1C Lo  ${fmt(fcv.orLow)}` })
    addLine(s, { price: fcv.orOpen,  color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `1C Open  ${fmt(fcv.orOpen)}` })
    addLine(s, { price: fcv.orClose, color: '#a78bfa', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `1C Close  ${fmt(fcv.orClose)}` })
  }, [clearLines, addLine])

  // ── Draw LNDB levels (London session high/low) ───────────────────────────
  const drawLNDBLevels = useCallback((lndb: LNDBLevels, prev?: LNDBLevels | null) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (prev) {
      addLine(s, { price: prev.londonHigh, color: 'rgba(6,182,212,0.35)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Prev Hi  ${fmt(prev.londonHigh)}` })
      addLine(s, { price: prev.londonLow,  color: 'rgba(6,182,212,0.35)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Prev Lo  ${fmt(prev.londonLow)}` })
    }
    addLine(s, { price: lndb.londonHigh, color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `London Hi  ${fmt(lndb.londonHigh)}` })
    addLine(s, { price: lndb.londonLow,  color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `London Lo  ${fmt(lndb.londonLow)}` })
    const mid = (lndb.londonHigh + lndb.londonLow) / 2
    addLine(s, { price: mid, color: '#164e63', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
  }, [clearLines, addLine])

  // ── Draw LNDB signal price lines (entry / stop / TP1-3) ───────────────────
  const drawLNDBSignalLines = useCallback((sig: Signal) => {
    const s = seriesRef.current; if (!s) return
    addLine(s, { price: sig.entryPrice, color: '#fbbf24',  lineWidth: 1, lineStyle: LineStyle.Dashed,  axisLabelVisible: true, title: `Entry  ${fmt(sig.entryPrice)}` })
    addLine(s, { price: sig.stopPrice,  color: '#ef4444',  lineWidth: 1, lineStyle: LineStyle.Dashed,  axisLabelVisible: true, title: `Stop   ${fmt(sig.stopPrice)}` })
    if (sig.targetPrice) addLine(s, { price: sig.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1    ${fmt(sig.targetPrice)}` })
    if (sig.target2)     addLine(s, { price: sig.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2    ${fmt(sig.target2)}` })
    if (sig.target3)     addLine(s, { price: sig.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3    ${fmt(sig.target3)}` })
  }, [addLine])

  // ── Draw Fiji levels (OR range + IFVG + signal lines) ────────────────────
  const drawFijiLevels = useCallback((data: FijiData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (!data.orHigh || !data.orLow) return
    addLine(s, { price: data.orHigh, color: '#7c3aed', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `OR Hi  ${fmt(data.orHigh)}` })
    addLine(s, { price: data.orLow,  color: '#7c3aed', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `OR Lo  ${fmt(data.orLow)}` })
    addLine(s, { price: (data.orHigh + data.orLow) / 2, color: '#374151', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
    if (data.ifvg) {
      const col = data.sweepType === 'high' ? '#ef4444' : '#22c55e'
      addLine(s, { price: data.ifvg.top,    color: col, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `IFVG top  ${fmt(data.ifvg.top)}` })
      addLine(s, { price: data.ifvg.bottom, color: col, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `IFVG bot  ${fmt(data.ifvg.bottom)}` })
    }
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 OR  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  const drawQuantFalseBreakLevels = useCallback((data: QuantFalseBreakData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (!data.rangeHigh || !data.rangeLow) return
    addLine(s, { price: data.rangeHigh, color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `L1 Hi  ${fmt(data.rangeHigh)}` })
    addLine(s, { price: data.rangeLow,  color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `L1 Lo  ${fmt(data.rangeLow)}` })
    addLine(s, { price: data.rangeHigh + data.buffer, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Fade short  ${fmt(data.rangeHigh + data.buffer)}` })
    addLine(s, { price: data.rangeLow - data.buffer,  color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Fade long  ${fmt(data.rangeLow - data.buffer)}` })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Stop  ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP  ${fmt(ls.targetPrice)}` })
    }
  }, [clearLines, addLine])

  // ── Draw MY GOLD levels (zones + BOS + FVG) ───────────────────────────────
  const drawMyGoldLevels = useCallback((data: MyGoldData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    for (const z of data.zones.filter(z => z.type === 'supply').slice(-5)) {
      const col = z.timeframe === 'daily' ? '#ef4444' : z.timeframe === 'h4' ? 'rgba(239,68,68,.6)' : 'rgba(239,68,68,.35)'
      addLine(s, { price: z.level, color: col, lineWidth: z.timeframe === 'daily' ? 2 : 1, lineStyle: LineStyle.Dashed, axisLabelVisible: z.timeframe !== 'h1', title: z.timeframe === 'h1' ? '' : `${z.timeframe.toUpperCase()} Supply  ${z.level.toFixed(2)}` })
    }
    for (const z of data.zones.filter(z => z.type === 'demand').slice(-5)) {
      const col = z.timeframe === 'daily' ? '#22c55e' : z.timeframe === 'h4' ? 'rgba(34,197,94,.6)' : 'rgba(34,197,94,.35)'
      addLine(s, { price: z.level, color: col, lineWidth: z.timeframe === 'daily' ? 2 : 1, lineStyle: LineStyle.Dashed, axisLabelVisible: z.timeframe !== 'h1', title: z.timeframe === 'h1' ? '' : `${z.timeframe.toUpperCase()} Demand  ${z.level.toFixed(2)}` })
    }
    if (data.bosLevel) {
      addLine(s, { price: data.bosLevel, color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `BOS ${data.bosType?.toUpperCase()}  ${data.bosLevel.toFixed(2)}` })
    }
    if (data.activeFvg) {
      const col = data.activeFvg.type === 'bullish' ? '#22c55e' : '#ef4444'
      addLine(s, { price: data.activeFvg.top,    color: col,      lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `FVG Top  ${data.activeFvg.top.toFixed(2)}` })
      addLine(s, { price: data.activeFvg.mid,    color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `50% EQ  ${data.activeFvg.mid.toFixed(2)}` })
      addLine(s, { price: data.activeFvg.bottom, color: col,      lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `FVG Bot  ${data.activeFvg.bottom.toFixed(2)}` })
    }
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${ls.entryPrice.toFixed(2)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Stop   ${ls.stopPrice.toFixed(2)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1    ${ls.targetPrice.toFixed(2)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2    ${ls.target2.toFixed(2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3    ${ls.target3.toFixed(2)}` })
    }
  }, [clearLines, addLine])

  // ── Draw LQ data (FVGs + liquidity zones + PDH/PDL) ──────────────────────
  const drawLQData = useCallback((data: LQData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    // PDH / PDL
    if (data.pdh) addLine(s, { price: data.pdh, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `PDH  ${fmt(data.pdh)}` })
    if (data.pdl) addLine(s, { price: data.pdl, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `PDL  ${fmt(data.pdl)}` })
    // FVGs — last 8 unfilled, then last 4 filled (dimmer)
    const unfilled = data.fvgs.filter(g => !g.filled).slice(-8)
    const filled   = data.fvgs.filter(g =>  g.filled).slice(-4)
    for (const g of [...filled, ...unfilled]) {
      const bull  = g.type === 'bullish'
      const dim   = g.filled
      const col   = bull ? (dim ? 'rgba(34,197,94,.3)' : '#22c55e') : (dim ? 'rgba(239,68,68,.3)' : '#ef4444')
      const style = dim ? LineStyle.SparseDotted : LineStyle.Dashed
      addLine(s, { price: g.top,    color: col, lineWidth: 1, lineStyle: style, axisLabelVisible: !dim, title: dim ? '' : `FVG${bull?'↑':'↓'}  ${fmt(g.top)}` })
      addLine(s, { price: g.bottom, color: col, lineWidth: 1, lineStyle: style, axisLabelVisible: false, title: '' })
    }
    // Liquidity zones — unswept solid, swept dotted/dim
    const sorted = [...data.liquidity].sort((a, b) => b.level - a.level)
    for (const z of sorted) {
      const bsl  = z.type === 'BSL'
      const col  = z.swept ? (bsl ? 'rgba(59,130,246,.3)' : 'rgba(168,85,247,.3)') : (bsl ? '#3b82f6' : '#a855f7')
      const w    = z.strength >= 3 ? 2 : 1
      const sty  = z.swept ? LineStyle.SparseDotted : (z.strength >= 2 ? LineStyle.Solid : LineStyle.Dotted)
      const tag  = `${z.type}${z.strength >= 2 ? ` ×${z.strength}` : ''}${z.swept ? ' ✓' : ''}  ${fmt(z.level)}`
      addLine(s, { price: z.level, color: col, lineWidth: w, lineStyle: sty, axisLabelVisible: !z.swept, title: z.swept ? '' : tag })
    }
  }, [clearLines, addLine])

  // ── Draw ORB levels ────────────────────────────────────────────────────────
  const drawORBLevels = useCallback((orb: ORBData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    addLine(s, { price: orb.orbHigh, color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `ORB Hi  ${fmt(orb.orbHigh)}` })
    addLine(s, { price: orb.orbLow,  color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `ORB Lo  ${fmt(orb.orbLow)}` })
    addLine(s, { price: (orb.orbHigh + orb.orbLow) / 2, color: '#374151', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
  }, [clearLines, addLine])

  // ── Draw Daily 3-Level ──────────────────────────────────────────────────────
  const drawDaily3Levels = useCallback((d3: Daily3Data) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    addLine(s, { price: d3.prevHigh, color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `PD Hi  ${fmt(d3.prevHigh)}` })
    addLine(s, { price: d3.midLevel, color: '#6b7280', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `PD Mid  ${fmt(d3.midLevel)}` })
    addLine(s, { price: d3.prevLow,  color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `PD Lo  ${fmt(d3.prevLow)}` })
  }, [clearLines, addLine])

  // ── Draw Sweep levels ───────────────────────────────────────────────────────
  const drawSweepLevels = useCallback((sw: SweepData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    addLine(s, { price: sw.prevHigh, color: '#fbbf24', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `PD Hi  ${fmt(sw.prevHigh)}` })
    addLine(s, { price: sw.prevLow,  color: '#fbbf24', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `PD Lo  ${fmt(sw.prevLow)}` })
  }, [clearLines, addLine])

  // ── Draw Asia Fib levels ────────────────────────────────────────────────────
  const drawAsiaFibLevels = useCallback((af: AsiaFibData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    addLine(s, { price: af.asiaHigh, color: '#7c3aed', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Asia Hi  ${fmt(af.asiaHigh)}` })
    addLine(s, { price: af.fib236,   color: 'rgba(251,191,36,0.5)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `0.236  ${fmt(af.fib236)}` })
    addLine(s, { price: af.fib50,    color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `0.5  ${fmt(af.fib50)}` })
    addLine(s, { price: af.fib618,   color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `0.618  ${fmt(af.fib618)}` })
    addLine(s, { price: af.fib786,   color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `0.786  ${fmt(af.fib786)}` })
    addLine(s, { price: af.asiaLow,  color: '#7c3aed', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Asia Lo  ${fmt(af.asiaLow)}` })
    const ls = af.signals[af.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1.2R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 2R  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 Asia  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw Fib Continuation levels ────────────────────────────────────────────
  const drawFibContLevels = useCallback((fc: FibContData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    const col = fc.trend === 'up' ? '#22c55e' : '#ef4444'
    addLine(s, { price: fc.swingHigh, color: col, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Swing Hi  ${fmt(fc.swingHigh)}` })
    addLine(s, { price: fc.fib236,    color: 'rgba(251,191,36,0.5)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `0.236  ${fmt(fc.fib236)}` })
    addLine(s, { price: fc.fib50,     color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `0.5  ${fmt(fc.fib50)}` })
    addLine(s, { price: fc.fib618,    color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `0.618  ${fmt(fc.fib618)}` })
    addLine(s, { price: fc.fib786,    color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `0.786  ${fmt(fc.fib786)}` })
    addLine(s, { price: fc.swingLow,  color: col, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Swing Lo  ${fmt(fc.swingLow)}` })
    const ls = fc.signals[fc.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 SwHi  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw No-Wick Candle levels ──────────────────────────────────────────────
  const drawNoWickLevels = useCallback((data: NoWickData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    // BOS level (the broken structure)
    if (data.bosLevel) addLine(s, { price: data.bosLevel, color: 'rgba(251,191,36,.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `BOS ${data.trend === 'up' ? '↑' : '↓'}  ${fmt(data.bosLevel)}` })
    // Structural stop
    if (data.structureStop) addLine(s, { price: data.structureStop, color: 'rgba(239,68,68,.6)', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `Stop  ${fmt(data.structureStop)}` })
    // No-wick candle open levels (flat side) — last 8, valid = solid, counter-trend = dim
    for (const nwc of data.noWickCandles.slice(-8)) {
      const col = nwc.direction === 'bull'
        ? (nwc.validForTrend ? '#22c55e' : 'rgba(34,197,94,.3)')
        : (nwc.validForTrend ? '#ef4444' : 'rgba(239,68,68,.3)')
      const w = nwc.validForTrend ? 2 : 1
      addLine(s, { price: nwc.open, color: col, lineWidth: w, lineStyle: LineStyle.Solid, axisLabelVisible: nwc.validForTrend, title: nwc.validForTrend ? `NWC ${nwc.direction === 'bull' ? '↑' : '↓'}  ${fmt(nwc.open)}` : '' })
    }
    // Last signal lines
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP 1:1  ${fmt(ls.targetPrice)}` })
    }
  }, [clearLines, addLine])

  // ── Draw NWC Breakout levels ────────────────────────────────────────────────
  const drawNWCBreakoutLevels = useCallback((data: NWCBreakoutData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    // S/R zones — resistance red, support green; brighter for 3+ touches
    for (const z of data.srZones) {
      const isRes  = z.type === 'resistance'
      const strong = z.touches >= 3
      const col    = isRes ? (strong ? 'rgba(239,68,68,.75)' : 'rgba(239,68,68,.4)') : (strong ? 'rgba(34,197,94,.75)' : 'rgba(34,197,94,.4)')
      addLine(s, { price: z.level, color: col, lineWidth: strong ? 2 : 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${isRes ? 'R' : 'S'}×${z.touches}  ${fmt(z.level)}` })
    }
    // Last signal
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 2R  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw OR15 levels ────────────────────────────────────────────────────────
  const drawOR15Levels = useCallback((data: OR15Data) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (!data.orHigh || !data.orLow) return
    addLine(s, { price: data.orHigh, color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `OR Hi  ${fmt(data.orHigh)}` })
    addLine(s, { price: data.orLow,  color: '#f97316', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `OR Lo  ${fmt(data.orLow)}` })
    addLine(s, { price: (data.orHigh + data.orLow) / 2, color: '#374151', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1:2  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 1:3  ${fmt(ls.target2)}` })
    }
  }, [clearLines, addLine])

  const drawEightAmLevels = useCallback((data: EightAmNYData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (!data.rangeHigh || !data.rangeLow) return
    addLine(s, { price: data.rangeHigh, color: '#38bdf8', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `8AM Hi  ${fmt(data.rangeHigh)}` })
    addLine(s, { price: data.rangeLow,  color: '#38bdf8', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `8AM Lo  ${fmt(data.rangeLow)}` })
    addLine(s, { price: (data.rangeHigh + data.rangeLow) / 2, color: '#374151', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
    if (data.entry)  addLine(s, { price: data.entry,  color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(data.entry)}` })
    if (data.stop)   addLine(s, { price: data.stop,   color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Stop  ${fmt(data.stop)}` })
    if (data.target) addLine(s, { price: data.target, color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP  ${fmt(data.target)}` })
  }, [clearLines, addLine])

  // ── Draw P1 levels ─────────────────────────────────────────────────────────
  const drawP1Levels = useCallback((data: P1Data) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    // Active M15 FVG
    if (data.activeFvg) {
      const bull = data.activeFvg.type === 'bullish'
      const col  = bull ? '#22c55e' : '#ef4444'
      addLine(s, { price: data.activeFvg.top,    color: col, lineWidth: 2, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `M15 FVG${bull?'↑':'↓'} Top  ${fmt(data.activeFvg.top)}` })
      addLine(s, { price: data.activeFvg.mid,    color: col, lineWidth: 1, lineStyle: LineStyle.Dotted,       axisLabelVisible: false, title: '' })
      addLine(s, { price: data.activeFvg.bottom, color: col, lineWidth: 2, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `M15 FVG${bull?'↑':'↓'} Bot  ${fmt(data.activeFvg.bottom)}` })
    }
    // Most recent sweep level
    const lastSw = data.sweeps[data.sweeps.length - 1]
    if (lastSw) {
      addLine(s, { price: lastSw.sweepLevel, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `M5 Sweep  ${fmt(lastSw.sweepLevel)}` })
    }
    // Last signal
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,       axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 2R  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw Flow Model levels ─────────────────────────────────────────────────
  const drawFlowLevels = useCallback((data: FlowModelData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    const bull = data.bias === 'bullish'
    // HTF FVG zone
    if (data.htfFvg) {
      const col = bull ? '#22c55e' : '#ef4444'
      addLine(s, { price: data.htfFvg.top,    color: col,        lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true,  title: `HTF FVG${bull?'↑':'↓'} Top  ${fmt(data.htfFvg.top)}` })
      addLine(s, { price: data.htfFvg.mid,    color: col,        lineWidth: 1, lineStyle: LineStyle.Dotted,       axisLabelVisible: false, title: '' })
      addLine(s, { price: data.htfFvg.bottom, color: col,        lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true,  title: `HTF FVG${bull?'↑':'↓'} Bot  ${fmt(data.htfFvg.bottom)}` })
    }
    // Resting liquidity
    if (data.restingLiq) {
      addLine(s, { price: data.restingLiq, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Resting Liq  ${fmt(data.restingLiq)}` })
    }
    // 13 EMA current value
    if (data.currentEma13) {
      addLine(s, { price: data.currentEma13, color: '#a78bfa', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `13 EMA  ${fmt(data.currentEma13)}` })
    }
    // Last signal
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,       axisLabelVisible: true,  title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,        axisLabelVisible: true,  title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 Liq  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw London Kill Zone levels ──────────────────────────────────────────
  const drawLKZLevels = useCallback((data: LondonKZData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (data.asianHigh) addLine(s, { price: data.asianHigh, color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Asian Hi (BSL)  ${fmt(data.asianHigh)}` })
    if (data.asianLow)  addLine(s, { price: data.asianLow,  color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Asian Lo (SSL)  ${fmt(data.asianLow)}` })
    // Displacement FVG zone
    if (data.fvgTop && data.fvgBottom) {
      const col = data.sweepType === 'bullish' ? '#22c55e' : '#ef4444'
      addLine(s, { price: data.fvgTop,    color: col, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
      addLine(s, { price: data.fvgBottom, color: col, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
    }
    if (data.ceEntry) addLine(s, { price: data.ceEntry, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `CE 50%  ${fmt(data.ceEntry)}` })
    if (data.sweepLevel) addLine(s, { price: data.sweepLevel, color: '#a78bfa', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `Sweep  ${fmt(data.sweepLevel)}` })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 Asian  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 Ext  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw Gold Signal levels ───────────────────────────────────────────────
  const drawGoldLevels = useCallback((data: GoldSignalData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (data.asiaHigh) addLine(s, { price: data.asiaHigh, color: '#fbbf24', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Asia Hi  ${fmt(data.asiaHigh)}` })
    if (data.asiaLow)  addLine(s, { price: data.asiaLow,  color: '#fbbf24', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Asia Lo  ${fmt(data.asiaLow)}` })
    if (data.sweepLevel) addLine(s, { price: data.sweepLevel, color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Sweep  ${fmt(data.sweepLevel)}` })
    if (data.m15Structure) addLine(s, { price: data.m15Structure, color: '#a78bfa', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `M15 BOS  ${fmt(data.m15Structure)}` })
    if (data.ema20) addLine(s, { price: data.ema20, color: '#6b7280', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `20 EMA  ${fmt(data.ema20)}` })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw DXY Correl levels ────────────────────────────────────────────────
  const drawDXYCorrelLevels = useCallback((data: DXYCorrelData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (data.dxyPushStartPrice) addLine(s, { price: data.dxyPushStartPrice, color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Dotted,  axisLabelVisible: true, title: `DXY Push Start  ${fmt(data.dxyPushStartPrice)}` })
    if (data.dxyPushEndPrice)   addLine(s, { price: data.dxyPushEndPrice,   color: '#06b6d4', lineWidth: 2, lineStyle: LineStyle.Dashed,   axisLabelVisible: true, title: `DXY Push End    ${fmt(data.dxyPushEndPrice)}` })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,  axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,   axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted,  axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed,  axisLabelVisible: true, title: `TP2 Lag ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,   axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw Zone Ping-Pong levels ────────────────────────────────────────────
  const drawZonePingPongLevels = useCallback((data: ZonePingPongData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    for (const z of data.sellZones.slice(0, 5)) {
      const col = z.strength === 'strong' ? '#ef4444' : z.strength === 'moderate' ? '#f97316' : '#7f1d1d'
      addLine(s, { price: z.level, color: col, lineWidth: z.strength === 'strong' ? 2 : 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `SELL ×${z.touches}  ${fmt(z.level)}` })
    }
    for (const z of data.buyZones.slice(0, 5)) {
      const col = z.strength === 'strong' ? '#22c55e' : z.strength === 'moderate' ? '#86efac' : '#14532d'
      addLine(s, { price: z.level, color: col, lineWidth: z.strength === 'strong' ? 2 : 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `BUY ×${z.touches}  ${fmt(z.level)}` })
    }
    if (data.activeZone) {
      const ac = data.activeZoneType === 'sell' ? '#ef4444' : '#22c55e'
      addLine(s, { price: data.activeZone.level, color: ac, lineWidth: 3, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `ACTIVE ${data.activeZoneType?.toUpperCase()}  ${fmt(data.activeZone.level)}` })
    }
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice,  color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,  axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,   color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,   axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 Zone  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw LDCM levels ─────────────────────────────────────────────────────
  const drawLDCMLevels = useCallback((data: LDCMData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (data.rangeHigh) addLine(s, { price: data.rangeHigh, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Range Hi  ${fmt(data.rangeHigh)}` })
    if (data.rangeLow)  addLine(s, { price: data.rangeLow,  color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Range Lo  ${fmt(data.rangeLow)}` })
    if (data.equilibrium) addLine(s, { price: data.equilibrium, color: '#6b7280', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: `Equil  ${fmt(data.equilibrium)}` })
    if (data.displacementHigh) addLine(s, { price: data.displacementHigh, color: '#f97316', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Disp Hi  ${fmt(data.displacementHigh)}` })
    if (data.displacementLow)  addLine(s, { price: data.displacementLow,  color: '#f97316', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Disp Lo  ${fmt(data.displacementLow)}` })
    if (data.ifvgTop)    addLine(s, { price: data.ifvgTop,    color: '#a78bfa', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `IFVG Top  ${fmt(data.ifvgTop)}` })
    if (data.ifvgBottom) addLine(s, { price: data.ifvgBottom, color: '#a78bfa', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `IFVG Bot  ${fmt(data.ifvgBottom)}` })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice,  color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed,  axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,   color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,   axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP1 1R  ${fmt(ls.targetPrice)}` })
      if (ls.target2)     addLine(s, { price: ls.target2,     color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `TP2 2R  ${fmt(ls.target2)}` })
      if (ls.target3)     addLine(s, { price: ls.target3,     color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `TP3 3R  ${fmt(ls.target3)}` })
    }
  }, [clearLines, addLine])

  // ── Draw Session Reversal (SGR) levels ────────────────────────────────────
  const drawSessionReversalLevels = useCallback((data: SessionReversalData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (data.highZone) addLine(s, { price: data.highZone, color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `High Zone  ${fmt(data.highZone)}` })
    if (data.lowZone)  addLine(s, { price: data.lowZone,  color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Low Zone  ${fmt(data.lowZone)}` })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
      if (ls.targetPrice) addLine(s, { price: ls.targetPrice, color: '#86efac', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `TP 1R  ${fmt(ls.targetPrice)}` })
    }
  }, [clearLines, addLine])

  // ── Draw Power of Three levels (Asia range + NY reversal target) ───────────
  const drawPowerOfThreeLevels = useCallback((data: PowerOfThreeData) => {
    const s = seriesRef.current; if (!s) return; clearLines()
    if (data.asiaHigh) addLine(s, { price: data.asiaHigh, color: data.londonSwept === 'high' ? 'rgba(239,68,68,.4)' : '#ef4444', lineWidth: 2, lineStyle: data.londonSwept === 'high' ? LineStyle.SparseDotted : LineStyle.Solid, axisLabelVisible: true, title: `Asia Hi${data.londonSwept === 'high' ? ' ✓swept' : ''}  ${fmt(data.asiaHigh)}` })
    if (data.asiaLow)  addLine(s, { price: data.asiaLow,  color: data.londonSwept === 'low'  ? 'rgba(34,197,94,.4)' : '#22c55e', lineWidth: 2, lineStyle: data.londonSwept === 'low'  ? LineStyle.SparseDotted : LineStyle.Solid, axisLabelVisible: true, title: `Asia Lo${data.londonSwept === 'low' ? ' ✓swept' : ''}  ${fmt(data.asiaLow)}` })
    if (data.target)   addLine(s, { price: data.target, color: '#fbbf24', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Target  ${fmt(data.target)}` })
    const ls = data.signals[data.signals.length - 1]
    if (ls) {
      addLine(s, { price: ls.entryPrice, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Entry  ${fmt(ls.entryPrice)}` })
      addLine(s, { price: ls.stopPrice,  color: '#ef4444', lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: `Stop   ${fmt(ls.stopPrice)}` })
    }
  }, [clearLines, addLine])

  // ── Redraw levels when tab changes ────────────────────────────────────────
  useEffect(() => {
    const m1data = m1Ref.current.map(toBar)
    const m5data = m5Ref.current.map(toBar)
    if (activeTab === 'compare' && lndbLevels) {
      drawLNDBLevels(lndbLevels, prevLndbLevels)
      seriesRef.current?.setData(m5data)
      updateCompareMarkers(lndbSignals, lndb2Signals)
      return
    }
    if (activeTab === 'vp'      && va)         { drawVPLevels(va);         seriesRef.current?.setData(m1data) }
    if (activeTab === 'fcv'     && fcvLevels)  { drawFCVLevels(fcvLevels); seriesRef.current?.setData(m1data) }
    if ((activeTab === 'lndb' || activeTab === 'lndb2') && lndbLevels) {
      drawLNDBLevels(lndbLevels, prevLndbLevels)
      const sigs = activeTab === 'lndb' ? lndbSignals : lndb2Signals
      const ls = sigs[sigs.length - 1]; if (ls) drawLNDBSignalLines(ls)
      seriesRef.current?.setData(m5data)
    }
    if (activeTab === 'lq'      && lqData)     { drawLQData(lqData);          seriesRef.current?.setData(m5data) }
    if (activeTab === 'orb'     && orbData)    { drawORBLevels(orbData);      seriesRef.current?.setData(m1data) }
    if (activeTab === 'daily3'  && daily3Data) { drawDaily3Levels(daily3Data); seriesRef.current?.setData(m5data) }
    if (activeTab === 'sweep'   && sweepData)  { drawSweepLevels(sweepData);  seriesRef.current?.setData(m5data) }
    if (activeTab === 'asiafib' && asiaFibData){ drawAsiaFibLevels(asiaFibData); seriesRef.current?.setData(m5data) }
    if (activeTab === 'fibcont' && fibContData){ drawFibContLevels(fibContData); seriesRef.current?.setData(m5data) }
    if (activeTab === 'nwc'     && nwcData && nwcData.bosLevel) {
      drawNoWickLevels(nwcData)
      seriesRef.current?.setData(m15Ref.current.map(toBar))
    }
    if (activeTab === 'comp'    && compData && compData.bosLevel) {
      drawNoWickLevels(compData)
      seriesRef.current?.setData(m15Ref.current.map(toBar))
    }
    if (activeTab === 'nwcbo'   && nwcBoData && nwcBoData.srZones.length > 0) {
      drawNWCBreakoutLevels(nwcBoData)
      seriesRef.current?.setData(m30Ref.current.map(toBar))
    }
    if (activeTab === 'or15'    && or15Data && or15Data.orBars > 0) {
      drawOR15Levels(or15Data)
      seriesRef.current?.setData(m1Ref.current.map(toBar))
    }
    if (activeTab === 'p1'      && p1Data && p1Data.bias !== 'neutral') {
      drawP1Levels(p1Data)
      seriesRef.current?.setData(m5Ref.current.map(toBar))
    }
    if (activeTab === 'flow'    && flowData && flowData.bias !== 'neutral') {
      drawFlowLevels(flowData)
      seriesRef.current?.setData(m5Ref.current.map(toBar))
    }
    if (activeTab === 'lkz'     && lkzData && lkzData.asianHigh) {
      drawLKZLevels(lkzData)
      seriesRef.current?.setData(m5Ref.current.map(toBar))
    }
    if (activeTab === 'gold' && goldData) {
      drawGoldLevels(goldData)
      seriesRef.current?.setData(m15Ref.current.map(toBar))
    }
    if (activeTab === 'dxycorr' && dxyCorrData) {
      drawDXYCorrelLevels(dxyCorrData)
      seriesRef.current?.setData(m15Ref.current.map(toBar))
    }
    if (activeTab === 'zones' && zonesData) {
      drawZonePingPongLevels(zonesData)
      seriesRef.current?.setData(m30Ref.current.map(toBar))
    }
    if (activeTab === 'cont' && ldcmData) {
      drawLDCMLevels(ldcmData)
      seriesRef.current?.setData(m15Ref.current.map(toBar))
    }
    if (activeTab === 'sgr' && sgrData) {
      drawSessionReversalLevels(sgrData)
      seriesRef.current?.setData(m1data)
    }
    if (activeTab === 'p3' && p3Data) {
      drawPowerOfThreeLevels(p3Data)
      seriesRef.current?.setData(m5data)
    }
    if (activeTab === 'fiji'    && fijiData)   { drawFijiLevels(fijiData);     seriesRef.current?.setData(m1Ref.current.map(toBar)) }
    if (activeTab === 'qfb25'   && qfb25Data)  { drawQuantFalseBreakLevels(qfb25Data); seriesRef.current?.setData(m15Ref.current.map(toBar)) }
    if (activeTab === 'qfb15'   && qfb15Data)  { drawQuantFalseBreakLevels(qfb15Data); seriesRef.current?.setData(m15Ref.current.map(toBar)) }
    updateMarkers(activeSignals)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const toBar = (c: Candle) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })

  const updateMarkers = useCallback((sigs: Signal[]) => {
    if (!seriesRef.current) return
    try {
      seriesRef.current.setMarkers(
        [...sigs].sort((a, b) => a.time - b.time).map(sig => ({
          time: sig.time as Time,
          position: (sig.type === 'TRAP' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
          color: sig.type === 'TRAP' ? '#ef4444' : '#22c55e',
          shape: (sig.type === 'TRAP' ? 'arrowDown' : 'arrowUp') as 'arrowDown' | 'arrowUp',
          text: sig.label,
          size: 1,
        }))
      )
    } catch { /* series disposed */ }
  }, [])

  const updateCompareMarkers = useCallback((lndb: Signal[], lndb2: Signal[]) => {
    if (!seriesRef.current) return
    const lndbMarkers = lndb.map(sig => ({
      time: sig.time as Time,
      position: (sig.type === 'TRAP' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
      color: sig.type === 'TRAP' ? '#f97316' : '#fbbf24',
      shape: (sig.type === 'TRAP' ? 'arrowDown' : 'arrowUp') as 'arrowDown' | 'arrowUp',
      text: 'LNDB',
      size: 1,
    }))
    const lndb2Markers = lndb2.map(sig => ({
      time: sig.time as Time,
      position: (sig.type === 'TRAP' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
      color: '#06b6d4',
      shape: 'circle' as 'circle',
      text: 'LNDB2',
      size: 1,
    }))
    try {
      seriesRef.current.setMarkers([...lndbMarkers, ...lndb2Markers].sort((a, b) => (a.time as number) - (b.time as number)))
    } catch { /* series disposed */ }
  }, [])

  // ── Fetch all data ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const [r1, r5, rD, r15, r30, rH4, rH1, rDxy] = await Promise.all([
        fetch('/api/candles'), fetch('/api/m5candles'),
        fetch('/api/dailycandles').catch(() => null),
        fetch('/api/m15candles').catch(() => null),
        fetch('/api/m30candles').catch(() => null),
        fetch('/api/h4candles').catch(() => null),
        fetch('/api/h1candles').catch(() => null),
        fetch('/api/dxycandles').catch(() => null),
      ])
      if (!r1.ok || !r5.ok) throw new Error(`API error M1:${r1.status} M5:${r5.status}`)

      const [m1, m5]: [Candle[], Candle[]] = await Promise.all([r1.json(), r5.json()])
      const daily: Candle[] = (rD?.ok)  ? await rD.json()  : []
      const m15:   Candle[] = (r15?.ok) ? await r15.json() : []
      const m30:   Candle[] = (r30?.ok) ? await r30.json() : []
      const h4:    Candle[] = (rH4?.ok) ? await rH4.json() : []
      const h1:    Candle[] = (rH1?.ok) ? await rH1.json() : []
      const dxy:   Candle[] = (rDxy?.ok) ? await rDxy.json() : []
      m1Ref.current          = m1
      m5Ref.current          = m5
      m15Ref.current         = m15
      m30Ref.current         = m30
      h4Ref.current          = h4
      h1Ref.current          = h1
      dxyRef.current         = dxy
      dailyCandlesRef.current = daily

      // ── VP strategy ───────────────────────────────────────────────────────
      const orC = getORCandles(m1, sessionHour, sessionMin)
      let newVa: ValueArea | null = null
      let newVpSigs: Signal[] = []
      let newFcvLevels: FCVLevels | null = null
      let newFcvSigs: Signal[] = []

      if (orC.length >= 3) {
        const lastOrTime = orC[orC.length - 1].time
        const postOr     = m1.filter(c => c.time > lastOrTime)
        newVa      = computeValueArea(orC, vaPct)
        newVpSigs  = detectSignals(postOr, newVa)
        newFcvLevels = computeFCVLevels(orC)
        newFcvSigs   = detectFCVSignals(postOr, newFcvLevels)
        setVa(newVa); setFcvLevels(newFcvLevels)
        setVpSignals(newVpSigs); setFcvSignals(newFcvSigs)
        setStatus('live'); setErrMsg('')
      } else {
        setStatus('waiting')
        setErrMsg(orC.length > 0 ? `OR in progress ${orC.length}/15` : `Waiting for ${String(sessionHour).padStart(2,'0')}:${String(sessionMin).padStart(2,'0')} NY open`)
      }

      // ── LNDB — London Breakout ─────────────────────────────────────────────
      const { today: londonC, prev: prevLondonC } = getLondonCandlesBySession(m5, lndbStart, 0, lndbEnd, 0)
      let newLndb: LNDBLevels | null = null
      let newPrevLndb: LNDBLevels | null = null
      let newLndbSigs: Signal[]  = []
      let newLndb2Sigs: Signal[] = []

      if (londonC.length >= 2) {
        const lastLondonTime     = londonC[londonC.length - 1].time
        const sessionEndMinsCT   = lndbEnd * 60
        const postLondon = m5.filter(c => {
          if (c.time <= lastLondonTime) return false
          const ct = new Date(new Date(c.time * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago' }))
          return ct.getHours() * 60 + ct.getMinutes() >= sessionEndMinsCT
        })
        newLndb      = computeLNDBLevels(londonC)
        newLndbSigs  = detectLNDBSignals(postLondon, newLndb)
        newLndb2Sigs = detectLNDB2Signals(postLondon, newLndb)
        setLndbLevels(newLndb); setLndbSignals(newLndbSigs); setLndb2Signals(newLndb2Sigs)
        if (orC.length < 3) { setStatus('live'); setErrMsg('') }
      } else { if (!newLndb) setLndbLevels(null) }

      if (prevLondonC.length >= 2) {
        newPrevLndb = computeLNDBLevels(prevLondonC)
        setPrevLndbLevels(newPrevLndb)
      } else { setPrevLndbLevels(null) }

      // ── Session context ───────────────────────────────────────────────────
      setSession(getCurrentSession(m5))

      // ── LQ strategy ───────────────────────────────────────────────────────
      const newLqData = computeLQData(m5)
      setLqData(newLqData)

      // ── ORB Retest ────────────────────────────────────────────────────────
      const newOrbData = computeORBData(m1)
      setOrbData(newOrbData)

      // ── Daily 3-Level ─────────────────────────────────────────────────────
      const newDaily3Data = computeDaily3Data(daily, m5)
      setDaily3Data(newDaily3Data)

      // ── Daily Sweep & Engulf ──────────────────────────────────────────────
      const newSweepData = computeSweepData(daily, m5)
      setSweepData(newSweepData)

      // ── Asia Fib Breakout ─────────────────────────────────────────────────
      const newAsiaFibData = computeAsiaFibData(m5)
      setAsiaFibData(newAsiaFibData)

      // ── Fib Continuation ──────────────────────────────────────────────────
      const newFibContData = computeFibContData(m5)
      setFibContData(newFibContData)

      // ── No-Wick Candle ────────────────────────────────────────────────────
      const newNwcData = computeNoWickData(m15)
      setNwcData(newNwcData)

      // ── Compensation Play (No-Wick Trend Continuation) ────────────────────
      const newCompData = computeCompPlayData(m15)
      setCompData(newCompData)

      // ── NWC Breakout ──────────────────────────────────────────────────────
      const newNwcBoData = computeNWCBreakoutData(m30)
      setNwcBoData(newNwcBoData)

      // ── OR 15-Min ─────────────────────────────────────────────────────────
      const newOr15Data = computeOR15Data(m1)
      setOr15Data(newOr15Data)

      // ── 8AM NY Optimised ──────────────────────────────────────────────────
      const newEightAmData = computeEightAmNYOptimisedData(m15, h4, dxy)
      setEightAmData(newEightAmData)

      // ── P1 Model ──────────────────────────────────────────────────────────
      const newP1Data = computeP1Data(m15, m5, m1)
      setP1Data(newP1Data)

      // ── Flow Model ────────────────────────────────────────────────────────
      const newFlowData = computeFlowModelData(m30, m5)
      setFlowData(newFlowData)

      // ── London Kill Zone ──────────────────────────────────────────────────
      const newLkzData = computeLondonKZData(daily, m5)
      setLkzData(newLkzData)

      // ── Gold Signal Model ────────────────────────────────────────────────
      const newGoldData = computeGoldSignalData(daily, h4, m15, m5, dxy)
      setGoldData(newGoldData)

      // ── DXY-Gold Correlation ─────────────────────────────────────────────
      const newDxyCorrData = computeDXYCorrelData(dxy, m15)
      setDxyCorrData(newDxyCorrData)

      // ── Zone Ping-Pong ───────────────────────────────────────────────────
      const newZonesData = computeZonePingPongData(h4, m30, m15, m5)
      setZonesData(newZonesData)

      // ── Low Drawdown Continuation Model ──────────────────────────────────
      const newLdcmData = computeLDCMData(h4, m30, m15, m5)
      setLdcmData(newLdcmData)

      // ── Three-Session Gold Reversal ──────────────────────────────────────
      const newSgrData = computeSessionReversalData(h1, m5, m1)
      setSgrData(newSgrData)

      // ── Power of Three — Multi-Session Liquidity ─────────────────────────
      const newP3Data = computePowerOfThreeData(m5, m1)
      setP3Data(newP3Data)

      // ── Fiji Entry Model ─────────────────────────────────────────────────────
      const newFijiData = computeFijiData(m1, m15, h4)
      setFijiData(newFijiData)

      // ── Quant False Break — London first-hour failed breakout ────────────
      const newQfb25Data = computeQuantFalseBreakData(m15, 0.25)
      const newQfb15Data = computeQuantFalseBreakData(m15, 0.15)
      setQfb25Data(newQfb25Data)
      setQfb15Data(newQfb15Data)

      // ── MY GOLD — Zone Mapping + BOS + FVG ──────────────────────────────
      const newMyGoldData = computeMyGoldData(daily, h4, h1, m5)
      setMyGoldData(newMyGoldData)

      // ── Update chart ──────────────────────────────────────────────────────
      if (seriesRef.current) {
        const chartData =
          (activeTab === 'vp' || activeTab === 'fcv' || activeTab === 'orb' || activeTab === 'or15' || activeTab === 'sgr' || activeTab === 'fiji') ? m1 :
          (activeTab === 'nwc' || activeTab === 'comp' || activeTab === 'gold' || activeTab === 'dxycorr' || activeTab === 'cont' || activeTab === 'qfb25' || activeTab === 'qfb15' || activeTab === 'eightam') ? m15 :
          (activeTab === 'nwcbo' || activeTab === 'zones') ? m30 : m5
        try { seriesRef.current.setData(chartData.map(toBar)) } catch { /* series disposed */ }
      }

      // ── Redraw levels for active tab ──────────────────────────────────────
      if (activeTab === 'vp'      && newVa)          drawVPLevels(newVa)
      if (activeTab === 'fcv'     && newFcvLevels)   drawFCVLevels(newFcvLevels)
      if (activeTab === 'compare' && newLndb)        drawLNDBLevels(newLndb, newPrevLndb)
      if ((activeTab === 'lndb' || activeTab === 'lndb2') && newLndb) {
        drawLNDBLevels(newLndb, newPrevLndb)
        const sigs = activeTab === 'lndb' ? newLndbSigs : newLndb2Sigs
        const ls = sigs[sigs.length - 1]; if (ls) drawLNDBSignalLines(ls)
      }
      if (activeTab === 'lq')      drawLQData(newLqData)
      if (activeTab === 'orb'     && newOrbData.orbBars > 0)  drawORBLevels(newOrbData)
      if (activeTab === 'daily3'  && newDaily3Data.prevHigh)  drawDaily3Levels(newDaily3Data)
      if (activeTab === 'sweep'   && newSweepData.prevHigh)   drawSweepLevels(newSweepData)
      if (activeTab === 'asiafib' && newAsiaFibData.orbBars)  drawAsiaFibLevels(newAsiaFibData)
      if (activeTab === 'fibcont' && newFibContData.swingHigh) drawFibContLevels(newFibContData)
      if (activeTab === 'nwc'     && newNwcData.bosLevel)             drawNoWickLevels(newNwcData)
      if (activeTab === 'comp'    && newCompData.bosLevel)            drawNoWickLevels(newCompData)
      if (activeTab === 'nwcbo'   && newNwcBoData.srZones.length > 0) drawNWCBreakoutLevels(newNwcBoData)
      if (activeTab === 'or15'    && newOr15Data.orBars > 0)          drawOR15Levels(newOr15Data)
      if (activeTab === 'eightam')                                    drawEightAmLevels(newEightAmData)
      if (activeTab === 'p1'      && newP1Data.bias !== 'neutral')    drawP1Levels(newP1Data)
      if (activeTab === 'flow'    && newFlowData.bias !== 'neutral')  drawFlowLevels(newFlowData)
      if (activeTab === 'lkz'     && newLkzData.asianHigh)            drawLKZLevels(newLkzData)
      if (activeTab === 'gold') drawGoldLevels(newGoldData)
      if (activeTab === 'dxycorr') drawDXYCorrelLevels(newDxyCorrData)
      if (activeTab === 'zones') drawZonePingPongLevels(newZonesData)
      if (activeTab === 'cont') drawLDCMLevels(newLdcmData)
      if (activeTab === 'sgr') drawSessionReversalLevels(newSgrData)
      if (activeTab === 'p3' && newP3Data.asiaHigh) drawPowerOfThreeLevels(newP3Data)
      if (activeTab === 'fiji'    && newFijiData.orbBars)     drawFijiLevels(newFijiData)
      if (activeTab === 'qfb25') drawQuantFalseBreakLevels(newQfb25Data)
      if (activeTab === 'qfb15') drawQuantFalseBreakLevels(newQfb15Data)
      if (activeTab === 'mygold') drawMyGoldLevels(newMyGoldData)

      // ── Update markers ────────────────────────────────────────────────────
      if (activeTab === 'compare') {
        updateCompareMarkers(newLndbSigs, newLndb2Sigs)
      } else {
        const activeSigs =
          activeTab === 'vp'      ? newVpSigs :
          activeTab === 'fcv'     ? newFcvSigs :
          activeTab === 'lndb'    ? newLndbSigs :
          activeTab === 'lndb2'   ? newLndb2Sigs :
          activeTab === 'lq'      ? newLqData.signals :
          activeTab === 'orb'     ? newOrbData.signals :
          activeTab === 'daily3'  ? newDaily3Data.signals :
          activeTab === 'sweep'   ? newSweepData.signals :
          activeTab === 'asiafib' ? newAsiaFibData.signals :
          activeTab === 'nwc'     ? newNwcData.signals :
          activeTab === 'comp'    ? newCompData.signals :
          activeTab === 'nwcbo'   ? newNwcBoData.signals :
          activeTab === 'or15'    ? newOr15Data.signals :
          activeTab === 'eightam' ? newEightAmData.signals :
          activeTab === 'p1'      ? newP1Data.signals :
          activeTab === 'flow'    ? newFlowData.signals :
          activeTab === 'lkz'     ? newLkzData.signals :
          activeTab === 'gold'    ? newGoldData.signals :
          activeTab === 'dxycorr' ? newDxyCorrData.signals :
          activeTab === 'zones'   ? newZonesData.signals :
          activeTab === 'cont'    ? newLdcmData.signals :
          activeTab === 'sgr'     ? newSgrData.signals :
          activeTab === 'p3'      ? newP3Data.signals :
          activeTab === 'fiji'    ? newFijiData.signals :
          activeTab === 'qfb25'   ? newQfb25Data.signals :
          activeTab === 'qfb15'   ? newQfb15Data.signals :
          activeTab === 'mygold'  ? newMyGoldData.signals :
          newFibContData.signals
        updateMarkers(activeSigs)
      }

      setLastUpdate(new Date().toLocaleTimeString())
    } catch (err) {
      setStatus('error'); setErrMsg(String(err))
    } finally {
      setRefreshing(false)
    }
  }, [sessionHour, sessionMin, vaPct, lndbStart, lndbEnd, activeTab, drawVPLevels, drawFCVLevels, drawLNDBLevels, drawLNDBSignalLines, drawLQData, drawORBLevels, drawDaily3Levels, drawSweepLevels, drawAsiaFibLevels, drawFibContLevels, drawNoWickLevels, drawNWCBreakoutLevels, drawOR15Levels, drawEightAmLevels, drawP1Levels, drawFlowLevels, drawLKZLevels, drawGoldLevels, drawDXYCorrelLevels, drawZonePingPongLevels, drawLDCMLevels, drawSessionReversalLevels, drawPowerOfThreeLevels, drawFijiLevels, drawQuantFalseBreakLevels, drawMyGoldLevels, updateMarkers, updateCompareMarkers])

  // ── Live price ─────────────────────────────────────────────────────────────
  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/price')
      if (!res.ok) return
      const { price } = await res.json()
      setPrevPrice(p => p ?? price); setLivePrice(price)
    } catch { /* silent */ }
  }, [])

  // ── Init chart ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return
    let chart: ReturnType<typeof createChart> | undefined
    try {
      chart = createChart(chartContainerRef.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: '#080b10' }, textColor: '#6b7280', fontSize: 11 },
        grid: { vertLines: { color: '#111827' }, horzLines: { color: '#111827' } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(251,191,36,.35)', labelBackgroundColor: '#b45309' },
          horzLine: { color: 'rgba(251,191,36,.35)', labelBackgroundColor: '#b45309' },
        },
        rightPriceScale: { borderColor: '#1f2937', minimumWidth: 80 },
        timeScale: {
          borderColor: '#1f2937', timeVisible: true, secondsVisible: false,
          tickMarkFormatter: (time: Time | number) => {
            const ts = typeof time === 'number' ? time : 0
            return new Date(ts * 1000).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false })
          },
        },
      })
      const series = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      })
      chartRef.current = chart; seriesRef.current = series
    } catch (e) { setErrMsg(`Chart init error: ${e}`); setStatus('error') }
    return () => {
      try { chart?.remove() } catch { /* already disposed */ }
      chartRef.current = null
      seriesRef.current = null
      allPriceLines.current = []
    }
  }, [])

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData()
    const t = setInterval(() => fetchData(true), CANDLE_POLL)
    return () => clearInterval(t)
  }, [fetchData])

  useEffect(() => {
    fetchPrice()
    const t = setInterval(fetchPrice, PRICE_POLL)
    return () => clearInterval(t)
  }, [fetchPrice])

  // ── Derived ────────────────────────────────────────────────────────────────
  const priceChange = livePrice && prevPrice ? livePrice - prevPrice : 0
  const priceUp = priceChange > 0, priceDown = priceChange < 0
  const goldMacroScore =
    (macroDollar === 'supportive' ? 1 : macroDollar === 'hostile' ? -1 : 0) +
    (macroYields === 'supportive' ? 1 : macroYields === 'hostile' ? -1 : 0)
  const goldScore = Math.max(0, Math.min(10, (goldData?.technicalScore ?? 0) + Math.max(0, goldMacroScore)))
  const goldScoreColor = goldScore >= 6 ? '#22c55e' : goldScore >= 4 ? '#fbbf24' : '#ef4444'
  const goldCanTrade = goldScore >= 6 && (goldData?.signals.length ?? 0) > 0

  // Sidebar level rows per tab
  const levelRows =
    activeTab === 'vp' && va ? [
      { label: 'OR High', value: va.orHigh,  color: '#3b82f6' },
      { label: 'VAH',     value: va.vah,     color: '#ef4444' },
      { label: 'POC',     value: va.poc,     color: '#f97316' },
      { label: 'VAL',     value: va.val,     color: '#22c55e' },
      { label: 'OR Low',  value: va.orLow,   color: '#3b82f6' },
    ] :
    activeTab === 'fcv' && fcvLevels ? [
      { label: '1C Open',  value: fcvLevels.orOpen,  color: '#fbbf24' },
      { label: '1C High',  value: fcvLevels.orHigh,  color: '#ef4444' },
      { label: '1C Mid',   value: fcvLevels.orMid,   color: '#6b7280' },
      { label: '1C Low',   value: fcvLevels.orLow,   color: '#22c55e' },
      { label: '1C Close', value: fcvLevels.orClose, color: '#a78bfa' },
    ] :
    activeTab === 'eightam' && eightAmData && eightAmData.rangeHigh ? [
      { label: '8AM High', value: eightAmData.rangeHigh, color: '#38bdf8' },
      { label: '8AM Mid',  value: (eightAmData.rangeHigh + eightAmData.rangeLow) / 2, color: '#6b7280' },
      { label: '8AM Low',  value: eightAmData.rangeLow, color: '#38bdf8' },
      ...(eightAmData.entry ? [{ label: 'Entry', value: eightAmData.entry, color: '#fbbf24' }] : []),
      ...(eightAmData.stop ? [{ label: 'Stop', value: eightAmData.stop, color: '#ef4444' }] : []),
      ...(eightAmData.target ? [{ label: 'Target', value: eightAmData.target, color: '#22c55e' }] : []),
    ] :
    (activeTab === 'lndb' || activeTab === 'lndb2' || activeTab === 'compare') && lndbLevels ? [
      { label: 'L High', value: lndbLevels.londonHigh,  color: '#06b6d4' },
      { label: 'L Mid',  value: (lndbLevels.londonHigh + lndbLevels.londonLow) / 2, color: '#164e63' },
      { label: 'L Low',  value: lndbLevels.londonLow,   color: '#06b6d4' },
      { label: 'Range',  value: lndbLevels.londonRange,  color: '#6b7280' },
      ...(prevLndbLevels ? [
        { label: 'Prev Hi', value: prevLndbLevels.londonHigh, color: 'rgba(6,182,212,0.45)' as string },
        { label: 'Prev Lo', value: prevLndbLevels.londonLow,  color: 'rgba(6,182,212,0.45)' as string },
      ] : []),
    ] :
    activeTab === 'lq' && lqData ? [
      ...(lqData.pdh ? [{ label: 'PDH', value: lqData.pdh, color: '#fbbf24' }] : []),
      ...(lqData.pdl ? [{ label: 'PDL', value: lqData.pdl, color: '#fbbf24' }] : []),
      ...(lqData.pdh && lqData.pdl ? [{ label: 'PD Range', value: lqData.pdh - lqData.pdl, color: '#6b7280' }] : []),
    ] :
    activeTab === 'orb' && orbData && orbData.orbBars > 0 ? [
      { label: 'ORB Hi',  value: orbData.orbHigh, color: '#f97316' },
      { label: 'ORB Mid', value: (orbData.orbHigh + orbData.orbLow) / 2, color: '#6b7280' },
      { label: 'ORB Lo',  value: orbData.orbLow,  color: '#f97316' },
      { label: 'Range',   value: orbData.orbHigh - orbData.orbLow, color: '#6b7280' },
    ] :
    activeTab === 'daily3' && daily3Data && daily3Data.prevHigh ? [
      { label: 'PD High', value: daily3Data.prevHigh, color: '#ef4444' },
      { label: 'PD Mid',  value: daily3Data.midLevel, color: '#6b7280' },
      { label: 'PD Low',  value: daily3Data.prevLow,  color: '#22c55e' },
      { label: 'Range',   value: daily3Data.prevHigh - daily3Data.prevLow, color: '#6b7280' },
    ] :
    activeTab === 'sweep' && sweepData && sweepData.prevHigh ? [
      { label: 'PD High', value: sweepData.prevHigh, color: '#fbbf24' },
      { label: 'Range',   value: sweepData.prevHigh - sweepData.prevLow, color: '#6b7280' },
      { label: 'PD Low',  value: sweepData.prevLow,  color: '#fbbf24' },
    ] :
    activeTab === 'asiafib' && asiaFibData && asiaFibData.orbBars ? [
      { label: 'Asia Hi', value: asiaFibData.asiaHigh, color: '#7c3aed' },
      { label: 'Fib 0.236', value: asiaFibData.fib236,  color: 'rgba(251,191,36,0.7)' },
      { label: 'Fib 0.5',  value: asiaFibData.fib50,   color: '#fbbf24' },
      { label: 'Fib 0.618',value: asiaFibData.fib618,  color: '#f97316' },
      { label: 'Fib 0.786',value: asiaFibData.fib786,  color: '#ef4444' },
      { label: 'Asia Lo',  value: asiaFibData.asiaLow, color: '#7c3aed' },
    ] :
    activeTab === 'fibcont' && fibContData && fibContData.swingHigh ? [
      { label: 'Swing Hi', value: fibContData.swingHigh, color: fibContData.trend === 'up' ? '#22c55e' : '#ef4444' },
      { label: 'Fib 0.236',value: fibContData.fib236, color: 'rgba(251,191,36,0.7)' },
      { label: 'Fib 0.5',  value: fibContData.fib50,  color: '#fbbf24' },
      { label: 'Fib 0.618',value: fibContData.fib618, color: '#f97316' },
      { label: 'Fib 0.786',value: fibContData.fib786, color: '#ef4444' },
      { label: 'Swing Lo', value: fibContData.swingLow, color: fibContData.trend === 'up' ? '#22c55e' : '#ef4444' },
    ] :
    activeTab === 'nwc' && nwcData && nwcData.bosLevel ? [
      { label: 'BOS Level',   value: nwcData.bosLevel,        color: '#fbbf24' },
      { label: 'Struct Stop', value: nwcData.structureStop,   color: '#ef4444' },
      { label: 'Swing Hi',    value: nwcData.recentSwingHigh, color: 'rgba(251,191,36,.6)' },
      { label: 'Swing Lo',    value: nwcData.recentSwingLow,  color: 'rgba(251,191,36,.6)' },
      ...((() => {
        const last = nwcData.noWickCandles.filter(n => n.validForTrend).at(-1)
        return last ? [{ label: `NWC ${last.direction === 'bull' ? '↑' : '↓'} Level`, value: last.open, color: last.direction === 'bull' ? '#22c55e' : '#ef4444' }] : []
      })()),
    ] :
    activeTab === 'comp' && compData && compData.bosLevel ? [
      { label: 'BOS Level',  value: compData.bosLevel,      color: '#fbbf24' },
      { label: 'Stop',       value: compData.structureStop, color: '#ef4444' },
      { label: 'Swing Hi',   value: compData.recentSwingHigh, color: 'rgba(251,191,36,.6)' },
      { label: 'Swing Lo',   value: compData.recentSwingLow,  color: 'rgba(251,191,36,.6)' },
      ...((() => {
        const last = compData.noWickCandles.filter(n => n.validForTrend).at(-1)
        return last ? [{ label: `NWC ${last.direction === 'bull' ? '↑' : '↓'} Level`, value: last.open, color: last.direction === 'bull' ? '#22c55e' : '#ef4444' }] : []
      })()),
    ] :
    activeTab === 'nwcbo' && nwcBoData && nwcBoData.srZones.length > 0 ?
      [...nwcBoData.srZones].sort((a, b) => b.level - a.level).slice(0, 6).map(z => ({
        label: `${z.type === 'resistance' ? 'R' : 'S'} ×${z.touches}`,
        value: z.level,
        color: z.type === 'resistance' ? '#ef4444' : '#22c55e',
      })) :
    activeTab === 'or15' && or15Data && or15Data.orBars > 0 ? [
      { label: 'OR High', value: or15Data.orHigh, color: '#f97316' },
      { label: 'OR Mid',  value: (or15Data.orHigh + or15Data.orLow) / 2, color: '#6b7280' },
      { label: 'OR Low',  value: or15Data.orLow,  color: '#f97316' },
      { label: 'Range',   value: or15Data.orHigh - or15Data.orLow, color: '#6b7280' },
      { label: 'SL Fixed', value: 25, color: '#ef4444' },
    ] :
    activeTab === 'p1' && p1Data && p1Data.activeFvg ? [
      { label: 'FVG Top', value: p1Data.activeFvg.top,    color: p1Data.bias === 'bullish' ? '#22c55e' : '#ef4444' },
      { label: 'FVG Mid', value: p1Data.activeFvg.mid,    color: '#6b7280' },
      { label: 'FVG Bot', value: p1Data.activeFvg.bottom, color: p1Data.bias === 'bullish' ? '#22c55e' : '#ef4444' },
      { label: 'FVG Rng', value: p1Data.activeFvg.top - p1Data.activeFvg.bottom, color: '#6b7280' },
      ...(p1Data.sweeps.length > 0 ? [{ label: 'Sweep Lvl', value: p1Data.sweeps[p1Data.sweeps.length - 1].sweepLevel, color: '#fbbf24' }] : []),
    ] :
    activeTab === 'flow' && flowData && flowData.htfFvg ? [
      { label: 'FVG Top',  value: flowData.htfFvg.top,    color: flowData.bias === 'bullish' ? '#22c55e' : '#ef4444' },
      { label: 'FVG Mid',  value: flowData.htfFvg.mid,    color: '#6b7280' },
      { label: 'FVG Bot',  value: flowData.htfFvg.bottom, color: flowData.bias === 'bullish' ? '#22c55e' : '#ef4444' },
      { label: 'FVG Rng',  value: flowData.htfFvg.top - flowData.htfFvg.bottom, color: '#6b7280' },
      ...(flowData.restingLiq ? [{ label: 'Rest Liq', value: flowData.restingLiq, color: '#fbbf24' }] : []),
      ...(flowData.currentEma13 ? [{ label: '13 EMA',   value: flowData.currentEma13, color: '#a78bfa' }] : []),
    ] :
    activeTab === 'gold' && goldData ? [
      ...(goldData.asiaHigh ? [{ label: 'Asia High', value: goldData.asiaHigh, color: '#fbbf24' }] : []),
      ...(goldData.asiaLow ? [{ label: 'Asia Low', value: goldData.asiaLow, color: '#fbbf24' }] : []),
      ...(goldData.sweepLevel ? [{ label: 'Sweep Lvl', value: goldData.sweepLevel, color: '#06b6d4' }] : []),
      ...(goldData.m15Structure ? [{ label: 'M15 BOS', value: goldData.m15Structure, color: '#a78bfa' }] : []),
      ...(goldData.ema20 ? [{ label: '20 EMA', value: goldData.ema20, color: '#6b7280' }] : []),
      ...(goldData.atr14 ? [{ label: 'ATR 14', value: goldData.atr14, color: '#f97316' }] : []),
    ] :
    activeTab === 'dxycorr' && dxyCorrData && dxyCorrData.dxyPushDir ? [
      ...(dxyCorrData.dxyPushMag    ? [{ label: 'DXY Push', value: dxyCorrData.dxyPushMag, color: '#06b6d4' }] : []),
      ...(dxyCorrData.dxyPushPct    ? [{ label: 'Push %',   value: dxyCorrData.dxyPushPct, color: '#06b6d4' }] : []),
      ...(dxyCorrData.mismatchRatio !== null ? [{ label: 'Lag %', value: dxyCorrData.mismatchRatio * 100, color: dxyCorrData.mismatchSeverity === 'strong' ? '#ef4444' : dxyCorrData.mismatchSeverity === 'moderate' ? '#fbbf24' : '#6b7280' }] : []),
      ...(dxyCorrData.dxyPullbackPct !== null ? [{ label: 'Pullbk %', value: dxyCorrData.dxyPullbackPct, color: '#a78bfa' }] : []),
      ...(dxyCorrData.signals[dxyCorrData.signals.length - 1]?.entryPrice ? [{ label: 'Entry', value: dxyCorrData.signals[dxyCorrData.signals.length - 1].entryPrice, color: '#fbbf24' }] : []),
      ...(dxyCorrData.signals[dxyCorrData.signals.length - 1]?.stopPrice  ? [{ label: 'Stop',  value: dxyCorrData.signals[dxyCorrData.signals.length - 1].stopPrice,  color: '#ef4444' }] : []),
    ] :
    activeTab === 'zones' && zonesData ? [
      ...[...zonesData.sellZones.slice(0, 3)].map(z => ({ label: `Sell ×${z.touches}`, value: z.level, color: z.strength === 'strong' ? '#ef4444' : '#f97316' })),
      ...[...zonesData.buyZones].slice(-3).map(z => ({ label: `Buy ×${z.touches}`, value: z.level, color: z.strength === 'strong' ? '#22c55e' : '#86efac' })),
      ...(zonesData.activeZone ? [{ label: `Active ${zonesData.activeZoneType?.toUpperCase()}`, value: zonesData.activeZone.level, color: zonesData.activeZoneType === 'sell' ? '#ef4444' : '#22c55e' }] : []),
      ...(zonesData.atr4h ? [{ label: 'ATR H4', value: zonesData.atr4h, color: '#f97316' }] : []),
    ] :
    activeTab === 'cont' && ldcmData && ldcmData.rangeHigh ? [
      { label: 'Range Hi',  value: ldcmData.rangeHigh,    color: '#ef4444' },
      { label: 'Equil',     value: ldcmData.equilibrium!, color: '#6b7280' },
      { label: 'Range Lo',  value: ldcmData.rangeLow!,    color: '#22c55e' },
      ...(ldcmData.displacementHigh ? [{ label: 'Disp Hi',  value: ldcmData.displacementHigh, color: '#f97316' }] : []),
      ...(ldcmData.displacementLow  ? [{ label: 'Disp Lo',  value: ldcmData.displacementLow,  color: '#f97316' }] : []),
      ...(ldcmData.ifvgTop          ? [{ label: 'IFVG Top', value: ldcmData.ifvgTop,           color: '#a78bfa' }] : []),
      ...(ldcmData.ifvgBottom       ? [{ label: 'IFVG Bot', value: ldcmData.ifvgBottom,        color: '#a78bfa' }] : []),
    ] :
    activeTab === 'sgr' && sgrData && sgrData.highZone ? [
      { label: 'High Zone', value: sgrData.highZone,  color: '#ef4444' },
      { label: 'Low Zone',  value: sgrData.lowZone!,  color: '#22c55e' },
      ...(sgrData.signals.length ? [{ label: 'Entry', value: sgrData.signals[sgrData.signals.length - 1].entryPrice, color: '#fbbf24' }] : []),
      ...(sgrData.signals.length ? [{ label: 'Stop',  value: sgrData.signals[sgrData.signals.length - 1].stopPrice,  color: '#ef4444' }] : []),
    ] :
    (activeTab === 'qfb25' || activeTab === 'qfb15') && (activeTab === 'qfb25' ? qfb25Data : qfb15Data) ? (() => {
      const q = (activeTab === 'qfb25' ? qfb25Data : qfb15Data)!
      return q.rangeHigh ? [
        { label: 'L1 High', value: q.rangeHigh, color: '#06b6d4' },
        { label: 'Short Trig', value: q.rangeHigh + q.buffer, color: '#ef4444' },
        { label: 'L1 Mid', value: (q.rangeHigh + q.rangeLow) / 2, color: '#6b7280' },
        { label: 'Long Trig', value: q.rangeLow - q.buffer, color: '#22c55e' },
        { label: 'L1 Low', value: q.rangeLow, color: '#06b6d4' },
        { label: 'ATR', value: q.atr, color: q.atr >= q.atrThreshold ? '#22c55e' : '#6b7280' },
      ] : []
    })() :
    activeTab === 'p3' && p3Data && p3Data.asiaHigh ? [
      { label: 'Asia Hi', value: p3Data.asiaHigh,  color: '#ef4444' },
      { label: 'Asia Lo', value: p3Data.asiaLow!,  color: '#22c55e' },
      ...(p3Data.target ? [{ label: 'Target', value: p3Data.target, color: '#fbbf24' }] : []),
      ...(p3Data.signals.length ? [{ label: 'Entry', value: p3Data.signals[p3Data.signals.length - 1].entryPrice, color: '#fbbf24' }] : []),
      ...(p3Data.signals.length ? [{ label: 'Stop',  value: p3Data.signals[p3Data.signals.length - 1].stopPrice,  color: '#ef4444' }] : []),
    ] :
    activeTab === 'fiji' && fijiData && fijiData.orHigh ? [
      { label: 'OR Hi', value: fijiData.orHigh, color: '#7c3aed' },
      { label: 'OR Lo', value: fijiData.orLow,  color: '#7c3aed' },
      { label: 'Range', value: fijiData.orHigh - fijiData.orLow, color: '#6b7280' },
      ...(fijiData.ifvg ? [
        { label: 'IFVG Hi', value: fijiData.ifvg.top,    color: fijiData.sweepType === 'high' ? '#ef4444' : '#22c55e' } as { label: string; value: number; color: string },
        { label: 'IFVG Lo', value: fijiData.ifvg.bottom, color: fijiData.sweepType === 'high' ? '#ef4444' : '#22c55e' } as { label: string; value: number; color: string },
      ] : []),
    ] :
    activeTab === 'mygold' && myGoldData && myGoldData.activeFvg ? [
      ...(myGoldData.nearestSupplyZone ? [{ label: 'Supply', value: myGoldData.nearestSupplyZone, color: '#ef4444' }] : []),
      { label: 'FVG Top', value: myGoldData.activeFvg.top,    color: myGoldData.bosType === 'bearish' ? '#ef4444' : '#22c55e' },
      { label: '50% EQ',  value: myGoldData.activeFvg.mid,    color: '#fbbf24' },
      { label: 'FVG Bot', value: myGoldData.activeFvg.bottom, color: myGoldData.bosType === 'bearish' ? '#ef4444' : '#22c55e' },
      ...(myGoldData.nearestDemandZone ? [{ label: 'Demand', value: myGoldData.nearestDemandZone, color: '#22c55e' }] : []),
      ...(myGoldData.bosLevel ? [{ label: 'BOS Lvl', value: myGoldData.bosLevel, color: '#f97316' }] : []),
    ] : []

  const vsHigh =
    activeTab === 'vp'      ? va?.vah :
    activeTab === 'fcv'     ? fcvLevels?.orHigh :
    activeTab === 'eightam' ? eightAmData?.rangeHigh :
    (activeTab === 'lndb' || activeTab === 'lndb2' || activeTab === 'compare') ? lndbLevels?.londonHigh :
    activeTab === 'lq'      ? (lqData?.pdh ?? undefined) :
    activeTab === 'orb'     ? orbData?.orbHigh :
    activeTab === 'daily3'  ? daily3Data?.prevHigh :
    activeTab === 'sweep'   ? sweepData?.prevHigh :
    activeTab === 'asiafib' ? asiaFibData?.asiaHigh :
    activeTab === 'nwc'     ? nwcData?.recentSwingHigh :
    activeTab === 'comp'    ? compData?.recentSwingHigh :
    activeTab === 'nwcbo'   ? nwcBoData?.srZones.filter(z => z.type === 'resistance').sort((a, b) => a.level - b.level)[0]?.level :
    activeTab === 'or15'    ? (or15Data?.orBars ? or15Data.orHigh : undefined) :
    activeTab === 'p1'      ? p1Data?.activeFvg?.top :
    activeTab === 'flow'    ? flowData?.htfFvg?.top :
    activeTab === 'lkz'     ? (lkzData?.asianHigh ?? undefined) :
    activeTab === 'gold'    ? (goldData?.asiaHigh ?? undefined) :
    activeTab === 'dxycorr' ? (dxyCorrData?.signals[dxyCorrData.signals.length - 1]?.targetPrice ?? undefined) :
    activeTab === 'zones'   ? (zonesData?.sellZones[0]?.level ?? undefined) :
    activeTab === 'cont'    ? (ldcmData?.ifvgTop ?? ldcmData?.rangeHigh ?? undefined) :
    activeTab === 'sgr'     ? (sgrData?.highZone ?? undefined) :
    activeTab === 'qfb25'   ? (qfb25Data?.rangeHigh ? qfb25Data.rangeHigh + qfb25Data.buffer : undefined) :
    activeTab === 'qfb15'   ? (qfb15Data?.rangeHigh ? qfb15Data.rangeHigh + qfb15Data.buffer : undefined) :
    activeTab === 'p3'      ? (p3Data?.asiaHigh ?? undefined) :
    activeTab === 'mygold'  ? (myGoldData?.nearestSupplyZone ?? undefined) :
    fibContData?.swingHigh

  const vsLow =
    activeTab === 'vp'      ? va?.val :
    activeTab === 'fcv'     ? fcvLevels?.orLow :
    activeTab === 'eightam' ? eightAmData?.rangeLow :
    (activeTab === 'lndb' || activeTab === 'lndb2' || activeTab === 'compare') ? lndbLevels?.londonLow :
    activeTab === 'lq'      ? (lqData?.pdl ?? undefined) :
    activeTab === 'orb'     ? orbData?.orbLow :
    activeTab === 'daily3'  ? daily3Data?.prevLow :
    activeTab === 'sweep'   ? sweepData?.prevLow :
    activeTab === 'asiafib' ? asiaFibData?.asiaLow :
    activeTab === 'nwc'     ? nwcData?.recentSwingLow :
    activeTab === 'comp'    ? compData?.recentSwingLow :
    activeTab === 'nwcbo'   ? nwcBoData?.srZones.filter(z => z.type === 'support').sort((a, b) => b.level - a.level)[0]?.level :
    activeTab === 'or15'    ? (or15Data?.orBars ? or15Data.orLow : undefined) :
    activeTab === 'p1'      ? p1Data?.activeFvg?.bottom :
    activeTab === 'flow'    ? flowData?.htfFvg?.bottom :
    activeTab === 'lkz'     ? (lkzData?.asianLow ?? undefined) :
    activeTab === 'gold'    ? (goldData?.asiaLow ?? undefined) :
    activeTab === 'dxycorr' ? (dxyCorrData?.signals[dxyCorrData.signals.length - 1]?.stopPrice ?? undefined) :
    activeTab === 'zones'   ? (zonesData?.buyZones[zonesData.buyZones.length - 1]?.level ?? undefined) :
    activeTab === 'cont'    ? (ldcmData?.ifvgBottom ?? ldcmData?.rangeLow ?? undefined) :
    activeTab === 'sgr'     ? (sgrData?.lowZone ?? undefined) :
    activeTab === 'qfb25'   ? (qfb25Data?.rangeLow ? qfb25Data.rangeLow - qfb25Data.buffer : undefined) :
    activeTab === 'qfb15'   ? (qfb15Data?.rangeLow ? qfb15Data.rangeLow - qfb15Data.buffer : undefined) :
    activeTab === 'p3'      ? (p3Data?.asiaLow ?? undefined) :
    activeTab === 'mygold'  ? (myGoldData?.nearestDemandZone ?? undefined) :
    fibContData?.swingLow

  const highLabel =
    activeTab === 'vp' ? 'vs VAH' : activeTab === 'fcv' ? 'vs 1C Hi' : activeTab === 'eightam' ? 'vs 8AM Hi' : (activeTab === 'lndb' || activeTab === 'lndb2' || activeTab === 'compare') ? 'vs L High' :
    activeTab === 'lq' ? 'vs PDH' : activeTab === 'orb' ? 'vs ORB Hi' :
    activeTab === 'daily3' ? 'vs PD Hi' : activeTab === 'sweep' ? 'vs PD Hi' :
    activeTab === 'asiafib' ? 'vs Asia Hi' : activeTab === 'nwc' ? 'vs Struct Hi' : activeTab === 'comp' ? 'vs Swing Hi' : activeTab === 'nwcbo' ? 'vs Resistance' : activeTab === 'or15' ? 'vs OR Hi' : activeTab === 'p1' ? 'vs FVG Top' : activeTab === 'flow' ? 'vs HTF Top' : activeTab === 'lkz' ? 'vs Asian Hi' : activeTab === 'gold' ? 'vs Asia Hi' : activeTab === 'dxycorr' ? 'vs TP1' : activeTab === 'zones' ? 'vs Sell Zone' : activeTab === 'cont' ? 'vs IFVG Top' : activeTab === 'sgr' ? 'vs High Zone' : activeTab === 'qfb25' || activeTab === 'qfb15' ? 'vs Short Trig' : activeTab === 'p3' ? 'vs Asia Hi' : activeTab === 'mygold' ? 'vs Supply Zone' : 'vs Swing Hi'

  const lowLabel =
    activeTab === 'vp' ? 'vs VAL' : activeTab === 'fcv' ? 'vs 1C Lo' : activeTab === 'eightam' ? 'vs 8AM Lo' : (activeTab === 'lndb' || activeTab === 'lndb2' || activeTab === 'compare') ? 'vs L Low' :
    activeTab === 'lq' ? 'vs PDL' : activeTab === 'orb' ? 'vs ORB Lo' :
    activeTab === 'daily3' ? 'vs PD Lo' : activeTab === 'sweep' ? 'vs PD Lo' :
    activeTab === 'asiafib' ? 'vs Asia Lo' : activeTab === 'nwc' ? 'vs Struct Lo' : activeTab === 'comp' ? 'vs Swing Lo' : activeTab === 'nwcbo' ? 'vs Support' : activeTab === 'or15' ? 'vs OR Lo' : activeTab === 'p1' ? 'vs FVG Bot' : activeTab === 'flow' ? 'vs HTF Bot' : activeTab === 'lkz' ? 'vs Asian Lo' : activeTab === 'gold' ? 'vs Asia Lo' : activeTab === 'dxycorr' ? 'vs Stop' : activeTab === 'zones' ? 'vs Buy Zone' : activeTab === 'cont' ? 'vs IFVG Bot' : activeTab === 'sgr' ? 'vs Low Zone' : activeTab === 'qfb25' || activeTab === 'qfb15' ? 'vs Long Trig' : activeTab === 'p3' ? 'vs Asia Lo' : activeTab === 'mygold' ? 'vs Demand Zone' : 'vs Swing Lo'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#080b10', color: '#f9fafb' }}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderBottom: '1px solid #1f2937', background: 'rgba(8,11,16,.9)', backdropFilter: 'blur(16px)', flexShrink: 0, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>◆</div>
            <span style={{ fontWeight: 600, fontSize: 13, background: 'linear-gradient(135deg,#fde68a,#fbbf24,#f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FVG Scanner</span>
          </div>

          <div style={{ width: 1, height: 18, background: '#1f2937' }} />

          <a
            href="/eightam-monitor"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 9px',
              borderRadius: 7,
              border: '1px solid rgba(56,189,248,.28)',
              background: 'rgba(56,189,248,.08)',
              color: '#7dd3fc',
              textDecoration: 'none',
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            Bot Monitor
          </a>

          <div style={{ width: 1, height: 18, background: '#1f2937' }} />

          {/* Tabs */}
          <div className="no-scrollbar" style={{ display: 'flex', gap: 5, maxWidth: '58vw', overflowX: 'auto', paddingBottom: 1 }}>
            <TabBtn label="OR Vol Profile"     badge="M1"  active={activeTab === 'vp'}      onClick={() => setActiveTab('vp')} />
            <TabBtn label="First Candle"       badge="M1"  active={activeTab === 'fcv'}     onClick={() => setActiveTab('fcv')} />
            <TabBtn label="8AM NY Optimised"   badge="OPT" active={activeTab === 'eightam'} onClick={() => setActiveTab('eightam')} />
            <TabBtn label="Flow Model"         badge="HTF" active={activeTab === 'flow'}     onClick={() => setActiveTab('flow')} />
            <TabBtn label="London KZ"          badge="ICT" active={activeTab === 'lkz'}      onClick={() => setActiveTab('lkz')} />
            <TabBtn label="MY GOLD"            badge="BOS+FVG" active={activeTab === 'mygold'}    onClick={() => setActiveTab('mygold')} />
            <TabBtn label="LNDB"                badge="M5"   active={activeTab === 'lndb'}   onClick={() => setActiveTab('lndb')} />
            <TabBtn label="Fiji Entry"         badge="IFVG" active={activeTab === 'fiji'}   onClick={() => setActiveTab('fiji')} />
            <TabBtn label="Gold Signal"        badge="10S" active={activeTab === 'gold'}     onClick={() => setActiveTab('gold')} />
            <TabBtn label="DXY Correl"         badge="INV" active={activeTab === 'dxycorr'}  onClick={() => setActiveTab('dxycorr')} />
            <TabBtn label="Zone Ping-Pong"     badge="MTF" active={activeTab === 'zones'}    onClick={() => setActiveTab('zones')} />
            <TabBtn label="Continuation"       badge="IFVG" active={activeTab === 'cont'}    onClick={() => setActiveTab('cont')} />
            <TabBtn label="3-Session Reversal" badge="ET"  active={activeTab === 'sgr'}     onClick={() => setActiveTab('sgr')} />
            <TabBtn label="Q False Break"      badge="0.25" active={activeTab === 'qfb25'}   onClick={() => setActiveTab('qfb25')} />
            <TabBtn label="QFB High Win"       badge="0.15" active={activeTab === 'qfb15'}   onClick={() => setActiveTab('qfb15')} />
            <TabBtn label="Power of Three"     badge="ET"  active={activeTab === 'p3'}      onClick={() => setActiveTab('p3')} />
            <TabBtn label="LNDB2"               badge="2×"   active={activeTab === 'lndb2'}  onClick={() => setActiveTab('lndb2')} />
            <TabBtn label="LNDB vs LNDB2"      badge="↔"   active={activeTab === 'compare'} onClick={() => setActiveTab('compare')} />
            <TabBtn label="Liquidity"          badge="M5"  active={activeTab === 'lq'}      onClick={() => setActiveTab('lq')} />
            <TabBtn label="ORB Retest"         badge="M1"  active={activeTab === 'orb'}     onClick={() => setActiveTab('orb')} />
            <TabBtn label="Daily 3-Level"      badge="D"   active={activeTab === 'daily3'}  onClick={() => setActiveTab('daily3')} />
            <TabBtn label="Sweep & Engulf"     badge="D"   active={activeTab === 'sweep'}   onClick={() => setActiveTab('sweep')} />
            <TabBtn label="Asia Fib"           badge="AEDT" active={activeTab === 'asiafib'} onClick={() => setActiveTab('asiafib')} />
            <TabBtn label="Fib Cont"           badge="M5"  active={activeTab === 'fibcont'} onClick={() => setActiveTab('fibcont')} />
            <TabBtn label="No-Wick Candle"     badge="M15" active={activeTab === 'nwc'}     onClick={() => setActiveTab('nwc')} />
            <TabBtn label="Compensation Play"  badge="M15" active={activeTab === 'comp'}    onClick={() => setActiveTab('comp')} />
            <TabBtn label="NWC Breakout"       badge="M30" active={activeTab === 'nwcbo'}   onClick={() => setActiveTab('nwcbo')} />
            <TabBtn label="OR 15-Min"          badge="M1"  active={activeTab === 'or15'}    onClick={() => setActiveTab('or15')} />
            <TabBtn label="P1 Model"           badge="3L"  active={activeTab === 'p1'}      onClick={() => setActiveTab('p1')} />
          </div>

          <div style={{ width: 1, height: 18, background: '#1f2937' }} />

          {/* Live price */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono,monospace)', fontWeight: 700, color: '#6b7280', letterSpacing: '0.1em' }}>XAU/USD</span>
            {livePrice ? (
              <>
                <span style={{ fontFamily: 'var(--font-mono,monospace)', fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums', color: priceUp ? '#22c55e' : priceDown ? '#ef4444' : '#f9fafb' }}>{fmt(livePrice)}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono,monospace)', fontVariantNumeric: 'tabular-nums', color: priceUp ? '#22c55e' : priceDown ? '#ef4444' : '#6b7280' }}>{priceUp ? '+' : ''}{fmt(priceChange)}</span>
              </>
            ) : <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 18, color: '#6b7280' }}>—</span>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastSig && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, border: `1px solid ${lastSig.type==='TRAP'?'rgba(239,68,68,.25)':'rgba(34,197,94,.25)'}`, background: lastSig.type==='TRAP'?'rgba(239,68,68,.08)':'rgba(34,197,94,.08)', fontSize: 11, fontWeight: 600, color: lastSig.type==='TRAP'?'#ef4444':'#22c55e' }}>
              {lastSig.type==='TRAP'?<TrendingDown size={11}/>:<TrendingUp size={11}/>} {lastSig.label}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            {status==='live'    && <><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} className="animate-pulse" /><span style={{ color: '#6b7280' }}>LIVE</span></>}
            {status==='waiting' && <span style={{ color: '#fbbf24' }}>WAITING</span>}
            {status==='loading' && <span style={{ color: '#6b7280' }}>LOADING…</span>}
            {status==='error'   && <AlertTriangle size={12} color="#ef4444" />}
          </div>
          <button onClick={() => fetchData()} disabled={refreshing} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #1f2937', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280', opacity: refreshing ? 0.4 : 1 }}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={toggleLndbAlerts}
            title={lndbAlertsOn ? 'Signal alerts ON (VP · LNDB · LNDB2 · 3-Session) — click to mute' : 'Signal alerts OFF — click to enable'}
            style={{ height: 28, padding: '0 8px', borderRadius: 8, border: lndbAlertsOn ? '1px solid rgba(6,182,212,.45)' : '1px solid #1f2937', background: lndbAlertsOn ? 'rgba(6,182,212,.12)' : '#0d1117', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: lndbAlertsOn ? '#06b6d4' : '#6b7280', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}
          >
            {lndbAlertsOn ? <Bell size={12} /> : <BellOff size={12} />} ALERTS
          </button>
          <button
            onClick={testLndbAlerts}
            title="Play LNDB + LNDB2 test alert"
            style={{ height: 28, padding: '0 8px', borderRadius: 8, border: '1px solid #1f2937', background: '#0d1117', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#6b7280', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}
          >
            TEST
          </button>
          <button onClick={() => setShowSettings(s => !s)} style={{ width: 28, height: 28, borderRadius: 8, border: showSettings ? '1px solid rgba(251,191,36,.35)' : '1px solid #1f2937', background: showSettings ? 'rgba(251,191,36,.1)' : '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: showSettings ? '#fbbf24' : '#6b7280' }}>
            <Settings size={12} />
          </button>
          <button onClick={() => setJournalOpen(j => !j)} style={{ width: 28, height: 28, borderRadius: 8, border: journalOpen ? '1px solid rgba(251,191,36,.35)' : '1px solid #1f2937', background: journalOpen ? 'rgba(251,191,36,.1)' : '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: journalOpen ? '#fbbf24' : '#6b7280', position: 'relative' }}>
            <BookOpen size={12} />
            {journalEntries.length > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: '50%', background: '#fbbf24' }} />}
          </button>
        </div>
      </header>

      {/* ── Stat Row ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, overflowX: 'auto' }}>
        {activeTab === 'vp' && <>
          <StatCard label="OR Range"   value={va ? `${fmt(va.orHigh-va.orLow)} pts` : '—'} sub={va ? `${fmt(va.orHigh)} — ${fmt(va.orLow)}` : undefined} />
          <StatCard label="VA Range"   value={va ? `${fmt(va.vah-va.val)} pts` : '—'}       sub={va ? `${vaPct}% of OR vol` : undefined} />
          <StatCard label="VAH"  value={va ? fmt(va.vah) : '—'}  color="#ef4444" />
          <StatCard label="POC"  value={va ? fmt(va.poc) : '—'}  color="#f97316" />
          <StatCard label="VAL"  value={va ? fmt(va.val) : '—'}  color="#22c55e" />
          <StatCard label="Signals" value={String(vpSignals.length)} sub={vpSignals.length > 0 ? `${vpSignals.filter(s=>s.type==='TRAP').length}T · ${vpSignals.filter(s=>s.type==='CONT').length}C` : 'None'} />
        </>}
        {activeTab === 'fcv' && <>
          <StatCard label="1C Range"  value={fcvLevels ? `${fmt(fcvLevels.orRange)} pts` : '—'} sub={fcvLevels ? `${fmt(fcvLevels.orHigh)} — ${fmt(fcvLevels.orLow)}` : undefined} />
          <StatCard label="1C Open"   value={fcvLevels ? fmt(fcvLevels.orOpen)  : '—'} color="#fbbf24" />
          <StatCard label="1C High"   value={fcvLevels ? fmt(fcvLevels.orHigh)  : '—'} color="#ef4444" />
          <StatCard label="1C Mid"    value={fcvLevels ? fmt(fcvLevels.orMid)   : '—'} color="#9ca3af" />
          <StatCard label="1C Low"    value={fcvLevels ? fmt(fcvLevels.orLow)   : '—'} color="#22c55e" />
          <StatCard label="Signals"   value={String(fcvSignals.length)} sub={fcvSignals.length > 0 ? `${fcvSignals.filter(s=>s.type==='TRAP').length}T · ${fcvSignals.filter(s=>s.type==='CONT').length}C` : 'None'} />
        </>}
        {activeTab === 'eightam' && <>
          <StatCard label="8AM Range" value={eightAmData?.rangeHigh ? `${fmt(eightAmData.rangePts)} pts` : '—'} sub={eightAmData?.rangeHigh ? `${fmt(eightAmData.rangeHigh)} — ${fmt(eightAmData.rangeLow)}` : '08:00 NY M15'} />
          <StatCard label="9:30 Close" value={eightAmData?.ref930 ? fmt(eightAmData.ref930) : '—'} color="#a78bfa" />
          <StatCard label="Direction" value={eightAmData?.direction && eightAmData.direction !== 'none' ? eightAmData.direction.toUpperCase() : '—'} color={eightAmData?.direction === 'long' ? '#22c55e' : eightAmData?.direction === 'short' ? '#ef4444' : '#6b7280'} />
          <StatCard label="H4" value={eightAmData?.h4Trend ?? '—'} color={eightAmData?.h4Trend === 'bullish' ? '#22c55e' : eightAmData?.h4Trend === 'bearish' ? '#ef4444' : '#6b7280'} />
          <StatCard label="DXY" value={eightAmData?.dxyState ?? '—'} color={eightAmData?.dxyState === 'confirms' ? '#22c55e' : eightAmData?.dxyState === 'blocks' ? '#ef4444' : '#6b7280'} />
          <StatCard label="Signal" value={eightAmData?.signals.length ? 'READY' : '—'} sub="SL 40 · TP 12" color={eightAmData?.signals.length ? '#22c55e' : '#6b7280'} />
        </>}
        {activeTab === 'lq' && <>
          <StatCard label="Bull FVG"  value={lqData ? String(lqData.fvgs.filter(g=>g.type==='bullish'&&!g.filled).length) : '—'} sub="unfilled ↑ gaps" color="#22c55e" />
          <StatCard label="Bear FVG"  value={lqData ? String(lqData.fvgs.filter(g=>g.type==='bearish'&&!g.filled).length) : '—'} sub="unfilled ↓ gaps" color="#ef4444" />
          <StatCard label="BSL"       value={lqData ? String(lqData.liquidity.filter(z=>z.type==='BSL'&&!z.swept).length) : '—'} sub="buy-side pools" color="#3b82f6" />
          <StatCard label="SSL"       value={lqData ? String(lqData.liquidity.filter(z=>z.type==='SSL'&&!z.swept).length) : '—'} sub="sell-side pools" color="#a855f7" />
          <StatCard label="Signals"   value={lqData ? String(lqData.signals.length) : '—'} sub={lqData ? `${lqData.signals.filter(s=>s.type==='CONT').length}↑ · ${lqData.signals.filter(s=>s.type==='TRAP').length}↓` : undefined} />
          <StatCard label="PDH"       value={lqData?.pdh ? fmt(lqData.pdh) : '—'} color="#fbbf24" />
          <StatCard label="PDL"       value={lqData?.pdl ? fmt(lqData.pdl) : '—'} color="#fbbf24" />
        </>}
        {activeTab === 'lndb' && <>
          <StatCard label="L Range"  value={lndbLevels ? `${fmt(lndbLevels.londonRange)} pts` : '—'} sub={`${lndbStart}–${lndbEnd} AM CT`} />
          <StatCard label="L High"   value={lndbLevels ? fmt(lndbLevels.londonHigh) : '—'} color="#06b6d4" />
          <StatCard label="L Low"    value={lndbLevels ? fmt(lndbLevels.londonLow)  : '—'} color="#06b6d4" />
          <StatCard label="Signals"  value={String(lndbSignals.length)} sub={lndbSignals.length ? `${lndbSignals.filter(s=>s.type==='TRAP').length} short · ${lndbSignals.filter(s=>s.type==='CONT').length} long` : 'Waiting for breakout'} />
        </>}
        {activeTab === 'lndb2' && <>
          <StatCard label="L Range"   value={lndbLevels ? `${fmt(lndbLevels.londonRange)} pts` : '—'} sub={`${lndbStart}–${lndbEnd} AM CT`} />
          <StatCard label="L High"    value={lndbLevels ? fmt(lndbLevels.londonHigh) : '—'} color="#06b6d4" />
          <StatCard label="L Low"     value={lndbLevels ? fmt(lndbLevels.londonLow)  : '—'} color="#06b6d4" />
          <StatCard label="Confirm"   value={lndb2Signals.length ? '2× close' : '—'} sub={lndb2Signals.length ? `${lndb2Signals.filter(s=>s.type==='TRAP').length} short · ${lndb2Signals.filter(s=>s.type==='CONT').length} long` : '2 consecutive M5 closes outside box'} />
        </>}
        {activeTab === 'compare' && <>
          <StatCard label="LNDB"   value={String(lndbSignals.length)}  sub="First breakout close" color="#fbbf24" />
          <StatCard label="LNDB2"  value={String(lndb2Signals.length)} sub="Confirmed 2nd close"  color="#06b6d4" />
          <StatCard label="L High" value={lndbLevels ? fmt(lndbLevels.londonHigh) : '—'} color="#ef4444" />
          <StatCard label="L Low"  value={lndbLevels ? fmt(lndbLevels.londonLow)  : '—'} color="#06b6d4" />
        </>}
        {activeTab === 'orb' && <>
          <StatCard label="ORB Range" value={orbData && orbData.orbBars > 0 ? `${fmt(orbData.orbHigh - orbData.orbLow)} pts` : '—'} sub={orbData && orbData.orbBars > 0 ? `${fmt(orbData.orbHigh)} — ${fmt(orbData.orbLow)}` : 'Waiting for 9:30 AM NY'} />
          <StatCard label="ORB Hi"    value={orbData && orbData.orbBars > 0 ? fmt(orbData.orbHigh) : '—'} color="#f97316" />
          <StatCard label="ORB Lo"    value={orbData && orbData.orbBars > 0 ? fmt(orbData.orbLow)  : '—'} color="#f97316" />
          <StatCard label="Bars"      value={orbData ? String(orbData.orbBars) : '—'} sub="M1 in OR window" />
          <StatCard label="Signals"   value={String(orbData?.signals.length ?? 0)} sub={orbData?.signals.length ? `${orbData.signals.filter(s=>s.type==='CONT').length}↑ · ${orbData.signals.filter(s=>s.type==='TRAP').length}↓` : 'Waiting for retest'} />
        </>}
        {activeTab === 'daily3' && <>
          <StatCard label="PD High"   value={daily3Data?.prevHigh ? fmt(daily3Data.prevHigh) : '—'} color="#ef4444" />
          <StatCard label="PD Mid"    value={daily3Data?.midLevel ? fmt(daily3Data.midLevel)  : '—'} color="#6b7280" />
          <StatCard label="PD Low"    value={daily3Data?.prevLow  ? fmt(daily3Data.prevLow)   : '—'} color="#22c55e" />
          <StatCard label="PD Range"  value={daily3Data?.prevHigh ? `${fmt(daily3Data.prevHigh - daily3Data.prevLow)} pts` : '—'} />
          <StatCard label="Signals"   value={String(daily3Data?.signals.length ?? 0)} sub={daily3Data?.signals.length ? `${daily3Data.signals.filter(s=>s.type==='CONT').length}↑ · ${daily3Data.signals.filter(s=>s.type==='TRAP').length}↓` : 'None'} />
        </>}
        {activeTab === 'sweep' && <>
          <StatCard label="PD High"   value={sweepData?.prevHigh ? fmt(sweepData.prevHigh) : '—'} color="#fbbf24" />
          <StatCard label="PD Low"    value={sweepData?.prevLow  ? fmt(sweepData.prevLow)  : '—'} color="#fbbf24" />
          <StatCard label="PD Range"  value={sweepData?.prevHigh ? `${fmt(sweepData.prevHigh - sweepData.prevLow)} pts` : '—'} />
          <StatCard label="Signals"   value={String(sweepData?.signals.length ?? 0)} sub={sweepData?.signals.length ? `${sweepData.signals.filter(s=>s.type==='CONT').length}↑ · ${sweepData.signals.filter(s=>s.type==='TRAP').length}↓` : 'None'} />
        </>}
        {activeTab === 'asiafib' && <>
          <StatCard label="Asia Range" value={asiaFibData?.orbBars ? `${fmt(asiaFibData.asiaHigh - asiaFibData.asiaLow)} pts` : '—'} sub={asiaFibData?.orbBars ? '10 AM AEDT 15-min OR' : 'Waiting for 10 AM AEDT'} />
          <StatCard label="Fib 0.5"    value={asiaFibData?.orbBars ? fmt(asiaFibData.fib50)  : '—'} color="#fbbf24" />
          <StatCard label="Fib 0.618"  value={asiaFibData?.orbBars ? fmt(asiaFibData.fib618) : '—'} color="#f97316" />
          <StatCard label="Fib 0.786"  value={asiaFibData?.orbBars ? fmt(asiaFibData.fib786) : '—'} color="#ef4444" />
          <StatCard label="Signals"    value={String(asiaFibData?.signals.length ?? 0)} sub={asiaFibData?.signals.length ? `${asiaFibData.signals.filter(s=>s.type==='CONT').length}↑ · ${asiaFibData.signals.filter(s=>s.type==='TRAP').length}↓` : 'None'} />
        </>}
        {activeTab === 'fibcont' && <>
          <StatCard label="Trend"      value={fibContData?.swingHigh ? (fibContData.trend === 'up' ? '▲ UP' : '▼ DOWN') : '—'} color={fibContData?.trend === 'up' ? '#22c55e' : '#ef4444'} />
          <StatCard label="Swing Hi"   value={fibContData?.swingHigh ? fmt(fibContData.swingHigh) : '—'} color={fibContData?.trend === 'up' ? '#22c55e' : '#ef4444'} />
          <StatCard label="Fib 0.618"  value={fibContData?.swingHigh ? fmt(fibContData.fib618) : '—'} color="#f97316" />
          <StatCard label="Swing Lo"   value={fibContData?.swingLow  ? fmt(fibContData.swingLow)  : '—'} color={fibContData?.trend === 'up' ? '#22c55e' : '#ef4444'} />
          <StatCard label="Signals"    value={String(fibContData?.signals.length ?? 0)} sub={fibContData?.signals.length ? `${fibContData.signals.filter(s=>s.type==='CONT').length}↑ · ${fibContData.signals.filter(s=>s.type==='TRAP').length}↓` : 'None'} />
        </>}
        {activeTab === 'nwc' && <>
          <StatCard label="Trend (M15)" value={nwcData ? (nwcData.trend === 'up' ? '▲ BULL BOS' : nwcData.trend === 'down' ? '▼ BEAR BOS' : '— NO BOS') : '—'} color={nwcData?.trend === 'up' ? '#22c55e' : nwcData?.trend === 'down' ? '#ef4444' : '#6b7280'} />
          <StatCard label="BOS Level"   value={nwcData?.bosLevel ? fmt(nwcData.bosLevel) : '—'} sub={nwcData?.trend === 'up' ? 'broken swing high' : 'broken swing low'} color="#fbbf24" />
          <StatCard label="Struct Stop" value={nwcData?.structureStop ? fmt(nwcData.structureStop) : '—'} sub={nwcData?.trend === 'up' ? 'recent higher low' : 'recent lower high'} color="#ef4444" />
          <StatCard label="NWC Marked"  value={String(nwcData?.noWickCandles.filter(n => n.validForTrend).length ?? 0)} sub={`${nwcData?.noWickCandles.length ?? 0} total (${nwcData?.noWickCandles.filter(n=>!n.validForTrend).length ?? 0} counter)`} color="#a78bfa" />
          <StatCard label="Signals"     value={String(nwcData?.signals.length ?? 0)} sub={nwcData?.signals.length ? `${nwcData.signals.filter(s=>s.type==='CONT').length} buy · ${nwcData.signals.filter(s=>s.type==='TRAP').length} sell · 1:1` : 'Waiting for retest (9-bar)'} />
        </>}
        {activeTab === 'comp' && <>
          <StatCard label="Trend (M15)" value={compData ? (compData.trend === 'up' ? '▲ BULL' : compData.trend === 'down' ? '▼ BEAR' : '— NO TREND') : '—'} color={compData?.trend === 'up' ? '#22c55e' : compData?.trend === 'down' ? '#ef4444' : '#6b7280'} />
          <StatCard label="BOS Level"   value={compData?.bosLevel ? fmt(compData.bosLevel) : '—'} sub={compData?.trend === 'up' ? 'broken swing high' : 'broken swing low'} color="#fbbf24" />
          <StatCard label="Stop"        value={compData?.structureStop ? fmt(compData.structureStop) : '—'} sub={compData?.trend === 'up' ? 'most recent low' : 'most recent high'} color="#ef4444" />
          <StatCard label="NWC Marked"  value={String(compData?.noWickCandles.filter(n => n.validForTrend).length ?? 0)} sub={`${compData?.noWickCandles.length ?? 0} total (${compData?.noWickCandles.filter(n=>!n.validForTrend).length ?? 0} counter)`} color="#a78bfa" />
          <StatCard label="Signals"     value={String(compData?.signals.length ?? 0)} sub={compData?.signals.length ? `${compData.signals.filter(s=>s.type==='CONT').length} buy · ${compData.signals.filter(s=>s.type==='TRAP').length} sell · 1:1` : 'Waiting for retrace (no cap)'} />
        </>}
        {activeTab === 'nwcbo' && <>
          <StatCard label="SR Zones"   value={String(nwcBoData?.srZones.length ?? 0)} sub="on M30 chart" />
          <StatCard label="Resistance" value={String(nwcBoData?.srZones.filter(z => z.type === 'resistance').length ?? 0)} sub="×2+ touches" color="#ef4444" />
          <StatCard label="Support"    value={String(nwcBoData?.srZones.filter(z => z.type === 'support').length ?? 0)} sub="×2+ touches" color="#22c55e" />
          <StatCard label="Signals"    value={String(nwcBoData?.signals.length ?? 0)} sub={nwcBoData?.signals.length ? `${nwcBoData.signals.filter(s=>s.type==='CONT').length} buy · ${nwcBoData.signals.filter(s=>s.type==='TRAP').length} sell` : 'Waiting for breakout + NWC'} />
        </>}
        {activeTab === 'or15' && <>
          <StatCard label="OR Range"   value={or15Data && or15Data.orBars > 0 ? `${fmt(or15Data.orHigh - or15Data.orLow)} pts` : '—'} sub={or15Data && or15Data.orBars > 0 ? `${fmt(or15Data.orHigh)} — ${fmt(or15Data.orLow)}` : 'Waiting for 9:30 AM EST'} />
          <StatCard label="Direction"  value={or15Data?.direction === 'bullish' ? '▲ BULL' : or15Data?.direction === 'bearish' ? '▼ BEAR' : '— WAIT'} color={or15Data?.direction === 'bullish' ? '#22c55e' : or15Data?.direction === 'bearish' ? '#ef4444' : '#6b7280'} />
          <StatCard label="OR Hi"      value={or15Data && or15Data.orBars > 0 ? fmt(or15Data.orHigh) : '—'} color="#f97316" />
          <StatCard label="OR Lo"      value={or15Data && or15Data.orBars > 0 ? fmt(or15Data.orLow)  : '—'} color="#f97316" />
          <StatCard label="SL Fixed"   value="25 pts" sub="TP1=50 · TP2=75 pts" color="#ef4444" />
          <StatCard label="Signals"    value={String(or15Data?.signals.length ?? 0)} sub={or15Data?.signals.length ? `${or15Data.signals.filter(s=>s.type==='CONT').length}↑ · ${or15Data.signals.filter(s=>s.type==='TRAP').length}↓` : 'Waiting for retest'} />
        </>}
        {activeTab === 'p1' && <>
          <StatCard label="M15 Bias"   value={p1Data?.bias === 'bullish' ? '▲ BULL' : p1Data?.bias === 'bearish' ? '▼ BEAR' : '— WAIT'} color={p1Data?.bias === 'bullish' ? '#22c55e' : p1Data?.bias === 'bearish' ? '#ef4444' : '#6b7280'} sub="from M15 FVG" />
          <StatCard label="M15 FVGs"   value={p1Data ? String(p1Data.m15Fvgs.length) : '—'} sub="unfilled gaps" color="#a78bfa" />
          <StatCard label="FVG Top"    value={p1Data?.activeFvg ? fmt(p1Data.activeFvg.top)    : '—'} color={p1Data?.bias === 'bullish' ? '#22c55e' : '#ef4444'} />
          <StatCard label="FVG Bot"    value={p1Data?.activeFvg ? fmt(p1Data.activeFvg.bottom) : '—'} color={p1Data?.bias === 'bullish' ? '#22c55e' : '#ef4444'} />
          <StatCard label="M5 Sweeps"  value={p1Data ? String(p1Data.sweeps.length) : '—'} sub="today, bias-aligned" color="#fbbf24" />
          <StatCard label="Signals"    value={String(p1Data?.signals.length ?? 0)} sub={p1Data?.signals.length ? `${p1Data.signals.filter(s=>s.type==='CONT').length}↑ · ${p1Data.signals.filter(s=>s.type==='TRAP').length}↓` : 'Waiting for 3-layer align'} />
        </>}
        {activeTab === 'flow' && <>
          <StatCard label="HTF Bias"    value={flowData?.bias === 'bullish' ? '▲ BULL' : flowData?.bias === 'bearish' ? '▼ BEAR' : '— WAIT'} color={flowData?.bias === 'bullish' ? '#22c55e' : flowData?.bias === 'bearish' ? '#ef4444' : '#6b7280'} sub="M30 FVG bias" />
          <StatCard label="FVG Top"     value={flowData?.htfFvg ? fmt(flowData.htfFvg.top)    : '—'} color={flowData?.bias === 'bullish' ? '#22c55e' : '#ef4444'} />
          <StatCard label="FVG Bot"     value={flowData?.htfFvg ? fmt(flowData.htfFvg.bottom) : '—'} color={flowData?.bias === 'bullish' ? '#22c55e' : '#ef4444'} />
          <StatCard label="Resting Liq" value={flowData?.restingLiq ? fmt(flowData.restingLiq) : '—'} sub="inside FVG on M5" color="#fbbf24" />
          <StatCard label="Swept"       value={flowData?.swept ? '✓ YES' : '✗ NO'} color={flowData?.swept ? '#22c55e' : '#6b7280'} sub={flowData?.sweepTime ? `at ${new Date(flowData.sweepTime * 1000).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' })} CT` : 'awaiting sweep'} />
          <StatCard label="13 EMA"      value={flowData?.currentEma13 ? fmt(flowData.currentEma13) : '—'} color="#a78bfa" sub="M5 entry trigger" />
          <StatCard label="Signals"     value={String(flowData?.signals.length ?? 0)} sub={flowData?.signals.length ? `${flowData.signals.filter(s=>s.type==='CONT').length}↑ · ${flowData.signals.filter(s=>s.type==='TRAP').length}↓` : '9:30–10:20 EST window'} />
          {(() => {
            const ls = flowData?.signals[flowData.signals.length - 1]
            const risk = ls ? Math.abs(ls.entryPrice - ls.stopPrice) : 0
            return <>
              <StatCard label="Entry"   value={ls ? fmt(ls.entryPrice) : '—'} color="#fbbf24" sub={ls ? (ls.type === 'CONT' ? 'LONG' : 'SHORT') : 'no signal yet'} />
              <StatCard label="Stop"    value={ls ? fmt(ls.stopPrice) : '—'} color="#ef4444" sub={ls ? `${fmt(risk)} pts risk` : '—'} />
              <StatCard label="TP1"     value={ls?.targetPrice ? fmt(ls.targetPrice) : '—'} color="#86efac" sub="1R" />
              <StatCard label="TP2"     value={ls?.target2 ? fmt(ls.target2) : '—'} color="#22c55e" sub="liquidity / 2R" />
              <StatCard label="TP3"     value={ls?.target3 ? fmt(ls.target3) : '—'} color="#4ade80" sub="3R" />
            </>
          })()}
        </>}
        {activeTab === 'lkz' && <>
          <StatCard label="Daily Bias"  value={lkzData?.dailyBias === 'bullish' ? '▲ BULL' : lkzData?.dailyBias === 'bearish' ? '▼ BEAR' : '— NEUT'} color={lkzData?.dailyBias === 'bullish' ? '#22c55e' : lkzData?.dailyBias === 'bearish' ? '#ef4444' : '#6b7280'} sub="HH/HL vs LH/LL" />
          <StatCard label="Asian Hi"    value={lkzData?.asianHigh ? fmt(lkzData.asianHigh) : '—'} color="#06b6d4" sub="BSL" />
          <StatCard label="Asian Lo"    value={lkzData?.asianLow ? fmt(lkzData.asianLow) : '—'} color="#06b6d4" sub="SSL" />
          <StatCard label="Sweep"       value={lkzData?.sweepType === 'bullish' ? '✓ LOW' : lkzData?.sweepType === 'bearish' ? '✓ HIGH' : '✗ NONE'} color={lkzData?.sweepType ? '#22c55e' : '#6b7280'} sub={lkzData?.sweepTime ? `at ${new Date(lkzData.sweepTime * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} EST` : 'awaiting sweep'} />
          <StatCard label="CE Entry"    value={lkzData?.ceEntry ? fmt(lkzData.ceEntry) : '—'} color="#fbbf24" sub="FVG 50%" />
          <StatCard label="Window"      value={lkzData?.macroWindow ? `MACRO ${lkzData.macroWindow}` : lkzData?.inWindow ? 'KZ LIVE' : 'CLOSED'} color={lkzData?.macroWindow === 2 ? '#fbbf24' : lkzData?.inWindow ? '#22c55e' : '#6b7280'} sub={lkzData?.macroWindow === 2 ? 'GOLDEN 2:33–3:00' : '2:00–5:00 EST'} />
          <StatCard label="Signals"     value={String(lkzData?.signals.length ?? 0)} sub={lkzData?.signals.length ? `${lkzData.signals.filter(s=>s.type==='CONT').length}↑ · ${lkzData.signals.filter(s=>s.type==='TRAP').length}↓` : 'sweep→FVG→CE'} />
        </>}
        {activeTab === 'gold' && <>
          <StatCard label="Signal Score" value={`${goldScore}/10`} color={goldScoreColor} sub={goldCanTrade ? 'Trade-qualified' : 'Need 6+ with trigger'} />
          <StatCard label="H4 Bias" value={goldData?.bias === 'bullish' ? '▲ BULL' : goldData?.bias === 'bearish' ? '▼ BEAR' : '— WAIT'} color={goldData?.bias === 'bullish' ? '#22c55e' : goldData?.bias === 'bearish' ? '#ef4444' : '#6b7280'} sub={`D1 ${goldData?.d1Trend ?? '—'} · H4 ${goldData?.h4Trend ?? '—'}`} />
          <StatCard label="DXY Filter" value={goldData?.dxyState === 'confirms' ? '✓ CONFIRM' : goldData?.dxyState === 'contradicts' ? '✗ BLOCK' : goldData?.dxyState === 'neutral' ? '— NEUTRAL' : '— MISSING'} color={goldData?.dxyState === 'confirms' ? '#22c55e' : goldData?.dxyState === 'contradicts' ? '#ef4444' : '#6b7280'} sub={goldData?.dxyClose ? `DXY ${fmt(goldData.dxyClose, 3)} · EMA ${goldData.dxyEma20 ? fmt(goldData.dxyEma20, 3) : '—'}` : 'synthetic basket'} />
          <StatCard label="Session" value={goldData?.session ?? '—'} color={goldData?.sessionActive ? '#fbbf24' : '#6b7280'} sub={goldData?.sessionActive ? 'signal window' : 'map only'} />
          <StatCard label="Asia Range" value={goldData?.asiaHigh && goldData?.asiaLow ? `${fmt(goldData.asiaHigh - goldData.asiaLow)} pts` : '—'} sub={goldData?.asiaHigh && goldData?.asiaLow ? `${fmt(goldData.asiaHigh)} — ${fmt(goldData.asiaLow)}` : '00:00–07:00 London'} />
          <StatCard label="Sweep" value={goldData?.sweepType ? (goldData.sweepType === 'bullish' ? 'LOW RECLAIM' : 'HIGH REJECT') : '— WAIT'} color={goldData?.sweepType === 'bullish' ? '#22c55e' : goldData?.sweepType === 'bearish' ? '#ef4444' : '#6b7280'} sub={goldData?.sweepLevel ? fmt(goldData.sweepLevel) : 'needs liquidity grab'} />
          <StatCard label="M15 Confirm" value={goldData?.m15Structure ? fmt(goldData.m15Structure) : '—'} color="#a78bfa" sub={goldData?.ema20 ? `20 EMA ${fmt(goldData.ema20)}` : 'BOS + EMA reclaim'} />
          <StatCard label="Signals" value={String(goldData?.signals.length ?? 0)} sub={goldData?.signals.length ? `${goldData.signals.filter(s=>s.type==='CONT').length} long · ${goldData.signals.filter(s=>s.type==='TRAP').length} short` : 'No trigger yet'} />
        </>}
        {activeTab === 'dxycorr' && <>
          <StatCard label="DXY Push"    value={dxyCorrData?.dxyPushDir ? `${dxyCorrData.dxyPushDir.toUpperCase()} ${dxyCorrData.dxyPushMag ? fmt(dxyCorrData.dxyPushMag, 3) : '—'}` : '— SCAN'} color={dxyCorrData?.dxyPushDir === 'up' ? '#ef4444' : dxyCorrData?.dxyPushDir === 'down' ? '#22c55e' : '#6b7280'} sub={dxyCorrData?.dxyPushPct ? `${fmt(dxyCorrData.dxyPushPct, 3)}% over push window` : 'last 12h M15 DXY'} />
          <StatCard label="Gold Lag"    value={dxyCorrData?.mismatchSeverity !== 'none' ? `${dxyCorrData?.mismatchSeverity?.toUpperCase() ?? '—'} ${dxyCorrData?.mismatchRatio != null ? `${(dxyCorrData.mismatchRatio * 100).toFixed(0)}%` : ''}` : '— NONE'} color={dxyCorrData?.mismatchSeverity === 'strong' ? '#ef4444' : dxyCorrData?.mismatchSeverity === 'moderate' ? '#fbbf24' : '#6b7280'} sub={dxyCorrData?.goldMovePct != null ? `Gold moved ${fmt(dxyCorrData.goldMovePct, 3)}% vs DXY ${fmt(dxyCorrData?.dxyPushPct ?? 0, 3)}%` : 'how much gold lagged'} />
          <StatCard label="Pullback"    value={dxyCorrData?.dxyPullbackDetected ? `✓ ${fmt(dxyCorrData.dxyPullbackPct ?? 0, 0)}%` : dxyCorrData?.dxyPullbackPct != null ? `${fmt(dxyCorrData.dxyPullbackPct, 0)}% / 25%` : '— WAIT'} color={dxyCorrData?.dxyPullbackDetected ? '#22c55e' : '#6b7280'} sub="DXY retracement of push" />
          <StatCard label="Status"      value={dxyCorrData?.status === 'signal_ready' ? 'SIGNAL' : dxyCorrData?.status === 'pullback_detected' ? 'PULLBACK' : dxyCorrData?.status === 'mismatch_found' ? 'MISMATCH' : dxyCorrData?.status === 'no_setup' ? 'NO SETUP' : 'SCANNING'} color={dxyCorrData?.status === 'signal_ready' ? '#22c55e' : dxyCorrData?.status === 'pullback_detected' ? '#fbbf24' : dxyCorrData?.status === 'mismatch_found' ? '#f97316' : '#6b7280'} sub={dxyCorrData?.goldExpectedDir ? `Gold expected: ${dxyCorrData.goldExpectedDir.toUpperCase()}` : 'DXY inverse = gold direction'} />
          <StatCard label="Catch-up Dir" value={dxyCorrData?.goldExpectedDir ? (dxyCorrData.goldExpectedDir === 'up' ? '▲ LONG' : '▼ SHORT') : '—'} color={dxyCorrData?.goldExpectedDir === 'up' ? '#22c55e' : dxyCorrData?.goldExpectedDir === 'down' ? '#ef4444' : '#6b7280'} sub="gold entry direction" />
          <StatCard label="Signals"     value={String(dxyCorrData?.signals.length ?? 0)} sub={dxyCorrData?.signals.length ? `entry ${fmt(dxyCorrData.signals[0].entryPrice)}` : 'waiting for confirmation'} />
        </>}
        {activeTab === 'zones' && <>
          <StatCard label="Bias"        value={zonesData?.overallBias === 'bullish' ? '▲ BULL' : zonesData?.overallBias === 'bearish' ? '▼ BEAR' : '— MIXED'} color={zonesData?.overallBias === 'bullish' ? '#22c55e' : zonesData?.overallBias === 'bearish' ? '#ef4444' : '#6b7280'} sub={`H4 ${zonesData?.h4Trend ?? '—'} · H2 ${zonesData?.h2Trend ?? '—'} · H1 ${zonesData?.h1Trend ?? '—'}`} />
          <StatCard label="Sell Zones"  value={String(zonesData?.sellZones.length ?? 0)} sub={zonesData?.sellZones[0] ? `top ×${zonesData.sellZones[0].touches} @ ${fmt(zonesData.sellZones[0].level)}` : 'swing highs H4/H2/H1'} color="#ef4444" />
          <StatCard label="Buy Zones"   value={String(zonesData?.buyZones.length ?? 0)} sub={zonesData?.buyZones[zonesData.buyZones.length - 1] ? `bot ×${zonesData.buyZones[zonesData.buyZones.length - 1].touches} @ ${fmt(zonesData.buyZones[zonesData.buyZones.length - 1].level)}` : 'swing lows H4/H2/H1'} color="#22c55e" />
          <StatCard label="Active Zone" value={zonesData?.activeZone ? `${zonesData.activeZoneType?.toUpperCase()} ×${zonesData.activeZone.touches}` : '— NONE'} color={zonesData?.activeZoneType === 'sell' ? '#ef4444' : zonesData?.activeZoneType === 'buy' ? '#22c55e' : '#6b7280'} sub={zonesData?.activeZone ? `${zonesData.activeZone.strength} @ ${fmt(zonesData.activeZone.level)}` : 'price not at any zone'} />
          <StatCard label="Confirm"     value={zonesData?.confirmType ? zonesData.confirmType.replace(/_/g, ' ').toUpperCase() : '— WAIT'} color={zonesData?.confirmType ? '#fbbf24' : '#6b7280'} sub="engulf / star / FVG inv" />
          <StatCard label="ATR H4"      value={zonesData?.atr4h ? `${fmt(zonesData.atr4h)} pts` : '—'} sub="zone proximity range" color="#f97316" />
          <StatCard label="Signals"     value={String(zonesData?.signals.length ?? 0)} sub={zonesData?.signals.length ? `${zonesData.signals.filter(s=>s.type==='CONT').length}↑ · ${zonesData.signals.filter(s=>s.type==='TRAP').length}↓` : 'waiting for zone + confirm'} />
        </>}
        {activeTab === 'cont' && <>
          <StatCard label="Checklist"   value={`${ldcmData?.checklistScore ?? 0}/8`} color={ldcmData && ldcmData.checklistScore >= 6 ? '#22c55e' : ldcmData && ldcmData.checklistScore >= 4 ? '#fbbf24' : '#6b7280'} sub={(ldcmData?.checklistScore ?? 0) >= 6 ? 'Trade-qualified' : 'Not ready yet'} />
          <StatCard label="HTF Bias"    value={ldcmData?.htfBias === 'bullish' ? '▲ BULL' : ldcmData?.htfBias === 'bearish' ? '▼ BEAR' : '— WAIT'} color={ldcmData?.htfBias === 'bullish' ? '#22c55e' : ldcmData?.htfBias === 'bearish' ? '#ef4444' : '#6b7280'} sub="H4 20 EMA direction" />
          <StatCard label="Zone"        value={ldcmData?.priceZone === 'discount' ? '↓ DISCOUNT' : ldcmData?.priceZone === 'premium' ? '↑ PREMIUM' : '— EQUIL'} color={ldcmData?.priceZone === 'discount' ? '#22c55e' : ldcmData?.priceZone === 'premium' ? '#ef4444' : '#6b7280'} sub={ldcmData?.equilibrium ? `equil ${fmt(ldcmData.equilibrium)}` : 'mid of range'} />
          <StatCard label="Retracement" value={ldcmData?.retracementComplete ? '✓ DONE' : '— WAIT'} color={ldcmData?.retracementComplete ? '#22c55e' : '#6b7280'} sub={ldcmData?.htfBias === 'bullish' ? 'need price in discount' : ldcmData?.htfBias === 'bearish' ? 'need price in premium' : '—'} />
          <StatCard label="Disp"        value={ldcmData?.displacementConfirmed ? '✓ SEEN' : '— WAIT'} color={ldcmData?.displacementConfirmed ? '#f97316' : '#6b7280'} sub={ldcmData?.displacementHigh && ldcmData?.displacementLow ? `${fmt(ldcmData.displacementLow)}–${fmt(ldcmData.displacementHigh)}` : 'M15 body ≥ 1.5× ATR'} />
          <StatCard label="IFVG"        value={ldcmData?.ifvgType ? `✓ ${ldcmData.ifvgType.toUpperCase()}` : '— WAIT'} color={ldcmData?.ifvgType ? '#a78bfa' : '#6b7280'} sub={ldcmData?.ifvgTop && ldcmData?.ifvgBottom ? `${fmt(ldcmData.ifvgBottom)}–${fmt(ldcmData.ifvgTop)}` : 'after displacement'} />
          <StatCard label="Entry"       value={ldcmData?.entryReady ? '✓ IN IFVG' : '— WAIT'} color={ldcmData?.entryReady ? '#fbbf24' : '#6b7280'} sub="price must retrace into IFVG" />
          <StatCard label="Signals"     value={String(ldcmData?.signals.length ?? 0)} sub={ldcmData?.signals.length ? `entry ${fmt(ldcmData.signals[ldcmData.signals.length-1].entryPrice)}` : 'need 6/8 + IFVG entry'} />
        </>}
        {activeTab === 'sgr' && <>
          <StatCard label="Session"    value={sgrData?.activeSession ?? '— CLOSED'} color={sgrData?.activeSession ? '#22c55e' : '#6b7280'} sub="NY H1 · Asia H2 (ET)" />
          <StatCard label="High Zone"  value={sgrData?.highZone ? fmt(sgrData.highZone) : '—'} color="#ef4444" sub="H1 swing high · short reversal" />
          <StatCard label="Low Zone"   value={sgrData?.lowZone ? fmt(sgrData.lowZone) : '—'} color="#22c55e" sub="H1 swing low · long reversal" />
          <StatCard label="High Tap"   value={sgrData?.highTapped ? '✓ TAPPED' : '— WAIT'} color={sgrData?.highTapped ? '#ef4444' : '#6b7280'} sub="price reached high zone today" />
          <StatCard label="Low Tap"    value={sgrData?.lowTapped ? '✓ TAPPED' : '— WAIT'} color={sgrData?.lowTapped ? '#22c55e' : '#6b7280'} sub="price reached low zone today" />
          <StatCard label="Confirm"    value="M1 2-candle" sub="bear→bull long · bull→bear short" color="#fbbf24" />
          <StatCard label="Signals"    value={String(sgrData?.signals.length ?? 0)} sub={sgrData?.signals.length ? `${sgrData.signals.filter(s=>s.type==='CONT').length}↑ · ${sgrData.signals.filter(s=>s.type==='TRAP').length}↓` : '≈2/day · 1R / ATR×1.5'} />
        </>}
        {(activeTab === 'qfb25' || activeTab === 'qfb15') && (() => {
          const q = activeTab === 'qfb25' ? qfb25Data : qfb15Data
          return <>
            <StatCard label="Range"     value={q?.rangeBars ? `${fmt(q.rangeHigh - q.rangeLow)} pts` : '—'} sub={q?.rangeBars ? `${fmt(q.rangeHigh)} — ${fmt(q.rangeLow)}` : '07:00–07:59 UTC'} />
            <StatCard label="Window"    value={q?.activeWindow ? 'LIVE' : 'CLOSED'} color={q?.activeWindow ? '#22c55e' : '#6b7280'} sub="08:00–11:59 UTC" />
            <StatCard label="ATR"       value={q?.atr ? fmt(q.atr) : '—'} color={q && q.atr >= q.atrThreshold ? '#22c55e' : '#6b7280'} sub={q?.atrThreshold ? `threshold ${fmt(q.atrThreshold)}` : 'high-vol filter'} />
            <StatCard label="Trigger"   value={q?.buffer ? `${fmt(q.buffer)} buf` : '—'} color="#06b6d4" sub="0.05 ATR beyond range" />
            <StatCard label="TP / SL"   value={q ? `${q.targetAtr} / ${q.stopAtr} ATR` : '—'} color={activeTab === 'qfb25' ? '#22c55e' : '#fbbf24'} sub={activeTab === 'qfb25' ? 'quant preferred' : 'higher win rate'} />
            <StatCard label="Signals"   value={String(q?.signals.length ?? 0)} sub={`max ${q?.maxTrades ?? 2}/day`} />
          </>
        })()}
        {activeTab === 'p3' && <>
          <StatCard label="Session"   value={p3Data?.activeSession ?? '— CLOSED'} color={p3Data?.activeSession ? '#22c55e' : '#6b7280'} sub="Asia→London→NY (ET)" />
          <StatCard label="Asia Hi"   value={p3Data?.asiaHigh ? fmt(p3Data.asiaHigh) : '—'} color="#ef4444" sub={p3Data?.londonSwept === 'high' ? '✓ swept by London' : 'liquidity above'} />
          <StatCard label="Asia Lo"   value={p3Data?.asiaLow ? fmt(p3Data.asiaLow) : '—'} color="#22c55e" sub={p3Data?.londonSwept === 'low' ? '✓ swept by London' : 'liquidity below'} />
          <StatCard label="London"    value={p3Data?.londonSwept ? `TOOK ${p3Data.londonSwept.toUpperCase()}S` : '— WAIT'} color={p3Data?.londonSwept ? '#06b6d4' : '#6b7280'} sub="side London manipulated" />
          <StatCard label="Bias"      value={p3Data?.bias && p3Data.bias !== 'none' ? p3Data.bias.toUpperCase() : '—'} color={p3Data?.bias === 'long' ? '#22c55e' : p3Data?.bias === 'short' ? '#ef4444' : '#6b7280'} sub="NY reversal to untapped side" />
          <StatCard label="Target"    value={p3Data?.target ? fmt(p3Data.target) : '—'} color="#fbbf24" sub="untapped Asia liquidity" />
          <StatCard label="NY Fake"   value={p3Data?.fakeDone ? '✓ DONE' : '— WAIT'} color={p3Data?.fakeDone ? '#a78bfa' : '#6b7280'} sub="fake continuation printed" />
          <StatCard label="Signals"   value={String(p3Data?.signals.length ?? 0)} sub={p3Data?.signals.length ? `entry ${fmt(p3Data.signals[p3Data.signals.length-1].entryPrice)}` : '≤1/day · NY 09:30 ET'} />
        </>}
        {activeTab === 'fiji' && <>
          <StatCard label="OR Hi"    value={fijiData?.orHigh ? fmt(fijiData.orHigh) : '—'} color="#7c3aed" sub="8–10 AM AEDT wick high" />
          <StatCard label="OR Lo"    value={fijiData?.orLow ? fmt(fijiData.orLow) : '—'}   color="#7c3aed" sub="8–10 AM AEDT wick low" />
          <StatCard label="Sweep"    value={fijiData?.sweepType ? fijiData.sweepType.toUpperCase() + ' SWEPT' : '—'} color={fijiData?.sweepType === 'high' ? '#ef4444' : fijiData?.sweepType === 'low' ? '#22c55e' : '#6b7280'} sub="OR level swept" />
          <StatCard label="IFVG"     value={fijiData?.ifvg ? `${fmt(fijiData.ifvg.bottom)}–${fmt(fijiData.ifvg.top)}` : '—'} color="#fbbf24" sub="inverse FVG zone" />
          <StatCard label="Signals"  value={String(fijiData?.signals.length ?? 0)} sub={fijiData?.signals.length ? `entry ${fmt(fijiData.signals[fijiData.signals.length-1].entryPrice)}` : '66.5% · 4.1R avg'} />
        </>}
        {activeTab === 'mygold' && <>
          <StatCard label="Checklist"  value={`${myGoldData?.checklistScore ?? 0}/8`} color={myGoldData && myGoldData.checklistScore >= 6 ? '#22c55e' : myGoldData && myGoldData.checklistScore >= 4 ? '#fbbf24' : '#6b7280'} sub={(myGoldData?.checklistScore ?? 0) >= 6 ? 'Trade-qualified' : 'Building setup…'} />
          <StatCard label="HTF Bias"   value={myGoldData?.htfBias === 'bullish' ? '▲ BULL' : myGoldData?.htfBias === 'bearish' ? '▼ BEAR' : '— WAIT'} color={myGoldData?.htfBias === 'bullish' ? '#22c55e' : myGoldData?.htfBias === 'bearish' ? '#ef4444' : '#6b7280'} sub={`Daily ${myGoldData?.dailyTrend ?? '—'}`} />
          <StatCard label="Zones"      value={String(myGoldData?.zones.length ?? 0)} sub={`${myGoldData?.zones.filter(z=>z.type==='supply').length ?? 0} supply · ${myGoldData?.zones.filter(z=>z.type==='demand').length ?? 0} demand`} color="#fbbf24" />
          <StatCard label="Sweep"      value={myGoldData?.sweepDetected ? `✓ ${myGoldData.sweepType?.toUpperCase()}` : '— WAIT'} color={myGoldData?.sweepDetected ? '#22c55e' : '#6b7280'} sub={myGoldData?.sweepLevel ? `@ ${myGoldData.sweepLevel.toFixed(2)}` : 'needs liquidity grab'} />
          <StatCard label="BOS"        value={myGoldData?.bosDetected ? `✓ ${myGoldData.bosType?.toUpperCase()}` : '— WAIT'} color={myGoldData?.bosDetected ? '#f97316' : '#6b7280'} sub={myGoldData?.bosLevel ? `close past ${myGoldData.bosLevel.toFixed(2)}` : 'M5 candle close only'} />
          <StatCard label="FVG"        value={myGoldData?.activeFvg ? `${myGoldData.activeFvg.bottom.toFixed(2)}–${myGoldData.activeFvg.top.toFixed(2)}` : '— WAIT'} color={myGoldData?.activeFvg ? '#a78bfa' : '#6b7280'} sub={myGoldData?.fvg50eq ? `50% EQ ${myGoldData.fvg50eq.toFixed(2)}` : '3-candle imbalance'} />
          <StatCard label="Signals"    value={String(myGoldData?.signals.length ?? 0)} sub={myGoldData?.signals.length ? `${myGoldData.signals.filter(s=>s.type==='CONT').length} long · ${myGoldData.signals.filter(s=>s.type==='TRAP').length} short` : 'Waiting for FVG retracement'} />
        </>}
      </div>

      {/* ── Session Banner ─────────────────────────────────────────────────── */}
      {session && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 16px', background: `${session.color}12`, borderBottom: `1px solid ${session.color}30`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: session.color }} className={session.name !== 'After Hours' ? 'animate-pulse' : ''} />
            <span style={{ fontSize: 11, fontWeight: 700, color: session.color, letterSpacing: '0.04em' }}>{session.name.toUpperCase()}</span>
          </div>
          <div style={{ width: 1, height: 14, background: `${session.color}40`, flexShrink: 0 }} />
          {session.rangeHigh && session.rangeLow && (
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: `${session.color}cc`, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              H {fmt(session.rangeHigh)} · L {fmt(session.rangeLow)}
            </span>
          )}
          {session.asiaHigh && session.name !== 'Asia' && (
            <>
              <div style={{ width: 1, height: 14, background: '#1f2937', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#4b5563', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                Asia {fmt(session.asiaHigh)} / {session.asiaLow ? fmt(session.asiaLow) : '—'}
              </span>
            </>
          )}
          <div style={{ width: 1, height: 14, background: '#1f2937', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: session.bias === 'bullish' ? '#22c55e' : session.bias === 'bearish' ? '#ef4444' : '#6b7280', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.description}
          </span>
          {session.bias !== 'neutral' && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: session.bias === 'bullish' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: session.bias === 'bullish' ? '#22c55e' : '#ef4444', fontWeight: 700, flexShrink: 0 }}>
              {session.bias === 'bullish' ? '▲ BULL' : '▼ BEAR'}
            </span>
          )}
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Chart */}
        <div ref={chartContainerRef} style={{ flex: 1, minWidth: 0, position: 'relative' }} />

        {/* Sidebar */}
        <aside style={{ width: 272, borderLeft: '1px solid #1f2937', display: 'flex', flexDirection: 'column', background: '#080b10', flexShrink: 0, overflow: 'hidden' }}>

          {/* Settings */}
          {showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: 16, background: '#0d1117', flexShrink: 0 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 12 }}>Settings</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeTab !== 'lndb' && activeTab !== 'lndb2' && activeTab !== 'compare' && activeTab !== 'eightam' && (
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>OR Session Open (NY)</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" min={0} max={23} value={sessionHour} onChange={e => setSessionHour(+e.target.value)} style={{ flex: 1, background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', color: '#f9fafb', textAlign: 'center' }} />
                      <span style={{ color: '#6b7280' }}>:</span>
                      <input type="number" min={0}  max={59} value={sessionMin}  onChange={e => setSessionMin(+e.target.value)}  style={{ flex: 1, background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', color: '#f9fafb', textAlign: 'center' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>London: 03:00 · NY: 08:00</div>
                  </div>
                )}
                {activeTab === 'vp' && (
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Value Area %</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="range" min={50} max={90} step={5} value={vaPct} onChange={e => setVaPct(+e.target.value)} style={{ flex: 1, accentColor: '#fbbf24' }} />
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#fbbf24', width: 32, textAlign: 'right' }}>{vaPct}%</span>
                    </div>
                  </div>
                )}
                {(activeTab === 'lndb' || activeTab === 'lndb2' || activeTab === 'compare') && (
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>London Session Window (CT)</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" min={0} max={23} value={lndbStart} onChange={e => setLndbStart(+e.target.value)} style={{ flex: 1, background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', color: '#f9fafb', textAlign: 'center' }} />
                      <span style={{ color: '#6b7280' }}>–</span>
                      <input type="number" min={0} max={23} value={lndbEnd}   onChange={e => setLndbEnd(+e.target.value)}   style={{ flex: 1, background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', color: '#f9fafb', textAlign: 'center' }} />
                      <span style={{ fontSize: 10, color: '#6b7280' }}>AM CT</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Default: 3–8 AM CT (London session)</div>
                  </div>
                )}
                {activeTab === 'gold' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>US Dollar Filter</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                        {(['supportive', 'neutral', 'hostile'] as MacroState[]).map(v => (
                          <button key={v} onClick={() => setMacroDollar(v)} style={{ padding: '6px 0', borderRadius: 7, border: macroDollar === v ? '1px solid rgba(251,191,36,.35)' : '1px solid #1f2937', background: macroDollar === v ? 'rgba(251,191,36,.1)' : '#111827', color: macroDollar === v ? '#fbbf24' : '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>{v.slice(0, 4)}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>Real Yield Filter</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                        {(['supportive', 'neutral', 'hostile'] as MacroState[]).map(v => (
                          <button key={v} onClick={() => setMacroYields(v)} style={{ padding: '6px 0', borderRadius: 7, border: macroYields === v ? '1px solid rgba(251,191,36,.35)' : '1px solid #1f2937', background: macroYields === v ? 'rgba(251,191,36,.1)' : '#111827', color: macroYields === v ? '#fbbf24' : '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>{v.slice(0, 4)}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#4b5563', lineHeight: 1.5 }}>Supportive = weak USD / falling real yields. Hostile subtracts from conviction. Only take 7+/10 setups.</div>
                  </div>
                )}
                <button onClick={() => { setShowSettings(false); fetchData() }} style={{ padding: '7px 0', borderRadius: 8, border: '1px solid rgba(251,191,36,.3)', background: 'rgba(251,191,36,.1)', color: '#fbbf24', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Apply &amp; Refresh
                </button>
              </div>
            </div>
          )}

          {/* LNDB / LNDB2 strategy description */}
          {activeTab === 'lndb' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(6,182,212,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#06b6d4', marginBottom: 8 }}>London Breakout Rules</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>①</span> Box = London Hi/Lo ({lndbStart}–{lndbEnd} AM CT, M5)</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>②</span> Enter: body CLOSES outside box — wicks don&apos;t count</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>③</span> Stop: below/above entry candle. TP1=1R · TP2=2R · TP3=3R</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Signal fires at candle close — enter immediately at that price</div>
              </div>
            </div>
          )}
          {activeTab === 'lndb2' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(6,182,212,.06)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#06b6d4', marginBottom: 8 }}>LNDB2 — Confirmed Breakout Rules</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>①</span> Same London box as LNDB ({lndbStart}–{lndbEnd} AM CT)</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>②</span> Signal requires <strong style={{ color: '#f9fafb' }}>2 consecutive M5 closes</strong> outside box</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>③</span> Entry = close of the 2nd candle · same TP1/2/3 structure</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Filters fake breakouts — fewer signals, higher quality</div>
              </div>
            </div>
          )}
          {activeTab === 'compare' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(6,182,212,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#06b6d4', marginBottom: 8 }}>LNDB vs LNDB2 Comparison</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>LNDB</span> — 1 close outside box → signal fires</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>LNDB2</span> — 2 consecutive closes outside → confirmed</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Amber arrows = LNDB · Cyan circles = LNDB2</div>
              </div>
            </div>
          )}
          {activeTab === 'fcv' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(249,115,22,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f97316', marginBottom: 8 }}>First Candle Rules (9:30 AM, M1)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>①</span> At 9:30 AM, mark first 15-min candle&apos;s high and low — that&apos;s your range</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>②</span> Drop to M5 — wait for a candle to break <strong style={{ color: '#f9fafb' }}>and close</strong> above or below the range, confirming direction</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>③</span> Mark the fair value gap that forms in the breakout leg</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>④</span> Wait for price to retrace into the FVG — look for an indecision candle (doji / inside bar)</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>⑤</span> Enter on the indecision candle · ride candles toward take profit</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Stop = below/above FVG or indecision candle · TP = prior swing / session high-low</div>
              </div>
            </div>
          )}
          {activeTab === 'eightam' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(56,189,248,.05)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', marginBottom: 8 }}>8AM NY Optimised Rules</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#38bdf8', fontWeight: 600 }}>①</span> Mark the 08:00 NY M15 candle high and low.</div>
                <div><span style={{ color: '#38bdf8', fontWeight: 600 }}>②</span> At 09:30 NY close: above 8AM high = long, below 8AM low = short.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>③</span> Entry is the 8AM boundary retest before 12:00 NY. Stop = 40 pts · target = 12 pts.</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>④</span> Filters: 8AM range ≤ 15 pts, H4 not opposite, DXY not blocking.</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>{eightAmData?.invalidation ?? 'Waiting for data.'}</div>
              </div>
            </div>
          )}
          {activeTab === 'orb' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(249,115,22,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f97316', marginBottom: 8 }}>ORB Retest Rules (9:30 AM EST)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>①</span> First 15-min candle (9:30–9:45 AM NY) = ORB</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>②</span> Wait for BREAKOUT of ORB High or Low</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>③</span> Enter on RETEST rejection of broken level</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Stop = below/above retest candle · TP1=1R · TP2=2R · TP3=3R</div>
              </div>
            </div>
          )}
          {activeTab === 'daily3' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(239,68,68,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ef4444', marginBottom: 8 }}>Daily 3-Level Rules</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>①</span> Levels: Prev Day H / Mid (50%) / L</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>BUY</span> wick below PD Low → close above → TP1=Mid · TP2=PD Hi</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SELL</span> wick above PD High → close below → TP1=Mid · TP2=PD Lo</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Avoid trades near 50% mid zone (no-trade band)</div>
              </div>
            </div>
          )}
          {activeTab === 'sweep' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(251,191,36,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: 8 }}>Sweep & Engulf Rules</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>①</span> Mark Prev Day High / Low</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>②</span> Wait for liquidity sweep (wick through H/L)</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>③</span> Confirm with opposing engulfing candle</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Signal = sweep + engulf combo · Target opposite level · 1–2R</div>
              </div>
            </div>
          )}
          {activeTab === 'asiafib' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(124,58,237,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7c3aed', marginBottom: 8 }}>Asia Fib Rules (10 AM AEDT)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#7c3aed', fontWeight: 600 }}>①</span> First 15-min candle at 10 AM AEDT = Asia OR</div>
                <div><span style={{ color: '#7c3aed', fontWeight: 600 }}>②</span> Fib from wick Lo → Hi · Key levels: 0.5 / 0.618 / 0.786</div>
                <div><span style={{ color: '#7c3aed', fontWeight: 600 }}>③</span> FVG at key Fib OR rejection candle = entry</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Target ~2.6R · Stop below/above FVG or retest candle</div>
              </div>
            </div>
          )}
          {activeTab === 'fibcont' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(249,115,22,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f97316', marginBottom: 8 }}>Fib Continuation Rules</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>①</span> Detect trend from last 60 M5 bars (swing H/L)</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>②</span> Draw Fib on last impulse leg</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>③</span> Enter rejection at 0.5 / 0.618 / 0.786 retracement</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Target: prior swing · Stop: below/above entry candle</div>
              </div>
            </div>
          )}
          {activeTab === 'nwc' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(167,139,250,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', marginBottom: 8 }}>No-Wick Candle Rules (M15)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>①</span> Trend = most recent Break of Structure (BOS) on M15</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>BULL</span> NWC — no bottom wick (open = low, flat base)</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>BEAR</span> NWC — no top wick (open = high, flat top)</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>②</span> Match candle direction to BOS trend · mark it</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>③</span> Retest within <strong style={{ color: '#f9fafb' }}>9 candles</strong> → enter at flat level</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Stop = BOS structure HL/LH · TP = 1:1</div>
              </div>
            </div>
          )}
          {activeTab === 'comp' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(167,139,250,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', marginBottom: 8 }}>Compensation Play — No-Wick Trend Continuation (M15)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>①</span> Identify M15 trend — bullish or bearish (BOS)</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>UPTREND</span> bullish no-wick candle — no bottom wick</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>DOWNTREND</span> bearish no-wick candle — no top wick</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>②</span> Mark the no-wick candle level</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>③</span> Wait for retrace back to that level (<strong style={{ color: '#f9fafb' }}>no cap</strong>) → enter with trend</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Stop = most recent low (buys) / high (sells) · TP = 1:1</div>
              </div>
            </div>
          )}
          {activeTab === 'nwcbo' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(6,182,212,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#06b6d4', marginBottom: 8 }}>NWC Breakout Rules (M30)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>①</span> Mark S/R zones (2+ touches at M30 swing H/L)</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>BUY</span> Body close above resistance → next candle bearish NWC (no top wick)</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SELL</span> Body close below support → next candle bullish NWC (no bottom wick)</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>②</span> Enter at broken zone on retest (15-bar window)</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>Stop = NWC wick extreme · TP = 1:1</div>
              </div>
            </div>
          )}
          {activeTab === 'flow' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(251,191,36,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: 8 }}>Flow Model — 3-Step Rules (9:30–10:20 EST)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>S1 · HTF Imbalance</span> — find M30 FVG, confirm market structure (HH/HL for bull)</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>S2 · Resting Liquidity</span> — mark M5 swing H/L INSIDE HTF FVG. Wait for sweep — this is the fuel</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>S3 · 13 EMA Break</span> — after sweep, high-vol close through 13 EMA in window = entry</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>FVG Break ↓</span> — bullish FVG fails: bearish close below FVG bottom in window = short</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Entry wick ≤ 25% of range. SL below/above entry candle. TP = liq / DOL / data H-L</div>
              </div>
            </div>
          )}
          {activeTab === 'lkz' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(6,182,212,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#06b6d4', marginBottom: 8 }}>London Kill Zone — 2:00–5:00 AM EST (golden 2:33–3:00)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>Pre-2AM</span> — mark Asian Hi (BSL) + Lo (SSL), set daily bias (HH/HL or LH/LL). Asia = no trade</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>① Sweep</span> — in KZ price runs Asian Low (long) or High (short) + closes back inside</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>② Displacement</span> — strong move off the sweep leaves an FVG (no wicks inside)</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>③ CE Entry</span> — enter at Consequent Encroachment = FVG 50% on the retrace</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>Risk</span> SL beyond sweep wick · TP1 = opposite Asian level · TP2 = range extension runner</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Macro windows: 2:00–2:15 · 2:33–3:00 (50%+ entries) · 4:00–4:15. No sweep by 3:30 → skip to NY. Zero trades is valid.</div>
              </div>
            </div>
          )}
          {activeTab === 'dxycorr' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(6,182,212,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#06b6d4', marginBottom: 8 }}>DXY-Gold Correlation — Catch-Up Strategy</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>① DXY Push</span> — DXY makes a big directional move (≥0.12 pts) in last 12 hours</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>② Gold Lag</span> — gold fails to move inversely ≥35% lag = mismatch detected</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>③ DXY Pullback</span> — DXY retraces ≥25% of push magnitude = catch-up primed</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>LONG</span> DXY pushed up → gold lagged → DXY pulls back → buy gold</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SHORT</span> DXY pushed down → gold lagged → DXY pulls back → sell gold</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SL</span> beyond signal candle low/high + 0.2 ATR · TP1=1R · TP2=lag target · TP3=3R</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Invalid if DXY resumes original push direction. Bigger lag = bigger TP2.</div>
              </div>
            </div>
          )}
          {activeTab === 'gold' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(251,191,36,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: 8 }}>Gold Signal — Macro Session Playbook</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>① Macro</span> — set USD + real-yield filters in settings before trusting score</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>② HTF</span> — H4 sets direction; D1 alignment adds confidence</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>③ DXY</span> — longs need DXY not bullish; shorts need DXY not bearish</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>④ Session</span> — Asia maps the range; London/NY gives execution</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>LONG</span> sweep Asia low → reclaim → M15 BOS above 20 EMA</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SHORT</span> sweep Asia high → reject → M15 BOS below 20 EMA</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>Risk</span> stop beyond sweep + 0.3 ATR · TP1=1R · TP2=Asia opposite/2R · TP3=3R</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Skip CPI, NFP, FOMC, Powell speeches, and any setup below 6/10.</div>
              </div>
            </div>
          )}
          {activeTab === 'cont' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(167,139,250,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', marginBottom: 8 }}>Low Drawdown Continuation — 8-Step Checklist</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>① HTF Bias</span> — H4 20 EMA sets direction. Only trade that way.</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>② Range</span> — define the clear high and low of the consolidation range.</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>③ Zone</span> — is price in the correct zone? Bull = discount, Bear = premium.</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>④ Retracement</span> — wait for price to fully pull back into the zone.</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>⑤ Displacement</span> — strong M15 candle (body ≥ 1.5× ATR) leaves the zone.</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>⑥ IFVG</span> — 3-candle gap forms after displacement. This is the key trigger.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>⑦ Entry</span> — enter AFTER price retraces into the IFVG. Not during the pullback.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>⑧ Stop</span> — place stop at protected high/low from the displacement candle.</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>No guessing. No anticipation. All 8 must align. TP1=1R · TP2=2R · TP3=3R</div>
              </div>
            </div>
          )}
          {activeTab === 'sgr' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(251,191,36,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: 8 }}>Three-Session Gold Reversal — Playbook (backtest-tuned)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>① Sessions</span> — trade only NY H1 (08:00 ET) & Asia H2 (20:00 ET). London H2 dropped — only losing session in backtest.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>② Zones (H1)</span> — mark the recent hourly swing high & swing low. These are the day's reversal zones.</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>③ Tap (M5)</span> — wait for price to tap a zone. Low zone → prep long. High zone → prep short.</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>④ Confirm (M1)</span> — long: bear close → bull close. Short: bull close → bear close.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>⑤ Enter / Target</span> — enter on the confirm close. Take profit at <b>1R</b> (closer target → higher win rate).</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>⑥ Stop</span> — <b>1.5× M1 ATR(14)</b> from entry (survives noise; raw wick stop got chopped).</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>≈2 setups/day. Backtest Apr–May 2026 (NY H1 + Asia H2, 1R/ATR×1.5): ~64% win, +16R, max 3 losses in a row. No tap → no trade.</div>
              </div>
            </div>
          )}
          {activeTab === 'qfb25' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(34,197,94,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#22c55e', marginBottom: 8 }}>Quant False Break — TP 0.25 ATR</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>① Range</span> — mark London first hour, 07:00–07:59 UTC, on M15.</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>② Filter</span> — only trade high ATR regime and range ≥ 0.8× ATR.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SHORT</span> close above range high + 0.05 ATR → fade back inside.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>LONG</span> close below range low - 0.05 ATR → fade back inside.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>TP</span> 0.25 ATR · <span style={{ color: '#ef4444', fontWeight: 600 }}>SL</span> 2.6 ATR · max hold idea 1 hour · max 2/day.</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Quant-preferred variant: lower win rate than 0.15, but better payoff and profit factor in validation.</div>
              </div>
            </div>
          )}
          {activeTab === 'qfb15' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(251,191,36,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: 8 }}>Quant False Break — High Win TP 0.15 ATR</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>① Range</span> — same 07:00–07:59 UTC London first-hour range.</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>② Filter</span> — high ATR only, with hard cap of 2 trades/day.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SHORT</span> failed break above range high + 0.05 ATR.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>LONG</span> failed break below range low - 0.05 ATR.</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>TP</span> 0.15 ATR · <span style={{ color: '#ef4444', fontWeight: 600 }}>SL</span> 2.6 ATR · high hit-rate profile.</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Use as a monitor, not the preferred live candidate: risk-normalized validation was weaker.</div>
              </div>
            </div>
          )}
          {activeTab === 'p3' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(251,191,36,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: 8 }}>Power of Three — Multi-Session Liquidity (XAUUSD)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>① Asia (19:00–04:00 ET)</span> — accumulates liquidity. Mark the session high & low — this is the day&apos;s reference range.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>② London (03:00–09:30 ET)</span> — manipulates by sweeping ONE side of Asia&apos;s range (highs or lows, not both). Watch which it takes.</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>③ New York (09:30 ET)</span> — opens with a FAKE continuation of London&apos;s move, then reverses to the untapped side.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>Scenario 1 · London took lows</span> — NY fakes lower → go LONG, target the untouched Asia <b>highs</b>.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>Scenario 2 · London took highs</span> — NY fakes higher → go SHORT, target the untouched Asia <b>lows</b>.</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>Entry / Stop</span> — enter on M1 reversal confirm after the fake. Stop beyond the NY fake extreme. Target = opposite (untapped) Asia side.</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>The trend is the reversal back to untapped liquidity — NOT London&apos;s direction. HTF (H1/H4) to map Asia & London; M5/M1 for NY entry.</div>
              </div>
            </div>
          )}
          {activeTab === 'zones' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(34,197,94,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#22c55e', marginBottom: 8 }}>Zone Ping-Pong — MTF Playbook</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>① Trend (4H→2H→1H)</span> — 2/3 TFs agree = bias. Only trade in that direction at zones.</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>② Zones</span> — 2+ swing points from H4/H2/H1 stacked = valid zone. More touches = stronger.</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>③ Wait for price</span> — do nothing until price enters the zone. Bias flips automatically.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>LONG</span> at buy zone → bullish engulf / morning star / FVG inversion on M30/M15</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SHORT</span> at sell zone → bearish engulf / evening star / FVG inversion on M30/M15</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>Stop</span> beyond zone extreme + ATR buffer · TP = opposite zone (ping-pong)</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Hard for beginners — must read candles honestly, not just tap a level.</div>
              </div>
            </div>
          )}
          {activeTab === 'p1' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(167,139,250,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', marginBottom: 8 }}>P1 Model — Three-Layer Rules</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>L1 · M15 FVG</span> — sets directional bias. Bullish FVG = longs only, bearish = shorts only</div>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>L2 · M5 Sweep</span> — price sweeps a recent swing H/L, grabbing stops before reversing</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>L3 · M1 Entry</span> — first M1 close in bias direction after sweep = entry candle</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>Stop</span> below sweep low (longs) / above sweep high (shorts) + 0.5 pt buffer</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>All 3 layers must align — no partial setups. TP1=1R · TP2=2R · TP3=3R</div>
              </div>
            </div>
          )}
          {activeTab === 'or15' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(249,115,22,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f97316', marginBottom: 8 }}>OR 15-Min Rules (9:30 AM EST, M1)</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>①</span> Mark first 15-min candle (9:30–9:45 AM EST) Hi/Lo = OR</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>BULL</span> Body close above OR Hi → bias bullish for the day</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>BEAR</span> Body close below OR Lo → bias bearish for the day</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>②</span> Drop to M1 — wait for price to retest OR boundary</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>③</span> Rejection candle at boundary → enter limit at OR level</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>SL = 25 pts fixed · TP1 = 50 pts (1:2) · TP2 = 75 pts (1:3)</div>
              </div>
            </div>
          )}

          {activeTab === 'fiji' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(167,139,250,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', marginBottom: 8 }}>Fiji Entry Model — OR Sweep + IFVG Reversal</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>① Opening Range</span> — mark bottom &amp; top wick of first 2 hrs of Asia futures (8–10 AM AEDT). These wicks = OR Low &amp; OR High.</div>
                <div><span style={{ color: '#06b6d4', fontWeight: 600 }}>② Sweep (30s/1m/3m)</span> — wait for a wick sweep of OR High or OR Low. No sweep → no trade.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>③ Confluence (HTF)</span> — confirm you&apos;re trading into: internal swing high/low · 15m FVG · 4H FVG. All 3 should stack.</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>④ Mark IFVG</span> — after the sweep, mark the bullish inverse FVG that forms. This is your trigger zone.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>⑤ Entry</span> — wait for V-shape reversal. Enter SHORT when price flips and closes below the IFVG.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>Stop</span> — above the FVG (or above sweep high), sized to your risk tolerance.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>Target</span> — OR Low (for short after high sweep). Mirror for longs off low sweep.</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>Same logic in London &amp; NY — adjust OR window to each session open. 10 months data: 66.5% win · 4.1R avg.</div>
              </div>
            </div>
          )}
          {activeTab === 'mygold' && !showSettings && (
            <div style={{ borderBottom: '1px solid #1f2937', padding: '12px 16px', flexShrink: 0, background: 'rgba(251,191,36,.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: 8 }}>MY GOLD — Zone Mapping + BOS + FVG Entry</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><span style={{ color: '#fbbf24', fontWeight: 600 }}>① Zone Map (D/H4/H1)</span> — mark swing highs (supply) and lows (demand) on Daily, 4H, 1H using wick extremes only.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>② Liquidity Sweep (H4)</span> — price hunts an old high or low with a wick then closes back inside. Setup starts here.</div>
                <div><span style={{ color: '#f97316', fontWeight: 600 }}>③ BOS on M5</span> — wait for a candle to break AND close past the most recent swing high (bull) or low (bear). Wick only = no entry.</div>
                <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>④ Fair Value Gap</span> — 3-candle imbalance in the impulse leg where C1 and C3 ranges don&apos;t overlap C2. That gap = your entry zone.</div>
                <div><span style={{ color: '#22c55e', fontWeight: 600 }}>⑤ Wait for Retrace</span> — do NOT chase the impulse. Set limit at FVG start or 50% EQ and wait for price to return to the gap.</div>
                <div><span style={{ color: '#ef4444', fontWeight: 600 }}>SL</span> beyond FVG candle high/low · <span style={{ color: '#22c55e', fontWeight: 600 }}>TP</span> next liquidity pool (opposite zone or untested FVG)</div>
                <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>If price doesn&apos;t return to the FVG — there is no trade. Move on. Score 6/8 checklist to qualify.</div>
              </div>
            </div>
          )}

          {/* Levels + Signals — scrollable together after rules */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Levels */}
          <div style={{ borderBottom: '1px solid #1f2937', padding: 16, flexShrink: 0 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 12 }}>
              {activeTab === 'vp' ? 'VP Levels' : activeTab === 'fcv' ? 'First Candle' : activeTab === 'eightam' ? '8AM NY Optimised' : activeTab === 'lndb' ? 'London Session' : activeTab === 'lndb2' ? 'London Session' : activeTab === 'compare' ? 'LNDB Levels' : activeTab === 'lq' ? 'Prev Day' : activeTab === 'orb' ? 'ORB Range' : activeTab === 'daily3' ? 'Daily Levels' : activeTab === 'sweep' ? 'Daily Levels' : activeTab === 'asiafib' ? 'Asia Fib' : activeTab === 'nwc' ? 'Structure' : activeTab === 'comp' ? 'Structure' : activeTab === 'nwcbo' ? 'S/R Zones' : activeTab === 'or15' ? 'OR Range' : activeTab === 'p1' ? 'M15 FVG Bias' : activeTab === 'flow' ? 'HTF FVG (M30)' : activeTab === 'lkz' ? 'London KZ (M5)' : activeTab === 'gold' ? 'Gold Signal Map' : activeTab === 'dxycorr' ? 'DXY Push + Mismatch' : activeTab === 'zones' ? 'MTF Zones (H4/H2/H1)' : activeTab === 'cont' ? 'LDCM Levels' : activeTab === 'qfb25' || activeTab === 'qfb15' ? 'Quant False Break' : activeTab === 'fiji' ? 'Fiji OR + IFVG' : activeTab === 'mygold' ? 'Zone Map + FVG' : 'Fib Levels'}
            </div>
            {levelRows.length > 0 ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {levelRows.map(row => (
                    <div key={`${row.label}-${row.value}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#6b7280', width: 60, flexShrink: 0 }}>{row.label}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono,monospace)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: row.color }}>{fmt(row.value)}</span>
                    </div>
                  ))}
                </div>
                {livePrice && vsHigh && vsLow && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[{ label: highLabel, ref: vsHigh }, { label: lowLabel, ref: vsLow }].map(r => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#6b7280' }}>{r.label}</span>
                        <span style={{ fontFamily: 'var(--font-mono,monospace)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: livePrice > r.ref ? '#22c55e' : '#ef4444' }}>
                          {livePrice > r.ref ? '+' : ''}{fmt(livePrice - r.ref)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#6b7280' }}>{errMsg || ((activeTab === 'lndb') ? (lndbLevels ? 'Waiting for London breakout…' : `Waiting for ${lndbStart}–${lndbEnd} AM CT session…`) : (activeTab === 'lndb2') ? (lndbLevels ? 'Waiting for confirmed breakout…' : `Waiting for ${lndbStart}–${lndbEnd} AM CT session…`) : (activeTab === 'compare') ? 'Waiting for LNDB setups…' : activeTab === 'eightam' ? (eightAmData?.invalidation ?? 'Waiting for 8AM NY data…') : activeTab === 'orb' ? 'Waiting for 9:30 AM NY…' : activeTab === 'daily3' || activeTab === 'sweep' ? 'No daily candles' : activeTab === 'asiafib' ? 'Waiting for 10 AM AEDT…' : activeTab === 'nwc' ? (nwcData?.trend === 'sideways' ? 'No BOS detected on M15' : 'Scanning for NWC retest…') : activeTab === 'comp' ? (compData?.trend === 'sideways' ? 'No trend detected on M15' : 'Waiting for retrace to NWC level…') : activeTab === 'nwcbo' ? 'No S/R zones on M30' : activeTab === 'or15' ? 'Waiting for 9:30 AM EST…' : activeTab === 'p1' ? (p1Data?.bias === 'neutral' ? 'No unfilled M15 FVG — no bias' : 'Waiting for M5 sweep…') : activeTab === 'flow' ? (flowData?.bias === 'neutral' ? 'No unfilled M30 FVG — no HTF bias' : flowData?.swept ? 'Awaiting 13 EMA break in window…' : 'Awaiting M5 liquidity sweep…') : activeTab === 'lkz' ? (!lkzData?.asianHigh ? 'Building Asian range…' : !lkzData?.inWindow && lkzData?.signals.length === 0 ? 'Outside London KZ (2:00–5:00 EST)' : !lkzData?.sweepType ? 'Awaiting Asian sweep in KZ…' : 'Sweep done — awaiting displacement FVG + CE retest…') : activeTab === 'gold' ? (goldData?.invalidation ?? 'Waiting for Gold Signal data…') : activeTab === 'dxycorr' ? (dxyCorrData?.invalidation ?? 'Scanning DXY vs Gold…') : activeTab === 'zones' ? (zonesData?.invalidation ?? 'Building MTF zones…') : activeTab === 'cont' ? (ldcmData?.invalidation ?? 'Building LDCM…') : activeTab === 'sgr' ? (sgrData?.invalidation ?? 'Building session zones…') : activeTab === 'qfb25' ? (qfb25Data?.invalidation ?? 'Building quant false-break range…') : activeTab === 'qfb15' ? (qfb15Data?.invalidation ?? 'Building high-win false-break range…') : activeTab === 'p3' ? (p3Data?.invalidation ?? 'Building Asia range…') : activeTab === 'fiji' ? (fijiData?.invalidation ?? 'Waiting for 8 AM AEDT…') : activeTab === 'mygold' ? (myGoldData?.invalidation ?? 'Building zone map…') : 'Computing fib levels…')}</div>
            )}
          </div>

          {/* Signal Log / LQ Zone List / Compare View */}
          <div style={{ padding: 16 }}>
            {activeTab === 'compare' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280' }}>Per-Direction Comparison</div>
                {(['CONT', 'TRAP'] as const).map(dir => {
                  const label    = dir === 'CONT' ? 'LONG' : 'SHORT'
                  const col      = dir === 'CONT' ? '#22c55e' : '#ef4444'
                  const lndbSig  = lndbSignals.find(s => s.type === dir)
                  const lndb2Sig = lndb2Signals.find(s => s.type === dir)
                  const confirmed = lndbSig && lndb2Sig
                  const filtered  = lndbSig && !lndb2Sig
                  return (
                    <div key={dir} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${dir==='CONT' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`, background: dir==='CONT' ? 'rgba(34,197,94,.03)' : 'rgba(239,68,68,.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{dir==='CONT' ? '▲' : '▼'} {label}</span>
                        {confirmed && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,.15)', color: '#22c55e', fontWeight: 700 }}>CONFIRMED</span>}
                        {filtered  && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.15)', color: '#ef4444', fontWeight: 700 }}>FILTERED</span>}
                        {!lndbSig  && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#1f2937', color: '#4b5563', fontWeight: 700 }}>NO SIGNAL</span>}
                      </div>
                      {/* Asia AORS */}
                      {lndbSig ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, background: '#0d1117', border: '1px solid rgba(251,191,36,.2)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24' }}>LNDB</span>
                            <span style={{ fontSize: 10, color: '#4b5563' }}>{cTime(lndbSig.time)} CT</span>
                          </div>
                          {[
                            { l: 'Entry', v: fmt(lndbSig.entryPrice), c: '#fbbf24' },
                            { l: 'Stop',  v: fmt(lndbSig.stopPrice),  c: '#ef4444' },
                            { l: 'TP',    v: lndbSig.targetPrice ? fmt(lndbSig.targetPrice) : '—', c: '#22c55e' },
                            { l: 'Risk',  v: `${fmt(Math.abs(lndbSig.entryPrice - lndbSig.stopPrice))} pts`, c: '#6b7280' },
                          ].map(r => (
                            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ color: '#4b5563' }}>{r.l}</span>
                              <span style={{ fontWeight: 600, color: r.c }}>{r.v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '8px', borderRadius: 8, background: '#0d1117', border: '1px solid #1f2937', fontSize: 11, color: '#374151', textAlign: 'center' }}>No Asia signal</div>
                      )}
                      {/* London AORS */}
                      {lndb2Sig ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, background: '#0d1117', border: '1px solid rgba(6,182,212,.25)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#06b6d4' }}>LNDB2</span>
                            <span style={{ fontSize: 10, color: '#4b5563' }}>{cTime(lndb2Sig.time)} CT</span>
                          </div>
                          {[
                            { l: 'Entry', v: fmt(lndb2Sig.entryPrice), c: '#fbbf24' },
                            { l: 'Stop',  v: fmt(lndb2Sig.stopPrice),  c: '#ef4444' },
                            { l: 'TP',    v: lndb2Sig.targetPrice ? fmt(lndb2Sig.targetPrice) : '—', c: '#22c55e' },
                            { l: 'Risk',  v: `${fmt(Math.abs(lndb2Sig.entryPrice - lndb2Sig.stopPrice))} pts`, c: '#6b7280' },
                          ].map(r => (
                            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ color: '#4b5563' }}>{r.l}</span>
                              <span style={{ fontWeight: 600, color: r.c }}>{r.v}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
                {!lndbSignals.length && !lndb2Signals.length && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#374151' }}>
                    <Minus size={20} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
                    <div style={{ fontSize: 12 }}>Waiting for LNDB setups</div>
                  </div>
                )}
              </div>
            ) : activeTab === 'lq' && lqData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* FVGs */}
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 8 }}>
                    Fair Value Gaps <span style={{ color: '#fbbf24' }}>({lqData.fvgs.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[...lqData.fvgs].reverse().slice(0, 14).map((g, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, background: g.filled ? '#0d1117' : g.type==='bullish' ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)', border: `1px solid ${g.filled ? '#1f2937' : g.type==='bullish' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`, opacity: g.filled ? 0.5 : 1 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: g.type==='bullish'?'#22c55e':'#ef4444', flexShrink: 0 }}>{g.type==='bullish'?'↑':'↓'}</span>
                        <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                          <div style={{ color: g.type==='bullish'?'#22c55e':'#ef4444' }}>{fmt(g.top)} – {fmt(g.bottom)}</div>
                          <div style={{ color: '#4b5563' }}>{fmt(g.top - g.bottom)} pts · {cTime(g.time)} CT</div>
                        </div>
                        {g.filled && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#1f2937', color: '#4b5563', fontWeight: 600, flexShrink: 0 }}>FILLED</span>}
                      </div>
                    ))}
                    {lqData.fvgs.length === 0 && <div style={{ fontSize: 11, color: '#374151' }}>No FVGs detected</div>}
                  </div>
                </div>
                {/* Liquidity zones */}
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 8 }}>
                    Liquidity Zones <span style={{ color: '#fbbf24' }}>({lqData.liquidity.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[...lqData.liquidity].sort((a, b) => b.level - a.level).map((z, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, background: z.swept ? '#0d1117' : z.type==='BSL' ? 'rgba(59,130,246,.06)' : 'rgba(168,85,247,.06)', border: `1px solid ${z.swept ? '#1f2937' : z.type==='BSL' ? 'rgba(59,130,246,.2)' : 'rgba(168,85,247,.2)'}`, opacity: z.swept ? 0.45 : 1 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: z.type==='BSL'?'#3b82f6':'#a855f7' }}>{z.type}</span>
                          {z.strength >= 2 && <span style={{ fontSize: 8, color: '#4b5563' }}>×{z.strength}</span>}
                        </div>
                        <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: z.swept ? '#4b5563' : z.type==='BSL'?'#3b82f6':'#a855f7' }}>
                          {fmt(z.level)}
                        </div>
                        {z.swept && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#1f2937', color: '#4b5563', fontWeight: 600, flexShrink: 0 }}>SWEPT</span>}
                      </div>
                    ))}
                    {lqData.liquidity.length === 0 && <div style={{ fontSize: 11, color: '#374151' }}>No liquidity zones found</div>}
                  </div>
                </div>
                {/* LQ Signals */}
                {lqData.signals.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 8 }}>
                      Breakout Signals <span style={{ color: '#fbbf24' }}>({lqData.signals.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[...lqData.signals].reverse().slice(0, 8).map((sig, i) => (
                        <SignalCard key={`${sig.time}-${i}`} signal={sig} index={i} onLog={() => handleLog(sig)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280' }}>
                Signals {activeSignals.length > 0 && <span style={{ color: '#fbbf24' }}>({activeSignals.length})</span>}
              </span>
              <span style={{ fontSize: 9, color: (activeTab==='lndb'||activeTab==='lndb2')?'#06b6d4':'#374151', background: '#111827', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                {activeTab.toUpperCase()}
              </span>
            </div>
            {activeSignals.length === 0 ? (
              activeTab === 'orb' && orbData && orbData.orbBars > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(249,115,22,.2)', background: 'rgba(249,115,22,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} className="animate-pulse" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316' }}>PREPARE — Watching ORB</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp size={11} color="#22c55e" />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Break above →</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 13, fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{fmt(orbData.orbHigh)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingDown size={11} color="#ef4444" />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Break below →</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 13, fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(orbData.orbLow)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#4b5563', textAlign: 'center', paddingTop: 4 }}>Wait for retest of broken level — enter on rejection</div>
                </div>
              ) : activeTab === 'nwcbo' && nwcBoData && nwcBoData.srZones.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(6,182,212,.2)', background: 'rgba(6,182,212,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#06b6d4', flexShrink: 0 }} className="animate-pulse" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4' }}>WATCHING — {nwcBoData.srZones.length} zone{nwcBoData.srZones.length !== 1 ? 's' : ''} marked</span>
                  </div>
                  {[...nwcBoData.srZones].sort((a, b) => b.level - a.level).slice(0, 4).map((z, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: z.type === 'resistance' ? 'rgba(239,68,68,.07)' : 'rgba(34,197,94,.07)', border: `1px solid ${z.type === 'resistance' ? 'rgba(239,68,68,.2)' : 'rgba(34,197,94,.2)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {z.type === 'resistance' ? <TrendingDown size={11} color="#ef4444" /> : <TrendingUp size={11} color="#22c55e" />}
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{z.type === 'resistance' ? 'Resistance' : 'Support'} ×{z.touches}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 12, fontWeight: 700, color: z.type === 'resistance' ? '#ef4444' : '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{fmt(z.level)}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#4b5563', textAlign: 'center' }}>Wait for body close + NWC confirm → retest entry</div>
                </div>
              ) : activeTab === 'nwc' && nwcData && nwcData.noWickCandles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(167,139,250,.2)', background: 'rgba(167,139,250,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} className="animate-pulse" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>WATCHING — {nwcData.noWickCandles.length} NWC marked</span>
                  </div>
                  {nwcData.noWickCandles.slice(-3).reverse().map((nwc, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: nwc.direction === 'bull' ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.07)', border: `1px solid ${nwc.direction === 'bull' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {nwc.direction === 'bull' ? <TrendingUp size={11} color="#22c55e" /> : <TrendingDown size={11} color="#ef4444" />}
                        <span style={{ fontSize: 11, color: '#6b7280' }}>Retest {nwc.direction === 'bull' ? 'support' : 'resistance'}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 12, fontWeight: 700, color: nwc.direction === 'bull' ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(nwc.open)}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#4b5563', textAlign: 'center' }}>Price must retest the candle body — enter on M15 rejection</div>
                </div>
              ) : activeTab === 'comp' && compData && compData.noWickCandles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(167,139,250,.2)', background: 'rgba(167,139,250,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} className="animate-pulse" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>WATCHING — {compData.noWickCandles.filter(n => n.validForTrend).length} trend NWC marked</span>
                  </div>
                  {compData.noWickCandles.filter(n => n.validForTrend).slice(-3).reverse().map((nwc, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: nwc.direction === 'bull' ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.07)', border: `1px solid ${nwc.direction === 'bull' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {nwc.direction === 'bull' ? <TrendingUp size={11} color="#22c55e" /> : <TrendingDown size={11} color="#ef4444" />}
                        <span style={{ fontSize: 11, color: '#6b7280' }}>Retrace → {nwc.direction === 'bull' ? 'buy' : 'sell'} level</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 12, fontWeight: 700, color: nwc.direction === 'bull' ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(nwc.open)}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#4b5563', textAlign: 'center' }}>Enter with trend on retrace · stop most recent low/high · TP 1:1</div>
                </div>
              ) : activeTab === 'gold' && goldData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: `1px solid ${goldScore >= 6 ? 'rgba(34,197,94,.2)' : 'rgba(251,191,36,.2)'}`, background: goldScore >= 6 ? 'rgba(34,197,94,.06)' : 'rgba(251,191,36,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: goldScoreColor, flexShrink: 0 }} className="animate-pulse" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: goldScoreColor }}>{goldScore >= 6 ? 'READY — Waiting for entry candle' : `WAIT — Score ${goldScore}/10`}</span>
                  </div>
                  {[
                    { l: 'H4 bias', v: goldData.bias === 'neutral' ? 'not clear' : goldData.bias.toUpperCase(), ok: goldData.bias !== 'neutral' },
                    { l: 'D1 bonus', v: goldData.d1Trend === goldData.bias && goldData.bias !== 'neutral' ? 'aligned' : 'optional', ok: goldData.d1Trend === goldData.bias && goldData.bias !== 'neutral' },
                    { l: 'DXY inverse', v: goldData.dxyState, ok: goldData.dxyState === 'confirms' || goldData.dxyState === 'neutral' },
                    { l: 'Session window', v: goldData.session, ok: goldData.sessionActive },
                    { l: 'Asia sweep', v: goldData.sweepType ? goldData.sweepType.toUpperCase() : 'pending', ok: Boolean(goldData.sweepType) },
                    { l: 'M15 BOS + EMA', v: goldData.scoreReasons.some(r => r.includes('M15')) ? 'confirmed' : 'pending', ok: goldData.scoreReasons.some(r => r.includes('M15')) },
                    { l: 'Macro filters', v: `${macroDollar}/${macroYields}`, ok: goldMacroScore > 0 },
                  ].map(row => (
                    <div key={row.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: row.ok ? 'rgba(34,197,94,.06)' : '#0d1117', border: `1px solid ${row.ok ? 'rgba(34,197,94,.18)' : '#1f2937'}` }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{row.l}</span>
                      <span style={{ fontSize: 10, color: row.ok ? '#22c55e' : '#4b5563', fontWeight: 700, textTransform: 'uppercase' }}>{row.v}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#4b5563', lineHeight: 1.5, textAlign: 'center' }}>{goldData.invalidation}</div>
                </div>
              ) : activeTab === 'dxycorr' && dxyCorrData && dxyCorrData.dxyPushDir ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: `1px solid ${dxyCorrData.status === 'signal_ready' ? 'rgba(34,197,94,.2)' : 'rgba(6,182,212,.2)'}`, background: dxyCorrData.status === 'signal_ready' ? 'rgba(34,197,94,.06)' : 'rgba(6,182,212,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: dxyCorrData.status === 'signal_ready' ? '#22c55e' : '#06b6d4', flexShrink: 0 }} className={dxyCorrData.status !== 'no_setup' ? 'animate-pulse' : ''} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: dxyCorrData.status === 'signal_ready' ? '#22c55e' : '#06b6d4' }}>
                      {dxyCorrData.status === 'signal_ready' ? 'SIGNAL — Catch-up entry confirmed' :
                       dxyCorrData.status === 'pullback_detected' ? 'PULLBACK — Waiting for gold confirmation' :
                       dxyCorrData.status === 'mismatch_found' ? 'MISMATCH — Waiting for DXY pullback' :
                       dxyCorrData.status === 'no_setup' ? 'NO SETUP — Gold tracked DXY adequately' :
                       'SCANNING…'}
                    </span>
                  </div>
                  {[
                    { l: 'DXY push',         v: dxyCorrData.dxyPushDir ? `${dxyCorrData.dxyPushDir.toUpperCase()} ${fmt(dxyCorrData.dxyPushMag ?? 0, 3)} pts (${fmt(dxyCorrData.dxyPushPct ?? 0, 3)}%)` : 'pending', ok: Boolean(dxyCorrData.dxyPushDir) },
                    { l: 'Gold lag',          v: dxyCorrData.mismatchSeverity !== 'none' && dxyCorrData.mismatchSeverity !== 'weak' ? `${dxyCorrData.mismatchSeverity.toUpperCase()} — ${(dxyCorrData.mismatchRatio! * 100).toFixed(0)}% lag` : 'insufficient', ok: dxyCorrData.mismatchSeverity === 'strong' || dxyCorrData.mismatchSeverity === 'moderate' },
                    { l: 'DXY pullback',      v: dxyCorrData.dxyPullbackDetected ? `✓ ${fmt(dxyCorrData.dxyPullbackPct ?? 0, 0)}% retraced` : `${fmt(dxyCorrData.dxyPullbackPct ?? 0, 0)}% / need 25%`, ok: dxyCorrData.dxyPullbackDetected },
                    { l: 'Gold confirmation', v: dxyCorrData.signals.length > 0 ? `M15 close ${dxyCorrData.goldExpectedDir === 'up' ? '↑' : '↓'} confirmed` : 'pending', ok: dxyCorrData.signals.length > 0 },
                  ].map(row => (
                    <div key={row.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: row.ok ? 'rgba(34,197,94,.06)' : '#0d1117', border: `1px solid ${row.ok ? 'rgba(34,197,94,.18)' : '#1f2937'}` }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{row.l}</span>
                      <span style={{ fontSize: 10, color: row.ok ? '#22c55e' : '#4b5563', fontWeight: 700 }}>{row.v}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#4b5563', lineHeight: 1.5, textAlign: 'center' }}>{dxyCorrData.invalidation}</div>
                </div>
              ) : activeTab === 'or15' && or15Data && or15Data.orBars > 0 && or15Data.direction !== 'neutral' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(249,115,22,.2)', background: 'rgba(249,115,22,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} className="animate-pulse" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316' }}>
                      {or15Data.direction === 'bullish' ? '▲ BULLISH — Waiting for retest' : '▼ BEARISH — Waiting for retest'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: or15Data.direction === 'bullish' ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.07)', border: `1px solid ${or15Data.direction === 'bullish' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {or15Data.direction === 'bullish' ? <TrendingUp size={11} color="#22c55e" /> : <TrendingDown size={11} color="#ef4444" />}
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{or15Data.direction === 'bullish' ? 'Limit buy at OR Hi →' : 'Limit sell at OR Lo →'}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 13, fontWeight: 700, color: or15Data.direction === 'bullish' ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(or15Data.direction === 'bullish' ? or15Data.orHigh : or15Data.orLow)}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: '#4b5563', textAlign: 'center' }}>Wait for rejection candle at OR boundary · SL 25 · TP1 50 · TP2 75</div>
                </div>
              ) : activeTab === 'or15' && or15Data && or15Data.orBars > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(249,115,22,.2)', background: 'rgba(249,115,22,.06)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} className="animate-pulse" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316' }}>OR FORMED — Waiting for direction break</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp size={11} color="#22c55e" />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Body close above →</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 13, fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{fmt(or15Data.orHigh)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingDown size={11} color="#ef4444" />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Body close below →</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 13, fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(or15Data.orLow)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#4b5563', textAlign: 'center' }}>Body close outside OR sets direction → then wait for retest</div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#374151' }}>
                  <Minus size={20} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
                  <div style={{ fontSize: 12 }}>{activeTab === 'nwc' ? (nwcData?.trend === 'sideways' ? 'No clear trend on M15' : 'No no-wick candles found') : activeTab === 'comp' ? (compData?.trend === 'sideways' ? 'No clear trend on M15' : 'No trend no-wick candles found') : activeTab === 'nwcbo' ? 'No S/R zones detected on M30' : activeTab === 'or15' ? 'Waiting for 9:30 AM EST opening range' : 'No signals yet'}</div>
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...activeSignals].reverse().map((sig, i) => <SignalCard key={`${sig.time}-${i}`} signal={sig} index={i} onLog={() => handleLog(sig)} />)}
              </div>
            )}
            </>)}
          </div>
          </div>{/* end scrollable wrapper */}

          {/* Footer */}
          <div style={{ borderTop: '1px solid #1f2937', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#374151' }}>{lastUpdate ? `Updated ${lastUpdate}` : 'Fetching…'}</span>
            <span style={{ fontSize: 10, color: '#374151', fontFamily: 'var(--font-mono,monospace)' }}>OANDA · Practice</span>
          </div>
        </aside>
      </div>

      {/* Journal overlay */}
      {journalOpen && (
        <JournalPanel
          entries={journalEntries}
          onChange={setJournalEntries}
          onClose={() => setJournalOpen(false)}
        />
      )}
    </div>
  )
}
