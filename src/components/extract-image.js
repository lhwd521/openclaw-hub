// Image extraction and compression
// Keeps images under ~200KB typically, safe for Cloudflare Tunnel

const MAX_IMAGE_DIMENSION = 1024; // max width or height after resize
const JPEG_QUALITY = 0.7; // compression quality

export async function extractImage(file) {
  const compressed = await compressImage(file);
  return {
    type: "image",
    fileName: file.name,
    mimeType: compressed.mimeType,
    content: compressed.base64,
    text: `[图片: ${file.name}]`  // 文本 fallback 描述
  };
}

// Compress image using canvas: resize + JPEG compression
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
