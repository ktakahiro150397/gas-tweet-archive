/**
 * GASエントリポイント
 *
 * スプレッドシートにメニューを追加し、各機能を紐付ける。
 * HTML Service によるアップロードダイアログからファイルを受け取り、
 * インポート・キャッシュ更新までを一貫して処理する。
 *
 * @see https://github.com/ktakahiro150397/gas-tweet-archive
 */

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
const TWEET_HEADERS = [
  '日付', '時刻', 'ツイート本文', '種別',
  'いいね数', 'RT数', 'リプライ数', '媒体',
  'URL', '画像あり？', '週番号',
];

/** BOOKMARKSシートのヘッダー定義 */
const BOOKMARK_HEADERS = [
  '保存日', '著者', '内容', 'いいね数', 'URL',
  '🏷️ カテゴリ', '⭐ 重要度', 'ステータス', 'メモ',
];

/** インポート時の1回あたりの書き込み行数 */
const CHUNK_SIZE = 1000;

/** デフォルトカテゴリ（初回セットアップ時にBOOKMARKSシートに設定） */
const DEFAULT_CATEGORIES = [
  '投資', '技術・AI', '雑学・教養', '仕事術',
  '趣味・エンタメ', '健康', '政治・経済', 'その他',
];

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
    .addItem('📖 使い方ガイド表示', 'showGuide')
    .addSeparator()
    .addItem('ℹ️ バージョン情報', 'showAbout')
    .addToUi();
}

// ─── メニューアクション ──────────────────────────────────────────

/**
 * アップロードダイアログをモーダル表示する
 */
export function showUploadDialog(): void {
  const html = HtmlService.createHtmlOutputFromFile('dialog')
    .setWidth(480)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '📥 Xアーカイブをインポート');
}

/**
 * 使い方ガイドをサイドバー表示する
 */
