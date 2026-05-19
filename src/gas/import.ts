/**
 * Xデータアーカイブ（tweet.js / bookmark.js）のパーサー
 */

import { Tweet, Bookmark, TweetRow, TweetType, Bookmark as BookmarkType } from '../types';

/**
 * tweet.js の内容を解析し、正規化された行データに変換する
 *
 * @param rawJson tweet.js のJSON文字列（もしくはtweet.js内部の配列データ）
 * @returns 正規化されたツイート行の配列
 */
export function parseTweetArchive(rawJson: string): TweetRow[] {
  const tweets: Tweet[] = JSON.parse(rawJson);
  return tweets.map(tweetToRow);
}

/**
 * bookmark.js を解析する
 */
export function parseBookmarkArchive(rawJson: string): TweetRow[] {
  const bookmarks: BookmarkType[] = JSON.parse(rawJson);
  return bookmarks.map((bm) => ({
    date: bm.created_at,
    time: extractTime(bm.created_at),
    text: bm.full_text,
    type: 'Original' as TweetType,
    likes: bm.favorite_count,
    retweets: bm.retweet_count,
    replies: 0,
    source: 'Twitter Web',
    url: `https://x.com/${bm.user.screen_name}/status/${bm.id_str}`,
    hasImage: false,
    weekNumber: 0,
  }));
}

function tweetToRow(tweet: Tweet): TweetRow {
  const type = classifyTweet(tweet);
  const { dateStr, timeStr } = parseTimestamp(tweet.created_at);
  return {
    date: dateStr,
    time: timeStr,
    text: tweet.full_text,
    type,
    likes: tweet.favorite_count || 0,
    retweets: tweet.retweet_count || 0,
    replies: tweet.reply_count || 0,
    source: extractSourceName(tweet.source),
    url: `https://x.com/i/web/status/${tweet.id_str}`,
    hasImage: !!(tweet.entities?.media?.length),
    weekNumber: 0, // 後日計算
  };
}

function classifyTweet(tweet: Tweet): TweetType {
  if (tweet.retweet_count > 0 && tweet.full_text.startsWith('RT')) return 'Retweet';
  if (tweet.in_reply_to_screen_name) return 'Reply';
  if (tweet.is_quote_status) return 'Quote';
  return 'Original';
}

function parseTimestamp(createdAt: string): { dateStr: string; timeStr: string } {
  // Xのタイムスタンプ: "Wed Mar 15 14:23:05 +0000 2023"
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    timeStr: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function extractSourceName(sourceHtml: string): string {
  const match = />(.*?)</.exec(sourceHtml);
  return match ? match[1] : 'Unknown';
}

/** バッチ分割してチャンク配列を返す */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
