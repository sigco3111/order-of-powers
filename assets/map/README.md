# 지도 에셋

`regions.svg`는 Order of Powers의 8개 지역을 단순한 도형으로 그린 **원본 추상 그림(초안)**입니다.
실제 국경선이나 지도 데이터를 사용하지 않았고, 모양은 위치 관계만 짐작할 수 있도록 임의로 그렸습니다.

- 크기: viewBox `0 0 1000 560`
- 각 `polygon`의 `id`는 `src/data/regions.json`의 지역 `id`와 같습니다 (예: `northAmerica`).
- 각 지역에는 영향력 토큰을 놓을 원형 마커(`<지역id>-marker`)가 있습니다.
- 라벨 글꼴: `Noto Sans KR, sans-serif`
