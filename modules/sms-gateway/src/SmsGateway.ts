import { Platform } from 'react-native';
import { NativeModule, requireOptionalNativeModule } from 'expo';
type EventSubscription = { remove(): void };

/** A text received by the phone, queued by the native receiver. */
export type InboxItem = {
  id: string;
  from: string; // normalized, e.g. +15055551234
  body: string;
  timestamp: number;
  kind: 'message' | 'join' | 'join_failed' | 'stop' | 'start' | 'help';
  groupCode: string | null;
  name: string | null;
  autoReply: string | null;
};

export type GatewayConfig = {
  orgName: string;
  defaultCountryCode: string;
  joinKeyword: string;
  autoReply: boolean;
  groups: { code: string; name: string }[];
  joinReply?: string;
  stopReply?: string;
  startReply?: string;
  helpReply?: string;
};

type Events = { onInbox: (e: { at: number }) => void };

declare class SmsGatewayNative extends NativeModule<Events> {
  isSupported(): boolean;
  setConfig(config: GatewayConfig): Promise<void>;
  setOptOuts(numbers: string[]): Promise<void>;
  getOptOuts(): Promise<string[]>;
  peekInbox(): Promise<InboxItem[]>;
  ackInbox(ids: string[]): Promise<void>;
  sendSms(to: string, body: string): Promise<{ to: string; parts: number }>;
}

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<SmsGatewayNative>('SmsGateway') : null;

/** True when this device can send and receive texts directly (Android dev/release build). */
export const gatewayAvailable = !!native && native.isSupported();

function need(): SmsGatewayNative {
  if (!native) throw new Error('Direct SMS is only available on Android builds of this app.');
  return native;
}

export const SmsGateway = {
  setConfig: (c: GatewayConfig) => need().setConfig(c),
  setOptOuts: (n: string[]) => need().setOptOuts(n),
  getOptOuts: () => need().getOptOuts(),
  peekInbox: () => need().peekInbox(),
  ackInbox: (ids: string[]) => need().ackInbox(ids),
  sendSms: (to: string, body: string) => need().sendSms(to, body),
  onInbox(listener: () => void): EventSubscription | null {
    return native ? native.addListener('onInbox', listener) : null;
  },
};
