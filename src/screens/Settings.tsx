import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { gatewayAvailable } from '../../modules/sms-gateway';
import * as db from '../lib/db';
import { hasSmsPermissions, requestSmsPermissions } from '../lib/permissions';
import { pushConfig } from '../lib/sync';
import { Button, Card, Field, Header, Note, s, usePalette } from '../ui/kit';

export function SettingsTab() {
  const p = usePalette();
  const [form, setForm] = useState<db.Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [perm, setPerm] = useState<boolean | null>(null);

  useEffect(() => {
    db.getSettings().then(setForm);
    hasSmsPermissions().then(setPerm);
  }, []);

  if (!form) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  const set = <K extends keyof db.Settings>(k: K, v: db.Settings[K]) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const clean: db.Settings = {
        ...form,
        joinKeyword: form.joinKeyword.trim().toUpperCase().replace(/\s+/g, '') || 'JOIN',
        defaultCountryCode: form.defaultCountryCode.replace(/\D/g, '') || '1',
        sendDelaySeconds: Math.min(60, Math.max(2, Number(form.sendDelaySeconds) || 4)),
        iosBatchSize: Math.min(30, Math.max(1, Number(form.iosBatchSize) || 20)),
      };
      await db.saveSettings(clean);
      await pushConfig();
      setForm(clean);
      Alert.alert('Saved');
    } catch (e) {
      Alert.alert('Could not save', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {gatewayAvailable ? (
          <Card>
            <Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>Text permissions</Text>
            <Note tone={perm === false ? 'danger' : 'muted'}>
              {perm
                ? 'Granted. The app can send texts and read replies.'
                : 'Needed to send texts from this phone and to read replies.'}
            </Note>
            {!perm ? <Button label="Grant permissions" onPress={async () => setPerm(await requestSmsPermissions())} /> : null}
          </Card>
        ) : null}

        <Field
          label="Organization name"
          value={form.orgName}
          onChangeText={(v) => set('orgName', v)}
          placeholder="e.g. Riverside Hiking Club"
          hint="Used in automatic replies so members know who is texting them."
        />
        <Field
          label="Default country code"
          value={form.defaultCountryCode}
          onChangeText={(v) => set('defaultCountryCode', v)}
          keyboardType="number-pad"
          hint="Applied to numbers entered without a + prefix. 1 = US/Canada."
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>Add "Reply STOP to opt out"</Text>
            <Note>Appended to announcements. Strongly recommended.</Note>
          </View>
          <Switch value={form.appendOptOut} onValueChange={(v) => set('appendOptOut', v)} />
        </View>

        {gatewayAvailable ? (
          <>
            <Field
              label="Seconds between texts"
              value={String(form.sendDelaySeconds)}
              onChangeText={(v) => set('sendDelaySeconds', Number(v.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              hint="Spacing texts out keeps your carrier from flagging the number as spam. 3–6 seconds is a good range."
            />
            <Field
              label="Join keyword"
              value={form.joinKeyword}
              onChangeText={(v) => set('joinKeyword', v)}
              autoCapitalize="characters"
              hint="Members text this word plus the group code (and optionally their name) to join."
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>Automatic keyword replies</Text>
                <Note>Confirm JOIN, STOP, START and HELP texts automatically.</Note>
              </View>
              <Switch value={form.autoReply} onValueChange={(v) => set('autoReply', v)} />
            </View>
            <Field
              label="Join reply (optional)"
              value={form.joinReply}
              onChangeText={(v) => set('joinReply', v)}
              multiline
              placeholder="You've joined {group} with {org}. Reply STOP to opt out, HELP for help."
              hint="Use {group} and {org} as placeholders. Leave blank for the default."
            />
            <Field
              label="STOP reply (optional)"
              value={form.stopReply}
              onChangeText={(v) => set('stopReply', v)}
              multiline
              placeholder="You've been unsubscribed from {org} texts and won't receive more. Reply START to rejoin."
            />
            <Field
              label="HELP reply (optional)"
              value={form.helpReply}
              onChangeText={(v) => set('helpReply', v)}
              multiline
              placeholder="{org} group texts. Contact the organizer with questions. Reply STOP to opt out."
            />
          </>
        ) : (
          <>
            <Field
              label="People per batch"
              value={String(form.iosBatchSize)}
              onChangeText={(v) => set('iosBatchSize', Number(v.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              hint="iPhone sends announcements as group messages you tap Send on. Recipients in a batch can see each other's numbers and replies. Set to 1 to send privately, one person at a time."
            />
            <Note>
              On iPhone, members can't join or opt out by text automatically. If someone replies STOP, mark them as opted
              out from the group screen.
            </Note>
          </>
        )}

        <Button label="Save settings" onPress={save} busy={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
