<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Clipboard, Download, FileSpreadsheet, LoaderCircle, ShieldCheck } from '@lucide/vue';
import FileUploader from './components/FileUploader.vue';
import { downloadFile, exportBatch, packageDownload } from './core/export-batch';
import { inspectTemplate } from './core/inspect-template';
import { MAX_FILE_SIZE } from './core/ooxml';
import { readSource, readTextSource } from './core/parse-source';
import type { CopyRow, ExportFile, TemplateInfo } from './types';

const templateName = ref('');
const mode = ref<'file' | 'paste'>('file');
const pasted = ref('');
const busy = ref(false);
const status = ref('');
const error = ref('');
const result = shallowRef<{ file: ExportFile; count: number } | null>(null);
let customTemplate: TemplateInfo | undefined;
let defaultTemplate: TemplateInfo | undefined;

function showError(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : '处理失败，请重试。';
}

async function loadDefault() {
  if (defaultTemplate) return defaultTemplate;
  const response = await fetch(`${import.meta.env.BASE_URL}templates/push-default.xlsx`);
  if (!response.ok) throw new Error('默认模板加载失败，请重试。');
  const info = await inspectTemplate(new Uint8Array(await response.arrayBuffer()));
  defaultTemplate = { ...info, extendRows: true };
  return defaultTemplate;
}

async function replaceTemplate(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || busy.value) return;
  busy.value = true;
  status.value = '正在读取模板…';
  error.value = '';
  try {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('模板需要是 .xlsx 文件。');
    if (file.size > MAX_FILE_SIZE) throw new Error('模板不能超过 20 MB。');
    customTemplate = await inspectTemplate(new Uint8Array(await file.arrayBuffer()));
    templateName.value = file.name;
    result.value = null;
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
    status.value = '';
  }
}

function restoreDefault() {
  customTemplate = undefined;
  templateName.value = '';
  error.value = '';
  result.value = null;
}

async function generate(loadRows: () => Promise<CopyRow[]>, readingStatus: string) {
  if (busy.value) return;
  busy.value = true;
  status.value = readingStatus;
  error.value = '';
  result.value = null;
  try {
    const rows = await loadRows();
    const template = customTemplate ?? (await loadDefault());
    status.value = `正在生成 0 / ${rows.length} 份 Excel…`;
    const workbooks = await exportBatch(rows, template, (done, total) => {
      status.value = `正在生成 ${done} / ${total} 份 Excel…`;
    });
    if (workbooks.length > 1) status.value = '正在打包 ZIP…';
    const file = await packageDownload(workbooks);
    result.value = { file, count: workbooks.length };
    downloadFile(file);
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
    status.value = '';
  }
}

function requireCopy(rows: CopyRow[], hint: string): CopyRow[] {
  if (!rows.some((row) => Object.values(row.locales).some((items) => items.length)))
    throw new Error(hint);
  return rows;
}

function generateFiles(files: File[]) {
  if (!files.length) return;
  return generate(async () => {
    if (files.reduce((size, file) => size + file.size, 0) > 100 * 1024 * 1024)
      throw new Error('单次上传的文件合计不能超过 100 MB，请分批选择。');

    const rows: CopyRow[] = [];
    for (const file of files) {
      try {
        if (file.size > MAX_FILE_SIZE) throw new Error('单个文件不能超过 20 MB。');
        const sourceRows = await readSource(new Uint8Array(await file.arrayBuffer()), file.name);
        rows.push(
          ...requireCopy(sourceRows, '没找到可导出的文案。请检查表头或语言标记，例如 FR、fr_FR。'),
        );
      } catch (cause) {
        throw new Error(
          file.name + '：' + (cause instanceof Error ? cause.message : '文件读取失败。'),
        );
      }
    }
    return rows;
  }, '正在读取源文件…');
}

