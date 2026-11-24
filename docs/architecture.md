# 实现约定

表格经 `readSource` 逐行生成 `CopyRow`。TXT 和粘贴文本共用分段解析，可以按名称及语言标记生成 `CopyRow`。文件选择、拖放和粘贴共用导出流程，单份 XLSX 直接下载，多份 XLSX 由 `packageDownload` 打为 ZIP。

`inspectTemplate` 通过工作簿关系定位工作表，并识别 `TextType` 与语言表头。源文案与模板共享语言代码规范化规则。导出首先按完整代码匹配，短代码只有一个对应列时也可匹配。找不到列或有多个备选列时提示输入位置。其他 ZIP 部件保持原有内容。

`fillXlsx` 定向修改模板的文案单元格。默认模板可复制末尾的一组格式并增加行，自定义模板按原有容量填充。对普通文字和 Emoji 生成富文本运行段，使用 `Intl.Segmenter` 保留国旗和组合 Emoji 的字符簇。内容按 Excel 文本写入。

应用没有后端、遥测、Cookie 或 LocalStorage。源文件与生成结果只保留在当前页面。真实文件回归通过 `PUSHSHEET_FIXTURES_DIR` 传入，公开测试只使用合成文案和清理后的默认模板。
