<div align="center">

# 🏛 Order of Powers — 권력의 질서

**네 강대국, 여섯 라운드, 하나의 새로운 세계 질서.**

![status](https://img.shields.io/badge/status-기획%20단계-orange)
![license of assets](https://img.shields.io/badge/assets-CC0-blue)

</div>

## 소개
Order of Powers는 가상의 네 강대국 중 하나를 골라 6라운드 동안 내정·외교·군사 카드를 모으고, 세계 8개 지역의 영향력을 겨루는 **웹 전략 보드게임**입니다. 덱 빌딩과 지역 장악을 한 판 20~30분에 즐기도록 설계하고 있으며, 모바일 세로 화면에서도 할 수 있는 카드 중심 UI를 목표로 합니다.

현재는 **기획 단계**입니다. 코드는 아직 없고, 기획서와 수집한 CC0 에셋이 들어 있습니다.

- 📄 [게임 기획서 (docs/GAME_DESIGN.md)](docs/GAME_DESIGN.md)
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
앞으로 `src/engine`(규칙), `src/ai`, `src/ui`, `src/data`(카드·지역 JSON)가 추가될 예정입니다.

## 크레딧과 라이선스
`assets/`의 이미지와 소리는 모두 CC0(퍼블릭 도메인) 에셋입니다. 대부분 [Kenney](https://kenney.nl)의 팩이고, 일부는 OpenGameArt 작가들의 CC0 작품입니다. 각 팩 폴더에 원본 라이선스 파일을 그대로 두었습니다. 팩별 제작자·출처·용도는 [docs/ASSETS.md](docs/ASSETS.md)에 정리했습니다.

## 독자 창작물 안내
Order of Powers는 현대 지정학 보드게임 "월드 오더(World Order)"에서 영감을 받은 **독자적인 작품**입니다. 세력, 규칙, 카드 문구, 그림, 이름은 모두 새로 만들며 원작의 규칙 문서·카드 문구·그림·이름을 사용하지 않습니다. 이 프로젝트는 원작의 제작사와 관련이 없습니다.
