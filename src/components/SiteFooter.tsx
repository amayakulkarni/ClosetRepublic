import Link from 'next/link';
import { ClosetMark } from './Logo';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <ClosetMark size={28} />
          <span>Closet Republic · Naturally exceptional</span>
        </div>
        <nav aria-label="Footer">
          <ul>
            <li><Link href="/gazette">Gazette</Link></li>
            <li><Link href="/constitution">Constitution</Link></li>
            <li><Link href="/funding">Funding</Link></li>
            <li><Link href="/lawmakers">Lawmakers</Link></li>
            <li><Link href="/passport">Passport</Link></li>
          </ul>
        </nav>
        <p className="site-footer__small">
          Swipe sideways or use the Nature switch to change modes. Add <code>?nature=true</code> or{' '}
          <code>?nature=false</code> to any link to share a mode. Illustrations: Open Peeps and Transhumans by Pablo Stanley (CC0).
        </p>
        <p className="site-footer__small">Created by amaya@veronami</p>
      </div>
    </footer>
  );
}
