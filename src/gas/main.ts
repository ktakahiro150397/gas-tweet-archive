/**
 * GASエントリポイント
 *
 * スプレッドシートにメニューを追加し、各機能を紐付ける。
 * パース処理は import.ts に委譲し、このファイルは主に
 * GAS APIとの橋渡し（UI・シートI/O・キャッシュ更新）を担当する。
 *
 * @see https://github.com/ktakahiro150397/gas-tweet-archive
 */

import { parseTweetJs, parseBookmarkJs } from './import';
import { setupDashboardCharts } from './charts';

// ─── 定数 ────────────────────────────────────────────────────────

/** 全シート名定義 */
export const SHEETS = {
  DASHBOARD: '📊 DASHBOARD',
  TWEETS: '📋 TWEETS',
  BOOKMARKS: '🔖 BOOKMARKS',
  CATEGORIES: '🏷️ CATEGORIES',
  AUTHORS: '👤 AUTHORS',
  SEARCH: '🔍 SEARCH',
  CACHE: '🔲 _CACHE',
  SETTINGS: '⚙️ SETTINGS',
} as const;

/** TWEETSシートのヘッダー定義 */
const TWEET_HEADERS: readonly string[] = [
  '日付', '時刻', 'ツイート本文', '種別',
  'いいね数', 'RT数', 'リプライ数', '媒体',
  'URL', '画像あり？', '週番号',
];

/** BOOKMARKSシートのヘッダー定義 */
const BOOKMARK_HEADERS: readonly string[] = [
  '保存日', '著者', '内容', 'いいね数', 'URL',
  '🏷️ カテゴリ', '⭐ 重要度', 'ステータス', 'メモ',
];

/** インポート時の1回あたりの書き込み行数 */
const CHUNK_SIZE = 1000;

// ─── onOpen: メニュー追加 ────────────────────────────────────────

/**
 * スプレッドシート起動時にメニューを追加する
 * GASの onOpen() シンプルトリガー
 */
export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 X Archive Tools')
  .addItem('📥 データをインポート', 'showUploadDialog')
  .addItem('🔄 ダッシュボード更新', 'refreshDashboard')
  .addSeparator()
  .addItem('📊 グラフをセットアップ', 'setupDashboardCharts')
  .addSeparator()
  .addItem('📖 使い方ガイド表示', 'showGuide')
  .addSeparator()
  .addItem('🛠️ シートを初期化', 'initializeSheets')
  .addSeparator()
  .addItem('ℹ️ バージョン情報', 'showAbout')
  .addToUi();
}

// ─── メニューアクション ──────────────────────────────────────────

/** アップロードダイアログをモーダル表示 */
export function showUploadDialog(): void {
  const html = HtmlService.createHtmlOutputFromFile('dialog')
    .setWidth(480)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '📥 Xアーカイブをインポート');
}

