import { adminRoute } from '@/lib/admin-api';
import { listSubscribers } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

const cell = (v: string | null) => (v === null ? '' : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""');

/** GET /api/admin/newsletter/export  every newsletter address as CSV. */
export const GET = adminRoute(() => {
  const rows = listSubscribers().map((s) => [s.email, s.status, s.confirmedAt, s.createdAt].map((v) => `"${cell(v)}"`).join(','));
  const csv = ['email,status,confirmed_at,signed_up_at', ...rows].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="newsletter-subscribers.csv"', 'Cache-Control': 'no-store' } });
});
