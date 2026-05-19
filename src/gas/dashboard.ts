/**
 * ダッシュボードキャッシュ型定義
 *
 * キャッシュ計算ロジックは main.ts の refreshDashboard() に
 * インライン実装されています。このモジュールは型定義のみを提供します。
 *
 * @see main.ts#refreshDashboard
 */

import type { TweetType } from './import';

export interface DashboardCache {
  totalTweets: number;
  totalLikes: number;
  activePeriodStart: string;
  activePeriodEnd: string;
  totalBookmarks: number;
  tweetsByMonth: Array<{ month: string; count: number }>;
  tweetsByType: Record<TweetType, number>;
  tweetsByDayOfWeek: Record<string, number>;
  tweetsByHour: Record<string, Record<number, number>>;
  topLiked: Array<{ text: string; likes: number; date: string }>;
  topAuthors: Array<{ author: string; count: number }>;
  bookmarkCategories: Array<{ category: string; count: number }>;
}
