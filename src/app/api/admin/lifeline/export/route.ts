import { adminRoute } from '@/lib/admin-api';
import { markExported, subscribersCsv } from '@/lib/lifeline';

export const dynamic = 'force-dynamic';

/** GET /api/admin/lifeline/export[?all=1]  the list as a CSV download (subscribed only unless all=1). */
export const GET = adminRoute((request: Request) => {
  const all = new URL(request.url).searchParams.get('all') === '1';
  const date = new Date().toISOString().slice(0, 10);
  markExported();
  return new Response(subscribersCsv(all), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="closet-republic-lifeline-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
