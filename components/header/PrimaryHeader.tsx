// components/header/PrimaryHeader.tsx
'use client'
import { type FC, type MouseEvent, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BeginJourneyButton from './BeginJourneyButton'
import SignOutButton from './SignOutButton'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import Logo from './Logo'
const supabase = createClient()

export interface SectionLink { href: string; label: string }
export interface PrimaryHeaderProps {
  sections?: ReadonlyArray<SectionLink>
  scrollDuration?: number
  className?: string
}

const scrollToTop = () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch { window.scrollTo(0, 0) } }
const scrollElementIntoView = (el: Element) => {
  try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  catch { const r = (el as HTMLElement).getBoundingClientRect().top; window.scrollTo(0, r + (window.scrollY || window.pageYOffset)) }
}

const PrimaryHeader: FC<PrimaryHeaderProps> = ({ sections = [], className = '' }) => {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    })()
  }, [])
  const pathname = usePathname()

  const navLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`
        text-base sm:font-medium font-medium
        text-[#0f0f0f]
        transition duration-200
        ${pathname === href ? 'underline underline-offset-4' : 'hover:underline hover:underline-offset-4'}
      `}
    >
      {label}
    </Link>
  )

  const handleSectionClick =
    (href: string) =>
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault()
      const id = href.replace('#', '')
      const el = document.getElementById(id)
      if (!el) return
      scrollElementIntoView(el)
    }

  const brandContent = (
    <div className="flex items-center gap-2">
      <Logo className="w-12 h-12" />
      <span className="text-xl sm:text-2xl md:text-3xl font-semibold text-[#0f0f0f]">PitchTime.Pro</span>
    </div>
  )

  return (
    <header
      className={`
        fixed inset-x-0 top-0 z-20 h-20
        px-2 sm:px-4 md:px-8 lg:px-16
        grid grid-cols-3 items-center
        backdrop-blur-sm backdrop-saturate-50
        bg-[#f0f0f0]/20
        supports-[not(backdrop-filter)]:bg-[#f0f0f0]/20
        ${className}
      `}
    >
      {/* Brand / Home link */}
      <div className="justify-self-start">
        {pathname === '/' ? (
          <a href="#top" onClick={(e) => { e.preventDefault(); scrollToTop() }}>{brandContent}</a>
        ) : (
          <Link href="/">{brandContent}</Link>
        )}
      </div>

      {/* Optional center-column links */}
      {sections.length ? (
        <nav className="justify-self-center flex space-x-4 sm:space-x-10">
          {sections.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={handleSectionClick(href)}
              className="text-base hidden xl:block lg:text-lg text-[#0f0f0f] transition duration-200 hover:underline hover:underline-offset-4"
            >
              {label}
            </a>
          ))}
        </nav>
      ) : <div className="justify-self-center" />}

      {/* Right-side auth / utility */}
      <div className="justify-self-end flex items-center text-center md:text-sm space-x-1 sm:space-x-1 md:space-x-8">
        {!user ? (
          <>
            {navLink('/auth/login', 'Login')}
            <BeginJourneyButton />
          </>
        ) : (
          <>
            {/* Removed: Model Library link */}

            {pathname === '/profile' ? (
              <a
                href="#top"
                onClick={(e) => { e.preventDefault(); scrollToTop() }}
                className="text-base sm:text-md font-medium text-[#0f0f0f] transition duration-200 hover:underline hover:underline-offset-4"
              >
                Study
              </a>
            ) : (
              // Renamed from "Model Training" → "Study"
              navLink('/profile', 'Study')
            )}
            <SignOutButton />
          </>
        )}
      </div>
    </header>
  )
}
export default PrimaryHeader
