# DESIGN.md — GAS Tweet Archive

## プロジェクト概要

X(Twitter) のデータアーカイブ（tweet.js / bookmark.js）を Google スプレッドシートにインポートし、ダッシュボードで可視化・分析する Google Apps Script プロジェクト。

## 技術スタック

| 項目 | 採用技術 |
|:---|:---|
| 言語 | TypeScript |
| 実行環境 | Google Apps Script (GAS) |
| テスト | Jest + ts-jest |
| デプロイ | Glasp (Google Apps Script CLI) |
| ドキュメント | GitHub Pages |

## アーキテクチャ

```
User's PC                    Google Cloud                   User's Browser
┌─────────┐    tweet.js     ┌──────────────────┐           ┌───────────┐
│ X Archive│ ──────────────>│ Google Sheets    │           │ Dashboard │
│ (zip)    │   HTML Dialog  │  ├─ 📊 DASHBOARD │<──────────│ (Graphs)  │
└─────────┘                 │  ├─ 📋 TWEETS    │           └───────────┘
                            │  ├─ 🔖 BOOKMARKS │
                            │  ├─ 🔲 _CACHE    │
                            │  └─ ⚙️ SETTINGS  │
                            │                  │
                            │ Google Apps Script│
                            │  ├─ onOpen()     │
                            │  ├─ import.ts   │
                            │  └─ dashboard.ts│
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
- 時間帯ヒートマップ（条件付き書式）
- よく絡んだ人 Top3（横棒グラフ）

### 📋 TWEETS（生データ）
- 11列のテーブル: 日付, 時刻, 本文, 種別, いいね, RT, リプ, 媒体, URL, 画像有無, 週番号
- **関数ゼロ**（生DB）でパフォーマンス確保
- フィルタビューで検索・ソート対応

### 🔖 BOOKMARKS（ブックマーク）
- 9列: 保存日, 著者, 内容, ♡, URL, カテゴリ, 重要度, ステータス, メモ
- カテゴリ・重要度・ステータスはプルダウン（データバリデーション）

### 🔲 _CACHE（キャッシュ：非表示）
- プリコンピュート方式: GASがインポート時に一括計算
- DASHBOARDは_CACHEの値をSUM参照するだけ

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
│ GAS: import.ts    │ → JSON.parse() してバッチ分割
│ processFile()     │ → writeToSheet() でシートに書き込み
└──────┬───────────┘        └→ toast() でプログレス表示
       ▼
┌──────────────────┐
│ GAS: dashboard.ts │ → TWEETSからデータ読み込み
│ refreshDashboard()│ → computeCache() で集計
└──────┬───────────┘   → _CACHEに書き込み
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
│   │   ├── main.ts           # GASエントリポイント / メニュー処理
│   │   ├── import.ts         # tweet.js/bookmark.js パース
│   │   └── dashboard.ts      # キャッシュ計算・集計ロジック
│   ├── pages/                 # GAS HTML Service 用テンプレート
│   │   ├── dialog.html       # アップロードダイアログ
│   │   └── guide.html        # 使い方ガイドサイドバー
│   └── types/
│       └── index.ts          # 型定義
├── tests/
│   ├── import.test.ts        # 自動テスト
│   └── human-test-cases.md   # 手動テストケース一覧
├── docs/
│   ├── index.html            # GitHub Pages トップページ
│   ├── DESIGN.md             # 本設計書
│   └── SETUP.md              # セットアップ手順（開発者向け）
├── dist/                     # コンパイル済みGASコード
├── .clasp.json               # Glasp 設定ファイル
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

### Phase 1: 基盤構築（現在地）
- [x] プロジェクト構成（package.json / tsconfig / jest）
- [x] 型定義
- [ ] GAS メニュー実装
- [ ] HTML ダイアログ実装
- [ ] インポート処理実装
- [ ] ダッシュボード集計実装
- [ ] テスト実装
- [ ] GitHub Pages 公開

### Phase 2: 機能充実
- [ ] glasp デプロイパイプライン構築
- [ ] カスタムカテゴリ編集UI
- [ ] エクスポート機能（CSV/MD）
- [ ] 使い方ガイドの充実

### Phase 3: リリース
- [ ] 非エンジニアUT
- [ ] 価格決定 / BOOTH出品準備
- [ ] 販売ページ作成
