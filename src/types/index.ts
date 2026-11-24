export const copyLocales = ['en_US', 'es_ES'] as const;
export type CopyLocale = (typeof copyLocales)[number];
export type CopyItem = { title: string; subTitle: string };
export type CopyRow = {
  id: string;
  rowNumber: number;
  source: string;
  locales: Record<CopyLocale, CopyItem[]>;
};
export type SheetInfo = { name: string; path: string; rows: string[][] };
export type TemplateInfo = {
  bytes: Uint8Array;
  path: string;
  locales: Record<CopyLocale, number>;
  pairs: { title: number; subTitle: number }[];
};
export type ExportFile = { name: string; bytes: Uint8Array };
