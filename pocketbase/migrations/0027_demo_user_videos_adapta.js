/// <reference path="../pb_data/types.d.ts" />
// Cria/garante o usuário demo videos@adapta.org (senha: "demo1234")
// e popula todas as coleções com dados mockados realistas e consistentes:
// - ad_accounts
// - campaigns (6 campanhas com métricas coerentes)
// - daily_metrics (série temporal de 30 dias ancorada em Date.now(), batendo com os totais)
// - ad_sets e ads (com criativos, copys e ranking)
// - meta_connections (status 'connected')
// - google_connections (status 'connected')
// - calendar_events (próximos 7 dias com horários locais, meet_link, participantes)
// - gmail_messages (~14 emails com unread, needs_reply, snippets variados)
// Idempotente: seguro para reexecução.

migrate(
  (app) => {
    const DEMO_EMAIL = 'videos@adapta.org'
    const DEMO_PASSWORD = 'demo1234'
    const DEMO_NAME = 'Adapta Demo'

    // 1. Obter ou criar o usuário demo
    let userId = ''
    try {
      const existing = app.findAuthRecordByEmail('_pb_users_auth_', DEMO_EMAIL)
      userId = existing.id
      // Garante senha e verificação atualizadas
      existing.setPassword(DEMO_PASSWORD)
      existing.setVerified(true)
      existing.set('name', DEMO_NAME)
      app.save(existing)
    } catch (_) {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      const newUser = new Record(usersCol)
      newUser.setEmail(DEMO_EMAIL)
      newUser.setPassword(DEMO_PASSWORD)
      newUser.setVerified(true)
      newUser.set('name', DEMO_NAME)
      app.save(newUser)
      userId = newUser.id
    }

    // 2. Limpar dados anteriores do usuário demo para garantir idempotência sem afetar outros usuários
    const userFilter = "user_id = '" + userId + "'"

    // 2.1 Conexões, eventos e emails (possuem campo user_id direto)
    const directUserCols = [
      'google_connections',
      'meta_connections',
      'calendar_events',
      'gmail_messages',
    ]
    for (let i = 0; i < directUserCols.length; i++) {
      try {
        const records = app.findRecordsByFilter(directUserCols[i], userFilter, '', 1000, 0)
        for (let j = 0; j < records.length; j++) {
          app.delete(records[j])
        }
      } catch (_) {}
    }

    // 2.2 Ad accounts do usuário demo e dependentes (campaigns, ad_sets, ads, daily_metrics)
    try {
      const accounts = app.findRecordsByFilter('ad_accounts', userFilter, '', 100, 0)
      for (let a = 0; a < accounts.length; a++) {
        const accId = accounts[a].id
        try {
          const camps = app.findRecordsByFilter(
            'campaigns',
            "account_id = '" + accId + "'",
            '',
            500,
            0,
          )
          for (let c = 0; c < camps.length; c++) {
            const cId = camps[c].id
            // Deletar daily_metrics vinculadas
            try {
              const dm = app.findRecordsByFilter(
                'daily_metrics',
                "campaign_id = '" + cId + "'",
                '',
                1000,
                0,
              )
              for (let d = 0; d < dm.length; d++) app.delete(dm[d])
            } catch (_) {}
            // Deletar ad_sets e ads vinculados
            try {
              const sets = app.findRecordsByFilter(
                'ad_sets',
                "campaign_id = '" + cId + "'",
                '',
                500,
                0,
              )
              for (let s = 0; s < sets.length; s++) {
                const sId = sets[s].id
                try {
                  const ads = app.findRecordsByFilter('ads', "adset_id = '" + sId + "'", '', 500, 0)
                  for (let ad = 0; ad < ads.length; ad++) app.delete(ads[ad])
                } catch (_) {}
                app.delete(sets[s])
              }
            } catch (_) {}
            app.delete(camps[c])
          }
        } catch (_) {}
        app.delete(accounts[a])
      }
    } catch (_) {}

    // 3. Criar Ad Account
    const acctCol = app.findCollectionByNameOrId('ad_accounts')
    const acct = new Record(acctCol, {
      account_id: 'act_demo_adapta_video',
      name: 'Adapta Vídeos & Performance',
      currency: 'BRL',
      status: 'active',
      user_id: userId,
    })
    app.save(acct)

    // 4. Criar Campanhas realistas
    // Dados para 30 dias consistentes
    const campCol = app.findCollectionByNameOrId('campaigns')
    const adSetCol = app.findCollectionByNameOrId('ad_sets')
    const adsCol = app.findCollectionByNameOrId('ads')
    const metCol = app.findCollectionByNameOrId('daily_metrics')

    const campaignsConfig = [
      {
        name: 'Conversão · Formação IA em Vídeo 2026',
        status: 'active',
        objective: 'sales',
        budget_type: 'daily',
        budget: 250,
        spend: 7420.5,
        impressions: 268400,
        reach: 195200,
        frequency: 1.37,
        clicks: 5368,
        ctr: 2.0,
        cpc: 1.38,
        cpm: 27.65,
        conversions: 148,
        cost_per_conversion: 50.14,
        purchase_roas: 3.85,
      },
      {
        name: 'Escala · Assinatura Adapta PRO (Vídeos)',
        status: 'active',
        objective: 'sales',
        budget_type: 'daily',
        budget: 180,
        spend: 5210.0,
        impressions: 182350,
        reach: 138900,
        frequency: 1.31,
        clicks: 3829,
        ctr: 2.1,
        cpc: 1.36,
        cpm: 28.57,
        conversions: 104,
        cost_per_conversion: 50.1,
        purchase_roas: 3.2,
      },
      {
        name: 'Remarketing · Carrinho Abandonado & Checkout',
        status: 'active',
        objective: 'sales',
        budget_type: 'daily',
        budget: 120,
        spend: 3450.0,
        impressions: 98500,
        reach: 48200,
        frequency: 2.04,
        clicks: 2856,
        ctr: 2.9,
        cpc: 1.21,
        cpm: 35.03,
        conversions: 89,
        cost_per_conversion: 38.76,
        purchase_roas: 4.6,
      },
      {
        name: 'Geração de Leads · Masterclass Criação de Conteúdo',
        status: 'active',
        objective: 'leads',
        budget_type: 'daily',
        budget: 140,
        spend: 4120.0,
        impressions: 171600,
        reach: 129000,
        frequency: 1.33,
        clicks: 4118,
        ctr: 2.4,
        cpc: 1.0,
        cpm: 24.01,
        conversions: 312,
        cost_per_conversion: 13.21,
        purchase_roas: 2.1,
      },
      {
        name: 'Tráfego Topo de Funil · Reels & Cortes Virais',
        status: 'paused',
        objective: 'traffic',
        budget_type: 'daily',
        budget: 80,
        spend: 1890.0,
        impressions: 118000,
        reach: 94000,
        frequency: 1.25,
        clicks: 3186,
        ctr: 2.7,
        cpc: 0.59,
        cpm: 16.02,
        conversions: 42,
        cost_per_conversion: 45.0,
        purchase_roas: 1.75,
      },
      {
        name: 'Brand Awareness · Adapta Summit Vídeos Q4',
        status: 'draft',
        objective: 'awareness',
        budget_type: 'lifetime',
        budget: 8000,
        spend: 0,
        impressions: 0,
        reach: 0,
        frequency: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        conversions: 0,
        cost_per_conversion: 0,
        purchase_roas: 0,
      },
    ]

    const savedCampaigns = []
    for (let c = 0; c < campaignsConfig.length; c++) {
      const cfg = campaignsConfig[c]
      const camp = new Record(campCol, {
        name: cfg.name,
        status: cfg.status,
        objective: cfg.objective,
        buying_type: 'auction',
        budget_type: cfg.budget_type,
        budget: cfg.budget,
        spend: cfg.spend,
        impressions: cfg.impressions,
        reach: cfg.reach,
        frequency: cfg.frequency,
        clicks: cfg.clicks,
        ctr: cfg.ctr,
        cpc: cfg.cpc,
        cpm: cfg.cpm,
        conversions: cfg.conversions,
        cost_per_conversion: cfg.cost_per_conversion,
        purchase_roas: cfg.purchase_roas,
        roas: cfg.purchase_roas,
        account_id: acct.id,
      })
      app.save(camp)
      savedCampaigns.push(camp)
    }

    // 5. Série temporal de 30 dias para daily_metrics
    // Gerar 30 dias (do dia -29 até o dia 0 [hoje]) para que o período de 7d e 30d no dashboard
    // tenha dados ricos, com sparklines detalhadas e valores diários que somam exatamente o spend/conversões.
    const dayWeights = [
      0.82, 0.88, 0.79, 0.95, 1.05, 1.12, 0.98, 0.85, 0.91, 0.89, 1.02, 1.15, 1.21, 1.04, 0.88,
      0.94, 0.92, 1.06, 1.18, 1.24, 1.09, 0.92, 0.97, 1.01, 1.11, 1.22, 1.28, 1.14, 1.19, 1.25,
    ]
    const sumW = dayWeights.reduce((a, b) => a + b, 0)

    for (let ci = 0; ci < savedCampaigns.length; ci++) {
      const cfg = campaignsConfig[ci]
      if (cfg.status === 'draft' || cfg.spend === 0) continue

      let runningSpend = 0
      let runningConvs = 0
      let runningClicks = 0
      let runningImpr = 0

      for (let day = 29; day >= 0; day--) {
        const d = new Date(Date.now() - day * 24 * 60 * 60 * 1000)
        const dateStr = d.toISOString().split('T')[0]
        const dayIdx = 29 - day
        // Ajuste no último dia para bater a soma exata
        let fracSpend = Math.round(cfg.spend * (dayWeights[dayIdx] / sumW) * 100) / 100
        let fracConv = Math.round(cfg.conversions * (dayWeights[dayIdx] / sumW))
        let fracClicks = Math.round(cfg.clicks * (dayWeights[dayIdx] / sumW))
        let fracImpr = Math.round(cfg.impressions * (dayWeights[dayIdx] / sumW))

        if (day === 0) {
          fracSpend = Math.round((cfg.spend - runningSpend) * 100) / 100
          fracConv = Math.max(0, cfg.conversions - runningConvs)
          fracClicks = Math.max(0, cfg.clicks - runningClicks)
          fracImpr = Math.max(0, cfg.impressions - runningImpr)
        } else {
          runningSpend += fracSpend
          runningConvs += fracConv
          runningClicks += fracClicks
          runningImpr += fracImpr
        }

        const met = new Record(metCol, {
          date: dateStr,
          campaign_id: savedCampaigns[ci].id,
          level: 'campaign',
          spend: fracSpend,
          impressions: fracImpr,
          reach: Math.round(fracImpr * 0.75),
          clicks: fracClicks,
          conversions: fracConv,
          ctr: cfg.ctr,
          cpc: cfg.cpc,
          cpm: cfg.cpm,
          cost_per_conversion: cfg.cost_per_conversion,
          purchase_roas: cfg.purchase_roas,
        })
        app.save(met)
      }
    }

    // 6. Ad Sets e Ads por campanha ativa
    const adSetTemplates = [
      { name: 'Lookalike 1% · Compradores Adapta', split: 0.45 },
      { name: 'Interesses · IA, Criação de Vídeo & Premiere', split: 0.35 },
      { name: 'Engajamento Instagram 90d (Remarketing)', split: 0.2 },
    ]

    const adCreatives = [
      {
        name: 'Vídeo Teaser · Como editar 5x mais rápido com IA',
        type: 'video',
        headline: 'Edite vídeos no automático com inteligência artificial',
        body: 'Domine fluxos completos de IA para vídeos no YouTube, TikTok e Reels com a formação da Adapta.',
        cta: 'learn_more',
      },
      {
        name: 'Imagem Estática · Comparativo Antes x Depois',
        type: 'image',
        headline: 'De 4 horas para 25 minutos por corte',
        body: 'Veja a metodologia usada pelos maiores canais do Brasil. Acesse agora.',
        cta: 'learn_more',
      },
      {
        name: 'Carrossel · 5 Ferramentas Essenciais de Vídeo',
        type: 'carousel',
        headline: 'O stack definitivo para editores e videomakers',
        body: 'Arraste para o lado e conheça as ferramentas que vão transformar seu fluxo de trabalho.',
        cta: 'shop_now',
      },
    ]

    for (let ci = 0; ci < savedCampaigns.length; ci++) {
      const parent = savedCampaigns[ci]
      const pData = campaignsConfig[ci]
      if (pData.status === 'draft') continue

      for (let si = 0; si < adSetTemplates.length; si++) {
        const tmpl = adSetTemplates[si]
        const adset = new Record(adSetCol, {
          name: tmpl.name,
          status: pData.status,
          campaign_id: parent.id,
          daily_budget: Math.round(pData.budget * tmpl.split),
          optimization_goal: pData.objective === 'leads' ? 'conversions' : 'conversions',
          billing_event: 'impressions',
          bid_strategy: 'lowest_cost',
          targeting_age_min: 21,
          targeting_age_max: 54,
          targeting_genders: [1, 2],
          targeting_locations: ['BR'],
          spend: Math.round(pData.spend * tmpl.split * 100) / 100,
          impressions: Math.round(pData.impressions * tmpl.split),
          reach: Math.round(pData.reach * tmpl.split),
          frequency: pData.frequency,
          clicks: Math.round(pData.clicks * tmpl.split),
          ctr: pData.ctr,
          cpc: pData.cpc,
          cpm: pData.cpm,
          conversions: Math.round(pData.conversions * tmpl.split),
          cost_per_conversion: pData.cost_per_conversion,
          purchase_roas: pData.purchase_roas,
        })
        app.save(adset)

        // 2 anúncios por conjunto
        for (let ai = 0; ai < 2; ai++) {
          const adTmpl = adCreatives[(si + ai) % adCreatives.length]
          const adFrac = ai === 0 ? 0.6 : 0.4
          const ad = new Record(adsCol, {
            name: adTmpl.name + ' [' + (ai + 1) + ']',
            status: pData.status,
            adset_id: adset.id,
            creative_type: adTmpl.type,
            headline: adTmpl.headline,
            body_text: adTmpl.body,
            call_to_action: adTmpl.cta,
            spend: Math.round(adset.get('spend') * adFrac * 100) / 100,
            impressions: Math.round(adset.get('impressions') * adFrac),
            reach: Math.round(adset.get('reach') * adFrac),
            frequency: pData.frequency,
            clicks: Math.round(adset.get('clicks') * adFrac),
            ctr: pData.ctr,
            cpc: pData.cpc,
            cpm: pData.cpm,
            conversions: Math.round(adset.get('conversions') * adFrac),
            cost_per_conversion: pData.cost_per_conversion,
            purchase_roas: pData.purchase_roas,
            quality_ranking: 'above_average',
            engagement_rate_ranking: 'average',
            conversion_rate_ranking: 'above_average',
          })
          app.save(ad)
        }
      }
    }

    // 7. Conexões ativas do usuário demo (Meta e Google)
    const metaConnCol = app.findCollectionByNameOrId('meta_connections')
    const metaConn = new Record(metaConnCol, {
      user_id: userId,
      access_token: 'EAAB_mock_token_demo_adapta_videos_2026',
      account_id: 'act_demo_adapta_video',
      account_name: 'Adapta Vídeos & Performance',
      currency: 'BRL',
      status: 'connected',
      last_sync: new Date().toISOString(),
    })
    app.save(metaConn)

    const googleConnCol = app.findCollectionByNameOrId('google_connections')
    const googleConn = new Record(googleConnCol, {
      user_id: userId,
      email: DEMO_EMAIL,
      access_token: 'ya29_mock_demo_access_token_videos_adapta',
      refresh_token: '1//mock_refresh_token_demo_videos_adapta',
      scope:
        'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
      status: 'connected',
      token_expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    app.save(googleConn)

    // 8. Eventos de Google Calendar (próximos 7 dias ancorados em now)
    const calCol = app.findCollectionByNameOrId('calendar_events')
    const calEventsConfig = [
      {
        offsetDays: 0,
        startHour: 10,
        durationMinutes: 45,
        title: 'Daily Vídeos & Performance <> Skip Ops',
        location: 'Google Meet',
        description: 'Alinhamento matinal de pautas, cortes aprovados e status de campanhas no ar.',
        attendees: 'videos@adapta.org, fabiano@adapta.org, allan@adapta.org, giam@adapta.org',
        meet_link: 'https://meet.google.com/adapta-demo-ops',
      },
      {
        offsetDays: 0,
        startHour: 14,
        durationMinutes: 60,
        title: 'Revisão Criativa · Novos Hooks de Meta Ads',
        location: 'Sala Criativa / Meet',
        description:
          'Análise dos criativos da semana com ROAS acima de 3.5x e planejamento dos testes de quarta-feira.',
        attendees: 'videos@adapta.org, patric.martins@adapta.org, mateus.santos@adapta.org',
        meet_link: 'https://meet.google.com/adapta-creative-rev',
      },
      {
        offsetDays: 0,
        startHour: 17,
        durationMinutes: 30,
        title: 'Briefing Adapta Summit · Gravação ao Vivo',
        location: 'Estúdio Principal',
        description:
          'Fechamento do roteiro da mesa redonda e checagem técnica de teleprompter e áudio.',
        attendees: 'videos@adapta.org, lucas@adapta.org, eduardo@adapta.org',
        meet_link: '',
      },
      {
        offsetDays: 1,
        startHour: 11,
        durationMinutes: 50,
        title: 'Alinhamento Estratégico <> Fabiano',
        location: 'Google Meet',
        description:
          'Apresentação dos resultados de escala da campanha de Formação IA e projeção de investimento.',
        attendees: 'videos@adapta.org, fabiano@adapta.org',
        meet_link: 'https://meet.google.com/adapta-fabiano-sync',
      },
      {
        offsetDays: 1,
        startHour: 15,
        durationMinutes: 45,
        title: 'Workshop Interno: Workflow de Edição com IA',
        location: 'Auditório Virtual',
        description:
          'Demonstração prática de transcrição automática, auto-reframe e legendas dinâmicas.',
        attendees: 'videos@adapta.org, equipe-video@adapta.org, felipe.lemos@adapta.org',
        meet_link: 'https://meet.google.com/adapta-workshop-ia',
      },
      {
        offsetDays: 2,
        startHour: 10,
        durationMinutes: 60,
        title: 'Weekly Geral de Marketing & Tráfego',
        location: 'Google Meet',
        description:
          'Apresentação dos KPIs gerais de tráfego, ROAS semanal e orçamento para as próximas semanas.',
        attendees:
          'videos@adapta.org, allan@adapta.org, patric.martins@adapta.org, davi@adapta.org',
        meet_link: 'https://meet.google.com/adapta-weekly-mkt',
      },
      {
        offsetDays: 3,
        startHour: 14,
        durationMinutes: 40,
        title: 'Análise de Mídia Paga: Testes de Criativos CBO',
        location: 'Meet',
        description:
          'Decisão de corte de ad sets sub-performando e remanejamento de verba para os campeões.',
        attendees: 'videos@adapta.org, tráfego@adapta.org',
        meet_link: 'https://meet.google.com/adapta-cbo-review',
      },
      {
        offsetDays: 4,
        startHour: 16,
        durationMinutes: 45,
        title: 'Planejamento de Lançamento Q4 · Gravações',
        location: 'Sala 02 Adapta',
        description: 'Cronograma de gravação de aulas e vídeos promocionais do 4º trimestre.',
        attendees: 'videos@adapta.org, teruo.sakamoto@adapta.org, julia.alcantara@adapta.org',
        meet_link: '',
      },
      {
        offsetDays: 5,
        startHour: 11,
        durationMinutes: 30,
        title: 'Feedback de Edição · Cortes do Podcast Adapta',
        location: 'Google Meet',
        description:
          'Validação da identidade visual e retenção dos primeiros 3 segundos nos shorts.',
        attendees: 'videos@adapta.org, max@adapta.org',
        meet_link: 'https://meet.google.com/adapta-podcast-cuts',
      },
    ]

    for (let e = 0; e < calEventsConfig.length; e++) {
      const cfg = calEventsConfig[e]
      const start = new Date(Date.now() + cfg.offsetDays * 24 * 60 * 60 * 1000)
      start.setHours(cfg.startHour, 0, 0, 0)
      const end = new Date(start.getTime() + cfg.durationMinutes * 60 * 1000)

      const startH =
        String(start.getHours()).padStart(2, '0') +
        ':' +
        String(start.getMinutes()).padStart(2, '0')
      const endH =
        String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0')
      const dayLabel =
        cfg.offsetDays === 0 ? 'Hoje' : cfg.offsetDays === 1 ? 'Amanhã' : `${cfg.offsetDays} dias`

      const evRecord = new Record(calCol, {
        user_id: userId,
        event_id: 'ev_demo_' + e + '_' + userId,
        title: cfg.title,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        location: cfg.location,
        description: cfg.description,
        attendees: cfg.attendees,
        status: 'confirmed',
        when_local: `${dayLabel}, ${startH} – ${endH}`,
        html_link: 'https://calendar.google.com',
        meet_link: cfg.meet_link,
      })
      app.save(evRecord)
    }

    // 9. Caixa de entrada do Gmail (~14 emails com unread e needs_reply para exercitar os badges da sidebar)
    const gmailCol = app.findCollectionByNameOrId('gmail_messages')
    const emailsConfig = [
      {
        from: 'Fabiano Fabrício <fabiano@adapta.org>',
        subject: 'Urgente: Aprovação da verba para a nova campanha de vídeo',
        snippet:
          'Fala time de vídeo! Vi que o ROAS da Formação IA bateu 3.85x esta semana. Conseguem me mandar até às 15h a projeção de escala caso aumentemos a verba diária em R$ 500?',
        offsetHours: 2,
        is_unread: true,
        needs_reply: true,
      },
      {
        from: 'Patric Martins <patric.martins@adapta.org>',
        subject: 'Novos cortes do YouTube aprovados para tráfego',
        snippet:
          'Já subi os 4 cortes refinados no drive. O hook do vídeo 02 ficou sensacional com a legenda dinâmica. Podem subir na conta de anúncios hoje mesmo?',
        offsetHours: 4,
        is_unread: true,
        needs_reply: true,
      },
      {
        from: 'Mateus Santos <mateus.santos@adapta.org>',
        subject: 'Dúvida técnica na exportação 4K ProRes para o Summit',
        snippet:
          'Oi pessoal, estamos com uma dúvida sobre os perfis de cor Rec.709 para a mesa de corte do evento. Quem puder me ligar rapidinho agradeço!',
        offsetHours: 6,
        is_unread: true,
        needs_reply: true,
      },
      {
        from: 'Allan Pimenta <allan@adapta.org>',
        subject: 'Proposta comercial de patrocínio dos vídeos recebida',
        snippet:
          'Recebemos uma proposta da empresa parceira de IA para patrocinar a série de cortes. Segue anexo o PDF com valores para avaliarmos juntos.',
        offsetHours: 9,
        is_unread: true,
        needs_reply: false,
      },
      {
        from: 'HubSpot <noreply@notifications.hubspot.com>',
        subject: 'Resumo diário de leads gerados: +312 novas inscrições',
        snippet:
          'Sua campanha de Masterclass atingiu um marco hoje: mais de 300 leads qualificados com CPL médio de R$ 13,21. Confira o painel.',
        offsetHours: 14,
        is_unread: false,
        needs_reply: false,
      },
      {
        from: 'Giam Paolo <giam@adapta.org>',
        subject: 'Alinhamento de áudio para as próximas gravações',
        snippet:
          'Chegaram os microfones lapela novos no estúdio. Preciso que alguém da equipe passe lá para fazer o teste de ganho e sincronismo antes da gravação de amanhã.',
        offsetHours: 18,
        is_unread: true,
        needs_reply: true,
      },
      {
        from: 'Meta for Business <advertise-noreply@support.facebook.com>',
        subject: 'Seus anúncios da campanha Formação IA foram aprovados',
        snippet:
          'Os anúncios do conjunto Lookalike 1% foram aprovados e já estão gerando impressões no Instagram e Facebook. Ver métricas no gerenciador.',
        offsetHours: 22,
        is_unread: false,
        needs_reply: false,
      },
      {
        from: 'projeto-vazio-copy <noreply@mail.goskip.dev>',
        subject: 'Relatório de desempenho semanal · Adapta Vídeos (ROAS 3.42x)',
        snippet:
          'Resumo dos últimos 7 dias: Investimento R$ 5.120,40 (+18.4%), Conversões 128 (+22.1%), CTR Médio 2.18%. Excelente momento de escala.',
        offsetHours: 26,
        is_unread: false,
        needs_reply: false,
      },
      {
        from: 'Felipe Lemos <felipe.lemos@adapta.org>',
        subject: 'Roteiro validado: Os 5 erros mais comuns ao usar IA em vídeos',
        snippet:
          'Roteiro finalizado com as chamadas de ação para o curso PRO. O link do Docs já está compartilhado com permissão de edição para todos.',
        offsetHours: 30,
        is_unread: false,
        needs_reply: false,
      },
      {
        from: 'Equipe tl;dv <no-reply@tldv.io>',
        subject: 'Ata e resumo por IA da reunião "Revisão Semanal de Criativos" disponíveis',
        snippet:
          'Destaques principais: Foco em vídeos verticais abaixo de 45 segundos, taxa de retenção nos 3 primeiros segundos subiu 14% com legendas amarelas.',
        offsetHours: 35,
        is_unread: false,
        needs_reply: false,
      },
      {
        from: 'Lucas Nicolatti <lucas@adapta.org>',
        subject: 'Confirmação do estúdio Berrini para a imersão',
        snippet:
          'Reserva do estúdio e das câmeras Sony FX3 confirmada para a próxima quinta-feira das 13h às 19h. Tudo pronto para rodar!',
        offsetHours: 42,
        is_unread: false,
        needs_reply: false,
      },
      {
        from: 'Google Workspace <workspace-noreply@google.com>',
        subject: 'Armazenamento do Google Drive da equipe de vídeo em 68%',
        snippet:
          'Sua organização usou 68% dos 5 TB disponíveis. Arquivos de projeto antigos do Premiere podem ser arquivados em storage frio.',
        offsetHours: 50,
        is_unread: false,
        needs_reply: false,
      },
      {
        from: 'Nathan Borges <nathan.borges@adapta.org>',
        subject: 'Thumbnails e capas dos novos vídeos no Figma',
        snippet:
          'Fiz 3 variações de thumb com contraste alto para o teste A/B no YouTube. Me digam qual vocês preferem para subir no ar.',
        offsetHours: 60,
        is_unread: true,
        needs_reply: true,
      },
      {
        from: 'PostHog <hey@posthog.com>',
        subject: 'Alert: Inscrições na landing page de vídeo bateram recorde diário',
        snippet:
          'Taxa de conversão da LP subiu de 4.2% para 7.1% após a inclusão do novo vídeo demonstrativo de 60 segundos no topo da página.',
        offsetHours: 72,
        is_unread: false,
        needs_reply: false,
      },
    ]

    for (let m = 0; m < emailsConfig.length; m++) {
      const cfg = emailsConfig[m]
      const msgDate = new Date(Date.now() - cfg.offsetHours * 60 * 60 * 1000)

      const mailRecord = new Record(gmailCol, {
        user_id: userId,
        message_id: 'msg_demo_' + m + '_' + userId,
        from_email: cfg.from,
        subject: cfg.subject,
        snippet: cfg.snippet,
        date: msgDate.toISOString(),
        is_unread: cfg.is_unread,
        needs_reply: cfg.needs_reply,
      })
      app.save(mailRecord)
    }

    console.log('Demo user seeded successfully for: ' + DEMO_EMAIL + ' (id: ' + userId + ')')
  },
  (app) => {
    // Rollback idempotente: remove dados mockados gerados para o usuário demo
    try {
      const users = app.findRecordsByFilter(
        '_pb_users_auth_',
        "email = 'videos@adapta.org'",
        '',
        1,
        0,
      )
      if (users.length > 0) {
        const uid = users[0].id
        const userFilter = "user_id = '" + uid + "'"
        const directCols = [
          'google_connections',
          'meta_connections',
          'calendar_events',
          'gmail_messages',
        ]
        for (let i = 0; i < directCols.length; i++) {
          try {
            const list = app.findRecordsByFilter(directCols[i], userFilter, '', 1000, 0)
            for (let j = 0; j < list.length; j++) app.delete(list[j])
          } catch (_) {}
        }
      }
    } catch (_) {}
  },
)
