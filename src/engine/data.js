// 기본 데이터 등록부. 엔진은 IO를 하지 않으므로 호출자가 한 번 등록하거나 매 호출에 data를 넘긴다.
let current = null;
export const setData = (data) => { current = data; return data; };
export const getData = () => {
  if (!current) throw new Error('게임 데이터가 등록되지 않음: createGame 또는 setData를 먼저 호출');
  return current;
};
