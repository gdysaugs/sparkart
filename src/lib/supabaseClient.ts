import { createClient } from '@supabase/supabase-js'
import { getRuntimePublicConfig } from './publicConfig'

function normalizeEnvString(v: string | undefined): string {
  // Guard against accidentally quoted/whitespace-padded values in build vars.
  return (v ?? '').trim().replace(/^"(.*)"$/, '$1')
}

function normalizeSupabaseUrl(v: string | undefined): string {
  const s = normalizeEnvString(v)
  if (!s) return ''

  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    // Supabase client expects a base URL, not an arbitrary path.
    return u.origin
  } catch {
    return ''
  }
}

const runtimeConfig = getRuntimePublicConfig()
const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || runtimeConfig.VITE_SUPABASE_URL)
const supabaseAnonKey = normalizeEnvString(import.meta.env.VITE_SUPABASE_ANON_KEY || runtimeConfig.VITE_SUPABASE_ANON_KEY)

export const isAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isAuthConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

function getSupabaseProjectRef(url: string): string {
  if (!url) return ''
  try {
    const hostname = new URL(url).hostname
    const first = hostname.split('.')[0] ?? ''
    return first.trim()
  } catch {
    return ''
  }
}

function clearSupabaseBrowserStorage() {
  if (typeof window === 'undefined') return

  const projectRef = getSupabaseProjectRef(supabaseUrl)
  const prefixes = projectRef ? [`sb-${projectRef}-`, 'supabase.auth.token'] : ['sb-', 'supabase.auth.token']
  const storages: Storage[] = []

  try {
    storages.push(window.localStorage)
  } catch {
    // ignore
  }
  try {
    storages.push(window.sessionStorage)
  } catch {
    // ignore
  }

  for (const storage of storages) {
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (!key) continue
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      storage.removeItem(key)
    }
  }
}

export async function signOutSafely(): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
  } catch {
    // If Supabase returns 403 on logout, still clear browser-side session keys.
  } finally {
    clearSupabaseBrowserStorage()
  }
}
