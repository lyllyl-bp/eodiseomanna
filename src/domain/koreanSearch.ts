const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

export function getKoreanInitials(value: string) {
  return [...value].map((character) => {
    const code = character.charCodeAt(0);
    if (code < HANGUL_START || code > HANGUL_END) return character;
    return INITIALS[Math.floor((code - HANGUL_START) / 588)];
  }).join('');
}

export function matchesStationSearch(stationName: string, query: string) {
  const normalized = query.trim().replace(/역$/, '').replaceAll(' ', '');
  if (!normalized) return true;
  const name = stationName.replaceAll(' ', '');
  const nameCharacters = [...name];
  const queryCharacters = [...normalized];

  return nameCharacters.some((_, start) => queryCharacters.every((character, offset) => {
    const target = nameCharacters[start + offset];
    if (!target) return false;
    return INITIALS.includes(character)
      ? getKoreanInitials(target) === character
      : target === character;
  }));
}
