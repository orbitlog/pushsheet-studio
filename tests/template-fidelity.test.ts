import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { inspectTemplate } from '../src/core/inspect-template';
import { fillXlsx } from '../src/core/fill-xlsx';
import { exportBatch, packageDownload, safeFilename } from '../src/core/export-batch';
import { cellText, elements, readWorkbook, sharedStrings, xml } from '../src/core/ooxml';
import { defaultBytes, inlineCell, mutateTemplate, syntheticRows } from './fixtures';

describe('OOXML template fidelity', () => {
  it('changes only the target sheet, preserving all other ZIP payloads including images', async () => {
    const input = await mutateTemplate((zip) => {
      zip.file('xl/media/flag.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
      zip.file('xl/worksheets/untouched.xml', '<unrelated>unchanged</unrelated>');
    });
    const info = await inspectTemplate(input);
    const bytes = await fillXlsx(info, syntheticRows(1)[0]);
    const before = await JSZip.loadAsync(input);
    const after = await JSZip.loadAsync(bytes);
    expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort());
    for (const name of Object.keys(before.files).filter(
      (p) => !before.files[p].dir && p !== info.path,
    )) {
      expect(await after.file(name)!.async('uint8array'), name).toEqual(
        await before.file(name)!.async('uint8array'),
      );
    }
    const previous = await before.file(info.path)!.async('string');
    const next = await after.file(info.path)!.async('string');
    const hideTargets = (s: string) =>
      s.replace(/<c\b[^>]*\br="(?:C|H)[2-7]"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, '[target]');
    expect(hideTargets(next)).toBe(hideTargets(previous));
  });
  it('round-trips target values and preserves rich-text emoji fonts and grapheme clusters', async () => {
    const info = await inspectTemplate(await defaultBytes());
    const project = syntheticRows(1)[0];
    const bytes = await fillXlsx(info, project);
    const { zip, sheets } = await readWorkbook(bytes);
    const doc = xml(await zip.file(sheets[0].path)!.async('string'));
    const shared = await sharedStrings(zip);
    const cells = elements(doc, 'c');
    for (const [locale, col] of (['en_US', 'es_ES'] as const).map(
      (l) => [l, info.locales[l]] as const,
    )) {
      for (let i = 0; i < 3; i++) {
        for (const field of ['title', 'subTitle'] as const)
          expect(sheets[0].rows[info.pairs[i][field] - 1][col]).toBe(
            project.locales[locale][i][field],
          );
      }
    }
    const title = cells.find((c) => c.getAttribute('r') === 'C2')!;
    expect(cellText(title, shared)).toBe(project.locales.en_US[0].title);
    const emojiRun = elements(title, 'r').find((r) =>
      elements(r, 't').some((t) => t.textContent?.includes('🇨🇱')),
    )!;
    expect(elements(emojiRun, 'rFont')[0].getAttribute('val')).toBe('Segoe UI Symbol');
    expect(elements(emojiRun, 't')[0].textContent).toContain('🇨🇱👨‍👩‍👧‍👦👍🏽1️⃣');
    const plainRun = elements(title, 'r')[0];
    expect(elements(plainRun, 'rFont')[0].getAttribute('val')).toBe('Calibri');
  });
  it('clears all selected-language slots without retaining old examples, and respects unfilled-language policy', async () => {
    const bytes = await mutateTemplate(async (zip) => {
      const path = 'xl/worksheets/sheet1.xml';
      let sheet = await zip.file(path)!.async('string');
      sheet = sheet
        .replace(/<c r="C6"[^>]*\/>/, inlineCell('C6', 'old selected copy'))
        .replace(/<c r="D2"[^>]*\/>/, inlineCell('D2', 'keep other language'));
      zip.file(path, sheet);
    });
    const info = await inspectTemplate(bytes);
    const project = {
      ...syntheticRows(1)[0],
      id: 'single',
      locales: {
        en_US: [{ title: '=literal & <xml> _x0041_', subTitle: 'first\rsecond\nthird' }],
        es_ES: [],
      },
    };
    const keep = await readWorkbook(await fillXlsx(info, project));
    expect(keep.sheets[0].rows[1][2]).toBe(project.locales.en_US[0].title);
    expect(keep.sheets[0].rows[2][2]).toBe(project.locales.en_US[0].subTitle);
    expect(keep.sheets[0].rows[5][2]).toBe('');
    expect(keep.sheets[0].rows[1][3]).toBe('keep other language');
    expect(keep.sheets[0].rows[1][7]).toBe('');
    const raw = await keep.zip.file(info.path)!.async('string');
    expect(raw).not.toContain('<f>');
  });
  it('supports namespaced sheets and absent destination cells', async () => {
    const input = await mutateTemplate(async (zip) => {
      const path = 'xl/worksheets/sheet1.xml';
      const sheet = (await zip.file(path)!.async('string'))
        .replace(/<c r="C[2-7]"[^>]*\/>/g, '')
        .replace(
          /xmlns="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/,
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
        .replace(/<(\/?)([A-Za-z][\w]*)(?=[\s/>])/g, '<$1x:$2');
      zip.file(path, sheet);
    });
    const info = await inspectTemplate(input);
    const project = syntheticRows(1)[0];
    const output = await readWorkbook(await fillXlsx(info, project));
    expect(output.sheets[0].rows[1][2]).toBe(project.locales.en_US[0].title);
  });
  it('exports 15 workbooks and avoids case-insensitive/sanitized filename collisions', async () => {
    const info = await inspectTemplate(await defaultBytes());
    const projects = syntheticRows(15);
    projects[0].id = '../a';
    projects[1].id = '..\\a';
    const progress: number[] = [];
    const files = await exportBatch(projects, info, (done) => progress.push(done));
    expect(files).toHaveLength(15);
    expect(new Set(files.map((f) => f.name.toLowerCase())).size).toBe(15);
    expect(files[0].name).not.toBe(files[1].name);
    const download = await packageDownload(files);
    expect(download.name).toBe('pushsheet_export.zip');
    const zip = await JSZip.loadAsync(download.bytes);
    expect(await packageDownload([files[0]])).toBe(files[0]);
    expect(Object.keys(zip.files)).toHaveLength(15);
    expect(progress).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(safeFilename('a/b:c*?')).toBe('a_b_c__');
  });
});
