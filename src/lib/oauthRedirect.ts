import { getRuntimePublicConfig } from './publicConfig'

const parseUrl = (value: string) => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

const sameOrigin = (a: string, b: string) => {
  const left = parseUrl(a)
  const right = parseUrl(b)
  if (!left || !right) return false
  return left.origin === right.origin
}

export const getOAuthRedirectUrl = () => {
  const currentUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined
  const runtimeConfig = getRuntimePublicConfig()
  const configured =
    (import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined) || runtimeConfig.VITE_SUPABASE_REDIRECT_URL
  if (configured) {
    const configuredUrl = parseUrl(configured)
    if (configuredUrl && currentUrl && sameOrigin(configured, currentUrl)) return configured
  }
  return currentUrl
}
