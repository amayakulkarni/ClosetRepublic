'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ContributorsAdmin } from './ContributorsAdmin';
import { RoadmapAdmin } from './RoadmapAdmin';
import { TreasuryAdmin } from './TreasuryAdmin';

const TABS = [
  { id: 'treasury', label: 'Treasury' },
  { id: 'timeline', label: 'Timeline and goals' },
  { id: 'contributors', label: 'Contributors' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('treasury');

  // Remember the tab in the URL hash so a reload stays put.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash as Tab);
  }, []);
  const choose = (id: Tab) => {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="admin">
      <header className="page-head">
        <div>
          <h1>Admin</h1>
        </div>
        <button
          className="button button--ghost"
          onClick={async () => {
            await fetch('/api/admin/session', { method: 'DELETE' });
            router.refresh();
          }}
        >
          Sign out
        </button>
      </header>

      <div className="admin-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => choose(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const i = TABS.findIndex((x) => x.id === tab);
              const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
              choose(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'treasury' ? <TreasuryAdmin /> : tab === 'timeline' ? <RoadmapAdmin /> : <ContributorsAdmin />}
      </div>
    </div>
  );
}
