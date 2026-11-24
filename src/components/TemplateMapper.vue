<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Plus, X } from '@lucide/vue';
import type { TemplateInfo, TemplateMapping } from '../types';
import { autoTemplateMapping, mapTemplate } from '../core/inspect-template';
import { columnName } from '../core/ooxml';
const props = defineProps<{ template: TemplateInfo }>();
const emit = defineEmits<{ change: [info: TemplateInfo] }>();
const entries = ref<{ locale: string; col: number }[]>([]);
const localeError = ref('');
watch(
  () => props.template,
  (value) => {
    entries.value = Object.entries(value.locales).map(([locale, col]) => ({ locale, col }));
  },
  { immediate: true },
);
const headers = computed(
  () =>
    props.template.sheets[props.template.sheetIndex].rows[props.template.mapping.headerRow - 1] ??
    [],
);
function update(key: keyof TemplateMapping, value: string | number) {
  emit(
    'change',
    mapTemplate(props.template, props.template.sheetIndex, {
      ...props.template.mapping,
      [key]: value,
    }),
  );
}
function changeSheet(event: Event) {
  const index = Number((event.target as HTMLSelectElement).value);
  emit(
    'change',
    mapTemplate(props.template, index, autoTemplateMapping(props.template.sheets[index].rows)),
  );
}
function applyLocales() {
  const locales = entries.value.map((e) => e.locale.trim());
  if (locales.some((l) => !l) || new Set(locales).size !== locales.length) {
    localeError.value = '语言代码不能为空或重复。';
    return;
  }
  localeError.value = '';
  emit(
    'change',
    mapTemplate(props.template, props.template.sheetIndex, {
      ...props.template.mapping,
      localeColumns: Object.fromEntries(entries.value.map((e) => [e.locale.trim(), e.col])),
    }),
  );
}
</script>

<template>
  <details class="mapping-details template-mapping">
    <summary>模板映射与高级设置</summary>
    <div class="mapping-body">
      <label
        >目标工作表<select :value="template.sheetIndex" @change="changeSheet">
          <option v-for="(sheet, i) in template.sheets" :key="sheet.path" :value="i">
            {{ sheet.name }}
          </option>
        </select></label
      >
      <div class="two-columns">
        <label
          >表头行号<input
            type="number"
            min="1"
            max="20000"
            :value="template.mapping.headerRow"
            @change="update('headerRow', Number(($event.target as HTMLInputElement).value))"
        /></label>
        <label
          >类型列<select
            :value="template.mapping.typeColumn"
            @change="update('typeColumn', Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="(header, i) in headers" :key="i" :value="i">
              {{ columnName(i) }} · {{ header }}
            </option>
          </select></label
        >
      </div>
      <div class="two-columns">
        <label
          >主标题行标签<input
            :value="template.mapping.titleLabel"
            @change="update('titleLabel', ($event.target as HTMLInputElement).value)"
        /></label>
        <label
          >副标题行标签<input
            :value="template.mapping.subTitleLabel"
            @change="update('subTitleLabel', ($event.target as HTMLInputElement).value)"
        /></label>
      </div>
      <details class="locale-mapping">
        <summary>语言列（{{ entries.length }}）</summary>
        <div v-for="(entry, i) in entries" :key="i" class="mapping-entry">
          <input v-model="entry.locale" aria-label="模板语言代码" />
          <select v-model="entry.col" aria-label="模板语言对应列">
            <option v-for="(header, col) in headers" :key="col" :value="col">
              {{ columnName(col) }} · {{ header }}
            </option>
          </select>
          <button class="icon-button" aria-label="移除模板语言映射" @click="entries.splice(i, 1)">
            <X :size="16" />
          </button>
        </div>
        <button class="button text small" @click="entries.push({ locale: '', col: 0 })">
          <Plus :size="16" />添加语言
        </button>
        <p v-if="localeError" class="error-text">{{ localeError }}</p>
        <button class="button secondary small" @click="applyLocales">应用语言映射</button>
      </details>
      <p v-for="error in template.errors" :key="error" class="error-text">{{ error }}</p>
    </div>
  </details>
</template>
