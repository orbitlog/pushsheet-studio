import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { inspectTemplate } from '../src/core/inspect-template';
import { readSource } from '../src/core/parse-source';
import { exportBatch, packageDownload } from '../src/core/export-batch';
import { readWorkbook } from '../src/core/ooxml';

const fixtureDir = process.env.PUSHSHEET_FIXTURES_DIR;
const available =
  !!fixtureDir &&
  ['无标题表格.csv', 'push加班.xlsx', '项目1_Push文案.xlsx'].every((name) =>
    existsSync(join(fixtureDir, name)),
  );

describe.skipIf(!available)('private real-file regression (never committed)', () => {
  it('parses 7 × 2 × 3 pairs and verifies all 84 exported values plus untouched ZIP parts', async () => {
    const sourceBytes = new Uint8Array(await readFile(join(fixtureDir!, '无标题表格.csv')));
    const templateBytes = new Uint8Array(await readFile(join(fixtureDir!, 'push加班.xlsx')));
    const rows = await readSource(sourceBytes, 'source.csv');
    expect(rows).toHaveLength(7);
    expect(rows.flatMap((p) => Object.values(p.locales).flat())).toHaveLength(42);
    const info = await inspectTemplate(templateBytes);
    const files = await exportBatch(rows, info);
    expect(files).toHaveLength(7);
    const original = await JSZip.loadAsync(templateBytes);
    for (let i = 0; i < files.length; i++) {
      const workbook = await readWorkbook(files[i].bytes);
      for (const locale of Object.keys(rows[i].locales)) {
        const col = info.locales[locale];
        info.pairs.forEach((pair, j) => {
          expect(workbook.sheets[0].rows[pair.title - 1][col]).toBe(
            rows[i].locales[locale][j].title,
          );
          expect(workbook.sheets[0].rows[pair.subTitle - 1][col]).toBe(
            rows[i].locales[locale][j].subTitle,
          );
        });
      }
      for (const name of Object.keys(original.files).filter(
        (p) => !original.files[p].dir && p !== info.path,
      ))
        expect(await workbook.zip.file(name)!.async('uint8array')).toEqual(
          await original.file(name)!.async('uint8array'),
        );
    }
    const zipped = (await packageDownload(files)).bytes;
    expect(Object.keys((await JSZip.loadAsync(zipped)).files)).toHaveLength(7);
    const outputDir = resolve('.local/regression');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'pushsheet_export.zip'), zipped);
    await writeFile(join(outputDir, 'push_2.xlsx'), files[1].bytes);
  });
  it('uses the two named language columns in XLSX and converts each non-empty row separately', async () => {
    const source = new Uint8Array(await readFile(join(fixtureDir!, '项目1_Push文案.xlsx')));
    const { sheets } = await readWorkbook(source);
    const rows = await readSource(source, 'source.xlsx');
    expect(rows).toHaveLength(6);
    expect(rows[0].locales.en_US[0].title).toBe(sheets[0].rows[1][2]);
    expect(rows[0].locales.es_ES[0].title).toBe(sheets[0].rows[1][7]);
  });
});
