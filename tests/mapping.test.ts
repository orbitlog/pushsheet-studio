import { describe, expect, it } from 'vitest';
import { inspectTemplate } from '../src/core/inspect-template';
import { defaultBytes, inlineCell, mutateTemplate, syntheticRows } from './fixtures';
import { fillXlsx } from '../src/core/fill-xlsx';

describe('fixed template columns', () => {
  it('locates en_US, es_ES and title/subTitle rows', async () => {
    const info = await inspectTemplate(await defaultBytes());
    expect(info.locales).toEqual({ en_US: 2, es_ES: 7 });
    expect(info.pairs).toEqual([
      { title: 2, subTitle: 3 },
      { title: 4, subTitle: 5 },
      { title: 6, subTitle: 7 },
    ]);
  });

  it('rejects a custom template missing a fixed language or paired rows', async () => {
    const missingLanguage = await mutateTemplate(async (zip) => {
      const path = 'xl/worksheets/sheet1.xml';
      const sheet = await zip.file(path)!.async('string');
      zip.file(path, sheet.replace(/<c r="H1".*?<\/c>/, inlineCell('H1', 'fr_FR')));
    });
    await expect(inspectTemplate(missingLanguage)).rejects.toThrow('es_ES');

    const unpaired = await mutateTemplate(async (zip) => {
      const path = 'xl/worksheets/sheet1.xml';
      const sheet = await zip.file(path)!.async('string');
      zip.file(path, sheet.replace(/<c r="B3".*?<\/c>/, inlineCell('B3', 'title')));
    });
    await expect(inspectTemplate(unpaired)).rejects.toThrow('配对');
  });

  it('reports copy that cannot fit in the template without discarding it', async () => {
    const info = await inspectTemplate(await defaultBytes());
    const row = syntheticRows(1)[0];
    row.locales.en_US.push({ title: 'Fourth title', subTitle: '' });
    await expect(fillXlsx(info, row)).rejects.toThrow('模板只有 3 组位置');
  });
});
