import type { Metadata } from 'next';
import { byUnsubCode } from '@/lib/newsletter';
import { Notice } from '@/components/Notice';
import { NewsletterAction } from '@/components/NewsletterAction';

export const metadata: Metadata = { title: 'Unsubscribe from the newsletter', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// The link in every newsletter lands here. Leaving takes a button press, so link scanners cannot unsubscribe anyone.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c = '' } = await searchParams;
  const s = byUnsubCode(c);
  return (
    <section className="section unsubscribe">
      <h1>Unsubscribe from the newsletter</h1>
      {!s ? (
        <Notice tone="warn">This link is not valid. If it was copied from an email, check that the whole link came through.</Notice>
      ) : s.status === 'unsubscribed' ? (
        <p>
          <strong>{s.email}</strong> is not subscribed any more. You can <a href="/gazette#newsletter">subscribe again</a> at any time.
        </p>
      ) : (
        <>
          <p>
            Stop newsletter emails to <strong>{s.email}</strong>?
          </p>
          <NewsletterAction endpoint="/api/newsletter/unsubscribe" code={c} label="Unsubscribe" done="Done. You are unsubscribed, and the address is deleted from our list within 30 days." />
        </>
      )}
    </section>
  );
}
