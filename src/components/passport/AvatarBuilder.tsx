'use client';

import { useEffect, useId, useState } from 'react';
import { PART_LABELS, PARTS, composeAvatarSvg, describeAvatar, randomAvatar, svgDataUrl, type AvatarChoice } from '@/lib/avatar';

const CONTROL_ORDER = ['head', 'face', 'facial-hair', 'accessories', 'body'] as const;

export function AvatarBuilder({ value, onChange }: { value: AvatarChoice; onChange: (v: AvatarChoice) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    let live = true;
    composeAvatarSvg(value).then((svg) => live && setPreview(svgDataUrl(svg)));
    return () => {
      live = false;
    };
  }, [value]);

  return (
    <div className="avatar-builder">
      <div className="avatar-builder__preview">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Your avatar. ${describeAvatar(value)}`} />
        ) : (
          <span>Drawing…</span>
        )}
      </div>
      <div className="avatar-builder__controls">
        {CONTROL_ORDER.map((cat) => (
          <div className="field" key={cat}>
            <label htmlFor={`${id}-${cat}`}>{PART_LABELS[cat]}</label>
            <select id={`${id}-${cat}`} value={value[cat]} onChange={(e) => onChange({ ...value, [cat]: e.target.value })}>
              {PARTS[cat].map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button type="button" className="button button--ghost" onClick={() => onChange(randomAvatar())}>
          Surprise me
        </button>
        <p className="hint">Avatar parts from Open Peeps by Pablo Stanley.</p>
      </div>
    </div>
  );
}
