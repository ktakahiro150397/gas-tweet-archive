/**
 * DASHBOARD グラフ設定
 *
 * Google Apps Script で DASHBOARD シートにグラフを自動作成する。
 * 各グラフは _CACHE シートの集計データを範囲として設定し、
 * ユーザーが手動でグラフを追加する手間を省く。
 *
 * このモジュールはメニューから「📊 グラフをセットアップ」で実行できる。
 * 初回セットアップ時のみ使用。グラフは一度作れば永続する。
 */

import { SHEETS } from './main';

// ─── グラフ色定義 ────────────────────────────────────────────────

const COLORS = {
  primary: '#1DA1F2',
  secondary: '#FF6B35',
  accent: '#A855F7',
  green: '#22C55E',
  orange: '#F59E0B',
  red: '#EF4444',
  pink: '#EC4899',
  blue: '#3B82F6',
  teal: '#14B8A6',
  gray: '#6B7280',
} as const;

const TYPE_COLORS: Record<string, string> = {
  Original: COLORS.primary,
  Reply: COLORS.green,
  Retweet: COLORS.orange,
  Quote: COLORS.accent,
};

const DAY_LABELS_JP = ['月', '火', '水', '木', '金', '土', '日'];
const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── グラフ作成エントリポイント ──────────────────────────────────

/**
 * DASHBOARD シートに全7種のグラフを作成する。
 *
 * 初回セットアップ時にメニューまたは initializeSheets() 経由で実行。
 * 既存のグラフは再作成しない（重複防止）。
 */
export function setupDashboardCharts(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DASHBOARD);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('📊 DASHBOARD シートが見つかりません。先にデータをインポートしてください。');
    return;
  }

  // 既存グラフを取得
  const existingCharts = sheet.getCharts();
  const existingTitles = new Set(
    existingCharts.map((c) => c.getOptions().get('title') as string),
  );

  // 各グラフを作成（既存スキップ）
  const charts: GoogleAppsScript.Spreadsheet.EmbeddedChart[] = [];

  if (!existingTitles.has('📈 月間投稿トレンド')) {
    charts.push(createTweetsByMonthChart(sheet));
  }
  if (!existingTitles.has('📊 ツイート種別構成')) {
    charts.push(createTweetsByTypeChart(sheet));
  }
  if (!existingTitles.has('🏆 トップいいねランキング')) {
    charts.push(createTopLikedChart(sheet));
  }
  if (!existingTitles.has('🗓️ 曜日アクティビティ')) {
    charts.push(createDayOfWeekChart(sheet));
  }
  if (!existingTitles.has('🏷️ ブックマークカテゴリ')) {
    charts.push(createBookmarkCategoryChart(sheet));
  }

  // グラフをシートに挿入
  for (let i = 0; i < charts.length; i++) {
    sheet.insertChart(charts[i]);
  }

  if (charts.length === 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      '✅ グラフは全てセットアップ済みです',
      '📊 X Archive Tools',
      2,
    );
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `✅ ${charts.length} 個のグラフを作成しました`,
      '📊 X Archive Tools',
      3,
    );
  }
}

// ─── 各グラフ作成関数 ────────────────────────────────────────────

/**
 * グラフ1: 月間投稿トレンド（折れ線）
 * _CACHE の month_YYYY-MM データを時系列表示する
 */
function createTweetsByMonthChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) throw new Error('_CACHEシートが見つかりません');

  const data = cacheSheet.getDataRange().getValues();
  // month_* の行を抽出
  const monthRows: Array<[string, number]> = [];
  for (const row of data) {
    const key = String(row[0]);
    if (key.startsWith('month_')) {
      monthRows.push([key.replace('month_', ''), Number(row[1])]);
    }
  }

  if (monthRows.length === 0) {
    throw new Error('月次データがありません');
  }

  // データを書き込み用シートに仮配置
  const startRow = 1;
  const headerRow: string[] = ['月', 'ツイート数'];
  const chartData = [headerRow, ...monthRows.map((r) => [r[0], r[1]])];

  // キャッシュシートの末尾に描画用テーブルを追加
  const lastRow = cacheSheet.getLastRow() + 2;
  cacheSheet.getRange(lastRow, 4, chartData.length, 2).setValues(chartData);

  const chartBuilder = sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(cacheSheet.getRange(lastRow, 4, chartData.length, 2))
    .setPosition(3, 1, 0, 0)
    .setOption('title', '📈 月間投稿トレンド')
    .setOption('width', 500)
    .setOption('height', 250)
    .setOption('curveType', 'function')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COLORS.primary])
    .setOption('pointSize', 5)
    .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
    .setOption('vAxis', { minValue: 0 });

  return chartBuilder.build();
}

/**
 * グラフ2: ツイート種別構成（積み上げ横棒）
 */
function createTweetsByTypeChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) throw new Error('_CACHEシートが見つかりません');

  const data = cacheSheet.getDataRange().getValues();
  const typeData: Array<[string, number]> = [];
  const typeOrder = ['Original', 'Reply', 'Retweet', 'Quote'];
  for (const key of typeOrder) {
    const found = data.find((r) => r[0] === `type_${key}`);
    typeData.push([key, found ? Number(found[1]) : 0]);
  }

  const chartData = [
    ['種別', '件数'],
    ...typeData.map((r) => [r[0], r[1]]),
  ];

  const lastRow = cacheSheet.getLastRow() + 2;
  cacheSheet.getRange(lastRow, 4, chartData.length, 2).setValues(chartData);

  const colors = typeOrder.map((t) => TYPE_COLORS[t] || COLORS.gray);

  const chartBuilder = sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(cacheSheet.getRange(lastRow, 4, chartData.length, 2))
    .setPosition(3, 8, 0, 0)
    .setOption('title', '📊 ツイート種別構成')
    .setOption('width', 450)
    .setOption('height', 220)
    .setOption('legend', { position: 'none' })
    .setOption('colors', colors)
    .setOption('hAxis', { minValue: 0 });

  return chartBuilder.build();
}

/**
 * グラフ3: トップいいねランキング（横棒）
 */
function createTopLikedChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) throw new Error('_CACHEシートが見つかりません');

  const data = cacheSheet.getDataRange().getValues();

  // top_liked_N_text / top_liked_N_likes を収集
  const topEntries: Array<{ text: string; likes: number }> = [];
  for (const row of data) {
    const key = String(row[0]);
    if (key.startsWith('top_liked_') && key.endsWith('_likes')) {
      const num = parseInt(key.split('_')[2], 10);
      const textRow = data.find((r) => r[0] === `top_liked_${num}_text`);
      topEntries.push({
        text: textRow ? String(textRow[1]).slice(0, 30) : '',
        likes: Number(row[1]),
      });
    }
  }

  if (topEntries.length === 0) {
    throw new Error('いいねデータがありません');
  }

  const chartData = [
    ['ツイート', 'いいね'],
    ...topEntries.map((e) => [e.text, e.likes]),
  ];

  const lastRow = cacheSheet.getLastRow() + 2;
  cacheSheet.getRange(lastRow, 4, chartData.length, 2).setValues(chartData);

  const chartBuilder = sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(cacheSheet.getRange(lastRow, 4, chartData.length, 2))
    .setPosition(16, 1, 0, 0)
    .setOption('title', '🏆 トップいいねランキング')
    .setOption('width', 500)
    .setOption('height', 300)
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COLORS.orange])
    .setOption('hAxis', { minValue: 0 });

  return chartBuilder.build();
}

/**
 * グラフ4: 曜日アクティビティ（縦棒）
 */
function createDayOfWeekChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) throw new Error('_CACHEシートが見つかりません');

  const data = cacheSheet.getDataRange().getValues();

  const dayData: Array<[string, number]> = [];
  for (const key of DAY_KEYS) {
    const found = data.find((r) => r[0] === `day_${key}`);
    dayData.push([key, found ? Number(found[1]) : 0]);
  }

  const chartData = [
    ['曜日', 'ツイート数'],
    ...dayData.map((r, i) => [DAY_LABELS_JP[i], r[1]]),
  ];

  const lastRow = cacheSheet.getLastRow() + 2;
  cacheSheet.getRange(lastRow, 4, chartData.length, 2).setValues(chartData);

  const chartBuilder = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(cacheSheet.getRange(lastRow, 4, chartData.length, 2))
    .setPosition(16, 8, 0, 0)
    .setOption('title', '🗓️ 曜日アクティビティ')
    .setOption('width', 450)
    .setOption('height', 250)
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COLORS.accent])
    .setOption('vAxis', { minValue: 0 });

  return chartBuilder.build();
}

/**
 * グラフ5: ブックマークカテゴリ（ドーナツ）
 */
function createBookmarkCategoryChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) throw new Error('_CACHEシートが見つかりません');

  const data = cacheSheet.getDataRange().getValues();
  const catData: Array<[string, number]> = [];

  for (const row of data) {
    const key = String(row[0]);
    if (key.startsWith('bm_cat_')) {
      catData.push([key.replace('bm_cat_', ''), Number(row[1])]);
    }
  }

  if (catData.length === 0) {
    throw new Error('ブックマークデータがありません');
  }

  const chartData = [
    ['カテゴリ', '件数'],
    ...catData,
  ];

  const lastRow = cacheSheet.getLastRow() + 2;
  cacheSheet.getRange(lastRow, 4, chartData.length, 2).setValues(chartData);

  const donutColors = [
    COLORS.primary, COLORS.secondary, COLORS.accent,
    COLORS.green, COLORS.orange, COLORS.pink,
    COLORS.teal, COLORS.gray,
  ];

  const chartBuilder = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(cacheSheet.getRange(lastRow, 4, chartData.length, 2))
    .setPosition(29, 1, 0, 0)
    .setOption('title', '🏷️ ブックマークカテゴリ')
    .setOption('width', 450)
    .setOption('height', 300)
    .setOption('pieHole', 0.4)
    .setOption('colors', donutColors);

  return chartBuilder.build();
}

// ─── ユーティリティ ──────────────────────────────────────────────

/** _CACHEシートを取得 */
function getCacheSheet(): GoogleAppsScript.Spreadsheet.Sheet | null {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CACHE);
}
