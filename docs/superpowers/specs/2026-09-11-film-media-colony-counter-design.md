# 필름배지 콜로니 카운터 — 이상적 통합 도구 설계

- 날짜: 2026-09-11
- 상태: 설계 승인 대기 (사용자 검토 중)
- 대상 산출물: `필름배지/index.html` (단일 파일) + `필름배지/vendor/` (선택적 로컬 라이브러리)
- 접근법: **A — `Petricore_Colony_Counter_최종`을 기반으로 증분 확장**

---

## 1. 목적

건조필름배지(3M Petrifilm / Petricore) 사진에서 콜로니를 자동 검출해 CFU를 계산하고,
상단 라벨(Type · Lot No · Bacteria · No. · Dilute)을 OCR로 인식해 표로 정리하는
브라우저 단독 도구. 서버 없음, 모든 분석은 클라이언트에서 실행, `file://` 더블클릭으로
동작하며 나중에 `필름배지/` 폴더를 그대로 GitHub Pages에 올릴 수 있는 구조.

이 도구는 **고체배지(한천 평판) 카운터(`고체배지/`)와 별개**다. 배지 종류·검출 방식·UI가
완전히 다르므로 한 파일로 합치지 않는다.

---

## 2. 배경 — 기존 세 파일과 통합 근거

| 파일 | 정체 |
|---|---|
| `필름배지/Petricore-Colony-Counter.html` | 원본 |
| `필름배지/Petricore_Colony_Counter_최종.html` | 위 파일 + CSS 색상만 교체 (JS 완전 동일, 담청/청회색 플랫 테마) |
| `필름배지/Petrifilm Colony Counter v2.2.html` | 별개의 구버전 아키텍처 (번들 압축, 컴포넌트 클래스 스타일, 해시체인 원장) |

기존 도구별 강점/약점:

- **Petricore (원본 = 최종)**: 페이지→낱장 분할이 정교(격자 주기성 분석, 격자선 카운팅,
  종횡비 conform, 콘텐츠 트림). 콜로니 색상 분류(red/blue) 및 CFU(R)/CFU(B) 분리 집계.
  단점: OCR이 약하고 실패 시 `'AC'`/`'BC'` 를 조용히 주입하며 그 값이 검토 플래그로도
  안 잡힘. 영속성 전무(새로고침 시 작업 소실).
- **v2.2**: OCR이 견고(다중 PSM 시도·최고점 채택, Levenshtein 퍼지매칭, 숫자혼동 교정,
  약신뢰 플래그, 직전 행 상속, 모르는 값을 지어내지 않음). 유채색 잉크마스크(중성 회색
  스캐너 잡티 제외), 사용자 분리모드, 계수 기준 프리셋, 해시체인 원장·verify·영속화.
  단점: 콜로니 색상 분류를 버림(단일 CFU 숫자만). 분할 알고리즘이 Petricore보다 단순.

통합 방침: **디자인 껍데기와 분할·검출은 Petricore(최종), OCR·원장·영속화·분리모드·계수
프리셋은 v2.2.** 엔진 파사드(opencv/ai/hybrid)나 어노테이션 export 같은 고체배지 쪽
확장 아키텍처는 도입하지 않는다("3파일 병합 집중 + 정직한 실패 원칙").

---

## 3. 범위

### 포함 (In)

- `최종` 파일의 모든 화면·기능 유지: 메인 데이터 표, 읽기전용 사진 뷰어, 콜로니 편집
  모달(추가/삭제/이동, 재검출 슬라이더, 되돌리기/다시실행), Excel 내보내기, 이미지 ZIP
  일괄 저장, 다크모드, 검색/Type 필터/페이지네이션, PDF 입력.
- OCR 파이프라인 전면 교체(v2.2 이식). `'AC'`/`'BC'` 자동주입 제거.
- `splitPanels()` 앞단에 유채색 잉크마스크 전처리 추가.
- 분리모드 UI: `자동(normal) / 붙어있는 시트(small) / 끔(off)`.
- 해시체인 원장 모듈: 모든 변경 이벤트 기록, `verify()`, 원장 JSON 내보내기/가져오기,
  체인 검증 화면.
