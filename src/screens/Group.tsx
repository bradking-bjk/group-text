import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { gatewayAvailable } from '../../modules/sms-gateway';
import * as db from '../lib/db';
import { formatPhone, isPlausiblePhone, normalizePhone, parseMemberList } from '../lib/phone';
import { pushConfig } from '../lib/sync';
import { notifyDataChanged, useData } from '../lib/useData';
import { useNav } from '../nav';
import { Badge, Button, Card, Empty, Field, Header, Note, Row, s, usePalette } from '../ui/kit';

export function GroupScreen({ groupId }: { groupId: number }) {
  const p = usePalette();
  const nav = useNav();
  const [renaming, setRenaming] = useState<db.Member | null>(null);
  const [selected, setSelected] = useState<db.Member | null>(null);
  const [newName, setNewName] = useState('');
  useEffect(() => setNewName(renaming?.name ?? ''), [renaming]);
  const { data } = useData(
    async () => ({
      group: await db.getGroup(groupId),
      members: await db.listGroupMembers(groupId),
      settings: await db.getSettings(),
    }),
    [groupId],
  );
  if (!data) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  const { group, members, settings } = data;
  if (!group) return <Empty title="Group not found" />;

  // Android alerts allow at most three buttons, so member actions use a small sheet instead.
  const actionsFor = (m: db.Member) => {
    const list: { label: string; danger?: boolean; run: () => void | Promise<void> }[] = [
      { label: 'Rename', run: () => setRenaming(m) },
    ];
    if (gatewayAvailable) list.push({ label: 'Message', run: () => nav.push({ name: 'thread', phone: m.phone }) });
    if (!m.optedOut) {
      list.push({
        label: 'Mark as opted out',
        run: async () => {
          await db.setOptedOut(m.phone, true);
          await pushConfig();
          notifyDataChanged();
        },
      });
    }
    list.push({
      label: 'Remove from group',
      danger: true,
      run: async () => {
        await db.removeFromGroup(groupId, m.id);
        notifyDataChanged();
      },
    });
    return list;
  };

  const active = members.filter((m) => !m.optedOut).length;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header
        title={group.name}
        onBack={nav.pop}
        right={<Button label="Edit" kind="secondary" onPress={() => nav.push({ name: 'editGroup', groupId })} />}
      />
      <ScrollView>
        <View style={s.pad}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              label="Send announcement"
              style={{ flex: 1 }}
              disabled={active === 0}
              onPress={() => nav.push({ name: 'compose', groupId })}
            />
            <Button label="Add people" kind="secondary" onPress={() => nav.push({ name: 'addMembers', groupId })} />
          </View>
          {gatewayAvailable ? (
            <Note>
              People can join by texting "{settings.joinKeyword || 'JOIN'} {group.code} Their Name" to this phone's number.
            </Note>
          ) : null}
          <Text style={{ color: p.muted, fontWeight: '600' }}>
            {active} receiving{members.length > active ? ` · ${members.length - active} opted out` : ''}
          </Text>
        </View>
        {members.length === 0 ? <Empty title="No members yet" body="Add people by phone number, or paste a list." /> : null}
        {members.map((m) => (
          <Row
            key={m.id}
            title={m.name || formatPhone(m.phone)}
            subtitle={m.name ? formatPhone(m.phone) : undefined}
            dim={!!m.optedOut}
            right={m.optedOut ? <Badge text="Opted out" tone="muted" /> : null}
            onPress={() => setSelected(m)}
          />
        ))}
      </ScrollView>
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Card>
            {selected ? (
              <>
                <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{selected.name || formatPhone(selected.phone)}</Text>
                {selected.name ? <Note>{formatPhone(selected.phone)}</Note> : null}
                {selected.optedOut ? (
                  <Note>Opted out. They'll receive texts again only after texting START or JOIN to your number.</Note>
                ) : null}
                {actionsFor(selected).map((a) => (
                  <Button
                    key={a.label}
                    label={a.label}
                    kind={a.danger ? 'danger' : 'secondary'}
                    onPress={() => {
                      setSelected(null);
                      void a.run();
                    }}
                  />
                ))}
              </>
            ) : null}
            <Button label="Close" kind="secondary" onPress={() => setSelected(null)} />
          </Card>
        </View>
      </Modal>
      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Card>
            <Field label="Name" value={newName} onChangeText={setNewName} autoFocus />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => setRenaming(null)} />
              <Button
                label="Save"
                style={{ flex: 1 }}
                onPress={async () => {
                  if (renaming) await db.renameMember(renaming.id, newName);
                  setRenaming(null);
                  notifyDataChanged();
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

export function EditGroupScreen({ groupId }: { groupId?: number }) {
  const p = usePalette();
  const nav = useNav();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (groupId) {
      db.getGroup(groupId).then((g) => {
        if (g) {
          setName(g.name);
          setCode(g.code);
          setCodeTouched(true);
        }
      });
    }
  }, [groupId]);

  const save = async () => {
    const n = name.trim();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!n || !c) return Alert.alert('Name and code are required');
    setBusy(true);
    try {
      if (groupId) {
        await db.updateGroup(groupId, n, c);
        await pushConfig();
        nav.pop();
      } else {
        const id = await db.createGroup(n, c);
        await pushConfig();
        nav.replace({ name: 'group', groupId: id });
      }
    } catch (e) {
      Alert.alert('Could not save', /UNIQUE/i.test(String(e)) ? 'Another group already uses that code.' : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete group?', 'Members stay in your other groups. Message history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await db.deleteGroup(groupId!);
          await pushConfig();
          nav.reset({ name: 'home', tab: 'groups' });
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={groupId ? 'Edit group' : 'New group'} onBack={nav.pop} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Field
          label="Group name"
          value={name}
          autoFocus={!groupId}
          onChangeText={(v) => {
            setName(v);
            if (!codeTouched) setCode(db.makeCode(v));
          }}
          placeholder="e.g. Tuesday Night League"
        />
        <Field
          label="Group code"
          value={code}
          autoCapitalize="characters"
          onChangeText={(v) => {
            setCodeTouched(true);
            setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''));
          }}
          hint={gatewayAvailable ? 'Short word members text to join, e.g. "JOIN TUESDAY".' : 'Short identifier for this group.'}
        />
        <Button label="Save" onPress={save} busy={busy} />
        {groupId ? <Button label="Delete group" kind="danger" onPress={remove} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AddMembersScreen({ groupId }: { groupId: number }) {
  const p = usePalette();
  const nav = useNav();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: settings } = useData(() => db.getSettings());
  const cc = settings?.defaultCountryCode ?? '1';

  const addOne = async () => {
    const n = normalizePhone(phone, cc);
    if (!isPlausiblePhone(n)) return Alert.alert('Check the number', 'That doesn’t look like a valid phone number.');
    setBusy(true);
    try {
      const existing = await db.findMember(n);
      await db.upsertMemberInGroup(groupId, n, name);
      setName('');
      setPhone('');
      notifyDataChanged();
      if (existing?.optedOut) {
        Alert.alert(
          'This person opted out',
          'They were added to the group but won’t receive texts until they text START (or JOIN) to your number.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const parsed = bulk ? parseMemberList(bulk, cc) : [];
  const addBulk = async () => {
    setBusy(true);
    try {
      for (const m of parsed) await db.upsertMemberInGroup(groupId, m.phone, m.name);
      notifyDataChanged();
      Alert.alert('Added', `${parsed.length} people added.`);
      nav.pop();
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Add people" onBack={nav.pop} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Note>Only add people who have agreed to get texts from your group.</Note>
        <Card>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Jane Doe" />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(505) 555-1234" />
          <Button label="Add" onPress={addOne} busy={busy} disabled={!phone.trim()} />
        </Card>
        <Card>
          <Field
            label="Or paste a list"
            value={bulk}
            onChangeText={setBulk}
            multiline
            style={{ minHeight: 140, textAlignVertical: 'top' }}
            placeholder={'Jane Doe, 505-555-1234\nSam Lee 505 555 9876\n5055550000'}
            hint="One person per line. Names are optional. Re-adding a number updates its name."
          />
          <Button
            label={parsed.length ? `Add ${parsed.length} people` : 'Add list'}
            onPress={addBulk}
            busy={busy}
            disabled={parsed.length === 0}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
