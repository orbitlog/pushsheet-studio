export type CopyItem = { title: string; subTitle: string };
export type CopyRow = {
  id: string;
  rowNumber: number;
  source: string;
  locales: Record<string, CopyItem[]>;
};
export type SheetInfo = { name: string; path: string; rows: string[][] };
export type TemplateInfo = {
  bytes: Uint8Array;
  path: string;
  locales: Record<string, number>;
  pairs: { title: number; subTitle: number }[];
  extendRows?: boolean;
};
export type ExportFile = { name: string; bytes: Uint8Array };
