import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAuthConfigured, supabase } from '../lib/supabaseClient'
import { getOAuthRedirectUrl } from '../lib/oauthRedirect'
import './camera.css'
import './video-studio.css'

const OAUTH_REDIRECT_URL = getOAuthRedirectUrl()

export function EmailLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    const normalized = email.trim()
    if (!normalized) {
      setMessage('Please enter your email address.')
      return
    }
    if (!supabase || !isAuthConfigured) {
      setMessage('Auth configuration is not ready.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          emailRedirectTo: OAUTH_REDIRECT_URL,
        },
      })

      if (error) {
        setMessage(error.message)
        return
      }

      setMessage('Magic link sent. Please check your email.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='camera-app camera-app--guest video-studio-page'>
      <section className='email-login-page'>
        <div className='email-login-card'>
          <h1>Email Login</h1>
          <p>We will send a magic link to your email.</p>
          <label htmlFor='email-login-input'>Email</label>
          <input
            id='email-login-input'
            type='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder='you@example.com'
            autoComplete='email'
          />
          <div className='email-login-actions'>
            <button type='button' className='primary-button primary-button--pink' onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Email'}
            </button>
            <button type='button' className='ghost-button' onClick={() => navigate('/video')}>
              Back
            </button>
          </div>
          {message ? <small>{message}</small> : null}
        </div>
      </section>
    </div>
  )
}