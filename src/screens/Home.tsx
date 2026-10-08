import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { gatewayAvailable } from '../../modules/sms-gateway';
import { getBroadcastState, subscribeBroadcast, type BroadcastState } from '../lib/broadcast';
import * as db from '../lib/db';
import { useData } from '../lib/useData';
import { useNav } from '../nav';
import { Badge, Button, Empty, Header, Note, Row, s, usePalette } from '../ui/kit';
import { formatPhone } from '../lib/phone';
import { SettingsTab } from './Settings';

type Tab = 'groups' | 'inbox' | 'settings';

export function HomeScreen({ initialTab }: { initialTab?: Tab }) {
  const p = usePalette();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'groups');
  const { data: unread } = useData(() => db.unreadCount());
  const tabs: { key: Tab; label: string }[] = [
    { key: 'groups', label: 'Groups' },
    { key: 'inbox', label: unread ? `Inbox (${unread})` : 'Inbox' },
    { key: 'settings', label: 'Settings' },
  ];
  return (
    <View style={{ flex: 1 }}>
      <BroadcastBanner />
      <View style={{ flex: 1 }}>
        {tab === 'groups' ? <GroupsTab /> : tab === 'inbox' ? <InboxTab /> : <SettingsTab />}
      </View>
      <View style={[styles.tabBar, { borderColor: p.border, backgroundColor: p.surface }]}>
        {tabs.map((t) => (
          <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)} accessibilityRole="tab">
            <Text style={[styles.tabText, { color: tab === t.key ? p.accent : p.muted }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function BroadcastBanner() {
  const p = usePalette();
  const [b, setB] = useState<BroadcastState>(getBroadcastState());
  useEffect(() => subscribeBroadcast(setB), []);
  if (!b.running) return null;
  return (
    <View style={{ backgroundColor: p.accent, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text style={{ color: p.accentText, fontWeight: '600' }}>
        Sending to {b.groupName}: {b.sent + b.failed.length} of {b.total}. Keep the app open.
      </Text>
    </View>
  );
}

function GroupsTab() {
  const p = usePalette();
  const nav = useNav();
  const { data: groups } = useData(() => db.listGroups());
  const { data: settings } = useData(() => db.getSettings());
  const keyword = settings?.joinKeyword || 'JOIN';
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header title="Groups" right={<Button label="+ New" kind="secondary" onPress={() => nav.push({ name: 'editGroup' })} />} />
      <ScrollView>
        {groups && groups.length === 0 ? (
          <Empty
            title="No groups yet"
            body="Create a group, add members by phone number, then send announcements. Members don't need the app — they just get texts."
          />
        ) : null}
        {groups?.map((g) => (
          <Row
            key={g.id}
            title={g.name}
            subtitle={
              `${g.activeCount} receiving` +
              (g.memberCount > g.activeCount ? ` · ${g.memberCount - g.activeCount} opted out` : '') +
              (gatewayAvailable ? ` · Join: text ${keyword} ${g.code}` : '')
            }
            right={<Text style={{ color: p.muted, fontSize: 20 }}>›</Text>}
            onPress={() => nav.push({ name: 'group', groupId: g.id })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function InboxTab() {
  const p = usePalette();
  const nav = useNav();
  const { data: threads } = useData(() => (gatewayAvailable ? db.listThreads() : Promise.resolve([])));
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header title="Inbox" />
      {!gatewayAvailable ? (
        <View style={s.pad}>
          <Empty
            title="Replies aren't available on iPhone"
            body="iOS doesn't let apps read incoming texts. Members' replies arrive in your Messages app as usual. Run this app on an Android phone to see replies here and handle JOIN/STOP automatically."
          />
        </View>
      ) : (
        <ScrollView>
          {threads && threads.length === 0 ? (
            <Empty title="No replies yet" body="When members text your number, their messages show up here." />
          ) : null}
          {threads?.map((t) => (
            <Row
              key={t.phone}
              title={t.name || formatPhone(t.phone)}
              subtitle={(t.direction === 'out' ? 'You: ' : '') + t.lastBody}
              right={t.unread ? <Badge text={String(t.unread)} /> : null}
              onPress={() => nav.push({ name: 'thread', phone: t.phone })}
            />
          ))}
          {threads && threads.length > 0 ? (
            <View style={s.pad}>
              <Note>These texts also appear in your phone's Messages app. JOIN, STOP and HELP are answered automatically.</Note>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { fontSize: 15, fontWeight: '600' },
});