export function showGuide(): void {
  const html = HtmlService.createHtmlOutputFromFile('guide')
    .setTitle('📖 使い方ガイド');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * バージョン情報を表示する
 */
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
 * アップロードされたファイルを処理する
 *
 * HTMLダイアログ（dialog.html）から google.script.run で呼ばれる。
 * tweet.js / bookmark.js を JSON パースし、該当シートに書き込む。
 *
 * @param fileContent - FileReader.readAsText() で読まれたファイル内容
 * @param fileName    - 元のファイル名（tweet.js / bookmark.js 判別に使う）
 * @returns 完了メッセージ（Toast表示用）
 */
export function processUploadedFile(fileContent: string, fileName: string): string {
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
  setupSheetFormatting(sheetName, isBookmark);

  // カテゴリシートがなければ初期化（ブックマークインポート時のみ）
  if (isBookmark) {
    ensureCategorySheet();
  }

  // キャッシュ再計算
  refreshDashboard();

  return `✅ 完了！ ${rows.length.toLocaleString()} 件をインポートしました（${fileName}）`;
}

// ─── パース処理 ──────────────────────────────────────────────────

/**
 * tweet.js をパースして二次元配列を返す
 */
function parseTweetJs(rawJson: string): string[][] {
  // tweet.js は "window.YTD.tweet.part0 = [...]" 形式の場合がある
  // JSONのみの場合もあるので両方に対応
  const json = extractJson(rawJson);
  const tweets = JSON.parse(json);
  if (!Array.isArray(tweets)) {
    // { tweet: { ... } } ラップ対応
    const extracted = tweets as Record<string, unknown>;
    if (extracted.tweet) return parseTweetJs(JSON.stringify(extracted.tweet));
    throw new Error('tweet.js の形式が認識できませんでした');
  }

  return tweets.map((t: Record<string, unknown>) => {
    // ネスト構造対応: { tweet: { ... } } or 直
    const tw = (t.tweet as Record<string, unknown>) ?? t;
    const createdAt = tw.created_at as string || '';
    const { dateStr, timeStr } = parseTimestamp(createdAt);
    const text = (tw.full_text || tw.text || '') as string;
    const fav = Number(tw.favorite_count ?? tw.favorite ?? 0);
    const rt = Number(tw.retweet_count ?? tw.retweet ?? 0);
    const reply = Number(tw.reply_count ?? 0);
    const source = extractSourceName((tw.source as string) || '');
    const inReplyTo = tw.in_reply_to_screen_name as string | undefined;
    const isQuote = Boolean(tw.is_quote_status);
    const isRetweet = text.startsWith('RT @');
    const type = isRetweet ? 'Retweet'
      : inReplyTo ? 'Reply'
      : isQuote ? 'Quote'
      : 'Original';

    const media = ((tw.entities as Record<string, unknown>)?.media as unknown[]) || [];
    const hasImage = media.length > 0;

    return [
      dateStr, timeStr, text, type,
      fav, rt, reply, source,
      `https://x.com/i/web/status/${tw.id_str}`,
      hasImage ? 'TRUE' : 'FALSE',
      '', // 週番号（後日QUICKWEEK関数などで）
    ];
  });
}

/**
 * bookmark.js をパースして二次元配列を返す
 */
function parseBookmarkJs(rawJson: string): string[][] {
  const json = extractJson(rawJson);
  const bookmarks = JSON.parse(json);
  if (!Array.isArray(bookmarks)) {
    throw new Error('bookmark.js の形式が認識できませんでした');
  }

  return bookmarks.map((b: Record<string, unknown>) => {
    const bm = b.bookmark ?? b;

    // 日付をパース（ISO 8601対応）
    const createdAt = (bm.created_at as string) || '';
    let dateStr = createdAt.slice(0, 10);
    if (!dateStr || dateStr === '') {
      const parsed = parseTimestamp(createdAt);
      dateStr = parsed.dateStr;
    }

    const text = (bm.full_text || bm.tweet?.full_text || bm.text || '') as string;
    const user = (bm.user as Record<string, string>) || {};
    const screenName = user.screen_name || bm.screen_name || '';
    const fav = Number(bm.favorite_count ?? 0);
    const rt = Number(bm.retweet_count ?? 0);

    return [
      dateStr,
      screenName ? `@${screenName}` : '',
      text,
      fav,
      `https://x.com/${screenName}/status/${bm.id_str}`,
      '',   // カテゴリ（手動入力）
      '',   // 重要度（手動入力）
      '未整理', // ステータス（初期値）
      '',   // メモ
    ];
  });
}

/**
 * tweet.js の "window.YTD.tweet.part0 = [...]" ラップを除去し
 * JSON部分だけを抽出する。すでに生JSONならそのまま返す。
 */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  // "window.YTD.tweet.part0 = " で始まるパターン
  const prefixMatch = /^window\.YTD\.\w+\.\w+\s*=\s*/;
  if (prefixMatch.test(trimmed)) {
    return trimmed.replace(prefixMatch, '').replace(/;$/, '');
  }
  return trimmed;
}

/**
 * Xのタイムスタンプ（"Wed Mar 15 14:23:05 +0000 2023"）を
 * "YYYY-MM-DD" と "HH:MM" に分解する
 */
function parseTimestamp(createdAt: string): { dateStr: string; timeStr: string } {
  if (!createdAt) return { dateStr: '', timeStr: '' };
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return { dateStr: '', timeStr: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    timeStr: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * <a>タグで囲まれたsource文字列からアプリ名だけ抽出
 */
function extractSourceName(sourceHtml: string): string {
  if (!sourceHtml) return 'Unknown';
  const match = />([^<]+)</.exec(sourceHtml);
  return match ? match[1].trim() : sourceHtml.slice(0, 40);
}

// ─── シート書き込み（バッチ＋プログレス） ────────────────────────

/**
 * 二次元配列をシートにバッチ書き込みする
 * 1,000行ずつのチャンクに分割し、各チャンクで flush + toast する
 */
function writeRowsToSheet(
  sheetName: string,
  headers: string[],
  rows: string[][],
): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  // シートがなければ作成
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // 既存データを全クリア
  sheet.clear();
  const lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    sheet.getRange(1, 1, lastRow, headers.length).clearContent();
  }

  const totalRows = rows.length;

  // ヘッダー書き込み
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  // バッチ書き込み
  for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const startRow = i + 2; // ヘッダー行の次から
    const range = sheet.getRange(startRow, 1, chunk.length, headers.length);
    range.setValues(chunk);
    SpreadsheetApp.flush();

    // プログレス表示（初回と10回に1回は更新を見やすく）
    const processed = Math.min(i + CHUNK_SIZE, totalRows);
    const pct = Math.round((processed / totalRows) * 100);
    const msg = `📥 書き込み中... ${pct}%（${processed.toLocaleString()}/${totalRows.toLocaleString()}行）`;
    ss.toast(msg, '📊 X Archive Tools', 2);
  }
}

