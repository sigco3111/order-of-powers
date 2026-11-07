# 🏛 Order of Powers — 권력의 질서

현대 지정학 보드게임에서 영감을 받은, 실제 G20 국가로 겨루는 **독자 창작 웹 전략 보드게임**. 4라운드 튜토리얼부터 10라운드 본 게임까지.

**▶ 라이브: https://sigco3111.github.io/order-of-powers/**

현재 상태: **F1 완료: 마무리 점검** (계획 때 미리 고른 지역·대상을 저장에 포함, 지역 두 곳·대상 세력 카드도 계획 단계에서 선택, 접근성 점검, 결과는 [docs/QA_F1.md](docs/QA_F1.md)).

## 특징
- G20 국가 20개 중 하나를 골라 플레이 (실제 국가 특성 반영)
- 6 / 8 / 10 라운드 선택
- 컴퓨터 상대 난이도: 쉬움 / 보통 / 어려움
- 4라운드 튜토리얼과 게임 중 열 수 있는 규칙서
- 효과음과 배경음악
- 자동 저장·이어하기, 전적 기록, 업적
- 설정: 고대비, 글자 크기, 움직임 줄이기, 소리 조절
- 모바일 화면(390px)에서도 플레이 가능

## 실행과 테스트
```bash
python3 -m http.server 8000      # 저장소 루트에서 실행 후 http://localhost:8000/ 접속 (정적 파일만 사용, 빌드 없음)
node --test                      # 엔진·AI·UI 모델 테스트 (Node 18+)
node tools/validate-data.js      # 게임 데이터 검증
node tools/simulate.js --games 200 --rounds 8 --levels hard,hard,hard,hard --seed 1   # AI끼리 시뮬레이션 (밸런스 점검)
```

