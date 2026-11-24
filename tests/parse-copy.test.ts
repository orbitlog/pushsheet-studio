import { describe, expect, it } from 'vitest';
import { parseCopy } from '../src/core/parse-copy';
import { parseDelimited, readSource } from '../src/core/parse-source';
import { syntheticCsv, syntheticRows } from './fixtures';

describe('source rows', () => {
  it('preserves whitespace and Unicode while removing structural labels', () => {
    expect(
      parseCopy('1. 主：  Hello 🇨🇱\r\n副：\tTwo  spaces\r\ncontinued\r\n2.主:Emoji 👍🏽'),
    ).toEqual([
      { title: '  Hello 🇨🇱', subTitle: '\tTwo  spaces\r\ncontinued' },
      { title: 'Emoji 👍🏽', subTitle: '' },
    ]);
    expect(parseCopy('  Hello without labels 🇨🇱')).toEqual([
      { title: '  Hello without labels 🇨🇱', subTitle: '' },
    ]);
  });

  it('reads fixed headerless columns, quoted multiline fields and trailing blank rows', () => {
    expect(parseDelimited(syntheticCsv(), 'source.csv')).toEqual(syntheticRows());
  });

  it('reads each data row separately, including duplicate IDs and a missing language', () => {
    const rows = parseDelimited(
      'ID,español,English,fr_FR\nsame,Hola,Hello,Bonjour\nsame,,World,Monde',
      'source.csv',
    );
    expect(rows.map((row) => row.id)).toEqual(['same', 'same']);
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(rows[0].locales.es_ES[0].title).toBe('Hola');
    expect(rows[0].locales.en_US[0].title).toBe('Hello');
    expect(rows[1].locales).toEqual({ en_US: [{ title: 'World', subTitle: '' }], es_ES: [] });
  });

  it('uses the row number when a source has language headers without IDs', () => {
    const rows = parseDelimited('en_US\tes_ES\nHello\tHola', 'source.tsv');
    expect(rows[0].id).toBe('2');
    expect(rows[0].locales.es_ES[0].title).toBe('Hola');
  });

  it('reports malformed CSV and invalid UTF-8 as input errors', async () => {
    expect(() => parseDelimited('id,"unclosed', 'source.csv')).toThrow('CSV');
    await expect(readSource(new Uint8Array([0xff, 0xfe, 0x41]), 'bad.csv')).rejects.toThrow(
      'UTF-8',
    );
  });
});
