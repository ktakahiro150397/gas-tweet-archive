/**
 * import.ts のユニットテスト
 */

import {
  parseTweetJs,
  parseBookmarkJs,
  importTweets,
  importBookmarks,
  extractJson,
  parseTimestamp,
  extractSourceName,
  chunkArray,
} from '../src/gas/import';

// ─── extractJson ────────────────────────────────────────────────

describe('extractJson()', () => {
  it('生JSONはそのまま返す', () => {
    const input = '[{"id": 1}]';
    expect(extractJson(input)).toBe(input);
  });

  it('window.YTD.part0 プレフィックスを除去する', () => {
    const input = 'window.YTD.tweet.part0 = [{"id": 1}]';
    expect(extractJson(input)).toBe('[{"id": 1}]');
  });

  it('末尾のセミコロンを除去する', () => {
    const input = 'window.YTD.tweet.part0 = [{"id": 1}];';
    expect(extractJson(input)).toBe('[{"id": 1}]');
  });

  it('bookmark.js のプレフィックスも除去する', () => {
    const input = 'window.YTD.bookmark.part0 = [{"id": 1}]';
    expect(extractJson(input)).toBe('[{"id": 1}]');
  });

  it('空文字列は空文字列を返す', () => {
    expect(extractJson('')).toBe('');
  });
});

// ─── parseTimestamp ──────────────────────────────────────────────

describe('parseTimestamp()', () => {
  it('X標準フォーマットをパースする', () => {
    const result = parseTimestamp('Wed Mar 15 14:23:05 +0000 2023');
    expect(result.dateStr).toBe('2023-03-15');
    expect(result.timeStr).toBe('14:23');
  });

  it('ISO 8601 フォーマットをパースする', () => {
    const result = parseTimestamp('2023-06-01T10:30:00.000Z');
    expect(result.dateStr).toBe('2023-06-01');
    expect(result.timeStr).toMatch(/^\d{2}:\d{2}$/);
  });

  it('空文字列は空を返す', () => {
    const result = parseTimestamp('');
    expect(result.dateStr).toBe('');
    expect(result.timeStr).toBe('');
  });

  it('不正な日付は空を返す', () => {
    const result = parseTimestamp('not-a-date');
    expect(result.dateStr).toBe('');
    expect(result.timeStr).toBe('');
  });
});

// ─── extractSourceName ──────────────────────────────────────────

describe('extractSourceName()', () => {
  it('HTMLタグからアプリ名を抽出する', () => {
    const input = '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>';
    expect(extractSourceName(input)).toBe('Twitter for iPhone');
  });

  it('タグがない場合はそのまま返す', () => {
    expect(extractSourceName('')).toBe('Unknown');
  });
});

// ─── parseTweetJs ───────────────────────────────────────────────

describe('parseTweetJs()', () => {
  const mockTweet = {
    id_str: '123',
    created_at: 'Wed Mar 15 14:23:05 +0000 2023',
    full_text: 'これはテストツイートです',
    favorite_count: 42,
    retweet_count: 7,
    reply_count: 2,
    source: '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>',
    is_quote_status: false,
  };

  it('正常なツイート配列をパースする', () => {
    const result = parseTweetJs(JSON.stringify([mockTweet]));
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('2023-03-15');  // date
    expect(result[0][1]).toBe('14:23');         // time
    expect(result[0][2]).toBe('これはテストツイートです'); // text
    expect(result[0][3]).toBe('Original');       // type
    expect(result[0][4]).toBe('42');            // likes
  });

  it('空配列を正しく処理する', () => {
    expect(parseTweetJs('[]')).toHaveLength(0);
  });

  it('Replyツイートを正しく分類する', () => {
    const replyTweet = { ...mockTweet, in_reply_to_screen_name: 'user', id_str: '456' };
    const result = parseTweetJs(JSON.stringify([replyTweet]));
    expect(result[0][3]).toBe('Reply');
  });

  it('Retweetを正しく分類する（RT @ プレフィックス）', () => {
    const rtTweet = { ...mockTweet, full_text: 'RT @user これはRTです', id_str: '789' };
    const result = parseTweetJs(JSON.stringify([rtTweet]));
    expect(result[0][3]).toBe('Retweet');
  });

  it('Quoteを正しく分類する', () => {
    const quoteTweet = { ...mockTweet, is_quote_status: true, id_str: '012' };
    const result = parseTweetJs(JSON.stringify([quoteTweet]));
    expect(result[0][3]).toBe('Quote');
  });

  it('画像ありツイートのhasImageがTRUEになる', () => {
    const tweetWithMedia = {
      ...mockTweet,
      id_str: '345',
      entities: { media: [{ type: 'photo' }] },
    };
    const result = parseTweetJs(JSON.stringify([tweetWithMedia]));
    expect(result[0][9]).toBe('TRUE');
  });

  it('画像なしツイートのhasImageがFALSEになる', () => {
    const result = parseTweetJs(JSON.stringify([mockTweet]));
    expect(result[0][9]).toBe('FALSE');
  });

  it('window.YTD.part0 ラップを処理する', () => {
    const wrapped = `window.YTD.tweet.part0 = ${JSON.stringify([mockTweet])}`;
    const result = parseTweetJs(wrapped);
    expect(result).toHaveLength(1);
    expect(result[0][2]).toBe('これはテストツイートです');
  });

  it('ネスト構造 { tweet: {...} } を処理する', () => {
    const nested = JSON.stringify([{ tweet: mockTweet }]);
    const result = parseTweetJs(nested);
    expect(result).toHaveLength(1);
    expect(result[0][2]).toBe('これはテストツイートです');
  });
});

