import "server-only";
import { btcpayConfigured } from "./btcpay";

// Payment channels (ways to pay to keep Closet Republic free) shared by the funding page and the support widget.
// The older NEXT_PUBLIC_GOFUNDME_URL is still read so existing .env files keep working.
const env = (name: string, legacy?: string) =>
  process.env[name] || (legacy ? process.env[legacy] : "") || "";

export const DONATE_URL = env(
  "NEXT_PUBLIC_DONATE_URL",
  "NEXT_PUBLIC_GOFUNDME_URL",
);
export const DONATE_LABEL =
  env("NEXT_PUBLIC_DONATE_LABEL") || "Pay to keep it free";
export const UPI_ID = env("NEXT_PUBLIC_UPI_ID");
export const SPONSORS_URL = env("NEXT_PUBLIC_GITHUB_SPONSORS_URL");
export const UPI_NAME = env("NEXT_PUBLIC_UPI_NAME") || "Closet Republic";

/** Opens the visitor's UPI app (GPay, PhonePe, Paytm, BHIM…) with the payee filled in. */
export const upiLink = (id: string) =>
  `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(UPI_NAME)}&cu=INR`;

/** Where Bitcoin and other crypto payments go: the free-amount form on the funding page. */
export const cryptoUrl = () =>
  btcpayConfigured() ? "/funding#crypto-donate" : "";

/** Where members buy a Discord class (a Buy Me a Coffee membership). Defaults to the Buy Me a Coffee page. */
export const MEMBERSHIP_URL = process.env.BMC_MEMBERSHIP_URL || DONATE_URL;

/** The statement that opens the funding page and the support widget. */
export const COMMUNITY_APPEAL =
  "Closet Republic is an online community for queer people in India and around the world, built by volunteers. Reading and taking part on the website is free, and paying is how members keep it that way.";

/** What paying is, and is not. Shown on the funding page. */
export const PAYMENT_EXPLAINER =
  "Closet Republic is an online community. Money paid to keep it free. It pays for servers and tools, legal help, and the people who build and write for the community. Every payment goes into one of four funds and every expense is listed in the public ledger.";
