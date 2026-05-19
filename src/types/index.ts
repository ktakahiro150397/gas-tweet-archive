/**
 * X(Twitter) データアーカイブ 型定義
 *
 * このファイルは型の再エクスポートと追加型定義を提供します。
 * 主要な型は src/gas/import.ts および src/gas/dashboard.ts に定義されています。
 */

export type { Tweet, Bookmark, TweetRow, TweetType } from '../gas/import';
export type { DashboardCache } from '../gas/dashboard';

export interface CategoryConfig {
  name: string;
  color: string;
  keywords: string[];
}