/** 使い方ガイドをサイドバー表示 */
export function showGuide(): void {
  const html = HtmlService.createHtmlOutputFromFile('guide')
    .setTitle('📖 使い方ガイド');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** バージョン情報を表示 */
export function showAbout(): void {
  SpreadsheetApp.getUi().alert(
    '📊 X Archive Tools',
    'Version 0.1.0\n\n'
    + 'X(Twitter)のデータアーカイブを\n'
    + 'Googleスプレッドシートで可視化・分析します。\n\n'
    + 'GitHub: https://github.com/ktakahiro150397/gas-tweet-archive\n'
    + 'ドキュメント: https://ktakahiro150397.github.io/gas-tweet-archive/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─── ファイル処理（HTMLダイアログ→GAS） ─────────────────────────

/**
 * アップロードされたファイルを処理する。
 *
 * HTMLダイアログ（dialog.html）から google.script.run で呼ばれる。
 * ファイル名で tweet.js / bookmark.js を判別し、import.ts のパーサーに委譲。
 * パース後、該当シートにバッチ書き込み → キャッシュ更新までを一貫処理する。
 *
 * @param fileContent - ファイル内容（文字列）
 * @param fileName    - 元のファイル名（判別用）
 * @returns 完了メッセージ
 */
export function processUploadedFile(fileContent: string, fileName: string): string {
  try {
    const isBookmark = /bookmark/i.test(fileName);
    const rows = isBookmark
      ? parseBookmarkJs(fileContent)
      : parseTweetJs(fileContent);

    if (rows.length === 0) {
      return '⚠️ 0件のデータが見つかりました。ファイル形式を確認してください。';
    }

    const sheetName = isBookmark ? SHEETS.BOOKMARKS : SHEETS.TWEETS;
    const headers = isBookmark ? BOOKMARK_HEADERS : TWEET_HEADERS;

    writeRowsToSheet(sheetName, headers, rows);
    applySheetFormatting(sheetName, isBookmark);

    if (isBookmark) {
      ensureCategorySheet();
    }

    refreshDashboard();

    return `✅ 完了！ ${rows.length.toLocaleString()} 件をインポートしました（${fileName}）`;
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return `❌ インポートに失敗しました: ${message}`;
  }
}

// ─── シート書き込み（バッチ＋プログレス） ────────────────────────

/**
 * 二次元配列をシートにバッチ書き込みする。
 * CHUNK_SIZE（1,000行）ずつ分割し、各チャンクで flush + toast する。
 * これにより GAS の6分実行制限回避と UX向上を両立する。
 */
function writeRowsToSheet(
  sheetName: string,
  headers: readonly string[],
  rows: string[][],
): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // 既存データをクリア
  sheet.clear();
  // clearContent() は clear() でカバーされるため削除

  const totalRows = rows.length;

  // ヘッダー書き込み
  sheet.getRange(1, 1, 1, headers.length).setValues([headers as string[]]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  // バッチ書き込みループ
  for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const startRow = i + 2; // ヘッダー行の次
    const range = sheet.getRange(startRow, 1, chunk.length, headers.length);
    range.setValues(chunk);
    SpreadsheetApp.flush();

    const processed = Math.min(i + CHUNK_SIZE, totalRows);
    const pct = Math.round((processed / totalRows) * 100);
    ss.toast(
      `📥 書き込み中... ${pct}%（${processed.toLocaleString()}/${totalRows.toLocaleString()}行）`,
      '📊 X Archive Tools',
      2,
    );
  }
}

/**
 * シートの書式を設定する。
 * - ヘッダー固定行
 * - ブックマークシートにプルダウン（データバリデーション）設定
 */
function applySheetFormatting(sheetName: string, isBookmark: boolean): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return;

  // 標準フォント・サイズ
  const allRange = sheet.getRange(1, 1, lastRow, lastCol);
  allRange.setFontSize(11);
  allRange.setVerticalAlignment('top');

  // ヘッダー固定
  sheet.setFrozenRows(1);

  // ブックマークシート：プルダウン設定
  if (isBookmark) {
    setupBookmarkDropdowns(sheet, lastRow);
  }

  // 主要列の幅を調整
  try {
    sheet.autoResizeColumn(1);
    sheet.autoResizeColumn(2);
    if (lastCol >= 3) sheet.autoResizeColumn(3);
  } catch (_) {
    // 列幅調整は失敗しても無視
  }
}

/**
 * ブックマークシートにプルダウン（データバリデーション）を設定する。
 *
 * - F列（カテゴリ）: CATEGORIESシートから動的に取得
 * - G列（重要度）: 固定選択肢
 * - H列（ステータス）: 固定選択肢
 */
function setupBookmarkDropdowns(sheet: GoogleAppsScript.Spreadsheet.Sheet, lastRow: number): void {
  const ss = sheet.getParent();
  const dataRowCount = Math.max(lastRow - 1, 1);

  // F列: カテゴリ（CATEGORIESシート参照）
  const catSheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (catSheet) {
    const catValues = catSheet.getRange(2, 1, catSheet.getLastRow() - 1, 1).getValues();
    const cats = catValues
      .map((r: string[][]) => String(r[0]))
      .filter((c: string) => c.length > 0);
    if (cats.length > 0) {
      const categoryRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(cats, true)
        .build();
      sheet.getRange(2, 6, dataRowCount, 1).setDataValidation(categoryRule);
    }
  }

  // G列: 重要度
  const importanceRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['⭐', '⭐⭐', '⭐⭐⭐'], true)
    .build();
  sheet.getRange(2, 7, dataRowCount, 1).setDataValidation(importanceRule);

  // H列: ステータス
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['未整理', '読了', 'アクション済み', '定期的に見返す'], true)
    .build();
  sheet.getRange(2, 8, dataRowCount, 1).setDataValidation(statusRule);
}

