'use client';

import { useEffect, useState } from 'react';

export const THEME_ALERT =
  'CR looks best as is and developers have made huge efforts to make their artwork accessible to everyone. Please disable forced theme (light/dark) to taste the art as it was meant to.';

// Closet Republic is dark only. If the browser or an extension forces its own theme
// (forced colours / high contrast, Dark Reader and similar, or injected styles that
// repaint the page), a small dismissible banner asks the visitor to turn it off.
// It is an in-page notice, never a browser alert(): blocking pop-ups that ask people
// to change browser settings are a pattern Google Safe Browsing treats as social engineering.
export function ThemeGuard() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let warned = false;
    const warn = () => {
      if (warned) return;
      warned = true;
      setShow(true);
    };

    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;left:-9999px;background-color:rgb(0, 0, 0);color:rgb(255, 255, 255)';
    document.body.appendChild(probe);

    const check = () => {
      if (window.matchMedia('(forced-colors: active)').matches) return warn();
      const html = document.documentElement;
      if (
        html.hasAttribute('data-darkreader-mode') ||
        html.hasAttribute('data-darkreader-scheme') ||
        document.querySelector('meta[name="darkreader"], style.darkreader, [data-nighteye], #nighteyedefaultcss')
      )
        return warn();
      const probeStyle = getComputedStyle(probe);
      const bodyStyle = getComputedStyle(document.body);
      if (
        probeStyle.backgroundColor !== 'rgb(0, 0, 0)' ||
        probeStyle.color !== 'rgb(255, 255, 255)' ||
        bodyStyle.backgroundColor !== 'rgb(0, 0, 0)' ||
        (html.style.filter && html.style.filter !== 'none')
      )
        return warn();
    };

    check();
    const forced = window.matchMedia('(forced-colors: active)');
    forced.addEventListener('change', check);
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 150);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-darkreader-mode', 'data-darkreader-scheme'] });
    observer.observe(document.head, { childList: true });

    return () => {
      forced.removeEventListener('change', check);
      observer.disconnect();
      window.clearTimeout(timer);
      probe.remove();
    };
  }, []);

  if (!show) return null;
  return (
    <div className="notice notice--warn theme-guard" role="status">
      <p>{THEME_ALERT}</p>
      <button type="button" className="theme-guard__close" onClick={() => setShow(false)} aria-label="Dismiss this notice">
        Dismiss
      </button>
    </div>
  );
}
