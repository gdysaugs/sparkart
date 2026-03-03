import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

const loadRuntimePublicConfig = async () => {
  try {
    const response = await fetch('/api/public_config', { cache: 'no-store' })
    if (!response.ok) return
    const payload = await response.json()
    if (payload && typeof payload === 'object') {
      window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__, payload)
    }
  } catch (error) {
    console.warn('Failed to load runtime public config.', error)
  }
}

const bootstrap = async () => {
  await loadRuntimePublicConfig()
  const { App } = await import('./App')

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

void bootstrap()
