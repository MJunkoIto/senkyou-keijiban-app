// Google Apps Script ウェブアプリとの通信をまとめたモジュール。
//
// 構成:
//   Reactアプリ -> Google Apps Script Web API -> Googleスプレッドシート
//
// 注意:
//   GASのウェブアプリはCORSプリフライト(OPTIONS)に対応していないため、
//   POST時の Content-Type は "text/plain" にして単純リクエストにしています。

const API_URL = import.meta.env.VITE_GAS_API_URL

if (!API_URL) {
  // .env の設定漏れに早めに気付けるよう、コンソールに警告を出す。
  console.warn(
    'VITE_GAS_API_URL が設定されていません。.env を作成し、GASのウェブアプリURLを設定してください。',
  )
}

/**
 * スプレッドシートの全データ(A〜E列)を取得する。
 * @returns {Promise<Array<{row:number, district:string, address:string, facility:string, checked:boolean, checkedAt:string}>>}
 */
export async function getData() {
  const url = `${API_URL}?action=getData`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`データ取得に失敗しました (HTTP ${res.status})`)
  }
  const json = await res.json()
  if (json.status !== 'ok') {
    throw new Error(json.message || 'データ取得に失敗しました')
  }
  return json.data
}

/**
 * 指定行のチェック状態とチェック日時を更新する。
 * @param {number} row     スプレッドシートの行番号 (1始まり)
 * @param {boolean} checked チェックを入れる場合 true
 * @returns {Promise<{row:number, checked:boolean, checkedAt:string}>}
 */
export async function updateCheck(row, checked) {
  const res = await fetch(API_URL, {
    method: 'POST',
    // text/plain にすることで CORS プリフライトを回避する。
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'updateCheck', row, checked }),
  })
  if (!res.ok) {
    throw new Error(`更新に失敗しました (HTTP ${res.status})`)
  }
  const json = await res.json()
  if (json.status !== 'ok') {
    throw new Error(json.message || '更新に失敗しました')
  }
  return json
}
