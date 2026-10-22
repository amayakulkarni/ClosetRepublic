'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { STAGE_URL, WIKI_URL } from '@/lib/community';
import { ClosetMark } from './Logo';
import { StageIcon } from './StageIcon';
import { WikiIcon } from './WikiIcon';
import { NatureToggle } from './NatureToggle';

// Short, plain words in both modes. The long name shows as a tooltip.
const NAV = [
  { href: '/constitution', label: 'Constitution', full: 'The Closet Republic constitution' },
  { href: '/gazette', label: 'Blog', full: 'Stories and news from Closet Republic' },
  { href: '/funding', label: 'Keep it free', full: 'Pay to keep Closet Republic free' },
  { href: '/lawmakers', label: 'Writers', full: 'The people who write for Closet Republic' },
  { href: '/timeline', label: 'Plans', full: 'Goals and timeline' },
  { href: '/passport', label: 'Passport', full: 'Make a keepsake passport' },
  { href: '/development', label: 'Join in', full: 'Ways to contribute' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="site-header">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="Closet Republic, home">
          <ClosetMark size={40} />
          <span className="brand__name">
            Closet
            <br />
            Republic
          </span>
        </Link>
        <button
          type="button"
          className="nav-button"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label="Menu"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <nav id="site-nav" aria-label="Main" className="site-nav" data-open={open}>
          <ul>
            {NAV.map((item) => {
              const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={current ? 'page' : undefined} title={item.full}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <a
          className="stage-link"
          href={STAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Stage, community forum (opens in a new tab)"
          title="Stage: community forum"
        >
          <StageIcon />
        </a>
        <a
          className="stage-link wiki-link"
          href={WIKI_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Wiki (opens in a new tab)"
          title="Wiki: guides and answers"
        >
          <WikiIcon />
        </a>
        <NatureToggle />
      </div>
    </header>
  );
}