- localStorage 영속화: 썸네일 + 정규화 좌표 기반, 새로고침 자동 복원.
- 계수 기준 프리셋: AOAC 표준 / 넓게 / 엄격.
- 라이브러리 로딩: v2.2식 env-probe + `./vendor/` 로컬 폴백 + CDN 폴백 + 환경 점검 모달.
- 빌드 없이 실행 가능한 순수 함수 테스트 하네스.

### 제외 (Out)

- 엔진 파사드(opencv/ai/hybrid), AI 후크, ONNX/모델 연동.
- 어노테이션(마스크) export, 데이터셋 레이아웃.
- 작업자 서명 게이트(actor gate).
- 내보낸 Excel/이미지에 제로폭 지문 워터마크.
- 고체배지 관련 일체(별도 트랙, 현재 보류).
- 균종 동정 관련 문구 일체.

---

## 4. 산출물 & 파일 배치

```
필름배지/
├─ index.html            ← 신규 통합 도구 (단일 파일, 모든 CSS+JS 인라인)
├─ vendor/               ← (선택) 오프라인용 라이브러리 사본
│  ├─ xlsx.full.min.js
│  ├─ pdf.min.js
│  ├─ pdf.worker.min.js
│  ├─ tesseract.min.js
│  └─ jszip.min.js
├─ test/
│  └─ run.mjs            ← 순수 함수 테스트 (node --test)
├─ Petricore-Colony-Counter.html          (보존, 미변경)
├─ Petricore_Colony_Counter_최종.html     (보존, 미변경 — 기준 원본)
└─ Petrifilm Colony Counter v2.2.html     (보존, 미변경 — OCR/원장 이식원)
```

`vendor/` 가 없어도 인터넷이 되면 CDN으로 동작한다. `vendor/` 를 채우면 완전 오프라인 동작.

---

## 5. 아키텍처

### 5.1 모듈 맵 (index.html 내 주석 구획)

`최종` 파일의 `/* ===== js/xxx.js ===== */` 구획 관례를 유지한다.

| 구획 | 출처 | 변경 |
|---|---|---|
| `js/state.js` | 최종 | **확장** — `events`, `splitMode`, `rangePreset` 필드 추가 |
| `js/ledger.js` | v2.2 이식 | **신규** — 해시체인 이벤트 로그 |
| `js/detector.js` | 최종 | 미변경 |
| `js/inkMask.js` | v2.2 이식 | **신규** — 유채색 잉크마스크 |
| `js/panelSplitter.js` | 최종 | **확장** — 마스크 생성부를 `buildInkMask()` 호출로 교체, `small` 모드 추가 |
| `js/ocr.js` | v2.2 이식 | **전면 교체** |
| `js/pdfLoader.js` | 최종 | 미변경 |
| `js/persistence.js` | v2.2 개념 이식 | **신규** — 직렬화/복원 |
| `js/simpleViewer.js` | 최종 | 미변경 |
| `js/editor.js` | 최종 | **훅 추가** — 변경 확정 시 `ledger.commit()` 호출 |
| `js/table.js` | 최종 | **훅 추가** — 메타 셀 수정/행 삭제 시 `ledger.commit()` 호출 |
| `js/exporter.js` | 최종 | **확장** — 내보내기 시 `EXPORT` 이벤트, 원장 JSON 내보내기/가져오기 |
| `js/main.js` | 최종 | **배선** — env-probe, 원장 모달, 분리모드/계수 프리셋 UI, 복원 |

각 신규/확장 모듈은 하나의 목적만 갖고 잘 정의된 인터페이스로 통신한다:

- `ledger.js`: 순수 함수(`h128`, `hashOf`, `verify`) + `ledger` 객체(`commit`, `push`,
  `tip`, `exportJSON`, `importJSON`). 의존성: `state.events`, `persistence.save`.
- `inkMask.js`: `buildInkMask(canvas, opts) -> Uint8Array`. 순수, DOM 캔버스만 의존.
- `persistence.js`: `serializeState()`, `hydrateState(raw)`, `save()`, `load()`.
  의존성: `state`, `thumbToCanvas`.
