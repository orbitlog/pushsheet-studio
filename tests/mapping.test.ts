import { describe, expect, it } from 'vitest';
import { inspectTemplate, mapTemplate } from '../src/core/inspect-template';
import { validate } from '../src/core/validate';
import { defaultBytes, inlineCell, mutateTemplate, syntheticProjects } from './fixtures';
import { parseTable, readSource } from '../src/core/parse-source';
import { fillXlsx } from '../src/core/fill-xlsx';

describe('mapping and validation', () => {
  it('locates locale columns and title/subTitle pairs by headers', async () => {
    const info = await inspectTemplate(await defaultBytes(), 'default');
    expect(info.errors).toEqual([]);
    expect(info.locales.en_US).toBe(2);
    expect(info.locales.es_ES).toBe(7);
    expect(info.pairs).toEqual([
      { title: 2, subTitle: 3 },
      { title: 4, subTitle: 5 },
      { title: 6, subTitle: 7 },
    ]);
    expect(validate(syntheticProjects(), info)).toEqual([]);
    const remapped = mapTemplate(info, 0, {
      ...info.mapping,
      localeColumns: { en_US: 7, es_ES: 2 },
    });
    expect(remapped.locales.en_US).toBe(7);
  });
  it('rejects duplicate language headers and unpaired type rows', async () => {
    const bytes = await mutateTemplate(async (zip) => {
      const path = 'xl/worksheets/sheet1.xml';
      const sheet = (await zip.file(path)!.async('string'))
        .replace(/<c r="H1".*?<\/c>/, inlineCell('H1', 'en_US'))
        .replace(/<c r="B3".*?<\/c>/, inlineCell('B3', 'title'));
      zip.file(path, sheet);
    });
    const info = await inspectTemplate(bytes, 'invalid');
    expect(info.errors.some((e) => e.includes('重复'))).toBe(true);
    expect(info.errors.some((e) => e.includes('缺少配对'))).toBe(true);
  });
  it('blocks missing fields, duplicate IDs, unknown locales, overflow and invalid controls', async () => {
    const info = await inspectTemplate(await defaultBytes(), 'template');
    const projects = syntheticProjects(2);
    projects[1].id = projects[0].id;
    projects[0].locales.en_US[0].title = '';
    projects[0].locales.es_ES[0].subTitle = '\u0000';
    projects[0].locales.xx_XX = [{ title: 't', subTitle: 's' }];
    projects[1].locales.en_US.push({ title: 'overflow', subTitle: 'fourth' });
    const messages = validate(projects, info)
      .map((i) => i.message)
      .join('\n');
    expect(messages).toContain('缺少 title');
    expect(messages).toContain('重复');
    expect(messages).toContain('xx_XX');
    expect(messages).toContain('超过模板');
    expect(messages).toContain('控制字符');
    await expect(fillXlsx(info, projects[0])).rejects.toThrow();
  });
  it('accepts a formatted XLSX source and preserves title/subTitle content', async () => {
    const template = await inspectTemplate(await defaultBytes(), 'template');
    const project = syntheticProjects(1)[0];
    const bytes = await fillXlsx(template, project);
    const tables = await readSource(bytes, 'project-1.xlsx');
    expect(tables[0].shape).toBe('template');
    const result = parseTable(tables[0]);
    expect(result.projects[0].locales).toEqual(project.locales);
  });
});
