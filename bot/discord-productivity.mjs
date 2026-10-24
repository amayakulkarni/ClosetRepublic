// The Discord side of the to-do lists, voice channel tracking and Pomodoro: slash command definitions,
// the adapter that mutes, sets channel status, posts and pins, and the interaction routing.
// The rules are in todos.mjs, vc-tools.mjs and pomodoro.mjs.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } from 'discord.js';
import { setStatus } from './ambience-voice.mjs';
import { modRoleIds } from './tickets.mjs';
import { todoCommand } from './todos.mjs';

const LIST = { type: 3, name: 'list', description: 'Your own list (default) or the shared list of the voice channel', required: false, choices: [{ name: 'mine', value: 'mine' }, { name: 'voice channel', value: 'room' }] };
const ITEM = { type: 4, name: 'item', description: 'Number from /todo list', required: true, min_value: 1, max_value: 50 };

export const PRODUCTIVITY_COMMANDS = [
  {
    name: 'todo', description: 'Your to-do list, or the shared list of the voice channel you are in',
    options: [
      { type: 1, name: 'add', description: 'Add a task (no personal or sensitive details)', options: [{ type: 3, name: 'task', description: 'The task', required: true, max_length: 200 }, LIST] },
      { type: 1, name: 'list', description: 'Show the list (only you see the reply)', options: [LIST] },
      { type: 1, name: 'done', description: 'Tick a task off (it is deleted)', options: [ITEM, LIST] },
      { type: 1, name: 'remove', description: 'Delete a task without finishing it', options: [ITEM, LIST] },
      { type: 1, name: 'clear', description: 'Delete every task you added to the list', options: [LIST] },
    ],
  },
  {
    name: 'vc', description: 'Track what is happening in the voice channel you are in',
    options: [
      { type: 1, name: 'status', description: 'Set the line under the channel name', options: [{ type: 3, name: 'text', description: 'Status', required: true, max_length: 100 }] },
      { type: 1, name: 'clear-status', description: 'Clear the status line' },
      {
        type: 1, name: 'meeting', description: 'Start a meeting: status, pinned agenda from the channel to-do list, optional end time',
        options: [
          { type: 3, name: 'topic', description: 'What the meeting is about', required: true, max_length: 80 },
          { type: 4, name: 'minutes', description: 'Ends by itself after this many minutes', required: false, min_value: 5, max_value: 240 },
        ],
      },
      { type: 1, name: 'meeting-end', description: 'End the meeting' },
      { type: 1, name: 'note', description: 'Post a note in the voice chat and pin it', options: [{ type: 3, name: 'text', description: 'The note', required: true, max_length: 300 }] },
    ],
  },
  {
    name: 'pomodoro', description: 'Focus timer for the office and coworking voice channels',
    options: [
      {
        type: 1, name: 'start', description: 'Start a Pomodoro in the voice channel you are in',
        options: [
          { type: 4, name: 'focus', description: 'Minutes per focus block (default 25)', required: false, min_value: 5, max_value: 90 },
          { type: 4, name: 'break', description: 'Minutes per break (default 5)', required: false, min_value: 1, max_value: 30 },
          { type: 4, name: 'rounds', description: 'Focus blocks (default 4)', required: false, min_value: 1, max_value: 8 },
        ],
      },
      { type: 1, name: 'join', description: 'Be muted during each focus block (your choice, lifted in breaks and at the end)' },
      { type: 1, name: 'leave', description: 'Stop being muted by the Pomodoro' },
      { type: 1, name: 'status', description: 'What the Pomodoro is doing now' },
      { type: 1, name: 'stop', description: 'End the Pomodoro (the person who started it, or a mod)' },
    ],
  },
  { type: 3, name: 'Pin in voice chat' },
  { type: 3, name: 'Unpin from voice chat' },
];

export const POMO_IDS = { in: 'pomo:in:', out: 'pomo:out:' };

const pomoButtons = (channelId) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(POMO_IDS.in + channelId).setLabel('Mute me during focus').setEmoji('🔇').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(POMO_IDS.out + channelId).setLabel('Unmute me').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
  );

const isVoice = (c) => c?.type === ChannelType.GuildVoice || c?.type === ChannelType.GuildStageVoice;

