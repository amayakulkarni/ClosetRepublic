import { NextRequest, NextResponse } from 'next/server';
import { NATURE_COOKIE, NATURE_FORCED_HEADER, NATURE_HEADER, NATURE_PATH_SUFFIXES, NATURE_QUERY_NAMES, parseNatureValue } from './lib/nature-shared';

// Nature mode is one site-wide setting, kept in a cookie so every page renders it on the server.
//  - ?nature=true / ?nature=false switches it and remembers the choice (?paradoy= and ?parody= still work).
//  - Any URL ending in /nature (or /paradoy) shows that page's nature edition, e.g. /gazette/my-post/nature.
export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  const fromQuery = parseNatureValue(NATURE_QUERY_NAMES.map((n) => url.searchParams.get(n)).find((v) => v !== null) ?? null);

  let response: NextResponse;
  const forcedSuffix = NATURE_PATH_SUFFIXES.find((s) => url.pathname === s || url.pathname.endsWith(s));
  if (forcedSuffix) {
    const target = url.clone();
    target.pathname = url.pathname.slice(0, -forcedSuffix.length) || '/';
    requestHeaders.set(NATURE_FORCED_HEADER, '1');
    response = NextResponse.rewrite(target, { request: { headers: requestHeaders } });
  } else {
    if (fromQuery !== null) requestHeaders.set(NATURE_HEADER, fromQuery ? '1' : '0');
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (fromQuery !== null) {
    response.cookies.set(NATURE_COOKIE, fromQuery ? '1' : '0', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/|api/|brand/|art/|peeps/|icon.svg|favicon.ico|robots.txt).*)'],
};