/**
 * シートの書式を設定する
 */
function setupSheetFormatting(sheetName: string, isBookmark: boolean): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return;

  // 全範囲に標準書式
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  range.setFontSize(11);
  range.setVerticalAlignment('top');

  // ヘッダー行を固定
  sheet.setFrozenRows(1);

  // ブックマークならカテゴリ列にプルダウン設定
  if (isBookmark) {
    const categoryCol = 6; // F列 = カテゴリ
    const importanceCol = 7; // G列 = 重要度
    const statusCol = 8; // H列 = ステータス

    // カテゴリのプルダウン（CATEGORIESシートから動的に取得）
    const catSheet = ss.getSheetByName(SHEETS.CATEGORIES);
    if (catSheet) {
      const cats = catSheet.getRange(2, 1, catSheet.getLastRow() - 1, 1).getValues()
        .filter((r: string[][]) => r[0])
        .map((r: string[][]) => r[0]);
      if (cats.length > 0) {
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(cats, true)
          .build();
        sheet.getRange(2, categoryCol, Math.max(lastRow - 1, 1), 1).setDataValidation(rule);
      }
    }

    // 重要度のプルダウン
    const impRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['⭐', '⭐⭐', '⭐⭐⭐'], true)
      .build();
    sheet.getRange(2, importanceCol, Math.max(lastRow - 1, 1), 1).setDataValidation(impRule);

    // ステータスのプルダウン
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['未整理', '読了', 'アクション済み', '定期的に見返す'], true)
      .build();
    sheet.getRange(2, statusCol, Math.max(lastRow - 1, 1), 1).setDataValidation(statusRule);
  }

  // 列幅の自動調整（最初の数列だけ）
  sheet.autoResizeColumn(1);
  sheet.autoResizeColumn(2);
  if (lastCol >= 3) sheet.autoResizeColumn(3);
}

// ─── カテゴリシート管理 ──────────────────────────────────────────

/**
 * CATEGORIESシートがなければ作成し、デフォルトカテゴリをセットする
 */
function ensureCategorySheet(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.CATEGORIES);

  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.CATEGORIES);
    sheet.getRange(1, 1).setValue('カテゴリ名');
    sheet.getRange(1, 2).setValue('アイコン');
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');

    const cats = [
      ['投資', '📈'],
      ['技術・AI', '💻'],
      ['雑学・教養', '📚'],
      ['仕事術', '💼'],
      ['趣味・エンタメ', '🎮'],
      ['健康', '🏃'],
      ['政治・経済', '🏛️'],
      ['その他', '📌'],
    ];
    sheet.getRange(2, 1, cats.length, 2).setValues(cats);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumn(1);
  }
}

// ─── ダッシュボード更新 ──────────────────────────────────────────

/**
 * ダッシュボードキャッシュを再計算する
 *
 * TWEETS / BOOKMARKS シートから全データを読み込み、
 * 集計結果を _CACHE シートに書き込む。
 * DASHBOARDは_CACHEの値をSUM参照するだけなので軽量。
 */
