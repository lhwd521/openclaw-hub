// Unified file content extraction
// Routes to appropriate extractor based on file type

import { extractPdf } from "./extract-pdf.js";
import { extractDocx } from "./extract-docx.js";
import { extractXlsx } from "./extract-xlsx.js";
import { extractImage } from "./extract-image.js";

/**
 * Extract content from any supported file type
 * @param {File} file - The file to extract content from
 * @returns {Promise<{type: string, fileName: string, text?: string, mimeType?: string, content?: string}>}
 */
export async function extractFileContent(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const type = file.type;

  // PDF
  if (type === "application/pdf" || ext === "pdf") {
    return extractPdf(file);
  }

  // Word (.docx)
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx") {
    return extractDocx(file);
  }

  // Excel (.xlsx, .xls, .csv)
  if (["xlsx", "xls", "csv"].includes(ext) ||
      type.includes("spreadsheet") ||
      type === "text/csv" ||
      type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      type === "application/vnd.ms-excel") {
    return extractXlsx(file);
  }

  // Images
  if (type.startsWith("image/")) {
    return extractImage(file);
  }

  // Plain text files (fallback)
  if (type.startsWith("text/") ||
      ["txt", "md", "json", "log", "xml", "yaml", "yml"].includes(ext)) {
    return {
      type: "text",
      fileName: file.name,
      text: await file.text()
    };
  }

  throw new Error(`不支持的文件类型: ${ext}`);
}