- `ocr.js`: `parsePetrifilmOCR(panelCanvas, labelHeightRatio) -> OcrResult`. + 파서
  순수 함수(`parsePrinted`, `parseHand`, `fixDigits`, `closest`, `lev`).

### 5.2 라이브러리 로딩 (env-probe)

v2.2 `probeAll()` 이식.

```
LIBS = [
  { key:'xlsx',      test:()=>typeof XLSX!=='undefined',      file:'xlsx.full.min.js',
    cdn:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' },
  { key:'pdfjs',     test:()=>typeof pdfjsLib!=='undefined',  file:'pdf.min.js',
    cdn:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' },
  { key:'tesseract', test:()=>typeof Tesseract!=='undefined', file:'tesseract.min.js',
    cdn:'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js' },
  { key:'jszip',     test:()=>typeof JSZip!=='undefined',     file:'jszip.min.js',
    cdn:'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js' },
]
```

절차 (라이브러리별):
1. `test()` 통과 → 상태 `cdn` 또는 `local` (이미 있음), 다음으로.
2. `location.protocol === 'file:'` 이면 vendor HEAD 체크 건너뜀 → 3으로.
3. `fetch('./vendor/<file>', {method:'HEAD'})` 성공 → `loadScript('./vendor/<file>')` →
   `test()` 통과 시 `local`.
4. 아니면 `loadScript(cdn)` → `test()` 통과 시 `cdn`, 실패 시 `none`.
5. pdf.js 로드되면 `pdfjsLib.GlobalWorkerOptions.workerSrc` 를 local/cdn 에 맞게 설정.

환경 점검 모달: 최초 1회 자동, 이후 헤더 버튼으로. 각 라이브러리의 상태(local/cdn/none)와
해당 기능 가용 여부 표시. `tesseract === 'none'` 이면 OCR 버튼은 남기되 실행 시 파일명·직전
값 폴백 경로로 진입하고 노란 셀로 표시.

---

## 6. 상태 모델

전역 `state` (최종 `js/state.js` 확장):

```
state = {
  records: [],        // 아래 레코드 구조
  events: [],          // ★신규 — 원장 이벤트 배열
  activeIndex: null,   // 메인 뷰어에 표시 중인 레코드
  editIndex: null,     // 편집 모달에서 편집 중인 레코드
  viewer: null,        // SimpleViewer 인스턴스
  editor: null,        // ColonyEditor 인스턴스
  splitMode: 'normal', // ★신규 — 'normal' | 'small' | 'off'
  rangePreset: 'aoac'  // ★신규 — 'aoac' | 'wide' | 'strict'
}
```

레코드 (메모리 표현 — 최종과 동일, 좌표는 **절대 px**):

```
{
  id, filename,
  canvas,               // HTMLCanvasElement (원본 or 썸네일 복원본)
  lowRes: false,        // ★신규 — 썸네일에서 복원되었으면 true
  imgW, imgH,           // ★신규 — 원본(또는 복원 기준) 픽셀 크기
  type, lot, bacteria, no, dilute,
  rotation,
  colonies: [{x, y, radius, color:'red'|'blue'}],   // 절대 px
  autoColonies: [...],
  labelHeightRatio, sensitivity, minArea, colorMode,
  selected, needsReview: {type, lot, bacteria, no, dilute},  // bool 맵
  rawHandwriting, rawPrinted,
  ocrSource: {type, lot, bacteria, no, dilute},     // ★신규 — 'ocr'|'file'|'prev'|'' 출처
  historyPast: [], historyFuture: []                // per-record undo (최종 그대로)
}
```

`historyPast/historyFuture` 는 편집 모달 내 되돌리기용으로 그대로 유지한다. 이는
전역 원장(append-only)과 **별개**이며 서로 간섭하지 않는다.

---

## 7. 원장 (`js/ledger.js`)

v2.2 해시체인을 이식하되 actor/서명 요소를 제거한다.

### 7.1 해시

