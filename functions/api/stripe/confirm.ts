import { buildCorsHeaders, isCorsBlocked } from '../../_shared/cors'
import {
  type Env,
  creditCoinsWithIdempotency,
  extractUserContextFromSession,
  fetchStripeCheckoutSession,
  fetchSupabaseUser,
  getBearerToken,
  isPaidSession,
  jsonResponse,
  normalizeEmail,
  resolveCoinsFromSession,
} from './_shared'

const corsMethods = 'POST, OPTIONS'

const requiredEnvReady = (env: Env) =>
  Boolean(
    env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY) &&
      env.STRIPE_SECRET_KEY,
  )

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }
  return new Response(null, { status: 204, headers: corsHeaders })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }
  if (!requiredEnvReady(env)) {
    return jsonResponse({ error: '決済確認設定が未完了です。' }, 500, corsHeaders)
  }

  const token = getBearerToken(request)
  if (!token) {
    return jsonResponse({ error: 'ログインが必要です。' }, 401, corsHeaders)
  }

  const user = await fetchSupabaseUser(env, token)
  if (!user?.id || !user?.email) {
    return jsonResponse({ error: 'ログインが必要です。' }, 401, corsHeaders)
  }

  const body = await request.json().catch(() => ({}))
  const sessionId = String((body as any)?.session_id || (body as any)?.sessionId || '').trim()
  if (!sessionId) {
    return jsonResponse({ error: 'session_id が必要です。' }, 400, corsHeaders)
  }

  const stripeSession = await fetchStripeCheckoutSession(env, sessionId)
  if (!stripeSession.ok) {
    return jsonResponse({ error: stripeSession.error || '購入確認に失敗しました。' }, 502, corsHeaders)
  }

  const session = stripeSession.data
  if (!isPaidSession(session)) {
    return jsonResponse({ error: '決済が完了していません。' }, 409, corsHeaders)
  }

  const { email, userId } = extractUserContextFromSession(session)
  const currentEmail = normalizeEmail(user.email)
  const currentUserId = String(user.id)
  if (!userId || userId !== currentUserId || email !== currentEmail) {
    return jsonResponse({ error: '購入者情報が一致しません。' }, 403, corsHeaders)
  }

  const coins = resolveCoinsFromSession(session, env)
  if (!coins) {
    return jsonResponse({ error: '購入コイン数を確認できません。' }, 400, corsHeaders)
  }

  const usageId = `stripe_checkout:${session.id || sessionId}`
  try {
    const result = await creditCoinsWithIdempotency(env, {
      usageId,
      email,
      userId,
      coins,
      reason: 'stripe_checkout_credit',
      metadata: {
        source: 'stripe_confirm',
        checkout_session_id: session.id || sessionId,
        payment_status: session.payment_status || null,
        status: session.status || null,
        amount_total: session.amount_total ?? null,
        currency: session.currency || null,
      },
    })

    return jsonResponse(
      {
        ok: true,
        processed: !result.alreadyProcessed,
        alreadyProcessed: result.alreadyProcessed,
        tickets: result.tickets,
        coins: result.tickets,
        granted: coins,
        usage_id: usageId,
      },
      200,
      corsHeaders,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    return jsonResponse({ error: '購入コインの付与に失敗しました。', reason }, 500, corsHeaders)
  }
}
