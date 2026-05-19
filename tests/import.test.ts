/**
 * import.ts のユニットテスト
 */

import { parseTweetArchive, parseBookmarkArchive, chunkArray } from '../src/gas/import';
import { TweetRow, TweetType } from '../src/types';

describe('parseTweetArchive', () => {
  it('tweet.jsのJSON配列を正しくパースする', () => {
    const mockTweets = JSON.stringify([
      {
        id_str: '123',
        created_at: 'Wed Mar 15 14:23:05 +0000 2023',
        full_text: 'これはテストツイートです',
        favorite_count: 42,
        retweet_count: 7,
        reply_count: 2,
        source: '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>',
        in_reply_to_screen_name: undefined,
        is_quote_status: false,
      },
    ]);

    const result: TweetRow[] = parseTweetArchive(mockTweets);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2023-03-15');
    expect(result[0].time).toBe('14:23');
    expect(result[0].text).toBe('これはテストツイートです');
    expect(result[0].likes).toBe(42);
    expect(result[0].retweets).toBe(7);
    expect(result[0].type).toBe('Original' as TweetType);
  });

  it('空の配列を正しく処理する', () => {
    const result = parseTweetArchive('[]');
    expect(result).toHaveLength(0);
  });

  it('Replyツイートを正しく分類する', () => {
    const mockTweets = JSON.stringify([
      {
        id_str: '456',
        created_at: 'Wed Mar 15 14:23:05 +0000 2023',
        full_text: '@user 返信です',
        favorite_count: 0,
        retweet_count: 0,
        reply_count: 0,
        source: '<a href="http://twitter.com" rel="nofollow">Twitter Web</a>',
        in_reply_to_screen_name: 'user',
        is_quote_status: false,
      },
    ]);

    const result = parseTweetArchive(mockTweets);
    expect(result[0].type).toBe('Reply');
  });
});

describe('parseBookmarkArchive', () => {
  it('bookmark.jsのJSON配列を正しくパースする', () => {
    const mockBookmarks = JSON.stringify([
      {
        id_str: '789',
        created_at: '2023-06-01T10:30:00.000Z',
        full_text: '保存したツイート',
        user: { screen_name: 'testuser', name: 'Test User' },
        favorite_count: 100,
        retweet_count: 20,
      },
    ]);

    const result = parseBookmarkArchive(mockBookmarks);

    expect(result).toHaveLength(1);
    expect(result[0].date).toContain('2023');
    expect(result[0].type).toBe('Original');
  });
});

describe('chunkArray', () => {
  it('配列を指定サイズで分割する', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    const chunks = chunkArray(arr, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([1, 2, 3]);
    expect(chunks[1]).toEqual([4, 5, 6]);
    expect(chunks[2]).toEqual([7]);
  });

  it('空配列を正しく処理する', () => {
    expect(chunkArray([], 5)).toHaveLength(0);
  });
});
