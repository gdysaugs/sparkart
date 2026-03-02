import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { isAuthConfigured, signOutSafely, supabase } from '../lib/supabaseClient'
import { getOAuthRedirectUrl } from '../lib/oauthRedirect'
import { GuestIntro } from '../components/GuestIntro'
import './camera.css'
import './video-studio.css'

type RenderResult = {
  id: string
  status: 'queued' | 'running' | 'done' | 'error'
  video?: string
  error?: string
}

type VideoEngine = 'remix' | 'rapid'

const MAX_PARALLEL = 1
const API_ENDPOINTS: Record<VideoEngine, string> = {
  remix: '/api/wan-remix',
  rapid: '/api/wan-rapid',
}
const FIXED_FPS = 10
const FIXED_VIDEO_SECONDS = 6
const FIXED_STEPS = 4
const FIXED_CFG = 1
const FIXED_MAX_LONG_SIDE = 768
const FIXED_MIN_SIDE = 256
const FIXED_SIZE_MULTIPLE = 64
const BONUS_ROULETTE_VALUES = [1] as const
const OAUTH_REDIRECT_URL = getOAuthRedirectUrl()
const DEFAULT_ENGINE: VideoEngine = 'remix'
const getApiEndpoint = (engine: VideoEngine) => API_ENDPOINTS[engine] ?? API_ENDPOINTS.remix
const COIN_PURCHASE_URL = 'https://checkoutcoins.uk/'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const runQueue = async (tasks: Array<() => Promise<void>>, concurrency: number) => {
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= tasks.length) return
      await tasks[index]()
    }
  })
  await Promise.all(runners)
}

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read image.'))
    reader.readAsDataURL(file)
  })

const getImageSize = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      URL.revokeObjectURL(url)
      resolve({ width, height })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to read image size.'))
    }
    image.src = url
  })

const clampDimension = (value: number) => {
  const rounded = Math.round(value / FIXED_SIZE_MULTIPLE) * FIXED_SIZE_MULTIPLE
  return Math.max(FIXED_MIN_SIDE, Math.min(3000, rounded))
}

const toVideoDimensions = (width: number, height: number) => {
  const longest = Math.max(width, height)
  const scale = longest > FIXED_MAX_LONG_SIDE ? FIXED_MAX_LONG_SIDE / longest : 1
  const scaledWidth = width * scale
  const scaledHeight = height * scale
  return {
    width: clampDimension(scaledWidth),
    height: clampDimension(scaledHeight),
  }
}

const normalizeVideo = (value: unknown, filename?: string) => {
  if (typeof value !== 'string' || !value) return null
  if (value.startsWith('data:') || value.startsWith('http')) return value
  const ext = filename?.split('.').pop()?.toLowerCase()
  const mime =
    ext === 'webm' ? 'video/webm' : ext === 'gif' ? 'image/gif' : ext === 'mp4' ? 'video/mp4' : 'video/mp4'
  return `data:${mime};base64,${value}`
}

const base64ToBlob = (base64: string, mime: string) => {
  const chunkSize = 0x8000
  const byteChars = atob(base64)
  const byteArrays: Uint8Array[] = []
  for (let offset = 0; offset < byteChars.length; offset += chunkSize) {
    const slice = byteChars.slice(offset, offset + chunkSize)
    const byteNumbers = new Array(slice.length)
    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i)
    }
    byteArrays.push(new Uint8Array(byteNumbers))
  }
  return new Blob(byteArrays, { type: mime })
}

const dataUrlToBlob = (dataUrl: string, fallbackMime: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!match) {
    return base64ToBlob(dataUrl, fallbackMime)
  }
  const mime = match[1] || fallbackMime
  const base64 = match[2] || ''
  return base64ToBlob(base64, mime)
}

const isProbablyMobile = () => {
  if (typeof navigator === 'undefined') return false
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData && typeof uaData.mobile === 'boolean') {
    return uaData.mobile
  }
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number') {
    return navigator.maxTouchPoints > 1
  }
  return false
}

