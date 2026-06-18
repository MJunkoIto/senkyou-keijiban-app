/**
 * 選挙掲示板管理アプリ - Google Apps Script ウェブAPI
 *
 * 構成:
 *   Reactアプリ -> このウェブAPI -> Googleスプレッドシート
 *
 * スプレッドシートの列構成 (確定):
 *   A列: 投票区
 *   B列: 住所
 *   C列: 施設名
 *   D列: チェック状態 (TRUE / FALSE)
 *   E列: チェック日時
 *
 * 1行目は見出し行とみなし、データは2行目以降を扱います。
 */

// ▼ データの開始行 (1行目が見出しのため 2)。
var DATA_START_ROW = 2;
// ▼ 日時のタイムゾーン。
var TIME_ZONE = 'Asia/Tokyo';
// ▼ 日時の表示形式。
var DATE_FORMAT = 'yyyy/MM/dd HH:mm';

/**
 * 対象シートを返す。先頭シートを使用する。
 * 特定のシート名を使う場合は getSheetByName('シート名') に変更してください。
 */
function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

/**
 * JSON レスポンスを生成する。
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * 日時を文字列に整形する。
 */
function formatDate(date) {
  return Utilities.formatDate(date, TIME_ZONE, DATE_FORMAT);
}

/**
 * GET: データ取得用エンドポイント。
 *   例) ...?action=getData
 */
function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : '';
  try {
    if (action === 'getData') {
      return getData();
    }
    return jsonResponse({ status: 'ok', message: 'senkyou-keijiban API' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

/**
 * POST: 更新用エンドポイント。
 *   body(JSON): { action: 'updateCheck', row: <行番号>, checked: <真偽> }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'updateCheck') {
      return updateCheck(body.row, body.checked);
    }
    return jsonResponse({ status: 'error', message: 'unknown action' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

/**
 * スプレッドシートの全データ(A〜E列)を取得して返す。
 */
function getData() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  var data = [];

  if (lastRow >= DATA_START_ROW) {
    var numRows = lastRow - DATA_START_ROW + 1;
    var values = sheet.getRange(DATA_START_ROW, 1, numRows, 5).getValues();

    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var district = r[0];
      var address = r[1];
      var facility = r[2];
      var checkedRaw = r[3];
      var checkedAt = r[4];

      // 投票区・住所・施設名がすべて空の行はスキップする。
      if (
        (district === '' || district === null) &&
        (address === '' || address === null) &&
        (facility === '' || facility === null)
      ) {
        continue;
      }

      data.push({
        row: DATA_START_ROW + i,
        district: district === null ? '' : String(district),
        address: address === null ? '' : String(address),
        facility: facility === null ? '' : String(facility),
        checked: checkedRaw === true || String(checkedRaw).toUpperCase() === 'TRUE',
        checkedAt:
          checkedAt instanceof Date
            ? formatDate(checkedAt)
            : checkedAt === null
            ? ''
            : String(checkedAt),
      });
    }
  }

  return jsonResponse({ status: 'ok', data: data });
}

/**
 * 指定行のチェック状態(D列)とチェック日時(E列)を更新する。
 *
 *   チェックON : D列=TRUE,  E列=現在日時
 *   チェックOFF: D列=FALSE, E列=空欄
 */
function updateCheck(row, checked) {
  var sheet = getSheet();

  if (typeof row !== 'number' || row < DATA_START_ROW) {
    return jsonResponse({ status: 'error', message: 'invalid row: ' + row });
  }

  // 同時更新の競合を避けるためロックを取得する。
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var checkedAt = '';
    if (checked) {
      sheet.getRange(row, 4).setValue(true);
      checkedAt = formatDate(new Date());
      sheet.getRange(row, 5).setValue(checkedAt);
    } else {
      sheet.getRange(row, 4).setValue(false);
      sheet.getRange(row, 5).setValue('');
    }
    return jsonResponse({
      status: 'ok',
      row: row,
      checked: !!checked,
      checkedAt: checkedAt,
    });
  } finally {
    lock.releaseLock();
  }
}
