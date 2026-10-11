import type { Metadata } from 'next';
import { adminConfigured, isAdmin } from '@/lib/admin-auth';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { Notice } from '@/components/Notice';

export const metadata: Metadata = { title: 'Treasury admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!adminConfigured()) {
    return (
      <Notice tone="warn">
        Set <code>ADMIN_TOKEN</code> (at least 16 characters) in the server environment to use the treasury admin.
      </Notice>
    );
  }
  return (await isAdmin()) ? <AdminDashboard /> : <AdminLogin />;
}
