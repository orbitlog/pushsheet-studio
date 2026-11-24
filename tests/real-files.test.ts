import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { inspectTemplate } from '../src/core/inspect-template';
import { parseTable, readSource } from '../src/core/parse-source';
import { exportBatch, zipBatch } from '../src/core/export-batch';
import { readWorkbook } from '../src/core/ooxml';
import { validate } from '../src/core/validate';

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
    const tables = await readSource(sourceBytes, 'source.csv');
    const result = parseTable(tables[0]);
    expect(result.warnings).toEqual([]);
    expect(result.projects).toHaveLength(7);
    expect(result.projects.flatMap((p) => Object.values(p.locales).flat())).toHaveLength(42);
    const info = await inspectTemplate(templateBytes, 'private-template');
    expect(validate(result.projects, info)).toEqual([]);
    const files = await exportBatch(result.projects, info);
    expect(files).toHaveLength(7);
    const original = await JSZip.loadAsync(templateBytes);
    for (let i = 0; i < files.length; i++) {
      const workbook = await readWorkbook(files[i].bytes);
      for (const [locale, col] of Object.entries(info.locales).filter(
        ([l]) => result.projects[i].locales[l],
      )) {
        info.pairs.forEach((pair, j) => {
          expect(workbook.sheets[0].rows[pair.title - 1][col]).toBe(
            result.projects[i].locales[locale][j].title,
          );
          expect(workbook.sheets[0].rows[pair.subTitle - 1][col]).toBe(
            result.projects[i].locales[locale][j].subTitle,
          );
        });
      }
      for (const name of Object.keys(original.files).filter(
        (p) => !original.files[p].dir && p !== info.sheets[0].path,
      ))
        expect(await workbook.zip.file(name)!.async('uint8array')).toEqual(
          await original.file(name)!.async('uint8array'),
        );
    }
    const zipped = await zipBatch(files);
    expect(Object.keys((await JSZip.loadAsync(zipped)).files)).toHaveLength(7);
    const outputDir = resolve('.local/regression');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'pushsheet_export.zip'), zipped);
    await writeFile(join(outputDir, 'push_2.xlsx'), files[1].bytes);
  });
  it('reads the formatted source XLSX as a single project with two locales', async () => {
    const tables = await readSource(
      new Uint8Array(await readFile(join(fixtureDir!, '项目1_Push文案.xlsx'))),
      'project-1.xlsx',
    );
    const parsed = parseTable(tables[0]);
    expect(parsed.projects).toHaveLength(1);
    expect(Object.keys(parsed.projects[0].locales)).toEqual(['en_US', 'es_ES']);
    expect(parsed.projects[0].locales.en_US).toHaveLength(3);
  });
});
