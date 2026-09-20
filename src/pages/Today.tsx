import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Video,
  Sparkles,
  Mail,
  AlertCircle,
  ArrowRight,
  Megaphone,
  CalendarDays,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  MessageSquare,
  ExternalLink,
  Target,
  Clock,
  Layers,
  ArrowUpRight,
  Zap,
} from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { ChatPanel } from '@/components/ChatPanel'
import { GenieInsight } from '@/components/GenieInsight'
import { EmptyState } from '@/components/EmptyState'
import { KpiCard } from '@/components/KpiCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnections } from '@/hooks/use-connections'
import { isAutomatedEmail } from '@/lib/text'
import { formatCurrency, getRoasColor, computeTrend } from '@/lib/dashboard-utils'
import pb from '@/lib/pocketbase/client'

interface TodayEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  attendees: string[]
  when_local: string
  meet_link: string
  html_link: string
  location?: string
}

interface ReplyEmail {
  id: string
  from_email: string
  subject: string
  snippet: string
  date: string
  is_unread: boolean
}

interface TodayCampaign {
  id: string
  name: string
  status: string
  spend: number
  impressions: number
  conversions: number
  roas: number
  cpc: number
  ctr: number
  objective?: string
}

interface DailyMetricRecord {
  date: string
  spend: number
  conversions: number
  ctr: number
  impressions: number
  clicks: number
  purchase_roas: number
}

function senderName(from: string): string {
  const m = from.match(/^"?([^"<]+)"?\s*</)
  return (m ? m[1] : from.split('@')[0]).trim()
}

