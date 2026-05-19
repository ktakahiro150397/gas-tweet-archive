/**
 * ダッシュボードキャッシュ計算用モジュール
 *
 * プリコンピュート方式：TWEETSシートの生データをGASで集計し、
 * _CACHEシートに書き込む。DASHBOARDは_CACHEのSUM参照のみ。
 */

import { TweetRow, DashboardCache } from '../types';

/** キャッシュ計算エントリポイント */
export function computeCache(rows: TweetRow[]): DashboardCache {
  const byMonth = aggregateByMonth(rows);
  const byType = aggregateByType(rows);
  const byDayOfWeek = aggregateByDayOfWeek(rows);
  const byHour = aggregateByHour(rows);
  const topLiked = getTopLiked(rows, 10);
  const topAuthors = getTopAuthors(rows, 10);

  return {
    totalTweets: rows.length,
    totalLikes: rows.reduce((sum, r) => sum + r.likes, 0),
    activePeriodStart: rows.length > 0 ? rows[rows.length - 1].date : '',
    activePeriodEnd: rows.length > 0 ? rows[0].date : '',
    totalBookmarks: 0,
    tweetsByMonth: byMonth,
    tweetsByType: byType,
    tweetsByDayOfWeek: byDayOfWeek,
    tweetsByHour: byHour,
    topLiked,
    topAuthors,
    bookmarkCategories: [],
  };
}

function aggregateByMonth(rows: TweetRow[]): Array<{ month: string; count: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.slice(0, 7); // "2023-03"
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateByType(rows: TweetRow[]): Record<string, number> {
  const result: Record<string, number> = { Original: 0, Reply: 0, Retweet: 0, Quote: 0 };
  for (const row of rows) {
    result[row.type] = (result[row.type] || 0) + 1;
  }
  return result;
}

function aggregateByDayOfWeek(rows: TweetRow[]): Record<string, number> {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: Record<string, number> = {};
  for (const d of days) result[d] = 0;
  for (const row of rows) {
    const day = days[new Date(row.date).getDay()];
    result[day] = (result[day] || 0) + 1;
  }
  return result;
}

function aggregateByHour(rows: TweetRow[]): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {};
  for (const row of rows) {
    const hour = parseInt(row.time.split(':')[0], 10);
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(row.date).getDay()];
    if (!result[day]) result[day] = {};
    result[day][hour] = (result[day][hour] || 0) + 1;
  }
  return result;
}

function getTopLiked(rows: TweetRow[], n: number) {
  return [...rows]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, n)
    .map((r) => ({ text: r.text.slice(0, 80), likes: r.likes, date: r.date }));
}

function getTopAuthors(_rows: TweetRow[], _n: number): Array<{ author: string; count: number }> {
  // TWEETSシートには著者情報がないため別途集計が必要
  // bookmark.jsが別途インポートされた時に計算する
  return [];
}
