# GAS 開発環境セットアップ手順

このドキュメントは `glasp`（Google Apps Script CLI）を使って
GAS プロジェクトをデプロイするためのセットアップ手順です。

## 前提

- Node.js v20+
- Google アカウント
- GASプロジェクト（後述）

## 手順

### 1. Google Apps Script プロジェクトを作成

1. https://script.google.com にアクセス
2. 「新しいプロジェクト」を作成
3. プロジェクト名を「X Archive Tools」に変更
4. エディタの設定（歯車アイコン）→ 「Google Cloud Platform (GCP) プロジェクト」を表示
5. GCPプロジェクト番号をメモ

### 2. clasp をインストール

```bash
npm install -g @google/clasp
clasp login
```

### 3. スクリプトIDを設定

1. GASエディタのURLから スクリプトID を取得:
   `https://script.google.com/d/___SCRIPT_ID___/edit`
2. `.clasp.json` の `YOUR_SCRIPT_ID_HERE` を実際のIDに書き換え:

```json
{
  "scriptId": "1ABCDE...",
  "rootDir": "dist"
}
```

### 4. ビルドしてプッシュ

```bash
npm run build           # TypeScript → dist/（HTML/appsscript.json含む）
clasp push              # GASにプッシュ
```

### 5. GitHub Actions 用の Secrets を設定

リポジトリ → Settings → Secrets and variables → Actions で以下を設定:

| Secret | 値 | 取得方法 |
|:---|:---|:---|
| `CLASP_SCRIPT_ID` | スクリプトID | GASエディタのURLから |
| `CLASP_ACCESS_TOKEN` | OAuth2 access token | `clasp login --creds ...` |
| `CLASP_ID_TOKEN` | ID token | 同上 |

**注意:** clasp の CI/CD 連携にはサービスアカウントを使用するか、
`clasp login` で生成された `.clasprc.json` の内容をSecretに設定します。

詳細:
https://github.com/google/clasp#run-clasp-in-a-ci-environment

## デプロイフロー（完成後）

開発者がやること:
1. コードを編集
2. `git push origin main`

GitHub Actions が自動で:
1. `npm ci` → TypeScript コンパイル → HTML/HSP コピー
2. `clasp push` → GASにプッシュ
3. `clasp deploy` → バージョン作成（公開）

→ 人間が手作業で更新することはありません 🎉
