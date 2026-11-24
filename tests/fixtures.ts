import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import type { PushProject } from '../src/types';
import { escapeXml } from '../src/core/ooxml';

export async function defaultBytes(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve('public/templates/push-default.xlsx')));
}

export function syntheticProjects(count = 7): PushProject[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    locales: Object.fromEntries(
      ['en_US', 'es_ES'].map((locale) => [
        locale,
        Array.from({ length: 3 }, (_, j) => ({
          title: `${locale} campaign ${i + 1} / ${j + 1} 🇨🇱👨‍👩‍👧‍👦👍🏽1️⃣`,
          subTitle: `  ${locale} detail ${i + 1} / ${j + 1}\t & < > " _x0041_`,
        })),
      ]),
    ),
  }));
}

export function syntheticCsv(count = 7): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return (
    '\uFEFF' +
    syntheticProjects(count)
      .map((p) =>
        [
          p.id,
          ...Object.values(p.locales).map((items) =>
            items.map((item, i) => `${i + 1}.主：${item.title}\n副：${item.subTitle}`).join('\n'),
          ),
        ]
          .map(quote)
          .join(','),
      )
      .join('\n') +
    '\n,,,,\n,,,,\n'
  );
}

export async function mutateTemplate(
  update: (zip: JSZip) => void | Promise<void>,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await defaultBytes());
  await update(zip);
  return zip.generateAsync({ type: 'uint8array' });
}

export const inlineCell = (ref: string, value: string) =>
  `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
