// Public places where ideas belong. Set the Reddit and forum addresses in the server
// environment once they exist; until then the site shows them as "coming soon".

export const GITHUB_URL = 'https://github.com/amayakulkarni/ClosetRepublic';

export type CommunityLink = { name: string; url: string | null; hint: string };

export function communityLinks(): CommunityLink[] {
  return [
    { name: 'GitHub', url: `${GITHUB_URL}/issues`, hint: 'Ideas for the site, the constitution and the passport' },
    { name: 'Reddit', url: process.env.COMMUNITY_REDDIT_URL || null, hint: 'Open discussion with other citizens' },
    { name: process.env.COMMUNITY_FORUM_NAME || 'Decentralised forum', url: process.env.COMMUNITY_FORUM_URL || null, hint: 'The Republic’s own forum' },
  ];
}
