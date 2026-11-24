import Papa from 'papaparse';
import type { CopyRow } from '../types';
import { MAX_FILE_SIZE, readWorkbook } from './ooxml';
import { parseCopy } from './parse-copy';

const idHeader = /^(?:id|项目(?:名称|编号|\s*id)?|序号|编号|project(?:[ _]?id)?)$/i;
const englishHeader = /^(?:en(?:[_-]us)?|english|英文|英语)$/i;
const spanishHeader = /^(?:es(?:[_-]es)?|spanish|español|西语|西班牙文|西班牙语)$/i;

function rowsToCopy(rows: string[][], source: string): CopyRow[] {
  const firstIndex = rows.findIndex((row) => row.some((value) => value?.trim()));
  if (firstIndex < 0) return [];
  const first = rows[firstIndex];
  const english = first.findIndex((value) => englishHeader.test(value?.trim() ?? ''));
  const spanish = first.findIndex((value) => spanishHeader.test(value?.trim() ?? ''));
  const id = first.findIndex((value) => idHeader.test(value?.trim() ?? ''));
  const hasLanguageHeaders = english >= 0 && spanish >= 0;
  const hasHeader = hasLanguageHeaders || id === 0;
  const idColumn = hasLanguageHeaders ? id : 0;
  const englishColumn = hasLanguageHeaders ? english : 1;
  const spanishColumn = hasLanguageHeaders ? spanish : 2;

  return rows.flatMap((row, index) => {
    if (index < firstIndex || (index === firstIndex && hasHeader)) return [];
    const name = row[idColumn]?.trim();
    const en = row[englishColumn] ?? '';
    const es = row[spanishColumn] ?? '';
    if (!name && !en.trim() && !es.trim()) return [];
    return [
      {
        id: name || String(index + 1),
        rowNumber: index + 1,
        source,
        locales: { en_US: parseCopy(en), es_ES: parseCopy(es) },
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
  return parseDelimited(text, name);
}
