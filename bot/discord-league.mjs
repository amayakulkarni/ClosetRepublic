// The Discord side of the Republic Esports League: /league command definition, the adapter that posts, pins,
// makes match rooms and events, and the interaction routing. The rules are in league.mjs.
import { ChannelType, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { resolveTeams } from './league.mjs';

const teamChoices = (cfg) => cfg.league.teams.map((t) => ({ name: t.name, value: t.key }));
const team = (cfg, name, description, required = false) => ({ type: 3, name, description, required, choices: teamChoices(cfg) });
const list = (name, description) => ({ type: 3, name, description, required: false, max_length: 100 });

/** The /league definition, with the team and game choices from the config. */
export function leagueCommand(cfg) {
  return {
    name: 'league',
    description: 'Republic Esports League: fixtures, standings and (for the league crew) matches and results',
    options: [
      { type: 1, name: 'fixtures', description: 'Upcoming matches (times show in your own time zone)' },
      { type: 1, name: 'standings', description: 'The season table (also refreshes the scoreboard message)' },
      {
        type: 1, name: 'schedule', description: 'League crew: create a match (fixture post, Discord event, reminders and a match room)',
        options: [
          { type: 3, name: 'game', description: 'Game', required: true, choices: cfg.league.games.slice(0, 25).map((g) => ({ name: g.label, value: g.slug })) },
          { type: 3, name: 'when', description: 'India time, YYYY-MM-DD HH:mm, for example 2026-11-07 20:00', required: true, max_length: 20 },
          { type: 3, name: 'kind', description: 'head-to-head (default) or free-for-all', required: false, choices: [{ name: 'head-to-head', value: 'h2h' }, { name: 'free-for-all (all four teams)', value: 'ffa' }] },
          team(cfg, 'team1', 'Head-to-head: first team'),
          team(cfg, 'team2', 'Head-to-head: second team'),
          { type: 4, name: 'week', description: 'Season week number', required: false, min_value: 0, max_value: 12 },
          { type: 3, name: 'note', description: 'Extra line for the fixture post (map, lobby code owner, rules)', required: false, max_length: 300 },
        ],
      },
      {
        type: 1, name: 'result', description: 'League crew: enter or correct a result (points and the scoreboard update by themselves)',
        options: [
          { type: 4, name: 'match', description: 'Match number from /league fixtures', required: true, min_value: 1 },
          team(cfg, 'winner', 'Head-to-head: the winning team'),
          { type: 5, name: 'draw', description: 'Head-to-head: a draw', required: false },
          team(cfg, 'first', 'Free-for-all: 1st place'),
          team(cfg, 'second', 'Free-for-all: 2nd place'),
          team(cfg, 'third', 'Free-for-all: 3rd place'),
          team(cfg, 'fourth', 'Free-for-all: 4th place'),
          team(cfg, 'best_sport', 'The team the opponents voted kindest (+1)'),
          list('late', 'Teams that did not field a squad on time (no +1), separated by commas'),
          list('forfeit', 'Team that forfeited (scores 0, the other side wins)'),
          list('penalty', 'Team whose points for this match are voided for a conduct breach (rule 6)'),
        ],
      },
      { type: 1, name: 'cancel', description: 'League crew: cancel a match', options: [{ type: 4, name: 'match', description: 'Match number', required: true, min_value: 1 }] },
      {
        type: 1, name: 'season', description: 'League crew: start a new season (the table starts from zero; old results stay)',
        options: [{ type: 3, name: 'name', description: 'Season name', required: false, max_length: 60 }],
      },
    ],
  };
}

/** The `lg` adapter for league.mjs. */
export function createLeagueAdapter({ getClient, getGuild, cfg, store }) {
  const guild = () => getGuild();
  const L = cfg.league;
  return {
    async post(channelId, content, roleIds = []) {
      if (!channelId) return null;
      const ch = await getClient().channels.fetch(channelId);
      const pings = roleIds.map((id) => `<@&${id}>`).join(' ');
      const m = await ch.send({ content: `${pings ? `${pings}\n` : ''}${content}`.slice(0, 1990), allowedMentions: { roles: roleIds } });
      return m.id;
    },
    /** Keeps one standings message in #scoreboard, edited in place and pinned. */
    async upsertScoreboard(channelId, text) {
      const ch = await getClient().channels.fetch(channelId);
      const saved = store.leagueState('scoreboardMessage', '');
      const existing = saved ? await ch.messages.fetch(saved).catch(() => null) : null;
      if (existing && existing.author.id === getClient().user.id) return existing.edit({ content: text.slice(0, 1990), allowedMentions: { parse: [] } });
      const m = await ch.send({ content: text.slice(0, 1990), allowedMentions: { parse: [] } });
      await m.pin().catch(() => {});
      store.leagueStateSet('scoreboardMessage', m.id);
    },
    /** A voice room only the playing teams and the league crew can see and join, in the league category. */
    async createRoom({ name, teamRoleIds, crewRoleIds }) {
      const allow = [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD];
      const created = await guild().channels.create({
        name: name.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: L.categoryId || undefined,
        permissionOverwrites: [
          { id: guild().id, deny: [P.ViewChannel, P.Connect] },
          ...[...teamRoleIds, ...crewRoleIds].map((id) => ({ id, allow })),
          { id: getClient().user.id, allow: [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers] },
        ],
        reason: 'League match room',
      });
      return created.id;
    },
    deleteChannel: async (id) => guild().channels.cache.get(id)?.delete('League match room closed'),
    async createEvent({ name, description, startsAt }) {
      const e = await guild().scheduledEvents.create({
        name,
        description: description.slice(0, 900),
        scheduledStartTime: new Date(startsAt),
        scheduledEndTime: new Date(startsAt + 2 * 60 * 60_000),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: 'Republic Esports League voice rooms' },
      });
      return e.id;
    },
    deleteEvent: async (id) => guild().scheduledEvents.delete(id),
  };
}

