import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import type { CopyRow } from '../src/types';
import { escapeXml } from '../src/core/ooxml';

export async function defaultBytes(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve('public/templates/push-default.xlsx')));
}

function sampleCopy(locale: string, i: number) {
  return Array.from({ length: 3 }, (_, j) => ({
    title: `${locale} campaign ${i + 1} / ${j + 1} 🇨🇱👨‍👩‍👧‍👦👍🏽1️⃣`,
    subTitle: `  ${locale} detail ${i + 1} / ${j + 1}\t & < > " _x0041_`,
  }));
}

export function syntheticRows(count = 7): CopyRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    rowNumber: i + 1,
    source: 'source.csv',
    locales: { en_US: sampleCopy('en_US', i), es_ES: sampleCopy('es_ES', i) },
  }));
}

export function syntheticCsv(count = 7): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return (
    '\uFEFF' +
    syntheticRows(count)
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
