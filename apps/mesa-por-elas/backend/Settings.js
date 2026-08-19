/**
 * Settings.js — Leitura e escrita da aba "settings" (config. chave/valor).
 * Schema: setting_id | setting_key | setting_value
 *
 * Os nomes das funções (readConfig/saveConfig) e a "ação" da API
 * (getConfig/saveConfig) continuam iguais de propósito — só o que está
 * gravado na planilha mudou de nome. Isso evita qualquer alteração no
 * frontend ou em Main.js só por causa dessa reformulação de schema.
 */

const SHEET_SETTINGS = 'settings';
const SETTINGS_HEADERS = ['setting_id', 'setting_key', 'setting_value'];

function getSettingsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
}

function readConfig() {
  const sheet = getSettingsSheet();
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), SETTINGS_HEADERS.length).getValues();
  const map = {};
  values.forEach(function (r) { map[r[1]] = r[2]; }); // setting_key -> setting_value
  return { goal: Number(map.goal) || 5000 };
}

/** Próximo setting_id sequencial, mesma lógica usada em Users.js/Sales.js. */
function getNextSettingsId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let max = 0;
  ids.forEach(function (r) {
    const n = Number(r[0]);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function saveConfig(goal) {
  const sheet = getSettingsSheet();
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), SETTINGS_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][1] === 'goal') {
      sheet.getRange(i + 2, 3).setValue(Number(goal));
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  const id = getNextSettingsId(sheet);
  sheet.appendRow([id, 'goal', Number(goal)]);
  SpreadsheetApp.flush();
  return { ok: true };
}
