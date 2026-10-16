import { COMMUNITY_APPEAL, DONATE_LABEL, DONATE_URL, UPI_ID, cryptoUrl, upiLink } from '@/lib/donate';

/** "Thank the writers" box for the end of every post and the bottom of the landing page. */
export function SupportWidget({ showThanks = false }: { showThanks?: boolean }) {
  const crypto = cryptoUrl();
  return (
    <section className="support-widget" aria-labelledby="support-title">
      <h2 id="support-title">Help us keep going</h2>
      {showThanks && <p>Writers are thrilled to know that you have reached the end of their article.</p>}
      <p>{COMMUNITY_APPEAL}</p>
      <p>Please donate using Buy Me a Coffee, Bitcoin or UPI.</p>
      <p className="support-widget__actions">
        {DONATE_URL && (
          <a className="button" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
            {DONATE_LABEL}
            <span className="sr-only"> (Buy Me a Coffee, opens in a new tab)</span>
          </a>
        )}
        {crypto && (
          <a className={DONATE_URL ? 'button button--ghost' : 'button'} href={crypto}>
            Bitcoin
          </a>
        )}
        {UPI_ID && (
          <a className={DONATE_URL || crypto ? 'button button--ghost' : 'button'} href={upiLink(UPI_ID)}>
            UPI<span className="sr-only"> (opens your UPI app)</span>
          </a>
        )}
        <a className="button button--ghost" href="/funding">
          All ways to donate
        </a>
      </p>
    </section>
  );
}
