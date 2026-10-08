// GSM 03.38 basic + extension characters. Anything else forces UCS-2 (70 chars/segment).
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';

export function segmentInfo(text: string): { chars: number; segments: number; unicode: boolean } {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXT.includes(ch)) units += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const len = Array.from(text).reduce((n, c) => n + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    return { chars: len, segments: len === 0 ? 0 : len <= 70 ? 1 : Math.ceil(len / 67), unicode };
  }
  return { chars: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153), unicode };
}

export const OPT_OUT_FOOTER = '\nReply STOP to opt out';

export function withFooter(body: string, append: boolean): string {
  return append && !/reply stop/i.test(body) ? body.trimEnd() + OPT_OUT_FOOTER : body;
}
