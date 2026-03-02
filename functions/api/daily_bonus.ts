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
const DAILY_BONUS_AMOUNT = 1
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

const ensureDailyBonusStateRow = async (
  admin: ReturnType<typeof createClient>,
  ticketRow: TicketRow,
  userId: string,
) => {
  const initialEligibleAt = calculateInitialEligibleAt(ticketRow.created_at)
  const nowIso = new Date().toISOString()

  const { error: upsertError } = await admin.from('daily_bonus_state').upsert(
    {
      ticket_id: ticketRow.id,
      email: ticketRow.email,
      user_id: ticketRow.user_id ?? userId,
      first_eligible_at: initialEligibleAt,
      next_eligible_at: initialEligibleAt,
      updated_at: nowIso,
    },
    { onConflict: 'ticket_id', ignoreDuplicates: true },
  )
  if (upsertError) {
    return { data: null, error: upsertError }
  }

  return fetchDailyBonusState(admin, ticketRow.id)
}

const claimDailyBonusSlot = async (
  admin: ReturnType<typeof createClient>,
  ticketId: string,
  userId: string,
  currentNextEligibleAt: string,
  currentClaimCount: number,
) => {
  const nowIso = new Date().toISOString()
  const nextEligibleAt = new Date(Date.now() + BONUS_WAIT_MS).toISOString()
  const claimCount = Math.max(0, Math.floor(Number(currentClaimCount || 0)))

  const { data, error } = await admin
    .from('daily_bonus_state')
    .update({
      last_claimed_at: nowIso,
      next_eligible_at: nextEligibleAt,
      claim_count: claimCount + 1,
      user_id: userId,
      updated_at: nowIso,
    })
    .eq('ticket_id', ticketId)
    .eq('next_eligible_at', currentNextEligibleAt)
    .select('id')

  if (error) {
    return { claimed: false, nextEligibleAt: currentNextEligibleAt, error }
  }
  const claimed = Array.isArray(data) && data.length > 0
  return { claimed, nextEligibleAt, error: null as null }
}