const extractErrorMessage = (payload: any) =>
  payload?.error ||
  payload?.message ||
  payload?.output?.error ||
  payload?.result?.error ||
  payload?.output?.output?.error ||
  payload?.result?.output?.error

const POLICY_BLOCK_MESSAGE =
  'This image may violate policy (violence/minor). Please use another image.'

const normalizeErrorMessage = (value: unknown) => {
  if (!value) return 'Request failed.'
  if (typeof value === 'object') {
    const maybe = value as { error?: unknown; message?: unknown; detail?: unknown }
    const picked = maybe?.error ?? maybe?.message ?? maybe?.detail
    if (typeof picked === 'string' && picked) return picked
    if (value instanceof Error && value.message) return value.message
  }
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : String(value)
  const lowered = raw.toLowerCase()
  if (
    lowered.includes('out of memory') ||
    lowered.includes('would exceed allowed memory') ||
    lowered.includes('allocation on device') ||
    lowered.includes('cuda') ||
    lowered.includes('oom')
  ) {
    return 'Image size error. Please use a smaller image.'
  }
  if (
    lowered.includes('underage') ||
    lowered.includes('minor') ||
    lowered.includes('child') ||
    lowered.includes('age_range') ||
    lowered.includes('age range') ||
    lowered.includes('agerange') ||
    lowered.includes('policy') ||
    lowered.includes('moderation') ||
    lowered.includes('violence') ||
    lowered.includes('rekognition')
  ) {
    return POLICY_BLOCK_MESSAGE
  }
  const trimmed = raw.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed)
      const message = parsed?.error || parsed?.message || parsed?.detail
      if (typeof message === 'string' && message) return message
    } catch {
      // ignore parse errors
    }
  }
  return raw
}

const isTicketShortage = (status: number, message: string) => {
  if (status === 402) return true
  const lowered = message.toLowerCase()
  return (
    lowered.includes('no tickets') ||
    lowered.includes('no ticket') ||
    lowered.includes('insufficient_tickets') ||
    lowered.includes('insufficient tickets') ||
    lowered.includes('token不足') ||
    lowered.includes('コイン') ||
    lowered.includes('token') ||
    lowered.includes('credit')
  )
}

const isFailureStatus = (status: string) => {
  const normalized = status.toLowerCase()
  return normalized.includes('fail') || normalized.includes('error') || normalized.includes('cancel')
}

const extractVideoList = (payload: any) => {
  const output = payload?.output ?? payload?.result ?? payload
  const nested = output?.output ?? output?.result ?? output?.data ?? payload?.output?.output ?? payload?.result?.output
  const listCandidates = [
    output?.videos,
    output?.outputs,
    output?.output_videos,
    output?.gifs,
    output?.images,
    payload?.videos,
    payload?.gifs,
    payload?.images,
    nested?.videos,
    nested?.outputs,
    nested?.output_videos,
    nested?.gifs,
    nested?.images,
    nested?.data,
  ]
  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate)) continue
    const normalized = candidate
      .map((item: any) => {
        const raw = item?.video ?? item?.data ?? item?.url ?? item
        const name = item?.filename
        return normalizeVideo(raw, name)
      })
      .filter(Boolean) as string[]
    if (normalized.length) return normalized
  }
  return []
}

const extractJobId = (payload: any) => payload?.id || payload?.jobId || payload?.job_id || payload?.output?.id

