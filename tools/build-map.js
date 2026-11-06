#!/usr/bin/env node
// 실제 세계 지도 기반 8개 지역 SVG 생성 스크립트.
// 준비:  npm install --no-save world-atlas@2 topojson-client@3 topojson-simplify@3 d3-geo@3
// 실행:  node tools/build-map.js
// 결과:  assets/map/world-regions.svg 를 쓰고, src/data/regions.json 의 각 지역에 "mapAnchor": {x, y} 를 기록한다.
// 데이터: Natural Earth 나라 경계(퍼블릭 도메인) — npm 패키지 world-atlas (ISC)의 countries-50m.json
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');
const { presimplify, simplify, sphericalTriangleArea } = require('topojson-simplify');

const W = 1000, H = 520, PAD = 6;
const SIMPLIFY_MIN_WEIGHT = 1e-5;   // 구면 삼각형 넓이(sr) 기준. 클수록 단순해진다.
const MIN_RING_AREA = 1.5;          // 이보다 작은(px²) 섬·구멍은 그리지 않는다.
const ROOT = path.join(__dirname, '..');

// ── 지역 정의 (id는 src/data/regions.json 과 동일) ──────────────────────────
const REGIONS = {
  northAmerica: { name: '북아메리카', lines: ['북아메리카'], fill: '#3e7fb0',
    members: `United States of America|Canada|Mexico|Greenland|Belize|Guatemala|Honduras|El Salvador|Nicaragua|Costa Rica|Panama|Cuba|Jamaica|Haiti|Dominican Rep.|Bahamas|Barbados|Antigua and Barb.|Dominica|Grenada|Saint Lucia|St. Kitts and Nevis|St. Vin. and Gren.|Trinidad and Tobago|Puerto Rico|U.S. Virgin Is.|Anguilla|Cayman Is.|Bermuda|British Virgin Is.|Turks and Caicos Is.|Montserrat|Aruba|Curaçao|Sint Maarten|St-Martin|St-Barthélemy|St. Pierre and Miquelon|St. Pierre and Miquelon` },
  southAmerica: { name: '남아메리카', lines: ['남아메리카'], fill: '#3da386',
    members: `Argentina|Bolivia|Brazil|Chile|Colombia|Ecuador|Guyana|Paraguay|Peru|Suriname|Uruguay|Venezuela|Falkland Is.|S. Geo. and the Is.|@French Guiana` },
  europe: { name: '유럽', lines: ['유럽'], fill: '#bc7fa8',
    members: `Albania|Andorra|Austria|Belarus|Belgium|Bosnia and Herz.|Bulgaria|Croatia|Czechia|Denmark|Estonia|Faeroe Is.|Finland|France|Germany|Greece|Hungary|Iceland|Ireland|Italy|Kosovo|Latvia|Liechtenstein|Lithuania|Luxembourg|Macedonia|Malta|Moldova|Monaco|Montenegro|Netherlands|Norway|Poland|Portugal|Romania|San Marino|Serbia|Slovakia|Slovenia|Spain|Sweden|Switzerland|Ukraine|United Kingdom|Vatican|Jersey|Guernsey|Isle of Man|Åland` },
  russiaCentralAsia: { name: '러시아·중앙아시아', lines: ['러시아·중앙아시아'], fill: '#8e96a0',
    members: `Russia|Kazakhstan|Uzbekistan|Turkmenistan|Kyrgyzstan|Tajikistan|Georgia|Armenia|Azerbaijan` },
  middleEastNorthAfrica: { name: '중동·북아프리카', lines: ['중동·북아프리카'], fill: '#c8693a',
    members: `Morocco|W. Sahara|Algeria|Tunisia|Libya|Egypt|Sudan|Turkey|Cyprus|N. Cyprus|Syria|Lebanon|Israel|Palestine|Jordan|Iraq|Iran|Saudi Arabia|Yemen|Oman|United Arab Emirates|Qatar|Kuwait|Bahrain` },
  subSaharanAfrica: { name: '사하라 이남 아프리카', lines: ['사하라 이남', '아프리카'], fill: '#cfc85a',
    members: `Angola|Benin|Botswana|Burkina Faso|Burundi|Cameroon|Cabo Verde|Central African Rep.|Chad|Comoros|Congo|Dem. Rep. Congo|Côte d'Ivoire|Djibouti|Eq. Guinea|Eritrea|eSwatini|Ethiopia|Gabon|Gambia|Ghana|Guinea|Guinea-Bissau|Kenya|Lesotho|Liberia|Madagascar|Malawi|Mali|Mauritania|Mauritius|Mozambique|Namibia|Niger|Nigeria|Rwanda|São Tomé and Principe|Senegal|Seychelles|Sierra Leone|Somalia|Somaliland|S. Sudan|South Africa|Tanzania|Togo|Uganda|Zambia|Zimbabwe|Saint Helena` },
  eastAsia: { name: '동아시아', lines: ['동아시아'], fill: '#6cb4d9',
    members: `China|Mongolia|Japan|North Korea|South Korea|Taiwan|Hong Kong|Macao` },
  southAsiaOceania: { name: '남아시아·동남아·오세아니아', lines: ['남아시아·', '동남아·', '오세아니아'], fill: '#d9a04a',
    members: `Afghanistan|Pakistan|India|Nepal|Bhutan|Bangladesh|Sri Lanka|Maldives|Myanmar|Thailand|Laos|Cambodia|Vietnam|Malaysia|Singapore|Brunei|Indonesia|Philippines|Timor-Leste|Papua New Guinea|Australia|New Zealand|Siachen Glacier|Br. Indian Ocean Ter.|Indian Ocean Ter.|Ashmore and Cartier Is.|Heard I. and McDonald Is.|Fr. S. Antarctic Lands|Norfolk Island|Vanuatu|Micronesia|Marshall Is.|N. Mariana Is.|Guam|American Samoa|Palau|Fiji|Solomon Is.|Samoa|Tonga|Kiribati|Nauru|Niue|Cook Is.|Fr. Polynesia|New Caledonia|Wallis and Futuna Is.|Pitcairn Is.` },
};
const IGNORED = new Set(['Antarctica']);
// 한 나라 안의 일부 폴리곤만 다른 지역에 속하는 경우: [나라, 중심 위도/경도 조건, 지역]
const SPLIT_RULES = [
  { country: 'France', test: (lon, lat) => lon < -45 && lat < 10, region: 'southAmerica' },        // 프랑스령 기아나
  { country: 'France', test: (lon, lat) => lon < -55 && lat >= 10 && lat < 25, region: 'northAmerica' }, // 과들루프·마르티니크
];
// 라벨/마커 위치 수동 보정(px). 자동 계산(가장 넓은 땅 안쪽의 가장 깊은 점)에서의 이동량.
const ANCHOR_SHIFT = { middleEastNorthAfrica: [14, 2], subSaharanAfrica: [-8, 0], russiaCentralAsia: [0, -4] };

