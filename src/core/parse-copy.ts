import type { CopyItem } from '../types';

export type CopyResult = { items: CopyItem[]; warnings: string[] };

export function parseCopy(input: string): CopyResult {
  const items: CopyItem[] = [];
  const warnings: string[] = [];
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
      warnings.push('存在未识别的文本，请使用「主： / 副：」或「title: / subTitle:」标签。');
    }
  }
  return { items, warnings: [...new Set(warnings)] };
}
