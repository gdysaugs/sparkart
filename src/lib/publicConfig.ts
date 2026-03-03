export type RuntimePublicConfig = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_REDIRECT_URL?: string
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimePublicConfig
  }
}

const normalize = (value: string | undefined) => (value ?? '').trim().replace(/^"(.*)"$/, '$1')

export const getRuntimePublicConfig = (): RuntimePublicConfig => {
  if (typeof window === 'undefined') return {}
  const config = window.__APP_CONFIG__
  if (!config || typeof config !== 'object') return {}
  return {
    VITE_SUPABASE_URL: normalize(config.VITE_SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: normalize(config.VITE_SUPABASE_ANON_KEY),
    VITE_SUPABASE_REDIRECT_URL: normalize(config.VITE_SUPABASE_REDIRECT_URL),
  }
}
