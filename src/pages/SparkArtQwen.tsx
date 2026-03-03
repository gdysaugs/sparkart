import { useMemo, useState, type ChangeEvent } from 'react'
import './sparkart-qwen.css'

const API_ENDPOINT = '/api/qwen_sparkart'
const REF_COUNT = 1
const PREPROCESS_MAX_SIZE = 1024
const DEFAULT_DIMENSION = 1024
const DEFAULT_CFG = 1
const CFG_MIN = 0.1
const CFG_MAX = 2
const CFG_STEP = 0.1
const PROMPT_MAX_LENGTH = 1000
const PROMPT_PLACEHOLDER = '例: 女が両手で胸を揉む'
type GenerationMode = 'i2v' | 'qwen_edit'

type SparkArtQwenProps = {
  generationMode: GenerationMode
  onChangeMode: (mode: GenerationMode) => void
  accessToken: string
  selectedTicketCost: number
  ticketStatus: 'idle' | 'loading' | 'error'
  ticketCount: number | null
  ticketMessage: string
  onOpenPurchaseConfirm: () => void
  bonusStatus: 'idle' | 'loading' | 'error'
  bonusCanClaim: boolean
  bonusNextEligibleAt: string | null
  bonusRouletteRolling: boolean
  bonusRouletteAwarded: number | null
  bonusClaiming: boolean
  bonusMessage: string
  onClaimDailyBonus: () => Promise<void> | void
  formatTimeUntilClaim: (value: string | null) => string
  onEnsureTickets: () => Promise<boolean>
  onTicketShortage: () => void
  onTicketCountUpdate: (nextCount: number) => void
}

type RefImage = {
  name: string
  data: string
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const alignTo16 = (value: number) => {
  const aligned = Math.round(value / 16) * 16
  return Math.max(256, aligned)
}

const fitWithinBounds = (width: number, height: number, maxWidth: number, maxHeight: number) => {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  const scaledWidth = width * scale
  const scaledHeight = height * scale
  const aspect = width / height

  if (aspect >= 1) {
    const targetWidth = Math.min(maxWidth, alignTo16(scaledWidth))
    const targetHeight = Math.min(maxHeight, alignTo16(targetWidth / aspect))
    return { width: targetWidth, height: targetHeight }
  }

  const targetHeight = Math.min(maxHeight, alignTo16(scaledHeight))
  const targetWidth = Math.min(maxWidth, alignTo16(targetHeight * aspect))
  return { width: targetWidth, height: targetHeight }
}

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsDataURL(file)
  })

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image.'))
    img.src = dataUrl
  })

const preprocessImage = async (file: File, maxWidth = PREPROCESS_MAX_SIZE, maxHeight = PREPROCESS_MAX_SIZE) => {
  const original = await readDataUrl(file)
  const image = await loadImage(original)
  const { width, height } = fitWithinBounds(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    maxWidth,
    maxHeight,
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.drawImage(image, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
  }
}

const toBase64 = (dataUrl: string) => {
  const raw = String(dataUrl || '')
  const parts = raw.split(',')
  return parts.length > 1 ? parts[1] : raw
}

const normalizeImage = (value: unknown, filename?: string) => {
  if (typeof value !== 'string' || !value) return null
  if (value.startsWith('data:') || value.startsWith('http')) return value
  const ext = filename?.split('.').pop()?.toLowerCase()
  const mime =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'webp'
      ? 'image/webp'
      : ext === 'gif'
      ? 'image/gif'
      : 'image/png'
  return `data:${mime};base64,${value}`
}

const extractErrorMessage = (payload: any) =>
  payload?.error ||
  payload?.message ||
  payload?.output?.error ||
  payload?.result?.error ||
  payload?.output?.output?.error ||
  payload?.result?.output?.error

const isFailureStatus = (status: unknown) => {
  const normalized = String(status || '').toLowerCase()
  return normalized.includes('fail') || normalized.includes('error') || normalized.includes('cancel')
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

const isOomErrorMessage = (value: unknown) => {
  const text = String(value || '').toLowerCase()
  return (
    text.includes('out of memory') ||
    text.includes('allocation on device') ||
    text.includes('would exceed allowed memory') ||
    text.includes('cuda')
  )
}

const normalizeErrorMessage = (value: unknown) => {
  if (isOomErrorMessage(value)) return 'Image size is too large. Please use a smaller image.'
  const text = typeof value === 'string' ? value : value instanceof Error ? value.message : String(value || '')
  return text || 'Unexpected error.'
}

const extractJobId = (payload: any) => payload?.id || payload?.jobId || payload?.job_id || payload?.output?.id

const extractImageList = (payload: any) => {
  const output = payload?.output ?? payload?.result ?? payload
  const nested = output?.output ?? output?.result ?? output?.data ?? payload?.output?.output ?? payload?.result?.output
  const listCandidates = [
    output?.images,
    output?.output_images,
    output?.outputs,
    output?.data,
    payload?.images,
    payload?.output_images,
    nested?.images,
    nested?.output_images,
    nested?.outputs,
    nested?.data,
  ]

  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate)) continue
    const normalized = candidate
      .map((item: any) => {
        const raw = item?.image ?? item?.data ?? item?.url ?? item
        const name = item?.filename
        return normalizeImage(raw, name)
      })
      .filter(Boolean) as string[]
    if (normalized.length) return normalized
  }

  const singleCandidates = [
    output?.image,
    output?.output_image,
    output?.output_image_base64,
    payload?.image,
    payload?.output_image_base64,
    nested?.image,
    nested?.output_image,
    nested?.output_image_base64,
  ]

  for (const candidate of singleCandidates) {
    const normalized = normalizeImage(candidate)
    if (normalized) return [normalized]
  }

  return []
}