```
GEN       : 제네시스 해시 (문자 "0" 32개)
SEP       : 필드 구분자 문자열 (v2.2와 동일한 값 사용)
h128(s)   : FNV 계열 128비트 해시 (v2.2 코드 그대로)
hashOf(e) : h128( [e.prev, e.seq, e.ts, e.kind, JSON.stringify(e.payload)].join(SEP) )
```

> v2.2 대비 차이: `hashOf` 입력에서 `e.actor` 필드를 제거한다.

### 7.2 이벤트

```
{ seq, ts, kind, payload, prev, hash }
```

| kind | 발생 시점 | payload 핵심 |
|---|---|---|
| `PLATE_ADD` | 낱장 레코드 생성 | `{id, filename, type, lot, bacteria, no, dilute, count, w, h, thumb, pts}` |
| `COUNT_SET` | 콜로니 추가/삭제/이동/재검출 확정 | `{id, from, to, how:'add'|'delete'|'move'|'redetect'|'restore', pts}` |
| `META_SET` | Type/Lot/Bacteria/No/Dilute 값 변경 | `{id, field, from, to}` |
| `OCR_READ` | OCR 적용 | `{id, read:{...}, source:{...}, missing:[...], raw}` |
| `PLATE_DEL` | 레코드 삭제 | `{id, filename, count}` |
| `EXPORT` | Excel/ZIP/원장 내보내기 | `{what:'xlsx'|'zip'|'ledger', count}` |
| `IMPORT_ACK` | 원장 가져오기 성공 | `{events, verifiedTip}` |

`pts` 는 정규화 좌표 `[[x,y],...]` (소수 4자리). 편집 확정 단위로만 기록(드래그 중 X).

### 7.3 API

```
ledger.push(kind, payload, list?) -> list      // 이벤트 배열에 append, hash 계산
ledger.commit(kind, payload)                    // push + state.events 갱신 + persistence.save()
ledger.tip(list?) -> hash
ledger.verify(events) -> { ok: bool, at: seq }  // 깨진 위치
ledger.exportJSON() -> Blob                     // { v, events, exportedAt }
ledger.importJSON(text) -> { ok, at, events }   // verify 후 반환 (적용은 호출측 확인 후)
```

### 7.4 훅 지점

| 파일 | 함수 | 호출 |
|---|---|---|
| `main.js` | 낱장 레코드 생성 루프 | `PLATE_ADD` |
| `editor.js` | `commitEditorChanges()` / 재검출 / 자동복원 | `COUNT_SET` |
| `table.js` | 편집 가능 셀 blur 시 값 변경 | `META_SET` |
| `editor.js` | 메타 입력 필드 변경 | `META_SET` |
| `ocr.js` 적용부(`main.js`) | OCR 결과 반영 | `OCR_READ` |
| `table.js` / `main.js` | 행 삭제 / 선택 삭제 | `PLATE_DEL` (건별) |
| `exporter.js` | 각 내보내기 성공 | `EXPORT` |

### 7.5 원장 화면 (신규 모달)

- 이벤트 목록: `seq · HH:MM:SS · kind · 한 줄 요약`
- `verify()` 결과 배지: `정상` 또는 `seq N에서 체인 불일치`
- 버튼:
  - **원장 내보내기** → `<실험명 or petricore>_ledger_<ts>.json` 다운로드 + `EXPORT` 이벤트
  - **원장 가져오기** → 파일 선택 → `importJSON()` → verify OK면 "현재 세션을 이
    원장으로 대체합니다(레코드 N개 재구성)" 확인 → 대체. verify 실패면 불일치 seq 표시 후 거부
  - **다시 검증** → `verify()` 재실행
- 가져오기 재구성: `PLATE_ADD` payload의 `thumb`/`pts`/메타로 레코드 복원 →
  이후 `COUNT_SET`/`META_SET`/`OCR_READ` 순차 적용 → `PLATE_DEL` 반영. (v2.2 rebuild 방식)

---

## 8. 영속화 (`js/persistence.js`)

### 8.1 저장 포맷

localStorage 키: `petricore.film.v1`

