import { getRuntimePublicConfig } from './publicConfig'

const parseUrl = (value: string) => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

const toRedirectLocation = (url: URL) => `${url.origin}${url.pathname}`
const isBlockedHost = (hostname: string) => hostname.toLowerCase().includes('sparkwork')

export const getOAuthRedirectUrl = () => {
  if (typeof window === 'undefined') return undefined

  const current = parseUrl(window.location.href)
  if (!current) return undefined
  const currentUrl = toRedirectLocation(current)

  if (isBlockedHost(current.hostname)) return currentUrl

  const runtimeConfig = getRuntimePublicConfig()
  const configured =
    (import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined) || runtimeConfig.VITE_SUPABASE_REDIRECT_URL

  if (configured) {
    const configuredUrl = parseUrl(configured)
    if (configuredUrl && configuredUrl.origin === current.origin && !isBlockedHost(configuredUrl.hostname)) {
      return toRedirectLocation(configuredUrl)
    }
  }

  return currentUrl
}