const grantDailyBonusCoin = async (
  admin: ReturnType<typeof createClient>,
  ticketRow: TicketRow,
  user: User,
  nextEligibleAt: string,
) => {
  const usageId = `daily_bonus:${makeUsageId()}`
  const nowIso = new Date().toISOString()
  const metadata = {
    source: 'daily_bonus',
    claimed_at: nowIso,
    next_eligible_at: nextEligibleAt,
    fixed_award: DAILY_BONUS_AMOUNT,
  }

  const rpcGrant = await admin.rpc('grant_tickets', {
    p_usage_id: usageId,
    p_user_id: user.id,
    p_email: ticketRow.email,
    p_amount: DAILY_BONUS_AMOUNT,
    p_reason: 'daily_bonus',
    p_metadata: metadata,
  })

  if (!rpcGrant.error) {
    const grantResult = Array.isArray(rpcGrant.data) ? rpcGrant.data[0] : rpcGrant.data
    const rpcTicketsLeft = Number((grantResult as { tickets_left?: unknown })?.tickets_left)
    if (Number.isFinite(rpcTicketsLeft)) {
      return { ticketsLeft: rpcTicketsLeft, error: null as null }
    }

    // RPC succeeded but did not return tickets_left in this environment.
    const latest = await admin
      .from('user_tickets')
      .select('tickets')
      .eq('id', ticketRow.id)
      .maybeSingle()
    if (latest.error) {
      return { ticketsLeft: null, error: latest.error }
    }
    const latestTickets = Number((latest.data as { tickets?: unknown } | null)?.tickets)
    return {
      ticketsLeft: Number.isFinite(latestTickets)
        ? latestTickets
        : Math.max(0, Math.floor(Number(ticketRow.tickets || 0))) + DAILY_BONUS_AMOUNT,
      error: null as null,
    }
  }

  // Fallback: direct update when grant_tickets RPC is missing/mismatched.
  let currentTickets = Math.max(0, Math.floor(Number(ticketRow.tickets || 0)))
  for (let i = 0; i < 3; i += 1) {
    const targetTickets = currentTickets + DAILY_BONUS_AMOUNT
    const { data: updated, error: updateError } = await admin
      .from('user_tickets')
      .update({ tickets: targetTickets, updated_at: nowIso })
      .eq('id', ticketRow.id)
      .eq('tickets', currentTickets)
      .select('tickets')
      .maybeSingle()

    if (updateError) {
      return { ticketsLeft: null, error: updateError }
    }

    if (updated) {
      await admin.from('ticket_events').insert({
        usage_id: usageId,
        email: ticketRow.email,
        user_id: user.id,
        delta: DAILY_BONUS_AMOUNT,
        reason: 'daily_bonus',
        metadata,
        created_at: nowIso,
      })
      return { ticketsLeft: targetTickets, error: null as null }
    }

    const { data: freshTicket, error: freshError } = await admin
      .from('user_tickets')
      .select('tickets')
      .eq('id', ticketRow.id)
      .maybeSingle()
    if (freshError) {
      return { ticketsLeft: null, error: freshError }
    }
    if (!freshTicket) {
      return { ticketsLeft: null, error: new Error('No ticket row.') as Error }
    }
    currentTickets = Math.max(0, Math.floor(Number((freshTicket as { tickets?: unknown }).tickets || 0)))
  }

  return { ticketsLeft: null, error: new Error('Failed to grant daily bonus.') as Error }
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

  const bonusState = await ensureDailyBonusStateRow(auth.admin, ticketRow, auth.user.id)
  if (bonusState.error) {
    return jsonResponse({ error: bonusState.error.message }, 500, corsHeaders)
  }
  if (!bonusState.data) {
    return jsonResponse({ error: 'daily_bonus_state row not found.' }, 500, corsHeaders)
  }

  const nowMs = Date.now()
  const currentNextEligibleAt = bonusState.data.next_eligible_at ?? calculateInitialEligibleAt(ticketRow.created_at)
  const nextEligibleMs = new Date(currentNextEligibleAt).getTime()
  const canClaim = Number.isFinite(nextEligibleMs) ? nowMs >= nextEligibleMs : false

  if (!canClaim) {
    return jsonResponse(
      {
        granted: false,
        ticketsLeft: ticketRow.tickets,
        nextEligibleAt: currentNextEligibleAt,
        awarded: 0,
        message: 'NOT_ELIGIBLE',
      },
      200,
      corsHeaders,
    )
  }

  const claimSlot = await claimDailyBonusSlot(
    auth.admin,
    ticketRow.id,
    auth.user.id,
    currentNextEligibleAt,
    bonusState.data.claim_count ?? 0,
  )
  if (claimSlot.error) {
    return jsonResponse({ error: claimSlot.error.message }, 500, corsHeaders)
  }

  if (!claimSlot.claimed) {
    const latestBonus = await fetchDailyBonusState(auth.admin, ticketRow.id)
    const latestTickets = await fetchTicketRow(auth.admin, auth.user)
    return jsonResponse(
      {
        granted: false,
        ticketsLeft: latestTickets.data?.tickets ?? ticketRow.tickets,
        nextEligibleAt: latestBonus.data?.next_eligible_at ?? currentNextEligibleAt,
        awarded: 0,
        message: 'NOT_ELIGIBLE',
      },
      200,
      corsHeaders,
    )
  }

  const grant = await grantDailyBonusCoin(auth.admin, ticketRow, auth.user, claimSlot.nextEligibleAt)
  if (grant.error) {
    // Best effort rollback so user is not locked out if grant failed.
    await auth.admin
      .from('daily_bonus_state')
      .update({
        last_claimed_at: bonusState.data.last_claimed_at,
        next_eligible_at: currentNextEligibleAt,
        claim_count: bonusState.data.claim_count ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('ticket_id', ticketRow.id)
      .eq('next_eligible_at', claimSlot.nextEligibleAt)
    return jsonResponse({ error: grant.error.message }, 500, corsHeaders)
  }

  const safeTicketsLeft = Number.isFinite(Number(grant.ticketsLeft))
    ? Number(grant.ticketsLeft)
    : ticketRow.tickets + DAILY_BONUS_AMOUNT

  return jsonResponse(
    {
      granted: true,
      ticketsLeft: safeTicketsLeft,
      nextEligibleAt: claimSlot.nextEligibleAt,
      awarded: DAILY_BONUS_AMOUNT,
      message: null,
    },
    200,
    corsHeaders,
  )
}

