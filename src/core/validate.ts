import type { Issue, PushProject, TemplateInfo } from '../types';

export function validate(projects: PushProject[], template: TemplateInfo | null): Issue[] {
  const issues: Issue[] = [];
  if (!template) issues.push({ severity: 'error', message: '请先选择可用的 Excel 模板。' });
  else template.errors.forEach((message) => issues.push({ severity: 'error', message }));
  if (!projects.length)
    issues.push({ severity: 'error', message: '导入文案或新增项目后，即可开始校验。' });
  const ids = new Set<string>();
  for (const project of projects) {
    const id = project.id.trim();
    const error = (message: string) =>
      issues.push({ severity: 'error', projectId: project.id, message });
    if (!id) error('项目 ID 不能为空。');
    if (ids.has(id)) error('项目 ID 重复，请修改后导出。');
    ids.add(id);
    const locales = Object.entries(project.locales);
    if (!locales.length) error('请至少添加一种语言。');
    for (const [locale, items] of locales) {
      if (template && template.locales[locale] === undefined)
        error(`模板中不存在语言 ${locale}，请调整语言或模板映射。`);
      if (!items.length) error(`${locale} 没有文案组。`);
      if (template && items.length > template.pairs.length)
        error(
          `${locale} 有 ${items.length} 组，超过模板的 ${template.pairs.length} 组容量。请减少组数或替换模板。`,
        );
      items.forEach((item, i) => {
        for (const field of ['title', 'subTitle'] as const) {
          const value = item[field];
          if (!value.trim()) error(`${locale} 第 ${i + 1} 组缺少 ${field}。`);
          if (value.length > 32767)
            error(`${locale} 第 ${i + 1} 组 ${field} 超过 Excel 的 32,767 字符限制。`);
          if (
            /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
              value,
            )
          )
            error(`${locale} 第 ${i + 1} 组 ${field} 含无法写入 Excel 的控制字符。`);
        }
      });
      const counts = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      items.forEach((item, i) => {
        if (Array.from(counts.segment(item.title)).length > 60)
          issues.push({
            severity: 'warning',
            projectId: project.id,
            message: `${locale} 第 ${i + 1} 组 title 超过 60 个可见字符，请检查 Push 展示效果。`,
          });
      });
    }
  }
  return issues;
}
