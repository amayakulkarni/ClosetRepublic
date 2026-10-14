import type { Metadata } from 'next';
import { AreaPage } from '@/components/contribute/AreaPage';

export const metadata: Metadata = { title: 'Write for the Gazette' };

export default function Page() {
  return <AreaPage area="writing" />;
}
