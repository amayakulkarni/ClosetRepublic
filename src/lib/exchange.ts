import 'server-only';
import { CURRENCY } from './funds';

/**
 * Rate to convert `currency` into FUNDING_CURRENCY, from EXCHANGE_RATES="USD=84,EUR=91"
 * (BMC_EXCHANGE_RATES is still read for older setups). Null when no rate is set.
 */
export function rateFor(currency: string) {
  if (!currency || currency.toUpperCase() === CURRENCY.toUpperCase()) return 1;
  for (const pair of (process.env.EXCHANGE_RATES || process.env.BMC_EXCHANGE_RATES || '').split(',')) {
    const [code, rate] = pair.split('=').map((s) => s.trim());
    if (code?.toUpperCase() === currency.toUpperCase() && Number(rate) > 0) return Number(rate);
  }
  return null;
}
