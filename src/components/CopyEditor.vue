<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy, Plus, Trash2, Languages, MoreHorizontal } from '@lucide/vue';
import type { PushProject } from '../types';
const props = defineProps<{ project: PushProject; locales: string[]; capacity: number }>();
const emit = defineEmits<{ change: []; duplicate: []; remove: [] }>();
const activeLocale = ref('');
const addLocale = ref('');
const selectedLocale = computed(() =>
  Object.hasOwn(props.project.locales, activeLocale.value)
    ? activeLocale.value
    : Object.keys(props.project.locales)[0],
);
const items = computed(() => props.project.locales[selectedLocale.value] ?? []);
const available = computed(() =>
  props.locales.filter((l) => !Object.hasOwn(props.project.locales, l)),
);
watch(
  () => props.project,
  () => {
    activeLocale.value = Object.keys(props.project.locales)[0] ?? '';
    addLocale.value = '';
  },
);
const names: Record<string, string> = {
  en_US: 'English',
  es_ES: 'Español',
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
  ja_JP: '日本語',
  fr_FR: 'Français',
  de_DE: 'Deutsch',
  pt_BR: 'Português',
};
const count = (text: string) =>
  Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;
function addLanguage() {
  if (!addLocale.value || Object.hasOwn(props.project.locales, addLocale.value)) return;
  props.project.locales[addLocale.value] = [{ title: '', subTitle: '' }];
  activeLocale.value = addLocale.value;
  addLocale.value = '';
  emit('change');
}
function removeLanguage(locale: string) {
  if (!window.confirm(`删除 ${locale} 的全部文案？`)) return;
  delete props.project.locales[locale];
  activeLocale.value = Object.keys(props.project.locales)[0] ?? '';
  emit('change');
}
</script>

<template>
  <div class="copy-editor">
    <div class="editor-heading">
      <div class="project-fields">
        <label
          >项目 ID<input
            v-model="project.id"
            placeholder="例如 weekend"
            @input="emit('change')" /></label
        ><label
          >项目名称（选填）<input
            v-model="project.name"
            placeholder="给项目起个名字"
            @input="emit('change')"
        /></label>
      </div>
      <details class="project-menu">
        <summary class="icon-button" aria-label="项目操作"><MoreHorizontal :size="22" /></summary>
        <div>
          <button @click="emit('duplicate')"><Copy :size="16" />复制项目</button
          ><button class="danger" @click="emit('remove')"><Trash2 :size="16" />删除项目</button>
        </div>
      </details>
    </div>
    <div class="language-bar">
      <div class="locale-tabs" role="tablist" aria-label="项目语言">
        <button
          v-for="(_, locale) in project.locales"
          :key="locale"
          role="tab"
          :aria-selected="selectedLocale === locale"
          :class="{ active: selectedLocale === locale }"
          @click="activeLocale = String(locale)"
        >
          <Languages :size="15" />{{ names[locale] || locale }}<span>{{ locale }}</span>
        </button>
      </div>
      <div v-if="available.length" class="add-language">
        <select v-model="addLocale" aria-label="添加项目语言">
          <option value="">添加语言…</option>
          <option v-for="locale in available" :key="locale" :value="locale">
            {{ names[locale] || locale }} · {{ locale }}
          </option></select
        ><button
          class="icon-button"
          :disabled="!addLocale"
          aria-label="确认添加语言"
          @click="addLanguage"
        >
          <Plus :size="18" />
        </button>
      </div>
    </div>
    <div v-if="selectedLocale" class="locale-caption">
      <span>{{ selectedLocale }} · {{ items.length }} 组文案</span
      ><button class="button text small danger" @click="removeLanguage(selectedLocale)">
        删除此语言
      </button>
    </div>
    <div v-if="!selectedLocale" class="inline-empty">从上方选择一种语言，开始填写文案。</div>
    <div v-for="(item, i) in items" :key="`${selectedLocale}-${i}`" class="copy-group">
      <div class="group-heading">
        <strong
          ><span class="group-number">{{ String(i + 1).padStart(2, '0') }}</span
          >第 {{ i + 1 }} 组文案</strong
        >
        <div>
          <button
            class="icon-button"
            aria-label="复制文案组"
            @click="
              items.splice(i + 1, 0, { ...item });
              emit('change');
            "
          >
            <Copy :size="16" /></button
          ><button
            class="icon-button"
            aria-label="删除文案组"
            @click="
              items.splice(i, 1);
              emit('change');
            "
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
      <label class="copy-field"
        ><span
          >主标题 <code>title</code><small>{{ count(item.title) }} 字符</small></span
        ><textarea
          v-model="item.title"
          rows="2"
          placeholder="输入主标题，支持 Emoji 和国旗 🇨🇱"
          :class="{ invalid: !item.title.trim() }"
          @input="emit('change')"
        />
      </label>
      <label class="copy-field"
        ><span
          >副标题 <code>subTitle</code><small>{{ count(item.subTitle) }} 字符</small></span
        ><textarea
          v-model="item.subTitle"
          rows="2"
          placeholder="输入副标题"
          :class="{ invalid: !item.subTitle.trim() }"
          @input="emit('change')"
        />
      </label>
    </div>
    <button
      v-if="selectedLocale"
      class="button add-group"
      @click="
        items.push({ title: '', subTitle: '' });
        emit('change');
      "
    >
      <Plus :size="17" />添加一组文案<span>{{ items.length }} / {{ capacity }} 组</span>
    </button>
    <p v-if="items.length > capacity" class="error-text">
      组数超过模板容量，请删除多余组或更换模板。
    </p>
  </div>
</template>
