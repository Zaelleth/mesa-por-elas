/**
 * Config.js — Meta de vendas (aba "Config").
 */

const SHEET_CONFIG = 'Config';

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
}

function readConfig() {
  const sheet = getConfigSheet();
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), 2).getValues();
  const map = {};
  values.forEach(function (r) { map[r[0]] = r[1]; });
  return { goal: Number(map.goal) || 5000 };
}

function saveConfig(goal) {
  const sheet = getConfigSheet();
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === 'goal') {
      sheet.getRange(i + 2, 2).setValue(Number(goal));
      SpreadsheetApp.flush();
      return { ok: true };
    }
  }
  sheet.appendRow(['goal', Number(goal)]);
  SpreadsheetApp.flush();
  return { ok: true };
}
