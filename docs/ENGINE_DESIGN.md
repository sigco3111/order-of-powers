# 규칙 엔진 설계 (v0.1)

> 목표: UI와 분리된 **순수 규칙 엔진**. 같은 시드와 같은 입력이면 항상 같은 결과가 나오게 해서, AI 시뮬레이션·테스트·일일 도전·온라인 대전의 기반으로 쓴다.

## 1. 원칙
- 엔진은 DOM, 시간, 난수 전역 함수를 쓰지 않는다. 모든 난수는 **시드 기반 RNG**를 상태에서 꺼내 쓴다.
- 상태는 JSON으로 직렬화되는 **순수 데이터**. 상태를 바꾸는 함수는 `reduce(state, action) → newState` 하나로 모은다.
- 카드·이벤트·지역은 `src/data/*.json`의 데이터이고, 효과는 **효과 객체 배열**로 표현한다 (코드 분기 최소화).
- 규칙 위반 입력은 상태를 바꾸지 않고 `{ok:false, reason}`을 돌려준다.

## 2. 폴더 구조 (예정)

| 경로 | 역할 |
| --- | --- |
| `src/data/` | 카드, 이벤트, 세력, 지역, 비밀 목표 등 JSON |
| `src/engine/` | 상태, 리듀서, 효과 실행, 점수 계산, RNG |
| `src/ai/` | AI 플레이어 (평가 함수, 난이도) |
| `src/ui/` | 화면 (엔진을 호출만 한다) |
| `tests/` | 엔진 테스트, AI 시뮬레이션 |
| `tools/` | 데이터 검증, 시뮬레이션 실행 스크립트 |

## 3. 게임 상태 (State)

```
state = {
  version, seed, rng,            // rng: 시드에서 이어지는 내부 상태
  config: { rounds: 6|8|10, aiLevel, mode },
  round, phase,                  // phase: event | plan | reveal | resolve | upkeep | shop | end
  turnOrder: [factionId...],     // 우선권 순서
  eventDeck, eventDiscard, currentEvent,
  market: { slots: [cardId...], deck: [cardId...] },
  regions: { [regionId]: { influence: {factionId: n}, bases: {factionId: n}, defense: {factionId: n}, scoreBonus } },
  treaties: [ [factionA, factionB] ],           // 이번 라운드 조약
  players: { [factionId]: {
    resources: { capital, energy, industry },
    prestige, hand, deck, discard, played, plan: [cardId...],
    growth: [cardId...], strategicAsset, usedAsset,
    secretGoals: [goalId...], stats: { cardsPlayed: {domestic, diplomatic, military}, influenceRemoved, influenceLost, treatiesMade, sanctionsReceived }
  } },
  log: [ {round, phase, actor, text} ]
}
```

## 4. 라운드 진행 (Phase)

| 단계 | 내용 | 입력(Action) |
| --- | --- | --- |
| event | 이벤트 카드 1장 공개, 이벤트 효과 적용 | (자동) |
| plan | 손패에서 계획 슬롯만큼 카드를 비공개로 선택 | `PLAN {faction, cards}` |
| reveal | 모두 동시에 공개, 우선권 순서 결정 | (자동) |
| resolve | 우선권 순서로 카드 효과를 하나씩 실행 (대상 선택 필요 시 입력) | `CHOOSE {faction, target}` |
| upkeep | 자원 수입, 지역 점수 정산, 위신 정산 | (자동) |
| shop | 상점 카드 구매, 성장 카드 구매, 손패 정리·다시 뽑기 | `BUY {faction, cardId}` / `END_SHOP` |
| end | 마지막 라운드면 비밀 목표 공개와 최종 점수 계산 | (자동) |

## 5. 액션 (Action)

| 액션 | 설명 |
| --- | --- |
| `NEW_GAME {config, factions, seed}` | 새 게임 시작, 덱 섞기, 손패 배분, 비밀 목표와 전략 자산 배분 |
| `PICK_ASSET {faction, assetId}` | 전략 자산 2장 중 1장 선택 |
| `PLAN {faction, cards}` | 계획 슬롯에 카드 배치 |
| `CHOOSE {faction, choice}` | 효과의 대상(지역·세력·카드) 선택 |
| `USE_ASSET {faction, target?}` | 전략 자산 사용 |
| `BUY {faction, cardId}` | 상점 카드 구매 |
| `END_SHOP {faction}` | 상점 단계 종료 |

