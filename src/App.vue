<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import {
  Blocks,
  Check,
  ChevronRight,
  CircleHelp,
  FileSpreadsheet,
  FolderOpen,
  GitFork,
  Keyboard,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  PanelLeftClose,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  X,
} from '@lucide/vue';
import FileUploader from './components/FileUploader.vue';
import SourceMapper from './components/SourceMapper.vue';
import TemplateMapper from './components/TemplateMapper.vue';
import CopyEditor from './components/CopyEditor.vue';
import ProjectPreview from './components/ProjectPreview.vue';
import ExportPanel from './components/ExportPanel.vue';
import type {
  ExportFile,
  Issue,
  PushProject,
  SourceMapping,
  SourceTable,
  TemplateInfo,
} from './types';
import { inspectTemplate } from './core/inspect-template';
import { parsePasted, parseTable, readSource } from './core/parse-source';
import { validate } from './core/validate';
import { downloadBytes, exportBatch, zipBatch } from './core/export-batch';
import { exampleProjects } from './core/example';

const mode = ref<'file' | 'paste' | 'manual'>('file');
const projects = ref<PushProject[]>([]);
const imports = ref<SourceTable[]>([]);
const template = shallowRef<TemplateInfo | null>(null);
const selectedIndex = ref(0);
const search = ref('');
const view = ref<'edit' | 'preview'>('edit');
const importIssues = ref<Issue[]>([]);
const notification = ref<{ kind: 'error' | 'success'; text: string } | null>(null);
const files = shallowRef<ExportFile[]>([]);
const importing = ref(false);
const templateLoading = ref(false);
const exporting = ref(false);
const progress = ref(0);
const clearUnfilled = ref(false);
const showGuide = ref(false);
const guideDialog = ref<HTMLElement | null>(null);
let guidePreviousFocus: HTMLElement | null = null;
watch(showGuide, async (open) => {
  if (open) {
    guidePreviousFocus = document.activeElement as HTMLElement | null;
    await nextTick();
    guideDialog.value?.focus();
  } else guidePreviousFocus?.focus();
});
function trapGuide(event: KeyboardEvent) {
  const controls = Array.from(
    guideDialog.value?.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex="0"]',
    ) ?? [],
  );
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === guideDialog.value)
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || document.activeElement === guideDialog.value)
  ) {
    event.preventDefault();
    first.focus();
  }
}
const sidebarOpen = ref(false);
const pasted = ref('');
const pasteId = ref('project-1');
const pasteLocale = ref('en_US');
let notificationTimer: ReturnType<typeof setTimeout>;

const current = computed(() => projects.value[selectedIndex.value]);
const localeCount = computed(
  () => new Set(projects.value.flatMap((p) => Object.keys(p.locales))).size,
);
const pairCount = computed(() =>
  projects.value.reduce(
    (total, p) => total + Object.values(p.locales).reduce((n, items) => n + items.length, 0),
    0,
  ),
);
const visibleProjects = computed(() =>
  projects.value
    .map((project, index) => ({ project, index }))
    .filter(({ project }) =>
      `${project.id} ${project.name ?? ''}`.toLowerCase().includes(search.value.toLowerCase()),
    ),
);
const issues = computed(() => [...importIssues.value, ...validate(projects.value, template.value)]);
const busy = computed(() => importing.value || templateLoading.value || exporting.value);
const templateLocales = computed(() =>
  Object.keys(template.value?.locales ?? { en_US: 2, es_ES: 7 }),
);
watch(
  [projects, template, clearUnfilled],
  () => {
    files.value = [];
  },
  { deep: true },
);

