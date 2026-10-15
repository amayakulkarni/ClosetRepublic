// Public places where ideas belong. Set the Reddit address in the server environment once
// it exists; until then the site shows it as "coming soon". The forum defaults to Stage.

export const GITHUB_URL = "https://github.com/amayakulkarni/ClosetRepublic";

// Stage: the community forum (NodeBB) and its source code.
export const STAGE_URL = (
  process.env.NEXT_PUBLIC_STAGE_URL || "https://stage.closetrepublic.com"
).replace(/\/$/, "");
export const STAGE_REPO_URL =
  "https://github.com/amayakulkarni/BenchAtClosetRepublic";

export type CommunityLink = { name: string; url: string | null; hint: string };

export function communityLinks(): CommunityLink[] {
  return [
    {
      name: "GitHub",
      url: `${GITHUB_URL}/discussions`,
      hint: "Ideas for the site, the constitution and the passport",
    },
    {
      name: "Reddit",
      url: process.env.COMMUNITY_REDDIT_URL || null,
      hint: "Open discussion with other citizens",
    },
    {
      name: process.env.COMMUNITY_FORUM_NAME || "Stage",
      url: process.env.COMMUNITY_FORUM_URL || STAGE_URL,
      hint: "The Republic’s own forum",
    },
  ];
}