// ── 데이터 읽기 ──────────────────────────────────────────────────────────
const nameToRegion = new Map();
for (const [rid, r] of Object.entries(REGIONS)) for (const n of r.members.split('|')) {
  if (n.startsWith('@')) continue;
  if (nameToRegion.has(n) && nameToRegion.get(n) !== rid) throw new Error('중복 배정: ' + n);
  nameToRegion.set(n, rid);
}

async function main() {
  const d3 = await import('d3-geo');
  const topo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
  const geoms = [];
  const unmatched = [];
  for (const g of topo.objects.countries.geometries) {
    const name = g.properties.name;
    if (IGNORED.has(name)) continue;
    const rules = SPLIT_RULES.filter((s) => s.country === name);
    if (rules.length && g.type === 'MultiPolygon') {
      for (const arcs of g.arcs) {
        const sub = { type: 'Polygon', arcs };
        const [lon, lat] = d3.geoCentroid(topojson.feature(topo, sub));
        const hit = rules.find((s) => s.test(lon, lat));
        const rid = hit ? hit.region : nameToRegion.get(name);
        geoms.push({ rid, geom: sub, name });
      }
      continue;
    }
    const rid = nameToRegion.get(name);
    if (!rid) { unmatched.push(name); continue; }
    geoms.push({ rid, geom: g, name });
  }
  if (unmatched.length) console.warn('매칭 안 된 나라:', unmatched.join(', '));
  const used = new Set(geoms.map((x) => x.name));
  for (const n of nameToRegion.keys()) if (!used.has(n)) console.warn('데이터에 없는 이름(무시):', n);

  // 위상을 유지한 채 단순화 → 같은 지역 병합(공유 호를 지우므로 이웃 나라 사이 틈 없음)
  const st = simplify(presimplify(topo, sphericalTriangleArea), SIMPLIFY_MIN_WEIGHT);
  const idx = new Map(topo.objects.countries.geometries.map((g, i) => [g, i]));
  const merged = {};
  for (const rid of Object.keys(REGIONS)) {
    const list = geoms.filter((x) => x.rid === rid).map((x) => {
      // simplify()는 arcs 배열을 새 topology 안에서 재사용하므로 같은 좌표 구조를 그대로 사용
      return x.geom;
    });
    merged[rid] = topojson.merge(st, list);
  }

  // 투영: 안타티카 제외 육지 전체를 1000x520 안에 맞춘다.
  const all = { type: 'FeatureCollection', features: Object.values(merged).map((m) => ({ type: 'Feature', geometry: m })) };
  const projection = d3.geoNaturalEarth1().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], all);

  // 투영된 링 수집
  function collect(geometry) {
    const polys = [];
    let poly = null, ring = null;
    d3.geoStream(geometry, projection.stream({
      polygonStart() { poly = []; }, polygonEnd() { polys.push(poly); },
      lineStart() { ring = []; }, lineEnd() { if (ring.length > 2) poly.push(ring); },
      point(x, y) { ring.push([x, y]); }, sphere() {},
    }));
    return polys;
  }
  const area = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const r1 = (v) => Math.round(v * 10) / 10;

  const out = {};
  for (const [rid, geometry] of Object.entries(merged)) {
    // d3 의 자름(clip) 결과는 링 순서가 외곽/구멍 순이 아니므로 순서에 의존하지 않고 넓이로만 거른다.
    const polys = collect(geometry)
      .map((rings) => rings.filter((r) => Math.abs(area(r)) >= MIN_RING_AREA))
      .filter((rings) => rings.length);
    // 같은 좌표가 반복되는 점 제거 + 소수 1자리
    let d = '';
    for (const rings of polys) for (const ring of rings) {
      let last = '';
      const pts = [];
      for (const [x, y] of ring) { const s = r1(x) + ' ' + r1(y); if (s !== last) pts.push(s); last = s; }
      if (pts.length < 3) continue;
      d += 'M' + pts.join('L') + 'Z';
    }
    // 라벨 위치: 가장 넓은 외곽 링 안에서 경계에서 가장 먼 점 (구멍은 반대 방향 링)
    const rings = polys.flat();
    const bigRing = rings.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
    const holes = rings.filter((r) => r !== bigRing && Math.sign(area(r)) !== Math.sign(area(bigRing)) && pointInRing(r[0], bigRing));
    const pole = poleOfInaccessibility([bigRing, ...holes]);
    out[rid] = { d, pole, polyCount: polys.length };
  }

  // SVG 조립
  const LH = 19, FS = 17;
  const anchors = {};
  let labels = '', markers = '', paths = '';
  for (const [rid, r] of Object.entries(REGIONS)) {
    const o = out[rid];
    const sh = ANCHOR_SHIFT[rid] || [0, 0];
    const n = r.lines.length;
    const x = r1(o.pole[0] + sh[0]);
    const y = r1(o.pole[1] + 2 + (n * LH) / 2 + sh[1]);
    anchors[rid] = { x, y };
    paths += `<path id="${rid}" class="region" data-name="${r.name}" fill="${r.fill}" d="${o.d}"/>\n`;
    const firstY = y - 9 - (n - 1) * LH;
    const tspans = r.lines.map((t, i) => `<tspan x="${x}" y="${r1(firstY + i * LH)}">${t}</tspan>`).join('');
    labels += `<text class="label" data-region="${rid}" text-anchor="middle">${tspans}</text>\n`;
    markers += `<circle class="marker" data-region="${rid}" cx="${x}" cy="${y}" r="6" fill="#fff" fill-opacity=".9" stroke="#0b1a33" stroke-width="1.6"/>\n`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">Order of Powers - 세계 8개 지역 지도</title>
<desc id="d">Natural Earth(퍼블릭 도메인) 국가 경계를 8개 지역으로 합친 지도. 국경선·바다 이름·나라 이름 없음. 원형 마커는 영향력 토큰 위치.</desc>
<rect id="background" width="${W}" height="${H}" fill="#0b1a33"/>
<g id="regions" stroke="#e8eef7" stroke-width=".7" stroke-linejoin="round" fill-rule="evenodd">
${paths}</g>
<g id="labels" font-family="'Noto Sans KR', sans-serif" font-size="${FS}" font-weight="700" fill="#fff" stroke="#0b1a33" stroke-width="3.6" stroke-linejoin="round" paint-order="stroke" pointer-events="none">
${labels}</g>
<g id="markers">
${markers}</g>
</svg>
`;
  const outFile = path.join(ROOT, 'assets', 'map', 'world-regions.svg');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, svg);
  console.log('쓴 파일:', outFile, (Buffer.byteLength(svg) / 1024).toFixed(1) + ' KB');

  // regions.json 에 mapAnchor 기록 (나머지 내용은 그대로)
  const rf = path.join(ROOT, 'src', 'data', 'regions.json');
  const regions = JSON.parse(fs.readFileSync(rf, 'utf8'));
  for (const reg of regions) {
    if (!anchors[reg.id]) throw new Error('regions.json 의 지역이 지도에 없음: ' + reg.id);
    reg.mapAnchor = anchors[reg.id];
  }
  fs.writeFileSync(rf, JSON.stringify(regions, null, 2) + '\n');
  console.log(JSON.stringify(anchors));
}

function pointInRing(p, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
}

// 폴리곤(외곽선 + 구멍) 안에서 경계까지 거리가 가장 먼 점 (격자 탐색, 1px)
function poleOfInaccessibility(rings) {
  const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const segDist = (px, py, a, b) => {
    let dx = b[0] - a[0], dy = b[1] - a[1], t = dx || dy ? ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy) : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  };
  const inside = (px, py) => {
    let c = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > py) !== (r[j][1] > py) && px < ((r[j][0] - r[i][0]) * (py - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  };
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], bd = -1;
  for (let x = x0; x <= x1; x += 1.5) for (let y = y0; y <= y1; y += 1.5) {
    if (!inside(x, y)) continue;
    let d = Infinity;
    for (const r of rings) for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(x, y, r[i], r[(i + 1) % r.length]));
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}

main().catch((e) => { console.error(e); process.exit(1); });
