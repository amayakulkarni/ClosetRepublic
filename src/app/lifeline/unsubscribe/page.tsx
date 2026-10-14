import type { Metadata } from 'next';
import { bySubscriberToken } from '@/lib/lifeline';
import { Notice } from '@/components/Notice';
import { UnsubscribeButton } from '@/components/lifeline/UnsubscribeButton';

export const metadata: Metadata = { title: 'Leave the Lifeline', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// The link in every Lifeline email lands here. Leaving takes a button press, so link
// scanners and previews that open the link cannot unsubscribe anyone by accident.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const subscriber = bySubscriberToken(token);
  return (
    <section className="section unsubscribe">
      <h1>Leave the Lifeline</h1>
      {!subscriber ? (
        <Notice tone="warn">This link is not valid. If you copied it from an email, check that the whole link came through.</Notice>
      ) : subscriber.status === 'unsubscribed' ? (
        <p>
          <strong>{subscriber.email}</strong> is not on the Lifeline any more. You can <a href="/lifeline">join again</a> at any time.
        </p>
      ) : (
        <>
          <p>
            Stop Lifeline emails to <strong>{subscriber.email}</strong>? You will not hear from us if the site moves.
          </p>
          <UnsubscribeButton token={token} />
        </>
      )}
    </section>
  );
}
