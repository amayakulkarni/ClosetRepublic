import { test } from 'node:test';
import assert from 'node:assert/strict';
// The module is TypeScript; Node runs it directly from 22.18. Older Node skips these tests.
const mod = await import('../../src/lib/socials.ts').catch(() => null);
const { classify, socialLinks } = mod ?? {};
const skip = mod ? false : 'needs Node 22.18 or newer to load TypeScript';

test('major platforms become logos, other addresses become website links', { skip }, () => {
  assert.equal(classify('https://www.instagram.com/ada/').network, 'instagram');
  assert.equal(classify('youtu.be/abc').network, 'youtube');
  assert.equal(classify('https://github.com/ada').network, 'github');
  assert.equal(classify('https://bsky.app/profile/ada.bsky.social').network, 'bluesky');
  assert.equal(classify('https://hachyderm.io/@ada').network, 'mastodon');
  assert.equal(classify('https://example.social/@ada').network, 'mastodon');
  const site = classify('https://www.ada.example/blog');
  assert.equal(site.network, 'website');
  assert.equal(site.label, 'ada.example');
});

test('Twitter and X links are never shown, and neither are non-web addresses', { skip }, () => {
  for (const u of ['https://twitter.com/ada', 'https://x.com/ada', 'http://mobile.twitter.com/ada', 'https://t.co/abc', 'javascript:alert(1)', 'mailto:a@b.c', 'notanaddress']) {
    assert.equal(classify(u), null, u);
  }
});

test('an author shows website, Facebook and bio links once each, and ignores the Twitter field', { skip }, () => {
  const links = socialLinks({
    website: 'https://ada.example',
    facebook: 'ada.writes',
    twitter: '@ada',
    bio: 'Writer. Find me at https://www.instagram.com/ada, https://x.com/ada and https://ada.example/.',
  });
  assert.deepEqual(links.map((l) => l.network), ['website', 'facebook', 'instagram']);
  assert.equal(links[1].href, 'https://www.facebook.com/ada.writes');
});

test('an author with nothing gets no links', { skip }, () => {
  assert.deepEqual(socialLinks({ twitter: '@ada', bio: null }), []);
});
