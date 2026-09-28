// Turns an uploaded CV (PDF, DOCX or plain text) into plain text.

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

export async function extractText(fileName: string, bytes: ArrayBuffer): Promise<string> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  let text: string;

  if (ext === ".pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await pdfText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  } else if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = result.value;
  } else if (ext === ".txt" || ext === ".md") {
    text = new TextDecoder().decode(bytes);
  } else {
    throw new Error(`Unsupported file type "${ext}". Upload PDF, DOCX or TXT.`);
  }

  text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 200) {
    throw new Error("Could not read enough text from this file (is it a scanned image?).");
  }
  return text;
}
