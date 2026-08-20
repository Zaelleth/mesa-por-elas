/**
 * ClubEvents.js — CRUD da aba "club_events".
 * Schema: event_id | title | event_date | location | description | club_exclusive
 *
 * Ao contrário de customers/saleitems, aqui a exclusão pelo app é permitida
 * — um encontro cadastrado errado ou cancelado antes de acontecer não tem
 * o mesmo risco de "quebrar" outra tabela que excluir uma cliente ou um
 * item já vendido teria (nenhuma outra tabela referencia event_id hoje).
 */

const SHEET_CLUB_EVENTS = 'club_events';
const CLUB_EVENTS_HEADERS = ['event_id', 'title', 'event_date', 'location', 'description', 'club_exclusive'];

function getClubEventsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLUB_EVENTS);
}

function findClubEventRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function getNextClubEventId(sheet) {
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

function readClubEvents() {
  const sheet = getClubEventsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, CLUB_EVENTS_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        id: String(r[0]),
        title: r[1],
        eventDate: r[2] instanceof Date ? r[2].toISOString() : r[2],
        location: r[3],
        description: r[4],
        clubExclusive: r[5] === true || r[5] === 'TRUE' || r[5] === 'true'
      };
    });
}

function addClubEvent(event) {
  if (!event || !event.title || !event.eventDate) {
    return { ok: false, error: 'Preencha o título e a data do encontro.' };
  }
  const sheet = getClubEventsSheet();
  const id = getNextClubEventId(sheet);
  sheet.appendRow([id, event.title, event.eventDate, event.location || '', event.description || '', !!event.clubExclusive]);
  SpreadsheetApp.flush();
  return {
    ok: true,
    event: { id: String(id), title: event.title, eventDate: event.eventDate, location: event.location || '', description: event.description || '', clubExclusive: !!event.clubExclusive }
  };
}

function updateClubEvent(id, event) {
  if (!event || !event.title || !event.eventDate) {
    return { ok: false, error: 'Preencha o título e a data do encontro.' };
  }
  const sheet = getClubEventsSheet();
  const row = findClubEventRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Encontro não encontrado.' };
  sheet.getRange(row, 2, 1, 5).setValues([[ event.title, event.eventDate, event.location || '', event.description || '', !!event.clubExclusive ]]);
  SpreadsheetApp.flush();
  return { ok: true };
}

function deleteClubEvent(id) {
  const sheet = getClubEventsSheet();
  const row = findClubEventRowById(sheet, id);
  if (row === -1) return { ok: false, error: 'Encontro não encontrado.' };
  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return { ok: true };
}
