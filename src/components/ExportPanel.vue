<script setup lang="ts">
import { computed } from 'vue';
import {
  Check,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Package,
  ShieldCheck,
  LoaderCircle,
} from '@lucide/vue';
import type { ExportFile, Issue } from '../types';
const props = defineProps<{
  issues: Issue[];
  files: ExportFile[];
  projectCount: number;
  busy: boolean;
  progress: number;
  clearUnfilled: boolean;
  templateReady: boolean;
}>();
const emit = defineEmits<{
  generate: [];
  zip: [];
  download: [file: ExportFile];
  'update:clearUnfilled': [value: boolean];
}>();
const errors = computed(() => props.issues.filter((i) => i.severity === 'error'));
const warnings = computed(() => props.issues.filter((i) => i.severity === 'warning'));
const passed = computed(() => props.projectCount > 0 && !errors.value.length);
</script>

<template>
  <aside id="export" class="export-column">
    <section class="card validation-card">
      <div class="card-title">
        <ShieldCheck :size="19" />
        <h3>导出前校验</h3>
        <span class="badge" :class="{ success: passed }">{{ passed ? '校验通过' : '待完善' }}</span>
      </div>
      <div class="validation-summary" :class="{ passed }">
        <span class="validation-icon"
          ><Check v-if="passed" :size="24" /><CircleAlert v-else :size="24"
        /></span>
        <div>
          <strong>{{
            passed
              ? `${projectCount} 个项目已就绪`
              : projectCount
                ? '请先处理以下问题'
                : '等待导入文案'
          }}</strong>
          <p>
            {{
              projectCount
                ? `${errors.length} 项错误 · ${warnings.length} 项提醒`
                : '导入后自动检查文案与模板'
            }}
          </p>
        </div>
      </div>
      <ul v-if="issues.length && projectCount" class="issue-list">
        <li v-for="(issue, i) in issues" :key="i" :class="issue.severity">
          <CircleAlert :size="15" /><span
            ><b v-if="issue.projectId">{{ issue.projectId }} · </b>{{ issue.message }}</span
          >
        </li>
      </ul>
      <ul v-if="passed" class="check-list">
        <li><Check :size="15" />主 / 副标题完整</li>
        <li><Check :size="15" />语言列与模板对应</li>
        <li><Check :size="15" />文案组数未超过模板</li>
      </ul>
    </section>
    <section class="card export-card">
      <div class="card-title">
        <Package :size="20" />
        <h3>生成与下载</h3>
      </div>
      <p class="muted">每个项目生成一个 Excel，批量打包为 ZIP。</p>
      <div class="export-file-summary">
        <FileSpreadsheet :size="28" />
        <div>
          <strong>{{ projectCount }} 个 XLSX 文件</strong><span>push_&lt;项目 ID&gt;.xlsx</span>
        </div>
        <span class="file-type">XLSX</span>
      </div>
      <label class="check advanced-option"
        ><input
          type="checkbox"
          :checked="clearUnfilled"
          @change="emit('update:clearUnfilled', ($event.target as HTMLInputElement).checked)"
        /><span
          >清空未填写语言的占位文案<small
            >会影响所有项目的其他语言列，可在映射预览中检查。</small
          ></span
        ></label
      >
      <button
        class="button primary export-button"
        :disabled="!!errors.length || busy || !templateReady"
        @click="emit('generate')"
      >
        <LoaderCircle v-if="busy" class="spin" :size="18" /><Download v-else :size="18" />{{
          busy
            ? `正在生成 ${progress} / ${projectCount}`
            : projectCount
              ? `生成并下载 ${projectCount} 个文件的 ZIP`
              : '导入文案后生成 ZIP'
        }}
      </button>
      <p v-if="files.length" class="export-success" role="status">
        <Check :size="16" />已生成 {{ files.length }} 个文件
      </p>
      <div v-if="files.length" class="generated-files">
        <button v-for="file in files" :key="file.name" @click="emit('download', file)">
          <FileSpreadsheet :size="16" /><span>{{ file.name }}</span
          ><Download :size="15" /></button
        ><button class="download-zip" @click="emit('zip')">
          <Package :size="16" />重新下载 ZIP<Download :size="15" />
        </button>
      </div>
      <div class="local-note">
        <ShieldCheck :size="15" /><span
          >文案和文件仅在当前浏览器处理。<br />刷新页面后，临时内容自动清空。</span
        >
      </div>
    </section>
  </aside>
</template>
