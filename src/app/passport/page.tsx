import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';
import { PassportForm } from '@/components/passport/PassportForm';

export const metadata: Metadata = { title: 'Passport of CR' };

export default async function PassportPage() {
  const { on } = await getNature();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Passport Office of Closet Republic' : 'Make your CR passport'}</h1>
          <p className="lede">
            {on
              ? 'Citizenship is granted on the spot. Fill in your particulars, take the oath, and print your passport booklet at home.'
              : 'Build an avatar or add a photo, fill in your details and get a printable passport booklet as a PDF. It is made entirely in your browser.'}
          </p>
        </div>
        <Art name="walking-contradiction" nature={on} className="page-head__art" />
      </header>
      <PassportForm />
    </>
  );
}
