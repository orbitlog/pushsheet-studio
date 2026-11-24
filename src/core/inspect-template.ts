import type { TemplateInfo } from '../types';
import { readWorkbook } from './ooxml';

export async function inspectTemplate(bytes: Uint8Array): Promise<TemplateInfo> {
  const { sheets } = await readWorkbook(bytes);
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex((row) => {
      const headers = row.map((cell) => cell?.trim().toLowerCase());
      return ['texttype', 'en_us', 'es_es'].every((label) => headers.includes(label));
    });
    if (headerIndex === -1) continue;

    const headers = sheet.rows[headerIndex].map((cell) => cell?.trim().toLowerCase());
    if (
      ['texttype', 'en_us', 'es_es'].some((label) => headers.filter((v) => v === label).length > 1)
    )
      throw new Error('模板的 TextType、en_US 或 es_ES 表头重复。');

    const typeColumn = headers.indexOf('texttype');
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
      locales: { en_US: headers.indexOf('en_us'), es_ES: headers.indexOf('es_es') },
      pairs,
    };
  }
  throw new Error('模板需要 TextType、en_US 和 es_ES 三列表头。');
}