```
{
  v: 1,
  savedAt: ISO8601,
  splitMode, rangePreset,
  records: [ SlimRecord... ],
  events: [ ... ]                 // 원장 원문
}
```

`SlimRecord` — 원본 캔버스 대신 썸네일, 좌표는 정규화:

```
{
  id, filename, type, lot, bacteria, no, dilute,
  rotation, sensitivity, minArea, colorMode, labelHeightRatio,
  imgW, imgH,
  thumb,                          // dataURL, 최대 변 ~600px, image/jpeg 0.76
  colonies: [[x, y, r, c]],       // 정규화 0~1, 소수 5자리, c: 0=red 1=blue
  needsReview, ocrSource,
  rawHandwriting, rawPrinted
}
```

`autoColonies`, `historyPast/Future` 는 저장하지 않는다(세션 한정).

### 8.2 직렬화/복원

- `serializeState()`: 각 레코드에 대해 `thumbOf(record.canvas, 600)` 로 썸네일 생성,
  콜로니 좌표를 `imgW/imgH` 로 나눠 정규화, `SlimRecord` 배열 구성.
- `hydrateState(raw)`: 각 `SlimRecord` 에 대해
  - `thumbToCanvas(thumb)` → 캔버스(썸네일 해상도). `record.canvas = 그 캔버스`,
    `record.lowRes = true`, `record.imgW/imgH` 는 원본 값 유지.
  - 콜로니 좌표를 `imgW/imgH` 로 곱해 절대 px 복원 → 단, 캔버스가 썸네일 해상도이므로
    **뷰어/에디터 렌더 시점의 스케일 계산은 `canvas.width/imgW` 비율을 곱한다**.
  - 대안(단순): 복원 시 좌표를 `canvas.width/canvas.height`(썸네일) 기준 절대 px으로
    바로 환산. 이 경우 `imgW/imgH` 는 표시용 메타로만 사용. **→ 이 방식 채택**(렌더 코드
    무수정). 재검출은 썸네일 해상도에서 수행되며 정확도 제한 배지로 고지.
- `save()`: `try/catch`, `QuotaExceededError` 시 토스트 "저장 공간 부족 · 원장을
  내보내 주세요", 저장 자체는 다음 변경 때 재시도(플래그 없음).
- `load()`: `DOMContentLoaded` 에서 호출. 데이터 있으면 복원 후 `refreshTable()`.
  `lowRes` 레코드는 표/뷰어에 "썸네일 복원 · 재검출 정확도 제한" 배지.

### 8.3 이벤트 vs 레코드 정합성

원장이 진실의 원천에 가깝다. `save()` 는 records와 events를 함께 저장하지만, 가져오기
시에는 events로부터 records를 재구성한다(8.1의 `pts`/`thumb` 가 `PLATE_ADD` payload에
있으므로 가능).

---

## 9. 검출 파이프라인

### 9.1 잉크마스크 (`js/inkMask.js`)

```
buildInkMask(canvas, { whiteThreshold = 232, chroma = 12 }) -> Uint8Array (w*h, 0|1)
```

규칙 (v2.2 `inkMask` 이식, 다운스케일 없이 원해상도):
1. 각 픽셀 `max = max(R,G,B)`, `min = min(R,G,B)`.
2. `raw = (max - min > chroma) || (max < whiteThreshold) ? 1 : 0`
   — 유채색(연녹 격자 포함)이거나 어두운 픽셀만 잉크. 무채색 밝은 스캐너 잡티는 0.
3. 3×3 다수결 필터: 이웃 9픽셀 중 `raw` 합이 3 이상일 때만 최종 1.

### 9.2 panelSplitter 확장

- `splitPanels(canvas, sizeHint)`:
  - 현재 초기 마스크 블록(`gray < 246`)을 `buildInkMask(canvas)` 호출로 교체.
  - `trimToContent()` 내부 마스크도 `buildInkMask` 로 교체(임계값 동일).
  - `sizeHint === 'off'` → `[canvas]` (기존).
  - `sizeHint === 'small'` (붙어있는 시트): `splitAxis` 호출 시 `minSegFrac` 를
    0.05 → 0.035, 주기성 `sens` 를 0.09 → 0.07, valley 상대임계를 강화(v2.2 `tight`
    계수 `rel 0.52 → 0.70`, `minW` 비율 축소). 나머지 로직 공유.
  - `sizeHint === 'normal'` → 현재 동작 그대로.
