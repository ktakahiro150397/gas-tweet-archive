/**
 * tweet.js / bookmark.js パーサー
 *
 * X(Twitter) のデータアーカイブから出力される JSON ファイルを解析し、
 * スプレッドシートに書き込むための二次元配列に変換する。
 *
 * 対応形式:
 * - tweet.js（window.YTD.tweet.part0 = [...] 形式 / 生JSON形式）
 * - bookmark.js（同様）
 * - tweets.json / bookmarks.json（生JSON）
 *
 * @module import
 */

// ─── 型定義 ──────────────────────────────────────────────────────

/** tweet.js の1ツイートデータ構造 */
export interface Tweet {
  id_str: string;
  created_at: string;
  full_text?: string;
  text?: string;
  favorite_count?: number;
  favorite?: number;
  retweet_count?: number;
  retweet?: number;
  reply_count?: number;
  source?: string;
  in_reply_to_screen_name?: string;
  is_quote_status?: boolean;
  entities?: {
    media?: Array<{ type: string }>;
    urls?: Array<{ expanded_url: string }>;
  };
  tweet?: Tweet;
}

/** bookmark.js のデータ構造 */
export interface Bookmark {
  id_str: string;
  created_at?: string;
  full_text?: string;
  text?: string;
  user?: { screen_name: string; name?: string };
  screen_name?: string;
  favorite_count?: number;
  retweet_count?: number;
  bookmark?: Bookmark;
  tweet?: { full_text?: string };
}

// ─── メイン関数 ──────────────────────────────────────────────────

/**
 * tweet.js の内容をパースし、スプレッドシート書き込み用の
 * 二次元配列を返す。
 *
 * @param rawJson - tweet.js のファイル内容（文字列）
 * @returns [日付, 時刻, 本文, 種別, いいね数, RT数, リプ数, 媒体, URL, 画像有無, 週番号] の配列
 * @throws JSONのパースに失敗した場合
 */
export function parseTweetJs(rawJson: string): string[][] {
  const json = extractJson(rawJson);
  const tweets: Tweet[] = ensureArray(JSON.parse(json));

  return tweets.map((t) => {
    const tw: Tweet = t.tweet ?? t;
    const createdAt = tw.created_at || '';
    const { dateStr, timeStr } = parseTimestamp(createdAt);
    const text = (tw.full_text ?? tw.text ?? '') as string;
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

    const media = tw.entities?.media || [];
    const hasImage = media.length > 0;

    return [
      dateStr,
      timeStr,
      text,
      type,
      String(fav),
      String(rt),
      String(reply),
      source,
      `https://x.com/i/web/status/${tw.id_str}`,
      hasImage ? 'TRUE' : 'FALSE',
      '', // 週番号（後日対応。WEEKNUM数式で補完可能）
    ];
  });
}

/**
 * bookmark.js の内容をパースする。
 *
 * @param rawJson - bookmark.js のファイル内容
 * @returns [保存日, 著者, 内容, いいね数, URL, カテゴリ, 重要度, ステータス, メモ] の配列
 */
export function parseBookmarkJs(rawJson: string): string[][] {
  const json = extractJson(rawJson);
  const bmList: Bookmark[] = ensureArray(JSON.parse(json));

  return bmList.map((b) => {
    const bm: Bookmark = b.bookmark ?? b;
    const createdAt = bm.created_at || '';
    let dateStr = createdAt.slice(0, 10);
    if (!dateStr || dateStr === '' || isNaN(Date.parse(createdAt))) {
      const parsed = parseTimestamp(createdAt);
      dateStr = parsed.dateStr;
    }

    const text = (bm.full_text ?? bm.tweet?.full_text ?? bm.text ?? '') as string;
    const userObj = (bm.user ?? {}) as { screen_name?: string };
    const screenName = userObj.screen_name ?? bm.screen_name ?? '';
    const fav = Number(bm.favorite_count ?? 0);
    const rt = Number(bm.retweet_count ?? 0);

    return [
      dateStr,
      screenName ? `@${screenName}` : '',
      text,
      String(fav),
      screenName
        ? `https://x.com/${screenName}/status/${bm.id_str}`
        : `https://x.com/i/web/status/${bm.id_str}`,
      '',    // カテゴリ（手動入力）
      '',    // 重要度（手動入力）
      '未整理', // ステータス（初期値）
      '',    // メモ
    ];
  });
}

// ─── ユーティリティ関数 ──────────────────────────────────────────

/**
 * tweet.js 特有の "window.YTD.tweet.part0 = [...]" プレフィックスを除去する。
 * すでに生JSONの場合はそのまま返す。
 *
 * 対応パターン:
 * - window.YTD.tweet.part0 = [...]
 * - window.YTD.tweet.part0 = {...}
 * - window.YTD.bookmark.part0 = [...]
 * - [...]
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const prefixMatch = /^window\.YTD\.\w+\.\w+\s*=\s*/;
  if (prefixMatch.test(trimmed)) {
    return trimmed.replace(prefixMatch, '').replace(/;$/, '');
  }
  return trimmed;
}

/**
 * Xのタイムスタンプ文字列を解析し、日付部分と時刻部分に分ける。
 *
 * 対応形式:
 * - "Wed Mar 15 14:23:05 +0000 2023"（X標準）
 * - "2023-03-15T14:23:05.000Z"（ISO 8601）
 * - "2023-03-15 14:23:05"（簡易形式）
 */
export function parseTimestamp(createdAt: string): { dateStr: string; timeStr: string } {
  if (!createdAt) return { dateStr: '', timeStr: '' };
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) {
    // new Date() でパースできない場合、手動パースを試みる
    const manual = tryManualParse(createdAt);
    if (manual) return manual;
    return { dateStr: '', timeStr: '' };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    timeStr: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * 標準Dateコンストラクタでパースできないタイムスタンプを手動で解析する
 * （例: "Wed Mar 15 14:23:05 +0000 2023" が稀に失敗するケースのフォールバック）
 */
function tryManualParse(raw: string): { dateStr: string; timeStr: string } | null {
  // "E MMM DD HH:mm:ss Z YYYY" 形式
  const parts = raw.split(' ');
  if (parts.length >= 6) {
    const monthMap: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04',
      May: '05', Jun: '06', Jul: '07', Aug: '08',
      Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };
    const month = monthMap[parts[1]];
    const day = parts[2].padStart(2, '0');
    const year = parts[5];
    const timeParts = parts[3].split(':');
    if (month && day && year && timeParts.length >= 2) {
      return {
        dateStr: `${year}-${month}-${day}`,
        timeStr: `${timeParts[0]}:${timeParts[1]}`,
      };
    }
  }
  return null;
}

/**
 * sourceフィールドのHTMLタグからアプリ名だけを抽出する。
 *
 * 入力例: '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>'
 * 出力例: 'Twitter for iPhone'
 */
export function extractSourceName(sourceHtml: string): string {
  if (!sourceHtml) return 'Unknown';
  const match = />([^<]+)</.exec(sourceHtml);
  return match ? match[1].trim() : sourceHtml.slice(0, 40);
}

/**
 * JSONパース結果が配列でない場合、配列でラップする。
 * tweet.js が稀に { tweet: {...} } 単体を返す場合があるため。
 */
function ensureArray<T>(data: T | T[]): T[] {
  return Array.isArray(data) ? data : [data];
}

/**
 * 配列を指定サイズのチャンクに分割する。
 * 大量データをバッチ書き込みする際に使用。
 *
 * @param arr - 分割する配列
 * @param size - 1チャンクあたりの要素数
 * @returns チャンク配列の配列
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
