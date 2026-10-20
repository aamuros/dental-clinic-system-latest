import { useEffect, useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  window.addEventListener('storage', callback)
  window.addEventListener('clinic-theme-change', callback)
  media.addEventListener('change', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('clinic-theme-change', callback)
    media.removeEventListener('change', callback)
  }
}

function snapshot() {
  try {
    const theme = localStorage.getItem('clinic-theme')
    return theme
      ? theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return document.documentElement.classList.contains('dark')
  }
}

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, snapshot, () => false)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  return {
    dark,
    toggleTheme() {
      const next = !dark
      try {
        localStorage.setItem('clinic-theme', next ? 'dark' : 'light')
      } catch {
        /* Restricted storage still permits a session-only theme. */
      }
      document.documentElement.classList.toggle('dark', next)
      window.dispatchEvent(new Event('clinic-theme-change'))
    },
  }
}
