# 학습탭 확장 — 타입별 콜로니 클래스 + 고체배지 Plate 범위 설계

- 날짜: 2026-09-15
- 상태: 설계 승인 대기 (사용자 검토 중)
- 대상 파일: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` (단일 파일, 그대로 확장)
- 관련 산출물(참고용, 이번엔 수정 안 함): `콜로니 카운터 학습용.html`(ai 연결의 구버전, 모델 연결 없음), `drymedia_film.onnx`, 기존 데이터셋 zip 2개

이 스펙은 AI 학습 기반 콜로니 카운터로 전환하는 첫 단계로, "학습 데이터 추출" 자체를 개선하는 작업이다. 실제 YOLO 모델 재학습·ONNX 변환·추론 연결은 이 스펙 범위 밖(사용자가 Kaggle 등에서 직접 수행, 추후 별도 스펙).

---

## 1. 배경 — 현재 상태 조사 결과

`콜로니 카운터 ai 연결.html`은 원본 Petricore 앱(필름배지 코드) 위에 학습용 섹션 3개가 얹힌 구조다:

1. **Agar training dataset v3** — 고체배지 콜로니 자동계수→수정→저장→export. 클래스 1개(`colony`) 고정.
2. **Dry media type / AI dataset** — 건조필름배지 콜로니 자동계수→수정→저장→export. 타입(AC/EC/CC/YM/EB/other)은 태깅만 되고 클래스는 역시 1개(`colony`) 고정.
3. **Dry media film-shape learning** — 여러 필름이 찍힌 원본 사진에서 필름 하나하나의 위치를 박스로 학습. 클래스 1개(`film`). `drymedia_film.onnx`로 이미 학습·연결 완료(WebGPU→WASM 자동 선택, 실패 시 기존 규칙기반 분할로 자동 폴백).

세 섹션 모두 **거의 동일한 코드를 3번 복붙**한 구조다: 독립된 IndexedDB(open/add/getAll/clear) 스토어 + JSZip 기반 YOLO export 함수(80/10/10 split, `dataset.yaml`, `metadata.json`, `README.txt`) 각 1벌씩.

핵심 문제 2가지:

- **라벨이 전부 클래스 0으로 고정된다.** `labelLines()`(2벌 있음, agar/dry-media 각각)가 박스마다 무조건 `0 ...`을 쓴다. `detectColonies()`는 내부적으로 `color`(`'red'|'blue'`)를 이미 계산해두는데 export 시점에 버려진다. 즉 데이터를 아무리 모아도 모델이 "타입별로 어떤 색/모양을 세는지" 학습할 라벨 자체가 없다.
- **고체배지에 plate(배지 원판) 검출 단계가 아예 없다.** `detect()`가 업로드 사진 전체를 바로 마스킹한다. 필름배지 쪽 "필름형태학습" 같은 annotation 탭이 고체배지 쪽엔 없다.

예전 `고체배지/colony-counter-v2.html`에는 VRBA 전용 색상+halo 기반 4단계 분류(`vrbaCandidateClass`)가 있었으나, 이번 학습탭 코드베이스로는 이식되지 않았다(단순 `PROFILES` 임계값만 타입별로 존재).

---

## 2. 범위

### 포함 (In)

- 타입별 클래스 체계 정의(§3) 및 그에 따른 검출/자동판정 로직 확장(§4).
- 콜로니 하나하나에 클래스를 태깅하는 UI(§5.1).
- 3벌 복붙된 데이터셋 저장/내보내기 인프라를 공용 헬퍼로 통합(§5.2) — 기존 3개 트랙(agar-colony, drymedia-colony, drymedia-film) 전부 이 헬퍼로 교체.
- 신규 "PLATE SEGMENTATION" annotation 탭(고체배지, 필름형태학습과 동일 패턴) — 4번째 트랙(§5.3).
- YOLO export 포맷을 다중클래스로 변경(§6).

### 제외 (Out)

- 실제 모델 재학습·ONNX 변환·추론 파이프라인 연결(사용자가 외부에서 직접 수행).
- 형태 기반 타입(YM/SDA)의 자동 형태 분류 알고리즘 — 이번엔 사람이 태깅, 모델이 나중에 배움.
- VRBA mm 실측 변환 — 이번엔 px 기준 임계값(경험적 튜닝), 배지 실측 지름 입력은 향후 과제로 명시적으로 미룸.
- 기존에 수집된 데이터셋(고체배지 59장 · 건조필름배지 zip)의 재라벨링 — 새로 태깅되는 것부터 다중클래스로 쌓고, 기존 것은 그대로 둔다(원하면 나중에 재작업 가능).
- 웹앱 디자인(별도로 Claude Design 사용 예정).
- `콜로니 카운터 학습용.html`(ONNX 연결 없는 구버전) — 더 이상 손대지 않고 `ai 연결.html`만 계속 발전시킨다.

---

## 3. 클래스 체계

| 타입 | 클래스(개수) | 판정 근거 | 자동 판정 |
|---|---|---|---|
| AC | `red`(1) | 색상. 퍼진 콜로니는 진한 중심부 1점 기준 | ✅ 기존 색상마스크 |
| EC | `blue`(E.coli), `pink`(기타 대장균군)(2) | 색상 | 🔧 pink(자주) 채널 신규 |
| CC | `red_purple`(1) | 색상 | ✅ 기존 색상마스크 |
| YM | `yeast`(원형·경계뚜렷), `mold`(퍼짐·경계흐림)(2) | **형태** | ❌ 수동 태깅만 |
| EB | `red_purple`(1) | 색상 | ✅ 기존 색상마스크 |
| PCA / TSA | `colony`(1) | 형태 일반, 색상 무관 | ✅ 기존 방식(변경 없음) |
| VRBA | `typical` / `possible` / `atypical` / `non_target`(4) | 색상+halo 강도, **지름 0.5mm 미만 하드 제외**(px 임계값으로 근사, §4.3) | 🔧 예전 `vrbaCandidateClass()` 이식 + 블롭별 색상 특징 신규 |
| TBX | `colony`(1, 청/청록만) | 색상. **무색/백색/기타 색상은 하드 제외**(§4.3) | 🔧 블롭별 색상 특징 신규 |
| SDA | `yeast`, `mold`(2) | **형태** | ❌ 수동 태깅만 |

> **주의(구현 착수 전 재확인 필요):** 최초 설계 시 참고했던 예전 앱(`고체배지/colony-counter-v2.html`)의 타입 목록은 PCA/TSA/VRBA/**NA**/Custom이었으나, 실제 대상 파일(`콜로니 카운터 ai 연결.html`)의 고체배지 타입 버튼은 **TSA/PCA/VRBA/TBX/SDA/기타**다. `NA`는 이 앱에 존재하지 않고 `TBX`로 대체됐다 — 위 표는 실제 코드 기준으로 수정됨.

```js
const TYPE_CLASS_SCHEMES = {
  AC:   { classes: ['red'],                                        basis: 'color',      auto: true },
  EC:   { classes: ['blue', 'pink'],                                basis: 'color',      auto: true },
  CC:   { classes: ['red_purple'],                                  basis: 'color',      auto: true },
  YM:   { classes: ['yeast', 'mold'],                               basis: 'shape',       auto: false },
  EB:   { classes: ['red_purple'],                                  basis: 'color',      auto: true },
  PCA:  { classes: ['colony'],                                      basis: 'morphology', auto: true },
  TSA:  { classes: ['colony'],                                      basis: 'morphology', auto: true },
  VRBA: { classes: ['typical','possible','atypical','non_target'],  basis: 'color_halo',  auto: true, hardMinDiameterPx: /* §4.3 참고 — 실사진 튜닝 후 확정할 상수, mm 환산 없음 */ 0 },
  TBX:  { classes: ['colony'],                                      basis: 'color_gate',  auto: true },
  SDA:  { classes: ['yeast', 'mold'],                                basis: 'shape',       auto: false },
};
```

`basis: 'shape'`인 타입(YM, SDA)은 `auto: false` — 자동 검출(블롭 찾기)은 기존 그대로 하되, 클래스 배정은 항상 사람이 한다. `other`(사용자 정의 타입)는 스킴이 없으므로 기존처럼 단일 `colony` 클래스로 폴백.

> **대소문자 주의:** 건조필름배지 쪽 타입 값은 대문자(`AC`/`EC`/`CC`/`YM`/`EB`, `window.__dryMediaType`)이고 고체배지 쪽은 소문자(`tsa`/`pca`/`vrba`/`tbx`/`sda`, `S.type`)다 — 서로 다른 트랙이 이미 그렇게 굳어져 있으므로 `TYPE_CLASS_SCHEMES`도 위 표처럼 **혼합 대소문자 키를 그대로 쓴다**(임의로 통일하지 않는다). 각 트랙에서 스킴을 조회할 때 반드시 그 트랙이 실제 쓰는 대소문자 그대로 조회해야 한다 — 그렇지 않으면 조용히 `other`/`undefined`로 폴백해 버그를 알아채기 어렵다.

---

## 4. 검출·색상 로직 확장

**건조필름배지와 고체배지는 검출 엔진이 완전히 다르다** — 같은 파일 안에 있지만 별개의 IIFE/스코프다:

- **건조필름배지(§4.1, §4.2)**: 원본 Petricore 코드의 `detectColonies()`/`buildMask(data,w,h,labelPx,gate,channel)`(1281행 부근) — R/G/B 채널 임계값으로 직접 색상 마스크를 만드는 방식. `colorMode` 파라미터로 어떤 채널을 볼지 결정.
- **고체배지(§4.3, §4.4)**: agar 섹션 자체 IIFE(3493행) 안의 `buildMask(canvas)`/`components(m,w,h)` — **색상과 무관하게 배경과의 거리(dist) + 로컬 대비(local contrast)만으로 블롭을 찾는 방식.** 지금은 어떤 타입(TSA/PCA/VRBA/TBX/SDA)이든 색상을 전혀 보지 않고 "배경과 다르게 보이는 덩어리"를 전부 후보로 잡은 뒤, `applyModel()`로 면적 비율만 보정한다. **VRBA/TBX가 필요로 하는 색상 기반 분류·제외는 지금 코드에 전혀 없다** — §4.3/§4.4에서 새로 추가하는 것은 기존 함수를 고치는 게 아니라, `components()`가 찾은 블롭 각각에 대해 **사후(post-hoc) 색상 특징을 뽑아 분류/제외하는 새 단계**를 얹는 것이다.

### 4.1 EC용 pink(자주) 채널

기존 `buildMask()`는 red 2채널(`red`/`blue`)만 지원한다. EC 전용으로 3번째 채널 `pink`를 추가한다:

- `blue`: 기존 로직 그대로(`(B-R)>gate && (B-G)>gate2 && B<235`).
- `pink`: R과 B가 둘 다 G보다 확연히 높고(자주/마젠타 계열), 순수 blue 조건에는 안 걸리는 픽셀. 정확한 게이트 값은 실제 EC 사진으로 튜닝 필요 — 최초 구현은 `(R-G)>gate && (B-G)>gate2*0.6 && (R-B) 절대값이 작음(자주에 가까움)` 정도의 근사치로 시작하고, 실사진 검증 단계에서 조정한다(허수 상수를 미리 확정하지 않는다).
- `colorMode: 'ec'`일 때 blue 마스크와 pink 마스크를 각각 돌려 두 그룹으로 나눠 반환.

### 4.2 형태 기반 타입(YM, SDA)

검출 알고리즘 변경 없음 — 기존 블롭 검출(연결성분)로 후보를 찾고, 각 콜로니는 `cls: null`(미분류) 상태로 시작한다. §5.1의 태깅 UI로 사람이 `yeast`/`mold` 중 하나를 지정해야 저장이 가능하다(미분류 상태로는 "학습 데이터 저장" 버튼 비활성 — 정직하지 않은 클래스 0 라벨을 만들지 않기 위함).

### 4.3 agar 블롭의 색상 특징 추출 (VRBA·TBX 공용 기반)

`components(m,w,h)`(agar IIFE 3560행)는 지금 각 블롭에 대해 `{x,y,radius,area,manual,origin}`만 반환하고 픽셀 색상은 전혀 보지 않는다. VRBA와 TBX 둘 다 "이 블롭이 무슨 색인가"가 필요하므로, `components()`를 확장해 블롭에 속한 픽셀들의 평균 RGB(및 그로부터 HSV)를 함께 계산해 반환한다(순회 중 `sxsum/sysum`처럼 `rsum/gsum/bsum`도 같이 누적하면 됨 — 추가 순회 없이 동일 루프에서 가능).

이 평균 색상 위에 예전 `고체배지/colony-counter-v2.html`의 다음 로직을 이식한다(신규 agar 코드 스코프에 맞게 이름만 조정, 로직은 그대로):

- `rgb2hsv(r,g,b)` 변환
- `hueGateScore(h, gate)` — 지정된 hue 범위(예: 자주→빨강→분홍 `[280,20]`) 소프트 스코어
- `redPurpleScore = hueGateScore(hue, [280,20]) * clamp(sat*1.6, 0, 1)`

`haloScore`(콜로니 주변 링의 배경 대비 밝기/채도 차이, 예전 `ringMeanColor()` 기반)는 VRBA 4단계 분류에만 필요하고 TBX 제외 판정엔 불필요하므로, VRBA 분류 시에만 계산한다(모든 블롭에 대해 매번 링 샘플링을 하지 않아 성능 낭비를 줄임).

### 4.4 VRBA 4단계 분류 + 하드 사이즈 컷오프

§4.3에서 얻은 `redPurpleScore`/`haloScore`로 분류:

```js
function vrbaCandidateClass(feat) {
  const strongColor = feat.redPurpleScore > .55, someColor = feat.redPurpleScore > .28;
  const halo = feat.haloScore > .45;
  if (strongColor && halo) return 'typical';
  if (strongColor || (someColor && halo)) return 'possible';
  if (someColor) return 'atypical';
  return 'non_target';
}
```

**하드 사이즈 컷오프(0.5mm 미만 자동 제외)** — 지름 0.5mm 이상이라는 사용자 규칙을 그대로 반영하되, **이번 학습탭엔 실측 mm 스케일이 없다**(고체배지 plate 자체를 아직 검출하지 않으므로 mm/px 환산 기준이 없음). 승인된 절충안:

- 최초 구현은 **px 기준 최소 지름 상수**(예: 검출 캔버스 짧은 변 기준 비율로 근사)로 시작하고, 실제 사진들로 튜닝하며 값을 확정한다. 정확한 mm 환산은 §2 제외 항목대로 향후(plate 검출이 생긴 뒤 그 박스의 실측 지름을 기준으로 mm/px를 구하는 방식)로 미룬다.
- **이 컷오프는 VRBA 전용 예외임을 코드 주석에 명시한다** — `CLAUDE.md`의 "단일 조건 하드 임계값 금지" 원칙에 대한 의도적·국소적 예외이며, 다른 타입/`applyModel` 소프트 보정 로직에는 전혀 영향을 주지 않는다. 이 예외를 다른 타입까지 확대하지 않는다.
- 분류 결과가 `non_target`인 블롭도 **제외하지 않고** `S.colonies`에 `cls:'non_target'`로 남긴다(4단계 전부가 "결과"이며, 사람이 검토 중 삭제할 수 있음 — 자동으로 지우면 데이터 수집 목적에 안 맞음). 오직 사이즈 컷오프만 하드 제외.

### 4.5 TBX 색상 하드 게이트

§4.3의 `redPurpleScore`와 별도로, TBX는 **청/청록(cyan-blue) hue 범위** 게이트가 필요하다(정확한 hue 범위는 실사진으로 튜닝 — 최초 근사치는 `hueGateScore(hue, [160, 260])` 정도의 청록~파랑 구간으로 시작). 사용자 규칙("무색/백색 또는 다른 색상 콜로니는 계수에서 제외")대로, 이 게이트를 통과하지 못하는 블롭은 **VRBA와 달리 `S.colonies`에서 완전히 제외**한다(단일 클래스라 "포함/제외" 둘 뿐이라 VRBA처럼 등급을 남길 이유가 없음). 이것도 VRBA와 마찬가지로 CLAUDE.md 하드 임계값 금지 원칙의 **TBX 전용, 명시적 예외**로 코드에 주석을 남긴다.
- 하드 컷오프에 걸린 후보는 `S.colonies`/`S.auto` 어디에도 포함되지 않는다(소프트 감점이 아니라 완전 제외).

---

## 5. 학습탭 UI + 공용 인프라

### 5.1 클래스 태깅 UI

- 콜로니 점을 클릭(또는 탭)하면, 그 타입의 `TYPE_CLASS_SCHEMES[type].classes`가 2개 이상일 때 클래스 버튼 팝오버가 뜬다(1개짜리 타입은 팝오버 없이 항상 그 클래스로 고정).
- `auto: true`인 타입은 자동 검출 시 색상 규칙으로 기본 클래스가 미리 채워지고, 사용자는 틀린 것만 고쳐 누르면 된다(지금의 "자동계수→수정" 흐름 그대로 유지, 클래스 수정이 추가된 것뿐).
- `auto: false`인 타입(YM/SDA)은 모든 점이 미분류로 시작 — 전부 태깅해야 저장 버튼이 활성화된다.
- 상단에 클래스별 개수 배지 표시(예: `blue 12 · pink 3`).

### 5.2 공용 데이터셋 저장소 + YOLO export

기존 3벌(agar-colony, drymedia-colony, drymedia-film)의 복붙된 `openDB/dbAdd/dbGetAll/dbClear`를 하나로 통합:

```js
function makeDatasetStore(dbName) {
  let dbp;
  function openDB() { /* 기존 로직 그대로, dbName만 파라미터화 */ }
  return {
    add:   item => openDB().then(db => /* add */),
    all:   ()   => openDB().then(db => /* getAll */),
    clear: ()   => openDB().then(db => /* clear */),
  };
}
```

export도 하나로 통합. YOLO 클래스 인덱스는 **해당 export에 포함된 샘플들의 타입이 실제로 쓴 클래스들의 합집합**으로 동적으로 구성한다(YOLO `dataset.yaml`의 `names`는 데이터셋 전체 기준 하나뿐이라, 이미지마다 다른 타입/클래스 세트를 쓰더라도 하나의 전역 인덱스로 맞춰야 함):

```js
function exportYoloZip({ store, resolveClasses, boxOf, zipNamePrefix, readmeText }) {
  // 1) store.all() 로 전체 샘플 로드
  // 2) 포함된 모든 샘플의 타입에서 TYPE_CLASS_SCHEMES[type].classes 를 모아
  //    안정적인 순서로 중복 제거한 전역 클래스 리스트(globalNames)를 만든다
  //    (참조 순서: TYPE_CLASS_SCHEMES 선언 순서 그대로 순회)
  // 3) boxOf(item, globalNames) 가 각 샘플의 박스 배열을
  //    [{ classIndex, cx, cy, w, h }] 형태로 반환(정규화 좌표)
  // 4) 80/10/10 셔플+split, images/labels 폴더, dataset.yaml(names: globalNames),
  //    metadata.json(+ 샘플별 classCounts), README.txt 작성 후 zip 다운로드
}
```

`labelLines()`는 더 이상 `0`을 하드코딩하지 않고 `boxOf`가 넘겨준 `classIndex`를 그대로 쓴다.

`metadata.json`의 각 항목에 `classCounts`(예: `{blue: 12, pink: 3}`) 필드를 추가해 데이터셋 균형을 바로 확인할 수 있게 한다.

### 5.3 신규 "PLATE SEGMENTATION" 탭 (고체배지)

"DRY MEDIA FILM SEGMENTATION" 카드와 동일한 패턴으로 신설:

- 전체 사진 업로드 → 캔버스 표시
- "자동 후보" — 기존 필름형태학습의 연결성분+겹침억제 후보 생성 로직을 재사용(클래스만 `film`→`plate`로)
- 수동 박스 추가/삭제/되돌리기
- 저장 → `makeDatasetStore('petricore_agar_plate_v1')`
- export → `exportYoloZip({..., classNames: ['plate'], zipNamePrefix: 'Petricore_Agar_Plate_Detector_Dataset_'})`

이 탭이 쌓는 데이터가 향후 `agar_plate.onnx`(가칭) 학습에 쓰이며, 학습 후엔 필름 쪽과 동일하게 "plate 검출 → crop → 콜로니 검출" 순서로 연결할 수 있다(연결 자체는 이번 스펙 범위 밖).

---

## 6. 내보내기 포맷 변경 요약

- `dataset.yaml`의 `names`가 더 이상 `{0: colony}` 고정이 아니라 §5.2의 동적 합집합 기반.
- `README.txt`에 이번엔 클래스별 의미를 사람이 읽을 수 있게 명시(예: "0=blue(E.coli), 1=pink(기타 대장균군)").
- `metadata.json`에 `classCounts` 추가.
- 기존 zip과의 호환성: 새 zip은 포맷이 다르므로(다중 클래스) 기존에 학습에 쓰던 파이프라인이 있다면 `dataset.yaml`을 다시 참조해야 함 — 이번 스펙에서 다루는 사항 아님(사용자가 외부 학습 시 인지).

---

## 7. 에러 처리

| 상황 | 처리 |
|---|---|
| `auto:false` 타입에서 미분류 콜로니가 남은 채 저장 시도 | 저장 버튼 비활성 + 안내 문구("모든 점을 효모/곰팡이로 분류해주세요") |
| EC pink 채널 게이트가 실사진에서 안 맞아 blue/pink 오분류 심함 | 자동판정은 참고용, 사용자가 태깅 UI로 즉시 수정 가능 — 자동판정 정확도는 이번 스펙의 하드 요구사항이 아니라 태깅 UI로 항상 보정 가능해야 함이 요구사항 |
| VRBA px 컷오프가 사진 해상도에 따라 부적절 | 컷오프 상수를 코드 한 곳(`hardMinDiameterPx` 계산부)에만 두어 나중에 쉽게 조정 |
| 공용 export 중 특정 샘플의 `image`/`label` 데이터 손상 | 해당 샘플만 건너뛰고 콘솔 경고, 나머지는 정상 export(기존 patterns대로 zip 전체를 막지 않음) |
| 새 Plate 탭에서 자동 후보가 0개 | 기존 필름형태학습과 동일하게 수동 박스만으로도 저장 가능하도록 안내 |

---

## 8. 테스트 전략

이 앱은 브라우저 전용 단일 HTML(빌드 없음, Node 테스트 하네스 없음 — 기존 `콜로니카운터 최종/` 폴더엔 `test/` 디렉터리가 없다). 순수 로직만 최소한으로 분리 검증한다:

- **수동 QA (브라우저)**: 타입별로 최소 1장씩 실제(또는 기존 데이터셋의) 사진을 올려 클래스 태깅 UI가 해당 타입의 클래스 버튼만 보여주는지, 자동판정이 색상 기반 타입에서 그럴듯한지, 형태 기반 타입은 미분류 상태로 저장이 막히는지 확인.
- **export 검증**: 서로 다른 클래스를 가진 샘플 여러 개를 저장한 뒤 export한 zip을 열어 `dataset.yaml`의 `names`, 각 `labels/*.txt`의 클래스 인덱스가 실제 태깅과 일치하는지 수동 확인.
- **VRBA 회귀 확인**: 예전 `고체배지/colony-counter-v2.html`에서 `vrbaCandidateClass`가 만들던 4단계 분포와, 이식 후 결과가 같은 입력(가능하면 같은 합성 이미지)에서 동일한 분류를 내는지 대조.
- 자동화 테스트 하네스(Node 등)를 이번에 새로 만들지는 않는다 — 이 앱은 지금까지도 수동 QA로 운영돼 왔고(YAGNI), 필요성이 커지면 별도 스펙으로 다룬다.

---

## 9. 비목표 / 향후

- 실제 모델 학습/ONNX 변환/추론 연결(사용자가 외부에서 진행).
- Plate 검출 모델이 생긴 뒤 VRBA mm 실측 스케일 자동 계산으로 전환.
- 형태 기반(YM/SDA) 자동 분류 알고리즘 — 데이터가 쌓인 뒤 모델이 학습.
- 기존 수집 데이터셋(59장/40장) 재라벨링.
- IndexedDB 4개 스토어를 하나의 DB/여러 objectStore로 더 합치는 것(지금은 dbName만 파라미터화하는 선에서 그침 — 과한 리팩터링 지양).
- 웹앱 디자인 개편(Claude Design, 별도 트랙).

## 10. 가정 / 열린 질문

- **가정**: `콜로니카운터 최종/` 폴더는 아직 git 추적 대상이지만 별도 브랜치/워크트리 없이 `main`에서 바로 작업한다(이전의 필름배지 OpenCV 통합 브랜치는 폐기됨 — 이번 작업과 무관).
- **열린 질문 없음** — VRBA 스킴·사이즈 컷오프 처리 모두 사용자 확인 완료.
