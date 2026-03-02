import { createClient, type User } from '@supabase/supabase-js'
import { buildCorsHeaders, isCorsBlocked } from '../_shared/cors'

type Env = {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

type TicketRow = {
  id: string
  email: string
  user_id: string | null
  tickets: number
  created_at: string
}

type DailyBonusStateRow = {
  next_eligible_at: string
  last_claimed_at: string | null
  claim_count: number
}

const SIGNUP_TICKET_GRANT = 5
const BONUS_WAIT_MS = 24 * 60 * 60 * 1000
const corsMethods = 'GET, POST, OPTIONS'

const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const extractBearerToken = (request: Request) => {
  const header = request.headers.get('Authorization') || ''
  const match = header.match(/Bearer\s+(.+)/i)
  return match ? match[1] : ''
}

const getSupabaseAdmin = (env: Env) => {
  const url = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const makeUsageId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
const fetchTicketRow = async (admin: ReturnType<typeof createClient>, user: User) => {
  const email = user.email
  const { data: byUser, error: userError } = await admin
    .from('user_tickets')
    .select('id, email, user_id, tickets, created_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (userError) {
    return { error: userError }
  }
  if (byUser) {
    return { data: byUser as TicketRow, error: null }
  }
  if (!email) {
    return { data: null, error: null }
  }
  const { data: byEmail, error: emailError } = await admin
    .from('user_tickets')
    .select('id, email, user_id, tickets, created_at')
    .eq('email', email)
    .maybeSingle()
  if (emailError) {
    return { error: emailError }
  }
  return { data: (byEmail as TicketRow | null) ?? null, error: null }
}

const ensureTicketRow = async (admin: ReturnType<typeof createClient>, user: User) => {
  const email = user.email
  if (!email) {
    return { data: null, error: null }
  }

  const { data: existing, error } = await fetchTicketRow(admin, user)
  if (error) {
    return { data: null, error }
  }
  if (existing) {
    return { data: existing, error: null, created: false }
  }

  const { data: inserted, error: insertError } = await admin
    .from('user_tickets')
    .insert({ email, user_id: user.id, tickets: SIGNUP_TICKET_GRANT })
    .select('id, email, user_id, tickets, created_at')
    .maybeSingle()

  if (insertError || !inserted) {
    const { data: retry, error: retryError } = await fetchTicketRow(admin, user)
    if (retryError) {
      return { data: null, error: retryError }
    }
    return { data: retry, error: null, created: false }
  }

  const usageId = makeUsageId()
  await admin.from('ticket_events').insert({
    usage_id: usageId,
    email,
    user_id: user.id,
    delta: SIGNUP_TICKET_GRANT,
    reason: 'signup_bonus',
    metadata: { source: 'auto_grant' },
  })

  return { data: inserted as TicketRow, error: null, created: true }
}

const fetchDailyBonusState = async (admin: ReturnType<typeof createClient>, ticketId: string) => {
  const { data, error } = await admin
    .from('daily_bonus_state')
    .select('next_eligible_at, last_claimed_at, claim_count')
    .eq('ticket_id', ticketId)
    .maybeSingle()
  if (error) {
    return { data: null, error }
  }
  return { data: (data as DailyBonusStateRow | null) ?? null, error: null }
}

const calculateInitialEligibleAt = (createdAt: string) => {
  const createdMs = new Date(createdAt).getTime()
  if (!Number.isFinite(createdMs)) {
    return new Date(Date.now() + BONUS_WAIT_MS).toISOString()
  }
  return new Date(createdMs + BONUS_WAIT_MS).toISOString()
}

const isGoogleUser = (user: User) => {
  if (user.app_metadata?.provider === 'google') return true
  if (Array.isArray(user.identities)) {
    return user.identities.some((identity) => identity.provider === 'google')
  }
  return false
}

const requireGoogleUser = async (request: Request, env: Env, corsHeaders: HeadersInit) => {
  const token = extractBearerToken(request)
  if (!token) {
    return { response: jsonResponse({ error: 'ログインが必要です。' }, 401, corsHeaders) }
  }
  const admin = getSupabaseAdmin(env)
  if (!admin) {
    return {
      response: jsonResponse({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.' }, 500, corsHeaders),
    }
  }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    return { response: jsonResponse({ error: '認証に失敗しました。' }, 401, corsHeaders) }
  }
  if (!isGoogleUser(data.user)) {
    return { response: jsonResponse({ error: 'Googleログインのみ利用できます。' }, 403, corsHeaders) }
  }
  return { admin, user: data.user }
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }
  return new Response(null, { headers: corsHeaders })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }

  const auth = await requireGoogleUser(request, env, corsHeaders)
  if ('response' in auth) {
    return auth.response
  }

  const { data: ticketRow, error } = await ensureTicketRow(auth.admin, auth.user)
  if (error) {
    return jsonResponse({ error: error.message }, 500, corsHeaders)
  }
  if (!ticketRow) {
    return jsonResponse({ error: 'No ticket row.' }, 500, corsHeaders)
  }

  const bonus = await fetchDailyBonusState(auth.admin, ticketRow.id)
  if (bonus.error) {
    return jsonResponse({ error: bonus.error.message }, 500, corsHeaders)
  }

  const nextEligibleAt = bonus.data?.next_eligible_at ?? calculateInitialEligibleAt(ticketRow.created_at)
  const nowMs = Date.now()
  const nextEligibleMs = new Date(nextEligibleAt).getTime()
  const canClaim = Number.isFinite(nextEligibleMs) ? nowMs >= nextEligibleMs : false

  return jsonResponse(
    {
      canClaim,
      nextEligibleAt,
      lastClaimedAt: bonus.data?.last_claimed_at ?? null,
      claimCount: bonus.data?.claim_count ?? 0,
      tickets: ticketRow.tickets,
    },
    200,
    corsHeaders,
  )
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }

  const auth = await requireGoogleUser(request, env, corsHeaders)
  if ('response' in auth) {
    return auth.response
  }

  const email = auth.user.email
  if (!email) {
    return jsonResponse({ error: 'メールアドレスが取得できません。' }, 400, corsHeaders)
  }

  const { data: ticketRow, error: ticketError } = await ensureTicketRow(auth.admin, auth.user)
  if (ticketError) {
    return jsonResponse({ error: ticketError.message }, 500, corsHeaders)
  }
  if (!ticketRow) {
    return jsonResponse({ error: 'No ticket row.' }, 500, corsHeaders)
  }

  const { data, error } = await auth.admin.rpc('claim_daily_bonus', {
    p_email: email,
    p_user_id: auth.user.id,
  })
  if (error) {
    return jsonResponse({ error: error.message }, 500, corsHeaders)
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result !== 'object') {
    return jsonResponse({ error: 'claim result is empty.' }, 500, corsHeaders)
  }

  const nextEligibleAt = (result as { next_eligible_at?: string }).next_eligible_at ?? null
  const granted = Boolean((result as { granted?: unknown }).granted)
  const rpcTicketsLeft = Number((result as { tickets_left?: unknown }).tickets_left)
  let normalizedTicketsLeft: number | null = Number.isFinite(rpcTicketsLeft) ? rpcTicketsLeft : null
  const awarded = granted ? 1 : 0

  if (granted) {
    const targetTickets = Math.max(0, Math.floor(Number(ticketRow.tickets ?? 0)) + awarded)

    if (typeof normalizedTicketsLeft === 'number' && normalizedTicketsLeft !== targetTickets) {
      if (normalizedTicketsLeft > targetTickets) {
        const adjustDown = normalizedTicketsLeft - targetTickets
        if (adjustDown > 0) {
          const { data: consumeData } = await auth.admin.rpc('consume_tickets', {
            p_ticket_id: ticketRow.id,
            p_usage_id: `daily_bonus_adjust_down:${makeUsageId()}`,
            p_cost: adjustDown,
            p_reason: 'daily_bonus_adjust',
            p_metadata: { source: 'daily_bonus', fixed_award: 1 },
          })
          const consumeResult = Array.isArray(consumeData) ? consumeData[0] : consumeData
          const consumedTickets = Number((consumeResult as { tickets_left?: unknown })?.tickets_left)
          if (Number.isFinite(consumedTickets)) {
            normalizedTicketsLeft = consumedTickets
          }
        }
      } else if (normalizedTicketsLeft < targetTickets) {
        const adjustUp = targetTickets - normalizedTicketsLeft
        if (adjustUp > 0) {
          const { data: grantData } = await auth.admin.rpc('grant_tickets', {
            p_usage_id: `daily_bonus_adjust_up:${makeUsageId()}`,
            p_user_id: auth.user.id,
            p_email: email,
            p_amount: adjustUp,
            p_reason: 'daily_bonus_adjust',
            p_metadata: { source: 'daily_bonus', fixed_award: 1 },
          })
          const grantResult = Array.isArray(grantData) ? grantData[0] : grantData
          const grantedTickets = Number((grantResult as { tickets_left?: unknown })?.tickets_left)
          if (Number.isFinite(grantedTickets)) {
            normalizedTicketsLeft = grantedTickets
          }
        }
      }
    }

    if (!Number.isFinite(normalizedTicketsLeft)) {
      const latest = await fetchTicketRow(auth.admin, auth.user)
      if (latest.data) {
        const latestTickets = Number(latest.data.tickets)
        normalizedTicketsLeft = Number.isFinite(latestTickets) ? latestTickets : targetTickets
      } else {
        normalizedTicketsLeft = targetTickets
      }
    }

    const latestAfterAdjust = await fetchTicketRow(auth.admin, auth.user)
    if (latestAfterAdjust.data) {
      const latestTickets = Number(latestAfterAdjust.data.tickets)
      if (Number.isFinite(latestTickets) && latestTickets !== targetTickets) {
        const nowIso = new Date().toISOString()
        const { data: forcedTicketRow } = await auth.admin
          .from('user_tickets')
          .update({ tickets: targetTickets, updated_at: nowIso })
          .eq('id', ticketRow.id)
          .eq('tickets', latestTickets)
          .select('tickets')
          .maybeSingle()
        if (forcedTicketRow) {
          const forcedTickets = Number((forcedTicketRow as { tickets?: unknown }).tickets)
          normalizedTicketsLeft = Number.isFinite(forcedTickets) ? forcedTickets : targetTickets
        } else {
          normalizedTicketsLeft = latestTickets
        }
      } else if (Number.isFinite(latestTickets)) {
        normalizedTicketsLeft = latestTickets
      }
    }
  }

  const safeTicketsLeft = typeof normalizedTicketsLeft === 'number' && Number.isFinite(normalizedTicketsLeft)
    ? normalizedTicketsLeft
    : null

  return jsonResponse(
    {
      granted,
      ticketsLeft: safeTicketsLeft,
      nextEligibleAt,
      awarded,
      message: (result as { message?: string }).message ?? null,
    },
    200,
    corsHeaders,
  )
}

