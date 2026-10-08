import * as SMS from 'expo-sms';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { gatewayAvailable } from '../../modules/sms-gateway';
import {
  cancelBroadcast,
  clearBroadcast,
  getBroadcastState,
  startBroadcast,
  subscribeBroadcast,
  type BroadcastState,
} from '../lib/broadcast';
import * as db from '../lib/db';
import { hasSmsPermissions, requestSmsPermissions } from '../lib/permissions';
import { formatPhone } from '../lib/phone';
import { segmentInfo, withFooter } from '../lib/sms';
import { useData } from '../lib/useData';
import { useNav } from '../nav';
import { Button, Card, Field, Header, Note, s, usePalette } from '../ui/kit';

export function ComposeScreen({ groupId }: { groupId: number }) {
  const p = usePalette();
  const nav = useNav();
  const [body, setBody] = useState('');
  const { data } = useData(
    async () => ({
      group: await db.getGroup(groupId),
      recipients: await db.activeRecipients(groupId),
      settings: await db.getSettings(),
    }),
    [groupId],
  );
  const [bstate, setBstate] = useState<BroadcastState>(getBroadcastState());
  useEffect(() => subscribeBroadcast(setBstate), []);
  const [batches, setBatches] = useState<{ phones: string[]; done: boolean }[] | null>(null);

  if (!data || !data.group) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  const { group, recipients, settings } = data;
  const finalBody = withFooter(body, settings.appendOptOut);
  const info = segmentInfo(finalBody);

  // ----- Android: send from this phone, one private text per member -----
  const sendAndroid = async () => {
    if (!(await hasSmsPermissions()) && !(await requestSmsPermissions())) {
      return Alert.alert('Permission needed', 'Allow SMS permissions in Settings to send texts from this phone.');
    }
    const minutes = Math.ceil((recipients.length * settings.sendDelaySeconds) / 60);
    Alert.alert(
      `Send to ${recipients.length} people?`,
      `Each person gets a private text from your number. This takes about ${minutes} minute${minutes === 1 ? '' : 's'} — keep the app open. Standard carrier rates apply.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            startBroadcast(group, recipients, finalBody, settings.sendDelaySeconds).catch((e) =>
              Alert.alert('Could not send', String(e)),
            );
          },
        },
      ],
    );
  };

  // ----- iPhone: hand batches to the Messages composer -----
  const startIos = async () => {
    if (!(await SMS.isAvailableAsync())) return Alert.alert('Texting is not available on this device');
    const size = Math.max(1, settings.iosBatchSize);
    const out: { phones: string[]; done: boolean }[] = [];
    for (let i = 0; i < recipients.length; i += size) {
      out.push({ phones: recipients.slice(i, i + size).map((r) => r.phone), done: false });
    }
    setBatches(out);
  };

  const openBatch = async (index: number) => {
    if (!batches) return;
    const batch = batches[index];
    const { result } = await SMS.sendSMSAsync(batch.phones, finalBody);
    if (result === 'sent' || result === 'unknown') {
      for (const phone of batch.phones) {
        await db.addMessage({ phone, direction: 'out', body: finalBody, status: 'handed_off', groupId, createdAt: Date.now(), read: 1 });
      }
      setBatches(batches.map((b, i) => (i === index ? { ...b, done: true } : b)));
    }
  };

  // ----- progress views -----
  if (gatewayAvailable && (bstate.running || bstate.finished)) {
    const handled = bstate.sent + bstate.failed.length;
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <Header title="Sending" onBack={bstate.running ? undefined : () => { clearBroadcast(); nav.pop(); }} />
        <ScrollView contentContainerStyle={s.pad}>
          <Card>
            <Text style={{ color: p.text, fontSize: 28, fontWeight: '700' }}>
              {handled} / {bstate.total}
            </Text>
            <Note>
              {bstate.running
                ? `Sending to ${bstate.groupName}. Keep the app open and the phone unlocked.`
                : bstate.cancelled
                  ? `Stopped. ${bstate.sent} sent before you cancelled.`
                  : `Done. ${bstate.sent} sent${bstate.failed.length ? `, ${bstate.failed.length} failed` : ''}.`}
            </Note>
            <ProgressBar value={bstate.total ? handled / bstate.total : 0} />
          </Card>
          {bstate.failed.length ? (
            <Card>
              <Text style={{ color: p.danger, fontWeight: '700' }}>Failed</Text>
              {bstate.failed.map((f) => (
                <Note key={f.phone}>
                  {(f.name || formatPhone(f.phone)) + ': ' + f.error}
                </Note>
              ))}
            </Card>
          ) : null}
          {bstate.running ? (
            <Button label="Stop sending" kind="danger" onPress={cancelBroadcast} />
          ) : (
            <Button label="Done" onPress={() => { clearBroadcast(); nav.pop(); }} />
          )}
        </ScrollView>
      </View>
    );
  }

  if (batches) {
    const remaining = batches.filter((b) => !b.done).length;
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <Header title="Send batches" onBack={() => setBatches(null)} />
        <ScrollView contentContainerStyle={s.pad}>
          <Note>
            Tap each batch to open Messages, then tap Send.{' '}
            {settings.iosBatchSize > 1
              ? 'People in the same batch see each other’s numbers and replies.'
              : 'Each person gets a private text.'}
          </Note>
          {batches.map((b, i) => (
            <Button
              key={i}
              kind={b.done ? 'secondary' : 'primary'}
              label={`${b.done ? '✓ ' : ''}Batch ${i + 1} · ${b.phones.length} ${b.phones.length === 1 ? 'person' : 'people'}`}
              onPress={() => openBatch(i)}
            />
          ))}
          {remaining === 0 ? <Button label="All sent — done" kind="secondary" onPress={nav.pop} /> : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={`Message ${group.name}`} onBack={nav.pop} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Field
          label="Announcement"
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
          style={{ minHeight: 160, textAlignVertical: 'top' }}
          placeholder="Saturday’s meetup moves to 9:00 because of the forecast."
        />
        <Note>
          {info.chars} characters · {info.segments} text{info.segments === 1 ? '' : 's'} per person
          {info.unicode ? ' (emoji or special characters shorten each text to 70 characters)' : ''}
          {settings.appendOptOut ? ' · includes "Reply STOP to opt out"' : ''}
        </Note>
        <Note>
          Going to {recipients.length} {recipients.length === 1 ? 'person' : 'people'}
          {gatewayAvailable ? ', each as a private text from this phone.' : '.'}
        </Note>
        <Button
          label={gatewayAvailable ? `Send to ${recipients.length}` : 'Prepare batches'}
          disabled={!body.trim() || recipients.length === 0}
          onPress={gatewayAvailable ? sendAndroid : startIos}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProgressBar({ value }: { value: number }) {
  const p = usePalette();
  const pct = useMemo(() => `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const, [value]);
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: p.border, overflow: 'hidden' }}>
      <View style={{ height: 8, width: pct, backgroundColor: p.accent }} />
    </View>
  );
}
