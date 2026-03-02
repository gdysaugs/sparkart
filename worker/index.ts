import { onRequestGet as qwenGet, onRequestPost as qwenPost, onRequestOptions as qwenOptions } from '../functions/api/qwen'
import { onRequestGet as wanGet, onRequestPost as wanPost, onRequestOptions as wanOptions } from '../functions/api/wan'
import { onRequestGet as wanRemixGet, onRequestPost as wanRemixPost, onRequestOptions as wanRemixOptions } from '../functions/api/wan_remix'
import { onRequestGet as wanRapidGet, onRequestPost as wanRapidPost, onRequestOptions as wanRapidOptions } from '../functions/api/wan-rapid'
import { onRequestGet as ticketsGet, onRequestOptions as ticketsOptions } from '../functions/api/tickets'
import { onRequestGet as dailyBonusGet, onRequestPost as dailyBonusPost, onRequestOptions as dailyBonusOptions } from '../functions/api/daily_bonus'
import { onRequestPost as r2PresignPost, onRequestOptions as r2PresignOptions } from '../functions/api/r2_presign'
import { onRequestPost as stripeCheckoutPost, onRequestOptions as stripeCheckoutOptions } from '../functions/api/stripe/checkout'
import { onRequestPost as stripeWebhookPost, onRequestOptions as stripeWebhookOptions } from '../functions/api/stripe/webhook'

type Env = {
  RUNPOD_API_KEY: string
  RUNPOD_ENDPOINT_URL?: string
  RUNPOD_WAN_ENDPOINT_URL?: string
  RUNPOD_WAN_REMIX_ENDPOINT_URL?: string
  RUNPOD_WAN_RAPID_ENDPOINT_URL?: string
  COMFY_ORG_API_KEY?: string
  RUNPOD_WORKER_MODE?: string
  R2_ACCOUNT_ID?: string
  R2_BUCKET?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_REGION?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_SUCCESS_URL?: string
  STRIPE_CANCEL_URL?: string
  CORS_ALLOWED_ORIGINS?: string
}

type PagesArgs = {
  request: Request
  env: Env
}

const notFound = () => new Response('Not Found', { status: 404 })
const methodNotAllowed = () => new Response('Method Not Allowed', { status: 405 })

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method.toUpperCase()
    const args: PagesArgs = { request, env }

    if (path.startsWith('/api/qwen')) {
      if (method === 'OPTIONS') return qwenOptions(args as any)
      if (method === 'GET') return qwenGet(args as any)
      if (method === 'POST') return qwenPost(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/wan-remix')) {
      if (method === 'OPTIONS') return wanRemixOptions(args as any)
      if (method === 'GET') return wanRemixGet(args as any)
      if (method === 'POST') return wanRemixPost(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/wan-rapid')) {
      if (method === 'OPTIONS') return wanRapidOptions(args as any)
      if (method === 'GET') return wanRapidGet(args as any)
      if (method === 'POST') return wanRapidPost(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/wan')) {
      if (method === 'OPTIONS') return wanOptions(args as any)
      if (method === 'GET') return wanGet(args as any)
      if (method === 'POST') return wanPost(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/tickets')) {
      if (method === 'OPTIONS') return ticketsOptions(args as any)
      if (method === 'GET') return ticketsGet(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/daily_bonus')) {
      if (method === 'OPTIONS') return dailyBonusOptions(args as any)
      if (method === 'GET') return dailyBonusGet(args as any)
      if (method === 'POST') return dailyBonusPost(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/r2_presign')) {
      if (method === 'OPTIONS') return r2PresignOptions(args as any)
      if (method === 'POST') return r2PresignPost(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/stripe/checkout')) {
      if (method === 'OPTIONS') return stripeCheckoutOptions(args as any)
      if (method === 'POST') return stripeCheckoutPost(args as any)
      return methodNotAllowed()
    }

    if (path.startsWith('/api/stripe/webhook')) {
      if (method === 'OPTIONS') return stripeWebhookOptions(args as any)
      if (method === 'POST') return stripeWebhookPost(args as any)
      return methodNotAllowed()
    }

    return notFound()
  },
}
