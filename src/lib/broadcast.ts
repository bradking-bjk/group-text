import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { SmsGateway } from '../../modules/sms-gateway';
import * as db from './db';

/**
 * Android broadcast engine: sends each member a private one-to-one text from the
 * admin's own phone, pausing between texts so the carrier doesn't flag the number.
 * Runs outside any screen, so the admin can browse the app while it works.
 */

export type BroadcastState = {
  running: boolean;
  groupName: string;
  total: number;
  sent: number;
  failed: { phone: string; name: string; error: string }[];
  cancelled: boolean;
  finished: boolean;
};

const IDLE: BroadcastState = { running: false, groupName: '', total: 0, sent: 0, failed: [], cancelled: false, finished: false };

let state: BroadcastState = IDLE;
let cancelRequested = false;
const listeners = new Set<(s: BroadcastState) => void>();

function set(patch: Partial<BroadcastState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function getBroadcastState() {
  return state;
}

export function subscribeBroadcast(l: (s: BroadcastState) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function cancelBroadcast() {
  cancelRequested = true;
}

export function clearBroadcast() {
  if (!state.running) set(IDLE);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startBroadcast(group: db.Group, recipients: db.Member[], body: string, delaySeconds: number) {
  if (state.running) throw new Error('A broadcast is already in progress.');
  cancelRequested = false;
  state = { ...IDLE, running: true, groupName: group.name, total: recipients.length };
  listeners.forEach((l) => l(state));
  const keepAwakeTag = 'broadcast';
  await activateKeepAwakeAsync(keepAwakeTag);
  const failed: BroadcastState['failed'] = [];
  try {
    for (let i = 0; i < recipients.length; i++) {
      if (cancelRequested) break;
      const m = recipients[i];
      const msgId = await db.addMessage({
        phone: m.phone,
        direction: 'out',
        body,
        status: 'pending',
        groupId: group.id,
        createdAt: Date.now(),
        read: 1,
      });
      try {
        await SmsGateway.sendSms(m.phone, body);
        await db.setMessageStatus(msgId, 'sent');
        set({ sent: state.sent + 1 });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await db.setMessageStatus(msgId, 'failed');
        failed.push({ phone: m.phone, name: m.name, error });
        set({ failed: [...failed] });
      }
      if (i < recipients.length - 1 && !cancelRequested) await sleep(Math.max(1, delaySeconds) * 1000);
    }
  } finally {
    deactivateKeepAwake(keepAwakeTag);
    set({ running: false, finished: true, cancelled: cancelRequested });
  }
}

/** One-off text, e.g. replying to a member in the inbox. */
export async function sendSingle(phone: string, body: string) {
  const id = await db.addMessage({ phone, direction: 'out', body, status: 'pending', groupId: null, createdAt: Date.now(), read: 1 });
  try {
    await SmsGateway.sendSms(phone, body);
    await db.setMessageStatus(id, 'sent');
  } catch (e) {
    await db.setMessageStatus(id, 'failed');
    throw e;
  }
}
