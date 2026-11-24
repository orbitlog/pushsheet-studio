import JSZip from 'jszip';
import type { CopyRow, ExportFile, TemplateInfo } from '../types';
import { fillXlsx } from './fill-xlsx';

export function safeFilename(value: string): string {
  const safe = value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 100);
  return safe || 'project';
}

export async function exportBatch(
  rows: CopyRow[],
  template: TemplateInfo,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportFile[]> {
  const names = new Set<string>();
  const files: ExportFile[] = [];
  // Sequential generation keeps peak memory predictable with dozens of workbooks.
  for (const row of rows) {
    const base = `push_${safeFilename(row.id)}`;
    let name = `${base}.xlsx`;
    let suffix = 2;
    while (names.has(name.toLowerCase())) name = `${base}_${suffix++}.xlsx`;
    names.add(name.toLowerCase());
    files.push({ name, bytes: await fillXlsx(template, row) });
    onProgress?.(files.length, rows.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return files;
}

export async function packageDownload(files: ExportFile[]): Promise<ExportFile> {
  if (!files.length) throw new Error('源表没有可生成的文案行。');
  if (files.length === 1) return files[0];
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.bytes));
  return {
    name: 'pushsheet_export.zip',
    bytes: await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }),
  };
}

export function downloadFile({ bytes, name }: ExportFile): void {
  const type = name.endsWith('.zip')
    ? 'application/zip'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
