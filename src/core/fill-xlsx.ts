import type { PushProject, TemplateInfo } from '../types';
import {
  columnIndex,
  columnName,
  decodeText,
  elements,
  escapeXml,
  openZip,
  readPart,
  sharedStrings,
  xml,
} from './ooxml';
import { validate } from './validate';

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

export async function fillXlsx(
  template: TemplateInfo,
  project: PushProject,
  clearUnfilled = false,
): Promise<Uint8Array> {
  const errors = validate([project], template).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(errors[0].message);
  const zip = await openZip(template.bytes);
  const path = template.sheets[template.sheetIndex].path;
  const [sheetText, shared, styleText] = await Promise.all([
    readPart(zip, path),
    sharedStrings(zip),
    readPart(zip, 'xl/styles.xml'),
  ]);
  const doc = xml(sheetText);
  const styles = xml(styleText);
  const prefix = doc.documentElement.prefix ? `${doc.documentElement.prefix}:` : '';
  const cells = new Map(elements(doc, 'c').map((c) => [c.getAttribute('r') ?? '', c]));
  const changes = new Map<string, string>();
  for (const [locale, col] of Object.entries(template.locales)) {
    if (!Object.hasOwn(project.locales, locale) && !clearUnfilled) continue;
    template.pairs.forEach((pair, index) => {
      for (const field of ['title', 'subTitle'] as const) {
        const ref = `${columnName(col)}${pair[field]}`;
        changes.set(
          ref,
          richText(
            project.locales[locale]?.[index]?.[field] ?? '',
            getFonts(cells.get(ref), shared, styles, prefix),
            prefix,
          ),
        );
      }
    });
  }
  // Only replace selected <c> nodes. All other XML text remains byte-for-byte intact.
  let output = sheetText.replace(
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
