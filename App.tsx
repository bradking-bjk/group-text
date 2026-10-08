import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { gatewayAvailable, SmsGateway } from './modules/sms-gateway';
import { requestSmsPermissions } from './src/lib/permissions';
import { importInbox, pushConfig } from './src/lib/sync';
import { notifyDataChanged } from './src/lib/useData';
import { NavProvider, useNav } from './src/nav';
import { ComposeScreen } from './src/screens/Compose';
import { AddMembersScreen, EditGroupScreen, GroupScreen } from './src/screens/Group';
import { HomeScreen } from './src/screens/Home';
import { ThreadScreen } from './src/screens/Thread';
import { usePalette } from './src/ui/kit';

export default function App() {
  useInboxSync();
  return (
    <SafeAreaProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const p = usePalette();
  const { route } = useNav();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.surface }} edges={['top', 'bottom']}>
      <StatusBar style="auto" />
      {route.name === 'home' ? (
        <HomeScreen initialTab={route.tab} />
      ) : route.name === 'group' ? (
        <GroupScreen groupId={route.groupId} />
      ) : route.name === 'editGroup' ? (
        <EditGroupScreen groupId={route.groupId} />
      ) : route.name === 'addMembers' ? (
        <AddMembersScreen groupId={route.groupId} />
      ) : route.name === 'compose' ? (
        <ComposeScreen groupId={route.groupId} />
      ) : (
        <ThreadScreen phone={route.phone} />
      )}
    </SafeAreaView>
  );
}

/** On Android, import texts the background receiver queued: at launch, on resume, and live. */
function useInboxSync() {
  useEffect(() => {
    if (!gatewayAvailable) return;
    const sync = () =>
      importInbox()
        .then((n) => n > 0 && notifyDataChanged())
        .catch((e) => console.warn('Inbox import failed', e));

    requestSmsPermissions()
      .catch(() => false)
      .then(() => pushConfig())
      .then(() => notifyDataChanged())
      .catch((e) => console.warn('Startup sync failed', e));

    const live = SmsGateway.onInbox(sync);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && sync());
    return () => {
      live?.remove();
      appState.remove();
    };
  }, []);
}
