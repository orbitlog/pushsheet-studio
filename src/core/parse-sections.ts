import type { CopyRow } from '../types';
import { copyLabel, parseCopy } from './parse-copy';
import { languageMarker } from './locale';

// Recognize Markdown hard breaks only when the source consistently uses them.
function splitLines(text: string): { text: string; ending: string }[] {
  const parts = text.replace(/^\uFEFF/, '').split(/(\r\n|\r|\n)/);
  const lines = [];
  let contentLines = 0;
  let markedLines = 0;
  let markedLanguage = false;
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    lines.push({ text: line, ending: parts[i + 1] ?? '' });
    if (!line.trim()) continue;
    contentLines++;
    if (/\\[ \t]*$/.test(line)) {
      markedLines++;
      if (languageMarker(line.replace(/\\[ \t]*$/, ''))) markedLanguage = true;
    }
  }
  if (markedLanguage && markedLines * 2 > contentLines) {
    for (const line of lines) line.text = line.text.replace(/\\[ \t]*$/, '');
  }
  return lines;
}

export function parseSections(text: string, source: string): CopyRow[] | undefined {
  const lines = splitLines(text);
  if (!lines.some((line) => languageMarker(line.text))) return;
  const rows: CopyRow[] = [];
  let active: CopyRow | undefined;
  let section: { locale: string; marker: number } | undefined;
  let seen = new Set<string>();
  let previousContent = -1;

  function finish(end: number) {
    if (!active || !section) return;
    const start = section.marker + 1;
    while (end > start && !lines[end - 1].text.trim()) end--;
    const copy = lines
      .slice(start, end)
      .map((line, i) => (i === end - start - 1 ? line.text : line.text + line.ending))
      .join('');
    if (!copy.trim()) {
      throw new Error('第 ' + (section.marker + 1) + ' 行的语言标记后没有文案。');
    }
    active.locales[section.locale] = parseCopy(copy);
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].text;
    if (!line.trim()) continue;
    const locale = languageMarker(line);
    if (locale) {
      const candidate = lines[previousContent]?.text.trim() ?? '';
      const canBeName = candidate && !languageMarker(candidate) && !copyLabel.test(candidate);
      const startsNamedBlock =
        canBeName &&
        (!active ||
          seen.has(locale) ||
          /[:：]$/.test(candidate) ||
          !lines[previousContent - 1]?.text.trim());
      finish(startsNamedBlock ? previousContent : index);

      if (!active || startsNamedBlock) {
        const name = startsNamedBlock
          ? candidate
              .replace(/^#{1,6}\s+/, '')
              .replace(/[:：]\s*$/, '')
              .trim()
          : '';
        const start = startsNamedBlock ? previousContent : index;
        if (!rows.length && lines.slice(0, start).some((line) => line.text.trim())) {
          throw new Error(
            '第 ' + (index + 1) + ' 行前有未识别的内容。请将名称单独放在语言标记的上一行。',
          );
        }
        active = {
          id: name || '文案',
          rowNumber: start + 1,
          source,
          locales: {},
        };
        rows.push(active);
        seen = new Set();
      } else if (seen.has(locale)) {
        throw new Error('第 ' + (index + 1) + ' 行的语言标记重复。请在新一组文案前单独写名称。');
      }

      seen.add(locale);
      section = { locale, marker: index };
    }
    previousContent = index;
  }
  finish(lines.length);
  return rows;
}
