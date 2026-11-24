import JSZip from 'jszip';
import type { SheetInfo } from '../types';

export const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_UNPACKED_SIZE = 100 * 1024 * 1024;

export function xml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不支持包含 DTD 或实体定义的 XML。');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new Error('Excel XML 内容损坏，无法读取。');
  return doc;
}

export function elements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(MAIN_NS, name));
}

export function escapeXml(value: string): string {
  // OOXML escape notation also represents carriage returns without XML newline normalization.
  return value
    .replace(/_x[0-9a-f]{4}_/gi, (match) => `_x005F_${match.slice(1)}`)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '_x000D_');
}

export function decodeText(value: string): string {
  return value.replace(/_x([0-9a-f]{4})_/gi, (_, code: string) =>
    String.fromCharCode(parseInt(code, 16)),
  );
}

export function columnName(index: number): string {
  let name = '';
  for (let i = index + 1; i > 0; i = Math.floor((i - 1) / 26))
    name = String.fromCharCode(65 + ((i - 1) % 26)) + name;
  return name;
}

export function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0];
  if (!letters) throw new Error(`无效的单元格坐标：${ref}`);
  return Array.from(letters.toUpperCase()).reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

// Check the central directory before inflation so oversized/ZIP64/encrypted inputs fail safely.
export function checkZipSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_FILE_SIZE) throw new Error('单个文件不能超过 20 MB。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('不是有效的 XLSX 文件，或文件已损坏。');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count > 10000 || offset === 0xffffffff || view.getUint16(end + 4, true) !== 0)
    throw new Error('不支持此超大或分卷 Excel 文件。');
  let size = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('Excel 压缩目录损坏。');
    if (view.getUint16(offset + 8, true) & 1) throw new Error('请先移除 Excel 文件密码。');
    size += view.getUint32(offset + 24, true);
    if (size > MAX_UNPACKED_SIZE) throw new Error('Excel 解压后超过 100 MB，请拆分文件。');
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

export async function openZip(bytes: Uint8Array): Promise<JSZip> {
  checkZipSize(bytes);
  const zip = await JSZip.loadAsync(bytes);
  if (!zip.file('xl/workbook.xml')) throw new Error('未找到 Excel 工作簿。仅支持 .xlsx。');
  if (Object.keys(zip.files).some((p) => /vbaProject\.bin$/i.test(p)))
    throw new Error('不支持带宏的模板，请另存为普通 XLSX。');
  return zip;
}

export async function readPart(zip: JSZip, path: string): Promise<string> {
  const part = zip.file(path);
  if (!part) throw new Error(`Excel 缺少必要部件：${path}`);
  return part.async('string');
}

function stringText(container: Element): string {
  return Array.from(container.children)
    .map((child) =>
      child.localName === 't'
        ? decodeText(child.textContent ?? '')
        : child.localName === 'r'
          ? Array.from(child.children)
              .filter((n) => n.localName === 't')
              .map((n) => decodeText(n.textContent ?? ''))
              .join('')
          : '',
    )
    .join('');
}

export function cellText(cell: Element, shared: Element[]): string {
  if (cell.getAttribute('t') === 's') {
    const index = Number(elements(cell, 'v')[0]?.textContent);
    return shared[index] ? stringText(shared[index]) : '';
  }
  if (cell.getAttribute('t') === 'inlineStr')
    return elements(cell, 'is')[0] ? stringText(elements(cell, 'is')[0]) : '';
  return elements(cell, 'v')[0]?.textContent ?? '';
}

export async function sharedStrings(zip: JSZip): Promise<Element[]> {
  return zip.file('xl/sharedStrings.xml')
    ? elements(xml(await readPart(zip, 'xl/sharedStrings.xml')), 'si')
    : [];
}

function resolvePart(target: string): string {
  const parts: string[] = target.startsWith('/') ? [] : ['xl'];
  for (const part of target.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

export async function readWorkbook(
  bytes: Uint8Array,
): Promise<{ zip: JSZip; sheets: SheetInfo[] }> {
  const zip = await openZip(bytes);
  const [bookText, relText, shared] = await Promise.all([
    readPart(zip, 'xl/workbook.xml'),
    readPart(zip, 'xl/_rels/workbook.xml.rels'),
    sharedStrings(zip),
  ]);
  const book = xml(bookText);
  if (book.documentElement.namespaceURI !== MAIN_NS)
    throw new Error('暂不支持 Strict OOXML，请用 Excel 另存为普通 XLSX。');
  const rels = Array.from(xml(relText).getElementsByTagNameNS('*', 'Relationship'));
  const sheets: SheetInfo[] = [];
  const sheetNodes = elements(book, 'sheet');
  if (sheetNodes.length > 50) throw new Error('工作表超过 50 张，请拆分文件。');
  for (const sheet of sheetNodes) {
    const relId = sheet.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'id',
    );
    const rel = rels.find((r) => r.getAttribute('Id') === relId);
    if (
      !rel ||
      rel.getAttribute('TargetMode') === 'External' ||
      !rel.getAttribute('Type')?.endsWith('/worksheet')
    )
      continue;
    const path = resolvePart(rel.getAttribute('Target') ?? '');
    const doc = xml(await readPart(zip, path));
    const cells = elements(doc, 'c');
    if (cells.length > 200000) throw new Error('单张工作表超过 20 万个单元格，请拆分文件。');
    const rows: string[][] = [];
    for (const cell of cells) {
      const ref = cell.getAttribute('r') ?? '';
      const col = columnIndex(ref);
      const row = Number(ref.match(/\d+$/)?.[0]) - 1;
      if (row < 0 || row > 19999 || col > 511)
        throw new Error('数据范围超过 20,000 行或 512 列，请裁剪无关区域。');
      rows[row] ??= [];
      rows[row][col] = cellText(cell, shared);
    }
    sheets.push({
      name: sheet.getAttribute('name') ?? 'Sheet',
      path,
      rows: Array.from(rows, (row) => row ?? []),
    });
  }
  if (!sheets.length) throw new Error('文件没有可读取的工作表。');
  return { zip, sheets };
}