export default function Today() {
  const [chatOpen, setChatOpen] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [events, setEvents] = useState<TodayEvent[]>([])
  const [replyEmails, setReplyEmails] = useState<ReplyEmail[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [campaigns, setCampaigns] = useState<TodayCampaign[]>([])
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetricRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done'>('idle')
  const [periodDays, setPeriodDays] = useState<7 | 30>(7)
  const connections = useConnections()

  const loadAll = async () => {
    try {
      const [eventRecords, mailRecords, metricRecords, campRecords] = await Promise.all([
        pb
          .collection('calendar_events')
          .getFullList({ sort: 'start_time' })
          .catch(() => []),
        pb
          .collection('gmail_messages')
          .getFullList({ sort: '-date', perPage: 50 })
          .catch(() => []),
        pb
          .collection('daily_metrics')
          .getFullList({ sort: 'date', perPage: 500 })
          .catch(() => []),
        pb
          .collection('campaigns')
          .getFullList({ sort: '-spend' })
          .catch(() => []),
      ])

      setEvents(
        (eventRecords as any[]).map((r) => ({
          id: r.id,
          title: r.title || '(Sem título)',
          start_time: r.start_time,
          end_time: r.end_time,
          location: r.location || '',
          attendees: (r.attendees || '')
            .split(',')
            .map((a: string) => a.trim())
            .filter(Boolean),
          when_local: r.when_local || '',
          meet_link: r.meet_link || '',
          html_link: r.html_link || '',
        })),
      )

      const mails = mailRecords as any[]
      setUnreadCount(mails.filter((m) => m.is_unread).length)
      setReplyEmails(
        mails
          .filter((m) => m.needs_reply && !isAutomatedEmail(m.from_email || '', m.subject || ''))
          .slice(0, 4)
          .map((m) => ({
            id: m.id,
            from_email: m.from_email || '',
            subject: m.subject || '(Sem assunto)',
            snippet: m.snippet || '',
            date: m.date,
            is_unread: !!m.is_unread,
          })),
      )

      setDailyMetrics(
        (metricRecords as any[]).map((m) => ({
          date: ((m.date || '') as string).split(' ')[0],
          spend: Number(m.spend || 0),
          conversions: Number(m.conversions || 0),
          ctr: Number(m.ctr || 0),
          impressions: Number(m.impressions || 0),
          clicks: Number(m.clicks || 0),
          purchase_roas: Number(m.purchase_roas || m.roas || 0),
        })),
      )

      setCampaigns(
        (campRecords as any[]).map((c) => ({
          id: c.id,
          name: c.name || 'Campanha',
          status: c.status || 'draft',
          spend: Number(c.spend || 0),
          impressions: Number(c.impressions || 0),
          conversions: Number(c.conversions || 0),
          roas: Number(c.roas || c.purchase_roas || 0),
          cpc: Number(c.cpc || 0),
          ctr: Number(c.ctr || 0),
          objective: c.objective || '',
        })),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Auto-sync do Google ao entrar (no máx. 1x a cada 10 min por sessão):
  // quem abre de manhã já encontra emails e agenda atualizados.
  useEffect(() => {
    if (connections.loading || !connections.googleConnected) return
    const last = Number(sessionStorage.getItem('hub_auto_sync') || 0)
    if (Date.now() - last < 10 * 60 * 1000) return
    sessionStorage.setItem('hub_auto_sync', String(Date.now()))
    setSyncState('syncing')
    fetch(pb.baseUrl + '/backend/v1/google/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token || '' },
      body: JSON.stringify({}),
    })
      .then(() => {
        setSyncState('done')
        loadAll()
        setTimeout(() => setSyncState('idle'), 5000)
      })
      .catch(() => setSyncState('idle'))
  }, [connections.loading, connections.googleConnected])

  const askGenie = (q?: string) => {
    setPendingQuestion(q ?? null)
    setChatOpen(true)
  }

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const user = pb.authStore.record as any
  const userName = user ? user.name || user.email?.split('@')[0] || '' : ''

  // Cálculos de métricas consolidadas com sparklines a partir dos dados reais
  const { kpiCards, totalSpend, totalConversions, avgRoas, activeCampaignCount } = useMemo(() => {
    // Ordena métricas por data
    const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date))
    const uniqueDates = Array.from(new Set(sorted.map((m) => m.date)))

    // Agrupa por data
    const byDate: Record<
      string,
      { spend: number; conversions: number; ctr: number; roas: number; count: number }
    > = {}
    for (const m of sorted) {
      if (!byDate[m.date]) {
        byDate[m.date] = { spend: 0, conversions: 0, ctr: 0, roas: 0, count: 0 }
      }
      byDate[m.date].spend += m.spend
      byDate[m.date].conversions += m.conversions
      byDate[m.date].ctr += m.ctr
      byDate[m.date].roas += m.purchase_roas
      byDate[m.date].count += 1
    }

    const windowDays = periodDays
    const sliceDates = uniqueDates.slice(-windowDays)
    const prevSliceDates = uniqueDates.slice(-windowDays * 2, -windowDays)

    const sumKey = (dates: string[], key: 'spend' | 'conversions') =>
      dates.reduce((acc, d) => acc + (byDate[d]?.[key] || 0), 0)

    const curSpend = sumKey(sliceDates, 'spend')
    const prevSpend = sumKey(prevSliceDates, 'spend')
    const curConv = sumKey(sliceDates, 'conversions')
    const prevConv = sumKey(prevSliceDates, 'conversions')

    const curRoasArr = sliceDates
      .map((d) => (byDate[d]?.count ? byDate[d].roas / byDate[d].count : 0))
      .filter(Boolean)
    const prevRoasArr = prevSliceDates
      .map((d) => (byDate[d]?.count ? byDate[d].roas / byDate[d].count : 0))
      .filter(Boolean)
    const curRoas =
      curRoasArr.length > 0 ? curRoasArr.reduce((a, b) => a + b, 0) / curRoasArr.length : 0
    const prevRoas =
      prevRoasArr.length > 0 ? prevRoasArr.reduce((a, b) => a + b, 0) / prevRoasArr.length : 0

    const curCtrArr = sliceDates.map((d) =>
      byDate[d]?.count ? byDate[d].ctr / byDate[d].count : 0,
    )
    const prevCtrArr = prevSliceDates.map((d) =>
      byDate[d]?.count ? byDate[d].ctr / byDate[d].count : 0,
    )
    const curCtr =
      curCtrArr.length > 0 ? curCtrArr.reduce((a, b) => a + b, 0) / curCtrArr.length : 0
    const prevCtr =
      prevCtrArr.length > 0 ? prevCtrArr.reduce((a, b) => a + b, 0) / prevCtrArr.length : 0

    const spendSpark = sliceDates.map((d) => byDate[d]?.spend || 0)
    const convSpark = sliceDates.map((d) => byDate[d]?.conversions || 0)
    const roasSpark = sliceDates.map((d) =>
      byDate[d]?.count ? byDate[d].roas / byDate[d].count : 0,
    )
    const ctrSpark = sliceDates.map((d) => (byDate[d]?.count ? byDate[d].ctr / byDate[d].count : 0))

    const kpis = [
      {
        label: 'Investimento Meta Ads',
        value: formatCurrency(curSpend),
        ...computeTrend(curSpend, prevSpend),
        sparkline: spendSpark,
      },
      {
        label: 'Conversões',
        value: curConv.toLocaleString('pt-BR'),
        ...computeTrend(curConv, prevConv),
        sparkline: convSpark,
      },
      {
        label: 'ROAS Médio',
        value: curRoas > 0 ? `${curRoas.toFixed(2)}x` : '—',
        ...computeTrend(curRoas, prevRoas),
        sparkline: roasSpark,
      },
      {
        label: 'CTR Médio',
        value: curCtr > 0 ? `${curCtr.toFixed(2)}%` : '—',
        ...computeTrend(curCtr, prevCtr),
        sparkline: ctrSpark,
      },
    ]

    const activeCamps = campaigns.filter((c) => c.status === 'active').length

    return {
      kpiCards: kpis,
      totalSpend: curSpend,
      totalConversions: curConv,
      avgRoas: curRoas,
      activeCampaignCount: activeCamps,
    }
  }, [dailyMetrics, periodDays, campaigns])

  // Próximos eventos (Google Calendar)
  const upcomingEvents = useMemo(() => {
    return events
      .filter((e) => {
        const end = new Date(e.end_time || e.start_time)
        return !isNaN(end.getTime()) && end >= now
      })
      .slice(0, 4)
  }, [events, now])

  const nextEvent = upcomingEvents[0] || events[0] || null

  // Campanhas em destaque: ativas e ordenadas por ROAS / conversões
  const highlightedCampaigns = useMemo(() => {
    return [...campaigns]
      .filter((c) => c.spend > 0)
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 4)
  }, [campaigns])

  // Insights / Alertas inteligentes calculados dos dados reais
  const quickInsights = useMemo(() => {
    const list: {
      type: 'alert' | 'success' | 'info'
      badge: string
      campaignName?: string
      title?: string
      desc: string
      actionLabel?: string
      action?: () => void
    }[] = []

    const topRoas = [...campaigns].sort((a, b) => b.roas - a.roas)[0]
    if (topRoas && topRoas.roas >= 3) {
      list.push({
        type: 'success',
        badge: 'Alta performance',
        campaignName: topRoas.name,
        desc: `ROAS excelente de ${topRoas.roas.toFixed(1)}x com ${topRoas.conversions} conversões. Oportunidade de escalar orçamento.`,
        actionLabel: 'Escalar com Genie',
        action: () =>
          askGenie(
            `Como posso escalar a campanha "${topRoas.name}" mantendo o ROAS de ${topRoas.roas.toFixed(1)}x?`,
          ),
      })
    }

    const lowRoas = campaigns.find((c) => c.status === 'active' && c.spend > 500 && c.roas < 2.5)
    if (lowRoas) {
      list.push({
        type: 'alert',
        badge: 'Atenção',
        campaignName: lowRoas.name,
        desc: `ROAS atual em ${lowRoas.roas.toFixed(2)}x abaixo da meta ideal de 2.5x. Revise criativos ou público de remarketing.`,
        actionLabel: 'Analisar gargalo',
        action: () =>
          askGenie(
            `Analise os criativos e público da campanha "${lowRoas.name}" que está com ROAS ${lowRoas.roas.toFixed(2)}x.`,
          ),
      })
    }

    if (replyEmails.length > 0) {
      list.push({
        type: 'info',
        badge: 'Comunicação',
        title: `${replyEmails.length} e-mails importantes aguardando`,
        desc: `Mensagens de ${replyEmails.map((e) => senderName(e.from_email)).join(', ')} precisam de acompanhamento hoje.`,
        actionLabel: 'Rascunhar respostas',
        action: () =>
          askGenie('Quais emails pendentes eu devo responder primeiro e como posso responder?'),
      })
    }

    if (nextEvent) {
      list.push({
        type: 'info',
        badge: 'Agenda',
        title: `Próximo compromisso: ${nextEvent.title}`,
        desc: `${nextEvent.when_local || new Date(nextEvent.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${nextEvent.attendees.length > 0 ? `· com ${nextEvent.attendees.slice(0, 2).join(', ')}` : ''}`,
        actionLabel: 'Preparar briefing',
        action: () => prepareMeeting(nextEvent),
      })
    }

    return list.slice(0, 3)
  }, [campaigns, replyEmails, nextEvent])

  const prepareMeeting = (ev: TodayEvent) => {
    const attendeesText = ev.attendees.length > 0 ? ev.attendees.join(', ') : 'sem participantes'
    askGenie(
      `Me prepare para a reunião "${ev.title}" (${ev.when_local || 'horário na agenda'}): ` +
        `resuma o contexto que você tiver, e verifique se há emails recentes dos participantes (${attendeesText}) que eu deva ler antes.`,
    )
  }

  const anyConnection =
    connections.metaConnected || connections.googleConnected || campaigns.length > 0

  return (
    <AppShell onChatClick={() => askGenie()}>
      <main className="flex-1 overflow-y-auto">
        {/* Top Header / Saudação com Contexto Vivo */}
        <div className="pt-8 pb-6 px-8 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-zinc-200/60">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-subtle text-brand border border-brand-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  Hub Ativo · Adapta Vídeos & Performance
                </span>
                <p className="text-[12px] text-zinc-400 capitalize">
                  {now.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>

              <h1 className="font-display text-[34px] md:text-[40px] text-zinc-900 leading-none tracking-tight">
                {greeting}
                {userName ? `, ${userName}` : ''} 👋
              </h1>

              <p className="text-[13px] text-zinc-500 mt-2">
                Aqui está o pulso das suas campanhas, agenda e comunicações consolidadas para hoje.
              </p>
            </div>

            {/* Ações / Status e Seletor de Período dos KPIs */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center rounded-xl bg-white border border-card-border p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setPeriodDays(7)}
                  className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-colors ${
                    periodDays === 7
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Últimos 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodDays(30)}
                  className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-colors ${
                    periodDays === 30
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Últimos 30 dias
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  askGenie('Faça um resumo executivo dos números de hoje e o que devo focar.')
                }
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-brand-gradient text-white text-[12px] font-medium hover:brightness-110 shadow-sm transition-all"
              >
                <Sparkles size={13} />
                Pedir Briefing à IA
              </button>

              {syncState === 'syncing' && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 bg-white px-3 py-2 rounded-xl border border-zinc-200">
                  <RefreshCw size={11} className="animate-spin text-brand" />
                  Sincronizando...
                </span>
              )}
            </div>
          </div>

          {/* Barra de Acesso Rápido / Shortcuts */}
          <div className="flex items-center gap-2.5 pt-4 pb-2 overflow-x-auto text-nowrap scrollbar-none">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 mr-1 shrink-0">
              Atalhos rápidos:
            </span>
            <Link
              to="/campaigns"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-card-border text-zinc-700 text-[12px] font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-2xs shrink-0"
            >
              <Megaphone size={12} className="text-brand" />
              Ver Campanhas ({campaigns.length})
            </Link>
            <Link
              to="/emails"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-card-border text-zinc-700 text-[12px] font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-2xs shrink-0"
            >
              <Mail size={12} className="text-amber-500" />
              Responder E-mails{' '}
              {replyEmails.length > 0 && (
                <span className="text-red-500 font-semibold">({replyEmails.length})</span>
              )}
            </Link>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-card-border text-zinc-700 text-[12px] font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-2xs shrink-0"
            >
              <CalendarDays size={12} className="text-emerald-500" />
              Abrir Agenda ({events.length} eventos)
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-card-border text-zinc-700 text-[12px] font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-2xs shrink-0"
            >
              <Layers size={12} className="text-purple-500" />
              Analytics Completo
            </Link>
            <button
              onClick={() => askGenie('Quais são as 3 prioridades do meu dia hoje?')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand-subtle border border-brand-border text-brand text-[12px] font-medium hover:bg-brand-subtle/80 transition-colors shrink-0"
            >
              <MessageSquare size={12} />
              Perguntar ao Genie ✨
            </button>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="px-8 pb-12 max-w-7xl mx-auto space-y-7">
          {loading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="surface rounded-2xl p-5">
                    <Skeleton className="h-3 w-24 mb-3" />
                    <Skeleton className="h-7 w-28 mb-2" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 surface rounded-2xl p-6 h-64" />
                <div className="surface rounded-2xl p-6 h-64" />
              </div>
            </div>
          ) : !anyConnection ? (
            <EmptyState
              metaConnected={connections.metaConnected}
              googleConnected={connections.googleConnected}
            />
          ) : (
            <>
              {/* Resumo do Dia: KPIs Reais com Sparklines e Trends */}
              <section>
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <Zap size={15} className="text-brand" />
                    <h2 className="text-[14px] font-semibold text-zinc-900 tracking-tight">
                      Resumo de Performance ({periodDays}d)
                    </h2>
                    <span className="text-[12px] text-zinc-400">
                      · {activeCampaignCount} campanhas ativas
                    </span>
                  </div>
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    Ver detalhes no Dashboard
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {kpiCards.map((kpi) => (
                    <KpiCard
                      key={kpi.label}
                      label={kpi.label}
                      value={kpi.value}
                      change={kpi.change}
                      trend={kpi.trend}
                      sparkline={kpi.sparkline}
                    />
                  ))}
                </div>
              </section>

              {/* Cards de Destaques e Insights Inteligentes Rápidos */}
              {quickInsights.length > 0 && (
                <section
                  className={`grid gap-4 ${
                    quickInsights.length === 2
                      ? 'grid-cols-1 md:grid-cols-2'
                      : quickInsights.length === 1
                        ? 'grid-cols-1'
                        : 'grid-cols-1 md:grid-cols-3'
                  }`}
                >
                  {quickInsights.map((item, idx) => {
                    const isSuccess = item.type === 'success'
                    const isAlert = item.type === 'alert'

                    const iconWrapClass = isSuccess
                      ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                      : isAlert
                        ? 'text-amber-600 bg-amber-50 border-amber-100'
                        : 'text-brand bg-brand-subtle border-brand-border'

                    const badgeClass = isSuccess
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200/60'
                      : isAlert
                        ? 'text-amber-700 bg-amber-50 border-amber-200/60'
                        : 'text-zinc-600 bg-zinc-100 border-zinc-200/60'

                    return (
                      <div
                        key={idx}
                        className="surface rounded-2xl p-5 hover:shadow-card-hover transition-all flex flex-col justify-between h-full group"
                      >
                        <div>
                          {/* Header do Card: Ícone em pill + Badge de status */}
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border ${iconWrapClass} shrink-0`}
                              >
                                {isAlert && <AlertCircle size={15} />}
                                {isSuccess && <TrendingUp size={15} />}
                                {!isAlert && !isSuccess && <Sparkles size={15} />}
                              </span>
                              <span
                                className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badgeClass}`}
                              >
                                {item.badge}
                              </span>
                            </div>
                            <span className="text-[11px] text-zinc-400 font-medium">
                              Genie Insight
                            </span>
                          </div>

                          {/* Título / Campanha */}
                          <div className="mb-2">
                            {item.campaignName ? (
                              <h4
                                title={item.campaignName}
                                className="text-[13.5px] font-semibold text-zinc-900 leading-snug line-clamp-2"
                              >
                                {item.campaignName}
                              </h4>
                            ) : (
                              <h4
                                title={item.title}
                                className="text-[13.5px] font-semibold text-zinc-900 leading-snug line-clamp-2"
                              >
                                {item.title}
                              </h4>
                            )}
                          </div>

                          {/* Descrição legível e proporcional */}
                          <p className="text-[12.5px] text-zinc-600 leading-relaxed line-clamp-2 mb-4">
                            {item.desc}
                          </p>
                        </div>

                        {/* CTA alinhado no rodapé do card */}
                        {item.actionLabel && (
                          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={item.action}
                              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand group-hover:text-brand-strong transition-colors"
                            >
                              <span>{item.actionLabel}</span>
                              <ArrowRight
                                size={12}
                                className="transition-transform group-hover:translate-x-0.5"
                              />
                            </button>
                            <span className="text-[11px] text-zinc-400">Ação recomendada</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </section>
              )}

              {/* Grid 2 Colunas: Principal (Genie + Campanhas + E-mails) e Lateral (Agenda + Pauta) */}
              <div className="grid lg:grid-cols-3 gap-6 items-start">
                {/* Coluna Esquerda / Principal (2 cols) */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Genie Briefing do Dia */}
                  <GenieInsight
                    prompt={
                      'Faca meu briefing executivo do dia em ate 4 bullets curtos: 1) o status e destaque das campanhas Meta Ads (spend, ROAS e conversões da conta Adapta Vídeos); 2) emails que precisam de resposta (nomes e assuntos); 3) proximos compromissos na agenda; 4) uma recomendacao estrategica de foco pro dia. Sem cumprimentos.'
                    }
                    questions={[
                      'Quais campanhas devo escalar hoje?',
                      'Resuma o que tenho na agenda hoje',
                      'Quais e-mails são prioridade?',
                    ]}
                    onAsk={askGenie}
                  />

                  {/* Campanhas Meta Ads em Destaque */}
                  <div className="surface rounded-2xl overflow-hidden border border-card-border">
                    <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Megaphone size={15} className="text-brand" />
                        <h3 className="text-[13.5px] font-semibold text-zinc-900">
                          Campanhas em Foco
                        </h3>
                        <span className="text-[11px] text-zinc-400">· Meta Ads</span>
                      </div>
                      <Link
                        to="/campaigns"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                      >
                        Gerenciar campanhas
                        <ArrowRight size={12} />
                      </Link>
                    </div>

                    <div className="divide-y divide-zinc-100/80">
                      {highlightedCampaigns.map((camp) => (
                        <Link
                          key={camp.id}
                          to={`/campaign/${camp.id}`}
                          className="flex items-center justify-between p-4 hover:bg-zinc-50/60 transition-colors group"
                        >
                          <div className="min-w-0 flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  camp.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-300'
                                }`}
                              />
                              <h4 className="text-[13px] font-medium text-zinc-900 truncate group-hover:text-brand transition-colors">
                                {camp.name}
                              </h4>
                              {camp.objective && (
                                <span className="text-[10px] uppercase font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded shrink-0">
                                  {camp.objective}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-[12px] text-zinc-500">
                              <span>
                                Investido:{' '}
                                <strong className="text-zinc-800 font-semibold">
                                  {formatCurrency(camp.spend)}
                                </strong>
                              </span>
                              <span>·</span>
                              <span>
                                Conversões:{' '}
                                <strong className="text-zinc-800 font-semibold">
                                  {camp.conversions}
                                </strong>
                              </span>
                              <span>·</span>
                              <span>
                                CTR:{' '}
                                <strong className="text-zinc-800 font-semibold">
                                  {camp.ctr.toFixed(1)}%
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-zinc-400 block uppercase font-medium">
                              ROAS
                            </span>
                            <span
                              className={`text-[15px] font-bold tabular-nums ${getRoasColor(camp.roas)}`}
                            >
                              {camp.roas > 0 ? `${camp.roas.toFixed(2)}x` : '—'}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>

                    <div className="px-5 py-3 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between text-[12px]">
                      <span className="text-zinc-500">
                        Total investido registrado:{' '}
                        <strong className="text-zinc-800 font-semibold">
                          {formatCurrency(campaigns.reduce((acc, c) => acc + c.spend, 0))}
                        </strong>
                      </span>
                      <Link
                        to="/campaigns"
                        className="text-brand font-medium hover:underline inline-flex items-center gap-1"
                      >
                        Ver todas ({campaigns.length})
                        <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  </div>

                  {/* E-mails Recentes que Precisam de Resposta */}
                  <div className="surface rounded-2xl overflow-hidden border border-card-border">
                    <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail size={15} className="text-amber-500" />
                        <h3 className="text-[13.5px] font-semibold text-zinc-900">
                          E-mails aguardando resposta
                        </h3>
                        {unreadCount > 0 && (
                          <span className="text-[11px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                            {unreadCount} não lidos
                          </span>
                        )}
                      </div>
                      <Link
                        to="/emails"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                      >
                        Ir para caixa de entrada
                        <ArrowRight size={12} />
                      </Link>
                    </div>

                    {replyEmails.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-[13px] text-zinc-400">
                          {connections.googleConnected
                            ? '🎉 Caixa de entrada zerada! Nenhum e-mail aguardando resposta.'
                            : 'Conecte o Google Workspace para ler e responder seus e-mails aqui.'}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-100/80">
                        {replyEmails.map((mail) => (
                          <Link
                            key={mail.id}
                            to="/emails"
                            className="flex items-start gap-3.5 p-4 hover:bg-zinc-50/60 transition-colors group"
                          >
                            <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md shrink-0 mt-0.5">
                              <AlertCircle size={10} /> Responder
                            </span>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[13px] font-semibold text-zinc-900 truncate">
                                  {senderName(mail.from_email)}
                                </span>
                                <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                                  {mail.date
                                    ? new Date(mail.date).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : ''}
                                </span>
                              </div>
                              <p className="text-[12.5px] font-medium text-zinc-800 truncate group-hover:text-brand transition-colors">
                                {mail.subject}
                              </p>
                              {mail.snippet && (
                                <p className="text-[11.5px] text-zinc-500 line-clamp-1 mt-0.5">
                                  {mail.snippet}
                                </p>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Coluna Direita / Lateral: Agenda & Pauta (1 col) */}
                <div className="space-y-6">
                  {/* Card de Próximo Evento / Destaque de Pauta */}
                  <div className="surface rounded-2xl overflow-hidden border border-card-border">
                    <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={14} className="text-emerald-500" />
                        <h3 className="text-[13px] font-semibold text-zinc-900">Pauta & Agenda</h3>
                      </div>
                      <Link
                        to="/calendar"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
                      >
                        Ver agenda
                        <ArrowRight size={12} />
                      </Link>
                    </div>

                    {nextEvent ? (
                      <div className="p-5">
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded mb-2">
                          <Clock size={10} /> Próximo compromisso
                        </span>

                        <h4 className="text-[15px] font-semibold text-zinc-900 leading-snug">
                          {nextEvent.title}
                        </h4>

                        <p className="text-[12.5px] text-zinc-600 mt-1 tabular-nums">
                          {(() => {
                            const s = new Date(nextEvent.start_time)
                            const e = new Date(nextEvent.end_time)
                            return `${s.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}, ${s.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${!isNaN(e.getTime()) ? ' – ' + e.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}`
                          })()}
                        </p>

                        {nextEvent.attendees.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1.5">
                              Participantes ({nextEvent.attendees.length})
                            </p>
                            <div className="flex items-center gap-1 flex-wrap">
                              {nextEvent.attendees.slice(0, 5).map((a) => (
                                <span
                                  key={a}
                                  title={a}
                                  className="w-6 h-6 rounded-full bg-brand-subtle border border-brand-border flex items-center justify-center text-[10px] font-semibold text-brand"
                                >
                                  {a[0]?.toUpperCase()}
                                </span>
                              ))}
                              {nextEvent.attendees.length > 5 && (
                                <span className="text-[11px] text-zinc-400 font-medium ml-1">
                                  +{nextEvent.attendees.length - 5}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-100 flex-wrap">
                          <button
                            onClick={() => prepareMeeting(nextEvent)}
                            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-brand-gradient text-white text-[12px] font-medium hover:brightness-110 transition-all shadow-xs"
                          >
                            <Sparkles size={12} />
                            Preparar com Genie
                          </button>
                          {nextEvent.meet_link ? (
                            <a
                              href={nextEvent.meet_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white border border-card-border text-[12px] font-medium text-zinc-700 hover:text-zinc-900 hover:border-zinc-300 transition-colors"
                            >
                              <Video size={12} className="text-emerald-500" />
                              Google Meet
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <p className="p-5 text-[13px] text-zinc-400">
                        {connections.googleConnected
                          ? 'Nenhum evento agendado para as próximas horas.'
                          : 'Conecte sua conta Google para sincronizar os compromissos.'}
                      </p>
                    )}

                    {/* Lista dos próximos compromissos da semana */}
                    {upcomingEvents.length > 1 && (
                      <div className="border-t border-zinc-100 px-5 py-4 bg-zinc-50/40">
                        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">
                          A seguir na semana ({upcomingEvents.length})
                        </p>
                        <div className="space-y-3">
                          {upcomingEvents.slice(1).map((ev) => {
                            const s = new Date(ev.start_time)
                            return (
                              <div key={ev.id} className="flex items-start gap-3 text-[12px]">
                                <span className="text-zinc-400 tabular-nums font-mono text-[11px] shrink-0 w-12 pt-0.5">
                                  {s.toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                  })}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-zinc-800 truncate">{ev.title}</p>
                                  <p className="text-zinc-400 text-[11px]">
                                    {s.toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                    {ev.attendees.length > 0
                                      ? ` · ${ev.attendees.length} pessoas`
                                      : ''}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card de Atalho para IA: Prompt Direto */}
                  <div className="surface rounded-2xl p-5 border border-brand-border/60 bg-gradient-to-br from-white to-brand-subtle/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={16} className="text-brand" />
                      <h4 className="text-[13px] font-semibold text-zinc-900">
                        Assistente Genie IA
                      </h4>
                    </div>
                    <p className="text-[12px] text-zinc-600 mb-3.5 leading-relaxed">
                      Faça perguntas analíticas cruzando Meta Ads, Gmail e Calendar em tempo real.
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={() =>
                          askGenie('Quais anúncios tiveram o melhor CTR nos últimos 30 dias?')
                        }
                        className="w-full text-left p-2 rounded-xl bg-white/80 border border-zinc-200/80 text-[11.5px] text-zinc-700 hover:text-brand hover:border-brand-border transition-colors truncate block"
                      >
                        ⚡ "Quais anúncios tiveram o melhor CTR?"
                      </button>
                      <button
                        onClick={() =>
                          askGenie(
                            'Resuma meus próximos 3 compromissos e se preciso enviar algo antes.',
                          )
                        }
                        className="w-full text-left p-2 rounded-xl bg-white/80 border border-zinc-200/80 text-[11.5px] text-zinc-700 hover:text-brand hover:border-brand-border transition-colors truncate block"
                      >
                        📅 "O que preciso preparar para as reuniões?"
                      </button>
                      <button
                        onClick={() =>
                          askGenie('Existe alguma campanha com gasto alto e pouca conversão?')
                        }
                        className="w-full text-left p-2 rounded-xl bg-white/80 border border-zinc-200/80 text-[11.5px] text-zinc-700 hover:text-brand hover:border-brand-border transition-colors truncate block"
                      >
                        🚨 "Onde posso estar desperdiçando orçamento?"
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        pendingQuestion={pendingQuestion}
        onConsumeQuestion={() => setPendingQuestion(null)}
      />
    </AppShell>
  )
}