export function refreshDashboard(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tweetsSheet = ss.getSheetByName(SHEETS.TWEETS);
  const bookmarksSheet = ss.getSheetByName(SHEETS.BOOKMARKS);
  let cacheSheet = ss.getSheetByName(SHEETS.CACHE);

  if (!cacheSheet) {
    cacheSheet = ss.insertSheet(SHEETS.CACHE);
  }
  cacheSheet.clear();

  // キャッシュデータの構築
  const cache: string[][] = [];

  // TWEETS集計
  const tweetRows = tweetsSheet ? tweetsSheet.getDataRange().getValues() : [];
  if (tweetRows.length > 1) {
    const dataRows = tweetRows.slice(1); // ヘッダー除去
    const totalTweets = dataRows.length;
    let totalLikes = 0;
    const typeCount: Record<string, number> = {};
    const monthCount: Record<string, number> = {};
    const dayCount: Record<string, number> = {};
    const hourCount: Record<string, Record<number, number>> = {};
    const topLiked: Array<{ text: string; likes: number; date: string }> = [];
    let minDate = '';
    let maxDate = '';

    for (const row of dataRows) {
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
      monthCount[month] = (monthCount[month] || 0) + 1;

      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = days[d.getDay()];
        dayCount[dayName] = (dayCount[dayName] || 0) + 1;

        const hour = parseInt(time.split(':')[0], 10);
        if (!isNaN(hour)) {
          if (!hourCount[dayName]) hourCount[dayName] = {};
          hourCount[dayName][hour] = (hourCount[dayName][hour] || 0) + 1;
        }
      }

      // Topいいね（上位10件を保持）
      topLiked.push({ text: text.slice(0, 80), likes, date });
    }

    topLiked.sort((a, b) => b.likes - a.likes);
    const top10 = topLiked.slice(0, 10);

    // キャッシュに書き込み
    cache.push(['total_tweets', String(totalTweets)]);
    cache.push(['total_likes', String(totalLikes)]);
    cache.push(['active_period_start', minDate]);
    cache.push(['active_period_end', maxDate]);

    // 月次集計
    const sortedMonths = Object.entries(monthCount).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [month, count] of sortedMonths) {
      cache.push([`month_${month}`, String(count)]);
    }

    // 種別集計
    for (const [type, count] of Object.entries(typeCount)) {
      cache.push([`type_${type}`, String(count)]);
    }

    // 曜日集計
    for (const [day, count] of Object.entries(dayCount)) {
      cache.push([`day_${day}`, String(count)]);
    }

    // Topいいね
    for (let i = 0; i < top10.length; i++) {
      cache.push([`top_liked_${i + 1}_text`, top10[i].text]);
      cache.push([`top_liked_${i + 1}_likes`, String(top10[i].likes)]);
      cache.push([`top_liked_${i + 1}_date`, top10[i].date]);
    }
  }

  // BOOKMARKS集計
  if (bookmarksSheet) {
    const bmRows = bookmarksSheet.getDataRange().getValues();
    if (bmRows.length > 1) {
      const dataRows = bmRows.slice(1);
      cache.push(['total_bookmarks', String(dataRows.length)]);

      const catCount: Record<string, number> = {};
      for (const row of dataRows) {
        const cat = String(row[5] || '未分類');
        catCount[cat] = (catCount[cat] || 0) + 1;
      }
      for (const [cat, count] of Object.entries(catCount)) {
        cache.push([`bm_cat_${cat}`, String(count)]);
      }
    }
  }

  // _CACHEに書き込み
  if (cache.length > 0) {
    cacheSheet.getRange(1, 1, cache.length, 2).setValues(cache);
    cacheSheet.setFrozenRows(0);
  }

  ss.toast(`✅ ダッシュボードを更新しました（${cache.length}項目）`, '📊 X Archive Tools', 3);
}

// ─── シート初期化（初回セットアップ用） ──────────────────────────

/**
 * 全シートを初期化する（初回のみ実行されるセットアップ用）
 * メニューには出さず、開発者用
 */
export function initializeSheets(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetNames = Object.values(SHEETS);

  // 既存シートをチェック、なければ作成
  for (const name of sheetNames) {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  }

  // SETTINGSシートに初期設定を書き込み
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

  // カテゴリを初期化
  ensureCategorySheet();

  ss.toast('✅ 初期化が完了しました', '📊 X Archive Tools', 3);
}
