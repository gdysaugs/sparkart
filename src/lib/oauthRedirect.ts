const parseUrl = (value: string) => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export const getOAuthRedirectUrl = () => {
  const currentOrigin =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined
  const configured = import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined
  if (configured) {
    const configuredUrl = parseUrl(configured)
    if (configuredUrl) return configured
  }
  return currentOrigin
}
