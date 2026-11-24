# PushSheet Studio

在浏览器中将多语言 Push 文案批量填入 Excel 模板。支持文件导入、粘贴解析与手动编辑，每个项目生成一个 XLSX，也可打包下载 ZIP。

Vue 3 · TypeScript · Vite · PapaParse · JSZip。纯前端，无服务端、登录、分析脚本或文案持久化。

## 开始使用

需要 **Node.js 22.12 或更高版本**。

```bash
npm ci
npm run dev
```

打开终端显示的本地地址。点击「载入示例」即可使用合成文案体验完整流程。

```bash
npm test         # 合成数据回归测试
npm run build    # TypeScript 检查与生产构建
npm run preview  # 预览 dist/ 生产产物
```

## 使用流程

1. 上传一个或多个 CSV / XLSX / TSV / TXT 源文件，或者切换「粘贴解析」「手动输入」。单次支持 50 个文件，单文件最大 20 MB，单批合计最大 100 MB。
2. 默认使用「push加班」的空白模板；也可上传自己的 XLSX、选择工作表、设置表头行、类型列、主 / 副行标签和语言列。
3. 核对自动识别结果。无表头源文件默认第一列为项目 ID，后两个有效列为 en_US、es_ES，可在「源文件与字段映射」中修改。重新解析会明确提示覆盖当前编辑。
4. 在共用编辑器中修改项目 ID、名称和多语言文案。可新增、搜索、复制、删除项目，新增 / 删除语言，新增 / 复制 / 删除文案组。
5. 查看「映射预览」，确认目标工作表、语言列、组次和行号。修正校验错误后，生成并下载 ZIP；生成列表提供每个 XLSX 的独立下载。

文案只保存在当前页面内存中，刷新页面后清空。下载与解析均在浏览器本地完成。默认模板和网站资源仍需要正常加载；应用没有上传文案的 API。

## 源数据格式

### 每个语言单元格包含多组文案

CSV 应使用标准引号包裹含换行或逗号的字段。支持 UTF-8 和 UTF-8 BOM；其他编码会提示先另存为 UTF-8。

```csv
id,en_US,es_ES
weekend,"1.主：Hello, Chile 🇨🇱
副：Discover something new
2. 主:Weekend inspiration ✨
副:Make time for a little adventure","1.主：Hola, Chile 🇨🇱
副：Descubre algo nuevo
2. 主:Ideas para el fin de semana ✨
副:Disfruta de una pequeña aventura"
```

支持 `1. 主：`、`1.主:`、`主标题：`、`副标题：`、`title:`、`subTitle:` 等写法。**只剥离结构标签，标签后的空格、制表符、换行、标点和 Unicode 不会被 trim 或改写**。例如 `主： Hello` 会保留 Hello 前的空格。

无表头时，每条非空记录作为一个项目。额外的非空未映射列会提示用户核对，缺少 ID 或无法识别的文案会给出导入问题。接受解析结果需用户明确操作，接受后仍须通过语义校验。

### 已排版的 Excel

支持直接读取与目标模板相似的 XLSX：表头包含 `TextType` 和语言代码，其下有 `title` / `subTitle` 配对行。每张非空数据表作为一个项目，文件名与工作表名用于定位；空语言列不会被导入。多文件或多工作表可以批量处理。

### 每行一组文案

```csv
id,locale,title,subTitle
weekend,en_US,Hello 🇨🇱,Discover something new
weekend,es_ES,Hola 🇨🇱,Descubre algo nuevo
```

同一项目、同一语言按记录顺序组成多组文案。

### 直接粘贴文本

支持完整 CSV、Excel 复制出的制表符表格，也支持使用项目与语言标题分区的文本：

```text
项目 weekend / en_US
1. 主：Hello, Chile 🇨🇱
副：Discover something new
项目 weekend / es_ES
1. 主：Hola, Chile 🇨🇱
副：Descubre algo nuevo
```

只粘贴一段主 / 副文案时，使用界面设置的默认项目 ID 和语言。也支持独立的 `en_US` / `es_ES` 语言分区。

## 模板与写入规则

