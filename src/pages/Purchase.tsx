import { useCallback, useEffect, useState } from 'react'
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
  const [bonusStatus, setBonusStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [bonusMessage, setBonusMessage] = useState('')
  const [bonusCanClaim, setBonusCanClaim] = useState(false)
  const [bonusNextEligibleAt, setBonusNextEligibleAt] = useState<string | null>(null)
  const [bonusClaiming, setBonusClaiming] = useState(false)

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
      setBonusMessage(data?.error || 'ログインボーナス状態の取得に失敗しました。')
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
    setBonusStatus('idle')
    setBonusMessage('')
    setBonusCanClaim(false)
    setBonusNextEligibleAt(null)
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

  const formatDateTime = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    return date.toLocaleString('ja-JP', { hour12: false })
  }

  const handleClaimDailyBonus = async () => {
    if (!session || !accessToken || bonusClaiming) return
    setBonusClaiming(true)
    setBonusMessage('')
    const res = await fetch('/api/daily_bonus', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBonusStatus('error')
      setBonusMessage(data?.error || 'ログインボーナスの受取に失敗しました。')
      setBonusClaiming(false)
      return
    }

    const granted = Boolean(data?.granted)
    const nextEligibleAt = typeof data?.nextEligibleAt === 'string' ? data.nextEligibleAt : null
    setBonusNextEligibleAt(nextEligibleAt)
    setBonusCanClaim(false)

    if (granted) {
      const nextTickets = Number(data?.ticketsLeft)
      if (Number.isFinite(nextTickets)) {
        setTicketCount(nextTickets)
      } else {
        await fetchTickets(accessToken)
      }
      setBonusStatus('idle')
      setBonusMessage('ログインボーナスを受け取りました。（+15）')
    } else {
      setBonusStatus('idle')
      setBonusMessage(
        nextEligibleAt
          ? `まだ受け取れません。次回: ${formatDateTime(nextEligibleAt)}`
          : 'まだ受け取れません。',
      )
    }

    await fetchDailyBonus(accessToken)
    setBonusClaiming(false)
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
              <div className="daily-bonus">
                <div className="daily-bonus__meta">
                  <strong>ログインボーナス（+15）</strong>
                  {bonusStatus === 'loading' && <span>状態を確認中...</span>}
                  {bonusStatus !== 'loading' && bonusCanClaim && <span>今すぐ受け取れます</span>}
                  {bonusStatus !== 'loading' && !bonusCanClaim && bonusNextEligibleAt && (
                    <span>次回受取: {formatDateTime(bonusNextEligibleAt)}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleClaimDailyBonus}
                  disabled={bonusClaiming || bonusStatus === 'loading' || !bonusCanClaim}
                >
                  {bonusClaiming ? '受取中...' : '受け取る'}
                </button>
              </div>
              {bonusMessage && <div className="ticket-message">{bonusMessage}</div>}
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

