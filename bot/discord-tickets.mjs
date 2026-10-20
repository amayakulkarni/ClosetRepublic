// The Discord side of tickets and mod /unlink: channel permissions, buttons, the form and the
// interaction routing. The rules are in tickets.mjs and unlink.mjs.
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags,
  ModalBuilder, PermissionFlagsBits as P, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { modRoleIds } from './tickets.mjs';
import { parseUserId } from './unlink.mjs';

export const IDS = { open: 'ticket:open', modal: 'ticket:modal', close: 'ticket:close', reopen: 'ticket:reopen', archive: 'ticket:archive', unlinkConfirm: 'unlink:confirm:' };

/** Who can see a ticket: the opener, the mods and the bot. Nobody else, not even paid members. */
export function ticketOverwrites({ guildId, openerId, botId, mods }) {
  return [
    { id: guildId, deny: [P.ViewChannel] },
    { id: openerId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
    ...mods.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] })),
    { id: botId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.ManageChannels] },
  ];
}

const button = (id, label, style) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);

export const openButtonRow = () => row(button(IDS.open, 'Open a ticket', ButtonStyle.Primary));

export function ticketModal() {
  return new ModalBuilder()
    .setCustomId(IDS.modal)
    .setTitle('Open a ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Subject').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('What happened').setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true)),
    );
}

/** The real `tk` adapter for createTickets(). `getClient`/`getGuild` are functions because the client can be recreated at login. */
export function createTicketAdapter({ getClient, getGuild, cfg, contentIntent }) {
  const channel = async (id) => (await getClient().channels.fetch(id)) ?? null;
  return {
    get contentAvailable() { return contentIntent(); },
    async createChannel({ openerId, name }) {
      const ch = await getGuild().channels.create({
        name,
        type: ChannelType.GuildText,
        parent: cfg.channels.ticketCategory,
        topic: 'Private support ticket. Only the opener and the mods can see it.',
        permissionOverwrites: ticketOverwrites({ guildId: getGuild().id, openerId, botId: getClient().user.id, mods: modRoleIds(cfg) }),
        reason: `Ticket opened by ${openerId}`,
      });
      return ch.id;
    },
    async postFirstMessage(channelId, { number, openerId, subject, details }) {
      const ch = await channel(channelId);
      const embed = new EmbedBuilder().setTitle(`Ticket ${String(number).padStart(4, '0')}: ${subject}`.slice(0, 256)).setDescription(details).setColor(0x2b2d31);
      await ch.send({
        content: `<@${openerId}> thanks for reaching out. A mod will reply here. Only you and the mods can see this channel.`,
        embeds: [embed],
        components: [row(button(IDS.close, 'Close ticket', ButtonStyle.Secondary))],
        allowedMentions: { users: [openerId] },
      });
    },
    async setOpenerCanSend(channelId, openerId, allowed) {
      const ch = await channel(channelId);
      await ch.permissionOverwrites.edit(openerId, { SendMessages: allowed });
    },
    async rename(channelId, name) {
      const ch = await channel(channelId);
      await ch.setName(name);
    },
    async postClosedControls(channelId, text) {
      const ch = await channel(channelId);
      await ch.send({
        content: text,
        components: [row(button(IDS.reopen, 'Reopen', ButtonStyle.Success), button(IDS.archive, 'Archive (mods)', ButtonStyle.Danger))],
        allowedMentions: { parse: [] },
      });
    },
    async postPlain(channelId, text) {
      const ch = await channel(channelId);
      await ch.send({ content: text, allowedMentions: { users: [] } });
    },
    async fetchMessages(channelId) {
      const ch = await channel(channelId);
      const all = [];
      let before;
      while (all.length < 5000) {
        const batch = await ch.messages.fetch({ limit: 100, before });
        if (!batch.size) break;
        all.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100) break;
      }
      return all.reverse().map((m) => ({
        at: m.createdAt.toISOString(),
        authorId: m.author.id,
        author: m.member?.displayName ?? m.author.username,
        text: [m.content, ...m.embeds.map((e) => [e.title, e.description].filter(Boolean).join('\n'))].filter(Boolean).join('\n'),
        attachments: [...m.attachments.values()].map((a) => a.url),
      }));
    },
    async sendTranscript(channelId, { filename, content, summary }) {
      const ch = await channel(channelId);
      await ch.send({ content: summary, files: [new AttachmentBuilder(Buffer.from(content, 'utf8'), { name: filename })], allowedMentions: { parse: [] } });
    },
    async deleteChannel(channelId, reason) {
      const ch = await channel(channelId);
      await ch?.delete(reason);
    },
    async modLog(text) {
      if (!cfg.channels.modLog) return;
      const ch = await channel(cfg.channels.modLog);
      await ch?.send({ content: text, allowedMentions: { parse: [] } });
    },
  };
}

