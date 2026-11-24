# 实现约定

源文件经 `readSource` 逐行生成 `CopyRow`，每行包含编号、来源和固定的英文、西语文案。文件选择和拖放共用同一生成入口。生成按行顺序进行，单份 XLSX 直接下载，多份 XLSX 由 `packageDownload` 打为 ZIP。

`inspectTemplate` 通过工作簿关系定位工作表，并识别 `TextType`、`en_US` 和 `es_ES` 表头。默认模板和用户替换的模板共用该路径。目标槽位按读入的内容写入，缺失的文案槽留空，其他 ZIP 部件保持原有内容。

`fillXlsx` 仅修改模板的目标单元格。对普通文字和 Emoji 生成富文本运行段，使用 `Intl.Segmenter` 保留国旗和组合 Emoji 的字符簇。内容按 Excel 文本写入。处理超出模板容量或 Excel 内容限制的文案时，提示具体来源行。

应用没有后端、遥测、Cookie 或 LocalStorage。源文件与生成结果只保留在当前页面。真实文件回归通过 `PUSHSHEET_FIXTURES_DIR` 传入，公开测试只使用合成文案和清理后的默认模板。
