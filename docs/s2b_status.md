# S2b 상태: 규칙서

- 규칙서: `src/ui/rules.js` · `rules.css`. 전체 화면, 11개 장, 그림 3개(라운드 흐름·지역 주도·점수 계산). 표지 '규칙', 편성 '규칙', 보드 머리띠 '규칙', 결과 화면 '규칙'에서 연다. 옛 작은 '규칙 요약' 시트는 없앴다.
- 문서: `docs/RULES.md`는 `rulesMarkdown(data)`가 만든 것이고 테스트가 같은지 확인한다 (규칙서를 고치면 다시 만든다).
- (a) 오디오: `canPlayType('audio/ogg; codecs=vorbis')`가 빈 값이면 `sounds.json`의 `mp3` 경로를 쓴다. 효과음 20개와 음악 2곡의 mp3(96 kbps)를 같은 폴더에 두었다. ogg도 mp3도 못 읽으면 설정에 '이 기기에서는 소리를 낼 수 없어요'를 보인다.
- (b) 결과 화면에 '설정'과 '규칙' 단추.
- (c) `clearSave` 뒤 진행 중인 판은 저장하지 않는다 (`loop.saveOff`). 새 판이나 이어하기에서 풀린다.
- (d) `previewChips(card, state, faction)`: 고를 지역이 없으면 '지역 선택 필요' 칩을 숨긴다.
- 테스트: `tests/ui-rules.test.js`, `tests/ui-s2b-fixes.test.js`. 전체 143개 통과, 1개 건너뜀.
