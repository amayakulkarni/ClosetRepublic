// Settings for the membership bot. It runs from the site's folder and reads the site's
// .env.local (or .env), so both share DATABASE_PATH, the Discord app and BOT_INTERNAL_SECRET.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_GAMES } from './league.mjs';

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

const DEFAULT_TEAMS = [
  { key: 'hanger', name: 'Hanger', emoji: '🧥' },
  { key: 'drawer', name: 'Drawer', emoji: '🗄️' },
  { key: 'shelf', name: 'Shelf', emoji: '📚' },
  { key: 'termites', name: 'Termites', emoji: '🐜' },
];

// The league teams were renamed. A config written before that (old keys and names) is read as the new teams, so a
// stale discord-tiers.json can never show the old names; stored matches under old keys are moved at start.
const LEGACY_TEAM_KEYS = { 'velvet-hangers': 'hanger', 'sequin-storm': 'drawer', 'mothball-mavericks': 'shelf', 'wardrobe-wolves': 'termites' };

/** league: { commissionerRoleId, categoryId, teams: [{ key, roleId, name?, emoji? }], channels: { fixtures, scoreboard, office, matchReports }, games? } */
function leagueConfig(raw) {
  if (!raw?.teams?.length) return null;
  const teams = raw.teams
    .filter((t) => t?.key && t?.roleId)
    .map((t) => {
      const legacy = LEGACY_TEAM_KEYS[t.key];
      const key = legacy ?? String(t.key);
      const d = DEFAULT_TEAMS.find((x) => x.key === key);
      // A legacy entry takes the new name and emoji whatever the old file says.
      return { key, name: String((legacy ? d?.name : t.name) || d?.name || key), emoji: (legacy ? d?.emoji : t.emoji) ?? d?.emoji ?? '', roleId: String(t.roleId) };
    });
  if (teams.length < 2) return null;
  return {
    commissionerRoleId: String(raw.commissionerRoleId || ''),
    categoryId: String(raw.categoryId || ''),
    teams,
    // { "old-key": "new-key" }: renames teams in stored matches and results at start (the earlier team names are built in; add more here; safe to leave in).
    renameKeys: { ...LEGACY_TEAM_KEYS, ...(raw.renameKeys && typeof raw.renameKeys === 'object' ? Object.fromEntries(Object.entries(raw.renameKeys).map(([a, b]) => [String(a), String(b)])) : {}) },
    channels: {
      fixtures: String(raw.channels?.fixtures || ''),
      scoreboard: String(raw.channels?.scoreboard || ''),
      office: String(raw.channels?.office || ''),
      matchReports: String(raw.channels?.matchReports || ''),
    },
    games: (raw.games?.length ? raw.games : DEFAULT_GAMES).map((g) => ({ slug: String(g.slug), label: String(g.label || g.slug) })),
  };
}

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
    // Free role for verified members without a class (not a Buy Me a Coffee level). Absent = no Tourist role.
    tourist: raw.tourist?.roleId
      ? { roleId: String(raw.tourist.roleId), accessRoleId: String(raw.tourist.accessRoleId || ''), free: true, introOptionalFields: (raw.tourist.introOptionalFields || []).map(String) }
      : null,
    // Elder role after afterDays of verified membership (paid or Tourist) with good activity, the lobby voice channel
    // ("Create a Room") that makes private rooms, and who may use it (Elder plus Founder, Representative, Minister).
    elder: {
      roleId: String(raw.elder?.roleId || ''),
      // Assigned by hand by the Founder. The bot never gives or removes it; holders may create private rooms like Elders (the layout gives them the Elder lounges and the office).
      grandElderRoleId: String(raw.elder?.grandElderRoleId || raw.roles?.grandElder || ''),
      afterDays: Number(raw.elder?.afterDays ?? raw.elder?.minDaysInCommunity) || 90,
      activeDaysRequired: Number(raw.elder?.activeDaysRequired ?? 30),
      activityWindowDays: Number(raw.elder?.activityWindowDays) || 90,
      lobbyChannelId: String(raw.elder?.lobbyChannelId || raw.elder?.hubChannelId || ''),
      categoryId: String(raw.elder?.categoryId || ''),
      creatorRoleIds: (raw.elder?.creatorRoleIds || []).map(String).filter((id) => /^\d+$/.test(id)),
      privateRoomPrefix: raw.elder?.privateRoomPrefix == null ? '' : String(raw.elder.privateRoomPrefix),
      maxRoomsPerElder: Number(raw.elder?.maxRoomsPerElder ?? raw.elder?.maxPrivateRoomsPerElder) || 1,
    },
    // Republic Esports League (league.mjs). Absent or without teams = no /league command.
    league: leagueConfig(raw.league),
    // Hobby picker in #college: [{ slug, label, emoji, roleId }]
    hobbies: (raw.hobbies || []).filter((h) => h?.slug && h?.roleId).map((h) => ({ slug: String(h.slug), label: String(h.label || h.slug), emoji: h.emoji ? String(h.emoji) : null, roleId: String(h.roleId), requires: h.requires ? String(h.requires) : null })),
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