// ─── parseBookmarkJs ────────────────────────────────────────────

describe('parseBookmarkJs()', () => {
  const mockBookmark = {
    id_str: '789',
    created_at: '2023-06-01T10:30:00.000Z',
    full_text: '保存したツイートです',
    user: { screen_name: 'testuser', name: 'Test User' },
    favorite_count: 100,
    retweet_count: 20,
  };

  it('正常なブックマーク配列をパースする', () => {
    const result = parseBookmarkJs(JSON.stringify([mockBookmark]));
    expect(result).toHaveLength(1);
    expect(result[0][0]).toContain('2023');  // date
    expect(result[0][1]).toBe('@testuser');  // author
    expect(result[0][2]).toBe('保存したツイートです'); // text
    expect(result[0][3]).toBe('100');         // likes
    expect(result[0][7]).toBe('未整理');       // initial status
  });

  it('空配列を正しく処理する', () => {
    expect(parseBookmarkJs('[]')).toHaveLength(0);
  });

  it('ネスト構造 { bookmark: {...} } を処理する', () => {
    const nested = JSON.stringify([{ bookmark: mockBookmark }]);
    const result = parseBookmarkJs(nested);
    expect(result).toHaveLength(1);
    expect(result[0][1]).toBe('@testuser');
  });

  it('user情報がない場合もエラーにならない', () => {
    const noUser = { ...mockBookmark, user: undefined, screen_name: '' };
    const result = parseBookmarkJs(JSON.stringify([noUser]));
    expect(result).toHaveLength(1);
    expect(result[0][1]).toBe('');
  });
});

// ─── importTweets ─────────────────────────────────────────────

describe('importTweets()', () => {
  const mockTweet = {
    id_str: '123',
    created_at: 'Wed Mar 15 14:23:05 +0000 2023',
    full_text: 'これはテストツイートです',
    favorite_count: 42,
    retweet_count: 7,
    reply_count: 2,
    source: '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>',
    is_quote_status: false,
  };

  it('parseTweetJs() のラッパーとして動作する', () => {
    const result = importTweets(JSON.stringify([mockTweet]));
    expect(result).toHaveLength(1);
    expect(result[0][2]).toBe('これはテストツイートです');
    expect(result[0][3]).toBe('Original');
  });

  it('window.YTD.part0 ラップを処理する', () => {
    const wrapped = `window.YTD.tweet.part0 = ${JSON.stringify([mockTweet])}`;
    const result = importTweets(wrapped);
    expect(result).toHaveLength(1);
    expect(result[0][2]).toBe('これはテストツイートです');
  });
});

// ─── importBookmarks ───────────────────────────────────────────

describe('importBookmarks()', () => {
  const mockBookmark = {
    id_str: '789',
    created_at: '2023-06-01T10:30:00.000Z',
    full_text: '保存したツイートです',
    user: { screen_name: 'testuser', name: 'Test User' },
    favorite_count: 100,
    retweet_count: 20,
  };

  it('parseBookmarkJs() のラッパーとして動作する', () => {
    const result = importBookmarks(JSON.stringify([mockBookmark]));
    expect(result).toHaveLength(1);
    expect(result[0][2]).toBe('保存したツイートです');
    expect(result[0][1]).toBe('@testuser');
  });

  it('ネスト構造 { bookmark: {...} } を処理する', () => {
    const nested = JSON.stringify([{ bookmark: mockBookmark }]);
    const result = importBookmarks(nested);
    expect(result).toHaveLength(1);
    expect(result[0][1]).toBe('@testuser');
  });
});

// ─── chunkArray ─────────────────────────────────────────────────

describe('chunkArray()', () => {
  it('配列を指定サイズで分割する', () => {
    const result = chunkArray([1, 2, 3, 4, 5, 6, 7], 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual([1, 2, 3]);
    expect(result[1]).toEqual([4, 5, 6]);
    expect(result[2]).toEqual([7]);
  });

  it('サイズより小さい配列は1チャンクになる', () => {
    expect(chunkArray([1, 2], 5)).toHaveLength(1);
  });

  it('空配列は0チャンクを返す', () => {
    expect(chunkArray([], 5)).toHaveLength(0);
  });

  it('chunk size 1 は全要素を個別チャンクにする', () => {
    const result = chunkArray(['a', 'b', 'c'], 1);
    expect(result).toHaveLength(3);
  });
});
