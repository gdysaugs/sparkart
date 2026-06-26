import { buildCorsHeaders, isCorsBlocked } from '../../_shared/cors'
import {
  type Env,
  PRICE_PLANS,
  fetchSupabaseUser,
  getBearerToken,
  jsonResponse,
  normalizeEmail,
} from './_shared'

const corsMethods = 'POST, OPTIONS'

const getOriginFromRequest = (request: Request, env: Env) => {
  const configured = String(env.STRIPE_RETURN_ORIGIN || '').trim()
  if (configured) return configured.replace(/\/$/, '')
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

const withSessionId = (value: string) =>
  value.includes('{CHECKOUT_SESSION_ID}') ? value : `${value}${value.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`

const buildCheckoutPayload = ({
  request,
  user,
  priceId,
  plan,
  env,
}: {
  request: Request
  user: any
  priceId: string
  plan: { name: string; coins: number; amountJpy: number }
  env: Env
}) => {
  const email = normalizeEmail(user.email)
  const origin = getOriginFromRequest(request, env)
  const successUrl = withSessionId(
    String(env.STRIPE_SUCCESS_URL || `${origin}/purchase?checkout=success`),
  )
  const cancelUrl = String(env.STRIPE_CANCEL_URL || `${origin}/purchase?checkout=cancel`)
  const params = new URLSearchParams()

  params.set('mode', 'payment')
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('line_items[0][price]', priceId)
  params.set('line_items[0][quantity]', '1')
  params.set('client_reference_id', String(user.id))
  params.set('customer_email', email)
  params.set('locale', 'ja')
  params.set('metadata[user_id]', String(user.id))
  params.set('metadata[email]', email)
  params.set('metadata[coins]', String(plan.coins))
  params.set('metadata[price_id]', priceId)
  params.set('metadata[plan]', plan.name)
  params.set('metadata[amount_jpy]', String(plan.amountJpy))
  params.set('payment_intent_data[metadata][user_id]', String(user.id))
  params.set('payment_intent_data[metadata][email]', email)
  params.set('payment_intent_data[metadata][coins]', String(plan.coins))
  params.set('payment_intent_data[metadata][price_id]', priceId)

  return params
}

const requiredEnvReady = (env: Env) =>
  Boolean(env.SUPABASE_URL && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY) && env.STRIPE_SECRET_KEY)

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
    return jsonResponse({ error: '決済設定が未完了です。' }, 500, corsHeaders)
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
  const priceId = String((body as any)?.price_id || (body as any)?.priceId || '')
  const plan = PRICE_PLANS[priceId]
  if (!plan) {
    return jsonResponse({ error: '無効な価格IDです。' }, 400, corsHeaders)
  }

  const stripePayload = buildCheckoutPayload({ request, user, priceId, plan, env })
  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: stripePayload.toString(),
  })
  const parsed = await stripeRes.json().catch(() => null)

  if (!stripeRes.ok) {
    const message = parsed?.error?.message || '決済ページの作成に失敗しました。'
    return jsonResponse({ error: message }, 502, corsHeaders)
  }

  if (!parsed?.url) {
    return jsonResponse({ error: '決済URLの取得に失敗しました。' }, 502, corsHeaders)
  }

  return jsonResponse(
    {
      ok: true,
      checkoutSessionId: parsed.id,
      url: parsed.url,
    },
    200,
    corsHeaders,
  )
}
