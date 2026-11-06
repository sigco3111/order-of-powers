# 규칙 결정 사항 (M1a)

엔진 구현 전에 확정한 규칙. 이후 마일스톤은 이 문서를 기준으로 한다.

- **세력**: 4개 고정. 손패 5장, 계획 슬롯 3개 (성장 카드로 증가 가능).
- **시작 자원**: 💰 4, 🛢 2, 🏭 2, ⭐ 0. 구매 비용은 **자본으로만** 지불한다.
- **수입(정비 단계)**: 💰 +2, 그리고 주도하는 지역마다 그 지역 산출 자원 +1.
- **영향력**: 세력당 한 지역 최대 6. 지역 전체 토큰 수는 제한 없음 (세력별 6 이하).
- **지역 주도**: 영향력 최다 세력. 동률은 서로 모두 조약 상대일 때만 공동 주도(각자 전액), 아니면 아무도 없음. 영향력 0은 주도 불가.
- **지역 점수**: 주도 세력이 `scoreValue(+scoreBonus)`를 **매 라운드** 누적 점수에 더한다.
- **최종 점수**: 누적 지역 점수 + 위신 + 비밀 목표 점수. 동점은 위신 → 자본 순.
- **해결 순서**: 라운드마다 회전. 시작 인덱스 = (round−1) mod 4.
- **이벤트**: 라운드마다 1장. 게임 시작 때 라운드 수 크기의 이벤트 덱을 만든다 (일반 이벤트 무작위 + 이벤트 20은 항상 `rounds−1` 라운드에만).
- **시작 덱**: `factions.json`의 startingDeck 12장. 튜토리얼이면 공용 시작 덱 10장(`tutorialCount`).
- **드로우**: 계획 단계 시작에 손패 한도까지 뽑는다 (생성 시점엔 뽑지 않음). 덱이 비면 버린 더미를 섞어 보충.
- **시장**: 공개 6칸, 시장 카드 45장을 섞은 덱에서 보충. 세력 고유 카드 8장과 중립 카드 2장은 공용 시장에 넣지 않는다.
- **첫 구매 슬롯**: 세력마다 고유 카드 2장이 개인 슬롯에 있고 그 세력만 구매할 수 있다. 구매 시 버린 더미로 가며 시장은 보충하지 않는다.
- **구매**: 구매 카드는 구매자의 버린 더미로. 성장 카드(10종, 세력당 1회)는 `growth`에 두고 덱에 넣지 않으며 수정치를 즉시 적용.
- **비용 수정치**: `shop.costDelta` 합산, 첫 구매는 `shop.firstPurchaseDiscount` 추가 할인, 최소 비용 1. `shop.extraSlots`는 시장 칸 수 증가.
- **전략 자산**: 세력마다 2장을 받아 1장 선택. **비밀 목표**: 세력마다 2장.

## 효과 실행기 (M1b)
- **수정치 키**: `income.<capital|energy|industry|prestige>`, `shop.costDelta/extraSlots/firstPurchaseDiscount/minCost`, `planSlots`, `handSize`, `nextRound.<key>`(다음 라운드로 승계), `influenceLossReduction.all|self`, `negateTargetedEffect`, `ignoreEventEffectInRegion`(+`PerRound`), `domesticCapitalBonus`, `militaryEffectHalfRoundUp`, `treatiesVoid`, `baseDefenseBonus`, `firstDiplomaticInfluenceBonus`, `firstTreatyFree`(조약 비용이 없어 저장만), `revealPlanCard`. 불리언은 1로 저장. 읽기는 `getMod`/`getModifier`(세력 영구 + 세력 라운드 + 게임 + 전역 라운드 합).
- **저장 위치**: 이벤트와 `.all` 키는 `state.modifiers.round/game`, 카드의 `round`는 `players[f].roundModifiers`, `game`은 `players[f].modifiers`. `clearRoundEffects`가 방어·라운드 수정치·조약·`peeked`를 비우고 `nextRound.*`를 승계.
- **방어**: 방어 1점이 영향력 −1을 막고 소모된다. 감소 수정치 → 방어 흡수 → 제거 순. `evt-18`의 "방어 없음"은 세력별(그 세력 방어 0).
- **제거 대상**: `other`는 상대가 둘 이상이면 대상 세력 선택. `leader`·`evt-06`은 최다 동률 전원. `mil-12`의 −1은 대상 세력의 기지가 있을 때.
- **대기 선택 `state.pending[]`**: `{id, faction(선택자), kind, effect, options, filter, actor, stage, rest, ctx}`. `kind`별 선택값: `region`=지역 id, `faction`=세력 id, `card`=카드 id, `regionPair`=서로 다른 지역 id 2개 배열, `confirm`=true/false(`payOptional`). 선택지가 하나뿐이면 대기 없이 진행. `rest`는 남은 효과 대기열.
- **이벤트 조건**: 시작 시점 스냅샷으로 세력별 판정, 동률은 모두 해당. `playedCategoryThisRound`·`cardsPlayedThisRoundRank` 이벤트는 해결 단계 뒤에 적용해야 하므로 `isDeferredEvent`로 구분.
