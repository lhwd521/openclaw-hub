// File upload component (images only, converts to base64 attachments)
// Images are compressed before sending to stay within Cloudflare Tunnel limits

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB original file limit
const MAX_IMAGE_DIMENSION = 1024; // max width or height after resize
const JPEG_QUALITY = 0.7; // compression quality
const MAX_ATTACHMENTS = 4; // max images per message
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
      if (files.length >= MAX_ATTACHMENTS) {
        alert(`Maximum ${MAX_ATTACHMENTS} images per message`);
        break;
      }

      const compressed = await compressImage(file);
      files.push({
        type: "image",
        mimeType: compressed.mimeType,
        fileName: file.name,
        content: compressed.base64,
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

// Compress image using canvas: resize + JPEG compression
// Keeps images under ~200KB typically, safe for Cloudflare Tunnel
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down if larger than max dimension
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
          height = MAX_IMAGE_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Always output as JPEG for smaller size (except GIF)
      const outputType = file.type === "image/gif" ? "image/png" : "image/jpeg";
      const quality = outputType === "image/jpeg" ? JPEG_QUALITY : undefined;
      const dataUrl = canvas.toDataURL(outputType, quality);
      const base64 = dataUrl.split(",")[1];

      resolve({
        base64,
        mimeType: outputType,
      });

      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };
    img.src = URL.createObjectURL(file);
  });
}
