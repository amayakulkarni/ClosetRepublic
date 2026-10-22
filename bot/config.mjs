// Settings for the membership bot. It runs from the site's folder and reads the site's
// .env.local (or .env), so both share DATABASE_PATH, the Discord app and BOT_INTERNAL_SECRET.
import fs from 'node:fs';
import path from 'node:path';

for (const file of [process.env.BOT_ENV_FILE, '.env.local', '.env'].filter(Boolean)) {
  try {
    process.loadEnvFile(file); // never overrides variables already set
  } catch {}
}

// Buy Me a Coffee level names, used until bmcLevelIds are filled in (ids survive renames).
const DEFAULT_LEVEL_NAMES = {
  alien: ['alien'],
  citizen: ['citizen'],
  'top-1': ["in dictator's bed", 'top 1%'],
  'upper-middle-class': ['upper middle class'],
  'middle-class': ['middle class'],
};
const TIER_NAMES = { alien: 'Alien', citizen: 'Citizen', 'top-1': 'Top 1%', 'upper-middle-class': 'Upper Middle Class', 'middle-class': 'Middle Class' };

/** Reads config/discord-tiers.json, written by discord/setup/setup-server.mjs. */
export function loadTiers(file = process.env.DISCORD_TIERS_FILE || 'config/discord-tiers.json') {
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const tiers = [...(raw.tiers || [])]
    .map((t) => ({
      slug: t.slug,
      name: t.name || TIER_NAMES[t.slug] || t.slug,
      rank: Number(t.rank),
      roleId: String(t.roleId || ''),
      accessRoleId: String(t.accessRoleId || ''),
      bmcLevelIds: (t.bmcLevelIds || []).map(String).filter((id) => id && id !== '0'),
      bmcLevels: (t.bmcLevels || DEFAULT_LEVEL_NAMES[t.slug] || []).map((n) => String(n).trim().toLowerCase()),
    }))
    .sort((a, b) => a.rank - b.rank);
  return {
    guildId: String(process.env.DISCORD_GUILD_ID || raw.guildId || ''),
    tiers,
    staffRoleIds: (raw.staffRoleIds || []).map(String),
    grace: { lapseDays: 7, remindDaysBeforeEnd: [3], remindDuringGrace: [0, 5], ...(raw.grace || {}) },
    channels: raw.channels || {},
    unknownLevelTier: raw.unknownLevelTier ?? 'alien',
    // Elder role after afterDays of verified membership, and the lobby voice channel that creates private rooms.
    elder: {
      roleId: String(raw.elder?.roleId || ''),
      afterDays: Number(raw.elder?.afterDays) || 90,
      lobbyChannelId: String(raw.elder?.lobbyChannelId || ''),
      categoryId: String(raw.elder?.categoryId || ''),
      maxRoomsPerElder: Number(raw.elder?.maxRoomsPerElder) || 1,
    },
    // Hobby picker in #college: [{ slug, label, emoji, roleId }]
    hobbies: (raw.hobbies || []).filter((h) => h?.slug && h?.roleId).map((h) => ({ slug: String(h.slug), label: String(h.label || h.slug), emoji: h.emoji ? String(h.emoji) : null, roleId: String(h.roleId) })),
    // Categories whose voice channels get the "voices here are public" notice even without ambient sound.
    voiceNotice: { categoryIds: (raw.voiceNotice?.categoryIds || []).map(String) },
  };
}

export const env = {
  token: process.env.DISCORD_BOT_TOKEN || '',
  dbPath: process.env.DATABASE_PATH || './data/closet-republic.db',
  port: Number(process.env.BOT_PORT) || 40008,
  host: process.env.BOT_HOST || '127.0.0.1',
  secret: process.env.BOT_INTERNAL_SECRET || '',
  bmcApiToken: process.env.BMC_API_TOKEN || '',
  bmcApiUrl: (process.env.BMC_API_URL || 'https://developers.buymeacoffee.com/api/v1').replace(/\/$/, ''),
  siteUrl: (process.env.SITE_URL || 'https://closetrepublic.com').replace(/\/+$/, ''),
  renewUrl: process.env.BMC_MEMBERSHIP_URL || process.env.NEXT_PUBLIC_DONATE_URL || '',
};