// ─── カテゴリシート管理 ──────────────────────────────────────────

/** デフォルトカテゴリ一覧 */
const DEFAULT_CATEGORIES: Array<[string, string]> = [
  ['投資', '📈'],
  ['技術・AI', '💻'],
  ['雑学・教養', '📚'],
  ['仕事術', '💼'],
  ['趣味・エンタメ', '🎮'],
  ['健康', '🏃'],
  ['政治・経済', '🏛️'],
  ['その他', '📌'],
];

/**
 * CATEGORIESシートがなければ作成し、デフォルトカテゴリをセットする。
 */
function ensureCategorySheet(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (sheet) return;

  sheet = ss.insertSheet(SHEETS.CATEGORIES);
  sheet.getRange(1, 1).setValue('カテゴリ名');
  sheet.getRange(1, 2).setValue('アイコン');
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  sheet.getRange(2, 1, DEFAULT_CATEGORIES.length, 2).setValues(DEFAULT_CATEGORIES);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumn(1);
}

// ─── ダッシュボード更新（プリコンピュート） ─────────────────────

/**
 * ダッシュボードキャッシュを再計算する。
 *
 * TWEETS / BOOKMARKS シートから全データを読み込み、
 * 集計結果を _CACHE シートに key-value 形式で書き込む。
 * DASHBOARD シートは SUM 参照のみで軽量動作する。
 */
