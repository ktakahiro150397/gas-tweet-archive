/**
 * DASHBOARD グラフ設定
 *
 * Google Apps Script で DASHBOARD シートにグラフを自動作成する。
 * 各グラフは _CACHE シートの集計データを範囲として設定し、
 * チャート用中間データは _CHART_DATA シートに分離して書き込む。
 *
 * このモジュールはメニューから「📊 グラフをセットアップ」で実行できる。
 * 初回セットアップ時のみ使用。グラフは一度作れば永続する。
 *
 * 設計:
 * - setupDashboardCharts() は毎回 _CHART_DATA をクリアし、全データを再書き込みする
 * - 既存グラフは再作成しないが、データ参照先のセルは毎回更新される
 * - 各グラフは create*() + write*Data() のペアで構成
 */

import { SHEETS } from './main';

// ─── 定数 ────────────────────────────────────────────────────────

/** チャート中間データ用シート名（_CACHEと分離） */
const CHART_DATA = '🔲 _CHART_DATA';

/** グラフ色定義 */
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
 * 既存のグラフは再作成しない（重複防止）。ただし _CHART_DATA は
 * 毎回全データを再書き込みし、既存グラフの参照範囲を最新に保つ。
 */
export function setupDashboardCharts(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DASHBOARD);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('📊 DASHBOARD シートが見つかりません。先にデータをインポートしてください。');
    return;
  }

  // _CHART_DATA シートを準備（古いデータをクリア → 毎回全データ再書き込み）
  prepareChartDataSheet();

  // 既存グラフを取得
  const existingCharts = sheet.getCharts();
  const existingTitles = new Set(
    existingCharts.map((c) => c.getOptions().get('title') as string),
  );

  // 各グラフを作成（既存スキップ） + データは毎回書き込む
  const charts: GoogleAppsScript.Spreadsheet.EmbeddedChart[] = [];

  if (!existingTitles.has('📈 月間投稿トレンド')) {
    charts.push(createTweetsByMonthChart(sheet));
  } else {
    writeMonthChartData();
  }
  if (!existingTitles.has('📊 ツイート種別構成')) {
    charts.push(createTweetsByTypeChart(sheet));
  } else {
    writeTypeChartData();
  }
  if (!existingTitles.has('🏆 トップいいねランキング')) {
    charts.push(createTopLikedChart(sheet));
  } else {
    writeTopLikedChartData();
  }
  if (!existingTitles.has('🗓️ 曜日アクティビティ')) {
    charts.push(createDayOfWeekChart(sheet));
  } else {
    writeDayOfWeekChartData();
  }
  if (!existingTitles.has('🏷️ ブックマークカテゴリ')) {
    charts.push(createBookmarkCategoryChart(sheet));
  } else {
    writeBookmarkCategoryChartData();
  }
  if (!existingTitles.has('⏰ 時間帯アクティビティ')) {
    charts.push(createHourlyActivityChart(sheet));
    writeHourlyChartData();
    createHourHeatmapFormatting();
  } else {
    writeHourlyChartData();
    createHourHeatmapFormatting();
  }

  // グラフをシートに挿入
  for (let i = 0; i < charts.length; i++) {
    sheet.insertChart(charts[i]);
  }

  if (charts.length === 0) {
    ss.toast('✅ グラフは全てセットアップ済みです', '📊 X Archive Tools', 2);
  } else {
    ss.toast(`✅ ${charts.length} 個のグラフを作成しました`, '📊 X Archive Tools', 3);
  }
}

// ─── _CHART_DATA シート管理 ──────────────────────────────────────

/**
 * _CHART_DATA シートを準備する。
 * 存在しなければ作成し、既存データをクリアして非表示にする。
 */
function prepareChartDataSheet(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHART_DATA);

  if (!sheet) {
    sheet = ss.insertSheet(CHART_DATA);
  }

  sheet.clear();

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
}

/**
 * チャートデータを _CHART_DATA シートに書き込む。
 * @returns 書き込み先のRange情報（グラフ参照範囲として使用）
 */
function writeChartData(
  header: string[],
  rows: Array<Array<string | number>>,
): { startRow: number; startCol: number; numRows: number; numCols: number } {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA);
  if (!sheet) throw new Error(`${CHART_DATA} シートが見つかりません`);

  const data = [header, ...rows.map((r) => [...r])];
  const lastRow = sheet.getLastRow() + 1;
  const startCol = 1;

  sheet.getRange(lastRow, startCol, data.length, header.length).setValues(data);

  return {
    startRow: lastRow,
    startCol,
    numRows: data.length,
    numCols: header.length,
  };
}

