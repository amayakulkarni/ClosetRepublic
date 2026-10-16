import { NewsletterForm } from './NewsletterForm';
import { newsletterEnabled, newsletterSettings } from '@/lib/newsletter';

/** The newsletter box for the top of the Gazette and the end of every post. Hidden by NEWSLETTER_DISABLED=true. */
export function NewsletterWidget() {
  if (!newsletterEnabled()) return null;
  const { frequency, promoPrice } = newsletterSettings();
  return <NewsletterForm frequency={frequency} promoPrice={promoPrice} />;
}
