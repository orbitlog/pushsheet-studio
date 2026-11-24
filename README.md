# PushSheet Studio

上传源表或粘贴文案，按语言自动填入「push加班」模板。单份直接下载 XLSX，多份自动打包为 ZIP。文件在浏览器内处理。

[打开工作台](https://orbitlog.github.io/pushsheet-studio/)

## 源表格式

- 支持 CSV、XLSX、TSV 和 UTF-8 TXT，可以一次上传多份。
- 表格每条数据行生成一份 Excel。TXT 也支持下面的分段文本格式。
- 用语言代码指定表头，例如 `FR`、`fr_FR` 或 `pt-BR`。源表可以只有一种语言，也支持「英文」「西语」「法语」等常用列名。无表头时按 A 列编号、B 列英文、C 列西语读取。
- 空行跳过。编号只用于命名文件，缺少编号时使用行号。重复编号按顺序加数字后缀，每行单独生成。
- 单元格内用「主：」「副：」或 `title:`、`subTitle:` 分隔多组文案。无标签的文本整体写入首个主标题。空白文案保留空白，国旗、Emoji、空格和换行随原文写入。

示例 CSV（单元格里有换行时，用双引号包住整格）：

```csv
ID,en_US,es_ES
1,"主：Hello, Chile 🇨🇱
副：Explore this week’s picks","主：Hola, Chile 🇨🇱
副：Explora los favoritos de la semana"
```

## TXT 和粘贴格式

用单独一行写名称，下方用 EN、ES、FR 或其他语言代码标记每段文案。只有 FR 时，写一个 FR 段即可。多份文案各自使用名称命名；如果下一份文案的语言标记与上一份不同，可在名称后加冒号以明确分段。兼容全角冒号和 Markdown 的编号转义、换行标记。

```text
买免：
EN
1. 主：English title
副：English subtitle
ES
1. 主：Título en español
副：Subtítulo en español
perk折上折
EN
1. 主：Another title
副：Another subtitle
ES
1. 主：Otro título
副：Otro subtítulo
```

## 模板

默认模板从三组主副标题位置起步，组数更多时自动复制行格式并扩充。通过「更换模板」可使用其他 XLSX。自定义模板需要 `TextType` 和至少一个语言表头，以及足够的 `title` 和 `subTitle` 行。

系统优先匹配完整的语言代码。短代码可以匹配唯一的对应列，如默认模板里的 `FR` → `fr_FR`。模板同时有 `fr_FR` 和 `fr_CA` 时，请写完整代码。模板缺少对应列时，页面会提示语言和来源行。

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
