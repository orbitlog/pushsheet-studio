import type { TemplateInfo, TemplateMapping } from '../types';
import { readWorkbook } from './ooxml';

export const LOCALE_PATTERN = /^[a-z]{2,3}(?:[_-][A-Za-z]{2,4})?$/;
const ignoredHeaders = new Set(['id', 'no', 'key']);

export function autoTemplateMapping(rows: string[][]): TemplateMapping {
  const header = rows.findIndex((row) => row.some((v) => /^TextType$/i.test(v?.trim() ?? '')));
  return {
    headerRow: header >= 0 ? header + 1 : 1,
    typeColumn: Math.max(
      0,
      rows[header >= 0 ? header : 0]?.findIndex((v) => /^TextType$/i.test(v?.trim() ?? '')) ?? 1,
    ),
    titleLabel: 'title',
    subTitleLabel: 'subTitle',
  };
}

export function mapTemplate(
  info: TemplateInfo,
  sheetIndex: number,
  mapping: TemplateMapping,
): TemplateInfo {
  const errors: string[] = [];
  const rows = info.sheets[sheetIndex]?.rows ?? [];
  const headers = rows[mapping.headerRow - 1] ?? [];
  const locales: Record<string, number> = Object.create(null);
  if (!headers.length) errors.push('表头行为空，请调整表头行号。');
  if (
    !mapping.titleLabel.trim() ||
    !mapping.subTitleLabel.trim() ||
    mapping.titleLabel.trim().toLowerCase() === mapping.subTitleLabel.trim().toLowerCase()
  )
    errors.push('title 和 subTitle 行标签必须非空且不同。');
  headers.forEach((value, column) => {
    const locale = value?.trim();
    if (
      column !== mapping.typeColumn &&
      locale &&
      LOCALE_PATTERN.test(locale) &&
      !ignoredHeaders.has(locale.toLowerCase())
    ) {
      if (locales[locale] !== undefined) errors.push(`模板语言列重复：${locale}`);
      locales[locale] = column;
    }
  });
  if (mapping.localeColumns) {
    Object.keys(locales).forEach((locale) => delete locales[locale]);
    const used = new Set<number>();
    for (const [locale, column] of Object.entries(mapping.localeColumns)) {
      if (!LOCALE_PATTERN.test(locale))
        errors.push(`无效的语言代码：${locale}，请使用 en_US 等代码。`);
      if (
        column === mapping.typeColumn ||
        /^ID$/i.test(headers[column]?.trim() ?? '') ||
        column < 0 ||
        column >= headers.length ||
        used.has(column)
      )
        errors.push(`语言 ${locale} 的列映射无效或重复，请避开 ID 和类型列。`);
      used.add(column);
      locales[locale] = column;
    }
  }
  if (!Object.keys(locales).length) errors.push('未识别到语言列，请设置语言映射。');
  const pairs: TemplateInfo['pairs'] = [];
  let pending: number | undefined;
  for (let i = mapping.headerRow; i < rows.length; i++) {
    const label = rows[i]?.[mapping.typeColumn]?.trim().toLowerCase();
    if (label === mapping.titleLabel.trim().toLowerCase()) {
      if (pending !== undefined) errors.push(`第 ${pending} 行 title 缺少配对的 subTitle。`);
      pending = i + 1;
    } else if (label === mapping.subTitleLabel.trim().toLowerCase()) {
      if (pending === undefined) errors.push(`第 ${i + 1} 行 subTitle 缺少前置 title。`);
      else {
        pairs.push({ title: pending, subTitle: i + 1 });
        pending = undefined;
      }
    }
  }
  if (pending !== undefined) errors.push(`第 ${pending} 行 title 缺少配对的 subTitle。`);
  if (!pairs.length) errors.push('未找到成对的 title / subTitle 行。');
  return { ...info, sheetIndex, mapping, locales, pairs, errors };
}

export async function inspectTemplate(bytes: Uint8Array, name: string): Promise<TemplateInfo> {
  const { sheets } = await readWorkbook(bytes);
  const sheetIndex = Math.max(
    0,
    sheets.findIndex((s) => s.rows.some((r) => r.some((v) => /^TextType$/i.test(v?.trim() ?? '')))),
  );
  const mapping = autoTemplateMapping(sheets[sheetIndex].rows);
  return mapTemplate(
    { name, bytes, sheets, sheetIndex, mapping, locales: {}, pairs: [], errors: [] },
    sheetIndex,
    mapping,
  );
}