/** The `pd` adapter for pomodoro.mjs and vc-tools.mjs. */
export function createProductivityAdapter({ getClient, getGuild, botIds = () => new Set() }) {
  const guild = () => getGuild();
  const channel = (id) => guild().channels.cache.get(id);
  return {
    channel: (id) => {
      const c = channel(id);
      return isVoice(c) ? { id: c.id, name: c.name, kind: c.type === ChannelType.GuildStageVoice ? 'stage' : 'voice' } : null;
    },
    humans(channelId) {
      const bots = botIds();
      return [...guild().voiceStates.cache.values()]
        .filter((st) => st.channelId === channelId && !bots.has(st.id) && !(st.member?.user ?? getClient().users.cache.get(st.id))?.bot)
        .map((st) => st.id);
    },
    voiceOf(userId) {
      const st = guild().voiceStates.cache.get(userId);
      return st?.channelId ? { channelId: st.channelId, serverMute: Boolean(st.serverMute) } : null;
    },
    setMute: (userId, on) => guild().members.edit(userId, { mute: on, reason: on ? 'Pomodoro focus block (opted in)' : 'Pomodoro: focus over' }),
    setStatus: (channelId, text) => setStatus(getClient(), channelId, text),
    async post(channelId, { content, buttons = false }) {
      return channel(channelId).send({ content: content.slice(0, 1990), components: buttons ? [pomoButtons(channelId)] : [], allowedMentions: { parse: [] } });
    },
    pin: (channelId, messageId) => channel(channelId).messages.pin(messageId, 'Pinned from the voice chat tools'),
    unpin: (channelId, messageId) => channel(channelId).messages.unpin(messageId, 'Unpinned from the voice chat tools'),
  };
}

/** The voice channel a command is about: the channel whose chat it was typed in, else the one the member sits in. */
export function roomOf(i) {
  if (isVoice(i.channel)) return i.channel.id;
  return i.guild?.voiceStates?.cache?.get(i.user.id)?.channelId ?? null;
}

/** Handles /todo, /vc, /pomodoro, the Pomodoro buttons and the pin menu items. Returns true when handled. */
export async function handleProductivityInteraction(i, { cfg, store, pomodoro, vcTools, queue }) {
  const isCommand = i.isChatInputCommand?.() && ['todo', 'vc', 'pomodoro'].includes(i.commandName);
  const isMenu = i.isMessageContextMenuCommand?.() && ['Pin in voice chat', 'Unpin from voice chat'].includes(i.commandName);
  const isButton = i.isButton?.() && (i.customId.startsWith(POMO_IDS.in) || i.customId.startsWith(POMO_IDS.out));
  if (!isCommand && !isMenu && !isButton) return false;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const roles = new Set(i.member?.roles?.cache?.keys?.() ?? []);
  const isMod = modRoleIds(cfg).some((id) => roles.has(id));
  const here = i.guild?.voiceStates?.cache?.get(i.user.id)?.channelId ?? null;
  let text;

  if (isButton) {
    const channelId = i.customId.split(':')[2];
    text = await queue('pomodoro button', () =>
      i.customId.startsWith(POMO_IDS.in) ? pomodoro.optIn({ channelId, userId: i.user.id }) : pomodoro.optOut({ channelId, userId: i.user.id }),
    );
  } else if (isMenu) {
    const msg = i.targetMessage;
    const roomId = isVoice(msg?.channel) ? msg.channel.id : null;
    text = await queue('voice chat pin', () => vcTools.pinMessage({ userId: i.user.id, roomId, inRoom: Boolean(roomId) && here === roomId, isMod, messageId: msg.id, pin: i.commandName.startsWith('Pin') }));
  } else {
    const sub = i.options.getSubcommand(false);
    const roomId = roomOf(i);
    const inRoom = Boolean(roomId) && here === roomId;
    if (i.commandName === 'todo') {
      text = await queue('/todo', async () =>
        todoCommand({ sub, userId: i.user.id, isMod, list: i.options.getString('list') ?? 'mine', roomId, inRoom, task: i.options.getString('task'), item: i.options.getInteger('item') }, { store }),
      );
    } else if (i.commandName === 'vc') {
      text = await queue('/vc', () =>
        vcTools.command({ sub, userId: i.user.id, roomId, inRoom, isMod, text: i.options.getString('text') ?? i.options.getString('topic'), minutes: i.options.getInteger('minutes') }),
      );
    } else {
      const channelId = roomId;
      text = await queue('/pomodoro', async () => {
        if (sub === 'start') {
          if (vcTools.meetings.has(channelId)) return 'A meeting is running here. End it with /vc meeting-end first.';
          return pomodoro.start({ channelId, userId: i.user.id, focus: i.options.getInteger('focus'), brk: i.options.getInteger('break'), rounds: i.options.getInteger('rounds') });
        }
        if (sub === 'join') return pomodoro.optIn({ channelId, userId: i.user.id });
        if (sub === 'leave') return pomodoro.optOut({ channelId, userId: i.user.id });
        if (sub === 'stop') return pomodoro.stop({ channelId, userId: i.user.id, isMod });
        return pomodoro.status(channelId);
      });
    }
  }
  await i.editReply({ content: typeof text === 'string' ? text.slice(0, 1990) : 'Something went wrong. Please try again, or ask a Minister.', allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}
