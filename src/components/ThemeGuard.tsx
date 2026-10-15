'use client';

import { useEffect } from 'react';

export const THEME_ALERT =
  'CR looks best as is and developers have made huge efforts to make their artwork accessible to everyone. Please disable forced theme (light/dark) to taste the art as it was meant to.';

// Closet Republic is dark only. If the browser or an extension forces its own theme
// (forced colours / high contrast, Dark Reader and similar, or injected styles that
// repaint the page), the visitor is asked to turn it off.
export function ThemeGuard() {
  useEffect(() => {
    let warned = false;
    const warn = () => {
      if (warned) return;
      warned = true;
      window.alert(THEME_ALERT);
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

  return null;
}
