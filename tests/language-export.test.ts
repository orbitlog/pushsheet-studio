import { describe, expect, it } from 'vitest';
import { fillXlsx } from '../src/core/fill-xlsx';
import { inspectTemplate } from '../src/core/inspect-template';
import { readWorkbook } from '../src/core/ooxml';
import { readSource, readTextSource } from '../src/core/parse-source';
import { defaultBytes, inlineCell, mutateTemplate } from './fixtures';

const french = '法国活动：\nFR\n主：Bonjour 🇫🇷\n副：Offres du jour';

describe('automatic language mapping', () => {
  it('writes French-only CSV, TXT and pasted copy to the same French column', async () => {
    const template = await inspectTemplate(await defaultBytes());
    const csv = await readSource(
      new TextEncoder().encode('FR\n"主：Bonjour 🇫🇷\n副：Offres du jour"'),
      'fr.csv',
    );
    const txt = await readSource(new TextEncoder().encode(french), 'fr.txt');
    const pasted = readTextSource(french, 'paste');
    for (const [row] of [csv, txt, pasted]) {
      const bytes = await fillXlsx(template, row);
      const { sheets } = await readWorkbook(bytes);
      expect(sheets[0].rows[1][template.locales.fr_FR]).toBe('Bonjour 🇫🇷');
      expect(sheets[0].rows[2][template.locales.fr_FR]).toBe('Offres du jour');
      expect(sheets[0].rows[1][template.locales.en_US]).toBe('');

      const [excelRow] = await readSource(bytes, 'fr.xlsx');
      expect(excelRow.locales.fr_FR[0].title).toBe('Bonjour 🇫🇷');
    }
  });

  it('combines several languages in one workbook and sizes rows using French copy', async () => {
    const template = { ...(await inspectTemplate(await defaultBytes())), extendRows: true };
    const [row] = readTextSource(
      french +
        '\n2.主：Deux\n3.主：Trois\n4.主：Quatre\n5.主：Cinq\nEN\n主：Hello\nPT-BR\n主：Olá\nJA\n主：こんにちは',
      'paste',
    );
    const { sheets } = await readWorkbook(await fillXlsx(template, row));
    expect(sheets[0].rows[9][template.locales.fr_FR]).toBe('Cinq');
    expect(sheets[0].rows[1][template.locales.pt_BR]).toBe('Olá');
    expect(sheets[0].rows[1][template.locales.ja_JP]).toBe('こんにちは');
    expect(sheets[0].rows[1][template.locales.en_US]).toBe('Hello');
  });

  it('asks for the exact locale when a short code matches multiple columns', async () => {
    const bytes = await mutateTemplate(async (zip) => {
      const path = 'xl/worksheets/sheet1.xml';
      const html = await zip.file(path)!.async('string');
      zip.file(path, html.replace(/<c r="I1".*?<\/c>/, inlineCell('I1', 'fr_CA')));
    });
    const template = await inspectTemplate(bytes);
    const [short] = readTextSource(french, 'paste');
    await expect(fillXlsx(template, short)).rejects.toThrow('fr_FR 或 fr_CA');
    const [exact] = readTextSource(french.replace('\nFR\n', '\nFR-CA\n'), 'paste');
    const { sheets } = await readWorkbook(await fillXlsx(template, exact));
    expect(sheets[0].rows[1][template.locales.fr_CA]).toBe('Bonjour 🇫🇷');
    expect(sheets[0].rows[1][template.locales.fr_FR]).toBe('');
    const [unknown] = readTextSource(french.replace('\nFR\n', '\nFR-BE\n'), 'paste');
    await expect(fillXlsx(template, unknown)).rejects.toThrow('没有与 fr_BE 对应的语言列');
  });
});