- 업로드 후 조각 중 `width/height > 1.5` 가 있으면 토스트: "일부 시트가 붙어 있을 수
  있습니다 · 분리 모드를 '붙어있는 시트'로 바꿔 다시 올려보세요".

### 9.3 OCR 전면 교체 (`js/ocr.js`)

v2.2 파이프라인을 이식. 최종 파일의 공개 시그니처 유지:

```
parsePetrifilmOCR(panelCanvas, labelHeightRatio = 0.12) -> {
  type, lot, bacteria, no, dilute,           // 못 찾으면 '' (빈 값)
  weak: { bacteria: bool },                    // 낮은 신뢰
  rawHandwriting, rawPrinted
}
```

**워커:** `Tesseract.createWorker('eng')` 1개, 모듈 스코프에 캐시, 페이지 unload 시
`terminate()`.

**전처리 `prep(src, x, y, w, h)`** (v2.2 이식):
1. 영역 크롭 후 2~5배 업스케일(`Math.max(2, Math.min(5, 900/cw))`).
2. 초록 격자선 제거: `G > R+8 && G > B+16` 인 픽셀 → 255(흰색), 나머지는
   가중 그레이(`R*0.35 + G*0.35 + B*0.3`).
3. Otsu 임계 계산 → `cut = min(238, th + 14)` 로 이진화.

**영역 & PSM:**
- 인쇄(우상단): `prep(src, 0.42, 0, 0.58, band)`, PSM `['6','4']` 시도 →
  `parsePrinted()` 점수(`type?1:0 + lot?2:0`) 최고값 채택.
- 수기(좌상단): `prep(src, 0, 0, 0.48, band)`, PSM `['11','6']` 시도 →
  `parseHand()` 점수 최고값 채택.
- `band = max(0.16, labelHeightRatio + 0.04)`.
- 문자 화이트리스트: `A-Za-z0-9-/ `.

**파서 (순수 함수, 테스트 대상):**
- `lev(a,b)` Levenshtein 거리.
- `closest(tok, list)` — `bd <= (tok.length<=2 ? 0 : 1)` 이내면 매칭.
  - `KNOWN_TYPES = ['AC','EC','YM','SA','CC','AP','EB','TC','RYM','STX']`
  - `KNOWN_STRAINS = ['AC','CC','EC','YM','SA','BC','LM','ST','EB','PA','KP','SE']`
- `fixDigits(s)` — 숫자에 인접한 `O→0`, `I→1`, `S→5`.
- `parsePrinted(text)` → `{type, lot}`. `PETRI\S*\s+([A-Z]{2,3})` 우선, 없으면
  `closest()` 로 타입 추정. Lot = 6자 이상 영숫자 혼합 토큰 중 마지막, `PETRI` 시작 제외,
  `fixDigits` 적용.
- `parseHand(text)` → `{bacteria, no, dilute, weak}`. 균주는 `closest()` 매칭,
  실패 시 첫 토큰 3자 + `weak`. `no`/`dilute` 는 `(\d)[-–—~/](\d)` 패턴 우선,
  없으면 숫자 나열 앞/뒤.

**적용 규칙 (`main.js`) — 정직한 실패:**
필드별로 (type, lot, bacteria, no, dilute):
1. OCR 값 있으면 사용, `ocrSource[field] = 'ocr'`.
2. 없고 파일명 추정값(`guessMeta`) 있으면 사용, `ocrSource[field] = 'file'`.
3. 없고 직전 행에서 상속 가능(type/lot/bacteria 한정)하면 사용, `ocrSource[field] = 'prev'`.
4. 모두 없으면 빈 값, `ocrSource[field] = ''`.
5. `needsReview[field] = (값이 비었거나) || (weak[field]) || (ocrSource[field] !== 'ocr')`.
   → **`'AC'`/`'BC'` 등 임의 기본값 주입 없음. `type||'AC'` 패턴 제거.**
