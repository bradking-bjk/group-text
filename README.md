# Group Text

A simple, open-source app for running text-message groups from your own phone.
**Members don't install anything** — they just get ordinary texts, reply like normal,
and can join or leave by texting a keyword.

Built for clubs, leagues, volunteer crews, churches and neighborhood groups of up to
about 100 people. No server, no subscription, no per-message fees beyond your phone plan.

## How it works

```
 Admin's phone (this app)                       Members (any phone, no app)
 ┌─────────────────────────┐   private texts    ┌──────────────┐
 │ Groups & members        │ ─────────────────▶ │  Jane        │
 │ Announcements           │                    │  Sam         │
 │ Inbox of replies        │ ◀───────────────── │  Priya ...   │
 │ JOIN / STOP / HELP bot  │   replies, JOIN,   └──────────────┘
 └─────────────────────────┘   STOP, HELP
```

Texts go out through the admin's own SIM card and phone number. On Android every member
gets their **own private text**, so replies come back only to the admin, never to the
whole group.

## What works on each platform

| | Android | iPhone |
|---|---|---|
| Groups, members, paste-in member lists | ✅ | ✅ |
| Send announcements | ✅ Automatic, one private text per member | ⚠️ Tap Send for each batch (iOS doesn't let apps send texts on their own) |
| Replies inbox, reply privately | ✅ | ❌ Replies go to the Messages app |
| Members join by texting `JOIN CODE Name` | ✅ | ❌ |
| Automatic STOP / START / HELP handling | ✅ | ❌ Mark people opted out by hand |

Apple doesn't allow any app to read incoming texts or send texts without the user tapping
Send, so the iPhone version is a "lite" admin tool. For the full experience, run the admin
side on an Android phone (an inexpensive one with a prepaid SIM works fine as a dedicated
group-text phone).

On iPhone, people in the same batch see each other's numbers and replies (it's a group
message). Set **People per batch** to 1 in Settings to send privately, one at a time.

## Telling members how it works

Give members your number and the group code, for example:

> Text **JOIN TUESDAY Your Name** to (505) 555-0100 to get league updates.
> Reply **STOP** any time to unsubscribe, **HELP** for info.

| Member texts | What happens |
|---|---|
| `JOIN CODE Jane Doe` | Added to that group with the name given; gets a welcome reply. If you only have one group, `JOIN Jane Doe` works. |
| `STOP` (also STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT) | Removed from **all** groups' sends and gets one confirmation. The app refuses to text them again. |
| `START` / `UNSTOP` | Opted back in. |
| `HELP` / `INFO` | Gets a reply naming your organization and how to opt out. |
| Anything else | Shows up in the Inbox for you to read and answer. |

STOP, START and HELP only count when they're the entire message, so "stop by the
clubhouse at 5" is treated as a normal reply. Keywords are handled instantly even when the
app is closed.

## Building and installing

You'll need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone <your fork of this repo>
cd group-text
npm install
```

This app includes custom native code, so it can't run in Expo Go. Build it one of two ways.

**Option A — build in the cloud with EAS (no Android Studio or Xcode needed)**

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview   # gives you an APK to install
npx eas-cli@latest build -p ios                          # needs an Apple Developer account
```

Install the Android APK by opening the download link on the admin's phone (allow
"install unknown apps" when prompted).

**Option B — build locally**

```bash
npx expo run:android   # Android Studio + a phone with USB debugging, or an emulator
npx expo run:ios       # macOS with Xcode
```

Before publishing your own build, change `android.package` and `ios.bundleIdentifier` in
`app.json` from `org.example.grouptext` to an identifier you own.

### First run on Android

1. Allow the SMS permissions when asked (Settings → Text permissions if you skipped it).
2. In **Settings**, enter your organization's name. It appears in automatic replies.
3. Create a group, pick a short code, and add people or share the JOIN instructions.

### About Google Play

Google Play only allows apps to send and read SMS if they're the phone's default texting
app, so this app isn't suitable for the Play Store as-is. Distribute it as an APK through
GitHub Releases or F-Droid, which have no such restriction. The iPhone version can go
through the App Store or TestFlight normally.

## Sending responsibly

Texting from a personal number works well for groups that know you, but carriers watch for
anything that looks like bulk marketing.

- **Only add people who agreed to get texts**, and keep the "Reply STOP to opt out" footer on.
- **Leave a few seconds between texts.** The default is 4 seconds, so 100 members take
  about 7 minutes. Keep the app open and the phone unlocked while it sends.
- **Keep it to group business.** Promotional or commercial texting to lists of people falls
  under rules like the US TCPA and carrier A2P 10DLC registration, which this app isn't
  designed for. If you outgrow it, switch to a registered SMS provider such as Twilio.

This isn't legal advice; check what applies to your group.

## Limitations

- The app must stay open while an announcement is sending.
- Picture messages (MMS) aren't captured in the Inbox. They still arrive in your Messages app.
- Some carriers deliver long texts as MMS; those also won't appear in the Inbox.
- Replies show up in both this app and your phone's normal Messages app.
- Data lives only on the admin's phone. There's no sync between admins yet.

## Project layout

```
App.tsx                         App shell, startup sync
src/
  nav.tsx                       Tiny stack navigator
  lib/db.ts                     SQLite schema and queries (groups, members, messages, settings)
  lib/sync.ts                   Imports texts from the Android receiver; pushes config to it
  lib/broadcast.ts              Throttled send engine (Android)
  lib/phone.ts                  Number normalization and pasted-list parsing
  lib/sms.ts                    Segment counter, opt-out footer
  screens/                      Home (groups/inbox/settings), Group, Compose, Thread
  ui/kit.tsx                    Shared components and light/dark palette
modules/sms-gateway/            Local Expo module (Android only)
  android/.../SmsGatewayModule.kt   JS API: send with carrier status, inbox queue, config
  android/.../SmsReceiver.kt        Receives texts in the background
  android/.../Keywords.kt           JOIN / STOP / START / HELP logic
  android/.../SmsSender.kt          SmsManager wrapper, multipart texts, dual-SIM replies
  android/.../GatewayStore.kt       Opt-out list, inbox queue, config (SharedPreferences)
  android/.../Phone.kt              Number normalization (mirrors src/lib/phone.ts)
```

## Ideas for contributors

- Import members from the phone's contacts (`expo-contacts`)
- Scheduled announcements
- CSV export and import of members
- Foreground service so sends continue with the screen off
- Optional Twilio backend for bigger groups and full iPhone support

## License

MIT
