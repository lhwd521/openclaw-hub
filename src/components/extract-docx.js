// Word (.docx) text extraction using mammoth.js from CDN

export async function extractDocx(file) {
  const mammoth = await import("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  return {
    type: "text",
    fileName: file.name,
    text: result.value.trim()
  };
}
