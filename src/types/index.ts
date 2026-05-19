/**
 * X(Twitter) データアーカイブ 型定義
 */

/** tweet.js の1ツイートデータ構造 */
export interface Tweet {
  id_str: string;
  created_at: string;
  full_text: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  source: string;
  in_reply_to_screen_name?: string;
  is_quote_status: boolean;
  entities?: {
    media?: Array<{ type: string }>;
    urls?: Array<{ expanded_url: string }>;
  };
}

/** bookmark.js の1ブックマークデータ構造 */
export interface Bookmark {
  id_str: string;
  created_at: string;
  full_text: string;
  user: {
    screen_name: string;
    name: string;
  };
  favorite_count: number;
  retweet_count: number;
}

/** インポート後の正規化されたツイート行 */
export interface TweetRow {
  date: string;
  time: string;
  text: string;
  type: TweetType;
  likes: number;
  retweets: number;
  replies: number;
  source: string;
  url: string;
  hasImage: boolean;
  weekNumber: number;
}

/** ツイート種別 */
export type TweetType = 'Original' | 'Reply' | 'Retweet' | 'Quote';

/** ダッシュボードキャッシュ */
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

/** カテゴリ設定 */
export interface CategoryConfig {
  name: string;
  color: string;
  keywords: string[];
}