모든 액션은 `legalActions(state, faction)`으로 합법 수를 열거할 수 있어야 한다 (AI와 UI 하이라이트에 공용).

## 6. 효과 스키마 (Effect)

카드·이벤트·전략 자산·성장 카드의 `effects` 배열에 쓰는 객체. 한 카드는 여러 효과를 순서대로 실행한다.

| type | 필드 | 의미 |
| --- | --- | --- |
| `gain` | `res: capital｜energy｜industry｜prestige`, `amount` | 자원·위신 증가 (음수면 감소) |
| `influence` | `amount`, `target: regionChoice`, `filter: any｜owned` | 선택한 지역에 내 영향력 추가 (`owned`는 이미 내 영향력이 있는 지역만) |
| `removeInfluence` | `amount`, `target: regionChoice`, `from: other｜leader` | 다른 세력(또는 최다 세력)의 영향력 제거 |
| `defense` | `amount`, `scope: region｜allOwned` | 이번 라운드 방어 |
| `base` | `amount` | 지역에 기지 설치 (영향력 +1, 방어 +1) |
| `destroyBase` | `target: factionChoice` | 상대 기지 파괴 |
| `draw` | `amount` | 카드 뽑기 |
| `discard` | `amount`, `who: self｜target` | 버리기 |
| `treaty` | `count` | 조약 체결 |
| `peek` | `what: hand｜eventDeck`, `amount` | 정보 확인 |
| `drain` | `res`, `amount`, `target: factionChoice` | 상대 자원 감소 |
| `modifier` | `scope: round｜game`, `key`, `value` | 라운드/게임 동안 규칙 수정 (예: 상점 비용 +1) |
| `conditional` | `if: {...}`, `then: [effects]` | 조건부 효과 |
| `custom` | `id`, `note` | 위 형식으로 표현하기 어려운 효과 (코드로 직접 구현) |

`target: regionChoice`는 실행 시점에 플레이어(또는 AI)가 고르는 값이다.

## 7. 점수 계산

- 지역 정산: 지역마다 영향력이 가장 큰 세력이 **주도**하며 지역 점수(scoreValue + scoreBonus)를 받는다. 동률이면 조약 세력끼리 공유, 아니면 아무도 받지 못한다.
- 위신: 그대로 점수.
- 마지막 라운드 후: 비밀 목표 점수, 기지·조약 보너스를 더해 최종 점수.

## 8. AI 인터페이스

```
chooseAction(state, faction, level, rngSeed) → action
```
- `legalActions`를 열거하고, 평가 함수 `score(state, faction)`로 후보를 점수화한다.
- 평가 항목: 지역 주도 수, 영향력 차이, 자원 가치, 위신, 위협도(상대의 방어·제거 가능성), 비밀 목표 진행도.
- 난이도: 쉬움 = 가중치 단순 + 무작위성 큼, 보통 = 한 수 앞, 어려움 = 두 수 앞과 상대 손패 추정.
- 모든 선택은 시드 기반이라 재현 가능하다.

## 9. 테스트 계획

- 단위 테스트: 효과 하나하나(영향력, 방어, 기지, 조약)와 점수 계산.
- 속성 테스트: 어떤 행동 순서에서도 자원이 음수로 내려가거나 영향력 칸이 6을 넘지 않는다.
- 시뮬레이션: AI 4명으로 수천 판을 돌려 세력별 승률, 평균 점수, 라운드 수(6/8/10)별 차이를 기록한다.
- 데이터 검증: 카드 ID 중복, 존재하지 않는 ID 참조, 필수 필드 누락을 `tools/validate-data.js`로 확인한다.

## 10. 구현 순서 (M1)

1. RNG와 상태 생성, 데이터 로딩, 검증 스크립트
2. 효과 실행기 (gain → influence → defense → base → 나머지)
3. 라운드 단계 진행과 점수 계산
4. `legalActions`와 콘솔 시뮬레이터 (사람 없이 AI끼리 한 판)
5. AI 평가 함수와 난이도, 승률 리포트
