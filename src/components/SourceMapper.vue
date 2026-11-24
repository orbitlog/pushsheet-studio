<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Plus, X } from '@lucide/vue';
import type { SourceMapping, SourceTable } from '../types';
import { columnName } from '../core/ooxml';
const props = defineProps<{ tables: SourceTable[] }>();
const emit = defineEmits<{ apply: [index: number, mapping: SourceMapping] }>();
const selected = ref(0);
const header = ref(false);
const idColumn = ref(0);
const entries = ref<{ locale: string; col: number }[]>([]);
const table = computed(() => props.tables[selected.value]);
const columns = computed(() =>
  Array.from({ length: Math.max(...(table.value?.rows.map((r) => r.length) ?? [0])) }, (_, i) => ({
    index: i,
    label: `${columnName(i)} 列${header.value ? ` · ${table.value?.rows[0]?.[i] || '空表头'}` : ''}`,
  })),
);
watch(
  table,
  (value) => {
    if (!value) return;
    header.value = value.mapping.header;
    idColumn.value = value.mapping.idColumn;
    entries.value = Object.entries(value.mapping.localeColumns).map(([locale, col]) => ({
      locale,
      col,
    }));
  },
  { immediate: true },
);
const mappingError = computed(() => {
  const locales = entries.value.map((e) => e.locale.trim());
  if (locales.some((l) => !l) || new Set(locales).size !== locales.length)
    return '语言代码不能为空或重复。';
  const cols = [idColumn.value, ...entries.value.map((e) => e.col)];
  if (new Set(cols).size !== cols.length) return '项目 ID 和各语言必须映射到不同的列。';
  return '';
});
function apply() {
  if (mappingError.value) return;
  emit('apply', selected.value, {
    header: header.value,
    idColumn: idColumn.value,
    localeColumns: Object.fromEntries(entries.value.map((e) => [e.locale.trim(), e.col])),
  });
}
</script>

<template>
  <details v-if="tables.length" class="mapping-details">
    <summary>
      源文件与字段映射 <span>{{ tables.length }} 张数据表</span>
    </summary>
    <div class="mapping-body">
      <label
        >数据表<select v-model="selected">
          <option v-for="(source, i) in tables" :key="i" :value="i">{{ source.name }}</option>
        </select></label
      >
      <template v-if="table?.shape === 'wide'">
        <label class="check"><input v-model="header" type="checkbox" />第一行是表头</label>
        <label
          >项目 ID<select v-model="idColumn">
            <option v-for="col in columns" :key="col.index" :value="col.index">
              {{ col.label }}
            </option>
          </select></label
        >
        <div v-for="(entry, i) in entries" :key="i" class="mapping-entry">
          <label
            >语言代码<input v-model="entry.locale" aria-label="源文件语言代码" placeholder="en_US"
          /></label>
          <label
            >源文件列<select v-model="entry.col">
              <option v-for="col in columns" :key="col.index" :value="col.index">
                {{ col.label }}
              </option>
            </select></label
          >
          <button class="icon-button" aria-label="移除源语言映射" @click="entries.splice(i, 1)">
            <X :size="17" />
          </button>
        </div>
        <button
          class="button text small"
          @click="
            entries.push({
              locale: '',
              col:
                columns.find((c) => c.index !== idColumn && !entries.some((e) => e.col === c.index))
                  ?.index ?? 0,
            })
          "
        >
          <Plus :size="16" />添加语言列
        </button>
        <p v-if="mappingError" class="error-text">{{ mappingError }}</p>
        <p class="muted small-text">
          无表头时默认将第 2、3 个有效列识别为
          en_US、es_ES，请核对。重新解析将覆盖当前编辑，并使用全部已导入数据表。
        </p>
        <button
          class="button secondary small"
          :disabled="!!mappingError || !entries.length"
          @click="apply"
        >
          应用映射并重新解析
        </button>
      </template>
      <p v-else class="muted">
        {{
          table?.shape === 'template'
            ? '识别为已排版的 Excel：按 TextType 和语言表头读取，整张表作为一个项目。'
            : '识别为逐行表格：按项目 ID、locale、title、subTitle 读取。'
        }}
      </p>
      <div class="source-sample">
        <strong>源数据抽样（前 3 条）</strong>
        <pre>{{
          table?.rows
            .slice(header ? 1 : 0, header ? 4 : 3)
            .map((row) => row.filter(Boolean).join('  │  '))
            .join('\n\n')
        }}</pre>
      </div>
    </div>
  </details>
</template>
