# 文件上传功能实现说明

## 概述

已成功实现支持 Word、Excel、PDF 和图片的文件上传功能。所有文件类型统一通过前端提取文本内容发送，避免 Cloudflare Tunnel WebSocket 帧大小限制问题。

## 支持的文件类型

| 类型 | 扩展名 | 提取方式 | 使用的库 |
|------|--------|---------|---------|
| PDF | .pdf | 文字提取 | pdf.js (CDN) |
| Word | .docx | 文字提取 | mammoth.js (CDN) |
| Excel | .xlsx, .xls, .csv | 转 Markdown 表格 | SheetJS (CDN) |
| 图片 | .jpg, .png, .gif, .webp | 压缩 base64 | Canvas API (原生) |
| 文本 | .txt, .md, .json, .log, .xml, .yaml | 直接读取 | File API (原生) |

## 新增文件

### 1. `src/components/file-extract.js`
统一文件提取入口，根据文件类型分发到对应的提取器。

### 2. `src/components/extract-pdf.js`
使用 pdf.js 从 CDN 动态加载，提取 PDF 文本内容。

### 3. `src/components/extract-docx.js`
使用 mammoth.js 从 CDN 动态加载，提取 Word 文档文本。

### 4. `src/components/extract-xlsx.js`
使用 SheetJS 从 CDN 动态加载，将 Excel 表格转换为 Markdown 格式。

### 5. `src/components/extract-image.js`
图片压缩和处理逻辑（从原 file-upload.js 移出）。

## 修改的文件

### 1. `src/components/file-upload.js`
- 支持所有文件类型（不再仅限图片）
- 调用 `extractFileContent()` 统一处理
- 预览区：图片显示缩略图，文档显示文件名 + 扩展名图标
- 显示文件提取进度状态

### 2. `src/pages/chat.js`
- `sendMessage()` 函数改造：
  - 分离图片附件和文本文件
  - 文本文件内容拼接到消息文本中
  - 仅图片作为 attachment 发送

### 3. `src/components/message.js`
- 附件渲染支持文档类型
- 图片继续显示图片
- 文档显示文件名徽章

### 4. `src/i18n.js`
新增翻译键：
- `chat.extracting`: "正在提取文件内容..." / "Extracting file content..."
- `chat.extract_fail`: "文件提取失败：" / "File extraction failed: "
- `chat.unsupported_file`: "不支持的文件类型" / "Unsupported file type"

### 5. `src/style.css`
新增样式：
- `.file-preview-item`: 扩大预览区域（80x80）
- `.file-preview-doc`: 文档扩展名图标样式
- `.file-preview-name`: 文档文件名显示
- `.file-extract-status`: 提取状态提示
- `.message-file-badge`: 消息中的文档徽章

## 技术特点

### 1. 零依赖构建
所有第三方库通过 CDN ESM 动态加载：
- `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/+esm`
- `https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm`
- `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm`

### 2. 统一数据格式
所有提取器返回统一格式：
```javascript
{
  type: "text" | "image",
  fileName: string,
  text?: string,        // 文本内容（文档类型）
  mimeType?: string,    // MIME 类型（图片类型）
  content?: string      // base64 内容（图片类型）
}
```

### 3. 避免 WebSocket 断连
- 文档类型：提取文本发送，不传输原始文件
- 图片类型：压缩到 1024x1024，JPEG 质量 0.7
- 文件大小限制：10MB

### 4. 用户体验
- 实时显示提取进度
- 预览区分图片和文档
- 错误提示友好
- 支持多文件上传（最多 4 个）

## 使用方法

1. 点击聊天输入框左侧的附件按钮
2. 选择支持的文件类型（图片、PDF、Word、Excel 等）
3. 等待文件提取完成（显示"正在提取文件内容..."）
4. 预览区显示文件缩略图或文档图标
5. 输入消息或直接发送
6. 文档内容会自动拼接到消息中发送给 AI

## 验证清单

- [x] 上传 PDF → 提取文字并发送
- [x] 上传 .docx → 提取文字并发送
- [x] 上传 .xlsx → 转 Markdown 表格并发送
- [x] 上传图片 → 压缩 base64 发送
- [x] 上传 .txt → 直接读取内容发送
- [x] 不支持的类型 → 显示错误提示
- [x] 大文件（>10MB）→ 显示错误提示
- [x] 多文件上传 → 正常处理
- [x] 预览区显示 → 图片缩略图 + 文档图标
- [x] 国际化支持 → 中英文翻译

## 注意事项

1. **CDN 依赖**：首次加载文件类型时会从 CDN 下载库，需要网络连接
2. **浏览器兼容性**：需要支持 ES6 模块和动态 import
3. **文件大小**：建议单个文件不超过 10MB
4. **Excel 表格**：大型表格会转换为很长的 Markdown 文本，可能影响性能

## 未来改进

1. 添加 OCR 支持（图片文字识别）
2. 支持更多文档格式（.ppt, .odt 等）
3. 文件内容预览功能
4. 压缩算法优化
5. 离线缓存 CDN 库
