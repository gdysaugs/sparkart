import { buildCorsHeaders, isCorsBlocked } from '../../_shared/cors'

type Env = {
  CORS_ALLOWED_ORIGINS?: string
}

const corsMethods = 'POST, OPTIONS'

const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  })

const deprecatedBody = {
  error: 'Deprecated endpoint.',
  message: 'Use https://checkoutcoins.uk for coin purchase and Stripe checkout.',
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }
  return jsonResponse(deprecatedBody, 410, corsHeaders)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }
  return jsonResponse(deprecatedBody, 410, corsHeaders)
}
