import { useEffect, useMemo, useRef, useState } from 'react'
import { getData, updateCheck } from './api'
import './App.css'

/**
 * Googleマップ検索URLを組み立てる。
 * 検索語 = 施設名 + " " + 住所 (施設名が空なら住所のみ)。
 */
function buildMapsUrl(facility, address) {
  const query = [facility, address].filter((s) => s && s.trim()).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/**
 * 投票区(district)ごとにデータをグルーピングする。
 * 出現順を保持したまま、同じ投票区を1つの見出しにまとめる。
 */
function groupByDistrict(items) {
  const groups = []
  const indexByName = new Map()
  for (const item of items) {
    const name = item.district || '(投票区未設定)'
    if (!indexByName.has(name)) {
      indexByName.set(name, groups.length)
      groups.push({ district: name, rows: [] })
    }
    groups[indexByName.get(name)].rows.push(item)
  }
  return groups
}

/** 時刻を「HH:mm:ss」形式に整形する。 */
function formatTime(date) {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true) // 初回読み込みの全画面表示用
  const [refreshing, setRefreshing] = useState(false) // 再読み込み中
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null) // 最終更新時刻
  // 通信中の行(スプレッドシートの行番号)の集合。二重操作を防ぐ。
  const [savingRows, setSavingRows] = useState(() => new Set())
  // 保存状況のトースト表示 { state: 'saving'|'success'|'error', message }。
  const [saveStatus, setSaveStatus] = useState(null)

  // 保存トーストの自動非表示タイマー。
  const toastTimerRef = useRef(null)

  /**
   * 保存状況メッセージを表示する。autoHideMs を指定すると一定時間後に消す。
   */
  function showSaveStatus(state, message, autoHideMs) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setSaveStatus({ state, message })
    if (autoHideMs) {
      toastTimerRef.current = setTimeout(() => {
        setSaveStatus(null)
        toastTimerRef.current = null
      }, autoHideMs)
    }
  }

  /**
   * スプレッドシートから最新データを取得する。
   * @param {boolean} initial 初回読み込みなら true (全画面の読み込み表示を出す)
   */
  async function load(initial = false) {
    if (initial) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setError('')
    try {
      const data = await getData()
      setItems(data)
      setLastUpdated(new Date())
    } catch (e) {
      // 初回は全画面エラー、再読み込み時はトーストで知らせる。
      if (initial) {
        setError(e.message || 'データの取得に失敗しました')
      } else {
        showSaveStatus('error', '最新データの取得に失敗しました。', 4000)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load(true)
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const groups = useMemo(() => groupByDistrict(items), [items])

  const stats = useMemo(() => {
    const total = items.length
    const done = items.filter((i) => i.checked).length
    return { total, done }
  }, [items])

  async function handleToggle(item) {
    const nextChecked = !item.checked
    const row = item.row

    // 二重送信を防ぐ。
    if (savingRows.has(row)) return
    setSavingRows((prev) => new Set(prev).add(row))

    // 楽観的更新: 先に画面を更新する。
    setItems((prev) =>
      prev.map((it) => (it.row === row ? { ...it, checked: nextChecked } : it)),
    )

    // 保存中を表示。
    showSaveStatus('saving', '保存中...')

    try {
      const result = await updateCheck(row, nextChecked)
      // サーバが返したチェック日時で確定させる。
      setItems((prev) =>
        prev.map((it) =>
          it.row === row
            ? { ...it, checked: nextChecked, checkedAt: result.checkedAt || '' }
            : it,
        ),
      )
      showSaveStatus('success', '保存しました', 2500)

      // 保存成功後、他に保存中の行が無ければ最新データを再取得する。
      const stillSaving = new Set(savingRows)
      stillSaving.delete(row)
      if (stillSaving.size === 0) {
        load(false)
      }
    } catch (e) {
      // 失敗したらチェック状態を元に戻す。
      setItems((prev) =>
        prev.map((it) => (it.row === row ? { ...it, checked: item.checked } : it)),
      )
      showSaveStatus(
        'error',
        '保存に失敗しました。もう一度お試しください。',
        5000,
      )
    } finally {
      setSavingRows((prev) => {
        const next = new Set(prev)
        next.delete(row)
        return next
      })
    }
  }

  const lastUpdatedText = lastUpdated ? formatTime(lastUpdated) : '—'

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <h1 className="app-title">選挙掲示板 設置場所チェック</h1>
          {!loading && !error && (
            <p className="app-progress">
              進捗 {stats.done} / {stats.total} 件
            </p>
          )}

          <div className="app-sync">
            <button
              className="reload-button"
              onClick={() => load(false)}
              disabled={loading || refreshing}
            >
              {refreshing ? '更新中…' : '進捗更新する'}
            </button>
            <span className="app-updated">最終更新：{lastUpdatedText}</span>
          </div>

          <p className="app-hint">
            他の人のチェック状況を見るには「進捗更新する」ボタンを押してください
          </p>
        </div>
      </header>

      <main className="app-main">
        {loading && <p className="status status--loading">読み込み中…</p>}

        {!loading && error && (
          <div className="status status--error">
            <p>{error}</p>
            <button className="retry-button" onClick={() => load(true)}>
              再読み込み
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="status">データがありません。</p>
        )}

        {!loading &&
          !error &&
          groups.map((group) => (
            <section className="district" key={group.district}>
              <h2 className="district__heading">{group.district}</h2>
              <ul className="row-list">
                {group.rows.map((item) => {
                  const saving = savingRows.has(item.row)
                  return (
                    <li
                      key={item.row}
                      className={`row ${item.checked ? 'row--checked' : ''}`}
                    >
                      <label className="row__check">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={saving}
                          onChange={() => handleToggle(item)}
                        />
                        <span className="row__checkbox" aria-hidden="true" />
                      </label>

                      <div className="row__body">
                        <div className="row__line">
                          <span className="row__facility">
                            {item.facility || '(施設名なし)'}
                          </span>
                          {item.checked && <span className="row__badge">済</span>}
                        </div>
                        <div className="row__address">{item.address}</div>
                        {item.checked && item.checkedAt && (
                          <div className="row__checkedat">確認日時: {item.checkedAt}</div>
                        )}
                      </div>

                      <a
                        className="row__map"
                        href={buildMapsUrl(item.facility, item.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        地図
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
      </main>

      {saveStatus && (
        <div
          className={`toast toast--${saveStatus.state}`}
          role="status"
          aria-live="polite"
        >
          {saveStatus.message}
        </div>
      )}
    </div>
  )
}
