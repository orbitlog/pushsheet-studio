const names = new Map([
  ['english', 'en'],
  ['英文', 'en'],
  ['英语', 'en'],
  ['spanish', 'es'],
  ['español', 'es'],
  ['西语', 'es'],
  ['西班牙文', 'es'],
  ['西班牙语', 'es'],
  ['french', 'fr'],
  ['français', 'fr'],
  ['法文', 'fr'],
  ['法语', 'fr'],
  ['german', 'de'],
  ['deutsch', 'de'],
  ['德语', 'de'],
  ['portuguese', 'pt'],
  ['português', 'pt'],
  ['葡语', 'pt'],
  ['italian', 'it'],
  ['italiano', 'it'],
  ['意大利语', 'it'],
  ['japanese', 'ja'],
  ['日本語', 'ja'],
  ['日语', 'ja'],
  ['korean', 'ko'],
  ['한국어', 'ko'],
  ['韩语', 'ko'],
  ['chinese', 'zh'],
  ['中文', 'zh'],
  ['简体中文', 'zh_CN'],
  ['繁體中文', 'zh_TW'],
]);

const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

export function languageMarker(text: string): string | undefined {
  const label = text
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/[:：]\s*$/, '');
  const code = names.get(label.toLowerCase()) ?? label;
  const parts = /^([a-z]{2,3})(?:[-_]([a-z]{4}))?(?:[-_]([a-z]{2}|\d{3}))?$/i.exec(code);
  if (!parts) return;
  const [, language, script, region] = parts;
  const normalized = language.toLowerCase();
  if (!languageNames.of(normalized) || ['und', 'mul', 'zxx'].includes(normalized)) return;
  return [
    normalized,
    script && script[0].toUpperCase() + script.slice(1).toLowerCase(),
    region?.toUpperCase(),
  ]
    .filter(Boolean)
    .join('_');
}

export function matchingLocales(source: string, headers: Record<string, number>): string[] {
  if (Object.hasOwn(headers, source)) return [source];
  const [base] = source.split('_');
  if (source !== base) return Object.hasOwn(headers, base) ? [base] : [];
  return Object.keys(headers).filter((locale) => locale.startsWith(base + '_'));
}
