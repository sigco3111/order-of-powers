# 지도 에셋

## world-regions.svg — 실제 세계 지도 기반 8개 지역 (현재 사용)
실제 세계 지도(Natural Earth 나라 경계)를 8개 지역으로 합쳐 한 덩어리씩 그린 SVG입니다. 국경선, 바다 이름, 나라 이름은 넣지 않았습니다.

- 크기: viewBox `0 0 1000 520`, 파일 약 82 KB
- 투영: `d3.geoNaturalEarth1` (남극 제외, 1000 × 520 안에 맞춤)
- 각 지역은 `<path id="지역id" class="region">` 하나입니다. `id`는 `src/data/regions.json`의 지역 `id`와 같습니다 (`northAmerica`, `southAmerica`, `europe`, `russiaCentralAsia`, `middleEastNorthAfrica`, `subSaharanAfrica`, `eastAsia`, `southAsiaOceania`).
- 라벨: `<text class="label" data-region="지역id">` (한국어, `Noto Sans KR`, 흰색 + 어두운 외곽선)
- 마커: `<circle class="marker" data-region="지역id">` — 영향력 토큰을 놓을 위치. 좌표는 `src/data/regions.json`의 `mapAnchor` `{x, y}`와 같습니다.
- 미리보기: <https://sigco3111.github.io/order-of-powers/map/> (소스: `map/index.html`)

### 데이터 출처와 라이선스
- 나라 경계: [Natural Earth](https://www.naturalearthdata.com/) (퍼블릭 도메인), npm 패키지 [`world-atlas`](https://github.com/topojson/world-atlas) (ISC)의 `countries-50m.json`을 사용했습니다.
- 도구: `topojson-client`, `topojson-simplify`(BSD-3-Clause), `d3-geo`(ISC).
- 지도 데이터는 원작 보드게임과 무관하며, 지역 구분은 이 프로젝트의 게임 디자인에 따른 것입니다.

### 지역 구성
| 지역 id | 이름 | 포함 나라 |
| --- | --- | --- |
| `northAmerica` | 북아메리카 | 미국, 캐나다, 멕시코, 그린란드, 중앙아메리카 전체, 카리브해 전체(영·프·네·미령 섬 포함) |
| `southAmerica` | 남아메리카 | 남아메리카 전체, 포클랜드 제도, 사우스조지아, 프랑스령 기아나 |
| `europe` | 유럽 | 영국, 아일랜드, 아이슬란드, 우크라이나, 벨라루스, 몰도바, 발칸, 발트 3국 등 유럽 전체 (키프로스·튀르키예 제외) |
| `russiaCentralAsia` | 러시아·중앙아시아 | 러시아, 카자흐스탄, 우즈베키스탄, 투르크메니스탄, 키르기스스탄, 타지키스탄, 조지아, 아르메니아, 아제르바이잔 |
| `middleEastNorthAfrica` | 중동·북아프리카 | 모로코, 서사하라, 알제리, 튀니지, 리비아, 이집트, 수단, 튀르키예, 키프로스(북키프로스 포함), 시리아, 레바논, 이스라엘, 팔레스타인, 요르단, 이라크, 이란, 사우디아라비아, 예멘, 오만, 아랍에미리트, 카타르, 쿠웨이트, 바레인 |
| `subSaharanAfrica` | 사하라 이남 아프리카 | 위에 없는 나머지 아프리카 전체 (남수단, 소말리아·소말릴란드, 마다가스카르, 세인트헬레나 포함) |
| `eastAsia` | 동아시아 | 중국(홍콩·마카오), 몽골, 일본, 북한, 한국, 대만 |
| `southAsiaOceania` | 남아시아·동남아·오세아니아 | 아프가니스탄, 파키스탄, 인도, 네팔, 부탄, 방글라데시, 스리랑카, 몰디브, 미얀마, 태국, 라오스, 캄보디아, 베트남, 말레이시아, 싱가포르, 브루나이, 인도네시아, 필리핀, 동티모르, 파푸아뉴기니, 호주, 뉴질랜드, 태평양 섬나라·속령 |

판단이 필요했던 곳: 프랑스령 기아나는 `southAmerica`로, 프랑스령 카리브 섬은 `northAmerica`로 보냈습니다(프랑스 본토와 인도양 속령은 `europe`). 포클랜드·사우스조지아는 `southAmerica`, 세인트헬레나·마다가스카르 등 아프리카 도서는 `subSaharanAfrica`, 태평양·인도양의 작은 속령은 `southAsiaOceania`, 카리브해 영·미·네덜란드령 섬은 `northAmerica`입니다. 시아첸 빙하는 `southAsiaOceania`입니다.

### 만든 방법
`tools/build-map.js`가 아래 순서로 SVG를 만듭니다 (재현 가능).

1. `npm install --no-save world-atlas@2 topojson-client@3 topojson-simplify@3 d3-geo@3`
2. `node tools/build-map.js`
3. 스크립트가 하는 일:
   - `countries-50m.json`을 읽고 남극을 뺀 모든 나라를 이름으로 8개 지역에 배정합니다. 배정 안 된 나라가 있으면 경고를 출력합니다. 프랑스는 폴리곤마다 위치를 보고 나눕니다.
   - `topojson-simplify`로 위상(공유 경계)을 유지한 채 단순화합니다 (구면 삼각형 넓이 1e-5 sr 미만 점 제거).
   - `topojson.merge`로 지역 안 나라들을 하나의 도형으로 합칩니다. 경계(호)를 공유하므로 같은 지역 이웃 나라 사이에 틈이 생기지 않습니다.
   - `d3.geoNaturalEarth1().fitExtent`로 1000 × 520 안에 투영하고, 1.5 px² 미만의 작은 섬은 생략하며, 좌표를 소수 첫째 자리로 줄입니다.
   - 가장 큰 땅덩어리 안에서 경계에서 가장 먼 점을 찾아 라벨·마커 위치(anchor)로 쓰고(일부는 `ANCHOR_SHIFT`로 수동 보정), 위치를 `src/data/regions.json`의 `mapAnchor`에 기록합니다.

## regions.svg — 초기 추상 초안 (참고용)
`regions.svg`는 8개 지역을 단순한 도형으로 그린 **이전 추상 초안**입니다. 실제 지도 데이터를 쓰지 않았고, 위치 관계만 짐작할 수 있게 임의로 그렸습니다. 현재 지도는 위의 `world-regions.svg`입니다.

- 크기: viewBox `0 0 1000 560`, 마커 id는 `<지역id>-marker`
