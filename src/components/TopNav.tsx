import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

export function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className='top-nav'>
      <div className='top-nav__brand'>
        <span className='top-nav__title'>SparkMotion</span>
      </div>
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
        <NavLink to='/video' className={({ isActive }) => `top-nav__link${isActive ? ' is-active' : ''}`}>
          動画生成
        </NavLink>
        <NavLink to='/purchase' className={({ isActive }) => `top-nav__link${isActive ? ' is-active' : ''}`}>
          コイン
        </NavLink>
      </nav>
    </header>
  )
}
