const SPREADSHEET_ID = '1wU99mTHsdFaLqBalR8-pFQA9OvG2BbcDa69muJXNf4w';
const SOURCE_SHEET = '광고용';
const OUTPUT_SHEET = '사이트용상품';
const FLAGS_URL = 'https://raw.githubusercontent.com/eomjinseong-art/Car-Parts-Cpang/main/data/sheet-flags.json';
const RED = '#FEE2E2';
const WHITE = '#FFFFFF';
const FALLBACK_MISSING = [];
const FALLBACK_DUPLICATES = [];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('사이트 상품 관리')
    .addItem('빨간색으로 표시하기', 'markFromGithub')
    .addToUi();
  try {
    markFromGithub();
  } catch (error) {
    SpreadsheetApp.getActive().toast(error.message, '표시 실패');
  }
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  try {
    if (action === 'mark' || action === 'markMissing' || action === 'sync') {
      const missing = parseIds(e.parameter && e.parameter.missing);
      const duplicates = parseIds(e.parameter && e.parameter.duplicates);
      const result = missing.length || duplicates.length
        ? markSheetRows(missing, duplicates)
        : markFromGithub();
      return json(result);
    }
  } catch (error) {
    return json({ success: false, error: error.message });
  }
  return ContentService.createTextOutput('시트를 열면 빨간 행이 자동으로 표시됩니다.');
}

function markFromGithub() {
  let missing = FALLBACK_MISSING;
  let duplicates = FALLBACK_DUPLICATES;
  try {
    const response = UrlFetchApp.fetch(FLAGS_URL, { muteHttpExceptions: true, followRedirects: true });
    if (response.getResponseCode() < 400) {
      const flags = JSON.parse(response.getContentText());
      missing = flags.missing || missing;
      duplicates = flags.duplicates || duplicates;
    }
  } catch (error) {}
  const result = markSheetRows(missing, duplicates);
  try {
    SpreadsheetApp.getActive().toast(
      `이미지 없음 ${result.missing}개, 중복 ${result.duplicates}개를 표시했습니다.`,
      '사이트 상품 관리'
    );
  } catch (error) {}
  return result;
}

function markSheetRows(missingIds, duplicateIds) {
  const spreadsheet = getSpreadsheet();
  const source = spreadsheet.getSheetByName(SOURCE_SHEET);
  if (!source) throw new Error('광고용 탭을 찾을 수 없습니다. 아래쪽 탭에서 광고용을 열어 주세요.');

  const values = source.getDataRange().getDisplayValues();
  if (values.length < 2) throw new Error('광고용 탭에 상품 링크가 없습니다.');

  const missing = new Set((missingIds || []).map(Number));
  const duplicates = new Set((duplicateIds || []).map(Number));
  const statusIndex = ensureStatusColumn(source, values[0]);
  const lastColumn = Math.max(source.getLastColumn(), statusIndex + 1);
  const backgrounds = [];
  const statuses = [];
  const output = [['NO', '쿠팡파트너스 링크', '이미지 상태']];

  for (let i = 1; i < values.length; i++) {
    const id = Number(String(values[i][0] || '').trim());
    const link = String(values[i][1] || '').trim();
    let status = '정상';
    let color = WHITE;
    if (duplicates.has(id)) {
      status = '중복 상품 - 다른 링크로 교체';
      color = RED;
    } else if (missing.has(id)) {
      status = '이미지 없음 - 링크 교체';
      color = RED;
    }
    backgrounds.push(Array(lastColumn).fill(color));
    statuses.push([status]);
    if (link) output.push([id || i, link, status]);
  }

  source.getRange(2, 1, backgrounds.length, lastColumn).setBackgrounds(backgrounds);
  source.getRange(2, statusIndex + 1, statuses.length, 1).setValues(statuses);
  source.getRange(1, statusIndex + 1).setValue('이미지 상태');
  source.setFrozenRows(1);

  let target = spreadsheet.getSheetByName(OUTPUT_SHEET);
  if (!target) target = spreadsheet.insertSheet(OUTPUT_SHEET);
  target.clear();
  target.getRange(1, 1, output.length, 3).setValues(output);
  target.getRange(1, 1, 1, 3).setFontWeight('bold');
  const outputColors = output.slice(1).map(row => {
    const color = row[2] === '정상' ? WHITE : RED;
    return [color, color, color];
  });
  if (outputColors.length) {
    target.getRange(2, 1, outputColors.length, 3).setBackgrounds(outputColors);
  }
  target.setFrozenRows(1);
  target.autoResizeColumns(1, 3);

  return {
    success: true,
    missing: [...missing].length,
    duplicates: [...duplicates].length,
    rows: backgrounds.length
  };
}

function ensureStatusColumn(sheet, headers) {
  const names = headers.map(value => String(value || '').trim());
  const found = names.findIndex(name => name === '이미지 상태' || name === '상태');
  if (found >= 0) return found;
  const column = Math.max(names.length, 1) + 1;
  sheet.getRange(1, column).setValue('이미지 상태');
  return column - 1;
}

function getSpreadsheet() {
  try {
    return SpreadsheetApp.getActive() || SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (error) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
}

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => item > 0);
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
