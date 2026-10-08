import { gatewayAvailable, SmsGateway, type InboxItem } from '../../modules/sms-gateway';
import * as db from './db';

/**
 * Pushes settings, group codes and the opt-out list to the Android receiver so it can
 * answer JOIN/STOP/HELP correctly while the app is closed. Call after any change.
 */
export async function pushConfig() {
  if (!gatewayAvailable) return;
  // Import first so a START the receiver already processed isn't overwritten below.
  await importInbox();
  const [settings, groups, optOuts] = await Promise.all([db.getSettings(), db.listGroups(), db.listOptedOutPhones()]);
  await SmsGateway.setConfig({
    orgName: settings.orgName,
    defaultCountryCode: settings.defaultCountryCode,
    joinKeyword: settings.joinKeyword || 'JOIN',
    autoReply: settings.autoReply,
    groups: groups.map((g) => ({ code: g.code, name: g.name })),
    joinReply: settings.joinReply,
    stopReply: settings.stopReply,
    helpReply: settings.helpReply,
  });
  // The receiver may have recorded STOPs we haven't imported yet; keep the union.
  const nativeOptOuts = await SmsGateway.getOptOuts();
  await SmsGateway.setOptOuts(Array.from(new Set([...nativeOptOuts, ...optOuts])));
}

let importing: Promise<number> | null = null;

/** Imports texts the receiver queued. Returns how many were imported. Safe to call often. */
export function importInbox(): Promise<number> {
  if (!gatewayAvailable) return Promise.resolve(0);
  if (!importing) {
    importing = doImport().finally(() => {
      importing = null;
    });
  }
  return importing;
}

async function doImport(): Promise<number> {
  const items = await SmsGateway.peekInbox();
  if (items.length === 0) return 0;
  const groups = await db.listGroups();
  const done: string[] = [];
  for (const item of items) {
    try {
      await applyItem(item, groups);
      done.push(item.id);
    } catch (e) {
      console.warn('Failed to import message', item.id, e);
    }
  }
  await SmsGateway.ackInbox(done);
  return done.length;
}

async function applyItem(item: InboxItem, groups: db.Group[]) {
  const at = Math.round(item.timestamp) || Date.now();
  const isKeywordOnly = item.kind !== 'message';
  await db.addMessage({
    phone: item.from,
    direction: 'in',
    body: item.body,
    status: 'received',
    groupId: null,
    createdAt: at,
    read: isKeywordOnly ? 1 : 0, // keyword texts are handled automatically; don't flag as unread
  });

  if (item.kind === 'stop') {
    await db.setOptedOut(item.from, true);
  } else if (item.kind === 'start') {
    await db.setOptedOut(item.from, false);
  } else if (item.kind === 'join' && item.groupCode) {
    const group = groups.find((g) => g.code.toUpperCase() === item.groupCode!.toUpperCase());
    if (group) {
      await db.upsertMemberInGroup(group.id, item.from, item.name ?? '');
      await db.setOptedOut(item.from, false);
    }
  }

  if (item.autoReply) {
    await db.addMessage({
      phone: item.from,
      direction: 'out',
      body: item.autoReply,
      status: 'auto',
      groupId: null,
      createdAt: at + 1,
      read: 1,
    });
  }
}
