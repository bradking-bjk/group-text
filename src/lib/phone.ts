/**
 * Normalizes phone numbers to +<country><number>. Keep in sync with the Android
 * module's Phone.kt so numbers from the receiver match numbers typed by admins.
 */
export function normalizePhone(raw: string, defaultCountryCode = '1'): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  const cc = defaultCountryCode.replace(/\D/g, '') || '1';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (cc === '1' && digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length <= 6) return digits; // short codes
  if (digits.startsWith('0')) return `+${cc}${digits.slice(1)}`;
  if (digits.length <= 10) return `+${cc}${digits}`;
  return `+${digits}`;
}

export function isPlausiblePhone(normalized: string): boolean {
  if (normalized.startsWith('+1')) return /^\+1\d{10}$/.test(normalized); // US/Canada: exactly 10 digits
  return /^\+\d{8,15}$/.test(normalized);
}

/** Pretty-prints US numbers; leaves others as-is. */
export function formatPhone(normalized: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(normalized);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : normalized;
}

/**
 * Parses pasted member lists. Accepts one person per line in any of these forms:
 *   Jane Doe, 505-555-1234
 *   505-555-1234 Jane Doe
 *   5055551234
 */
export function parseMemberList(text: string, cc: string): { name: string; phone: string }[] {
  const out: { name: string; phone: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const match = /(\+?[\d][\d\s().-]{6,}\d)/.exec(l);
    if (!match) continue;
    const phone = normalizePhone(match[1], cc);
    if (!isPlausiblePhone(phone)) continue;
    const name = (l.slice(0, match.index) + ' ' + l.slice(match.index + match[1].length))
      .replace(/[,;\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ name, phone });
  }
  return out;
}
