<script setup lang="ts">
import { ref } from 'vue';
import { Upload } from '@lucide/vue';
defineProps<{
  accept: string;
  multiple?: boolean;
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
    :class="{ dragging, disabled }"
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
    <span class="upload-icon"><Upload :size="25" aria-hidden="true" /></span>
    <span class="upload-title">{{ title }}</span>
    <span class="upload-hint">{{ hint }}</span>
    <span class="button secondary">选择文件</span>
  </label>
</template>
