// File upload component (images only, converts to base64 attachments)

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function createFileUpload(triggerEl, previewEl, onChange) {
  let files = []; // { type, mimeType, fileName, content (base64) }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.style.display = "none";
  document.body.appendChild(input);

  triggerEl.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    for (const file of input.files) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" exceeds 5MB limit`);
        continue;
      }

      const base64 = await readFileAsBase64(file);
      files.push({
        type: "image",
        mimeType: file.type,
        fileName: file.name,
        content: base64,
      });
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

      const img = document.createElement("img");
      img.src = `data:${files[i].mimeType};base64,${files[i].content}`;
      item.appendChild(img);

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-file";
      removeBtn.textContent = "x";
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

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Result is data:image/...;base64,xxx - extract just the base64 part
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
