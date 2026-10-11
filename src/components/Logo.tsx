export function ClosetMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true" focusable="false" className="closet-mark">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10">
        <path d="M138.38,150H21.62c-6.42,0-11.62-5.2-11.62-11.62V21.62c0-6.42,5.2-11.62,11.62-11.62h116.75c6.42,0,11.62,5.2,11.62,11.62v116.75c0,6.42-5.2,11.62-11.62,11.62Z" />
        <path d="M80,10c.25,18.19-.25,121.3,0,140" />
        <path d="M93.9,68.63c0,7.08.51,15.67.51,26.28" />
        <path d="M66.1,68.63v26.28" />
      </g>
    </svg>
  );
}