/** Handles /league. Returns true when handled. */
export async function handleLeagueInteraction(i, { cfg, league, queue }) {
  if (!(i.isChatInputCommand?.() && i.commandName === 'league')) return false;
  const sub = i.options.getSubcommand(false);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const roleIds = new Set(i.member?.roles?.cache?.keys?.() ?? []);
  const s = (n) => i.options.getString(n);
  const teams = (n) => resolveTeams(cfg, s(n));
  const text = await queue(`/league ${sub}`, async () => {
    if (sub === 'fixtures') return league.fixtures();
    if (sub === 'standings') return league.standings();
    if (sub === 'schedule') {
      const picked = [s('team1'), s('team2')].filter(Boolean);
      return league.schedule({ roleIds, userId: i.user.id, game: s('game'), kind: s('kind'), when: s('when'), teams: picked, week: i.options.getInteger('week'), note: s('note') ?? '' });
    }
    if (sub === 'cancel') return league.cancel({ roleIds, matchId: i.options.getInteger('match') });
    if (sub === 'season') return league.seasonStart({ roleIds, name: s('name') });
    if (sub === 'result') {
      const late = teams('late');
      const forfeit = teams('forfeit');
      const penalty = teams('penalty');
      for (const r of [late, forfeit, penalty]) if (r.error) return r.error;
      return league.result({
        roleIds,
        matchId: i.options.getInteger('match'),
        winner: s('winner'),
        draw: i.options.getBoolean('draw') ?? false,
        placements: [s('first'), s('second'), s('third'), s('fourth')].filter(Boolean),
        bestSport: s('best_sport') ? [s('best_sport')] : [],
        late: late.keys,
        forfeit: forfeit.keys,
        penalty: penalty.keys,
      });
    }
    return 'Unknown league command.';
  });
  await i.editReply({ content: typeof text === 'string' ? text.slice(0, 1990) : 'Something went wrong. Please try again, or ask a Minister.', allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}
