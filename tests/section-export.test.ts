import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportBatch, packageDownload } from '../src/core/export-batch';
import { inspectTemplate } from '../src/core/inspect-template';
import { elements, readWorkbook, xml } from '../src/core/ooxml';
import { readSource, readTextSource } from '../src/core/parse-source';
import { copyLocales } from '../src/types';
import { defaultBytes } from './fixtures';

const names = ['示例一', '示例二', '示例三', '示例四', '示例五', '示例六', 'Example VII'];
const payload = names
  .map((name, index) => {
    const groups = (prefix: string) =>
      Array.from(
        { length: 5 },
        (_, i) =>
          i + 1 + '\\. 主：' + prefix + ' ' + (i + 1) + ' 🇨🇱\n副：\t' + index + '  ' + i + ' ',
      ).join('\n');
    return [name + (index === 0 ? '：' : ''), 'EN', groups('Hello'), 'ES', groups('¡Hola!')].join(
      '\n',
    );
  })
  .join('\n');

describe('named TXT and pasted copy', () => {
  it('exports seven named sheets with five bilingual groups via the bundled template', async () => {
    const markdown = payload.replace(/\n/g, '\\\r\n');
    const pasted = readTextSource(markdown, 'paste');
    const uploaded = await readSource(new TextEncoder().encode(markdown), 'upload.txt');
    expect(pasted.map((row) => row.id)).toEqual(names);
    expect(uploaded).toEqual(pasted.map((row) => ({ ...row, source: 'upload.txt' })));
    expect(uploaded[0].locales.en_US[4]).toEqual({ title: 'Hello 5 🇨🇱', subTitle: '\t0  4 ' });

    const template = { ...(await inspectTemplate(await defaultBytes())), extendRows: true };
    const files = await exportBatch(uploaded, template);
    const archive = await JSZip.loadAsync((await packageDownload(files)).bytes);
    expect(Object.keys(archive.files)).toEqual(names.map((name) => 'push_' + name + '.xlsx'));

    for (const [i, file] of files.entries()) {
      const { sheets, zip } = await readWorkbook(file.bytes);
      const rows = sheets[0].rows;
      expect(rows).toHaveLength(11);
      for (const locale of copyLocales) {
        const col = template.locales[locale];
        for (let j = 0; j < 5; j++) {
          expect(rows[1 + j * 2][col]).toBe(uploaded[i].locales[locale][j].title);
          expect(rows[2 + j * 2][col]).toBe(uploaded[i].locales[locale][j].subTitle);
        }
      }
      const doc = xml(await zip.file(template.path)!.async('string'));
      expect(elements(doc, 'dimension')[0].getAttribute('ref')).toBe('A1:AL11');
      expect(
        elements(doc, 'row')
          .find((row) => row.getAttribute('r') === '11')
          ?.getAttribute('ht'),
      ).toBe('17');
      expect(rows[10][1]).toBe('subTitle');
    }
  });

  it('keeps a multiline subtitle with its language and reports empty or repeated sections', () => {
    const text = '示例：\r\nEN:\r\n1. 主：Hello\r\n副：Line one\r\nLine two\r\nES：\r\n主：Hola';
    expect(readTextSource(text, 'paste')[0].locales.en_US[0].subTitle).toBe('Line one\r\nLine two');
    expect(() => readTextSource('示例\nEN\nES\n主：Hola', 'paste')).toThrow('没有文案');
    expect(() => readTextSource('示例\nEN\n主：Hello\nEN\n主：Again', 'paste')).toThrow(
      '语言标记重复',
    );
  });
});
