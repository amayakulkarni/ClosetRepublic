import { getPage, type PageSlug } from '@/lib/pages';

export function MarkdownPage({ slug }: { slug: PageSlug }) {
  const page = getPage(slug);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{page.title}</h1>
          <p className="lede">{page.description}</p>
        </div>
      </header>
      {/* Written by the Closet Republic team in content/pages, so the HTML is trusted. */}
      <article className="gh-content legal-content" dangerouslySetInnerHTML={{ __html: page.html }} />
    </>
  );
}
