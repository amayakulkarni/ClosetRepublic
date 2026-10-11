import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getNature } from '@/lib/nature';
import { NatureProvider } from '@/components/NatureProvider';
import { PrismLayers } from '@/components/PrismLayers';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ThemeGuard } from '@/components/ThemeGuard';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://closetrepublic.com'),
  title: { default: 'Closet Republic', template: '%s · Closet Republic' },
  description:
    'Closet Republic: a parody online country for harmonious people who once had to hide their true selves to fit in a box.',
  openGraph: { images: ['/brand/social-logo.png'], siteName: 'Closet Republic' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { on } = await getNature();
  return (
    <html lang="en" data-nature={on ? 'on' : 'off'} style={{ colorScheme: 'only dark' }}>
      <head>
        {/* "only dark" also stops browsers from auto-darkening or auto-lightening the page. */}
        <meta name="color-scheme" content="only dark" />
      </head>
      <body aria-describedby="visual-mode-description">
        <NatureProvider initialOn={on}>
          <SiteHeader />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
          <PrismLayers />
          <ThemeGuard />
        </NatureProvider>
      </body>
    </html>
  );
}
