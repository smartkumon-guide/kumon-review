export function sceneMemoKey(page, state) {
  const key = page + '--' + state.toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(key)) throw new Error('화면 정보를 확인할 수 없습니다.');
  return key;
}
