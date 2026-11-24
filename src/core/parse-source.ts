import Papa from 'papaparse';
import type { Issue, ParsedInput, PushProject, SourceMapping, SourceTable } from '../types';
import { MAX_FILE_SIZE, readWorkbook } from './ooxml';
import { parseCopy } from './parse-copy';
import { LOCALE_PATTERN, autoTemplateMapping, mapTemplate } from './inspect-template';

const alias: Record<string, string> = {
  english: 'en_US',
  英文: 'en_US',
  英语: 'en_US',
  spanish: 'es_ES',
  español: 'es_ES',
  西班牙文: 'es_ES',
  西班牙语: 'es_ES',
  西语: 'es_ES',
  en: 'en_US',
  es: 'es_ES',
};
export const normalizeLocale = (name: string): string =>
  Object.hasOwn(alias, name.trim().toLowerCase())
    ? alias[name.trim().toLowerCase()]
    : name.trim().replace('-', '_');

export function makeTable(rows: string[][], name: string): SourceTable {
  const cleaned = rows.filter((row) => row.some((v) => v?.trim()));
  const first = cleaned[0] ?? [];
  const header = first.some((v) =>
    /^(id|项目(?:编号|\s*id)?|project(?:[ _]?id)?|TextType|title|locale|语言)$/i.test(
      v?.trim() ?? '',
    ),
  );
  const shape = first.some((v) => /^TextType$/i.test(v?.trim() ?? ''))
    ? 'template'
    : first.some((v) => /^title$/i.test(v?.trim() ?? '')) &&
        first.some((v) => /^(locale|语言)$/i.test(v?.trim() ?? ''))
      ? 'long'
      : 'wide';
  const idColumn = Math.max(
    0,
    header
      ? first.findIndex((v) =>
          /^(id|项目(?:编号|\s*id)?|project(?:[ _]?id)?)$/i.test(v?.trim() ?? ''),
        )
      : 0,
  );
  const localeColumns: Record<string, number> = Object.create(null);
  first.forEach((value, col) => {
    const locale = normalizeLocale(value ?? '');
    if (
      col !== idColumn &&
      header &&
      (LOCALE_PATTERN.test(locale) || alias[value?.trim().toLowerCase()])
    )
      localeColumns[locale] = col;
  });
  if (!Object.keys(localeColumns).length && shape === 'wide') {
    const nonempty = Array.from(
      { length: Math.max(...cleaned.map((r) => r.length), 0) },
      (_, i) => i,
    ).filter((i) => i !== idColumn && cleaned.slice(header ? 1 : 0).some((r) => r[i]?.trim()));
    if (nonempty[0] !== undefined) localeColumns.en_US = nonempty[0];
    if (nonempty[1] !== undefined) localeColumns.es_ES = nonempty[1];
  }
  return { name, rows: cleaned, mapping: { header, idColumn, localeColumns }, shape };
}

export function parseDelimited(text: string, name = '粘贴的表格'): SourceTable {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', '\t', ';', '|'],
  });
  const failures = result.errors.filter((e) => e.code !== 'UndetectableDelimiter');
  if (failures.length)
    throw new Error(
      `CSV 格式错误：${failures[0].message}（记录 ${Number(failures[0].row ?? 0) + 1}）`,
    );
  if (result.data.length > 20000 || result.data.some((row) => row.length > 512))
    throw new Error('源数据超过 20,000 行或 512 列，请拆分。');
  return makeTable(result.data, name);
}

