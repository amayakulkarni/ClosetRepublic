import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';
import { PassportForm } from '@/components/passport/PassportForm';
import { Notice } from '@/components/Notice';

export const metadata: Metadata = { title: 'Passport of CR' };

export default async function PassportPage() {
  const { on } = await getNature();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Make your CR passport</h1>
          <p className="lede">
            Build an avatar or add a photo, fill in your details and get a printable passport booklet as a PDF. It is made entirely in your browser.
          </p>
        </div>
        <Art name="walking-contradiction" nature={on} className="page-head__art" />
      </header>
      <Notice>
        <p>
          The CR passport is a commemorative keepsake of a parody online community. It is not a government identity or travel
          document and cannot be used as one. Everything typed or added here stays in this browser: nothing is uploaded, sent or
          stored by Closet Republic.
        </p>
      </Notice>
      <PassportForm />
    </>
  );
}
