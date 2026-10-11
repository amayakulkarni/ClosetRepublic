export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'warn' ? 'status' : undefined}>
      {children}
    </div>
  );
}