export async function readSource(bytes: Uint8Array, name: string): Promise<SourceTable[]> {
  if (bytes.length > MAX_FILE_SIZE) throw new Error('单个文件不能超过 20 MB。');
  if (/\.xlsx$/i.test(name)) {
    const { sheets, zip } = await readWorkbook(bytes);
    const tables = sheets
      .filter((s) => s.rows.some((r) => r.some((v) => v?.trim())))
      .map((s) => makeTable(s.rows, `${name.replace(/\.xlsx$/i, '')} · ${s.name}`));
    if (tables[0] && Object.keys(zip.files).some((path) => path.startsWith('xl/media/')))
      tables[0].notices = [
        {
          severity: 'warning',
          message: `${name} 包含内嵌图片；仅导入单元格文字，图片不做 OCR。请核对文案是否完整。`,
        },
      ];
    return tables;
  }
  if (!/\.(csv|tsv|txt)$/i.test(name)) throw new Error('请选择 CSV、TSV、TXT 或 XLSX 文件。');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('源文件不是有效的 UTF-8 编码。请另存为 UTF-8 CSV 后重试。');
  }
  return [parseDelimited(text, name)];
}

export function parseTable(table: SourceTable): ParsedInput {
  const warnings: Issue[] = [...(table.notices ?? [])];
  const { rows, mapping } = table;
  if (!rows.length)
    return {
      projects: [],
      warnings: [{ severity: 'error', message: `${table.name} 没有有效数据。` }],
    };
  if (table.shape === 'template') {
    const info = mapTemplate(
      {
        name: table.name,
        bytes: new Uint8Array(),
        sheets: [{ name: table.name, path: '', rows }],
        sheetIndex: 0,
        mapping: autoTemplateMapping(rows),
        locales: {},
        pairs: [],
        errors: [],
      },
      0,
      autoTemplateMapping(rows),
    );
    if (info.errors.length)
      return {
        projects: [],
        warnings: info.errors.map((message) => ({ severity: 'error', message })),
      };
    const locales: PushProject['locales'] = Object.create(null);
    for (const [locale, col] of Object.entries(info.locales)) {
      const items = info.pairs.map((pair) => ({
        title: rows[pair.title - 1]?.[col] ?? '',
        subTitle: rows[pair.subTitle - 1]?.[col] ?? '',
      }));
      if (items.some((i) => i.title || i.subTitle)) locales[locale] = items;
    }
    return { projects: [{ id: table.name.replace(/ · .+$/, ''), locales }], warnings };
  }
  if (table.shape === 'long') {
    const headers = rows[0].map((v) => v?.trim().toLowerCase());
    const localeCol = headers.findIndex((v) => /^(locale|语言)$/.test(v));
    const titleCol = headers.indexOf('title');
    const subCol = headers.indexOf('subtitle');
    if (subCol < 0)
      return {
        projects: [],
        warnings: [{ severity: 'error', message: '逐行表格缺少 subTitle 列。' }],
      };
    const projects = new Map<string, PushProject>();
    rows.slice(1).forEach((row, i) => {
      const id = row[mapping.idColumn]?.trim();
      const locale = normalizeLocale(row[localeCol] ?? '');
      if (!id || !locale) {
        warnings.push({ severity: 'error', message: `记录 ${i + 2} 缺少项目 ID 或语言。` });
        return;
      }
      const project = projects.get(id) ?? { id, locales: Object.create(null) };
      project.locales[locale] ??= [];
      project.locales[locale].push({ title: row[titleCol] ?? '', subTitle: row[subCol] ?? '' });
      projects.set(id, project);
    });
    return { projects: [...projects.values()], warnings };
  }
  const projects: PushProject[] = [];
  const assigned = Object.values(mapping.localeColumns);
  if (
    !assigned.length ||
    new Set(assigned).size !== assigned.length ||
    assigned.includes(mapping.idColumn)
  )
    warnings.push({
      severity: 'error',
      message: `${table.name}：项目与语言列映射必须各不相同，且至少选择一个语言列。`,
    });
  for (let i = mapping.header ? 1 : 0; i < rows.length; i++) {
    const row = rows[i];
    const id = row[mapping.idColumn]?.trim();
    if (!id) {
      warnings.push({
        severity: 'error',
        message: `${table.name} 第 ${i + 1} 条记录缺少项目 ID。`,
      });
      continue;
    }
    const locales: PushProject['locales'] = Object.create(null);
    row.forEach((value, col) => {
      if (col !== mapping.idColumn && !assigned.includes(col) && value?.trim())
        warnings.push({
          severity: 'warning',
          projectId: id,
          message: `第 ${col + 1} 列有内容但未映射，请确认是否需要导入。`,
        });
    });
    for (const [locale, col] of Object.entries(mapping.localeColumns)) {
      if (!row[col]?.trim()) continue;
      const result = parseCopy(row[col]);
      locales[locale] = result.items;
      result.warnings.forEach((message) =>
        warnings.push({ severity: 'error', projectId: id, message: `${locale}：${message}` }),
      );
      if (!result.items.length)
        warnings.push({
          severity: 'error',
          projectId: id,
          message: `${locale} 未识别到主 / 副标题。`,
        });
    }
    projects.push({ id, locales });
  }
  return { projects, warnings };
}

