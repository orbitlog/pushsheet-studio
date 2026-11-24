export type CopyItem = { title: string; subTitle: string };
export type PushProject = { id: string; name?: string; locales: Record<string, CopyItem[]> };
export type Issue = { severity: 'error' | 'warning'; message: string; projectId?: string };
export type ParsedInput = { projects: PushProject[]; warnings: Issue[] };
export type SourceMapping = {
  header: boolean;
  idColumn: number;
  localeColumns: Record<string, number>;
};
export type SourceTable = {
  name: string;
  rows: string[][];
  mapping: SourceMapping;
  shape: 'wide' | 'template' | 'long';
  notices?: Issue[];
};
export type SheetInfo = { name: string; path: string; rows: string[][] };
export type TemplateMapping = {
  headerRow: number;
  typeColumn: number;
  titleLabel: string;
  subTitleLabel: string;
  localeColumns?: Record<string, number>;
};
export type TemplateInfo = {
  name: string;
  bytes: Uint8Array;
  sheets: SheetInfo[];
  sheetIndex: number;
  mapping: TemplateMapping;
  locales: Record<string, number>;
  pairs: { title: number; subTitle: number }[];
  errors: string[];
};
export type ExportFile = { name: string; bytes: Uint8Array };
