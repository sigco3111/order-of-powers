# 게임 데이터 (JSON)

`docs/CARDS.md`, `docs/CARDS_EXPANSION.md`, `docs/GAME_DESIGN.md`를 옮긴 데이터입니다. 효과 스키마는 [docs/ENGINE_DESIGN.md](../../docs/ENGINE_DESIGN.md) 6장을 따릅니다. 검증: `node tools/validate-data.js`

| 파일 | 내용 |
| --- | --- |
| `cards.json` | 카드 70종 (공용 시작 5, 시장 45, 세력 고유 8, 중립 2, 세력 시작 전용 10) |
| `events.json` | 이벤트 20종 |
| `strategic-assets.json` | 전략 자산 12종 |
| `secret-goals.json` | 비밀 목표 20종 (`check`는 판정용 설명자) |
| `growth-cards.json` | 성장 카드 10종 |
| `factions.json` | 원형 4개 — 좌석 id atlas·redDragon·polarStar·emerald = 외교형·산업형·군사형·성장형 (시작 덱 12장, 고유 카드) |
| `countries.json` | G20 국가 20개 (원형당 5개): 본거지 지역, 특성 1개, 소개, 강조색. 설명은 [docs/COUNTRIES.md](../../docs/COUNTRIES.md) |
| `regions.json` | 지역 8개 (이웃 관계 포함) |

## 해석 규칙 (스키마에 없는 부분)
- 한 카드 안의 `regionChoice`는 모두 **같은 지역 하나**를 가리킨다. 서로 다른 지역이 필요한 효과는 `custom`.
- `defense`의 `scope: region`은 그 카드에서 고른 지역(없으면 실행 시 선택)에 적용한다.
- 이벤트의 `gain`은 모든 세력에 적용한다. 조건이 필요한 것은 `conditional`.
- `modifier` 키는 초안이며 엔진 구현 때 확정한다 (`income.<res>`, `shop.costDelta`, `planSlots` 등).
- 공용 시작 카드의 `tutorialCount`는 튜토리얼용 공용 덱(10장)의 장수. 시작 카드의 `cost` 0은 구매 불가를 뜻한다.