/** Keeps exactly one "Open a ticket" message in #open-a-ticket, edited in place on every start. */
export async function ensureDeskMessage({ client, cfg }) {
  if (!cfg.channels.ticketDesk) return;
  const ch = await client.channels.fetch(cfg.channels.ticketDesk);
  if (!ch) return;
  const payload = {
    content:
      '**Need help, or want to report something?** Press the button to open a private ticket. Only you and the mods can see it, and nothing you write is shown in a public channel. You can also type /ticket open anywhere.',
    components: [openButtonRow()],
    allowedMentions: { parse: [] },
  };
  const recent = await ch.messages.fetch({ limit: 50 });
  const ours = recent.find((m) => m.author.id === client.user.id && m.components.some((r) => r.components.some((c) => c.customId === IDS.open)));
  if (ours) await ours.edit(payload);
  else await ch.send(payload);
}

const rolesOf = (i) => new Set(i.member?.roles?.cache?.keys?.() ?? i.member?.roles ?? []);
const EPHEMERAL = MessageFlags.Ephemeral;

/**
 * Routes ticket buttons, the ticket form, /ticket, mod /unlink and its Confirm button.
 * Returns true when it handled the interaction.
 */
export async function handleTicketInteraction(i, { tickets, unlink, queue, cfg }) {
  const roleIds = rolesOf(i);
  const finish = (text, extra = {}) => i.editReply({ content: text, allowedMentions: { parse: [] }, ...extra }).catch(() => {});
  const run = (name, fn) => queue(name, fn).then((r) => (typeof r === 'string' ? r : 'Something went wrong. Please try again, or ask a Minister.'));

  // /ticket open and the desk button show the form (it must be the first response).
  if ((i.isChatInputCommand() && i.commandName === 'ticket' && i.options.getSubcommand(false) === 'open') || (i.isButton() && i.customId === IDS.open)) {
    await i.showModal(ticketModal()).catch(() => {});
    return true;
  }

  if (i.isModalSubmit() && i.customId === IDS.modal) {
    await i.deferReply({ flags: EPHEMERAL });
    const r = await queue('ticket open', () => tickets.open({ userId: i.user.id, subject: i.fields.getTextInputValue('subject'), details: i.fields.getTextInputValue('details') }));
    await finish(r?.ok ? `Your ticket is open: <#${r.channelId}>. A mod will reply there.` : r?.error || 'Something went wrong. Please try again, or ask a Minister.');
    return true;
  }

  if (i.isButton() && [IDS.close, IDS.reopen, IDS.archive].includes(i.customId)) {
    await i.deferReply({ flags: EPHEMERAL });
    const args = { userId: i.user.id, roleIds, channelId: i.channelId };
    const action = { [IDS.close]: tickets.close, [IDS.reopen]: tickets.reopen, [IDS.archive]: (a) => tickets.archive({ ...a, archivedByName: i.member?.displayName ?? i.user.username }) }[i.customId];
    await finish(await run(`ticket ${i.customId}`, () => action(args)));
    return true;
  }

  if (i.isChatInputCommand() && i.commandName === 'ticket') {
    await i.deferReply({ flags: EPHEMERAL });
    const sub = i.options.getSubcommand(false);
    const args = { userId: i.user.id, roleIds, channelId: i.channelId };
    const text = await run(`/ticket ${sub}`, () => {
      if (sub === 'close') return tickets.close({ ...args, reason: i.options.getString('reason') });
      if (sub === 'reopen') return tickets.reopen(args);
      if (sub === 'archive') return tickets.archive({ ...args, archivedByName: i.member?.displayName ?? i.user.username });
      if (sub === 'list') return tickets.list(args);
      return 'Unknown command.';
    });
    await finish(text);
    return true;
  }

  // Mod /unlink: a target was given, so this is the mod path; plain /unlink stays the member's own.
  if (i.isChatInputCommand() && i.commandName === 'unlink' && (i.options.get('member') || i.options.get('user_id'))) {
    await i.deferReply({ flags: EPHEMERAL });
    const target = i.options.get('member')?.user?.id ?? parseUserId(i.options.getString('user_id'));
    const r = unlink.prepare({ actorId: i.user.id, roleIds, target, reason: i.options.getString('reason') });
    if (r.error) await finish(r.error);
    else await finish(r.text, { components: [row(button(IDS.unlinkConfirm + r.token, 'Confirm unlink', ButtonStyle.Danger))] });
    return true;
  }

  if (i.isButton() && i.customId.startsWith(IDS.unlinkConfirm)) {
    await i.deferUpdate();
    const text = await run('mod unlink', () => unlink.confirm({ actorId: i.user.id, roleIds, token: i.customId.slice(IDS.unlinkConfirm.length) }));
    await finish(text, { components: [] });
    return true;
  }
  return false;
}
