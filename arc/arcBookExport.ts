/**
 * arc/arcBookExport.ts
 *
 * ARC Book task, spec section 2 step 5 ("ייצוא הספר לקובץ קריא, עם
 * תמיכה מלאה בעברית/RTL"). Builds a plain RTL HTML document (book
 * title/purpose + each chapter's own name and content, in structure
 * order) and renders it to a real PDF via expo-print, then hands it to
 * expo-sharing's native share sheet so the trainee can save/send it --
 * documented flow per https://docs.expo.dev/versions/v57.0.0/sdk/print/
 * ("const { uri } = await Print.printToFileAsync({ html })") and
 * https://docs.expo.dev/versions/v57.0.0/sdk/sharing/. `dir="rtl"` +
 * `lang="he"` on the root element is the one RTL-specific piece --
 * neither SDK page documents its own RTL handling, so the HTML/CSS
 * carries it entirely.
 *
 * The only module in this feature that imports expo-print/expo-sharing
 * -- everything else here (arc/arcWriting.ts, the storage layer, every
 * screen) stays free of this one-off dependency.
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

import type { ArcBook, ArcBookChapter } from "./arcWriting.ts";
import { resolveChaptersForBook } from "./arcWriting.ts";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((paragraph) => `<p>${escapeHtml(paragraph) || "&nbsp;"}</p>`)
    .join("\n");
}

export function buildArcBookExportHtml(book: ArcBook, chapters: ArcBookChapter[]): string {
  const ordered = resolveChaptersForBook(chapters, book.id);
  const chaptersHtml = ordered
    .map((chapter) => `<section><h2>${escapeHtml(chapter.name)}</h2>${renderParagraphs(chapter.content)}</section>`)
    .join("\n");
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; direction: rtl; text-align: right; line-height: 1.6; }
  h1 { font-size: 24px; }
  h2 { font-size: 18px; margin-top: 28px; }
  p { font-size: 14px; }
  .purpose { color: #555; font-size: 13px; margin-bottom: 24px; }
</style>
</head>
<body>
<h1>${escapeHtml(book.name)}</h1>
<p class="purpose">${escapeHtml(book.purpose)}</p>
${chaptersHtml}
</body>
</html>`;
}

/** Renders the book to a PDF file and opens the native share sheet -- never throws into the caller's render; any failure is surfaced via a plain Alert, same convention as every other "something went wrong" path in this app. */
export async function exportArcBookToPdf(book: ArcBook, chapters: ArcBookChapter[]): Promise<void> {
  try {
    const html = buildArcBookExportHtml(book, chapters);
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert("ייצוא הושלם", "קובץ ה-PDF נוצר, אך שיתוף קבצים אינו זמין במכשיר הזה.");
      return;
    }
    await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
  } catch (error) {
    console.warn("[arcBookExport] Failed to export book to PDF.", error);
    Alert.alert("שגיאה בייצוא", "לא ניתן היה לייצא את הספר לקובץ PDF.");
  }
}
