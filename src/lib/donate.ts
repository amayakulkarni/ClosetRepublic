import 'server-only';
import { btcpayConfigured } from './btcpay';

// Donation channels shared by the funding page and the support widget.
// The older NEXT_PUBLIC_GOFUNDME_URL is still read so existing .env files keep working.
const env = (name: string, legacy?: string) => process.env[name] || (legacy ? process.env[legacy] : '') || '';

export const DONATE_URL = env('NEXT_PUBLIC_DONATE_URL', 'NEXT_PUBLIC_GOFUNDME_URL');
export const DONATE_LABEL = env('NEXT_PUBLIC_DONATE_LABEL') || 'Buy me a compute';
export const UPI_ID = env('NEXT_PUBLIC_UPI_ID');
export const SPONSORS_URL = env('NEXT_PUBLIC_GITHUB_SPONSORS_URL');
export const UPI_NAME = env('NEXT_PUBLIC_UPI_NAME') || 'Closet Republic';

/** Opens the visitor's UPI app (GPay, PhonePe, Paytm, BHIM…) with the payee filled in. */
export const upiLink = (id: string) => `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(UPI_NAME)}&cu=INR`;

/** Where Bitcoin and other crypto donations go: the free-amount form on the funding page. */
export const cryptoUrl = () => (btcpayConfigured() ? '/funding#crypto-donate' : '');

/** Where members buy a Discord class (a Buy Me a Coffee membership). Defaults to the donation page. */
export const MEMBERSHIP_URL = process.env.BMC_MEMBERSHIP_URL || DONATE_URL;

/** The statement that opens the funding page and the support widget. */
export const COMMUNITY_APPEAL =
  'Closet Republic is a decentralized volunteer community for uplifting the lives of queer people in India and around the world. Our developers, writers and artists work hard and voluntarily give up various opportunities for the cause. Closet Republic is currently seeking funding for retention and expansion.';
