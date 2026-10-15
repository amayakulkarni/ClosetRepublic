import type { Metadata } from 'next';
import { MarkdownPage } from '@/components/MarkdownPage';
import { getPage } from '@/lib/pages';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const { title, description } = getPage('terms');
  return { title, description };
}

export default function Page() {
  return <MarkdownPage slug="terms" />;
}