const base64ToBlob = (base64: string, mime: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
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

export function SparkArtQwen({
  generationMode,
  onChangeMode,
  accessToken,
  selectedTicketCost,
  ticketStatus,
  ticketCount,
  ticketMessage,
  onOpenPurchaseConfirm,
  bonusStatus,
  bonusCanClaim,
  bonusNextEligibleAt,
  bonusRouletteRolling,
  bonusRouletteAwarded,
  bonusClaiming,
  bonusMessage,
  onClaimDailyBonus,
  formatTimeUntilClaim,
  onEnsureTickets,
  onTicketShortage,
  onTicketCountUpdate,
}: SparkArtQwenProps) {
  const [sourceName, setSourceName] = useState('')
  const [sourceData, setSourceData] = useState('')
  const [references, setReferences] = useState<RefImage[]>(
    Array.from({ length: REF_COUNT }, () => ({ name: '', data: '' })),
  )
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [cfg, setCfg] = useState(DEFAULT_CFG)
  const [width, setWidth] = useState(DEFAULT_DIMENSION)
  const [height, setHeight] = useState(DEFAULT_DIMENSION)
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [error, setError] = useState('')
  const [resultImage, setResultImage] = useState('')

  const hasBaseImage = Boolean(sourceData)
  const canGenerate = useMemo(
    () => hasBaseImage && prompt.trim().length > 0 && !isRunning,
    [hasBaseImage, prompt, isRunning],
  )

  const handleSourceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.target
    const file = inputEl.files?.[0]
    if (!file) return
    try {
      const preprocessed = await preprocessImage(file)
      setSourceName(file.name)
      setSourceData(preprocessed.dataUrl)
      setWidth(preprocessed.width)
      setHeight(preprocessed.height)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image.')
    } finally {
      inputEl.value = ''
    }
  }

  const handleReferenceChange = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.target
    const file = inputEl.files?.[0]
    if (!file) return
    try {
      const preprocessed = await preprocessImage(file)
      setReferences((prev) => {
        const next = [...prev]
        next[index] = { name: file.name, data: preprocessed.dataUrl }
        return next
      })
      if (!sourceData) {
        setWidth(preprocessed.width)
        setHeight(preprocessed.height)
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reference image.')
    } finally {
      inputEl.value = ''
    }
  }

  const handleClearSource = () => {
    setSourceName('')
    setSourceData('')
    if (!references.some((item) => item.data)) {
      setWidth(DEFAULT_DIMENSION)
      setHeight(DEFAULT_DIMENSION)
    }
  }

  const handleClearReference = (index: number) => {
    let hasRemainingReference = false
    setReferences((prev) => {
      const next = [...prev]
      next[index] = { name: '', data: '' }
      hasRemainingReference = next.some((item) => item.data)
      return next
    })
    if (!sourceData && !hasRemainingReference) {
      setWidth(DEFAULT_DIMENSION)
      setHeight(DEFAULT_DIMENSION)
    }
  }

  const pollJob = async (jobId: string, usageId: string) => {
    for (let i = 0; i < 180; i += 1) {
      setStatus(`Polling (${i + 1}/180)...`)
      const headers: Record<string, string> = {}
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }
      const query = new URLSearchParams({
        id: jobId,
        usage_id: usageId,
      })
      const res = await fetch(`${API_ENDPOINT}?${query.toString()}`, { headers })
      const data = await res.json().catch(() => ({}))
      const nextTickets = Number(data?.ticketsLeft ?? data?.tickets_left)
      if (Number.isFinite(nextTickets)) {
        onTicketCountUpdate(nextTickets)
      }

      if (!res.ok) {
        const message = normalizeErrorMessage(extractErrorMessage(data) || 'Failed to fetch job status.')
        if (isTicketShortage(res.status, message)) {
          onTicketShortage()
          throw new Error('TICKET_SHORTAGE')
        }
        throw new Error(message)
      }

      const statusError = extractErrorMessage(data)
      const upstreamStatus = data?.status || data?.state || ''
      if (statusError || isFailureStatus(upstreamStatus)) {
        if (statusError && isTicketShortage(400, String(statusError))) {
          onTicketShortage()
          throw new Error('TICKET_SHORTAGE')
        }
        throw new Error(normalizeErrorMessage(statusError || `Job failed (${upstreamStatus}).`))
      }

      const images = extractImageList(data)
      if (images.length) return images[0]

      await wait(2000)
    }
    throw new Error('Timed out while waiting for image generation.')
  }

  const handleGenerate = async () => {
    if (!canGenerate) return
    if (!accessToken) {
      setError('ログインが必要です。')
      return
    }
    const hasTicket = await onEnsureTickets()
    if (!hasTicket) {
      return
    }
    setIsRunning(true)
    setError('')
    setResultImage('')
    setStatus('Submitting job...')

    try {
      const sourceBase64 = toBase64(sourceData)
      if (!sourceBase64) {
        throw new Error('ベース画像は必須です。')
      }
      const refImages = references
        .map((item) => toBase64(item.data))
        .filter(Boolean)
        .slice(0, REF_COUNT)
      const primaryImage = sourceBase64
      if (!refImages.length && sourceBase64) {
        refImages.push(sourceBase64)
      }
      const body = {
        input: {
          variant: 'qwen_edit',
          worker_mode: 'comfyui',
          mode: 'comfyui',
          prompt,
          negative_prompt: negativePrompt,
          image_base64: primaryImage,
          reference_images: refImages,
          width: Number(width),
          height: Number(height),
          steps: 4,
          cfg: Number(cfg.toFixed(1)),
          randomize_seed: true,
        },
      }

      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => ({}))
      const nextTickets = Number(data?.ticketsLeft ?? data?.tickets_left)
      if (Number.isFinite(nextTickets)) {
        onTicketCountUpdate(nextTickets)
      }
      if (!res.ok) {
        const message = normalizeErrorMessage(extractErrorMessage(data) || 'Generation request failed.')
        if (isTicketShortage(res.status, message)) {
          onTicketShortage()
          throw new Error('TICKET_SHORTAGE')
        }
        throw new Error(message)
      }

      const images = extractImageList(data)
      if (images.length) {
        setResultImage(images[0])
        setStatus('Done')
        return
      }

      const jobId = extractJobId(data)
      if (!jobId) {
        throw new Error('Job ID was not returned from API.')
      }
      const usageId = String(data?.usage_id ?? data?.usageId ?? '')
      if (!usageId) {
        throw new Error('usage_id was not returned from API.')
      }

      const finalImage = await pollJob(jobId, usageId)
      setResultImage(finalImage)
      setStatus('Done')
    } catch (err) {
      const message = normalizeErrorMessage(err instanceof Error ? err.message : err)
      if (message === 'TICKET_SHORTAGE') {
        setStatus('Idle')
        setError('')
      } else {
        setStatus('Error')
        setError(message)
      }
    } finally {
      setIsRunning(false)
    }
  }

  const handleDownloadImage = async () => {
    if (!resultImage) return
    const filename = `sparkart-edit-${Date.now()}.png`
    try {
      let blob: Blob
      if (resultImage.startsWith('data:')) {
        blob = dataUrlToBlob(resultImage, 'image/png')
      } else if (resultImage.startsWith('http') || resultImage.startsWith('blob:')) {
        const response = await fetch(resultImage)
        blob = await response.blob()
      } else {
        blob = base64ToBlob(resultImage, 'image/png')
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
      window.location.assign(resultImage)
    }
  }

  return (
    <main className='video-studio-layout sa-page sa-page--embedded'>
      <section className='studio-block studio-block--input sa-form-card'>
        <header className='studio-head studio-head--with-mode sa-editor-head'>
          <div className='studio-head__copy'>
            <h2>編集</h2>
            <p>ベース画像は必須です。参考画像は任意です。</p>
          </div>
          <div className='studio-mode-switch studio-mode-switch--inline' aria-label='Generation mode switch'>
            <button
              type='button'
              className={`studio-mode-switch__btn${generationMode === 'i2v' ? ' is-active' : ''}`}
              onClick={() => onChangeMode('i2v')}
            >
              Video
            </button>
            <button
              type='button'
              className={`studio-mode-switch__btn${generationMode === 'qwen_edit' ? ' is-active' : ''}`}
              onClick={() => onChangeMode('qwen_edit')}
            >
              Edit
            </button>
          </div>
        </header>

        <div className='studio-ticket-row'>
          <div className='studio-ticket'>
            {ticketStatus === 'loading' && 'コイン確認中...'}
            {ticketStatus !== 'loading' && `保有コイン数 ${ticketCount ?? 0}枚`}
            {ticketStatus === 'error' && ticketMessage ? ` / ${ticketMessage}` : ''}
          </div>
          <button type='button' className='ghost-button studio-buy-button' onClick={onOpenPurchaseConfirm}>
            コインを購入する
          </button>
        </div>

        <div className='sa-upload-grid'>
          <label className='studio-upload sa-upload-card'>
            <input type='file' accept='image/*' onChange={handleSourceChange} />
            <div className='studio-upload__inner'>
              <div className='studio-upload__icon' aria-hidden='true'>
                +
              </div>
              <div className='studio-upload__text'>
                <strong>{sourceName || 'ベース画像をアップロード'}</strong>
                <span>ベース画像（必須）</span>
              </div>
              <span className='studio-upload__chip'>ベース</span>
            </div>
          </label>

          {references.map((ref, index) => (
            <label key={index} className='studio-upload sa-upload-card'>
              <input type='file' accept='image/*' onChange={(event) => handleReferenceChange(index, event)} />
              <div className='studio-upload__inner'>
                <div className='studio-upload__icon' aria-hidden='true'>
                  +
                </div>
                <div className='studio-upload__text'>
                  <strong>{ref.name || '参考画像をアップロード'}</strong>
                  <span>参考画像（任意）</span>
                </div>
                <span className='studio-upload__chip'>参考</span>
              </div>
            </label>
          ))}
        </div>

        <div className='sa-preview-grid'>
          {sourceData ? (
            <figure className='studio-thumb'>
              <img src={sourceData} alt={sourceName || 'base'} />
              <button
                className='studio-thumb__remove'
                type='button'
                onClick={() => handleClearSource()}
                aria-label='Remove base image'
              >
                x
              </button>
            </figure>
          ) : (
            <div className='sa-empty-preview'>ベース画像プレビュー</div>
          )}

          {references.map((ref, index) =>
            ref.data ? (
              <figure key={index} className='studio-thumb'>
                <img src={ref.data} alt={ref.name || `reference-${index + 1}`} />
                <button
                  className='studio-thumb__remove'
                  type='button'
                  onClick={() => handleClearReference(index)}
                  aria-label={`Remove reference ${index + 1}`}
                >
                  x
                </button>
              </figure>
            ) : (
              <div key={index} className='sa-empty-preview'>{`参考画像 ${index + 1} プレビュー`}</div>
            ),
          )}
        </div>

        <label className='studio-field'>
          <span>プロンプト</span>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={PROMPT_PLACEHOLDER}
            maxLength={PROMPT_MAX_LENGTH}
          />
          <small className='sa-input-meta'>{`${prompt.length}/${PROMPT_MAX_LENGTH}`}</small>
        </label>

        <label className='studio-field studio-field--sub'>
          <span>ネガティブプロンプト</span>
          <textarea
            rows={3}
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder='任意'
          />
        </label>

        <label className='studio-field studio-field--sub'>
          <span>CFG</span>
          <input
            type='range'
            min={CFG_MIN}
            max={CFG_MAX}
            step={CFG_STEP}
            value={cfg}
            onChange={(event) => setCfg(Number(event.target.value))}
            disabled={isRunning}
          />
          <small className='sa-input-meta'>{`現在: ${cfg.toFixed(1)}`}</small>
          <small className='sa-input-meta'>CFGはプロンプトの効きやすさです。</small>
        </label>

        <div className='studio-actions'>
          <button className='primary-button' type='button' disabled={!canGenerate} onClick={handleGenerate}>
            {isRunning ? '生成中...' : '画像を生成'}
          </button>
          <small>{`コイン消費: 1回につき${selectedTicketCost}コイン`}</small>
        </div>

        <section className='studio-credit-box'>
          <header>
            <h3>デイリーコイン</h3>
            <span className={`studio-bonus-pill${bonusCanClaim ? ' is-ready' : ''}`}>
              {bonusStatus === 'loading' && 'ステータス更新中'}
              {bonusStatus !== 'loading' && bonusCanClaim && '今すぐ受け取り可能'}
              {bonusStatus !== 'loading' &&
                !bonusCanClaim &&
                bonusNextEligibleAt &&
                formatTimeUntilClaim(bonusNextEligibleAt)}
            </span>
          </header>
          <div className={`studio-bonus-panel${bonusRouletteRolling ? ' is-rolling' : ''}`} aria-live='polite'>
            <div className='studio-bonus-panel__icon'>COIN</div>
            <div className='studio-bonus-panel__meta'>
              <strong>{bonusRouletteRolling ? '付与処理中...' : '24時間ごとに1コインを受け取れます'}</strong>
              <span>
                {bonusCanClaim ? 'ログイン中なら毎日1回受け取れます' : '次回の受け取りまでクールタイムがあります'}
              </span>
              {bonusRouletteAwarded !== null && <span>今回の付与 +{bonusRouletteAwarded}コイン</span>}
            </div>
          </div>
          <button
            type='button'
            className='primary-button'
            onClick={onClaimDailyBonus}
            disabled={bonusClaiming || bonusStatus === 'loading' || !bonusCanClaim}
          >
            {bonusClaiming ? 'コインを受け取り中...' : 'ログインボーナスを受け取る'}
          </button>
          {bonusMessage && <p className='studio-credit-msg'>{bonusMessage}</p>}
        </section>

        <div className='sa-status-wrap'>
          {error ? <p className='sa-error'>{error}</p> : null}
        </div>
      </section>

      <section className='studio-block studio-block--output sa-result-card'>
        <header className='studio-output-head'>
          <div>
            <h2>生成結果</h2>
          </div>
          {resultImage ? (
            <button type='button' className='ghost-button sa-download-btn' onClick={handleDownloadImage}>
              Save
            </button>
          ) : null}
        </header>

        <div className='studio-stage sa-edit-stage'>
          {isRunning ? (
            <div className='studio-loading' role='status' aria-live='polite'>
              <div className='studio-loading__bars' aria-hidden='true'>
                <span />
                <span />
                <span />
              </div>
              <strong>生成中...</strong>
              <p>1分前後かかる場合があります。</p>
            </div>
          ) : resultImage ? (
            <img className='sa-result' src={resultImage} alt='result' />
          ) : (
            <div className='studio-empty'>ベース画像とプロンプトを設定するとここに表示されます。</div>
          )}
        </div>

      </section>
    </main>
  )
}