## 소리 출처
소리와 그림은 모두 CC0(퍼블릭 도메인)입니다. 효과음: [Kenney](https://kenney.nl)(Casino Audio, UI Audio, Interface Sounds, RPG Audio), OpenGameArt의 Snabisch(Win sound effect)·Felis Chaus(Game Over - Bad chest SFX). 배경음악: OpenGameArt의 mishonis(Meadow Thoughts)·Pro Sensory(Contemplation). 게임 안 설정 화면의 크레딧과 같습니다. 전체 목록은 [docs/ASSETS.md](docs/ASSETS.md).

## 독자 창작물 안내
이 작품은 영감을 준 보드게임과 **관련이 없는 독립적인 창작물**입니다. 규칙, 그림, 문구는 모두 직접 만들었고 해당 게임의 회사·제작자와 제휴하거나 승인받은 바 없습니다.

## 소개
Order of Powers는 G20 국가 20개 중 하나를 골라 8라운드(6·8·10 선택) 동안 내정·외교·군사 카드를 모으고, 세계 8개 지역의 영향력을 겨루는 **웹 전략 보드게임**입니다. 덱 빌딩과 지역 장악을 한 판 15~40분 (라운드 수 6·8·10 선택, 기본 8라운드 약 28분)에 즐기도록 설계하고 있으며, 모바일 세로 화면에서도 할 수 있는 카드 중심 UI를 목표로 합니다.

현재 상태: **M4 완료: 어려움 AI와 판 길이** (선택 감점·상점 구매 문턱 조정, 어려움 종반·견제 보정, 결과는 [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md) 'M4'). 직전 **Q2 완료: 조작과 모바일 정리** (카드 한 번 누르기·지역 칩 격자·점수 합계 표시·지도 라벨·AI 연출 단축·지역 미정 시 확정 차단, 결과는 [docs/QA_Q2.md](docs/QA_Q2.md)). 직전 **Q1 완료: 실플레이 점검** (라이브 8라운드 완주·구매 안내 조사 수정, 결과는 [docs/QA_Q1.md](docs/QA_Q1.md)). 직전 **M3 완료: 라운드별 균형** (6·8·10라운드별 보정표 `src/data/round-modes.json`, 결과는 [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md) 'M3'). 직전 **M2 완료: AI와 밸런스** (구매 다양화·어려움 AI 강화·비밀 목표 달성 가능화, 결과는 [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md) 'M2'; 남은 문제도 거기에 적음). 직전 **S2b 완료: 규칙서** (전체 화면 규칙서 — 표지·편성·보드 머리띠·결과 화면에서 열기, 코드는 src/ui/rules.js·rules.css, 문서는 [docs/RULES.md](docs/RULES.md); 오디오 mp3 대체 형식, 저장 삭제 뒤 재저장 방지, 계획 칸 '지역 선택 필요' 표시 수정, 자세한 내용은 [docs/s2b_status.md](docs/s2b_status.md)). 직전 S2a 완료: 튜토리얼 (표지의 '튜토리얼' 버튼 — 고정 시드 4라운드 연습판 위에 14단계 코치 마크, 코드는 src/ui/tutorial.js·tutorial.css, 진행은 oop-tutorial-v1에 저장돼 새로고침해도 이어짐, 수료 업적 '튜토리얼 수료'). 직전 **S1 완료: 소리와 설정** (효과음·음악·설정 화면·크레딧, [docs/ASSETS.md](docs/ASSETS.md)). 직전 M1f: 점수 쏠림·영향력 소멸 밸런스 (결과는 [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md) 7장, 진단은 `node tools/diagnose.js`). 직전 U3b 완료: 상점과 결과 화면 (상점 구매 화면·최종 보고서·기록/업적·모바일 접이식 독, 자세한 내용은 [docs/u3b_status.md](docs/u3b_status.md)). 직전 U3a: 카드 플레이 화면 (손패 트레이·계획 슬롯·카드 상세·전략 자산·선택 패널·공개/해결 연출·이벤트 카드·정산 시트·첫 판 안내). 직전 T1: G20 국가 선택 (국가 20개를 네 유형 — 외교형·산업형·군사형·성장형 — 으로 나눠 고르는 편성 화면, 국가별 특성 1개, 목록은 [docs/COUNTRIES.md](docs/COUNTRIES.md)). 직전 U2: 보드 화면 (지도·세력 패널·라운드 진행·AI 루프·저장/이어하기; 손패/상점 화면은 U3) — 라이브: https://sigco3111.github.io/order-of-powers/ (아트 디렉션은 [docs/UI_DIRECTION.md](docs/UI_DIRECTION.md)). 직전 단계 M1e-1: 데이터 밸런스 1차 (결과는 [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md)). M1d까지 구현: RNG·상태 생성·점수·시장·효과 실행·단계 리듀서·`legalActions`·`autoPlay`·`src/ai/ai.js`(쉬움/보통/어려움)·`node tools/simulate.js`, `node --test`. 기획서와 CC0 에셋, 규칙 결정은 [docs/RULES_DECISIONS.md](docs/RULES_DECISIONS.md).

- 🖥 [UI 아트 디렉션 (docs/UI_DIRECTION.md)](docs/UI_DIRECTION.md) · 앱 진입점 `index.html` → `src/ui/app.js` (브라우저 데이터 로더: `src/engine/browser-data.js`) · 라이브: https://sigco3111.github.io/order-of-powers/
- 🌐 [G20 국가 20개와 유형·특성 (docs/COUNTRIES.md)](docs/COUNTRIES.md) · 스크린샷: [편성](docs/screens/t1-setup-desktop.png) · [보드](docs/screens/t1-board.png) · [모바일](docs/screens/t1-setup-mobile.png)
- 📄 [게임 기획서 (docs/GAME_DESIGN.md)](docs/GAME_DESIGN.md)
- 🃏 카드 초안: [docs/CARDS.md](docs/CARDS.md)
- 🃏 카드 확장(세력 시작 덱·전략 자산·비밀 목표·성장): [docs/CARDS_EXPANSION.md](docs/CARDS_EXPANSION.md)
- ⚙️ [규칙 엔진 설계 (docs/ENGINE_DESIGN.md)](docs/ENGINE_DESIGN.md)
- 🗂 [게임 데이터 JSON (src/data)](src/data) — 카드·이벤트·세력·지역 등 (검증: `node tools/validate-data.js`)
- 🗺 지도 미리보기: https://sigco3111.github.io/order-of-powers/map/
- 🗺 [지도 문서 (docs/map-preview.md)](docs/map-preview.md) · 이전 추상 초안은 assets/map/regions.svg
- 🎨 [에셋 목록과 라이선스 (docs/ASSETS.md)](docs/ASSETS.md)

## 폴더 구조
```
order-of-powers/
├─ README.md
├─ docs/
│  ├─ GAME_DESIGN.md      # 게임 기획서
│  └─ ASSETS.md           # 에셋 목록, 라이선스, 부족한 에셋
└─ assets/
   ├─ ui/                 # 버튼, 패널, 카드 뒷면, 칩, 주사위 (Kenney)
   ├─ icons/              # 자원·카드·지도 마커·배지·방패·동전 아이콘
   └─ audio/
      ├─ sfx/             # 카드, 칩, 버튼, 성공/실패 효과음
      └─ music/           # 잔잔한 배경음악
```
`src/data`(카드·이벤트·세력·지역 JSON)와 `tools/validate-data.js`(데이터 검증)는 추가되었고, 앞으로 `src/engine`(규칙), `src/ai`, `src/ui`가 추가될 예정입니다. 자세한 구조는 [docs/ENGINE_DESIGN.md](docs/ENGINE_DESIGN.md)를 참고하세요.

## 크레딧과 라이선스
`assets/`의 이미지와 소리는 모두 CC0(퍼블릭 도메인) 에셋입니다. 대부분 [Kenney](https://kenney.nl)의 팩이고, 일부는 OpenGameArt 작가들의 CC0 작품입니다. 각 팩 폴더에 원본 라이선스 파일을 그대로 두었습니다. 팩별 제작자·출처·용도는 [docs/ASSETS.md](docs/ASSETS.md)에 정리했습니다.
