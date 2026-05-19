# DESIGN.md — GAS Tweet Archive

## プロジェクト概要

X(Twitter) のデータアーカイブ（tweet.js / bookmark.js）を Google スプレッドシートにインポートし、ダッシュボードで可視化・分析する Google Apps Script プロジェクト。

## 技術スタック

| 項目 | 採用技術 |
|:---|:---|
| 言語 | TypeScript |
| 実行環境 | Google Apps Script (GAS) |
| テスト | Jest + ts-jest |
| デプロイ | clasp (Google Apps Script CLI) |
| ドキュメント | GitHub Pages |

## アーキテクチャ

```
User's PC                    Google Cloud                   User's Browser
┌─────────┐    tweet.js     ┌──────────────────┐           ┌───────────┐
│ X Archive│ ──────────────>│ Google Sheets    │           │ Dashboard │
│ (zip)    │   HTML Dialog  │  ├─ 📊 DASHBOARD │<──────────│ (Graphs)  │
└─────────┘                 │  ├─ 📋 TWEETS    │           └───────────┘
                            │  ├─ 🔖 BOOKMARKS │
                            │  ├─ 🏷️ CATEGORIES│
                            │  ├─ 🔲 _CACHE    │
                            │  ├─ 🔲 _CHART_DATA│
                            │  └─ ⚙️ SETTINGS  │
                            │                  │
                            │ Google Apps Script│
                            │  ├─ main.ts     │  ← エントリポイント / メニュー / 集計
                            │  ├─ import.ts   │  ← tweet.js/bookmark.js パース
                            │  ├─ charts.ts   │  ← グラフ作成 / ヒートマップ
                            │  └─ dashboard.ts│  ← 型定義のみ
                            └──────────────────┘
```

## シート設計

### 📊 DASHBOARD（メインビュー）
- スコアカード: 総ツイート数 / 総いいね数 / アクティブ期間 / 総ブックマーク数
- 月間投稿トレンド（折れ線グラフ）
- ツイート種別構成（積み上げ横棒グラフ）
- トップいいねランキング（横棒グラフ）
- ブックマークカテゴリ（ドーナツグラフ）
- 曜日アクティビティ（縦棒グラフ）
- 時間帯アクティビティ（面グラフ）
- 時間帯ヒートマップ（条件付き書式）

### 📋 TWEETS（生データ）
- 11列のテーブル: 日付, 時刻, 本文, 種別, いいね, RT, リプ, 媒体, URL, 画像有無, 週番号
- **関数ゼロ**（生DB）でパフォーマンス確保
- フィルタビューで検索・ソート対応

### 🔖 BOOKMARKS（ブックマーク）
- 9列: 保存日, 著者, 内容, ♡, URL, カテゴリ, 重要度, ステータス, メモ
- カテゴリ・重要度・ステータスはプルダウン（データバリデーション）

### 🏷️ CATEGORIES（カテゴリ管理）
- ブックマークのカテゴリ一覧。ブックマーク初回インポート時に自動作成。
- 自由に追加・編集可能。プルダウンに自動反映。

### 🔲 _CACHE（キャッシュ：非表示）
- プリコンピュート方式: GASがインポート時に一括計算
- DASHBOARDは_CACHEの値をSUM参照するだけ

### 🔲 _CHART_DATA（グラフ中間データ：非表示）
- グラフ作成時に各グラフの元データを書き込む専用シート
- setupDashboardCharts() を実行するたびに全データを再書き込み
- 条件付き書式で時間帯ヒートマップ効果を提供

## プリコンピュート方式

```
❌ 非効率: DASHBOARDの各セル = QUERY(TWEETS!A:K, ...)
   → 5万行あると開くたびに5秒フリーズ

✅ 採用: GASがインポート時に_CACHEに集計済み値を書き込む
   → DASHBOARDは =_CACHE!B1 をSUM参照するだけ → 0.1秒
```

### バッチ処理
- tweet.js は 1,000行ずつ chunk に分割して書き込み
- 各 chunk 書き込み後に `SpreadsheetApp.flush()` + `toast()` で進捗表示
- 6分制限に引っかからない設計

