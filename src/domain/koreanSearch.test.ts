import { describe, expect, test } from 'bun:test';
import { getKoreanInitials, matchesStationSearch } from './koreanSearch';

describe('Korean station search', () => {
  test('extracts Hangul initials', () => {
    expect(getKoreanInitials('홍대입구')).toBe('ㅎㄷㅇㄱ');
    expect(getKoreanInitials('인천시청')).toBe('ㅇㅊㅅㅊ');
  });

  test('matches both station names and initial consonants', () => {
    expect(matchesStationSearch('김포공항', '김포')).toBe(true);
    expect(matchesStationSearch('김포공항', 'ㄱㅍㄱㅎ')).toBe(true);
    expect(matchesStationSearch('홍대입구', 'ㅅㄷ')).toBe(false);
  });

  test('matches mixed syllables and initial consonants', () => {
    expect(matchesStationSearch('춘천', '춘ㅊ')).toBe(true);
    expect(matchesStationSearch('남춘천', '춘ㅊ')).toBe(true);
    expect(matchesStationSearch('홍대입구', '홍ㄷㅇ구')).toBe(true);
  });
});
