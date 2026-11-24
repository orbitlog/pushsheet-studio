# PushSheet Studio

上传源表，每条数据行生成一份 Excel。默认把英文和西语写入「push加班」模板。单份直接下载 XLSX，多份自动打包为 ZIP。文件在浏览器内处理。

[打开工作台](https://orbitlog.github.io/pushsheet-studio/)

## 源表格式

- 支持 CSV、XLSX、TSV 和 UTF-8 TXT，可以一次上传多份。
- 用 `en_US` 和 `es_ES` 表头指定语言列，也支持「英文」「西语」等常用列名。无表头时按 A 列编号、B 列英文、C 列西语读取。
- 空行跳过。编号只用于命名文件，缺少编号时使用行号。重复编号按顺序加数字后缀，每行单独生成。
- 单元格内用「主：」「副：」或 `title:`、`subTitle:` 分隔多组文案。无标签的文本整体写入首个主标题。空白文案保留空白，国旗、Emoji、空格和换行随原文写入。

示例 CSV（单元格里有换行时，用双引号包住整格）：

```csv
ID,en_US,es_ES
1,"主：Hello, Chile 🇨🇱
副：Explore this week’s picks","主：Hola, Chile 🇨🇱
副：Explora los favoritos de la semana"
```

## 模板

默认模板有三组主副标题位置。通过「更换模板」可使用其他 XLSX。模板需要 `TextType`、`en_US` 和 `es_ES` 表头，以及成对的 `title` 和 `subTitle` 行。两种语言的文案槽会按源表填充，其余列、布局和内嵌图片保留。文案放不进模板或源表无法读取时，上传区会给出原因。

## 开发

需要 Node.js 22.12 或更高版本。

```bash
npm ci
npm run dev
npm test
npm run build
```

真实文件仅供本机回归。将 `无标题表格.csv`、`push加班.xlsx`、`项目1_Push文案.xlsx` 放在同一个目录，通过下列命令复测。结果写入 Git 忽略的 `.local/regression/`。

```bash
PUSHSHEET_FIXTURES_DIR=/path/to/private-files npm run check:examples
```

OrbitLog 的发布流程会构建本项目并部署到 `/pushsheet-studio/`。本地可用 `npm run build -- --base=/pushsheet-studio/` 生成同样的产物。

MIT License。
