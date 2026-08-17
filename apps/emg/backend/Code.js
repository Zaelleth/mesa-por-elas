/**
 * EMG — Financeiro
 * Backend em Apps Script (placeholder inicial)
 */

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, message: 'EMG backend ativo' })
  ).setMimeType(ContentService.MimeType.JSON);
}