export function Camera() {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null)
  const [sourceImagePreview, setSourceImagePreview] = useState('')
  const [results, setResults] = useState<RenderResult[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [ticketCount, setTicketCount] = useState<number | null>(null)
  const [ticketStatus, setTicketStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [ticketMessage, setTicketMessage] = useState('')
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null)
  const [videoEngine, setVideoEngine] = useState<VideoEngine>(DEFAULT_ENGINE)
  const [bonusStatus, setBonusStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [bonusMessage, setBonusMessage] = useState('')
  const [bonusCanClaim, setBonusCanClaim] = useState(false)
  const [bonusNextEligibleAt, setBonusNextEligibleAt] = useState<string | null>(null)
  const [bonusClaiming, setBonusClaiming] = useState(false)
  const [bonusRouletteValue, setBonusRouletteValue] = useState<number>(BONUS_ROULETTE_VALUES[0])
  const [bonusRouletteRolling, setBonusRouletteRolling] = useState(false)
  const [bonusRouletteAwarded, setBonusRouletteAwarded] = useState<number | null>(null)
  const [showPurchaseConfirmModal, setShowPurchaseConfirmModal] = useState(false)
  const runIdRef = useRef(0)
  const bonusRouletteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null)
  const selectedTicketCost = 1

  const totalFrames = results.length || 1
  const completedCount = useMemo(() => results.filter((item) => item.video).length, [results])
  const progress = totalFrames ? completedCount / totalFrames : 0
  const displayVideo = results[0]?.video ?? null
  const accessToken = session?.access_token ?? ''
  const canGenerate = prompt.trim().length > 0 && Boolean(sourceImageFile) && !isRunning

  const viewerStyle = useMemo(
    () =>
      ({
        '--progress': progress,
      }) as CSSProperties,
    [progress],
  )

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase) return
    const url = new URL(window.location.href)
    const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error')
    if (oauthError) {
      console.error('OAuth callback error', oauthError)
      setStatusMessage('Login failed. Please try again.')
      url.searchParams.delete('error')
      url.searchParams.delete('error_description')
      window.history.replaceState({}, document.title, url.toString())
      return
    }
    const hasCode = url.searchParams.has('code')
    const hasState = url.searchParams.has('state')
    if (!hasCode || !hasState) return
    supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
      if (error) {
        console.error('exchangeCodeForSession failed', error)
        setStatusMessage('Login failed. Please try again.')
        return
      }
      const cleaned = new URL(window.location.href)
      cleaned.searchParams.delete('code')
      cleaned.searchParams.delete('state')
      window.history.replaceState({}, document.title, cleaned.toString())
    })
  }, [])

  useEffect(() => {
    if (!sourceImageFile) {
      setSourceImagePreview('')
      return
    }
    const url = URL.createObjectURL(sourceImageFile)
    setSourceImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [sourceImageFile])

  useEffect(() => {
    return () => {
      if (bonusRouletteTimerRef.current) {
        clearInterval(bonusRouletteTimerRef.current)
        bonusRouletteTimerRef.current = null
      }
    }
  }, [])

  const fetchTickets = useCallback(
    async (token: string) => {
      if (!token) return
      setTicketStatus('loading')
      setTicketMessage('')
      const res = await fetch('/api/tickets', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTicketStatus('error')
        setTicketMessage(data?.error || 'Failed to fetch coin balance.')
        setTicketCount(null)
        return null
      }
      const nextCount = Number(data?.tickets ?? 0)
      setTicketStatus('idle')
      setTicketMessage('')
      setTicketCount(nextCount)
      return nextCount
    },
    [],
  )

  const fetchDailyBonus = useCallback(async (token: string) => {
    if (!token) return
    setBonusStatus('loading')
    setBonusMessage('')
    const res = await fetch('/api/daily_bonus', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBonusStatus('error')
      setBonusMessage(data?.error || 'Failed to fetch bonus status.')
      return
    }
    setBonusStatus('idle')
    setBonusCanClaim(Boolean(data?.canClaim))
    setBonusNextEligibleAt(typeof data?.nextEligibleAt === 'string' ? data.nextEligibleAt : null)
  }, [])

  useEffect(() => {
    if (!session || !accessToken) {
      setTicketCount(null)
      setTicketStatus('idle')
      setTicketMessage('')
      setBonusStatus('idle')
      setBonusMessage('')
      setBonusCanClaim(false)
      setBonusNextEligibleAt(null)
      return
    }
    void fetchTickets(accessToken)
    void fetchDailyBonus(accessToken)
  }, [accessToken, fetchDailyBonus, fetchTickets, session])

  const submitVideo = useCallback(
    async (token: string) => {
      if (!sourceImageFile) {
        throw new Error('Please select an image.')
      }
      const imageDataUrl = await fileToDataUrl(sourceImageFile)
      const imageSize = await getImageSize(sourceImageFile)
      const dims = toVideoDimensions(imageSize.width, imageSize.height)
      const targetSeconds = FIXED_VIDEO_SECONDS
      const targetFrameCount = FIXED_FPS * targetSeconds
      const stabilizedPrompt = `${prompt}, keep same person identity, keep same face, keep same camera distance, no zoom in`
      const stabilizedNegative = [negativePrompt, 'zoom in, close-up, crop, face distortion, identity change']
        .filter(Boolean)
        .join(', ')
      const input: Record<string, unknown> = {
        engine: videoEngine,
        mode: 'i2v',
        image: imageDataUrl,
        image_name: sourceImageFile.name || 'input.png',
        prompt: stabilizedPrompt,
        negative_prompt: stabilizedNegative,
        width: dims.width,
        height: dims.height,
        fps: FIXED_FPS,
        seconds: targetSeconds,
        num_frames: targetFrameCount,
        steps: FIXED_STEPS,
        cfg: FIXED_CFG,
        seed: 0,
        randomize_seed: true,
        worker_mode: 'comfyui',
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const res = await fetch(getApiEndpoint(videoEngine), {
        method: 'POST',
        headers,
        body: JSON.stringify({ input }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const rawMessage = data?.error || data?.message || data?.detail || 'Generation failed.'
        const message = normalizeErrorMessage(rawMessage)
        if (isTicketShortage(res.status, message)) {
          setShowTicketModal(true)
          throw new Error('TICKET_SHORTAGE')
        }
        setErrorModalMessage(message)
        throw new Error(message)
      }
      const nextTickets = Number(data?.ticketsLeft ?? data?.tickets_left)
      if (Number.isFinite(nextTickets)) {
        setTicketCount(nextTickets)
      }
      const videos = extractVideoList(data)
      if (videos.length) {
        return { videos }
      }
      const jobId = extractJobId(data)
      if (!jobId) throw new Error('Failed to get job id.')
      return { jobId }
    },
    [negativePrompt, prompt, sourceImageFile, videoEngine],
  )

  const pollJob = useCallback(async (jobId: string, runId: number, token?: string, engine: VideoEngine = DEFAULT_ENGINE) => {
    for (let i = 0; i < 180; i += 1) {
      if (runIdRef.current !== runId) return { status: 'cancelled' as const, videos: [] }
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const query = new URLSearchParams({
        id: jobId,
        engine,
      })
      const res = await fetch(`${getApiEndpoint(engine)}?${query.toString()}`, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const rawMessage = data?.error || data?.message || data?.detail || 'Failed to get status.'
        const message = normalizeErrorMessage(rawMessage)
        if (isTicketShortage(res.status, message)) {
          setShowTicketModal(true)
          throw new Error('TICKET_SHORTAGE')
        }
        setErrorModalMessage(message)
        throw new Error(message)
      }
      const nextTickets = Number(data?.ticketsLeft ?? data?.tickets_left)
      if (Number.isFinite(nextTickets)) {
        setTicketCount(nextTickets)
      }
      const status = String(data?.status || data?.state || '').toLowerCase()
      const statusError = extractErrorMessage(data)
      if (statusError) {
        const normalized = normalizeErrorMessage(statusError)
        if (isTicketShortage(res.status, normalized)) {
          setShowTicketModal(true)
          throw new Error('TICKET_SHORTAGE')
        }
      }
      if (statusError || isFailureStatus(status)) {
        throw new Error(normalizeErrorMessage(statusError || 'Generation failed.'))
      }
      const videos = extractVideoList(data)
      if (videos.length) {
        return { status: 'done' as const, videos }
      }
      await wait(2000 + i * 50)
    }
    throw new Error('Generation timed out.')
  }, [])

  const startBatch = useCallback(async () => {
    if (!session) {
      setStatusMessage('Please log in first.')
      return
    }
    if (ticketStatus === 'loading') {
      setStatusMessage('コイン確認中...')
      return
    }
    if (accessToken) {
      setStatusMessage('コイン確認中...')
      const latestCount = await fetchTickets(accessToken)
      if (latestCount !== null && latestCount < selectedTicketCost) {
        setShowTicketModal(true)
        return
      }
    } else if (ticketCount === null) {
      setStatusMessage('コイン確認中...')
      return
    } else if (ticketCount < selectedTicketCost) {
      setShowTicketModal(true)
      return
    }
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setIsRunning(true)
    setStatusMessage('')
    setResults([{ id: makeId(), status: 'queued' as const }])

    try {
      const tasks = [async () => {
        if (runIdRef.current !== runId) return
        setResults((prev) =>
          prev.map((item, itemIndex) =>
            itemIndex === 0 ? { ...item, status: 'running' as const, error: undefined } : item,
          ),
        )
        try {
          const submitted = await submitVideo(accessToken)
          if (runIdRef.current !== runId) return
          if ('videos' in submitted && submitted.videos.length) {
            setResults((prev) =>
              prev.map((item, itemIndex) =>
                itemIndex === 0 ? { ...item, status: 'done' as const, video: submitted.videos[0] } : item,
              ),
            )
            return
          }
          if ('jobId' in submitted) {
            const polled = await pollJob(submitted.jobId, runId, accessToken, videoEngine)
            if (runIdRef.current !== runId) return
            if (polled.status === 'done' && polled.videos.length) {
              setResults((prev) =>
                prev.map((item, itemIndex) =>
                  itemIndex === 0 ? { ...item, status: 'done' as const, video: polled.videos[0] } : item,
                ),
              )
            }
          }
        } catch (error) {
          if (runIdRef.current !== runId) return
          const message = normalizeErrorMessage(error instanceof Error ? error.message : error)
          if (message === 'TICKET_SHORTAGE') {
            setShowTicketModal(true)
            setStatusMessage('')
            return
          }
          setResults((prev) =>
            prev.map((item, itemIndex) =>
              itemIndex === 0 ? { ...item, status: 'error' as const, error: message } : item,
            ),
          )
          setStatusMessage(message)
          setErrorModalMessage(message)
        }
      }]

      await runQueue(tasks, MAX_PARALLEL)
      if (runIdRef.current === runId) {
        setStatusMessage('Done')
        if (accessToken) {
          void fetchTickets(accessToken)
        }
      }
    } catch (error) {
      const message = normalizeErrorMessage(error instanceof Error ? error.message : error)
      setStatusMessage(message)
      setResults((prev) => prev.map((item) => ({ ...item, status: 'error', error: message })))
      setErrorModalMessage(message)
    } finally {
      if (runIdRef.current === runId) {
        setIsRunning(false)
      }
    }
  }, [accessToken, fetchTickets, pollJob, selectedTicketCost, session, submitVideo, ticketCount, ticketStatus, videoEngine])

  const handleGenerate = async () => {
    if (!sourceImageFile) {
      setStatusMessage('Please select an image.')
      return
    }
    if (!prompt.trim()) {
      setStatusMessage('Please enter a prompt.')
      return
    }
    await startBatch()
  }

  const handleGoogleSignIn = async () => {
    if (!supabase || !isAuthConfigured) {
      window.alert('Auth configuration is not ready.')
      return
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: OAUTH_REDIRECT_URL, queryParams: { prompt: 'select_account' } },
    })
    if (error) {
      window.alert(error.message)
      return
    }
    if (data?.url) {
      window.location.assign(data.url)
      return
    }
    window.alert('Failed to get auth URL.')
  }

  const handleEmailLogin = () => {
    window.location.assign('/email-login')
  }

  const handleSignOut = async () => {
    if (!supabase) return
    await signOutSafely()
    setSession(null)
    setTicketCount(null)
    setTicketStatus('idle')
    setTicketMessage('')
    setBonusStatus('idle')
    setBonusMessage('')
    setBonusCanClaim(false)
    setBonusNextEligibleAt(null)
  }

  const handleOpenPurchaseConfirm = () => {
    setShowPurchaseConfirmModal(true)
  }

  const handleConfirmPurchaseMove = () => {
    setShowPurchaseConfirmModal(false)
    window.location.assign(COIN_PURCHASE_URL)
  }

  const formatDateTime = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    return date.toLocaleString('ja-JP', { hour12: false })
  }

  const formatTimeUntilClaim = (value: string | null) => {
    if (!value) return ''
    const nextMs = new Date(value).getTime()
    if (!Number.isFinite(nextMs)) return ''
    const diffMs = nextMs - Date.now()
    if (diffMs <= 0) return 'まもなく受け取れます'
    const totalMinutes = Math.ceil(diffMs / 60_000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) return 'あと約' + hours + '時間' + minutes + '分で次回受取'
    return 'あと約' + minutes + '分で次回受取'
  }

  const startBonusRoulette = () => {
    if (bonusRouletteTimerRef.current) {
      clearInterval(bonusRouletteTimerRef.current)
      bonusRouletteTimerRef.current = null
    }
    setBonusRouletteAwarded(null)
    setBonusRouletteRolling(true)
    let cursor = 0
    bonusRouletteTimerRef.current = setInterval(() => {
      cursor = (cursor + 1) % BONUS_ROULETTE_VALUES.length
      setBonusRouletteValue(BONUS_ROULETTE_VALUES[cursor])
    }, 90)
  }

  const stopBonusRoulette = (finalValue?: number) => {
    if (bonusRouletteTimerRef.current) {
      clearInterval(bonusRouletteTimerRef.current)
      bonusRouletteTimerRef.current = null
    }
    setBonusRouletteRolling(false)
    if (Number.isFinite(finalValue)) {
      const normalized = Math.max(1, Math.min(5, Math.floor(Number(finalValue))))
      setBonusRouletteValue(normalized)
    }
  }

  const handleClaimDailyBonus = async () => {
    if (!session || !accessToken || bonusClaiming) return
    setBonusClaiming(true)
    setBonusMessage('')
    startBonusRoulette()
    const res = await fetch('/api/daily_bonus', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      stopBonusRoulette()
      setBonusStatus('error')
      setBonusMessage(data?.error || 'Failed to claim daily bonus.')
      setBonusClaiming(false)
      return
    }
    const granted = Boolean(data?.granted)
    const nextEligibleAt = typeof data?.nextEligibleAt === 'string' ? data.nextEligibleAt : null
    setBonusNextEligibleAt(nextEligibleAt)
    setBonusCanClaim(false)
    if (granted) {
      const nextTickets = Number(data?.ticketsLeft)
      const awardedRaw = Number(data?.awarded)
      const awarded = Number.isFinite(awardedRaw)
        ? Math.max(1, Math.floor(awardedRaw))
        : 1
      if (Number.isFinite(nextTickets)) {
        setTicketCount(nextTickets)
      } else {
        await fetchTickets(accessToken)
      }
      setBonusStatus('idle')
      if (awarded !== null) {
        setBonusRouletteAwarded(awarded)
        stopBonusRoulette(awarded)
        setBonusMessage(`Daily bonus claimed. +${awarded} coins`)
      } else {
        setBonusRouletteAwarded(null)
        stopBonusRoulette()
        setBonusMessage('Daily bonus claimed.')
      }
    } else {
      setBonusRouletteAwarded(null)
      stopBonusRoulette()
      setBonusStatus('idle')
      setBonusMessage(
        nextEligibleAt ? formatTimeUntilClaim(nextEligibleAt) : 'Not eligible yet.',
      )
    }
    await fetchDailyBonus(accessToken)
    setBonusClaiming(false)
  }

  const isGif = displayVideo?.startsWith('data:image/gif')
  const canDownload = Boolean(displayVideo && !isGif)

  const handleDownload = useCallback(async () => {
    if (!displayVideo) return
    const filename = `sparkmotion-video.${isGif ? 'gif' : 'mp4'}`
    try {
      let blob: Blob
      if (displayVideo.startsWith('data:')) {
        blob = dataUrlToBlob(displayVideo, isGif ? 'image/gif' : 'video/mp4')
      } else if (displayVideo.startsWith('http') || displayVideo.startsWith('blob:')) {
        const response = await fetch(displayVideo)
        blob = await response.blob()
      } else {
        blob = base64ToBlob(displayVideo, isGif ? 'image/gif' : 'video/mp4')
      }
      const fileType = blob.type || (isGif ? 'image/gif' : 'video/mp4')
      const file = new File([blob], filename, { type: fileType })
      const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      const canShareFiles =
        canShare && typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : canShare
      if (isProbablyMobile() && canShareFiles) {
        try {
          await navigator.share({ files: [file], title: filename })
          return
        } catch {
          // Ignore share cancellations and fall back to download.
        }
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      window.location.assign(displayVideo)
    }
  }, [displayVideo, isGif])

  if (!authReady) {
    return (
      <div className="camera-app video-studio-page">
        <div className="auth-boot" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="camera-app camera-app--guest video-studio-page">
        <GuestIntro mode="video" onSignIn={handleGoogleSignIn} onEmailLogin={handleEmailLogin} />
      </div>
    )
  }

  return (
    <div className="camera-app video-studio-page">
      <div className="video-studio-layout">
        <section className="studio-block studio-block--input">
          <header className="studio-head">
            <p className="studio-head__kicker">Image to Video</p>
            <h1>I2V</h1>
            <p>
              1 image can be converted into a 6-second video.
            </p>
          </header>
          <div className="studio-ticket-row">
            <div className="studio-ticket">
              {ticketStatus === 'loading' && 'コイン確認中...'}
              {ticketStatus !== 'loading' && `Your remaining coins: ${ticketCount ?? 0}` }
              {ticketStatus === 'error' && ticketMessage ? ` / ${ticketMessage}` : ''}
            </div>
            <button type="button" className="ghost-button studio-buy-button" onClick={handleOpenPurchaseConfirm}>
              コインを購入する
            </button>
          </div>

          <label className="studio-upload">
            <input
              ref={sourceImageInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => setSourceImageFile(event.target.files?.[0] || null)}
            />
            <div className="studio-upload__inner">
              <div className="studio-upload__icon" aria-hidden="true">
                +
              </div>
              <div className="studio-upload__text">
                <strong>{sourceImageFile?.name || 'Upload an image'}</strong>
                <span>Select JPG / PNG / WEBP</span>
              </div>
              <span className="studio-upload__chip">Tap / Drop</span>
            </div>
          </label>

          {sourceImagePreview && (
            <figure className="studio-thumb">
              <img src={sourceImagePreview} alt="Uploaded image preview" />
              <button
                type="button"
                className="studio-thumb__remove"
                onClick={() => {
                  setSourceImageFile(null)
                  if (sourceImageInputRef.current) {
                    sourceImageInputRef.current.value = ''
                  }
                }}
                aria-label="画像を削除"
              >
                ×
              </button>
            </figure>
          )}

          <label className="studio-field">
            <span>Prompt</span>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例: 女が両手で胸を揉む"
            />
          </label>

          <label className="studio-field studio-field--sub">
            <span>Negative prompt</span>
            <textarea
              rows={3}
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
            />
          </label>

          <div className="studio-engine">
            <span className="studio-engine__label">エンジン</span>
            <label className="studio-switch">
              <input
                type="checkbox"
                checked={videoEngine === 'rapid'}
                onChange={(event) => setVideoEngine(event.target.checked ? 'rapid' : 'remix')}
                disabled={isRunning}
              />
              <span className="studio-switch__track" aria-hidden="true" />
              <strong>{videoEngine === 'rapid' ? 'Neo Spark' : 'Spark'}</strong>
            </label>
          </div>

          <div className="studio-actions">
            <button type="button" className="primary-button" onClick={handleGenerate} disabled={!canGenerate}>
              {isRunning ? 'Generating...' : 'Generate video'}
            </button>
            <small>Sparkはプロンプトに忠実で、動きがより滑らかです。</small>
            <small>Neo Sparkは、より自由で大胆な動きを重視します。</small>
            <small>コイン消費: 1回につき1コイン</small>
          </div>

          <section className="studio-credit-box">
            <header>
              <h3>Daily Coin Drop</h3>
              <span className={`studio-bonus-pill${bonusCanClaim ? ' is-ready' : ''}`}>
                {bonusStatus === 'loading' && 'ステータス更新中'}
                {bonusStatus !== 'loading' && bonusCanClaim && '今すぐ受け取り可能'}
                {bonusStatus !== 'loading' && !bonusCanClaim && bonusNextEligibleAt && formatTimeUntilClaim(bonusNextEligibleAt)}
              </span>
            </header>
            <div className={`studio-bonus-panel${bonusRouletteRolling ? ' is-rolling' : ''}`} aria-live="polite">
              <div className="studio-bonus-panel__icon">COIN</div>
              <div className="studio-bonus-panel__meta">
                <strong>{bonusRouletteRolling ? '付与処理中...' : '24時間ごとに1コインを受け取れます'}</strong>
                <span>
                  {bonusCanClaim ? 'ログイン中なら毎日1回受け取れます' : '次回の受け取りまでクールタイムがあります'}
                </span>
                {bonusRouletteAwarded !== null && <span>今回の付与 +{bonusRouletteAwarded} coin</span>}
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={handleClaimDailyBonus}
              disabled={bonusClaiming || bonusStatus === 'loading' || !bonusCanClaim}
            >
              {bonusClaiming ? 'コインを受け取り中...' : 'ログインボーナスを受け取る'}
            </button>
            {bonusMessage && <p className="studio-credit-msg">{bonusMessage}</p>}
          </section>
        </section>

        <section className="studio-block studio-block--output" style={viewerStyle}>
          <header className="studio-output-head">
            <div>
              <p>Output</p>
              <h2>Generate</h2>
              {statusMessage && !isRunning && <span>{statusMessage}</span>}
            </div>
            {canDownload && (
              <button type="button" className="ghost-button" onClick={handleDownload}>
                ダウンロード
              </button>
            )}
          </header>

          <div className="studio-progress" aria-hidden="true">
            <span />
          </div>

          <div className="studio-stage">
            {isRunning ? (
              <div className="studio-loading" role="status" aria-live="polite">
                <div className="studio-loading__bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>生成中...</strong>
                <p>This may take 1-2 minutes.</p>
              </div>
            ) : displayVideo ? (
              isGif ? (
                <img src={displayVideo} alt="結果" />
              ) : (
                <video controls src={displayVideo} />
              )
            ) : (
              <div className="studio-empty">左側で画像とプロンプトを設定するとここに表示されます。</div>
            )}
          </div>
        </section>
      </div>

      <section className="studio-logout-bar">
        <div>
          <strong>{session.user?.email ?? 'ログイン中'}</strong>
          <span>ログイン中</span>
        </div>
        <button type="button" className="ghost-button" onClick={handleSignOut}>
          ログアウト
        </button>
      </section>

      {showTicketModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>コイン不足</h3>
            <p>この設定の動画生成には{selectedTicketCost}コインが必要です。</p>
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={() => setShowTicketModal(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
      {errorModalMessage && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>リクエストが拒否されました</h3>
            <p>{errorModalMessage}</p>
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={() => setErrorModalMessage(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
      {showPurchaseConfirmModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>購入ページへ移動</h3>
            <p>購入ページに移動します。表示されたページで再度ログインしてください。</p>
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={handleConfirmPurchaseMove}>
                はい
              </button>
              <button type="button" className="ghost-button" onClick={() => setShowPurchaseConfirmModal(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




