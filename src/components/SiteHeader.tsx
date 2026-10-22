'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { STAGE_URL, WIKI_URL } from '@/lib/community';
import { ClosetMark } from './Logo';
import { StageIcon } from './StageIcon';
import { WikiIcon } from './WikiIcon';
import { NatureToggle } from './NatureToggle';
import { useNature } from './NatureProvider';

// Nature mode names things like a government; monochrome mode uses plain words.
const NAV = [
  { href: '/gazette', nature: 'Gazette', plain: 'Blog', full: 'Gazette of Closet Republic' },
  { href: '/constitution', nature: 'Constitution', plain: 'Constitution', full: 'Constitution of CR' },
  { href: '/funding', nature: 'Ministry of Finance', plain: 'Funding', full: 'Ministry of Finance' },
  { href: '/lawmakers', nature: 'Lawmakers', plain: 'Writers', full: 'Members of GCR' },
  { href: '/timeline', nature: 'Five-Year Plan', plain: 'Timeline', full: 'Timeline and goals' },
  { href: '/passport', nature: 'Passport', plain: 'Passport', full: 'Passport of CR' },
  { href: '/development', nature: 'Public Works', plain: 'Contribute', full: 'Development and contributing' },
];

export function SiteHeader() {
  const { on } = useNature();
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
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
        <nav id="site-nav" aria-label="Main" className="site-nav" data-open={open}>
          <ul>
            {NAV.map((item) => {
              const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={current ? 'page' : undefined} title={item.full}>
                    {on ? item.nature : item.plain}
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
          aria-label={on ? 'The Stage, community forum (opens in a new tab)' : 'Stage, community forum (opens in a new tab)'}
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
