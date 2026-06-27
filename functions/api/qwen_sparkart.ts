import workflowTemplate from './qwen-sparkart-workflow.json'
import { createClient, type User } from '@supabase/supabase-js'
import { buildCorsHeaders, isCorsBlocked } from '../_shared/cors'

type Env = {
  RUNPOD_API_KEY: string
  RUNPOD_QWEN_ENDPOINT_URL?: string
  RUNPOD_ENDPOINT_URL?: string
  COMFY_ORG_API_KEY?: string
  CORS_ALLOWED_ORIGINS?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const corsMethods = 'POST, GET, OPTIONS'
const DEFAULT_QWEN_EDIT_ENDPOINT = 'https://api.runpod.ai/v2/h7p0hwtyzvndp5'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_PROMPT_LENGTH = 1000
const MIN_DIMENSION = 256
const MAX_DIMENSION = 1024
const SIGNUP_TICKET_GRANT = 5

const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })

const INTERNAL_ERROR_MESSAGE = 'エラーです。やり直してください。'
const internalErrorResponse = (corsHeaders: HeadersInit) =>
  jsonResponse({ error: INTERNAL_ERROR_MESSAGE }, 500, corsHeaders)

const normalizeEndpoint = (value?: string) => {
  if (!value) return ''
  const trimmed = value.trim().replace(/^['\"]|['\"]$/g, '')
  if (!trimmed) return ''
  const normalized = trimmed.replace(/\/+$/, '')
  try {
    const parsed = new URL(normalized)
    if (!/^https?:$/.test(parsed.protocol)) return ''
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length >= 2 && segments[0].toLowerCase() === 'v2') {
      return `${parsed.origin}/v2/${segments[1]}`
    }
    const cleanedPath = parsed.pathname.replace(/\/+$/, '').replace(/\/run(?:sync)?$/i, '')
    return `${parsed.origin}${cleanedPath}`
  } catch {
    return ''
  }
}

const resolveEndpoint = (env: Env) =>
  normalizeEndpoint(env.RUNPOD_QWEN_ENDPOINT_URL) ||
  normalizeEndpoint(env.RUNPOD_ENDPOINT_URL) ||
  DEFAULT_QWEN_EDIT_ENDPOINT

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

const requireAuthenticatedUser = async (request: Request, env: Env, corsHeaders: HeadersInit) => {
  const token = extractBearerToken(request)
  if (!token) {
    return { response: jsonResponse({ error: 'Login is required.' }, 401, corsHeaders) }
  }
  const admin = getSupabaseAdmin(env)
  if (!admin) {
    return {
      response: jsonResponse(
        { error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.' },
        500,
        corsHeaders,
      ),
    }
  }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    return { response: jsonResponse({ error: 'Authentication failed.' }, 401, corsHeaders) }
  }
  return { admin, user: data.user }
}

const makeUsageId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const fetchTicketRow = async (
  admin: ReturnType<typeof createClient>,
  user: User,
) => {
  const email = user.email
  const { data: byUser, error: userError } = await admin
    .from('user_tickets')
    .select('id, email, user_id, tickets')
    .eq('user_id', user.id)
    .maybeSingle()
  if (userError) {
    return { error: userError }
  }
  if (byUser) {
    return { data: byUser, error: null }
  }
  if (!email) {
    return { data: null, error: null }
  }
  const { data: byEmail, error: emailError } = await admin
    .from('user_tickets')
    .select('id, email, user_id, tickets')
    .eq('email', email)
    .maybeSingle()
  if (emailError) {
    return { error: emailError }
  }
  return { data: byEmail, error: null }
}

const ensureTicketRow = async (
  admin: ReturnType<typeof createClient>,
  user: User,
) => {
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
    .select('id, email, user_id, tickets')
    .maybeSingle()

  if (insertError || !inserted) {
    const { data: retry, error: retryError } = await fetchTicketRow(admin, user)
    if (retryError) {
      return { data: null, error: retryError }
    }
    return { data: retry, error: null, created: false }
  }

  const grantUsageId = makeUsageId()
  await admin.from('ticket_events').insert({
    usage_id: grantUsageId,
    email,
    user_id: user.id,
    delta: SIGNUP_TICKET_GRANT,
    reason: 'signup_bonus',
    metadata: { source: 'auto_grant' },
  })

  return { data: inserted, error: null, created: true }
}

const ensureTicketAvailable = async (
  admin: ReturnType<typeof createClient>,
  user: User,
  requiredTickets = 1,
  corsHeaders: HeadersInit = {},
) => {
  const email = user.email
  if (!email) {
    return { response: jsonResponse({ error: 'Email not available.' }, 400, corsHeaders) }
  }

  const { data: existing, error } = await ensureTicketRow(admin, user)
  if (error) {
    return { response: internalErrorResponse(corsHeaders) }
  }
  if (!existing) {
    return { response: jsonResponse({ error: 'No tickets remaining.' }, 402, corsHeaders) }
  }
  if (!existing.user_id) {
    await admin.from('user_tickets').update({ user_id: user.id }).eq('id', existing.id)
  }
  if (existing.tickets < requiredTickets) {
    return { response: jsonResponse({ error: 'No tickets remaining.' }, 402, corsHeaders) }
  }

  return { existing }
}

const consumeTicket = async (
  admin: ReturnType<typeof createClient>,
  user: User,
  metadata: Record<string, unknown>,
  usageId?: string,
  ticketCost = 1,
  corsHeaders: HeadersInit = {},
) => {
  const cost = Math.max(1, Math.floor(ticketCost))
  const email = user.email
  if (!email) {
    return { response: jsonResponse({ error: 'Email not available.' }, 400, corsHeaders) }
  }

  const { data: existing, error } = await fetchTicketRow(admin, user)
  if (error) {
    return { response: internalErrorResponse(corsHeaders) }
  }
  if (!existing) {
    return { response: jsonResponse({ error: 'No tickets available.' }, 402, corsHeaders) }
  }
  if (!existing.user_id) {
    await admin.from('user_tickets').update({ user_id: user.id }).eq('id', existing.id)
  }

  const resolvedUsageId = usageId ?? makeUsageId()
  const { data: rpcData, error: rpcError } = await admin.rpc('consume_tickets', {
    p_ticket_id: existing.id,
    p_usage_id: resolvedUsageId,
    p_cost: cost,
    p_reason: 'generate_image',
    p_metadata: metadata,
  })

  if (rpcError) {
    const message = rpcError.message ?? 'Failed to update tickets.'
    if (message.includes('INSUFFICIENT_TICKETS')) {
      return { response: jsonResponse({ error: 'No tickets remaining.' }, 402, corsHeaders) }
    }
    if (message.includes('INVALID')) {
      return { response: jsonResponse({ error: 'Invalid ticket request.' }, 400, corsHeaders) }
    }
    return { response: internalErrorResponse(corsHeaders) }
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
  const ticketsLeft = Number(result?.tickets_left)
  const alreadyConsumed = Boolean(result?.already_consumed)
  return {
    ticketsLeft: Number.isFinite(ticketsLeft) ? ticketsLeft : undefined,
    alreadyConsumed,
  }
}

const refundTicket = async (
  admin: ReturnType<typeof createClient>,
  user: User,
  metadata: Record<string, unknown>,
  usageId?: string,
  ticketAmount = 1,
  corsHeaders: HeadersInit = {},
) => {
  const amount = Math.max(1, Math.floor(ticketAmount))
  const email = user.email
  if (!email || !usageId) {
    return { skipped: true }
  }

  const { data: chargeEvent, error: chargeError } = await admin
    .from('ticket_events')
    .select('usage_id, user_id, email')
    .eq('usage_id', usageId)
    .maybeSingle()

  if (chargeError) {
    return { response: internalErrorResponse(corsHeaders) }
  }

  const chargeUserId = chargeEvent?.user_id ? String(chargeEvent.user_id) : ''
  const chargeEmail = chargeEvent?.email ? String(chargeEvent.email) : ''
  const matchesUser = Boolean(chargeUserId && chargeUserId === user.id)
  const matchesEmail = Boolean(chargeEmail && chargeEmail.toLowerCase() === email.toLowerCase())
  if (!chargeEvent || (!matchesUser && !matchesEmail)) {
    return { skipped: true }
  }

  const refundUsageId = `${usageId}:refund`
  const { data: existingRefund, error: refundCheckError } = await admin
    .from('ticket_events')
    .select('usage_id')
    .eq('usage_id', refundUsageId)
    .maybeSingle()

  if (refundCheckError) {
    return { response: internalErrorResponse(corsHeaders) }
  }

  if (existingRefund) {
    return { alreadyRefunded: true }
  }

  const { data: existing, error } = await ensureTicketRow(admin, user)
  if (error) {
    return { response: internalErrorResponse(corsHeaders) }
  }
  if (!existing) {
    return { response: jsonResponse({ error: 'No tickets available.' }, 402, corsHeaders) }
  }
  if (!existing.user_id) {
    await admin.from('user_tickets').update({ user_id: user.id }).eq('id', existing.id)
  }

  const { data: rpcData, error: rpcError } = await admin.rpc('refund_tickets', {
    p_ticket_id: existing.id,
    p_usage_id: refundUsageId,
    p_amount: amount,
    p_reason: 'refund',
    p_metadata: metadata,
  })

  if (rpcError) {
    const message = rpcError.message ?? 'Failed to refund tickets.'
    if (message.includes('INVALID')) {
      return { response: jsonResponse({ error: message }, 400, corsHeaders) }
    }
    return { response: internalErrorResponse(corsHeaders) }
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
  const ticketsLeft = Number(result?.tickets_left)
  const alreadyRefunded = Boolean(result?.already_refunded)
  return {
    ticketsLeft: Number.isFinite(ticketsLeft) ? ticketsLeft : undefined,
    alreadyRefunded,
  }
}

const ensureUsageOwnership = async (
  admin: ReturnType<typeof createClient>,
  user: User,
  usageId: string,
  corsHeaders: HeadersInit,
) => {
  const { data: chargeEvent, error: chargeError } = await admin
    .from('ticket_events')
    .select('user_id, email')
    .eq('usage_id', usageId)
    .maybeSingle()

  if (chargeError) {
    return { response: internalErrorResponse(corsHeaders) }
  }
  if (!chargeEvent) {
    return { response: jsonResponse({ error: 'Job not found.' }, 404, corsHeaders) }
  }

  const email = user.email ?? ''
  const chargeUserId = chargeEvent.user_id ? String(chargeEvent.user_id) : ''
  const chargeEmail = chargeEvent.email ? String(chargeEvent.email) : ''
  const matchesUser = Boolean(chargeUserId && chargeUserId === user.id)
  const matchesEmail = Boolean(email && chargeEmail && chargeEmail.toLowerCase() === email.toLowerCase())
  if (!matchesUser && !matchesEmail) {
    return { response: jsonResponse({ error: 'Job not found.' }, 404, corsHeaders) }
  }

  return { ok: true as const }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const stripDataUrl = (value: string) => {
  const comma = value.indexOf(',')
  if (value.startsWith('data:') && comma !== -1) {
    return value.slice(comma + 1)
  }
  return value
}

const estimateBase64Bytes = (value: string) => {
  const trimmed = value.trim()
  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding)
}

const ensureBase64Input = (label: string, value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error(`${label} must be base64 (URL is not allowed).`)
  }
  const base64 = stripDataUrl(trimmed)
  if (!base64) return ''
  const bytes = estimateBase64Bytes(base64)
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error(`${label} is too large (max 10MB).`)
  }
  return base64
}

const pickInputValue = (input: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = input[key]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }
  return undefined
}

