<div align="center">

# 🏛 Order of Powers — 권력의 질서

**G20 국가 중 하나를 골라, 8라운드(6·8·10 선택) 동안 새로운 세계 질서를 겨룬다.**

![status](https://img.shields.io/badge/status-S2a%20완료:%20튜토리얼-green)
![license of assets](https://img.shields.io/badge/assets-CC0-blue)

</div>

## 소개
Order of Powers는 G20 국가 20개 중 하나를 골라 8라운드(6·8·10 선택) 동안 내정·외교·군사 카드를 모으고, 세계 8개 지역의 영향력을 겨루는 **웹 전략 보드게임**입니다. 덱 빌딩과 지역 장악을 한 판 15~40분 (라운드 수 6·8·10 선택, 기본 8라운드 약 28분)에 즐기도록 설계하고 있으며, 모바일 세로 화면에서도 할 수 있는 카드 중심 UI를 목표로 합니다.

현재 상태: **S2a 완료: 튜토리얼** (표지의 '튜토리얼' 버튼 — 고정 시드 4라운드 연습판 위에 14단계 코치 마크, 코드는 src/ui/tutorial.js·tutorial.css, 진행은 oop-tutorial-v1에 저장돼 새로고침해도 이어짐, 수료 업적 '튜토리얼 수료'). 직전 **S1 완료: 소리와 설정** (효과음·음악·설정 화면·크레딧, [docs/ASSETS.md](docs/ASSETS.md)). 직전 M1f: 점수 쏠림·영향력 소멸 밸런스 (결과는 [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md) 7장, 진단은 `node tools/diagnose.js`). 직전 U3b 완료: 상점과 결과 화면 (상점 구매 화면·최종 보고서·기록/업적·모바일 접이식 독, 자세한 내용은 [docs/u3b_status.md](docs/u3b_status.md)). 직전 U3a: 카드 플레이 화면 (손패 트레이·계획 슬롯·카드 상세·전략 자산·선택 패널·공개/해결 연출·이벤트 카드·정산 시트·첫 판 안내). 직전 T1: G20 국가 선택 (국가 20개를 네 유형 — 외교형·산업형·군사형·성장형 — 으로 나눠 고르는 편성 화면, 국가별 특성 1개, 목록은 [docs/COUNTRIES.md](docs/COUNTRIES.md)). 직전 U2: 보드 화면 (지도·세력 패널·라운드 진행·AI 루프·저장/이어하기; 손패/상점 화면은 U3) — 라이브: https://sigco3111.github.io/order-of-powers/ (아트 디렉션은 [docs/UI_DIRECTION.md](docs/UI_DIRECTION.md)). 직전 단계 M1e-1: 데이터 밸런스 1차 (결과는 [docs/BALANCE_REPORT.md](docs/BALANCE_REPORT.md)). M1d까지 구현: RNG·상태 생성·점수·시장·효과 실행·단계 리듀서·`legalActions`·`autoPlay`·`src/ai/ai.js`(쉬움/보통/어려움)·`node tools/simulate.js`, `node --test`. 기획서와 CC0 에셋, 규칙 결정은 [docs/RULES_DECISIONS.md](docs/RULES_DECISIONS.md).

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

## 독자 창작물 안내
Order of Powers는 현대 지정학 보드게임 "월드 오더(World Order)"에서 영감을 받은 **독자적인 작품**입니다. 세력, 규칙, 카드 문구, 그림, 이름은 모두 새로 만들며 원작의 규칙 문서·카드 문구·그림·이름을 사용하지 않습니다. 이 프로젝트는 원작의 제작사와 관련이 없습니다.
