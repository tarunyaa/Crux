'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from '@/components/Logo'
import SuitIcon from '@/components/SuitIcon'

const NAV_LINKS = [
  { href: '/cards', label: 'Decks' },
  { href: '/setup', label: 'Debate' },
  { href: '/debates', label: 'Past Debates' },
  { href: '/about', label: 'About' },
]

export default function NavBar() {
  const pathname = usePathname()

  // Hide navbar on the landing page
  if (pathname === '/') return null

  return (
    <nav className="sticky top-0 z-50 border-b border-card-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl flex items-center px-6 py-2">
        <Link href="/" className="flex items-center gap-2.5 mr-6">
          <Logo size={28} />
          <span className="text-lg font-bold tracking-tight">
            Cr<span className="text-accent">ux</span>
          </span>
        </Link>
        {/* Suit divider between logo and nav */}
        <div className="flex items-center gap-1 mr-6 opacity-30">
          <SuitIcon suit="spade" className="text-[10px]" />
          <SuitIcon suit="heart" className="text-[10px]" />
          <SuitIcon suit="diamond" className="text-[10px]" />
          <SuitIcon suit="club" className="text-[10px]" />
        </div>
        <div className="flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm transition-colors flex items-center gap-1 ${
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {isActive && <span className="text-accent text-[9px] leading-none">♦</span>}
                {label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