function generatePasted() {
  return generate(async () => {
    if (new TextEncoder().encode(pasted.value).length > MAX_FILE_SIZE)
      throw new Error('粘贴的内容不能超过 20 MB。');
    return requireCopy(
      readTextSource(pasted.value, '粘贴的文案'),
      '没找到文案。请分别用一行写名称和语言标记，例如 FR。',
    );
  }, '正在读取粘贴的文案…');
}

function switchMode(next: typeof mode.value) {
  if (mode.value === next) return;
  mode.value = next;
  result.value = null;
  error.value = '';
}
</script>

<template>
  <header class="topbar">
    <div class="brand"><FileSpreadsheet :size="21" aria-hidden="true" />PushSheet Studio</div>
  </header>
  <main>
    <div class="intro">
      <h1>Push 文案批量转 Excel</h1>
      <p>上传文件或粘贴文案，按语言自动填入模板。多份 Excel 会打包成 ZIP。</p>
    </div>

    <section class="upload-card" aria-labelledby="source-title">
      <h2 id="source-title">文案来源</h2>
      <div class="input-modes" role="group" aria-label="输入方式">
        <button
          type="button"
          :aria-pressed="mode === 'file'"
          :disabled="busy"
          @click="switchMode('file')"
        >
          <FileSpreadsheet :size="16" aria-hidden="true" />上传文件
        </button>
        <button
          type="button"
          :aria-pressed="mode === 'paste'"
          :disabled="busy"
          @click="switchMode('paste')"
        >
          <Clipboard :size="16" aria-hidden="true" />粘贴文案
        </button>
      </div>
      <template v-if="mode === 'file'">
        <p class="format-note">表格按行拆分，TXT 按名称和语言分段拆分。</p>
        <FileUploader
          accept=".csv,.xlsx,.tsv,.txt"
          multiple
          :disabled="busy"
          title="选择或拖入源文件"
          hint="支持 CSV、XLSX、TSV、TXT · 单个文件最大 20 MB"
          @files="generateFiles"
        />
      </template>
      <form v-else class="paste-form" @submit.prevent="generatePasted">
        <p id="paste-hint" class="format-note">
          名称和语言各写一行。只写 FR 也可以，系统会自动找到法语列。
        </p>
        <textarea
          v-model="pasted"
          aria-label="待转换的文案"
          aria-describedby="paste-hint"
          rows="8"
          :disabled="busy"
          placeholder="促销文案：&#10;FR&#10;1. 主：Notre sélection du jour&#10;副：Découvrez les nouveautés"
        />
        <button class="primary-button" :disabled="busy || !pasted.trim()" type="submit">
          生成并下载
        </button>
      </form>

      <div v-if="status" class="feedback" role="status">
        <LoaderCircle class="spinner" :size="18" aria-hidden="true" />
        {{ status }}
      </div>
      <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
      <div v-if="result" class="feedback success" role="status">
        <div>
          <strong>已生成 {{ result.count }} 份 Excel</strong>
          <span class="file-name">{{ result.file.name }}</span>
        </div>
        <button
          class="secondary-button"
          type="button"
          :disabled="busy"
          @click="downloadFile(result.file)"
        >
          <Download :size="16" aria-hidden="true" />重新下载
        </button>
      </div>

      <div class="template-row">
        <div class="template-name">
          <FileSpreadsheet :size="19" aria-hidden="true" />
          <span>{{ templateName || 'push加班 · 默认模板' }}</span>
        </div>
        <div class="template-actions">
          <input
            id="template-file"
            class="sr-only"
            type="file"
            accept=".xlsx"
            :disabled="busy"
            @change="replaceTemplate"
          />
          <label for="template-file" class="secondary-button" :class="{ disabled: busy }"
            >更换模板</label
          >
          <button
            v-if="templateName"
            class="text-button"
            type="button"
            :disabled="busy"
            @click="restoreDefault"
          >
            恢复默认
          </button>
        </div>
      </div>
    </section>

    <p class="privacy-note">
      <ShieldCheck :size="17" aria-hidden="true" />文件仅在当前浏览器内处理。
    </p>
  </main>
</template>