export function parsePasted(text: string, fallbackId: string, fallbackLocale: string): ParsedInput {
  if (!text.trim()) throw new Error('请先粘贴文案。');
  if (new TextEncoder().encode(text).length > MAX_FILE_SIZE)
    throw new Error('粘贴内容不能超过 20 MB。');
  const firstLine = text.split(/\r\n|\r|\n/).find((line) => line.trim()) ?? '';
  const startsPlain =
    /^\s*(?:#{1,3}\s*)?(?:(?:项目|project)\s+|(?:语言\s*[:：]\s*)?[a-z]{2,3}[_-][A-Za-z]{2,4}\s*[:：]?\s*$|(?:English|Español|英文|英语|西语|西班牙语)\s*[:：]?\s*$|(?:\d+\s*[.．、)）]\s*)?(?:主(?:标题)?|副(?:标题)?|title|subTitle)\s*[:：])/i.test(
      firstLine,
    );
  if (!startsPlain && /[,\t;]/.test(text)) {
    const table = parseDelimited(text);
    if ((table.rows[0]?.length ?? 0) > 1) return parseTable(table);
  }
  const projects: PushProject[] = [];
  const warnings: Issue[] = [];
  let id = fallbackId;
  let locale = fallbackLocale;
  let block = '';
  const flush = () => {
    if (!block.trim()) {
      block = '';
      return;
    }
    const result = parseCopy(block);
    let project = projects.find((p) => p.id === id);
    if (!project) {
      project = { id, locales: Object.create(null) };
      projects.push(project);
    }
    if (project.locales[locale])
      warnings.push({
        severity: 'error',
        projectId: id,
        message: `${locale} 的粘贴分区重复，请合并后重试。`,
      });
    else project.locales[locale] = result.items;
    result.warnings.forEach((message) =>
      warnings.push({ severity: 'error', projectId: id, message }),
    );
    block = '';
  };
  const lines = text.split(/(\r\n|\r|\n)/);
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    const projectHeading = line.match(
      /^\s*(?:#{1,3}\s*)?(?:项目|project)\s+(.+?)(?:\s*[/|·]\s*([a-z]{2,3}(?:[_-][A-Za-z]{2,4})?))?\s*$/i,
    );
    const localeHeading = line.match(
      /^\s*(?:#{1,3}\s*)?(?:语言\s*[:：]\s*)?([a-z]{2,3}[_-][A-Za-z]{2,4}|English|Español|英文|英语|西语|西班牙语)\s*[:：]?\s*$/i,
    );
    if (projectHeading) {
      flush();
      id = projectHeading[1];
      locale = normalizeLocale(projectHeading[2] ?? fallbackLocale);
    } else if (localeHeading) {
      flush();
      locale = normalizeLocale(localeHeading[1]);
    } else block += `${block ? (lines[i - 1] ?? '') : ''}${line}`;
  }
  flush();
  return { projects, warnings };
}

export function remapSource(table: SourceTable, mapping: SourceMapping): ParsedInput {
  return parseTable({ ...table, mapping });
}
