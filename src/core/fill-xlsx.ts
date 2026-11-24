import type { CopyRow, TemplateInfo } from '../types';
import { matchingLocales } from './locale';
import {
  MAIN_NS,
  columnIndex,
  columnName,
  decodeText,
  elements,
  escapeXml,
  cellText,
  openZip,
  readPart,
  sharedStrings,
  xml,
} from './ooxml';

const isEmoji = (text: string) =>
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text);
const serialize = (element: Element) => new XMLSerializer().serializeToString(element);

function fontProperties(font: Element | undefined, prefix: string): string {
  if (!font) return `<${prefix}rFont val="Calibri"/><${prefix}sz val="12"/>`;
  return Array.from(font.children)
    .map((child) =>
      child.localName === 'name'
        ? `<${prefix}rFont val="${escapeXml(child.getAttribute('val') ?? 'Calibri')}"/>`
        : serialize(child),
    )
    .join('');
}

type Fonts = { plain: string; emoji: string };

function getFonts(
  cell: Element | undefined,
  shared: Element[],
  styles: Document,
  prefix: string,
): Fonts {
  const xfs = elements(styles, 'cellXfs')[0];
  const style = xfs?.children[Number(cell?.getAttribute('s') ?? 0)];
  const font = elements(styles, 'fonts')[0]?.children[Number(style?.getAttribute('fontId') ?? 0)];
  let plain = fontProperties(font, prefix);
  let emoji: string | undefined;
  const container =
    cell?.getAttribute('t') === 's' ? shared[Number(elements(cell, 'v')[0]?.textContent)] : cell;
  if (container) {
    for (const run of elements(container, 'r')) {
      const text = elements(run, 't')
        .map((n) => decodeText(n.textContent ?? ''))
        .join('');
      const properties = elements(run, 'rPr')[0];
      if (isEmoji(text) && properties) emoji ??= fontProperties(properties, prefix);
      else if (text && properties) plain = fontProperties(properties, prefix);
    }
  }
  if (!emoji) {
    for (const si of shared) {
      const run = elements(si, 'r').find(
        (r) =>
          isEmoji(
            elements(r, 't')
              .map((t) => t.textContent)
              .join(''),
          ) && elements(r, 'rPr').length,
      );
      if (run) {
        emoji = fontProperties(elements(run, 'rPr')[0], prefix);
        break;
      }
    }
  }
  if (!emoji) {
    // Inherit size, weight and color; only change the emoji font.
    emoji =
      plain.replace(/<(?:[\w.-]+:)?rFont\b[^>]*\/>/g, '') +
      `<${prefix}rFont val="Segoe UI Emoji"/>`;
  }
  return { plain, emoji };
}

export function richText(value: string, fonts: Fonts, prefix = ''): string {
  const segments: { text: string; emoji: boolean }[] = [];
  // Flags, ZWJ families, skin tones, keycaps and variation selectors stay in one run.
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    value,
  )) {
    const emoji = isEmoji(segment);
    const last = segments.at(-1);
    if (last?.emoji === emoji) last.text += segment;
    else segments.push({ text: segment, emoji });
  }
  if (!segments.length)
    return `<${prefix}is><${prefix}t xml:space="preserve"></${prefix}t></${prefix}is>`;
  return `<${prefix}is>${segments.map((segment) => `<${prefix}r><${prefix}rPr>${segment.emoji ? fonts.emoji : fonts.plain}</${prefix}rPr><${prefix}t xml:space="preserve">${escapeXml(segment.text)}</${prefix}t></${prefix}r>`).join('')}</${prefix}is>`;
}

function extendDefaultRows(
  doc: Document,
  original: TemplateInfo['pairs'],
  required: number,
  shared: Element[],
): TemplateInfo['pairs'] {
  const pairs = [...original];
  const last = pairs[pairs.length - 1];
  const sheetData = elements(doc, 'sheetData')[0];
  const titleRow = elements(sheetData, 'row').find(
    (row) => Number(row.getAttribute('r')) === last.title,
  );
  const subTitleRow = sheetData.lastElementChild;
  if (!titleRow || Number(subTitleRow?.getAttribute('r')) !== last.subTitle || !subTitleRow) {
    throw new Error('默认模板的文案行结构有误。');
  }
  const lastRow = last.subTitle + (required - pairs.length) * 2;
  if (lastRow > 20000) throw new Error('文案组数太多，请将源文案拆分后再试。');
  const dimension = elements(doc, 'dimension')[0];
  const range = dimension?.getAttribute('ref');
  if (range) dimension.setAttribute('ref', range.replace(/\d+$/, String(lastRow)));

  function appendRow(sample: Element, rowNumber: number) {
    const copy = sample.cloneNode(true) as Element;
    copy.setAttribute('r', String(rowNumber));
    for (const cell of elements(copy, 'c')) {
      const ref = cell.getAttribute('r') ?? '';
      cell.setAttribute('r', ref.replace(/\d+$/, String(rowNumber)));
      if (cell.getAttribute('t') === 's') {
        // Inline cloned labels so the template's shared string counts stay unchanged.
        const label = cellText(cell, shared);
        const inline = doc.createElementNS(MAIN_NS, 'is');
        const text = doc.createElementNS(MAIN_NS, 't');
        text.textContent = label;
        inline.append(text);
        cell.setAttribute('t', 'inlineStr');
        cell.replaceChildren(inline);
      }
    }
    sheetData.append(copy);
  }

  for (let title = last.subTitle + 1; title <= lastRow; title += 2) {
    appendRow(titleRow, title);
    appendRow(subTitleRow, title + 1);
    pairs.push({ title, subTitle: title + 1 });
  }
  return pairs;
}

