import { describe, expect, it } from 'vitest';
import { parseCopy } from '../src/core/parse-copy';
import {
  makeTable,
  parseDelimited,
  parsePasted,
  parseTable,
  readSource,
} from '../src/core/parse-source';
import { syntheticCsv, syntheticProjects } from './fixtures';

describe('copy parsing', () => {
  it('removes only structural labels and preserves spaces, tabs, Unicode and continuations', () => {
    const result = parseCopy(
      '1. 主：  Hello 🇨🇱 👨‍👩‍👧‍👦 ✈️\n副：\tTwo  spaces  \ncontinued\n2.主:Emoji 👍🏽1️⃣\nsubTitle: ¡Hola!',
    );
    expect(result.items).toEqual([
      { title: '  Hello 🇨🇱 👨‍👩‍👧‍👦 ✈️', subTitle: '\tTwo  spaces  \ncontinued' },
      { title: 'Emoji 👍🏽1️⃣', subTitle: ' ¡Hola!' },
    ]);
    expect(result.warnings).toEqual([]);
  });
  it('does not silently discard incomplete or repeated fields', () => {
    expect(parseCopy('副：subtitle only\n副：another').items).toEqual([
      { title: '', subTitle: 'subtitle only' },
      { title: '', subTitle: 'another' },
    ]);
    expect(parseCopy('unlabeled text').warnings.length).toBeGreaterThan(0);
  });
  it('preserves original CRLF inside multiline payloads', () => {
    expect(parseCopy('主：Hello\r\ncontinued\r\n副：World\r\ncontinued').items).toEqual([
      { title: 'Hello\r\ncontinued', subTitle: 'World\r\ncontinued' },
    ]);
    expect(
      parsePasted('en_US\r\n主：Hello, Chile\r\ncontinued\r\n副：World', 'p', 'en_US').projects[0]
        .locales.en_US[0].title,
    ).toBe('Hello, Chile\r\ncontinued');
  });
  it('recognizes Markdown and language headings without treating commas as CSV', () => {
    const parsed = parsePasted(
      '# 项目 hello / en_US\n主：Hello, world\n副：Welcome\nEspañol:\n主：Hola, mundo\n副：Bienvenido',
      'fallback',
      'en_US',
    );
    expect(parsed.projects[0].id).toBe('hello');
    expect(parsed.projects[0].locales.es_ES[0].title).toBe('Hola, mundo');
  });
  it('parses quoted CSV with multiline fields and ignores empty trailing records', () => {
    const result = parseTable(parseDelimited(syntheticCsv()));
    expect(result.projects).toEqual(syntheticProjects());
    expect(result.warnings).toEqual([]);
    expect(result.projects.flatMap((p) => Object.values(p.locales).flat()).length).toBe(42);
  });
  it('allows custom columns, locale headers and a headerless source', () => {
    const table = makeTable(
      [
        ['español', 'projectId', 'English'],
        ['主：Hola\n副：Mundo', 'sample', '主：Hello\n副：World'],
      ],
      'custom.csv',
    );
    expect(table.mapping.idColumn).toBe(1);
    expect(parseTable(table).projects[0].locales.en_US[0].title).toBe('Hello');
    table.mapping = { header: true, idColumn: 1, localeColumns: { es_ES: 0 } };
    expect(parseTable(table).warnings.some((i) => i.message.includes('未映射'))).toBe(true);
  });
  it('recognizes long-form records', () => {
    const parsed = parseTable(
      parseDelimited('id,locale,title,subTitle\nalpha,en_US,Hello,World\nalpha,es_ES,Hola,Mundo'),
    );
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].locales.es_ES).toEqual([{ title: 'Hola', subTitle: 'Mundo' }]);
  });
  it('parses grouped multilingual pasted text', () => {
    const result = parsePasted(
      '项目 campaign / en_US\n1.主：Hello 🇨🇱\n副：World\n项目 campaign / es_ES\n1.主：Hola\n副：Mundo\n项目 other / en_US\n主：New\n副：Item',
      'fallback',
      'en_US',
    );
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0].locales.en_US[0].title).toBe('Hello 🇨🇱');
    expect(result.projects[0].locales.es_ES[0].subTitle).toBe('Mundo');
  });
  it('parses CSV and tabular clipboard content', () => {
    expect(parsePasted(syntheticCsv(), 'unused', 'en_US').projects).toEqual(syntheticProjects());
    const tsv = 'ID\ten_US\tes_ES\na\t"主：Hello\n副：World"\t"主：Hola\n副：Mundo"';
    expect(parsePasted(tsv, 'unused', 'en_US').projects[0].locales.es_ES[0].title).toBe('Hola');
  });
  it('reports malformed CSV, invalid UTF-8 and empty input', async () => {
    expect(() => parseDelimited('id,"unclosed')).toThrow('CSV');
    await expect(readSource(new Uint8Array([0xff, 0xfe, 0x41]), 'bad.csv')).rejects.toThrow(
      'UTF-8',
    );
    expect(() => parsePasted('', 'id', 'en_US')).toThrow();
  });
});
