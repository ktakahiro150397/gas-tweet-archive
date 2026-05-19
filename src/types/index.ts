/**
 * X(Twitter) データアーカイブ 型定義
 *
 * このファイルは現在使用されていません。
 * 型定義は src/gas/import.ts に一元化されています。
 *
 * @deprecated 代わりに src/gas/import.ts の Tweet, Bookmark 型を使用してください
 */

export type { Tweet, Bookmark, TweetRow, TweetType } from '../gas/import';

export interface DashboardCache {
  /** 総ツイート数 */
  totalTweets: number;
  /** 総いいね数 */
  totalLikes: number;
  /** アクティブ期間開始日 */
  activePeriodStart: string;
  /** アクティブ期間終了日 */
  activePeriodEnd: string;
  /** 総ブックマーク数 */
  totalBookmarks: number;
  /** 月次ツイート数 */
  tweetsByMonth: Array<{ month: string; count: number }>;
  /** ツイート種別構成比 */
  tweetsByType: Record<string, number>;
  /** 曜日別ツイート数 */
  tweetsByDayOfWeek: Record<string, number>;
  /** 時間帯別アクティビティ */
  tweetsByHour: Record<string, Record<number, number>>;
  /** いいね数TOP10 */
  topLiked: Array<{ text: string; likes: number; date: string }>;
  /** よく絡んだ人TOP10 */
  topAuthors: Array<{ author: string; count: number }>;
  /** ブックマークカテゴリ別集計 */
  bookmarkCategories: Array<{ category: string; count: number }>;
}

export interface CategoryConfig {
  name: string;
  color: string;
  keywords: string[];
}
