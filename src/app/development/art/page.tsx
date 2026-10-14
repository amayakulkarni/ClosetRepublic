import type { Metadata } from 'next';
import { AreaPage } from '@/components/contribute/AreaPage';

export const metadata: Metadata = { title: 'Make art for the Republic' };

export default function Page() {
  return <AreaPage area="art" />;
}
