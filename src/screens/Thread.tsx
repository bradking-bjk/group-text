import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { sendSingle } from '../lib/broadcast';
import * as db from '../lib/db';
import { formatPhone } from '../lib/phone';
import { notifyDataChanged, useData } from '../lib/useData';
import { useNav } from '../nav';
import { Button, Card, Header, Note, usePalette } from '../ui/kit';

export function ThreadScreen({ phone }: { phone: string }) {
  const p = usePalette();
  const nav = useNav();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const { data, reload } = useData(
    async () => ({
      member: await db.findMember(phone),
      messages: await db.listThread(phone),
      groups: await db.listGroups(),
    }),
    [phone],
  );

  useEffect(() => {
    db.markThreadRead(phone).then(notifyDataChanged);
  }, [phone, data?.messages.length]);

  if (!data) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  const { member, messages, groups } = data;

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    if (member?.optedOut) return Alert.alert('Opted out', 'This person texted STOP. They must text START before you can message them.');
    setSending(true);
    try {
      await sendSingle(phone, text);
      setDraft('');
    } catch (e) {
      Alert.alert('Not sent', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
      reload();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={member?.name || formatPhone(phone)}
        onBack={nav.pop}
        right={groups.length ? <Button label="Add to group" kind="secondary" onPress={() => setPicking(true)} /> : null}
      />
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        {member?.optedOut ? <Note tone="danger">This person has opted out of texts.</Note> : null}
        {messages.map((m) => {
          const out = m.direction === 'out';
          return (
            <View key={m.id} style={{ alignItems: out ? 'flex-end' : 'flex-start' }}>
              <View
                style={{
                  maxWidth: '82%',
                  backgroundColor: out ? p.bubbleOut : p.bubbleIn,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: out ? '#FFFFFF' : p.text, fontSize: 16 }}>{m.body}</Text>
              </View>
              <Text style={{ color: p.muted, fontSize: 12, marginTop: 2 }}>
                {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {out ? ` · ${statusLabel(m.status, m.groupId)}` : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderColor: p.border, backgroundColor: p.surface }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply privately…"
          placeholderTextColor={p.muted}
          multiline
          style={{
            flex: 1,
            color: p.text,
            borderWidth: 1,
            borderColor: p.border,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 8,
            fontSize: 16,
            maxHeight: 120,
          }}
        />
        <Button label="Send" onPress={send} busy={sending} disabled={!draft.trim()} />
      </View>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Card>
            <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>Add {formatPhone(phone)} to…</Text>
            {groups.map((g) => (
              <Button
                key={g.id}
                kind="secondary"
                label={g.name}
                onPress={async () => {
                  setPicking(false);
                  await db.upsertMemberInGroup(g.id, phone, '');
                  notifyDataChanged();
                  Alert.alert('Added', `Added to ${g.name}.`);
                }}
              />
            ))}
            <Button label="Cancel" kind="secondary" onPress={() => setPicking(false)} />
          </Card>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function statusLabel(status: string, groupId: number | null) {
  const prefix = groupId ? 'Announcement · ' : '';
  switch (status) {
    case 'sent':
      return prefix + 'Sent';
    case 'failed':
      return prefix + 'Failed';
    case 'pending':
      return prefix + 'Sending…';
    case 'auto':
      return 'Automatic reply';
    case 'handed_off':
      return prefix + 'Sent via Messages';
    default:
      return prefix + status;
  }
}
