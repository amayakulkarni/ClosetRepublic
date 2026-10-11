// Ghost content is written by CR's own editors in the Ghost admin, so its HTML is trusted.
export function GhostContent({ html }: { html?: string | null }) {
  if (!html) return null;
  return <div className="gh-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
