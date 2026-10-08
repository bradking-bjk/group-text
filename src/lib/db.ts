import * as SQLite from 'expo-sqlite';

export type Group = { id: number; name: string; code: string; memberCount: number; activeCount: number };
export type Member = { id: number; phone: string; name: string; optedOut: number; createdAt: number };
export type Message = {
  id: number;
  phone: string;
  direction: 'in' | 'out';
  body: string;
  status: string; // in: received | out: sent, failed, pending, handed_off
  groupId: number | null;
  createdAt: number;
  read: number;
};
export type Thread = { phone: string; name: string | null; lastBody: string; lastAt: number; unread: number; direction: 'in' | 'out' };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open() {
  const db = await SQLite.openDatabaseAsync('groupsms.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      opted_out INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      group_id INTEGER,
      created_at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone, created_at);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

// ---------- settings ----------

export type Settings = {
  orgName: string;
  defaultCountryCode: string;
  joinKeyword: string;
  autoReply: boolean;
  appendOptOut: boolean;
  sendDelaySeconds: number;
  iosBatchSize: number;
  joinReply: string;
  stopReply: string;
  helpReply: string;
};

export const DEFAULT_SETTINGS: Settings = {
  orgName: '',
  defaultCountryCode: '1',
  joinKeyword: 'JOIN',
  autoReply: true,
  appendOptOut: true,
  sendDelaySeconds: 4,
  iosBatchSize: 20,
  joinReply: '',
  stopReply: '',
  helpReply: '',
};

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in s) {
      try {
        (s as Record<string, unknown>)[r.key] = JSON.parse(r.value);
      } catch {
        // ignore malformed value
      }
    }
  }
  return s;
}

export async function saveSettings(s: Settings) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const [k, v] of Object.entries(s)) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));
    }
  });
}

// ---------- groups ----------

export async function listGroups(): Promise<Group[]> {
  const db = await getDb();
  return db.getAllAsync<Group>(`
    SELECT g.id, g.name, g.code,
      COUNT(gm.member_id) AS memberCount,
      COALESCE(SUM(CASE WHEN m.opted_out = 0 THEN 1 ELSE 0 END), 0) AS activeCount
    FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id
    LEFT JOIN members m ON m.id = gm.member_id
    GROUP BY g.id ORDER BY g.name COLLATE NOCASE`);
}

export async function getGroup(id: number): Promise<Group | null> {
  return (await listGroups()).find((g) => g.id === id) ?? null;
}

export function makeCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return base || 'GROUP';
}

export async function createGroup(name: string, code: string): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync(
    'INSERT INTO groups (name, code, created_at) VALUES (?, ?, ?)',
    name.trim(),
    code.trim().toUpperCase(),
    Date.now(),
  );
  return r.lastInsertRowId;
}

export async function updateGroup(id: number, name: string, code: string) {
  const db = await getDb();
  await db.runAsync('UPDATE groups SET name = ?, code = ? WHERE id = ?', name.trim(), code.trim().toUpperCase(), id);
}

export async function deleteGroup(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM groups WHERE id = ?', id);
}

// ---------- members ----------

export async function listGroupMembers(groupId: number): Promise<Member[]> {
  const db = await getDb();
  return db.getAllAsync<Member>(
    `SELECT m.id, m.phone, m.name, m.opted_out AS optedOut, m.created_at AS createdAt
     FROM members m JOIN group_members gm ON gm.member_id = m.id
     WHERE gm.group_id = ? ORDER BY m.opted_out, m.name COLLATE NOCASE, m.phone`,
    groupId,
  );
}

export async function findMember(phone: string): Promise<Member | null> {
  const db = await getDb();
  return db.getFirstAsync<Member>(
    'SELECT id, phone, name, opted_out AS optedOut, created_at AS createdAt FROM members WHERE phone = ?',
    phone,
  );
}

/** Creates the member if new (keeping an existing name unless one is given) and adds them to the group. */
export async function upsertMemberInGroup(groupId: number, phone: string, name: string): Promise<number> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO members (phone, name, created_at) VALUES (?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE members.name END`,
    phone,
    name.trim(),
    Date.now(),
  );
  const m = await findMember(phone);
  if (!m) throw new Error('Could not save member');
  await db.runAsync('INSERT OR IGNORE INTO group_members (group_id, member_id) VALUES (?, ?)', groupId, m.id);
  return m.id;
}

export async function renameMember(id: number, name: string) {
  const db = await getDb();
  await db.runAsync('UPDATE members SET name = ? WHERE id = ?', name.trim(), id);
}

export async function removeFromGroup(groupId: number, memberId: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM group_members WHERE group_id = ? AND member_id = ?', groupId, memberId);
}

export async function setOptedOut(phone: string, optedOut: boolean) {
  const db = await getDb();
  await db.runAsync('UPDATE members SET opted_out = ? WHERE phone = ?', optedOut ? 1 : 0, phone);
}

export async function listOptedOutPhones(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ phone: string }>('SELECT phone FROM members WHERE opted_out = 1');
  return rows.map((r) => r.phone);
}

/** Members of the group who can receive texts (not opted out). */
export async function activeRecipients(groupId: number): Promise<Member[]> {
  return (await listGroupMembers(groupId)).filter((m) => !m.optedOut);
}

// ---------- messages ----------

export async function addMessage(m: Omit<Message, 'id'>): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync(
    'INSERT INTO messages (phone, direction, body, status, group_id, created_at, read) VALUES (?, ?, ?, ?, ?, ?, ?)',
    m.phone,
    m.direction,
    m.body,
    m.status,
    m.groupId,
    m.createdAt,
    m.read,
  );
  return r.lastInsertRowId;
}

export async function setMessageStatus(id: number, status: string) {
  const db = await getDb();
  await db.runAsync('UPDATE messages SET status = ? WHERE id = ?', status, id);
}

export async function listThreads(): Promise<Thread[]> {
  const db = await getDb();
  return db.getAllAsync<Thread>(`
    SELECT t.phone, mem.name AS name, msg.body AS lastBody, msg.created_at AS lastAt, msg.direction AS direction,
      (SELECT COUNT(*) FROM messages u WHERE u.phone = t.phone AND u.read = 0) AS unread
    FROM (SELECT phone, MAX(id) AS last_id FROM messages
          WHERE phone IN (SELECT DISTINCT phone FROM messages WHERE direction = 'in')
          GROUP BY phone) t
    JOIN messages msg ON msg.id = t.last_id
    LEFT JOIN members mem ON mem.phone = t.phone
    ORDER BY msg.created_at DESC`);
}

export async function listThread(phone: string): Promise<Message[]> {
  const db = await getDb();
  return db.getAllAsync<Message>(
    `SELECT id, phone, direction, body, status, group_id AS groupId, created_at AS createdAt, read
     FROM messages WHERE phone = ? ORDER BY created_at, id`,
    phone,
  );
}

export async function markThreadRead(phone: string) {
  const db = await getDb();
  await db.runAsync('UPDATE messages SET read = 1 WHERE phone = ? AND read = 0', phone);
}

export async function unreadCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE read = 0');
  return r?.n ?? 0;
}
