/** The public address of the site, without a trailing slash (SITE_URL, default https://closetrepublic.com). */
export const SITE_URL = (process.env.SITE_URL || 'https://closetrepublic.com').replace(/\/+$/, '');
