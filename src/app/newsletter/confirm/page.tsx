import type { Metadata } from 'next';
import { byConfirmCode } from '@/lib/newsletter';
import { Notice } from '@/components/Notice';
import { NewsletterAction } from '@/components/NewsletterAction';

export const metadata: Metadata = { title: 'Confirm your subscription', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// The link in the confirmation email lands here. Subscribing takes a button press, so link scanners
// and previews that open the link cannot subscribe anyone by accident.
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c = '' } = await searchParams;
  const s = byConfirmCode(c);
  return (
    <section className="section unsubscribe">
      <h1>Confirm your subscription</h1>
      {!s || s.status === 'unsubscribed' ? (
        <Notice tone="warn">This link is not valid or has expired. You can <a href="/gazette#newsletter">sign up again</a> from the Gazette.</Notice>
      ) : s.status === 'subscribed' ? (
        <p>
          <strong>{s.email}</strong> is already subscribed to the Closet Republic newsletter.
        </p>
      ) : (
        <>
          <p>
            Subscribe <strong>{s.email}</strong> to the Closet Republic newsletter? By subscribing you agree to our <a href="/privacy">Privacy Policy</a>.
          </p>
          <NewsletterAction endpoint="/api/newsletter/confirm" code={c} label="Confirm subscription" done="Done. You are subscribed. Every issue has an unsubscribe link." />
        </>
      )}
    </section>
  );
}
