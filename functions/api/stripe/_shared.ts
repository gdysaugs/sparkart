export type Env = {
  CORS_ALLOWED_ORIGINS?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_WEBHOOK_TOLERANCE_SEC?: string
  STRIPE_SUCCESS_URL?: string
  STRIPE_CANCEL_URL?: string
  STRIPE_RETURN_ORIGIN?: string
  STRIPE_PRICE_TO_COINS_MAP?: string
  STRIPE_PRICE_TO_COINS_JSON?: string
}

export type TicketCreditInput = {
  usageId: string
  email: string
  userId: string | null
  coins: number
  reason: string
  metadata: Record<string, unknown>
}

export const PRICE_PLANS: Record<string, { name: string; coins: number; amountJpy: number }> = {
  price_1TmcRhArrLCjV5GlfTXWODeP: { name: 'ライト', coins: 30, amountJpy: 690 },
  price_1TmcRwArrLCjV5GldEbZcgtd: { name: 'ベーシック', coins: 80, amountJpy: 1680 },
  price_1TmcSBArrLCjV5GlbuasefaN: { name: 'スタンダード', coins: 170, amountJpy: 3280 },
  price_1TmcSTArrLCjV5GlQcdrmkI9: { name: 'プロ', coins: 380, amountJpy: 6480 },
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

export const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, ...JSON_HEADERS },
  })

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

export const parsePositiveInt = (value: unknown) => {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  )

export const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || ''
  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

export const getSupabaseAnonKey = (env: Env) => env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''

export const supabaseBaseUrl = (env: Env) => String(env.SUPABASE_URL || '').replace(/\/$/, '')

export const fetchSupabaseUser = async (env: Env, token: string) => {
  const anonKey = getSupabaseAnonKey(env)
  if (!env.SUPABASE_URL || !anonKey) return null
  const res = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

export const adminHeaders = (env: Env, extra: Record<string, string> = {}) => ({
  apikey: String(env.SUPABASE_SERVICE_ROLE_KEY || ''),
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
  ...extra,
})

export const adminFetch = async (env: Env, path: string, options: RequestInit = {}) => {
  const res = await fetch(`${supabaseBaseUrl(env)}${path}`, options)
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }
  return { res, text, parsed }
}

export const fetchStripeCheckoutSession = async (env: Env, sessionId: string) => {
  const stripeKey = env.STRIPE_SECRET_KEY
  if (!stripeKey) return { ok: false, status: 500, data: null as any, error: 'STRIPE_SECRET_KEY is not set.' }
  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(
    sessionId,
  )}?expand[]=line_items.data.price`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${stripeKey}` },
  })
  const data = await res.json().catch(() => null)
  return {
    ok: res.ok,
    status: res.status,
    data,
    error: data?.error?.message || 'Stripe session fetch failed.',
  }
}

