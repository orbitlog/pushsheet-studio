<script setup lang="ts">
import type { PushProject, TemplateInfo } from '../types';
import { columnName } from '../core/ooxml';
defineProps<{ project: PushProject; template: TemplateInfo; clearUnfilled: boolean }>();
</script>

<template>
  <div class="project-preview">
    <p class="preview-note">
      工作表 <strong>{{ template.sheets[template.sheetIndex].name }}</strong> ·
      下表展示实际写入内容；保留原有行高、列宽及字体。
    </p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>组次 / 行</th>
            <th>TextType</th>
            <th v-for="(_, locale) in project.locales" :key="locale">
              {{ locale }}
              <small>{{
                template.locales[locale] !== undefined
                  ? columnName(template.locales[locale]) + ' 列'
                  : '未映射'
              }}</small>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(pair, i) in template.pairs" :key="i"
            ><tr v-for="field in ['title', 'subTitle'] as const" :key="field">
              <td>
                {{ i + 1 }} <small>第 {{ pair[field] }} 行</small>
              </td>
              <td>
                <code>{{ field }}</code>
              </td>
              <td v-for="(items, locale) in project.locales" :key="locale" class="copy-cell">
                <span v-if="items[i]?.[field]">{{ items[i]?.[field] }}</span><span
                  v-else
                  class="muted"
                  >清空原占位值</span
                >
              </td>
            </tr></template
          >
        </tbody>
      </table>
    </div>
    <div class="preview-policy">
      <strong>写入策略</strong>
      <p>
        已选语言的全部
        {{ template.pairs.length }} 组文案单元格都会替换，未填写的组会清空，避免遗留示例文案。
      </p>
      <p v-if="clearUnfilled">
        其他
        {{
          Object.keys(template.locales).filter((locale) => !Object.hasOwn(project.locales, locale))
            .length
        }}
        种未填写语言的 {{ template.pairs.length * 2 }} 行文案将一并清空。
      </p>
      <p v-else>未选择的语言列保持原样。ID、表头、其他工作表及模板内图片保持原样。</p>
    </div>
  </div>
</template>
