import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="empty-state">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/art/pondering.svg" alt="Illustration: a person stands with a backpack, lost in thought. Drawn in white lines on black." className="art" />
      <h1>This room of the closet is empty</h1>
      <p>We could not find that page.</p>
      <p>
        <Link className="button" href="/">
          Back to the Republic
        </Link>
      </p>
    </section>
  );
}
