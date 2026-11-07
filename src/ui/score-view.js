// 보드의 점수 표시: 결과 화면 합계와 같은 계산(finalScores)을 쓴다. DOM 없음 (node 테스트 가능).
// 게임 중에는 비밀 목표가 공개 전이라 지역 + 위신만 합치고(settled=false), 종료 뒤에는 엔진 최종 점수를 그대로 쓴다.
import { finalScores } from '../engine/score.js';

/** { regions, prestige, goal(종료 전 null), total, settled, text } */
export function scoreLine(state, faction, data) {
  const p = state.players[faction];
  if (state.phase === 'end') {
    const sc = (state.result?.scores ?? finalScores(state, data).scores)[faction];
    return { regions: sc.regions, prestige: sc.prestige, goal: sc.goalPoints, total: sc.total, settled: true, text: `지역 ${sc.regions} · 위신 ${sc.prestige} · 비밀 목표 ${sc.goalPoints} · 합계 ${sc.total}` };
  }
  const total = p.regionScore + p.prestige;
  return { regions: p.regionScore, prestige: p.prestige, goal: null, total, settled: false, text: `지역 ${p.regionScore} · 위신 ${p.prestige} · 합계 ${total}` };
}