- 按语言**表头名称**定位列，不将 en_US / es_ES 固定为 C / H。自定义模板也可明确修改语言列映射。
- 按 TextType 顺序配对第 N 个 title 和 subTitle。行标签缺失 / 不成对、语言列重复、项目 ID 重复、字段缺失、语言不在模板中、文案组超出容量时，阻止导出。
- 默认模板为 3 组、36 种语言。每个项目可填写不同数量的文案组；超出模板组数时不自动扩展行。
- 已选择语言的**全部文案槽位**都会替换，没有填写的组会清空，避免保留模板示例。未选择的语言默认不改。
- 可明确勾选「清空未填写语言的占位文案」。预览显示其影响；只清空语言列中的主 / 副文案行。
- 保留 ID、表头、其他工作表、无关单元格、隐藏行列、宽高、边框、对齐、合并区域和模板图片。导出不重建整个工作簿。
- 文件名为 `push_<项目 ID>.xlsx`。过滤非法路径字符，并处理替换后重名及大小写重名。ZIP 名称为 `pushsheet_export.zip`。

## Excel 保真与 Emoji

XLSX 作为 ZIP 打开，仅定向修改选中工作表的目标 `<c>` 单元格。其他 ZIP 部件的**解压后 payload**保持逐字节一致；ZIP 的压缩流、目录和文件级二进制不承诺一致。

目标单元格保留 `s` 样式引用，原来的 sharedStrings 也不重写。新文本写成 `inlineStr` 富文本，普通文字继承模板字体属性，Emoji 优先继承原有富文本字体。没有 Emoji 字体样例时使用 Segoe UI Emoji。使用 `Intl.Segmenter` 按完整字符簇分段，保留国旗的区域指示符、肤色、变体选择符、ZWJ 家庭和键帽序列。文字以文本节点写入，`=...` 不会变成公式。

不同系统的 Excel / WPS 可能通过字体回退呈现 Emoji，不能保证像素级相同。模板中嵌入的图片随原有 ZIP 部件保留；源文件图片不做 OCR，也不会当作文案导入。

默认模板根据用户提供的「push加班」制作，保留布局和样式，清空文案单元格，将字体样例替换为合成文本，并移除原作者、自定义文档属性和打印机配置。用户上传的自定义模板不会执行这一步清理。

## 验证

测试覆盖解析容错、CSV 引号 / 多行、Unicode / 空格保留、字段映射、缺失字段、重复 ID、超出容量、15 个项目的 ZIP 导出、文件名冲突、富文本字体和非目标 ZIP 部件保真。

真实文件只在本机读取，不放进公开仓库。可按以下约定重跑：

```bash
# 目录中包含 无标题表格.csv、push加班.xlsx、项目1_Push文案.xlsx
PUSHSHEET_FIXTURES_DIR=/path/to/private-files npm run check:examples
```

真实文件测试会核对 7 个项目 × 2 种语言 × 3 组 = 42 组配对、84 条字段值，确认 ZIP 有 7 个独立文件，并比较所有非目标部件。输出仅保存在被 Git 忽略的 `.local/regression/`，不要公开提交。

## 部署

`npm run build` 生成静态 `dist/`，可部署到 GitHub Pages、Cloudflare Pages、Vercel 或任意静态托管。资源使用相对路径，可放在仓库子路径下。

- CI 在 push / pull request 时执行安装、测试和构建。
- 可选的 `Deploy to GitHub Pages` 工作流仅**手动触发**。先在仓库 Settings → Pages 中将 Source 设为 GitHub Actions，再运行该工作流。
- 应用不要求 Sites、云数据库、服务器或环境密钥。

## 代码结构

```text
public/templates/            # 已清理的默认模板
src/components/              # 上传、映射、编辑、预览、校验与导出
src/core/parse-copy.ts       # 主/副结构解析，保留原文
src/core/parse-source.ts     # CSV/XLSX/粘贴 → 统一数据模型
src/core/inspect-template.ts # 模板结构与映射
src/core/ooxml.ts            # ZIP 限额、XML 与工作簿读取
src/core/validate.ts         # 导出前语义校验
src/core/fill-xlsx.ts        # 富文本与定向 XML 更新
src/core/export-batch.ts     # 顺序生成、文件名与 ZIP
tests/                      # 仅合成 fixtures；真实文件通过环境路径读取
```

当前版本不支持 `.xls`、带宏 / 加密 / ZIP64 / Strict OOXML 工作簿、自动扩展模板行、OCR 和云端保存。单表最多解析 20,000 行、512 列、20 万个实际单元格，单工作簿最多 50 张工作表、解压后不超过 100 MB。

MIT License。
