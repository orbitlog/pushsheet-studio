import type { CopyItem } from '../types';

export function parseCopy(input: string): CopyItem[] {
  if (!input.trim()) return [];
  const items: CopyItem[] = [];
  let active: CopyItem | undefined;
  let field: keyof CopyItem | undefined;
  const seen = new Set<keyof CopyItem>();
  // Do not trim payloads: spaces, tabs, variation selectors and line breaks are copy.
  const lines = input.split(/(\r\n|\r|\n)/);
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    const match = line.match(
      /^\s*(?:(\d+)\s*[.．、)）]\s*)?(主(?:标题)?|副(?:标题)?|title|subTitle)\s*[:：](.*)$/i,
    );
    if (match) {
      const nextField = /^(主|title)/i.test(match[2]) ? 'title' : 'subTitle';
      if (
        !active ||
        (nextField === 'title' && seen.has('title')) ||
        (nextField === 'subTitle' && seen.has('subTitle'))
      ) {
        active = { title: '', subTitle: '' };
        items.push(active);
        seen.clear();
      }
      field = nextField;
      seen.add(field);
      active[field] = match[3];
    } else if (active && field) {
      active[field] += `${lines[i - 1] ?? ''}${line}`;
    } else if (line.trim()) {
      // Without an opening label, keep the entire cell as plain text.
      return [{ title: input, subTitle: '' }];
    }
  }
  return items;
}