const toInt = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

const toPromptToken = (value: unknown) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed
}

const buildPromptWithMultiAngle = (
  basePrompt: string,
  input: Record<string, unknown>,
  enabled: boolean,
) => {
  const prompt = basePrompt.trim()
  if (!enabled) return prompt

  const azimuth = toPromptToken(input.multiangle_azimuth)
  const elevation = toPromptToken(input.multiangle_elevation)
  const distance = toPromptToken(input.multiangle_distance) || 'medium shot'
  const angleParts = [azimuth, elevation, distance].filter(Boolean)

  if (!angleParts.length) return prompt
  const angleTag = `<sks> ${angleParts.join(', ')}`
  return [prompt, angleTag].filter(Boolean).join(', ')
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const setNodeInput = (workflow: Record<string, any>, nodeId: string, inputKey: string, value: unknown) => {
  if (!workflow[nodeId]?.inputs) throw new Error(`Workflow node ${nodeId} not found.`)
  workflow[nodeId].inputs[inputKey] = value
}

const extractJobId = (payload: any) =>
  payload?.id || payload?.jobId || payload?.job_id || payload?.output?.id

const pickErrorMessage = (payload: any) =>
  payload?.error ||
  payload?.message ||
  payload?.output?.error ||
  payload?.result?.error ||
  payload?.output?.output?.error ||
  payload?.result?.output?.error ||
  ''

const isOomError = (value: unknown) => {
  const text = String(value || '').toLowerCase()
  return (
    text.includes('out of memory') ||
    text.includes('allocation on device') ||
    text.includes('would exceed allowed memory') ||
    text.includes('cuda')
  )
}

const isMissingMultiAngleLoraError = (payload: unknown) => {
  const text = JSON.stringify(payload ?? '').toLowerCase()
  return (
    text.includes('prompt_outputs_failed_validation') &&
    text.includes('lora_name') &&
    text.includes('qwen-image-edit-2511-multiple-angles-lora.safetensors') &&
    text.includes('not in []')
  )
}

const isFailureStatus = (status: unknown) => {
  const normalized = String(status || '').toLowerCase()
  return normalized.includes('fail') || normalized.includes('error') || normalized.includes('cancel')
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

  try {
    const auth = await requireAuthenticatedUser(request, env, corsHeaders)
    if ('response' in auth) {
      return auth.response
    }

    const endpoint = resolveEndpoint(env)
    if (!env.RUNPOD_API_KEY) {
      return jsonResponse({ error: 'RUNPOD_API_KEY is not set.' }, 500, corsHeaders)
    }

    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const usageId = url.searchParams.get('usage_id') ?? url.searchParams.get('usageId') ?? ''
    if (!id) {
      return jsonResponse({ error: 'id is required.' }, 400, corsHeaders)
    }
    if (!usageId) {
      return jsonResponse({ error: 'usage_id is required.' }, 400, corsHeaders)
    }
    const expectedUsageId = `qwen_sparkart:${id}`
    if (usageId !== expectedUsageId) {
      return jsonResponse({ error: 'usage_id and id do not match.' }, 400, corsHeaders)
    }

    const ownership = await ensureUsageOwnership(auth.admin, auth.user, usageId, corsHeaders)
    if ('response' in ownership) {
      return ownership.response
    }

    const upstream = await fetch(`${endpoint}/status/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${env.RUNPOD_API_KEY}` },
    })
    const raw = await upstream.text()
    let payload: any = null
    let ticketsLeft: number | null = null
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }

    if (payload && (isFailureStatus(payload?.status ?? payload?.state ?? '') || pickErrorMessage(payload))) {
      const ticketMeta = {
        job_id: id,
        status: payload?.status ?? payload?.state ?? null,
        source: 'status',
        reason: 'failure',
      }
      const refundResult = await refundTicket(auth.admin, auth.user, ticketMeta, usageId, 1, corsHeaders)
      if ('response' in refundResult) {
        return refundResult.response
      }
      const nextTickets = Number((refundResult as { ticketsLeft?: unknown }).ticketsLeft)
      if (Number.isFinite(nextTickets)) {
        ticketsLeft = nextTickets
      }
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload.usage_id = usageId
      if (ticketsLeft !== null) {
        payload.ticketsLeft = ticketsLeft
      }
      return jsonResponse(payload, upstream.status, corsHeaders)
    }

    return new Response(raw, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonResponse({ error: 'Qwen status request failed.' }, 502, corsHeaders)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = buildCorsHeaders(request, env, corsMethods)
  if (isCorsBlocked(request, env)) {
    return new Response(null, { status: 403, headers: corsHeaders })
  }

  try {
    const auth = await requireAuthenticatedUser(request, env, corsHeaders)
    if ('response' in auth) {
      return auth.response
    }

    if (!env.RUNPOD_API_KEY) {
      return jsonResponse({ error: 'RUNPOD_API_KEY is not set.' }, 500, corsHeaders)
    }

    const endpoint = resolveEndpoint(env)
    const payload = await request.json().catch(() => null)
    if (!payload) {
      return jsonResponse({ error: 'Invalid request body.' }, 400, corsHeaders)
    }

    const input = (payload.input ?? payload) as Record<string, unknown>
    const multiAngleEnabled = Boolean(input.multiangle_enabled ?? input.multiangle ?? false)
    const basePrompt = String(input.prompt ?? input.text ?? '')
    const prompt = buildPromptWithMultiAngle(basePrompt, input, multiAngleEnabled)
    const negativePrompt = String(input.negative_prompt ?? input.negative ?? '')
    const promptIsEmpty = prompt.trim().length === 0
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return jsonResponse({ error: `prompt is too long (max ${MAX_PROMPT_LENGTH}).` }, 400, corsHeaders)
    }
    if (promptIsEmpty && !multiAngleEnabled) {
      return jsonResponse({ error: `prompt is required (max ${MAX_PROMPT_LENGTH}).` }, 400, corsHeaders)
    }
    if (negativePrompt.length > MAX_PROMPT_LENGTH) {
      return jsonResponse({ error: `negative_prompt is too long (max ${MAX_PROMPT_LENGTH}).` }, 400, corsHeaders)
    }

    let imageBase64 = ''
    try {
      imageBase64 = ensureBase64Input(
        'image',
        pickInputValue(input, ['image_base64', 'image', 'image1', 'image_base64_1']),
      )
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid image.' }, 400, corsHeaders)
    }

    const referenceArray = Array.isArray(input.reference_images) ? input.reference_images : []
    const referenceRaw =
      referenceArray[0] ??
      pickInputValue(input, ['reference_image_base64_1', 'reference1', 'image2', 'sub_image_base64'])

    let referenceBase64 = ''
    try {
      referenceBase64 = ensureBase64Input('reference_image_base64_1', referenceRaw)
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Invalid reference image.' },
        400,
        corsHeaders,
      )
    }

    if (!imageBase64 && !referenceBase64) {
      return jsonResponse(
        { error: 'Either image_base64 or reference_image_base64_1 is required.' },
        400,
        corsHeaders,
      )
    }

    if (!imageBase64) {
      imageBase64 = referenceBase64
    }
    if (!referenceBase64) {
      referenceBase64 = imageBase64
    }

    const width = clamp(toInt(input.width, 1024), MIN_DIMENSION, MAX_DIMENSION)
    const height = clamp(toInt(input.height, 1024), MIN_DIMENSION, MAX_DIMENSION)
    const steps = clamp(toInt(input.steps, 4), 1, 12)
    const cfg = Number(input.cfg ?? input.guidance_scale ?? 1)
    const seed = Boolean(input.randomize_seed)
      ? Math.floor(Math.random() * 2147483647)
      : toInt(input.seed, 0)

    const ticketCheck = await ensureTicketAvailable(auth.admin, auth.user, 1, corsHeaders)
    if ('response' in ticketCheck) {
      return ticketCheck.response
    }

    const workflow = clone(workflowTemplate) as Record<string, any>
    try {
      setNodeInput(workflow, '3', 'prompt', prompt)
      setNodeInput(workflow, '4', 'prompt', negativePrompt)
      setNodeInput(workflow, '2', 'seed', seed)
      setNodeInput(workflow, '2', 'steps', steps)
      setNodeInput(workflow, '2', 'cfg', Number.isFinite(cfg) ? cfg : 1)
      setNodeInput(workflow, '9', 'width', width)
      setNodeInput(workflow, '9', 'height', height)
      setNodeInput(workflow, '7', 'image', 'input.png')
      setNodeInput(workflow, '8', 'image', 'sub.png')
      if (workflow['10']?.inputs && multiAngleEnabled) {
        setNodeInput(workflow, '10', 'strength_model', 1)
        setNodeInput(workflow, '2', 'model', ['10', 0])
      } else {
        if (workflow['10']) {
          delete workflow['10']
        }
        setNodeInput(workflow, '2', 'model', ['1', 0])
      }
    } catch (error) {
      return internalErrorResponse(corsHeaders)
    }

    const runpodInput: Record<string, unknown> = {
      workflow,
      images: [
        { name: 'input.png', image: imageBase64 },
        { name: 'sub.png', image: referenceBase64 },
      ],
    }

    const comfyOrgKey = String(env.COMFY_ORG_API_KEY ?? '')
    if (comfyOrgKey) {
      runpodInput.comfy_org_api_key = comfyOrgKey
    }

    const upstream = await fetch(`${endpoint}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: runpodInput }),
    })

    const raw = await upstream.text()
    const headers = { ...corsHeaders, 'Content-Type': 'application/json' }
    let parsed: any = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      return new Response(raw, { status: upstream.status, headers })
    }

    if (multiAngleEnabled && isMissingMultiAngleLoraError(parsed)) {
      return jsonResponse(
        {
          error: 'エラーです。やり直してください。',
        },
        503,
        corsHeaders,
      )
    }

    const upstreamError = pickErrorMessage(parsed)
    if (isOomError(upstreamError)) {
      return jsonResponse(
        {
          error: '画像サイズが大きすぎます',
        },
        502,
        corsHeaders,
      )
    }

    const upstreamStatus = parsed?.status ?? parsed?.state ?? ''
    let ticketsLeft: number | null = null
    let usageId: string | null = null
    const shouldCharge = upstream.ok && !isFailureStatus(upstreamStatus) && !upstreamError
    if (shouldCharge) {
      const jobId = extractJobId(parsed)
      usageId = jobId ? `qwen_sparkart:${jobId}` : `qwen_sparkart:${makeUsageId()}`
      const ticketMeta = {
        prompt_length: prompt.length,
        width,
        height,
        steps,
        cfg: Number.isFinite(cfg) ? cfg : 1,
        multiangle_enabled: multiAngleEnabled,
        job_id: jobId ?? null,
        status: upstreamStatus || null,
        source: 'run',
        variant: 'qwen_edit',
      }
      const chargeResult = await consumeTicket(auth.admin, auth.user, ticketMeta, usageId, 1, corsHeaders)
      if ('response' in chargeResult) {
        return chargeResult.response
      }
      const nextTickets = Number((chargeResult as { ticketsLeft?: unknown }).ticketsLeft)
      if (Number.isFinite(nextTickets)) {
        ticketsLeft = nextTickets
      }
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (ticketsLeft !== null) {
        parsed.ticketsLeft = ticketsLeft
      }
      if (usageId) {
        parsed.usage_id = usageId
      }
    }

    if (upstream.ok && !extractJobId(parsed) && Array.isArray(parsed?.output?.images)) {
      return jsonResponse(parsed, 200, corsHeaders)
    }
    return jsonResponse(parsed, upstream.status, corsHeaders)
  } catch (error) {
    return jsonResponse({ error: 'Qwen request failed.' }, 502, corsHeaders)
  }
}


