// File upload component - supports images, PDF, Word, Excel
// All files are processed to extract text content (except images which use base64)

import { extractFileContent } from "./file-extract.js";
import { t } from "../i18n.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB file limit
const MAX_ATTACHMENTS = 4; // max files per message
const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
  "text/plain"
];
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md";

export function createFileUpload(triggerEl, previewEl, onChange) {
  let files = []; // { type, fileName, text?, mimeType?, content? }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ACCEPTED_EXTENSIONS;
  input.multiple = true;
  input.style.display = "none";
  document.body.appendChild(input);

  triggerEl.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const statusEl = document.createElement("div");
    statusEl.className = "file-extract-status";
    statusEl.textContent = t("chat.extracting");
    previewEl.appendChild(statusEl);

    for (const file of input.files) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`${t("chat.extract_fail")}${file.name} (>10MB)`);
        continue;
      }
      if (files.length >= MAX_ATTACHMENTS) {
        alert(`Maximum ${MAX_ATTACHMENTS} files per message`);
        break;
      }

      try {
        const extracted = await extractFileContent(file);
        files.push(extracted);
      } catch (err) {
        console.error("File extraction failed:", err);
        alert(`${t("chat.extract_fail")}${file.name} - ${err.message}`);
      }
    }

    if (statusEl.parentNode) {
      statusEl.remove();
    }
    input.value = "";
    renderPreview();
    onChange(files);
  });

  function renderPreview() {
    previewEl.innerHTML = "";
    for (let i = 0; i < files.length; i++) {
      const item = document.createElement("div");
      item.className = "file-preview-item";

      // Show thumbnail for images, icon for documents
      if (files[i].type === "image") {
        const img = document.createElement("img");
        img.src = `data:${files[i].mimeType};base64,${files[i].content}`;
        item.appendChild(img);
      } else {
        // Document icon
        const icon = document.createElement("div");
        icon.className = "file-preview-doc";
        const ext = files[i].fileName.split(".").pop().toUpperCase();
        icon.textContent = ext;
        item.appendChild(icon);

        const name = document.createElement("div");
        name.className = "file-preview-name";
        name.textContent = files[i].fileName;
        name.title = files[i].fileName;
        item.appendChild(name);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-file";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        files.splice(i, 1);
        renderPreview();
        onChange(files);
      });
      item.appendChild(removeBtn);

      previewEl.appendChild(item);
    }
  }

  return {
    clear() {
      files = [];
      renderPreview();
    },
    getFiles() {
      return files;
    },
  };
}
