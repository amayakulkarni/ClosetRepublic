// Private voice rooms for Elders. An Elder who joins the lobby voice channel gets a room of their own in
// the Elder category, visible only to them and the people they invite, and is moved into it. The room is
// deleted when it has been empty for a short while. The rules are here; discord-elder.mjs talks to Discord.

const EMPTY_DELETE_MS = 15_000;

const clean = (s) => String(s ?? '').replace(/[^\p{L}\p{N} '’_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * dc: { createRoom({ ownerId, name }) → channelId, moveMember(userId, channelId), deleteChannel(channelId),
 *       allow(channelId, userId), deny(channelId, userId), rename(channelId, name), setLimit(channelId, n),
 *       peopleIn(channelId) → number, exists(channelId) → boolean }
 */
export function createElderRooms({ cfg, store, dc, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const timers = new Map();
  const isElder = (roleIds) => Boolean(cfg.elder.roleId) && roleIds.has(cfg.elder.roleId);
  const maxRooms = cfg.elder.maxRoomsPerElder || 1;

  /** Someone entered the lobby. Creates their room (or reuses it) and moves them in. */
  async function lobbyJoin({ userId, displayName, roleIds }) {
    if (!isElder(roleIds)) return { moved: false, reason: 'not an Elder' };
    let rooms = store.elderRoomsByOwner(userId);
    let channelId = rooms.find((r) => dc.exists(r.channel_id))?.channel_id;
    if (!channelId) {
      for (const r of rooms) store.elderRoomDelete(r.channel_id);
      channelId = await dc.createRoom({ ownerId: userId, name: `${clean(displayName) || 'Elder'}'s room` });
      store.elderRoomCreate(channelId, userId);
      log(`created a private room for <@${userId}>`);
    }
    await dc.moveMember(userId, channelId);
    return { moved: true, channelId };
  }

  /** Called on every voice change in a tracked room: deletes it once it has stayed empty. */
  function roomChanged(channelId) {
    if (!store.elderRoomByChannel(channelId)) return;
    clearTimer(timers.get(channelId));
    timers.delete(channelId);
    if (dc.peopleIn(channelId) > 0) return;
    timers.set(
      channelId,
      setTimer(async () => {
        timers.delete(channelId);
        if (dc.peopleIn(channelId) > 0) return;
        await dc.deleteChannel(channelId).catch((e) => log(`could not delete a room: ${e.message}`));
        store.elderRoomDelete(channelId);
      }, EMPTY_DELETE_MS),
    );
  }

  /** On start: forget rooms that no longer exist and delete rooms left empty. */
  async function cleanup() {
    for (const r of store.elderRoomsAll()) {
      if (!dc.exists(r.channel_id)) store.elderRoomDelete(r.channel_id);
      else if (dc.peopleIn(r.channel_id) === 0) {
        await dc.deleteChannel(r.channel_id).catch(() => {});
        store.elderRoomDelete(r.channel_id);
      }
    }
  }

  const myRoom = (userId) => store.elderRoomsByOwner(userId).find((r) => dc.exists(r.channel_id));

  /** /room invite|remove|rename|limit|close, for the owner of a room. */
  async function command({ sub, userId, roleIds, target, name, limit }) {
    if (!isElder(roleIds)) return 'Private rooms are for Elders.';
    const room = myRoom(userId);
    if (!room) return 'You have no private room yet. Join the Elder lobby voice channel to get one.';
    const id = room.channel_id;
    if (sub === 'invite' || sub === 'remove') {
      if (!target) return 'Choose a member.';
      if (target === userId) return 'That is you.';
      if (sub === 'invite') await dc.allow(id, target);
      else await dc.deny(id, target);
      return sub === 'invite' ? `<@${target}> can now see and join your room.` : `<@${target}> can no longer see your room.`;
    }
    if (sub === 'rename') {
      const n = clean(name);
      if (!n) return 'Give the room a name (letters and numbers).';
      await dc.rename(id, n);
      return `Your room is now called ${n}.`;
    }
    if (sub === 'limit') {
      const n = Math.max(0, Math.min(99, Number(limit) || 0));
      await dc.setLimit(id, n);
      return n ? `Your room now holds up to ${n} people.` : 'Your room has no people limit now.';
    }
    if (sub === 'close') {
      await dc.deleteChannel(id);
      store.elderRoomDelete(id);
      return 'Your room is closed.';
    }
    return 'Unknown command.';
  }

  return { lobbyJoin, roomChanged, cleanup, command, maxRooms };
}
