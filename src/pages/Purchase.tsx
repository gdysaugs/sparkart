import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isAuthConfigured, signOutSafely, supabase } from '../lib/supabaseClient'
import { PURCHASE_PLANS } from '../lib/purchasePlans'
import { getOAuthRedirectUrl } from '../lib/oauthRedirect'
import { TopNav } from '../components/TopNav'
import './camera.css'

const OAUTH_REDIRECT_URL = getOAuthRedirectUrl()

export function Purchase() {
  const [session, setSession] = useState<Session | null>(null)
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [authMessage, setAuthMessage] = useState('')
  const [ticketCount, setTicketCount] = useState<number | null>(null)
  const [ticketStatus, setTicketStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [ticketMessage, setTicketMessage] = useState('')
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [purchaseMessage, setPurchaseMessage] = useState('')
  const confirmedCheckoutRef = useRef('')

  const accessToken = session?.access_token ?? ''

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthStatus('idle')
      setAuthMessage('')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase) return
    const url = new URL(window.location.href)
    const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error')
    if (oauthError) {
      console.error('OAuth callback error', oauthError)
      setAuthStatus('error')
      setAuthMessage('ログインに失敗しました。もう一度お試しください。')
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
        setAuthStatus('error')
        setAuthMessage('ログインに失敗しました。もう一度お試しください。')
        return
      }
      const cleaned = new URL(window.location.href)
      cleaned.searchParams.delete('code')
      cleaned.searchParams.delete('state')
      window.history.replaceState({}, document.title, cleaned.toString())
    })
  }, [])

  const fetchTickets = useCallback(async (token: string) => {
    if (!token) return
    setTicketStatus('loading')
    setTicketMessage('')
    const res = await fetch('/api/tickets', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setTicketStatus('error')
      setTicketMessage(data?.error || 'コイン取得に失敗しました。')
      setTicketCount(null)
      return
    }
    setTicketStatus('idle')
    setTicketMessage('')
    setTicketCount(Number(data?.tickets ?? 0))
  }, [])

  useEffect(() => {
    if (!session || !accessToken) {
      setTicketCount(null)
      setTicketStatus('idle')
      setTicketMessage('')
      return
    }
    void fetchTickets(accessToken)
  }, [accessToken, fetchTickets, session])

  useEffect(() => {
    if (!session || !accessToken) return
    const url = new URL(window.location.href)
    const checkoutResult = url.searchParams.get('checkout')
    const checkoutSessionId = url.searchParams.get('session_id')

    const cleanCheckoutParams = () => {
      const cleaned = new URL(window.location.href)
      cleaned.searchParams.delete('checkout')
      cleaned.searchParams.delete('session_id')
      window.history.replaceState({}, document.title, cleaned.toString())
    }

    if (checkoutResult === 'cancel') {
      setPurchaseStatus('idle')
      setPurchaseMessage('購入をキャンセルしました。')
      cleanCheckoutParams()
      return
    }

    if (checkoutResult !== 'success' || !checkoutSessionId) return
    if (confirmedCheckoutRef.current === checkoutSessionId) return
    confirmedCheckoutRef.current = checkoutSessionId

    const confirmCheckout = async () => {
      setPurchaseStatus('loading')
      setPurchaseMessage('購入を確認中...')
      const res = await fetch('/api/stripe/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ session_id: checkoutSessionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPurchaseStatus('error')
        setPurchaseMessage(data?.error || '購入確認に失敗しました。')
        return
      }
      setPurchaseStatus('idle')
      setPurchaseMessage(data?.alreadyProcessed ? '購入は反映済みです。' : '購入が完了しました。コインを付与しました。')
      const nextTickets = Number(data?.tickets ?? data?.coins)
      if (Number.isFinite(nextTickets)) {
        setTicketCount(nextTickets)
      } else {
        await fetchTickets(accessToken)
      }
      cleanCheckoutParams()
    }

    void confirmCheckout()
  }, [accessToken, fetchTickets, session])

  const handleGoogleSignIn = async () => {
    if (!supabase || !isAuthConfigured) {
      setAuthStatus('error')
      setAuthMessage('認証設定が未完了です。')
      return
    }
    setAuthStatus('loading')
    setAuthMessage('')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: OAUTH_REDIRECT_URL, queryParams: { prompt: 'select_account' } },
    })
    if (error) {
      setAuthStatus('error')
      setAuthMessage(error.message)
      return
    }
    if (data?.url) {
      window.location.assign(data.url)
      return
    }
    setAuthStatus('error')
    setAuthMessage('認証URLの取得に失敗しました。')
  }

  const handleSignOut = async () => {
    if (!supabase) return
    await signOutSafely()
    setSession(null)
    setTicketCount(null)
    setTicketStatus('idle')
    setTicketMessage('')
    setAuthStatus('idle')
    setAuthMessage('')
  }

  const handleCheckout = async (priceId: string) => {
    if (!session || !accessToken) {
      setPurchaseStatus('error')
      setPurchaseMessage('購入するにはログインが必要です。')
      return
    }
    setPurchaseStatus('loading')
    setPurchaseMessage('決済ページへ移動中...')
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ price_id: priceId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.url) {
      setPurchaseStatus('error')
      setPurchaseMessage(data?.error || '決済作成に失敗しました。')
      return
    }
    window.location.assign(data.url)
  }

  return (
    <div className="camera-app purchase-app">
      <TopNav />
      <div className="purchase-shell">
        <section className="purchase-panel">
          <div className="panel-header">
            <div className="panel-title">
              <h2>アカウント</h2>
              <span>{session ? 'ログイン中' : 'ログインしてください。'}</span>
            </div>
            <div className="panel-auth">
              {session ? (
                <div className="auth-status">
                  <span className="auth-email">{session.user?.email ?? 'ログイン中'}</span>
                  <button type="button" className="ghost-button" onClick={handleSignOut}>
                    ログアウト
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleGoogleSignIn}
                  disabled={authStatus === 'loading'}
                >
                  {authStatus === 'loading' ? '接続中...' : 'Googleで登録 / ログイン'}
                </button>
              )}
            </div>
          </div>
          {authMessage && <div className="auth-message">{authMessage}</div>}
          {session && (
            <>
              <div className="ticket-message">
                {ticketStatus === 'loading' && 'コイン確認中...'}
                {ticketStatus !== 'loading' && `あなたの残りコイン保有数${ticketCount ?? 0}枚`}
                {ticketStatus === 'error' && ticketMessage ? ` / ${ticketMessage}` : ''}
              </div>
            </>
          )}
        </section>

        <section className="purchase-panel">
          <div className="panel-header">
            <div className="panel-title">
              <h2>コイン購入</h2>
              <span>好きなパックを購入。</span>
            </div>
          </div>
          <div className="plan-grid">
            {PURCHASE_PLANS.map((plan) => (
              <div key={plan.id} className="plan-card">
                <div>
                  <div className="plan-label">{plan.label}</div>
                  <div className="plan-tickets">{plan.tickets} コイン</div>
                </div>
                <div className="plan-price">¥{plan.price.toLocaleString()}</div>
                <button
                  type="button"
                  className="plan-action"
                  onClick={() => handleCheckout(plan.priceId)}
                  disabled={!session || purchaseStatus === 'loading'}
                >
                  購入
                </button>
              </div>
            ))}
          </div>
          {purchaseMessage && <div className="purchase-message">{purchaseMessage}</div>}
        </section>
      </div>
    </div>
  )
}

