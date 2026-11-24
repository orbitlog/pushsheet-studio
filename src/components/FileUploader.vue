<script setup lang="ts">
import { ref } from 'vue';
import { Upload, FileSpreadsheet } from '@lucide/vue';
defineProps<{
  accept: string;
  multiple?: boolean;
  compact?: boolean;
  title: string;
  hint: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ files: [files: File[]] }>();
const dragging = ref(false);
function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) emit('files', Array.from(input.files));
  input.value = '';
}
function drop(event: DragEvent, disabled?: boolean) {
  dragging.value = false;
  if (!disabled && event.dataTransfer?.files.length)
    emit('files', Array.from(event.dataTransfer.files));
}
</script>

<template>
  <label
    class="upload-zone"
    :class="{ dragging, compact, disabled }"
    @dragover.prevent="!disabled && (dragging = true)"
    @dragleave.prevent="dragging = false"
    @drop.prevent="drop($event, disabled)"
  >
    <input
      class="sr-only"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      @change="choose"
    />
    <span class="upload-icon"
      ><FileSpreadsheet v-if="compact" :size="24" /><Upload v-else :size="26"
    /></span>
    <span class="upload-title">{{ title }}</span>
    <span class="upload-hint">{{ hint }}</span>
    <span v-if="!compact" class="button secondary small">选择源文件</span>
  </label>
</template>
