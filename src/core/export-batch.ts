import JSZip from 'jszip';
import type { ExportFile, PushProject, TemplateInfo } from '../types';
import { fillXlsx } from './fill-xlsx';
import { validate } from './validate';

export function safeFilename(value: string): string {
  const safe = value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 100);
  return safe || 'project';
}

export async function exportBatch(
  projects: PushProject[],
  template: TemplateInfo,
  clearUnfilled = false,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportFile[]> {
  const errors = validate(projects, template).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(errors[0].message);
  const names = new Set<string>();
  const files: ExportFile[] = [];
  // Sequential generation keeps peak memory predictable with dozens of workbooks.
  for (const project of projects) {
    const base = `push_${safeFilename(project.id)}`;
    let name = `${base}.xlsx`;
    let suffix = 2;
    while (names.has(name.toLowerCase())) name = `${base}_${suffix++}.xlsx`;
    names.add(name.toLowerCase());
    files.push({ name, bytes: await fillXlsx(template, project, clearUnfilled) });
    onProgress?.(files.length, projects.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return files;
}

export async function zipBatch(files: ExportFile[]): Promise<Uint8Array> {
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.bytes));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export function downloadBytes(
  bytes: Uint8Array,
  name: string,
  type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