export function refreshDashboard(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // _CACHE シートを準備
  let cacheSheet = ss.getSheetByName(SHEETS.CACHE);
  if (!cacheSheet) {
    cacheSheet = ss.insertSheet(SHEETS.CACHE);
  }
  cacheSheet.clear();

  const cacheEntries: string[][] = [];

  // ── TWEETS集計 ──
  const tweetsSheet = ss.getSheetByName(SHEETS.TWEETS);
  if (tweetsSheet) {
    const data = tweetsSheet.getDataRange().getValues();
    if (data.length > 1) {
      const rows = data.slice(1);
      cacheEntries.push(['total_tweets', String(rows.length)]);

      let totalLikes = 0;
      const typeCount: Record<string, number> = {};
      const monthCount: Record<string, number> = {};
      const dayCount: Record<string, number> = {};
      const topLiked: Array<{ text: string; likes: number; date: string }> = [];
      const hourCount: Record<string, Record<number, number>> = {};
      let minDate = '';
      let maxDate = '';

      for (const row of rows) {
        const date = String(row[0] || '');
        const time = String(row[1] || '');
        const text = String(row[2] || '');
        const type = String(row[3] || '');
        const likes = Number(row[4] || 0);

        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;

        totalLikes += likes;
        typeCount[type] = (typeCount[type] || 0) + 1;

        const month = date.slice(0, 7);
        if (month) monthCount[month] = (monthCount[month] || 0) + 1;

        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dayName = days[d.getDay()];
          dayCount[dayName] = (dayCount[dayName] || 0) + 1;

      // 空時刻の場合はスキップ（hourCountから除外）
      const hour = time ? parseInt(time.split(':')[0], 10) : -1;
      if (hour >= 0 && hour <= 23) {
        if (!hourCount[dayName]) hourCount[dayName] = {};
        hourCount[dayName][hour] = (hourCount[dayName][hour] || 0) + 1;
      }
        }

        topLiked.push({ text: text.slice(0, 80), likes, date });
      }

      cacheEntries.push(['total_likes', String(totalLikes)]);
      cacheEntries.push(['active_period_start', minDate]);
      cacheEntries.push(['active_period_end', maxDate]);

      // 月次集計
      const sortedMonths = Object.entries(monthCount).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [month, count] of sortedMonths) {
        cacheEntries.push([`month_${month}`, String(count)]);
      }

      // 種別集計
      for (const [type, count] of Object.entries(typeCount)) {
        cacheEntries.push([`type_${type}`, String(count)]);
      }

      // 曜日集計
      for (const [day, count] of Object.entries(dayCount)) {
        cacheEntries.push([`day_${day}`, String(count)]);
      }

      // Topいいね10
      topLiked.sort((a, b) => b.likes - a.likes);
      for (let i = 0; i < Math.min(topLiked.length, 10); i++) {
        cacheEntries.push([`top_liked_${i + 1}_text`, topLiked[i].text]);
        cacheEntries.push([`top_liked_${i + 1}_likes`, String(topLiked[i].likes)]);
        cacheEntries.push([`top_liked_${i + 1}_date`, topLiked[i].date]);
      }

      // 時間帯ヒートマップデータ
      for (const [day, hours] of Object.entries(hourCount)) {
        for (const [hour, count] of Object.entries(hours)) {
          cacheEntries.push([`hour_${day}_${hour}`, String(count)]);
        }
      }
    }
  }

  // ── BOOKMARKS集計 ──
  const bmSheet = ss.getSheetByName(SHEETS.BOOKMARKS);
  if (bmSheet) {
    const data = bmSheet.getDataRange().getValues();
    if (data.length > 1) {
      const rows = data.slice(1);
      cacheEntries.push(['total_bookmarks', String(rows.length)]);

      const catCount: Record<string, number> = {};
      for (const row of rows) {
        const cat = String(row[5] || '未分類');
        catCount[cat] = (catCount[cat] || 0) + 1;
      }
      for (const [cat, count] of Object.entries(catCount)) {
        cacheEntries.push([`bm_cat_${cat}`, String(count)]);
      }
    }
  }

  // _CACHE 書き込み
  if (cacheEntries.length > 0) {
    cacheSheet.getRange(1, 1, cacheEntries.length, 2).setValues(cacheEntries);
  }

  // _CACHE を非表示（内部的にしか使わないため）
  if (cacheSheet.isSheetHidden() === false) {
    ss.moveActiveSheet(ss.getNumSheets()); // 最後尾に移動
    cacheSheet.hideSheet();
  }

  ss.toast(
    `✅ ダッシュボードを更新しました（${cacheEntries.length}項目）`,
    '📊 X Archive Tools',
    3,
  );
}

// ─── 初期セットアップ（開発者用） ────────────────────────────────

/**
 * 全シートおよび設定を初期化する。
 * メニュー非表示。初回セットアップ時にのみ使用。
 */
export function initializeSheets(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 全シート作成
  for (const name of Object.values(SHEETS)) {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  }

  // SETTINGSシート
  const settings = ss.getSheetByName(SHEETS.SETTINGS);
  if (settings) {
    settings.clear();
    settings.getRange(1, 1, 1, 2).setValues([['キー', '値']]);
    settings.getRange(1, 1, 1, 2).setFontWeight('bold');
    settings.getRange(2, 1, 2, 2).setValues([
      ['ツール名', 'X Archive Tools'],
      ['バージョン', '0.1.0'],
    ]);
    settings.setFrozenRows(1);
  }

  ensureCategorySheet();
  ss.toast('✅ 初期化が完了しました', '📊 X Archive Tools', 3);
}