6. `OCR_READ` 이벤트 커밋.

**OCR 라이브러리 없음:** `parsePetrifilmOCR` 진입 전에 `typeof Tesseract === 'undefined'`
확인 → 즉시 `{모든 필드 '', rawHandwriting:'(OCR 없음 · 파일명/직전값 추정)'}` 반환,
적용 규칙 2~4로 채우고 전 필드 `needsReview`.

### 9.4 색상 검출 (변경 없음)

최종 `js/detector.js` 의 `detectColonies(imageSource, {colorMode})` 를 그대로 사용.
콜로니별 `color: 'red'|'blue'`, CFU(R)/CFU(B) 분리 집계·표시·뷰어 색 구분 유지.

---

## 10. UI 변경점

기존 화면 레이아웃(헤더 / 통계 타일 / 좌측 업로드+표 / 우측 뷰어 / 편집 모달)은
`최종` 그대로. 아래만 추가:

1. **분리모드 셀렉트** — 업로드 드롭존 우측. `자동 / 붙어있는 시트 / 끔`. `state.splitMode`
   갱신, 다음 업로드부터 적용.
2. **계수 기준 프리셋 셀렉트** — 헤더 우측(테마토글 왼쪽). `AOAC 표준(25–250) /
   넓게(15–300) / 엄격(30–300)`.
   - `RANGE_PRESETS = { aoac:[25,250], wide:[15,300], strict:[30,300] }`
   - 편집 모달의 범위바(`emRangeFill`)·라벨(`emRangeLabel`)이 이 값 사용.
   - 메인 표에서 CFU 합이 범위를 벗어난 행은 CFU 셀에 옅은 경고색.
3. **원장 버튼** — 헤더, `⛓ 원장`. 9.5의 모달 오픈.
4. **정직한 실패 표시:**
   - 노란 `needs-review` 셀: 기존 CSS(`.editable-cell.needs-review`) 재사용.
   - OCR 원문칸(`emOcrRaw`)에 `인쇄 | 수기` 원문 그대로 노출(기존 유지).
   - 저해상도 복원 배지: 표 행과 뷰어 헤더에 작은 회색 칩 "썸네일 복원".
   - 원장 verify 실패: 상단 고정 경고 배너 + 원장 버튼 빨강 점.
5. **환경 점검 모달** — 라이브러리 상태 표(local/cdn/none).

색상 팔레트·타이포·컴포넌트 스타일은 `최종`의 담청/청회색 토큰을 그대로 쓴다.

---

## 11. 에러 처리

| 상황 | 처리 |
|---|---|
| 이미지 로드 실패 | 토스트 `<파일명> · 읽기 실패`, 해당 파일 건너뜀, 나머지 계속 |
| PDF 파싱 실패 / pdf.js 없음 | 토스트, 해당 파일 건너뜀 |
| 분할 결과 0장 또는 40장 초과 | 원본 1장으로 폴백(`return [canvas]`, 기존 로직) |
| OCR 워커 생성 실패 | `try/catch` → 파일명·직전값 폴백, 전 필드 `needsReview` |
| `localStorage` 초과 | 토스트 안내, 저장 스킵, 다음 변경 때 재시도 |
| 원장 가져오기 verify 실패 | 적용 거부, 모달에 `seq N 불일치` 표시 |
| 좌표 정규화 왕복 오차 | 저장 시 소수 5자리 반올림으로 고정 |
| 회전(rotation) 후 저장 | 정규화 좌표는 회전 적용 후 기준으로 저장, `rotation` 값도 함께 |

토스트/모달 문구는 한국어, 균종 동정 뉘앙스 배제.

---

## 12. 테스트 전략

빌드 없음 유지. 단일 파일 앱은 그대로 두고, 순수 로직만 분리 검증.

### 12.1 하네스 (`필름배지/test/run.mjs`)