function notify(text: string, kind: 'error' | 'success' = 'success') {
  clearTimeout(notificationTimer);
  notification.value = { text, kind };
  notificationTimer = setTimeout(
    () => {
      notification.value = null;
    },
    kind === 'error' ? 14000 : 6000,
  );
}
function report(error: unknown) {
  notify(error instanceof Error ? error.message : '操作失败，请重试。', 'error');
}
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  sidebarOpen.value = false;
}
function uniqueId(base = 'project'): string {
  const ids = new Set(projects.value.map((p) => p.id));
  let id = base;
  let i = 1;
  while (ids.has(id)) id = `${base}-${i++}`;
  return id;
}
function newProject() {
  const locales = templateLocales.value.includes('en_US')
    ? ['en_US', ...(templateLocales.value.includes('es_ES') ? ['es_ES'] : [])]
    : templateLocales.value.slice(0, 1);
  projects.value.push({
    id: uniqueId('project'),
    locales: Object.fromEntries(locales.map((locale) => [locale, [{ title: '', subTitle: '' }]])),
  });
  selectedIndex.value = projects.value.length - 1;
  search.value = '';
  view.value = 'edit';
  jump('editor');
}
function duplicateProject() {
  if (!current.value) return;
  const copy: PushProject = JSON.parse(JSON.stringify(current.value));
  copy.id = uniqueId(`${copy.id}-copy`);
  projects.value.push(copy);
  selectedIndex.value = projects.value.length - 1;
  notify('项目已复制。');
}
function removeProject() {
  if (!current.value || !window.confirm(`删除项目 ${current.value.id} 及其全部文案？`)) return;
  projects.value.splice(selectedIndex.value, 1);
  selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, projects.value.length - 1));
}
function reset() {
  if (!window.confirm('清空所有文案、导入记录和生成文件？模板设置会保留。')) return;
  projects.value = [];
  imports.value = [];
  importIssues.value = [];
  files.value = [];
  pasted.value = '';
  selectedIndex.value = 0;
}
function loadExample() {
  const examples = exampleProjects();
  examples.forEach((p) => {
    p.id = uniqueId(p.id);
    projects.value.push(p);
  });
  selectedIndex.value = projects.value.length - examples.length;
  search.value = '';
  notify('已载入 2 个合成示例项目，可直接编辑或导出。');
}
async function loadDefault() {
  templateLoading.value = true;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}templates/push-default.xlsx`);
    if (!response.ok) throw new Error('默认模板加载失败，请重试或上传自定义模板。');
    template.value = await inspectTemplate(
      new Uint8Array(await response.arrayBuffer()),
      'push加班 · 默认模板',
    );
  } catch (error) {
    report(error);
  } finally {
    templateLoading.value = false;
  }
}
async function uploadTemplate(uploaded: File[]) {
  const file = uploaded[0];
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) return notify('模板仅支持 .xlsx 文件。', 'error');
  if (file.size > 20 * 1024 * 1024) return notify('模板不能超过 20 MB。', 'error');
  templateLoading.value = true;
  try {
    const next = await inspectTemplate(new Uint8Array(await file.arrayBuffer()), file.name);
    template.value = next;
    notify(
      next.errors.length ? '模板已读取，请展开模板映射修正识别问题。' : '自定义模板已替换。',
      next.errors.length ? 'error' : 'success',
    );
  } catch (error) {
    report(error);
  } finally {
    templateLoading.value = false;
  }
}
async function uploadSources(uploaded: File[]) {
  importing.value = true;
  const start = projects.value.length;
  const failures: string[] = [];
  try {
    if (uploaded.length > 50) throw new Error('单次最多导入 50 个文件，请分批添加。');
    if (uploaded.reduce((n, file) => n + file.size, 0) > 100 * 1024 * 1024)
      throw new Error('单批源文件合计不能超过 100 MB，请分批导入。');
    for (const file of uploaded) {
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('单个文件不能超过 20 MB。');
        const tables = await readSource(new Uint8Array(await file.arrayBuffer()), file.name);
        if (!tables.length) throw new Error('没有可读取的非空数据表。');
        for (const table of tables) {
          imports.value.push(table);
          const parsed = parseTable(table);
          projects.value.push(...parsed.projects);
          importIssues.value.push(...parsed.warnings);
        }
      } catch (error) {
        failures.push(`${file.name}：${error instanceof Error ? error.message : '读取失败'}`);
      }
    }
    if (projects.value.length > start) {
      selectedIndex.value = start;
      search.value = '';
    }
    if (failures.length) notify(failures.join('\n'), 'error');
    else
      notify(
        `已导入 ${uploaded.length} 个文件，新增 ${projects.value.length - start} 个项目。请核对字段映射和解析结果。`,
      );
  } catch (error) {
    report(error);
  } finally {
    importing.value = false;
  }
}
function reparse(index: number, mapping: SourceMapping) {
  if (!window.confirm('按全部源数据表重新解析？当前编辑和手动新增的项目会被替换。')) return;
  imports.value[index].mapping = mapping;
  const results = imports.value.map(parseTable);
  projects.value = results.flatMap((r) => r.projects);
  importIssues.value = results.flatMap((r) => r.warnings);
  selectedIndex.value = 0;
  search.value = '';
  notify('已使用新映射重新解析。');
}
function parsePaste() {
  try {
    if (!pasteId.value.trim() || !pasteLocale.value.trim())
      throw new Error('请填写默认项目 ID 和语言。');
    const parsed = parsePasted(pasted.value, pasteId.value.trim(), pasteLocale.value.trim());
    if (!parsed.projects.length) throw new Error('没有识别到文案，请检查标签或表格格式。');
    selectedIndex.value = projects.value.length;
    projects.value.push(...parsed.projects);
    importIssues.value.push(...parsed.warnings);
    search.value = '';
    view.value = 'edit';
    notify(`解析完成，新增 ${parsed.projects.length} 个项目。请在下方检查文案。`);
    jump('editor');
  } catch (error) {
    report(error);
  }
}
async function generate() {
  if (!template.value || issues.value.some((i) => i.severity === 'error')) return;
  exporting.value = true;
  progress.value = 0;
  try {
    files.value = await exportBatch(projects.value, template.value, clearUnfilled.value, (done) => {
      progress.value = done;
    });
    downloadBytes(await zipBatch(files.value), 'pushsheet_export.zip', 'application/zip');
    notify(`已生成 ${files.value.length} 个 Excel，ZIP 下载已开始。`);
  } catch (error) {
    files.value = [];
    report(error);
  } finally {
    exporting.value = false;
  }
}
async function downloadZip() {
  try {
    downloadBytes(await zipBatch(files.value), 'pushsheet_export.zip', 'application/zip');
  } catch (error) {
    report(error);
  }
}
onMounted(loadDefault);
</script>

<template>
  <div class="app-shell">
    <button
      class="mobile-menu icon-button"
      aria-label="打开导航"
      @click="sidebarOpen = !sidebarOpen"
    >
      <LayoutGrid :size="22" />
    </button>
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <a class="brand" href="#" @click.prevent="jump('source')"
        ><span class="brand-mark"><FileSpreadsheet :size="24" /></span
        ><span>PushSheet<small>STUDIO</small></span></a
      >
      <span class="sidebar-label">工作空间</span>
      <nav>
        <button class="nav-item active" @click="jump('source')">
          <LayoutGrid :size="18" />文案工作台<span class="nav-indicator"></span></button
        ><button class="nav-item" @click="jump('template')">
          <Table2 :size="18" />Excel 模板<span class="nav-count">{{
            template ? 1 : 0
          }}</span></button
        ><button class="nav-item" @click="jump('editor')">
          <FolderOpen :size="18" />项目与文案<span class="nav-count">{{
            projects.length
          }}</span></button
        ><button class="nav-item" @click="jump('export')">
          <ListChecks :size="18" />校验与导出
        </button>
      </nav>
      <div class="sidebar-tip">
        <div class="tip-icon"><Sparkles :size="21" /></div>
        <strong>从文案到表格，少一点重复。</strong>
        <p>一个模板，多个项目。<br />把时间留给更好的创意。</p>
        <button @click="loadExample">试试示例项目<ChevronRight :size="15" /></button>
      </div>
      <div class="sidebar-bottom">
        <span><LockKeyhole :size="15" />本地处理，安心使用</span
        ><button @click="showGuide = true"><CircleHelp :size="17" />使用指南</button
        ><a href="https://github.com/orbitlog/pushsheet-studio" target="_blank" rel="noreferrer"
          ><GitFork :size="17" />GitHub<span>v0.1.0</span></a
        >
      </div>
      <button class="mobile-close icon-button" aria-label="关闭导航" @click="sidebarOpen = false">
        <PanelLeftClose :size="20" />
      </button>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <span>工作空间 <ChevronRight :size="14" /><strong>文案工作台</strong></span>
        <div>
          <span class="privacy-pill"><ShieldCheck :size="15" />文件不离开你的浏览器</span
          ><button class="icon-button help-button" aria-label="使用指南" @click="showGuide = true">
            <CircleHelp :size="20" />
          </button>
        </div>
      </header>
      <fieldset class="workspace-fieldset" :disabled="busy">
        <div class="page-heading">
          <div>
            <div class="eyebrow">MULTILINGUAL COPY WORKSPACE</div>
            <h1>Push 文案工作台<span class="version-badge">BETA</span></h1>
            <p>导入多语言文案，保留模板格式，一次生成所有项目。</p>
          </div>
          <button class="button secondary" @click="loadExample">
            <Sparkles :size="17" />载入示例
          </button>
        </div>
        <div class="workflow">
          <button class="current" @click="jump('source')">
            <span><Upload :size="16" /></span>
            <div><strong>导入文案</strong><small>文件、粘贴或手动输入</small></div></button
          ><ChevronRight :size="18" /><button
            :class="{ done: !!template }"
            @click="jump('template')"
          >
            <span><Table2 :size="16" /></span>
            <div>
              <strong>确认模板</strong
              ><small>{{ template ? '默认模板已就绪，可随时替换' : '选择目标 Excel 模板' }}</small>
            </div></button
          ><ChevronRight :size="18" /><button @click="jump('editor')">
            <span><ListChecks :size="16" /></span>
            <div><strong>检查与导出</strong><small>预览内容，批量下载</small></div>
          </button>
        </div>
        <div class="import-grid">
          <section id="source" class="card source-card">
            <div class="section-heading">
              <div>
                <span class="section-icon"><Upload :size="19" /></span>
                <h2>文案来源</h2>
              </div>
              <span class="muted small-text">支持一次导入多个文件</span>
            </div>
            <div class="mode-tabs" role="tablist" aria-label="文案输入模式">
              <button
                role="tab"
                :aria-selected="mode === 'file'"
                :class="{ active: mode === 'file' }"
                @click="mode = 'file'"
              >
                <FileSpreadsheet :size="16" />文件导入</button
              ><button
                role="tab"
                :aria-selected="mode === 'paste'"
                :class="{ active: mode === 'paste' }"
                @click="mode = 'paste'"
              >
                <Keyboard :size="16" />粘贴解析</button
              ><button
                role="tab"
                :aria-selected="mode === 'manual'"
                :class="{ active: mode === 'manual' }"
                @click="mode = 'manual'"
              >
                <Plus :size="16" />手动输入
              </button>
            </div>
            <div v-if="mode === 'file'" class="mode-content">
              <FileUploader
                accept=".csv,.xlsx,.tsv,.txt"
                multiple
                :disabled="busy"
                title="将源文件拖到这里，或点击上传"
                hint="CSV / XLSX / TSV / TXT · 单个文件最大 20 MB"
                @files="uploadSources"
              />
              <div class="source-footer">
                <span><Check :size="14" />自动识别项目、语言和主 / 副标题</span
                ><button class="button text small" @click="mode = 'paste'">
                  只有一段文案？试试粘贴
                </button>
              </div>
            </div>
            <div v-else-if="mode === 'paste'" class="mode-content paste-content">
              <div class="two-columns">
                <label>默认项目 ID<input v-model="pasteId" placeholder="project-1" /></label
                ><label
                  >默认语言<select v-model="pasteLocale">
                    <option v-for="locale in templateLocales" :key="locale" :value="locale">
                      {{ locale }}
                    </option>
                  </select></label
                >
              </div>
              <label class="sr-only" for="paste-input">待解析文案</label
              ><textarea
                id="paste-input"
                v-model="pasted"
                rows="6"
                placeholder="项目 campaign-1 / en_US&#10;1. 主：Hello, Chile 🇨🇱&#10;副：Discover this week’s favorites&#10;&#10;也可以直接粘贴 Excel 区域或完整 CSV 内容。"
              />
              <div class="paste-footer">
                <span class="muted small-text"
                  >仅移除结构标签，保留文案中的空格、换行和 Emoji。</span
                ><button
                  class="button primary small"
                  :disabled="!pasted.trim()"
                  @click="parsePaste"
                >
                  <Blocks :size="16" />解析并添加项目
                </button>
              </div>
            </div>
            <div v-else class="mode-content manual-content">
              <span class="manual-icon"><Keyboard :size="30" /></span>
              <h3>从一组文案开始</h3>
              <p>
                新增项目、选择语言，直接填写主标题和副标题。<br />已导入的文案也可以在下方自由编辑。
              </p>
              <button class="button primary" @click="newProject">
                <Plus :size="17" />新增项目
              </button>
            </div>
            <SourceMapper :tables="imports" @apply="reparse" />
          </section>
          <section id="template" class="card template-card">
            <div class="section-heading">
              <div>
                <span class="section-icon"><Table2 :size="19" /></span>
                <h2>目标模板</h2>
              </div>
              <span v-if="template && !template.errors.length" class="badge success">已就绪</span>
            </div>
            <div v-if="templateLoading" class="template-loading">
              <LoaderCircle class="spin" :size="24" />正在读取模板…
            </div>
            <template v-if="template"
              ><div class="template-file">
                <span class="excel-icon"><FileSpreadsheet :size="27" /></span>
                <div>
                  <strong :title="template.name">{{ template.name }}</strong><span
                    >{{ (template.bytes.byteLength / 1024).toFixed(1) }} KB · XLSX</span
                  >
                </div>
                <Check v-if="!template.errors.length" class="green" :size="18" />
              </div>
              <div class="template-stats">
                <div>
                  <span>工作表</span
                  ><strong>{{ template.sheets[template.sheetIndex].name }}</strong>
                </div>
                <div>
                  <span>可填写组数</span><strong>{{ template.pairs.length }} 组 / 语言</strong>
                </div>
                <div>
                  <span>语言列</span
                  ><strong>{{ Object.keys(template.locales).length }} 种语言</strong>
                </div>
              </div>
              <div class="template-languages">
                <span v-for="locale in Object.keys(template.locales).slice(0, 4)" :key="locale">{{
                  locale
                }}</span><span v-if="Object.keys(template.locales).length > 4"
                  >+{{ Object.keys(template.locales).length - 4 }}</span
                >
              </div></template
            >
            <p class="template-description">
              默认使用「push加班」的空白模板，保留原有布局、隐藏列和富文本样式。
            </p>
            <FileUploader
              compact
              accept=".xlsx"
              :disabled="busy"
              title="上传并替换模板"
              hint="使用你自己的 XLSX 格式"
              @files="uploadTemplate"
            />
            <div class="template-actions">
              <button class="button text small" @click="loadDefault">恢复默认模板</button
              ><button
                v-if="template"
                class="button text small"
                @click="downloadBytes(template.bytes, 'push_template.xlsx')"
              >
                下载当前模板
              </button>
            </div>
            <TemplateMapper v-if="template" :template="template" @change="template = $event" />
          </section>
        </div>
        <section id="editor" class="editor-section">
          <div class="editor-section-title">
            <div>
              <h2>项目与文案</h2>
              <span class="muted">{{
                projects.length ? '检查解析结果，点击文案即可修改' : '导入后，所有项目会出现在这里'
              }}</span>
            </div>
            <button class="button text small" :disabled="!projects.length" @click="reset">
              <Trash2 :size="15" />清空工作区
            </button>
          </div>
          <div class="workspace-stats">
            <div>
              <span class="stat-icon"><FolderOpen :size="19" /></span
              ><strong>{{ projects.length }}</strong
              ><span>个项目</span>
            </div>
            <div>
              <span class="stat-icon"><LayoutGrid :size="19" /></span
              ><strong>{{ localeCount }}</strong
              ><span>种语言</span>
            </div>
            <div>
              <span class="stat-icon"><Blocks :size="19" /></span><strong>{{ pairCount }}</strong
              ><span>组文案</span>
            </div>
            <div class="stats-note">
              <ShieldCheck :size="17" /><span>模板样式保留 · Unicode 完整保留</span>
            </div>
          </div>
          <div v-if="importIssues.length" class="import-notice">
            <CircleHelp :size="19" />
            <div>
              <strong>源数据有 {{ importIssues.length }} 条解析提示</strong>
              <p>请展开源文件映射、核对原文与解析结果。未识别内容不会自动补写。</p>
              <button
                class="button text small"
                @click="
                  importIssues = [];
                  notify('已接受当前解析结果，导出仍会校验文案完整性。');
                "
              >
                已核对原文，接受当前解析结果
              </button>
            </div>
          </div>
          <div class="editing-grid">
            <div class="card editor-card">
              <div class="editor-toolbar">
                <h3>文案编辑器</h3>
                <div class="view-tabs">
                  <button :class="{ active: view === 'edit' }" @click="view = 'edit'">
                    编辑文案</button
                  ><button :class="{ active: view === 'preview' }" @click="view = 'preview'">
                    映射预览
                  </button>
                </div>
              </div>
              <div v-if="!projects.length" class="empty-workspace">
                <div class="empty-illustration">
                  <div class="empty-sheet back"></div>
                  <div class="empty-sheet front">
                    <FileSpreadsheet :size="34" /><i></i><i></i><i></i>
                  </div>
                  <span><Plus :size="17" /></span>
                </div>
                <h3>你的下一个 Push 项目，从这里开始</h3>
                <p>上传文案文件、粘贴一段文本，<br />或创建第一个项目。</p>
                <div>
                  <button class="button primary" @click="newProject">
                    <Plus :size="17" />新增项目</button
                  ><button class="button secondary" @click="loadExample">使用示例体验</button>
                </div>
                <small>支持 Emoji、国旗和多语言特殊字符</small>
              </div>
              <div v-else class="editor-layout">
                <aside class="project-list">
                  <label class="project-search"
                    ><Search :size="15" /><input
                      v-model="search"
                      placeholder="搜索项目"
                      aria-label="搜索项目"
                  /></label>
                  <div class="project-list-heading">
                    <span
                      >全部项目 <b>{{ projects.length }}</b></span
                    ><button class="icon-button" aria-label="新增项目" @click="newProject">
                      <Plus :size="18" />
                    </button>
                  </div>
                  <div class="project-items">
                    <button
                      v-for="{ project, index } in visibleProjects"
                      :key="index"
                      :class="{ selected: selectedIndex === index }"
                      @click="selectedIndex = index"
                    >
                      <span class="project-index">{{
                        String(index + 1).padStart(2, '0')
                      }}</span><span
                        ><strong>{{ project.name || project.id || '未命名项目' }}</strong
                        ><small>{{ Object.keys(project.locales).length }} 种语言</small></span
                      ><span
                        v-if="
                          issues.some((i) => i.projectId === project.id && i.severity === 'error')
                        "
                        class="project-error"
                        title="该项目需要修正"
                        >!</span
                      ><Check v-else :size="14" />
                    </button>
                    <p v-if="!visibleProjects.length" class="no-results">没有匹配的项目</p>
                  </div>
                  <button class="button text add-project" @click="newProject">
                    <Plus :size="16" />新增项目
                  </button>
                </aside>
                <div class="editor-main">
                  <CopyEditor
                    v-if="current && view === 'edit'"
                    :project="current"
                    :locales="templateLocales"
                    :capacity="template?.pairs.length ?? 0"
                    @change="files = []"
                    @duplicate="duplicateProject"
                    @remove="removeProject"
                  /><ProjectPreview
                    v-else-if="current && template"
                    :project="current"
                    :template="template"
                    :clear-unfilled="clearUnfilled"
                  />
                  <p v-else class="inline-empty">请先上传可用的模板。</p>
                </div>
              </div>
            </div>
            <ExportPanel
              :issues="issues"
              :files="files"
              :project-count="projects.length"
              :busy="exporting"
              :progress="progress"
              v-model:clear-unfilled="clearUnfilled"
              :template-ready="!!template && !templateLoading"
              @generate="generate"
              @zip="downloadZip"
              @download="downloadBytes($event.bytes, $event.name)"
            />
          </div>
        </section>
      </fieldset>
      <footer class="page-footer">
        <span>PushSheet Studio <span class="footer-dot">·</span> 让每一份文案，各就其位。</span
        ><span><LockKeyhole :size="13" />无注册 · 无服务器上传</span>
      </footer>
    </main>
    <div v-if="notification" class="toast" :class="notification.kind" role="alert">
      <Check v-if="notification.kind === 'success'" :size="20" /><CircleHelp
        v-else
        :size="20"
      /><span>{{ notification.text }}</span
      ><button class="icon-button" aria-label="关闭提示" @click="notification = null">
        <X :size="17" />
      </button>
    </div>
    <div
      v-if="showGuide"
      class="modal-backdrop"
      @click.self="showGuide = false"
      @keydown.esc="showGuide = false"
    >
      <section
        ref="guideDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        class="guide-dialog"
        tabindex="-1"
        @keydown.tab="trapGuide"
      >
        <div class="section-heading">
          <h2 id="guide-title">使用 PushSheet Studio</h2>
          <button class="icon-button" aria-label="关闭使用指南" @click="showGuide = false">
            <X :size="20" />
          </button>
        </div>
        <ol>
          <li>
            <strong>导入文案</strong>
            <p>
              支持多个 CSV / XLSX / TSV / TXT 文件。无表头表格默认第一列为项目
              ID，后两列为英文和西语，可在字段映射里修改。也能读取已按 TextType 排好的 Excel，或包含
              ID、locale、title、subTitle 表头的逐行表格。
            </p>
          </li>
          <li>
            <strong>粘贴与编辑</strong>
            <p>
              可以粘贴完整 CSV、从 Excel 复制的区域，或带主 /
              副标签的文本。多项目和多语言用下方格式分区。标签后的所有空格、换行与 Emoji 都会保留。
            </p>
            <pre>
项目 campaign-1 / en_US&#10;1. 主：Hello, Chile 🇨🇱&#10;副：Explore something new&#10;项目 campaign-1 / es_ES&#10;1. 主：Hola, Chile 🇨🇱&#10;副：Descubre algo nuevo</pre>
          </li>
          <li>
            <strong>确认模板与预览</strong>
            <p>
              默认模板支持 3 组文案。可上传其他
              XLSX，修改工作表、行标签和语言列。超出模板组数会阻止导出。映射预览展示每个值对应的目标行。
            </p>
          </li>
          <li>
            <strong>批量下载</strong>
            <p>
              生成后自动下载 ZIP，也可逐个下载
              Excel。已填写语言会替换全部文案行，未填组次清空；其他语言默认保留。启用清空选项前请查看预览。
            </p>
          </li>
        </ol>
        <div class="guide-note">
          <ShieldCheck :size="20" />
          <p>
            文件只在浏览器内处理，刷新后清空。模板内图片会保留；源文件内嵌图片不做 OCR。国旗等 Emoji
            按完整字符序列保留，实际显示取决于 Excel / WPS 和系统字体。
          </p>
        </div>
        <button class="button primary" @click="showGuide = false">开始使用</button>
      </section>
    </div>
  </div>
</template>
