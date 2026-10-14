import type { Metadata } from 'next';
import { AreaPage } from '@/components/contribute/AreaPage';

export const metadata: Metadata = { title: 'Contribute to the constitution' };

export default function Page() {
  return <AreaPage area="constitution" />;
}