- `index.html` 를 읽어 `/* ===== js/ledger.js ===== */` 등 주석 마커로 구획을 슬라이스.
- 대상 구획 소스를 `node:vm` 컨텍스트에서 평가(가벼운 `document`/`canvas` 스텁 주입).
- `node:test` + `node:assert` 로 검증. 실행: `node --test 필름배지/test/`.
- 코드 중복·드리프트 없음(항상 index.html 원문에서 추출).

### 12.2 커버리지 (순수 함수)

- `ledger`: `h128` 결정성, `push` 체인 연결, `verify` 정상/변조 탐지(중간 payload 수정 시
  `at` 정확), `GEN` 시작.
- `ocr` 파서: `lev`, `closest`(2자 이하 정확일치, 3자↑ 1편집), `fixDigits`(숫자 인접
  조건), `parsePrinted`(PETRI 접두 / 퍼지 / Lot 마지막 토큰), `parseHand`(대시 구분 /
  숫자 나열 / weak 플래그).
- `inkMask`: 무채색 밝은 픽셀 0, 연녹/어두운 픽셀 1, 고립 픽셀 다수결 제거.
- CFU 계산: `formatConcentration` 지수 표기, 0/음수 방어.
- 좌표 정규화: 절대→정규화→절대 왕복 오차 ≤ 1px(5자리 반올림 기준).

### 12.3 합성 픽스처

`makeSyntheticFilm({rows, cols, redDots, blueDots, label})` — 격자 + 색점 + 라벨
텍스트를 그린 캔버스 반환. 고체배지 도구의 `generateSyntheticPlate` 와 유사한 접근.
- `splitPanels` 가 `rows*cols` 장으로 분할하는지.
- `detectColonies` 가 색점 수를 ±10% 내로 세는지.

### 12.4 수동 QA 체크리스트 (스펙에 포함, DOM 의존부)

1. 단일/다중 배지 사진 업로드 → 분할 장수 확인.
2. `붙어있는 시트` 모드로 재업로드 → 분할 개선 확인.
3. 콜로니 편집(추가/삭제/이동) → 표 CFU 즉시 갱신, 되돌리기/다시실행.
4. 라벨 OCR 실행 → 인식/미인식 필드 노란 셀, 원문 표시, `'AC'/'BC'` 자동주입 없음 확인.
5. Excel 내보내기 / 이미지 ZIP → `EXPORT` 이벤트 기록 확인.
6. 새로고침 → 레코드·원장 복원, 저해상도 배지 표시.
7. 원장 화면 → verify 정상, 내보내기 → 다른 브라우저에서 가져오기 → 레코드 재구성.
8. 원장 JSON을 수동 변조 후 가져오기 → 불일치 seq 표시 + 거부.
9. 다크모드 토글, 검색/필터/페이지네이션.
10. `vendor/` 제거 후 `file://` 실행 → CDN 폴백; 오프라인 + `vendor/` → 완전 동작.

---

## 13. 비목표 / 향후

- AI 검출·엔진 파사드·어노테이션 export 는 이 도구에 넣지 않는다. 필요해지면 별도 설계.
- 고체배지 도구와의 코드 공유는 하지 않는다(배지 특성이 달라 공통화 이득이 작다).
- 다국어 라벨(한글 인쇄 라벨) OCR 은 범위 밖(현 라벨은 영숫자).

---

## 14. 가정 / 열린 질문

- **가정:** 현재 `필름배지/` 는 git 저장소가 아니다. 이 설계 문서는 파일로만 저장하며,
  사용자가 원하면 이후 `git init` + 커밋한다.
- **가정:** 라벨 레이아웃은 v2.2 전제와 동일 — 우상단 인쇄(제품명+Lot), 좌상단 수기
  (균주 + 반복수-희석수).
- **열린 질문:** 계수 기준 `엄격` 범위를 `[30,300]` 로 두었는데, 실험실 SOP에 맞는
  값이 따로 있으면 알려주세요(코드 상수 한 곳 수정).
- **열린 질문:** 메인 표 Type 필터 옵션을 현행 `AC/EC/YM` 고정으로 둘지, `KNOWN_TYPES`
  전체로 늘릴지. 기본은 현행 유지.
