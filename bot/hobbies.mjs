// Hobby roles ("pick your roles" in #college). Each hobby has a role; the roles unlock the hobby channels
// (the Discord layout gives each hobby category to its role). The menu replaces a member's hobby set with
// what they pick, so choosing nothing clears it.
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

export const HOBBY_MENU_ID = 'hobby:pick';

/** What to add and remove so the member holds exactly the picked hobbies (other roles untouched). */
export function planHobbyChange(cfg, currentRoleIds, pickedSlugs) {
  const picked = new Set(pickedSlugs);
  const add = [];
  const remove = [];
  for (const h of cfg.hobbies) {
    const has = currentRoleIds.has(h.roleId);
    if (picked.has(h.slug) && !has) add.push(h);
    else if (!picked.has(h.slug) && has) remove.push(h);
  }
  return { add, remove };
}

export const describePlan = (plan, finalLabels) =>
  finalLabels.length
    ? `Your hobbies: ${finalLabels.join(', ')}.${plan.add.length || plan.remove.length ? ' Their channels appear in a moment.' : ''}`
    : 'You hold no hobby roles now.';

export function hobbyMenuRow(cfg) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(HOBBY_MENU_ID)
    .setPlaceholder('Pick your hobbies')
    .setMinValues(0)
    .setMaxValues(Math.min(25, cfg.hobbies.length))
    .addOptions(cfg.hobbies.slice(0, 25).map((h) => ({ label: h.label.slice(0, 100), value: h.slug, ...(h.emoji ? { emoji: h.emoji } : {}) })));
  return new ActionRowBuilder().addComponents(menu);
}

/** Keeps exactly one picker message in #college, edited in place on every start. */
export async function ensureCollegeMessage({ client, cfg }) {
  if (!cfg.channels.college || !cfg.hobbies.length) return false;
  const ch = await client.channels.fetch(cfg.channels.college);
  if (!ch) return false;
  const payload = {
    content: '**College: pick your roles.** Choose the hobbies you like. Each one opens its own channels, and you can change your picks at any time. Choosing nothing removes them all.',
    components: [hobbyMenuRow(cfg)],
    allowedMentions: { parse: [] },
  };
  const recent = await ch.messages.fetch({ limit: 50 });
  const ours = recent.find((m) => m.author.id === client.user.id && m.components.some((r) => r.components.some((c) => c.customId === HOBBY_MENU_ID)));
  if (ours) await ours.edit(payload);
  else await ch.send(payload);
  return true;
}

/** Handles the menu. Returns true when it handled the interaction. */
export async function handleHobbyInteraction(i, { cfg, queue }) {
  if (!(i.isStringSelectMenu?.() && i.customId === HOBBY_MENU_ID)) return false;
  await i.deferReply({ flags: 64 });
  const current = new Set(i.member?.roles?.cache?.keys?.() ?? []);
  const plan = planHobbyChange(cfg, current, i.values);
  const text = await queue('hobby roles', async () => {
    for (const h of plan.add) await i.guild.members.addRole({ user: i.user.id, role: h.roleId, reason: 'Hobby picker' });
    for (const h of plan.remove) await i.guild.members.removeRole({ user: i.user.id, role: h.roleId, reason: 'Hobby picker' });
    const final = cfg.hobbies.filter((h) => i.values.includes(h.slug)).map((h) => h.label);
    return describePlan(plan, final);
  });
  await i.editReply({ content: typeof text === 'string' ? text : 'Something went wrong. Please try again, or ask a Minister.', allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}
