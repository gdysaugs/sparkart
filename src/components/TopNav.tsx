import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const SPARKBEAT_URL = 'https://sparkbeat.org/'
const COIN_PURCHASE_URL = '/purchase'
const SPARKMOTION_URL = 'https://sparkmotion.work/'
const SPARKHEART_URL = 'https://sparkheart.uk/'

export function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className='top-nav'>
      <Link className='top-nav__brand' to='/video' onClick={() => setMenuOpen(false)}>
        <span className='top-nav__title'>Spark Art</span>
      </Link>
      <button
        type='button'
        className={`top-nav__toggle${menuOpen ? ' is-open' : ''}`}
        aria-label='メニュー'
        aria-expanded={menuOpen}
        aria-controls='top-nav-menu'
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav id='top-nav-menu' className={`top-nav__links${menuOpen ? ' is-open' : ''}`}>
        <a className='top-nav__link' href={COIN_PURCHASE_URL} onClick={() => setMenuOpen(false)}>
          コインを購入する
        </a>
        <a className='top-nav__link' href={SPARKBEAT_URL} target='_blank' rel='noreferrer' onClick={() => setMenuOpen(false)}>
          SparkBeatを使う
        </a>
        <a className='top-nav__link' href={SPARKMOTION_URL} target='_blank' rel='noreferrer' onClick={() => setMenuOpen(false)}>
          SparkMotionを使う
        </a>
        <a className='top-nav__link' href={SPARKHEART_URL} target='_blank' rel='noreferrer' onClick={() => setMenuOpen(false)}>
          SparkHeartを使う
        </a>
      </nav>
    </header>
  )
}
