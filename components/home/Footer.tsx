// components/footer/Footer.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from '@/components/auth/Logo'

export default function Footer({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  const isProfilePage = pathname === '/profile'

  return (
    <footer
      className={`
        relative w-full
        bg-[#d7d7d7]
        border-t border-[#d2d2d2]/30
        text-[#0f0f0f]
        ${className}
      `}
    >
      {/* radial accent at bottom */}
      <div
        className="
          pointer-events-none absolute inset-0
          before:block before:content-['']
          before:absolute before:inset-x-0 before:bottom-0
          before:h-full
          before:bg-[radial-gradient(ellipse_at_bottom,rgba(55,55,55,0.10)_0%,transparent_70%)]
        "
      />
      <div className="relative z-10 mx-auto max-w-7xl px-6 sm:px-8 lg:px-16 pt-20 pb-12 flex flex-col">
        <div className="flex flex-col md:flex-row md:justify-between gap-12">
          {/* brand + pitch */}
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-2">
              <Logo className="w-12 h-12" />
              <h3 className="text-3xl font-bold">PitchTime</h3>
            </div>

            <p className="text-xl font-semibold">Sing in tune, on time.</p>
            <p className="text-base">
              Personalized practice uses your singer profile to build pitch accuracy, music-space timing, and a bigger usable range.
            </p>

            <ul className="mt-8 flex gap-6 text-lg">
              <li>
                <a href="https://pitchtime.pro" className="underline-offset-4 hover:underline transition">
                  PitchTime.pro
                </a>
              </li>
              <li>
                <a href="https://twitter.com/pitchtimepro" className="underline-offset-4 hover:underline transition">
                  Twitter
                </a>
              </li>
              <li>
                <a href="https://youtube.com/@pitchtimepro" className="underline-offset-4 hover:underline transition">
                  YouTube
                </a>
              </li>
            </ul>

            <p className="mt-8 text-sm opacity-60">
              © {new Date().getFullYear()} Scale Mode Tools LLC. All rights reserved.
            </p>
          </div>

          {/* pages + legal */}
          <div className="mt-16 md:mt-0 flex flex-col sm:flex-row gap-16">
            <div>
              <h3 className="text-xl font-semibold mb-4">Pages</h3>
              <ul className="space-y-3 text-lg text-[#2d2d2d]">
                <li><Link href="/auth/login" className="hover:underline">Sign&nbsp;In</Link></li>
                <li><Link href="/auth/sign-up" className="hover:underline">Sign&nbsp;Up</Link></li>
                <li><Link href="/profile" className="hover:underline">Profile</Link></li>
                {isProfilePage && (
                  <li><Link href="/delete-account" className="hover:underline">Delete&nbsp;Account</Link></li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Legal</h3>
              <ul className="space-y-3 text-lg text-[#2d2d2d]">
                <li><Link href="/terms" className="hover:underline">Terms&nbsp;of&nbsp;Service</Link></li>
                <li><Link href="/privacy" className="hover:underline">Privacy&nbsp;Policy</Link></li>
                <li><Link href="/refund" className="hover:underline">Refund&nbsp;Policy</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-4xl md:text-7xl lg:text-9xl font-extrabold bg-gradient-to-b from-[#ebebeb] via-[#ebebeb]/80 bg-clip-text text-transparent">
            PitchTime
          </h2>
        </div>
      </div>
    </footer>
  )
}
