import type { TemplateInfo } from '../types';
import { languageMarker } from './locale';
import { readWorkbook } from './ooxml';

export async function inspectTemplate(bytes: Uint8Array): Promise<TemplateInfo> {
  const { sheets } = await readWorkbook(bytes);
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex((row) =>
      row.some((cell) => cell?.trim().toLowerCase() === 'texttype'),
    );
    if (headerIndex === -1) continue;

    const headers = sheet.rows[headerIndex];
    const types = headers.flatMap((value, column) =>
      value?.trim().toLowerCase() === 'texttype' ? [column] : [],
    );
    if (types.length > 1) throw new Error('模板的 TextType 表头重复。');
    const [typeColumn] = types;
    const locales: Record<string, number> = {};
    headers.forEach((value, column) => {
      // ID is the identifier column in a Push template. Use id_ID for Indonesian.
      if (value?.trim().toLowerCase() === 'id') return;
      const locale = languageMarker(value ?? '');
      if (!locale) return;
      if (Object.hasOwn(locales, locale)) throw new Error('模板的语言表头重复：' + value + '。');
      locales[locale] = column;
    });
    if (!Object.keys(locales).length) continue;
    const pairs: TemplateInfo['pairs'] = [];
    let titleRow: number | undefined;
    for (let index = headerIndex + 1; index < sheet.rows.length; index++) {
      const label = sheet.rows[index][typeColumn]?.trim().toLowerCase();
      if (label === 'title' && titleRow === undefined) {
        titleRow = index + 1;
      } else if (label === 'subtitle' && titleRow !== undefined) {
        pairs.push({ title: titleRow, subTitle: index + 1 });
        titleRow = undefined;
      } else if (label === 'title' || label === 'subtitle') {
        throw new Error(`模板第 ${index + 1} 行的 title 和 subTitle 没有配对。`);
      }
    }
    if (titleRow !== undefined) throw new Error(`模板第 ${titleRow} 行缺少配对的 subTitle。`);
    if (!pairs.length) throw new Error('模板需要至少一对 title 和 subTitle 行。');

    return {
      bytes,
      path: sheet.path,
      locales,
      pairs,
    };
  }
  throw new Error('模板需要 TextType 和至少一个语言表头，例如 fr_FR。');
}
