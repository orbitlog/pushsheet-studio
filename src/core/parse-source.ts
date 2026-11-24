import Papa from 'papaparse';
import type { CopyRow } from '../types';
import { MAX_FILE_SIZE, readWorkbook } from './ooxml';
import { parseCopy } from './parse-copy';
import { languageMarker } from './locale';
import { parseSections } from './parse-sections';

const idHeader = /^(?:id|项目(?:名称|编号|\s*id)?|序号|编号|project(?:[ _]?id)?)$/i;

function rowsToCopy(rows: string[][], source: string): CopyRow[] {
  const firstIndex = rows.findIndex((row) => row.some((value) => value?.trim()));
  if (firstIndex < 0) return [];
  const first = rows[firstIndex];
  const id = first.findIndex((value) => idHeader.test(value?.trim() ?? ''));
  const columns = new Map<string, number>();
  if (!/^\d+$/.test(first[0]?.trim() ?? '')) {
    first.forEach((value, column) => {
      if (column === id) return;
      const locale = languageMarker(value ?? '');
      if (!locale) return;
      if (columns.has(locale)) throw new Error('源表的语言表头重复：' + value + '。');
      columns.set(locale, column);
    });
  }
  const hasLanguageHeaders = columns.size > 0;
  const hasHeader = hasLanguageHeaders || id >= 0;
  const idColumn = hasLanguageHeaders ? id : 0;
  if (!hasHeader) {
    columns.set('en_US', 1);
    columns.set('es_ES', 2);
  }

  return rows.flatMap((row, index) => {
    if (index < firstIndex || (index === firstIndex && hasHeader)) return [];
    const name = row[idColumn]?.trim();
    const locales = Object.fromEntries(
      Array.from(columns, ([locale, column]) => [locale, parseCopy(row[column] ?? '')]),
    );
    if (!name && !Object.values(locales).some((items) => items.length)) return [];
    return [
      {
        id: name || String(index + 1),
        rowNumber: index + 1,
        source,
        locales,
      },
    ];
  });
}

export function parseDelimited(text: string, name: string): CopyRow[] {
  const { data, errors } = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimitersToGuess: [',', '\t', ';', '|'],
  });
  const failure = errors.find((error) => error.code !== 'UndetectableDelimiter');
  if (failure) throw new Error(`第 ${(failure.row ?? 0) + 1} 行的 CSV 引号或分隔符格式有误。`);
  if (data.length > 20000 || data.some((row) => row.length > 512))
    throw new Error('源表超过 20,000 行或 512 列，请拆分后再上传。');
  return rowsToCopy(data, name);
}

export function readTextSource(text: string, name: string): CopyRow[] {
  return parseSections(text, name) ?? parseDelimited(text, name);
}

export async function readSource(bytes: Uint8Array, name: string): Promise<CopyRow[]> {
  if (bytes.length > MAX_FILE_SIZE) throw new Error('单个文件不能超过 20 MB。');
  if (/\.xlsx$/i.test(name)) {
    const { sheets } = await readWorkbook(bytes);
    return sheets.flatMap((sheet) => rowsToCopy(sheet.rows, `${name} / ${sheet.name}`));
  }
  if (!/\.(csv|tsv|txt)$/i.test(name)) throw new Error('请选择 CSV、XLSX、TSV 或 TXT 文件。');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('请将文件另存为 UTF-8 编码后再上传。');
  }
  return /\.txt$/i.test(name) ? readTextSource(text, name) : parseDelimited(text, name);
}