## インポートフロー

```
┌─────────────┐
│ メニュー選択  │ onOpen() → showUploadDialog()
└──────┬──────┘
       ▼
┌─────────────┐
│ HTML Dialog  │ → ファイル選択
│ (dialog.html)│ → FileReader.readAsText()
└──────┬──────┘
       ▼
┌──────────────────┐
│ GAS: import.ts    │ → JSON.parse() してパース
│ parseTweetJs()    │ → バリデーション・型変換
│ parseBookmarkJs() │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ GAS: main.ts      │ → データをシートにバッチ書き込み
│ writeRowsToSheet()│ → CHUNK_SIZE(1,000行)ずつ flush
│ applySheetFormat  │ → 書式設定・プルダウン
└──────┬───────────┘
       ▼
┌──────────────────┐
│ GAS: main.ts      │ → TWEETS/BOOKMARKSからデータ読み込み
│ refreshDashboard()│ → 各種集計（月別/種別/曜日/時間帯/Topいいね）
└──────┬───────────┘   → _CACHEにkey-value形式で書き込み
       ▼
┌─────────────┐
│ 完了 Toast    │ "✅ 完了！ N件をインポートしました"
└─────────────┘
```

## ディレクトリ構成

```
gas-tweet-archive/
├── .github/workflows/
│   └── deploy-pages.yml      # GitHub Pages 自動デプロイ
├── src/
│   ├── gas/
│   │   ├── main.ts           # GASエントリポイント / メニュー / ダッシュボード集計
│   │   ├── import.ts         # tweet.js/bookmark.js パース
│   │   ├── charts.ts         # グラフ作成 / 時間帯ヒートマップ
│   │   └── dashboard.ts      # 型定義のみ
│   ├── pages/                 # GAS HTML Service 用テンプレート
│   │   ├── dialog.html       # アップロードダイアログ
│   │   └── guide.html        # 使い方ガイドサイドバー
│   └── types/
│       └── index.ts          # 型再エクスポート
├── tests/
│   ├── import.test.ts        # 自動テスト（28件）
│   └── human-test-cases.md   # 手動テストケース一覧
├── docs/
│   ├── index.html            # GitHub Pages トップページ
│   ├── DESIGN.md             # 本設計書
│   └── SETUP.md              # セットアップ手順（開発者向け）
├── dist/                     # コンパイル済みGASコード
├── .clasp.json               # clasp 設定ファイル
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## 競合との差別化ポイント

| 競合 | 価格形態 | アーカイブ全件分析 | グラフ可視化 | 買い切り |
|:---|---|:---:|:---:|:---:|
| Dewey | 月額？ | 🔴 | 🔴 | 🔴 |
| Tweetsmash | 月額 | 🔴 | 🔴 | 🔴 |
| Circleboom | $7-10/月 | 🔴 | 🟡 | 🔴 |
| Raindrop.io | Free/月額Pro | 🔴 | 🔴 | 🟡 |
| **本ツール** | **¥980（予定）** | **🟢** | **🟢** | **🟢** |

## 開発フェーズ

### Phase 1: 基盤構築 ✅
- [x] プロジェクト構成（package.json / tsconfig / jest）
- [x] 型定義
- [x] GAS メニュー実装
- [x] HTML アップロードダイアログ実装
- [x] インポート処理実装（tweet.js / bookmark.js パース）
- [x] ダッシュボード集計実装（refreshDashboard）
- [x] ダッシュボードグラフ設定（7種のグラフ＋ヒートマップ）
- [x] テスト実装（Jest 28件 pass）
- [x] GitHub Pages 公開

### Phase 2: 機能充実
- [ ] clasp デプロイパイプライン構築
- [ ] カスタムカテゴリ編集UI
- [ ] エクスポート機能（CSV/MD）
- [ ] 使い方ガイドの充実

### Phase 3: リリース
- [ ] 非エンジニアUT
- [ ] 価格決定 / BOOTH出品準備
- [ ] 販売ページ作成
