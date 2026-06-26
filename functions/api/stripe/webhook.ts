import {
  type Env,
  creditCoinsWithIdempotency,
  extractUserContextFromSession,
  isPaidSession,
  jsonResponse,
  parsePositiveInt,
  resolveCoinsFromSession,
} from './_shared'

const HANDLED_EVENT_TYPES = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

const parseStripeSignatureHeader = (header: string | null) => {
  const out: { timestamp: number | null; v1: string[] } = { timestamp: null, v1: [] }
  if (!header) return out
  for (const part of header.split(',')) {
    const [rawKey, rawValue] = part.split('=')
    const key = rawKey?.trim()
    const value = rawValue?.trim()
    if (!key || !value) continue
    if (key === 't') out.timestamp = Number(value)
    if (key === 'v1') out.v1.push(value)
  }
  return out
}

const timingSafeEqualHex = (a: string, b: string) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

const hmacSha256Hex = async (secret: string, message: string) => {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const verifyStripeSignature = async (
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSec = 300,
) => {
  const parsed = parseStripeSignatureHeader(signatureHeader)
  if (!Number.isFinite(parsed.timestamp) || parsed.v1.length === 0 || parsed.timestamp === null) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parsed.timestamp) > toleranceSec) return false
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`)
  return parsed.v1.some((sig) => timingSafeEqualHex(sig, expected))
}

const hasRequiredEnv = (env: Env) =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.STRIPE_WEBHOOK_SECRET)

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: { Allow: 'POST, OPTIONS' },
  })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasRequiredEnv(env)) {
    return jsonResponse({ error: 'Webhook設定が未完了です。' }, 500)
  }

  const rawBody = await request.text()
  const signatureHeader = request.headers.get('stripe-signature')
  const tolerance = parsePositiveInt(env.STRIPE_WEBHOOK_TOLERANCE_SEC) || 300
  const verified = await verifyStripeSignature(rawBody, signatureHeader, String(env.STRIPE_WEBHOOK_SECRET), tolerance)
  if (!verified) {
    return jsonResponse({ error: 'Invalid signature' }, 400)
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  if (!HANDLED_EVENT_TYPES.has(event?.type)) {
    return jsonResponse({ received: true, ignored: true, type: event?.type || 'unknown' })
  }

  const session = event?.data?.object
  if (!isPaidSession(session, event.type)) {
    return jsonResponse({ received: true, ignored: true, reason: 'session_not_paid' })
  }

  const { email, userId } = extractUserContextFromSession(session)
  if (!email) {
    return jsonResponse({ error: 'customer email missing' }, 400)
  }

  const coins = resolveCoinsFromSession(session, env)
  if (!coins) {
    return jsonResponse({ error: 'coins metadata missing' }, 400)
  }

  const sessionId = String(session?.id || '')
  if (!sessionId) {
    return jsonResponse({ error: 'checkout session id missing' }, 400)
  }

  const usageId = `stripe_checkout:${sessionId}`
  try {
    const result = await creditCoinsWithIdempotency(env, {
      usageId,
      email,
      userId,
      coins,
      reason: 'stripe_checkout_credit',
      metadata: {
        source: 'stripe_webhook',
        event_type: event.type,
        event_id: event.id,
        checkout_session_id: sessionId,
        livemode: Boolean(event.livemode),
        amount_total: session.amount_total ?? null,
        currency: session.currency || null,
      },
    })

    return jsonResponse({
      received: true,
      processed: !result.alreadyProcessed,
      tickets: result.tickets,
      usage_id: usageId,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    return jsonResponse({ error: 'Webhook processing failed', reason }, 500)
  }
}
