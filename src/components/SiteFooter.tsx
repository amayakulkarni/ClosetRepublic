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
            <li><Link href="/about">About</Link></li>
            <li><Link href="/gazette">Gazette</Link></li>
            <li><Link href="/constitution">Constitution</Link></li>
            <li><Link href="/funding">Funding</Link></li>
            <li><Link href="/lawmakers">Lawmakers</Link></li>
            <li><Link href="/timeline">Timeline</Link></li>
            <li><Link href="/passport">Passport</Link></li>
            <li><Link href="/development">Contribute</Link></li>
            <li><Link href="/lifeline">Lifeline</Link></li>
            <li>
              <a href="https://github.com/amayakulkarni/ClosetRepublic" target="_blank" rel="noopener noreferrer">
                GitHub<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <ul className="site-footer__legal">
            <li><Link href="/guidelines">Community Guidelines</Link></li>
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
          </ul>
        </nav>
        <p className="site-footer__small">
          Closet Republic is a parody micronation and online community, not a state or registered charity. No trackers, no ads.
        </p>
        <p className="site-footer__small">
          Swipe sideways or use the Nature switch to change modes. Add <code>?nature=true</code> or{' '}
          <code>?nature=false</code> to any link to share a mode. Illustrations: Open Peeps and Transhumans by Pablo Stanley (CC0).
        </p>
        <p className="site-footer__small">
          <a href="https://amayakulkarni.com" target="_blank" rel="noopener noreferrer">
            Created by amaya@veronami<span className="sr-only"> (opens amayakulkarni.com in a new tab)</span>
          </a>
        </p>
      </div>
    </footer>
  );
}
