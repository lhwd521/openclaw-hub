// Excel (.xlsx/.xls) text extraction using SheetJS from CDN
// Converts spreadsheet data to Markdown tables

export async function extractXlsx(file) {
  const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  let text = "";
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    text += `## ${sheetName}\n\n`;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length > 0) {
      // Markdown table format
      const header = rows[0].map(c => String(c ?? ""));
      text += "| " + header.join(" | ") + " |\n";
      text += "| " + header.map(() => "---").join(" | ") + " |\n";

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].map(c => String(c ?? ""));
        text += "| " + row.join(" | ") + " |\n";
      }
    }
    text += "\n";
  }

  return {
    type: "text",
    fileName: file.name,
    text: text.trim()
  };
}
