/**
 * GASエントリポイント
 * スプレッドシートにメニューを追加し、各機能を紐付ける
 */

// シート名定数
export const SHEET_NAMES = {
  DASHBOARD: '📊 DASHBOARD',
  TWEETS: '📋 TWEETS',
  BOOKMARKS: '🔖 BOOKMARKS',
  CATEGORIES: '🏷️ CATEGORIES',
  AUTHORS: '👤 AUTHORS',
  SEARCH: '🔍 SEARCH',
  CACHE: '🔲 _CACHE',
  SETTINGS: '⚙️ SETTINGS',
} as const;

/**
 * スプレッドシート起動時にメニューを追加する
 * GASの onOpen() トリガーに相当
 */
export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 X Archive Tools')
    .addItem('📥 データをインポート', 'showUploadDialog')
    .addItem('🔄 ダッシュボード更新', 'refreshDashboard')
    .addSeparator()
    .addItem('📖 使い方ガイド表示', 'showGuide')
    .addSeparator()
    .addItem('ℹ️ バージョン情報', 'showAbout')
    .addToUi();
}

/**
 * アップロードダイアログを表示する
 */
export function showUploadDialog(): void {
  const html = HtmlService.createHtmlOutputFromFile('dialog')
    .setWidth(450)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, '📥 Xアーカイブをインポート');
}

/**
 * アップロードされたファイルを処理する（HTMLダイアログから呼ばれる）
 */
export function processUploadedFile(fileContent: string, fileName: string): string {
  const isBookmark = fileName.toLowerCase().includes('bookmark');
  const parsed = isBookmark
    ? importBookmarks(fileContent)
    : importTweets(fileContent);

  writeToSheet(isBookmark ? SHEET_NAMES.BOOKMARKS : SHEET_NAMES.TWEETS, parsed);
  refreshDashboard();

  return `✅ 完了！ ${parsed.length} 件をインポートしました（${fileName}）`;
}

/**
 * tweet.js をインポートする
 */
function importTweets(_rawJson: string): string[][] {
  // TODO: 実際のパース処理
  // 1. JSON.parse()
  // 2. バッチ分割（1,000行ずつ）
  // 3. 各行をTweetRowに変換
  // 4. 2次元配列として返す
  return [['placeholder']];
}

/**
 * bookmark.js をインポートする
 */
function importBookmarks(_rawRawJson: string): string[][] {
  // TODO: 実際のパース処理
  return [['placeholder']];
}

/**
 * 二次元配列をシートに書き込む
 * chunkSize ずつバッチ書き込み + Toast表示
 */
function writeToSheet(sheetName: string, _rows: string[][]): void {
  // TODO: 実際の書き込み処理
  // 1. シートを取得（なければ作成）
  // 2. 既存データをクリア
  // 3. chunkSize=1000でループ
  // 4. SpreadsheetApp.flush() + toast()表示
  // 5. ヘッダー行を追加
}

/**
 * ダッシュボードキャッシュを再計算する
 */
export function refreshDashboard(): void {
  // TODO: 実際のキャッシュ再計算
  // 1. TWEETSシートから全データ読み込み
  // 2. computeCache() で集計
  // 3. _CACHEシートに書き込み
  // 4. 完了Toast
}

/**
 * 使い方ガイドを表示する
 */
export function showGuide(): void {
  const html = HtmlService.createHtmlOutputFromFile('guide')
    .setWidth(600)
    .setHeight(500);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * バージョン情報
 */
export function showAbout(): void {
  SpreadsheetApp.getUi().alert(
    '📊 X Archive Tools',
    'Version 0.1.0\n\nX(Twitter)のデータアーカイブを\nGoogleスプレッドシートで可視化・分析します。\n\nhttps://ktakahiro150397.github.io/gas-tweet-archive/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
