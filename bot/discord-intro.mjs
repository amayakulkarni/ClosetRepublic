// The Discord side of the Tourist intro check: the staff channel with Approve and Decline buttons, the decline
// form, and the DM handler. The rules are in intro.mjs.
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits as P, TextInputBuilder, TextInputStyle } from 'discord.js';
import { modRoleIds } from './tickets.mjs';

export const INTRO_IDS = { approve: 'intro:approve:', decline: 'intro:decline:', declineModal: 'intro:declinemodal:' };

/** Only the mods and the bot see an intro channel. The applicant does not (the decision comes by DM). */
export const introOverwrites = ({ guildId, botId, mods }) => [
  { id: guildId, deny: [P.ViewChannel] },
  ...mods.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
  { id: botId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.ManageChannels] },
];

const button = (id, label, style) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

export function createIntroAdapter({ getClient, getGuild, cfg }) {
  const channel = async (id) => (await getClient().channels.fetch(id)) ?? null;
  return {
    async createChannel({ applicantId, name }) {
      const ch = await getGuild().channels.create({
        name,
        type: ChannelType.GuildText,
        parent: cfg.channels.introCategory || cfg.channels.ticketCategory,
        topic: 'Intro check for the Tourist role. Mods only. Deleted when a mod decides.',
        permissionOverwrites: introOverwrites({ guildId: getGuild().id, botId: getClient().user.id, mods: modRoleIds(cfg) }),
        reason: `Intro from ${applicantId}`,
      });
      return ch.id;
    },
    async postIntro(channelId, { number, applicantId, fields }) {
      const ch = await channel(channelId);
      const embed = new EmbedBuilder()
        .setTitle(`Intro ${String(number).padStart(4, '0')}`)
        .setDescription(`From <@${applicantId}>. Check that it reads like a real person. Approving saves it in the mods' private records; declining deletes it. Never share it outside the mods.`)
        .addFields(fields.map((f) => ({ name: f.label, value: f.value || '-' })))
        .setColor(0x2b2d31);
      await ch.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button(INTRO_IDS.approve + number, 'Approve', ButtonStyle.Success), button(INTRO_IDS.decline + number, 'Decline', ButtonStyle.Danger))],
        allowedMentions: { parse: [] },
      });
    },
    /** Saves the intro as a text file in #ticket-transcripts (mods only) and returns where it is. */
    async archiveIntro(channelId, { number, applicantId, approvedBy }) {
      const ch = await channel(channelId);
      const msgs = await ch.messages.fetch({ limit: 20 });
      const embed = [...msgs.values()].find((m) => m.author.id === getClient().user.id && m.embeds.length)?.embeds[0];
      const fields = embed?.fields ?? [];
      const padded = String(number).padStart(4, '0');
      const content = [`Closet Republic Tourist intro ${padded}`, `Discord ID: ${applicantId}`, `Approved by: ${approvedBy}`, `Approved: ${new Date().toISOString()}`, '-'.repeat(40), ...fields.map((f) => `${f.name}: ${f.value}`)].join('\n') + '\n';
      const target = await channel(cfg.channels.ticketTranscripts);
      const m = await target.send({ content: `Tourist intro ${padded} for <@${applicantId}>, approved by <@${approvedBy}>. Kept until the member asks for deletion.`, files: [new AttachmentBuilder(Buffer.from(content, 'utf8'), { name: `intro-${padded}.txt` })], allowedMentions: { parse: [] } });
      return { channelId: target.id, messageId: m.id };
    },
    async deleteMessage(channelId, messageId) {
      const ch = await channel(channelId);
      await ch?.messages.delete(messageId);
    },
    async deleteChannel(channelId, reason) {
      const ch = await channel(channelId);
      await ch?.delete(reason);
    },
    async isMember(userId) {
      try {
        await getGuild().members.fetch(userId);
        return true;
      } catch {
        return false;
      }
    },
    async dm(userId, text) {
      try {
        const u = await getClient().users.fetch(userId);
        await u.send(text);
        return true;
      } catch {
        return false;
      }
    },
    async modLog(text) {
      if (!cfg.channels.modLog) return;
      const ch = await channel(cfg.channels.modLog);
      await ch?.send({ content: text, allowedMentions: { parse: [] } });
    },
  };
}

const rolesOf = (i) => new Set(i.member?.roles?.cache?.keys?.() ?? []);

/** Handles the Approve/Decline buttons, the decline form and /intro. Returns true when handled. */
export async function handleIntroInteraction(i, { intro, queue }) {
  const reply = (text) => i.editReply({ content: String(text).slice(0, 1990), allowedMentions: { parse: [] } }).catch(() => {});
  if (i.isChatInputCommand?.() && i.commandName === 'intro') {
    await i.reply({ content: intro ? intro.help() : 'The Tourist role is not open yet. Ask a mod.', flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return true;
  }
  if (i.isButton?.() && i.customId.startsWith(INTRO_IDS.approve)) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const number = Number(i.customId.slice(INTRO_IDS.approve.length));
    const text = await queue('intro approve', () => intro.approve({ userId: i.user.id, roleIds: rolesOf(i), number }));
    await reply(typeof text === 'string' ? text : 'Something went wrong. Please try again.');
    return true;
  }
  if (i.isButton?.() && i.customId.startsWith(INTRO_IDS.decline)) {
    const number = i.customId.slice(INTRO_IDS.decline.length);
    await i.showModal(
      new ModalBuilder()
        .setCustomId(INTRO_IDS.declineModal + number)
        .setTitle('Decline this intro')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Short, kind note for the applicant (optional)').setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(false),
          ),
        ),
    ).catch(() => {});
    return true;
  }
  if (i.isModalSubmit?.() && i.customId.startsWith(INTRO_IDS.declineModal)) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const number = Number(i.customId.slice(INTRO_IDS.declineModal.length));
    const text = await queue('intro decline', () => intro.decline({ userId: i.user.id, roleIds: rolesOf(i), number, reason: i.fields.getTextInputValue('reason') }));
    await reply(typeof text === 'string' ? text : 'Something went wrong. Please try again.');
    return true;
  }
  return false;
}

const lastDm = new Map();

/** A direct message to the bot. Returns true when handled (the bot answers every DM; it never stores one). */
export async function handleIntroDm(message, { intro, queue }) {
  if (message.guildId || message.author.bot) return false;
  const now = Date.now();
  if (now - (lastDm.get(message.author.id) ?? 0) < 3000) return true; // ignore floods
  lastDm.set(message.author.id, now);
  if (lastDm.size > 500) for (const [k, t] of lastDm) if (now - t > 60_000) lastDm.delete(k);
  const text = await queue('intro dm', () => intro.dm({ userId: message.author.id, text: message.content }));
  if (typeof text === 'string') await message.author.send({ content: text.slice(0, 1990), allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}
