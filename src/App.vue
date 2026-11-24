<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Download, FileSpreadsheet, LoaderCircle, ShieldCheck } from '@lucide/vue';
import FileUploader from './components/FileUploader.vue';
import { downloadFile, exportBatch, packageDownload } from './core/export-batch';
import { inspectTemplate } from './core/inspect-template';
import { MAX_FILE_SIZE } from './core/ooxml';
import { readSource } from './core/parse-source';
import type { CopyRow, ExportFile, TemplateInfo } from './types';

const templateName = ref('');
const busy = ref(false);
const status = ref('');
const error = ref('');
const result = shallowRef<{ file: ExportFile; count: number } | null>(null);
let customTemplate: TemplateInfo | undefined;
let defaultTemplate: TemplateInfo | undefined;

function showError(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : '处理失败，请重新选择文件。';
}

async function loadDefault() {
  if (defaultTemplate) return defaultTemplate;
  const response = await fetch(`${import.meta.env.BASE_URL}templates/push-default.xlsx`);
  if (!response.ok) throw new Error('默认模板加载失败，请重试。');
  defaultTemplate = await inspectTemplate(new Uint8Array(await response.arrayBuffer()));
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

async function generate(files: File[]) {
  if (busy.value || !files.length) return;
  busy.value = true;
  status.value = '正在读取源文件…';
  error.value = '';
  result.value = null;
  try {
    if (files.reduce((size, file) => size + file.size, 0) > 100 * 1024 * 1024)
      throw new Error('单次上传的文件合计不能超过 100 MB，请分批选择。');

    const rows: CopyRow[] = [];
    for (const file of files) {
      try {
        if (file.size > MAX_FILE_SIZE) throw new Error('单个文件不能超过 20 MB。');
        const sourceRows = await readSource(new Uint8Array(await file.arrayBuffer()), file.name);
        if (!sourceRows.some((row) => row.locales.en_US.length || row.locales.es_ES.length))
          throw new Error('没找到英文或西语文案。请检查表头，或将文案放在 B、C 两列。');
        rows.push(...sourceRows);
      } catch (cause) {
        throw new Error(
          `${file.name}：${cause instanceof Error ? cause.message : '文件读取失败。'}`,
        );
      }
    }

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
</script>

<template>
  <header class="topbar">
    <div class="brand"><FileSpreadsheet :size="21" aria-hidden="true" />PushSheet Studio</div>
  </header>
  <main>
    <div class="intro">
      <h1>Push 文案批量转 Excel</h1>
      <p>源表每一行生成一份 Excel，自动填入英文和西语。多份文件会打包成 ZIP。</p>
    </div>

    <section class="upload-card" aria-labelledby="source-title">
      <h2 id="source-title">上传源表</h2>
      <p class="format-note">无表头时，按 A 列编号、B 列英文、C 列西语读取。</p>
      <FileUploader
        accept=".csv,.xlsx,.tsv,.txt"
        multiple
        :disabled="busy"
        title="选择或拖入源文件"
        hint="支持 CSV、XLSX、TSV、TXT · 单个文件最大 20 MB"
        @files="generate"
      />

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