export async function fillXlsx(template: TemplateInfo, row: CopyRow): Promise<Uint8Array> {
  const selected = new Map<string, CopyRow['locales'][string]>();
  const sourceRow = row.source + ' 第 ' + row.rowNumber + ' 行';
  for (const [source, items] of Object.entries(row.locales)) {
    if (!items.length) continue;
    const matches = matchingLocales(source, template.locales);
    if (!matches.length) throw new Error(sourceRow + '：模板没有与 ' + source + ' 对应的语言列。');
    if (matches.length > 1)
      throw new Error(
        sourceRow + '：' + source + ' 对应多列，请在源文中指定 ' + matches.join(' 或 ') + '。',
      );
    const [locale] = matches;
    if (selected.has(locale))
      throw new Error(sourceRow + '：多个语言标记对应模板的 ' + locale + ' 列，请合并文案。');
    selected.set(locale, items);
  }
  if (!selected.size) return template.bytes;

  const { path } = template;
  const zip = await openZip(template.bytes);
  const [sheetText, shared, styleText] = await Promise.all([
    readPart(zip, path),
    sharedStrings(zip),
    readPart(zip, 'xl/styles.xml'),
  ]);
  const doc = xml(sheetText);
  const styles = xml(styleText);
  const required = Math.max(...Array.from(selected.values(), (items) => items.length));
  const expanded = template.extendRows && required > template.pairs.length;
  const pairs = expanded
    ? extendDefaultRows(doc, template.pairs, required, shared)
    : template.pairs;
  const prefix = doc.documentElement.prefix ? `${doc.documentElement.prefix}:` : '';
  const cells = new Map(elements(doc, 'c').map((c) => [c.getAttribute('r') ?? '', c]));
  const changes = new Map<string, string>();
  for (const [locale, items] of selected) {
    const col = template.locales[locale];
    const position = `${row.source} 第 ${row.rowNumber} 行（${locale}）`;
    if (items.length > pairs.length)
      throw new Error(
        `${position}有 ${items.length} 组文案，模板只有 ${pairs.length} 组位置。可恢复默认模板后重试。`,
      );
    pairs.forEach((pair, index) => {
      for (const field of ['title', 'subTitle'] as const) {
        const value = items[index]?.[field] ?? '';
        if (value.length > 32767) throw new Error(`${position}的文案超过 Excel 单元格的长度限制。`);
        if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u.test(value))
          throw new Error(`${position}含有 Excel 无法保存的字符。`);
        const ref = `${columnName(col)}${pair[field]}`;
        changes.set(ref, richText(value, getFonts(cells.get(ref), shared, styles, prefix), prefix));
      }
    });
  }
  // Only replace selected <c> nodes. All other XML text remains byte-for-byte intact.
  let output = (expanded ? serialize(doc.documentElement) : sheetText).replace(
    /<((?:[\w.-]+:)?c)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g,
    (whole, tag: string, attrs: string, inner: string | undefined) => {
      const ref = attrs.match(/\br\s*=\s*["']([^"']+)["']/)?.[1] ?? '';
      const content = changes.get(ref);
      if (content === undefined) return whole;
      changes.delete(ref);
      const clean = attrs.replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/g, '');
      const extension =
        inner?.match(/<(?:[\w.-]+:)?extLst\b[\s\S]*?<\/(?:[\w.-]+:)?extLst>/)?.[0] ?? '';
      return `<${tag}${clean} t="inlineStr">${content}${extension}</${tag}>`;
    },
  );
  // Language columns can be completely empty in an otherwise populated template row.
  if (changes.size) {
    output = output.replace(
      /<((?:[\w.-]+:)?row)\b([^>]*?)>([\s\S]*?)<\/\1\s*>/g,
      (whole, tag: string, attrs: string, inner: string) => {
        const row = Number(attrs.match(/\br\s*=\s*["'](\d+)["']/)?.[1]);
        const pending = [...changes]
          .filter(([ref]) => Number(ref.match(/\d+$/)?.[0]) === row)
          .sort(([a], [b]) => columnIndex(a) - columnIndex(b));
        if (!pending.length) return whole;
        let content = inner;
        for (const [ref, value] of pending) {
          const cell = `<${prefix}c r="${ref}" t="inlineStr">${value}</${prefix}c>`;
          const following = [
            ...content.matchAll(/<(?:[\w.-]+:)?c\b[^>]*\br\s*=\s*["']([A-Z]+\d+)["'][^>]*>/g),
          ].find((m) => columnIndex(m[1]) > columnIndex(ref));
          if (following?.index !== undefined)
            content = content.slice(0, following.index) + cell + content.slice(following.index);
          else content += cell;
          changes.delete(ref);
        }
        return `<${tag}${attrs}>${content}</${tag}>`;
      },
    );
  }
  if (changes.size) throw new Error('模板行结构异常，无法写入部分单元格。');
  xml(output); // Fail before offering a download if a malformed template cannot be patched.
  zip.file(path, output);
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
