'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNature } from '../NatureProvider';
import { AREA_LABEL } from '@/lib/contribution-areas';

const TABS = [
  { href: '/development', plain: 'Code', nature: 'Public Works' },
  { href: '/development/constitution', ...AREA_LABEL.constitution },
  { href: '/development/writing', ...AREA_LABEL.writing },
  { href: '/development/art', ...AREA_LABEL.art },
];

/** Sub-navigation between the kinds of contribution. Each tab is its own page, so links can be shared. */
export function ContributeTabs() {
  const { on } = useNature();
  const pathname = usePathname().replace(/\/(nature|paradoy)$/, '');
  return (
    <nav aria-label="Ways to contribute" className="sub-tabs">
      <ul>
        {TABS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} aria-current={pathname === t.href ? 'page' : undefined}>
              {t.plain}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