/** _CACHEシートを取得 */
function getCacheSheet(): GoogleAppsScript.Spreadsheet.Sheet | null {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CACHE);
}

// ─── 各グラフ: データ書き込み + チャート作成 ─────────────────────

// 注: write*Data() は writeChartData() を呼び出し、その戻り値（書き込み先Range）を
// 返す。create*() はそれを即座にグラフの参照範囲として設定する。

// ─── グラフ1: 月間投稿トレンド ───

function writeMonthChartData(): { startRow: number; startCol: number; numRows: number; numCols: number } | null {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) return null;

  const data = cacheSheet.getDataRange().getValues();
  const monthRows: Array<[string, number]> = [];
  for (const row of data) {
    const key = String(row[0]);
    if (key.startsWith('month_')) {
      monthRows.push([key.replace('month_', ''), Number(row[1])]);
    }
  }
  if (monthRows.length === 0) return null;

  return writeChartData(['月', 'ツイート数'], monthRows);
}

function createTweetsByMonthChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const ref = writeMonthChartData();
  if (!ref) throw new Error('月次データがありません');

  return sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA)!
      .getRange(ref.startRow, ref.startCol, ref.numRows, ref.numCols))
    .setPosition(3, 1, 0, 0)
    .setOption('title', '📈 月間投稿トレンド')
    .setOption('width', 500)
    .setOption('height', 250)
    .setOption('curveType', 'function')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COLORS.primary])
    .setOption('pointSize', 5)
    .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
    .setOption('vAxis', { minValue: 0 })
    .build();
}

// ─── グラフ2: ツイート種別構成 ───

function writeTypeChartData(): { startRow: number; startCol: number; numRows: number; numCols: number } | null {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) return null;

  const data = cacheSheet.getDataRange().getValues();
  const typeOrder = ['Original', 'Reply', 'Retweet', 'Quote'];
  const typeData: Array<[string, number]> = typeOrder.map((key) => {
    const found = data.find((r) => r[0] === `type_${key}`);
    return [key, found ? Number(found[1]) : 0];
  });

  return writeChartData(['種別', '件数'], typeData);
}

function createTweetsByTypeChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const ref = writeTypeChartData();
  if (!ref) throw new Error('種別データがありません');

  const colors = ['Original', 'Reply', 'Retweet', 'Quote']
    .map((t) => TYPE_COLORS[t] || COLORS.gray);

  return sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA)!
      .getRange(ref.startRow, ref.startCol, ref.numRows, ref.numCols))
    .setPosition(3, 8, 0, 0)
    .setOption('title', '📊 ツイート種別構成')
    .setOption('width', 450)
    .setOption('height', 220)
    .setOption('legend', { position: 'none' })
    .setOption('colors', colors)
    .setOption('hAxis', { minValue: 0 })
    .build();
}

// ─── グラフ3: トップいいねランキング ───

function writeTopLikedChartData(): { startRow: number; startCol: number; numRows: number; numCols: number } | null {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) return null;

  const data = cacheSheet.getDataRange().getValues();
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

  if (topEntries.length === 0) return null;

  return writeChartData(
    ['ツイート', 'いいね'],
    topEntries.map((e) => [e.text, e.likes]),
  );
}

function createTopLikedChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const ref = writeTopLikedChartData();
  if (!ref) throw new Error('いいねデータがありません');

  return sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA)!
      .getRange(ref.startRow, ref.startCol, ref.numRows, ref.numCols))
    .setPosition(16, 1, 0, 0)
    .setOption('title', '🏆 トップいいねランキング')
    .setOption('width', 500)
    .setOption('height', 300)
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COLORS.orange])
    .setOption('hAxis', { minValue: 0 })
    .build();
}

// ─── グラフ4: 曜日アクティビティ ───

function writeDayOfWeekChartData(): { startRow: number; startCol: number; numRows: number; numCols: number } | null {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) return null;

  const data = cacheSheet.getDataRange().getValues();
  const dayData: Array<[string, number]> = DAY_KEYS.map((key) => {
    const found = data.find((r) => r[0] === `day_${key}`);
    return [key, found ? Number(found[1]) : 0];
  });

  return writeChartData(
    ['曜日', 'ツイート数'],
    dayData.map((r, i) => [DAY_LABELS_JP[i], r[1]]),
  );
}

function createDayOfWeekChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const ref = writeDayOfWeekChartData();
  if (!ref) throw new Error('曜日データがありません');

  return sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA)!
      .getRange(ref.startRow, ref.startCol, ref.numRows, ref.numCols))
    .setPosition(16, 8, 0, 0)
    .setOption('title', '🗓️ 曜日アクティビティ')
    .setOption('width', 450)
    .setOption('height', 250)
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COLORS.accent])
    .setOption('vAxis', { minValue: 0 })
    .build();
}

// ─── グラフ5: ブックマークカテゴリ ───

function writeBookmarkCategoryChartData(): { startRow: number; startCol: number; numRows: number; numCols: number } | null {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) return null;

  const data = cacheSheet.getDataRange().getValues();
  const catData: Array<[string, number]> = [];

  for (const row of data) {
    const key = String(row[0]);
    if (key.startsWith('bm_cat_')) {
      catData.push([key.replace('bm_cat_', ''), Number(row[1])]);
    }
  }

  if (catData.length === 0) return null;

  return writeChartData(['カテゴリ', '件数'], catData);
}

function createBookmarkCategoryChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const ref = writeBookmarkCategoryChartData();
  if (!ref) throw new Error('カテゴリデータがありません');

  const donutColors = [
    COLORS.primary, COLORS.secondary, COLORS.accent,
    COLORS.green, COLORS.orange, COLORS.pink,
    COLORS.teal, COLORS.gray,
  ];

  return sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA)!
      .getRange(ref.startRow, ref.startCol, ref.numRows, ref.numCols))
    .setPosition(29, 1, 0, 0)
    .setOption('title', '🏷️ ブックマークカテゴリ')
    .setOption('width', 450)
    .setOption('height', 300)
    .setOption('pieHole', 0.4)
    .setOption('colors', donutColors)
    .build();
}

// ─── グラフ6: 時間帯アクティビティ ───

function writeHourlyChartData(): { startRow: number; startCol: number; numRows: number; numCols: number } | null {
  const cacheSheet = getCacheSheet();
  if (!cacheSheet) return null;

  const data = cacheSheet.getDataRange().getValues();

  const hourData: Record<string, Record<number, number>> = {};
  for (const row of data) {
    const key = String(row[0]);
    if (key.startsWith('hour_')) {
      const parts = key.split('_');
      if (parts.length >= 3) {
        const day = parts[1];
        const hour = parseInt(parts[2], 10);
        if (!hourData[day]) hourData[day] = {};
        hourData[day][hour] = Number(row[1]);
      }
    }
  }

  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}時`);
  const header = ['', ...hourLabels];

  const rows: Array<Array<string | number>> = DAY_KEYS.map((day, di) => {
    const dayLabel = DAY_LABELS_JP[di];
    const hourCounts = Array.from({ length: 24 }, (_, h) => hourData[day]?.[h] ?? 0);
    return [dayLabel, ...hourCounts];
  });

  return writeChartData(header, rows);
}

function createHourlyActivityChart(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): GoogleAppsScript.Spreadsheet.EmbeddedChart {
  const ref = writeHourlyChartData();
  if (!ref) throw new Error('時間帯データがありません');

  return sheet.newChart()
    .setChartType(Charts.ChartType.AREA)
    .addRange(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA)!
      .getRange(ref.startRow, ref.startCol, ref.numRows, ref.numCols))
    .setPosition(29, 8, 0, 0)
    .setOption('title', '⏰ 時間帯アクティビティ')
    .setOption('width', 500)
    .setOption('height', 250)
    .setOption('legend', { position: 'right' })
    .setOption('colors', [COLORS.primary, COLORS.orange, COLORS.green, COLORS.accent, COLORS.pink, COLORS.teal, COLORS.gray])
    .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
    .setOption('vAxis', { minValue: 0 })
    .build();
}

/** _CHART_DATA の時間帯マトリクスに条件付き書式（3色スケール）を適用 */
function createHourHeatmapFormatting(): void {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHART_DATA);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const dataRange = sheet.getRange(2, 2, lastRow - 1, 24);
  const newRule = SpreadsheetApp.newConditionalFormatRule()
    .setRanges([dataRange])
    .setGradientMinpoint('#F5F5F5')
    .setGradientMidpointWithValue('#FFD700', SpreadsheetApp.InterpolationType.PERCENTILE, '50')
    .setGradientMaxpoint('#FF4500')
    .build();

  sheet.setConditionalFormatRules([newRule]);
}
