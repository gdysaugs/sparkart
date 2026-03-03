type Env = {
  VITE_SUPABASE_URL?: string
  SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_REDIRECT_URL?: string
}

const normalize = (value?: string) => (value ?? '').trim().replace(/^['"]|['"]$/g, '')

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const payload = {
    VITE_SUPABASE_URL: normalize(env.VITE_SUPABASE_URL) || normalize(env.SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: normalize(env.VITE_SUPABASE_ANON_KEY),
    VITE_SUPABASE_REDIRECT_URL: normalize(env.VITE_SUPABASE_REDIRECT_URL),
  }

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
