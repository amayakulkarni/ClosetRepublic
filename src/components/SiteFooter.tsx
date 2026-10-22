import Link from "next/link";
import { ClosetMark } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <ClosetMark size={28} />
          <span>Closet Republic · an online community</span>
        </div>
        <nav aria-label="Footer">
          <ul>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/gazette">Blog</Link>
            </li>
            <li>
              <Link href="/constitution">Constitution</Link>
            </li>
            <li>
              <Link href="/funding">Keep it free</Link>
            </li>
            <li>
              <Link href="/lawmakers">Lawmakers</Link>
            </li>
            <li>
              <Link href="/timeline">Timeline</Link>
            </li>
            <li>
              <Link href="/passport">Passport</Link>
            </li>
            <li>
              <Link href="/development">Contribute</Link>
            </li>
            <li>
              <Link href="/lifeline">Lifeline</Link>
            </li>
            <li>
              <a
                href="https://github.com/amayakulkarni/ClosetRepublic"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <ul className="site-footer__legal">
            <li>
              <Link href="/guidelines">Community Guidelines</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="socials">
          <ul>
            <li>
              <a href="https://reddit.com/r/ClosetRepublic" aria-label="Reddit">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                >
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.197-2.512-.73a.326.326 0 0 0-.232-.095z" />
                </svg>
              </a>
            </li>
            <li>
              <a href="https://linkedin.com/company/closet-republic" aria-label="LinkedIn">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                  <rect x="2" y="9" width="4" height="12"></rect>
                  <circle cx="4" cy="4" r="2"></circle>
                </svg>
              </a>
            </li>
            <li>
              <a href="https://instagram.com/closet.republic" aria-label="Instagram">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </a>
            </li>
          </ul>
        </nav>
        <p className="site-footer__small">
          Closet Republic is a parody micronation and online community, not a
          state or registered charity. No trackers, no ads.
        </p>
        <p className="site-footer__small">
          Swipe sideways or use the Colours switch at the top to turn the colours on or off. Add{" "}
          <code>?nature=true</code> or <code>?nature=false</code> to any link to
          share a choice. Illustrations: Open Peeps and Transhumans by Pablo
          Stanley (CC0).
        </p>
        <p className="site-footer__small">
          <a
            href="https://amayakulkarni.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Created by amaya@veronami
            <span className="sr-only">
              {" "}
              (opens amayakulkarni.com in a new tab)
            </span>
          </a>
        </p>
      </div>
    </footer>
  );
}