export const parsePriceToCoinsMap = (value: unknown) => {
  if (!value) return {}
  try {
    const parsed = JSON.parse(String(value))
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export const resolveCoinsFromSession = (session: any, env: Env) => {
  const md = session?.metadata || {}
  const direct =
    parsePositiveInt(md.coins) ||
    parsePositiveInt(md.coin_amount) ||
    parsePositiveInt(md.tickets) ||
    parsePositiveInt(md.ticket_amount) ||
    parsePositiveInt(md.delta)
  if (direct) return direct

  const priceMap = parsePriceToCoinsMap(env.STRIPE_PRICE_TO_COINS_MAP || env.STRIPE_PRICE_TO_COINS_JSON)
  const candidates = [
    md.price_id,
    md.stripe_price_id,
    session?.line_items?.data?.[0]?.price?.id,
    session?.display_items?.[0]?.price?.id,
  ].filter(Boolean)

  for (const key of candidates) {
    const mapped = parsePositiveInt(priceMap[String(key)])
    if (mapped) return mapped
    const plan = PRICE_PLANS[String(key)]
    if (plan) return plan.coins
  }
  return null
}

export const isPaidSession = (session: any, eventType?: string) => {
  if (!session || session.object !== 'checkout.session') return false
  if (eventType === 'checkout.session.async_payment_succeeded') return true
  return session.payment_status === 'paid' || session.status === 'complete'
}

export const extractUserContextFromSession = (session: any) => {
  const md = session?.metadata || {}
  const email = normalizeEmail(session?.customer_details?.email || session?.customer_email || md.email)
  const maybeUserId = md.user_id || md.supabase_user_id || session?.client_reference_id
  const userId = isUuid(maybeUserId) ? String(maybeUserId) : null
  return { email, userId }
}

export const findTicketEventByUsageId = async (env: Env, usageId: string) => {
  const q = `/rest/v1/ticket_events?select=id,delta,created_at&usage_id=eq.${encodeURIComponent(usageId)}&limit=1`
  const { res, parsed } = await adminFetch(env, q, {
    method: 'GET',
    headers: adminHeaders(env, { accept: 'application/json' }),
  })
  if (!res.ok) throw new Error('ticket_events_query_failed')
  if (Array.isArray(parsed) && parsed.length > 0) return parsed[0] as any
  return null
}

export const getTicketRowById = async (env: Env, id: string) => {
  const q = `/rest/v1/user_tickets?select=id,email,user_id,tickets&id=eq.${encodeURIComponent(id)}&limit=1`
  const { res, parsed } = await adminFetch(env, q, {
    method: 'GET',
    headers: adminHeaders(env, { accept: 'application/json' }),
  })
  if (!res.ok) throw new Error('user_tickets_query_failed')
  if (Array.isArray(parsed) && parsed.length > 0) return parsed[0] as any
  return null
}

export const getTicketRowByUserId = async (env: Env, userId: string) => {
  const q = `/rest/v1/user_tickets?select=id,email,user_id,tickets&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  const { res, parsed } = await adminFetch(env, q, {
    method: 'GET',
    headers: adminHeaders(env, { accept: 'application/json' }),
  })
  if (!res.ok) throw new Error('user_tickets_query_failed')
  if (Array.isArray(parsed) && parsed.length > 0) return parsed[0] as any
  return null
}

export const getTicketRowByEmail = async (env: Env, email: string) => {
  const q = `/rest/v1/user_tickets?select=id,email,user_id,tickets&email=eq.${encodeURIComponent(email)}&limit=1`
  const { res, parsed } = await adminFetch(env, q, {
    method: 'GET',
    headers: adminHeaders(env, { accept: 'application/json' }),
  })
  if (!res.ok) throw new Error('user_tickets_query_failed')
  if (Array.isArray(parsed) && parsed.length > 0) return parsed[0] as any
  return null
}

export const updateTicketRow = async (env: Env, id: string, payload: Record<string, unknown>) => {
  const q = `/rest/v1/user_tickets?id=eq.${encodeURIComponent(id)}`
  const { res, parsed } = await adminFetch(env, q, {
    method: 'PATCH',
    headers: adminHeaders(env, {
      'content-type': 'application/json',
      prefer: 'return=representation',
    }),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('user_tickets_update_failed')
  return Array.isArray(parsed) ? ((parsed[0] || null) as any) : null
}

export const insertTicketRow = async (env: Env, email: string, userId: string | null) => {
  const payload: Record<string, unknown> = { email, tickets: 0 }
  if (userId) payload.user_id = userId
  const { res, parsed } = await adminFetch(env, '/rest/v1/user_tickets', {
    method: 'POST',
    headers: adminHeaders(env, {
      'content-type': 'application/json',
      prefer: 'return=representation',
    }),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('user_tickets_insert_failed')
  return Array.isArray(parsed) ? ((parsed[0] || null) as any) : null
}

export const ensureTicketRow = async (env: Env, userId: string | null, email: string) => {
  let row = null
  if (userId) row = await getTicketRowByUserId(env, userId)
  if (!row) row = await getTicketRowByEmail(env, email)

  if (!row) {
    try {
      const inserted = await insertTicketRow(env, email, userId)
      if (inserted) return inserted
    } catch {
      // Race safe refetch.
    }
    if (userId) row = await getTicketRowByUserId(env, userId)
    if (!row) row = await getTicketRowByEmail(env, email)
    if (!row) throw new Error('user_tickets_not_found')
    return row
  }

  const needsEmail = row.email !== email
  const needsUserId = Boolean(userId && row.user_id !== userId)
  if (needsEmail || needsUserId) {
    const patch: Record<string, unknown> = {}
    if (needsEmail) patch.email = email
    if (needsUserId) patch.user_id = userId
    const updated = await updateTicketRow(env, row.id, patch)
    if (updated) return updated
  }
  return row
}

export const optimisticCredit = async (env: Env, rowId: string, delta: number) => {
  let retries = 5
  while (retries > 0) {
    retries -= 1
    const row = await getTicketRowById(env, rowId)
    if (!row) throw new Error('user_tickets_not_found')
    const current = Number(row.tickets || 0)
    const next = current + delta
    const q = `/rest/v1/user_tickets?id=eq.${encodeURIComponent(rowId)}&tickets=eq.${current}`
    const { res, parsed } = await adminFetch(env, q, {
      method: 'PATCH',
      headers: adminHeaders(env, {
        'content-type': 'application/json',
        prefer: 'return=representation',
      }),
      body: JSON.stringify({ tickets: next }),
    })
    if (!res.ok) throw new Error('user_tickets_update_failed')
    if (Array.isArray(parsed) && parsed.length > 0) {
      return Number((parsed[0] as any).tickets || next)
    }
  }
  throw new Error('user_tickets_conflict')
}

export const insertTicketEvent = async (env: Env, payload: Record<string, unknown>) => {
  const { res, text } = await adminFetch(env, '/rest/v1/ticket_events', {
    method: 'POST',
    headers: adminHeaders(env, {
      'content-type': 'application/json',
      prefer: 'return=representation',
    }),
    body: JSON.stringify(payload),
  })
  if (res.ok) return { ok: true, duplicate: false }
  if (res.status === 409 || text.includes('ticket_events_usage_id_key') || text.includes('duplicate key')) {
    return { ok: false, duplicate: true }
  }
  return { ok: false, duplicate: false }
}

export const creditCoinsWithIdempotency = async (
  env: Env,
  { usageId, email, userId, coins, reason, metadata }: TicketCreditInput,
) => {
  const existing = await findTicketEventByUsageId(env, usageId)
  if (existing) {
    const row = userId ? await getTicketRowByUserId(env, userId) : await getTicketRowByEmail(env, email)
    return {
      alreadyProcessed: true,
      tickets: Number(row?.tickets || 0),
    }
  }

  const row = await ensureTicketRow(env, userId, email)
  const newTotal = await optimisticCredit(env, row.id, coins)
  const eventResult = await insertTicketEvent(env, {
    usage_id: usageId,
    email,
    user_id: userId,
    delta: coins,
    reason,
    metadata,
  })

  if (eventResult.ok) {
    return { alreadyProcessed: false, tickets: newTotal }
  }

  try {
    await optimisticCredit(env, row.id, -coins)
  } catch {
    // Best effort rollback.
  }

  if (eventResult.duplicate) {
    const latest = await getTicketRowById(env, row.id)
    return {
      alreadyProcessed: true,
      tickets: Number(latest?.tickets || 0),
    }
  }

  throw new Error('ticket_events_insert_failed')
}

