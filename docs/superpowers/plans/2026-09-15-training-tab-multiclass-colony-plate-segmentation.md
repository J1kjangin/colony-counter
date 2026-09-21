# 학습탭 확장 — 타입별 콜로니 클래스 + 고체배지 Plate 범위 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `콜로니 카운터 ai 연결.html`의 학습탭이 10개 배지 타입(건조필름배지 AC/EC/CC/YM/EB, 고체배지 TSA/PCA/VRBA/TBX/SDA) 각각의 실제 계수 규칙에 맞는 다중 클래스 YOLO 학습 데이터를 뽑을 수 있게 만들고, 고체배지에 없던 plate(배지 원판) 범위 검출용 학습탭을 신설한다.

**Architecture:** 기존 3벌 복붙된 IndexedDB 저장/YOLO export 로직을 공용 헬퍼(`makeDatasetStore`, `exportYoloZip`)로 먼저 통합한 뒤, 그 위에 타입별 클래스 스킴(`TYPE_CLASS_SCHEMES`)과 클래스 태깅 UI를 얹는다. 건조필름배지(R/G/B 채널 마스킹 엔진)와 고체배지(배경대비 블롭탐지 엔진)는 서로 다른 검출 엔진이라 색상/분류 로직은 트랙별로 별도 구현하되, 저장/export 인프라와 클래스 스킴 데이터는 공유한다.

**Tech Stack:** 순수 브라우저 JS(단일 HTML, IIFE 다발), 빌드 없음. 외부 라이브러리(이미 로드됨, 변경 없음): JSZip 3.10.1, ONNX Runtime Web 1.29.0(필름 검출 전용, 이번 작업과 무관).

**Spec:** `docs/superpowers/specs/2026-09-15-training-tab-multiclass-colony-plate-segmentation-design.md` (2026-09-15 수정본 — TBX 반영판)

## Global Constraints

- 대상 파일은 오직 `콜로니카운터 최종/콜로니 카운터 ai 연결.html` 하나. `콜로니 카운터 학습용.html`은 건드리지 않는다.
- 이 앱은 자동화 테스트 하네스가 없다(빌드 없음, `test/` 디렉터리 없음). 모든 검증은 **브라우저 수동 QA**로 한다 — 없는 테스트 프레임워크를 새로 끌어들이지 않는다(YAGNI, 스펙 §8과 동일).
- 고체배지 타입은 실제로 **TSA/PCA/VRBA/TBX/SDA/기타** 6개다(`NA`는 존재하지 않음). 건조필름배지 타입은 **AC/EC/CC/YM/EB/other** 6개다.
- 대소문자: 건조필름배지 타입 키는 대문자(`AC`,`EC`,...), 고체배지 타입 키는 소문자(`tsa`,`pca`,`vrba`,`tbx`,`sda`)다. `TYPE_CLASS_SCHEMES`는 각 트랙이 실제 쓰는 대소문자 그대로 키를 둔다.
- CLAUDE.md 원칙("단일 조건 하드 임계값 금지")은 유지하되, **VRBA 사이즈 컷오프**와 **TBX 색상 게이트**는 사용자가 명시적으로 요청한, 코드 주석으로 근거를 남긴 **국소적 예외**다 — 다른 타입/로직으로 확대하지 않는다.
- 기존 4개 IndexedDB DB명(`petricore-agar-dataset-v1`, `petricore-drymedia-dataset-v1`, `petricore-drymedia-film-dataset-v1`, 신규 plate용)은 하위호환을 위해 그대로 유지한다.
- 기존에 모아둔 데이터셋(고체배지 59장, 건조필름배지 zip)은 재라벨링하지 않는다.
- 커밋 메시지 트레일러: 빈 줄 다음 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- 이 저장소는 git 저장소이며 현재 `main` 브랜치, 워킹트리 클린 상태에서 시작한다(별도 브랜치/워크트리 지시는 없음 — 바로 `main`에서 작업).

---

## 파일 구조

전부 한 파일 `콜로니카운터 최종/콜로니 카운터 ai 연결.html` 안에서 작업한다. 구획별 책임:

| 구획(대략적 위치, 태스크 진행에 따라 이동함 — 항상 grep으로 재확인) | 책임 |
|---|---|
| 원본 Petricore 코드 섹션(`function detectColonies`, `function buildMask(data,w,h,labelPx,gate,channel)`, 약 1200~1330행) | 건조필름배지 색상 채널 검출 엔진 |
| `class ColonyEditor`(약 2299행~) | 건조필름배지 메인 편집 UI — 점 추가/삭제/이동, 색상모드 버튼 |
| Agar IIFE(`(function(){` 약 3493행, `const PROFILES=...`로 시작) | 고체배지 배경대비 블롭탐지 + 학습 데이터 저장/export |
| Dry media colony IIFE(`(function(){` 약 3608행, `DB_NAME='petricore-drymedia-dataset-v1'`) | 건조필름배지 학습 데이터 저장/export(메인 테이블에서 현재 결과를 가져옴) |
| Dry media film-ai IIFE(약 3630행, `MODEL_DB = 'petricore-drymedia-film-model-v1'`) | ONNX 필름검출 모델 연결 — **이번 작업과 무관, 손대지 않음** |
| Dry media film-shape IIFE(약 3771행, `DB='petricore-drymedia-film-dataset-v1'`) | 필름 박스 annotation + export — 신규 Plate 탭의 템플릿 |

신규로 추가하는 것:

- `TYPE_CLASS_SCHEMES`(공용 데이터, 파일 앞쪽 아무 `<script>`에나 배치 — Task 1에서 위치 결정)
- `makeDatasetStore(dbName)`, `exportYoloZip({...})`(공용 인프라, 마찬가지로 전역에서 접근 가능한 위치)
- 신규 IIFE: Agar Plate Segmentation(필름-shape IIFE를 그대로 본뜬 구조)

---

## Task 1: 타입별 클래스 스킴 정의

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — `<head>` 안, 기존 `<script>` 태그들 중 아무 데나(예: `</head>` 바로 앞에 새 `<script>` 블록 추가) `TYPE_CLASS_SCHEMES`를 전역으로 선언.

**Interfaces:**
- Produces: `window.TYPE_CLASS_SCHEMES` — `{ [typeKey: string]: { classes: string[], basis: string, auto: boolean, hardMinDiameterPx?: number } }`. 이후 모든 태스크가 이 객체를 참조한다.
- Produces: `window.resolveClassScheme(typeKey)` — 스킴이 없으면(`other` 등) `{classes:['colony'], basis:'morphology', auto:true}` 폴백을 반환하는 헬퍼.

- [ ] **Step 1: `</head>` 바로 앞에 스크립트 블록 추가**

`콜로니 카운터 ai 연결.html`에서 `</head>`를 찾아 그 바로 앞에 삽입:

```html
<script>
// 타입별 콜로니 클래스 체계. 대소문자는 각 트랙이 실제 쓰는 키 그대로.
window.TYPE_CLASS_SCHEMES = {
  // 건조필름배지 (대문자 키)
  AC:   { classes: ['red'],                                       basis: 'color',      auto: true },
  EC:   { classes: ['blue', 'pink'],                               basis: 'color',      auto: true },
  CC:   { classes: ['red_purple'],                                 basis: 'color',      auto: true },
  YM:   { classes: ['yeast', 'mold'],                              basis: 'shape',      auto: false },
  EB:   { classes: ['red_purple'],                                 basis: 'color',      auto: true },
  // 고체배지 (소문자 키)
  tsa:  { classes: ['colony'],                                     basis: 'morphology', auto: true },
  pca:  { classes: ['colony'],                                     basis: 'morphology', auto: true },
  vrba: { classes: ['typical', 'possible', 'atypical', 'non_target'], basis: 'color_halo', auto: true, hardMinDiameterPx: 0 },
  tbx:  { classes: ['colony'],                                     basis: 'color_gate', auto: true },
  sda:  { classes: ['yeast', 'mold'],                              basis: 'shape',      auto: false },
};
const DEFAULT_CLASS_SCHEME = { classes: ['colony'], basis: 'morphology', auto: true };
window.resolveClassScheme = function resolveClassScheme(typeKey) {
  return window.TYPE_CLASS_SCHEMES[typeKey] || DEFAULT_CLASS_SCHEME;
};
</script>
```

- [ ] **Step 2: 브라우저 콘솔로 확인**

`콜로니 카운터 ai 연결.html`을 브라우저로 열고 개발자도구 콘솔에서:

```js
resolveClassScheme('EC')   // { classes: ['blue','pink'], basis:'color', auto:true }
resolveClassScheme('vrba') // { classes: ['typical',...], ... }
resolveClassScheme('zzz')  // { classes: ['colony'], basis:'morphology', auto:true } (폴백)
```

세 결과가 기대와 일치하는지 눈으로 확인.

- [ ] **Step 3: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat: 타입별 콜로니 클래스 스킴(TYPE_CLASS_SCHEMES) 추가"
```

---

## Task 2: 공용 데이터셋 저장소 + YOLO export 헬퍼 (동작 보존 리팩터)

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — Task 1 스크립트 블록 바로 뒤에 공용 헬퍼 추가, 그리고 3개 트랙(agar IIFE, drymedia-colony IIFE, drymedia-film IIFE)의 `openDB/dbAdd(또는 add)/dbGetAll(또는 all)/dbClear(또는 clearDB)` + `exportDataset` 함수들을 공용 헬퍼 호출로 교체.

**Interfaces:**
- Consumes: 없음(이 태스크는 순수 리팩터, `TYPE_CLASS_SCHEMES`는 아직 안 씀 — 클래스는 여전히 전부 `0`/`colony` 하나만, 동작 무변경)
- Produces:
  - `makeDatasetStore(dbName, storeName='samples') -> { add(item) -> Promise<id>, all() -> Promise<item[]>, clear() -> Promise<void> }`
  - `exportYoloZip({ items, classNames, boxOf, zipName, readmeText, extraMetaOf }) -> Promise<void>` — `items`는 이미 로드된 배열(호출측이 `store.all()`로 미리 가져옴), `boxOf(item) -> Array<{classIndex:number, cx:number, cy:number, w:number, h:number}>`(정규화 좌표), `extraMetaOf(item) -> object`(metadata.json에 병합할 추가 필드, 생략 가능). 80/10/10 split, `images/labels` 폴더, `dataset.yaml`(names: classNames), `metadata.json`, `README.txt` 작성 후 zip 다운로드까지 전부 수행.

이 태스크는 **동작을 하나도 바꾸지 않는** 리팩터다 — 클래스는 여전히 하드코딩된 하나뿐(agar/drymedia-colony는 `0:colony`, drymedia-film은 `0:film`). Task 3 이후에 이 위에서 다중클래스가 얹힌다.

- [ ] **Step 1: 공용 헬퍼 추가**

Task 1의 `<script>` 블록 바로 뒤에 새 `<script>` 블록 추가:

```html
<script>
function makeDatasetStore(dbName, storeName) {
  storeName = storeName || 'samples';
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(storeName)) {
          r.result.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbPromise;
  }
  return {
    add: item => openDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(storeName, 'readwrite');
      const r = tx.objectStore(storeName).add(item);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    })),
    all: () => openDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(storeName, 'readonly');
      const r = tx.objectStore(storeName).getAll();
      r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
    })),
    clear: () => openDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(storeName, 'readwrite');
      const r = tx.objectStore(storeName).clear();
      r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    })),
  };
}

async function exportYoloZip({ items, classNames, boxOf, zipName, readmeText, extraMetaOf }) {
  if (!window.JSZip) { alert('ZIP 모듈을 불러오지 못했습니다. 인터넷 연결 후 다시 시도해주세요.'); return; }
  if (!items.length) { alert('저장된 학습 데이터가 없습니다.'); return; }
  const zip = new JSZip();
  const roots = { train: zip.folder('images/train'), val: zip.folder('images/val'), test: zip.folder('images/test') };
  const labelRoots = { train: zip.folder('labels/train'), val: zip.folder('labels/val'), test: zip.folder('labels/test') };
  const meta = [];
  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < shuffled.length; i++) {
    const x = shuffled[i];
    const split = i < Math.ceil(shuffled.length * .8) ? 'train' : i < Math.ceil(shuffled.length * .9) ? 'val' : 'test';
    const base = String(i + 1).padStart(5, '0') + '_' + String(x.type || 'other').replace(/[^a-zA-Z0-9_-]/g, '_');
    const imgData = (x.image || '').split(',')[1] || '';
    roots[split].file(base + '.jpg', imgData, { base64: true });
    const boxes = boxOf(x) || [];
    const label = boxes.map(b => `${b.classIndex} ${b.cx.toFixed(6)} ${b.cy.toFixed(6)} ${b.w.toFixed(6)} ${b.h.toFixed(6)}`).join('\n');
    labelRoots[split].file(base + '.txt', label);
    const extra = extraMetaOf ? extraMetaOf(x) : {};
    meta.push(Object.assign({ uid: x.uid, type: x.type, filename: x.filename, width: x.width, height: x.height, split, createdAt: x.createdAt }, extra));
  }
  const namesYaml = classNames.map((n, i) => `  ${i}: ${n}`).join('\n');
  zip.file('dataset.yaml', `path: .\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n${namesYaml}\n`);
  zip.file('metadata.json', JSON.stringify(meta, null, 2));
  zip.file('README.txt', readmeText);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
</script>
```

- [ ] **Step 2: agar IIFE를 공용 헬퍼로 교체**

`콜로니 카운터 ai 연결.html`에서 agar IIFE(`const PROFILES={tsa:...`로 시작하는 `(function(){`) 안의 다음 줄들을 찾는다:

```js
  const DB_NAME='petricore-agar-dataset-v1', DB_STORE='samples';
  let dbPromise=null;
  function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE,{keyPath:'id',autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbPromise}
  async function dbAdd(item){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');const r=tx.objectStore(DB_STORE).add(item);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
  async function dbGetAll(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readonly');const r=tx.objectStore(DB_STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
  async function dbClear(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');const r=tx.objectStore(DB_STORE).clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
```

전부 삭제하고 다음으로 교체(호출부는 그대로 `dbAdd`/`dbGetAll`/`dbClear`를 쓰므로 이름만 유지):

```js
  const agarStore = makeDatasetStore('petricore-agar-dataset-v1');
  const dbAdd = item => agarStore.add(item);
  const dbGetAll = () => agarStore.all();
  const dbClear = () => agarStore.clear();
```

같은 IIFE 안의 `exportDataset` 함수 전체(`async function exportDataset(){if(!window.JSZip)...}` 한 줄짜리 큰 함수)를 찾아 다음으로 교체:

```js
  async function exportDataset(){
    const all = await dbGetAll();
    await exportYoloZip({
      items: all,
      classNames: ['colony'],
      boxOf: x => (x.label || '').split('\n').filter(Boolean).map(line => {
        const [, cx, cy, w, h] = line.split(' ').map(Number);
        return { classIndex: 0, cx, cy, w, h };
      }),
      zipName: 'Petricore_Agar_Training_Dataset_' + new Date().toISOString().slice(0,10) + '.zip',
      readmeText: 'Petricore Agar Colony Dataset\n\nClass 0 = colony\nEach JPG has a matching YOLO TXT label.\nSplit: 80% train / 10% validation / 10% test.\nAgar type is stored in metadata.json and the filename, while the detector learns one class: colony.\n',
      extraMetaOf: x => ({ auto: x.auto, current: x.current, settings: x.settings }),
    });
  }
```

(`boxOf`가 기존에 이미 저장된 `x.label` 문자열을 그대로 파싱하는 이유: `saveSample()`이 저장 시점에 이미 `labelLines()`로 만든 라벨 문자열을 `item.label`에 넣어두기 때문 — Task 6에서 `labelLines()`가 다중클래스를 반영하도록 바뀌면 여기서 파싱하는 `classIndex`도 자동으로 올바른 값이 된다. 지금 이 태스크에서는 항상 `0`.)

- [ ] **Step 3: drymedia-colony IIFE를 공용 헬퍼로 교체**

같은 방식으로 `DB_NAME='petricore-drymedia-dataset-v1'`로 시작하는 IIFE에서 `openDB/dbAdd/dbGetAll/dbClear` 4줄을 삭제하고:

```js
  const dryColonyStore = makeDatasetStore('petricore-drymedia-dataset-v1');
  const dbAdd = item => dryColonyStore.add(item);
  const dbGetAll = () => dryColonyStore.all();
  const dbClear = () => dryColonyStore.clear();
```

그리고 그 IIFE의 `async function exportDataset(){...}`를 다음으로 교체:

```js
  async function exportDataset(){
    const all = await dbGetAll();
    await exportYoloZip({
      items: all,
      classNames: ['colony'],
      boxOf: x => (x.label || '').split('\n').filter(Boolean).map(line => {
        const [, cx, cy, w, h] = line.split(' ').map(Number);
        return { classIndex: 0, cx, cy, w, h };
      }),
      zipName: 'Petricore_DryMedia_Training_Dataset_' + new Date().toISOString().slice(0,10) + '.zip',
      readmeText: 'Petricore Dry media Colony Dataset\n\nClass 0 = colony\nDry media type is stored in metadata.json and filename.\nSplit: 80% train / 10% validation / 10% test.\nAll labels were created from the user-confirmed colony positions.\n',
      extraMetaOf: x => ({ autoCount: x.autoCount, currentCount: x.currentCount, metadata: x.metadata }),
    });
  }
```

- [ ] **Step 4: drymedia-film IIFE를 공용 헬퍼로 교체**

`DB='petricore-drymedia-film-dataset-v1'`로 시작하는 IIFE에서 `openDB/all/add/clearDB` 4줄을 삭제하고:

```js
  const filmStore = makeDatasetStore('petricore-drymedia-film-dataset-v1', 'pages');
  const all = () => filmStore.all();
  const add = item => filmStore.add(item);
  const clearDB = () => filmStore.clear();
```

그리고 `function exportDataset(){all().then(async a=>{...`로 시작하는 함수 전체를 다음으로 교체:

```js
  function exportDataset(){
    all().then(async a => {
      await exportYoloZip({
        items: a,
        classNames: ['film'],
        boxOf: x => (x.boxes || []).map(b => ({
          classIndex: 0,
          cx: (b.x + b.w / 2) / x.width,
          cy: (b.y + b.h / 2) / x.height,
          w: b.w / x.width,
          h: b.h / x.height,
        })),
        zipName: 'Petricore_DryMedia_Film_Detector_Dataset_' + new Date().toISOString().slice(0,10) + '.zip',
        readmeText: 'Petricore Dry media Film Detector Dataset\n\nClass 0 = film.\nEach label describes one complete Dry media film in the original full-page image.\nUse this model before colony detection: full photo -> film detection -> crop each film -> colony detector.\nLabels were created/confirmed by the user. Split: 80% train / 10% validation / 10% test.\n',
        extraMetaOf: x => ({ filmCount: x.boxes?.length || 0 }),
      });
    }).catch(console.error);
  }
```

- [ ] **Step 5: 수동 QA — 동작 보존 확인**

브라우저로 열어서:
1. 고체배지 탭에서 사진 업로드 → 자동계수 → "현재 Agar 결과를 학습 데이터로 저장" → "학습 데이터셋 ZIP 내보내기" → zip을 열어 `dataset.yaml`이 여전히 `0: colony` 하나뿐인지, `labels/*.txt`가 전부 `0 ...`로 시작하는지 확인.
2. Dry media 탭에서 메인 표에 사진을 올려 결과를 만든 뒤, 학습탭의 "현재 결과 학습 데이터 저장" → export → 위와 동일하게 `0: colony` 확인.
3. "Dry media 필름형태학습" 카드에서 사진 업로드 → 자동후보 → 저장 → export → `0: film` 확인.
4. 세 경우 모두 리팩터 이전과 같은 사용자 흐름(버튼 위치, 확인창 문구)이 그대로인지 확인.

- [ ] **Step 6: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "refactor: 데이터셋 저장/YOLO export 3벌 중복을 공용 헬퍼로 통합"
```

---

## Task 3: 고체배지 블롭 색상 특징 추출 (VRBA·TBX 공용 기반)

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — agar IIFE 안의 `buildMask(c)`, `components(m,w,h)` 확장, `rgb2hsv`/`hueGateScore`/`redPurpleScore`/`haloScore` 신규 추가.

**Interfaces:**
- Consumes: 없음(agar IIFE 내부 전용 헬퍼)
- Produces: `components()`가 반환하는 각 블롭 객체에 `avgColor: {r,g,b}` 필드가 추가됨. 신규 함수 `rgb2hsv(r,g,b) -> [h,s,v]`, `hueGateScore(h, gate) -> number(0~1)`, `haloScore(colony, srcCanvas) -> number(0~1)` (agar IIFE 스코프 내부).

이 태스크는 특징을 **계산만** 하고 아직 아무 데도 안 쓴다(Task 4/5에서 소비). 동작 변화 없음 — `detect()`가 만드는 `S.colonies`에 `avgColor`가 추가로 붙을 뿐, 기존 카운트/그리기 로직은 무영향.

- [ ] **Step 1: `components()`에 평균 색상 누적 추가**

agar IIFE 안의 `function components(m,w,h){...}`를 찾는다(현재: `qx[tl]=sx;qy[tl]=sy;tl++;seen[st]=1;while(hd<tl){const x=qx[hd],y=qy[hd];hd++;area++;sxsum+=x;sysum+=y;...`). 이 함수는 마스크(`m`)만 보고 원본 캔버스 픽셀에 접근하지 않으므로, **원본 이미지 데이터를 추가 인자로 받도록 시그니처를 바꿔야** 한다.

찾을 코드(현재 시그니처와 area 누적 루프):
```js
  function components(m,w,h){const seen=new Uint8Array(w*h),out=[],minA=+$('agarMinArea').value,maxA=+$('agarMaxArea').value,qx=new Int32Array(Math.min(w*h,600000)),qy=new Int32Array(qx.length);for(let sy=1;sy<h-1;sy++)for(let sx=1;sx<w-1;sx++){let st=sy*w+sx;if(!m[st]||seen[st])continue;let hd=0,tl=0,area=0,sxsum=0,sysum=0,minx=sx,maxx=sx,miny=sy,maxy=sy;qx[tl]=sx;qy[tl]=sy;tl++;seen[st]=1;while(hd<tl){const x=qx[hd],y=qy[hd];hd++;area++;sxsum+=x;sysum+=y;minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);const ns=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];for(const z of ns){const nx=z[0],ny=z[1];if(nx<1||ny<1||nx>=w-1||ny>=h-1)continue;const k=ny*w+nx;if(m[k]&&!seen[k]){seen[k]=1;if(tl<qx.length){qx[tl]=nx;qy[tl]=ny;tl++}}}}if(area>=minA&&area<=maxA){const r=Math.max(2,Math.sqrt(area/Math.PI)),circ=area/(Math.PI*r*r);if(circ>.18)out.push({id:'a'+Math.random().toString(36).slice(2),x:sxsum/area,y:sysum/area,radius:r,area,manual:false,origin:'auto'})}}return out}
```

이걸로 교체(원본 픽셀 데이터 `imgData`를 받아 평균 RGB를 함께 누적):

```js
  function components(m,w,h,imgData){const seen=new Uint8Array(w*h),out=[],minA=+$('agarMinArea').value,maxA=+$('agarMaxArea').value,qx=new Int32Array(Math.min(w*h,600000)),qy=new Int32Array(qx.length);for(let sy=1;sy<h-1;sy++)for(let sx=1;sx<w-1;sx++){let st=sy*w+sx;if(!m[st]||seen[st])continue;let hd=0,tl=0,area=0,sxsum=0,sysum=0,rsum=0,gsum=0,bsum=0,minx=sx,maxx=sx,miny=sy,maxy=sy;qx[tl]=sx;qy[tl]=sy;tl++;seen[st]=1;while(hd<tl){const x=qx[hd],y=qy[hd];hd++;area++;sxsum+=x;sysum+=y;if(imgData){const pi=(y*w+x)*4;rsum+=imgData[pi];gsum+=imgData[pi+1];bsum+=imgData[pi+2]}minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);const ns=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];for(const z of ns){const nx=z[0],ny=z[1];if(nx<1||ny<1||nx>=w-1||ny>=h-1)continue;const k=ny*w+nx;if(m[k]&&!seen[k]){seen[k]=1;if(tl<qx.length){qx[tl]=nx;qy[tl]=ny;tl++}}}}if(area>=minA&&area<=maxA){const r=Math.max(2,Math.sqrt(area/Math.PI)),circ=area/(Math.PI*r*r);if(circ>.18)out.push({id:'a'+Math.random().toString(36).slice(2),x:sxsum/area,y:sysum/area,radius:r,area,manual:false,origin:'auto',avgColor:imgData?{r:rsum/area,g:gsum/area,b:bsum/area}:null})}}return out}
```

- [ ] **Step 2: `detect()`가 `imgData`를 넘기도록 수정**

`function detect(){if(!S.source)return;const x=buildMask(S.source),a=applyModel(components(x.mask,x.w,x.h));...`를 찾아, `components(x.mask,x.w,x.h)` 호출을 `components(x.mask,x.w,x.h,S.source.getContext('2d').getImageData(0,0,x.w,x.h).data)`로 바꾼다(`buildMask`가 이미 `S.source`와 같은 크기의 마스크를 만들므로 좌표계가 일치함 — `buildMask` 내부에서 캔버스를 리사이즈하지 않는지 Step 전에 `buildMask(c)` 본문을 확인해 좌표계가 어긋나지 않는지 재확인할 것).

- [ ] **Step 3: 색상 특징 헬퍼 추가**

agar IIFE 안, `function stats(a){...}` 바로 앞에 추가:

```js
  function rgb2hsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){if(mx===r)h=60*(((g-b)/d)%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}if(h<0)h+=360;return [h,mx===0?0:d/mx,mx]}
  function hueGateScore(h,gate){const [lo,hi]=gate;const inRange=lo>hi?(h>=lo||h<=hi):(h>=lo&&h<=hi);if(inRange)return 1;const d=Math.min(Math.min(Math.abs(h-lo),360-Math.abs(h-lo)),Math.min(Math.abs(h-hi),360-Math.abs(h-hi)));return Math.max(0,Math.min(1,1-d/60))}
  function redPurpleScoreOf(c){if(!c.avgColor)return 0;const [hue,sat]=rgb2hsv(c.avgColor.r,c.avgColor.g,c.avgColor.b);return hueGateScore(hue,[280,20])*Math.max(0,Math.min(1,sat*1.6))}
  function haloScoreOf(c,src){const cx=Math.round(c.x),cy=Math.round(c.y),rIn=Math.max(3,Math.round(c.radius)),rOut=rIn*2.2;const w=src.width,h=src.height,ctx=src.getContext('2d');let n=0,rs=0,gs=0,bs=0;for(let y=Math.max(0,cy-rOut);y<=Math.min(h-1,cy+rOut);y++)for(let x=Math.max(0,cx-rOut);x<=Math.min(w-1,cx+rOut);x++){const d=Math.hypot(x-cx,y-cy);if(d<rIn||d>rOut)continue;const px=ctx.getImageData(x,y,1,1).data;rs+=px[0];gs+=px[1];bs+=px[2];n++}if(!n||!c.avgColor)return 0;const ringR=rs/n,ringG=gs/n,ringB=bs/n;const [ringHue,ringSat]=rgb2hsv(ringR,ringG,ringB);const brightDiff=Math.abs((.299*ringR+.587*ringG+.114*ringB)-(.299*c.avgColor.r+.587*c.avgColor.g+.114*c.avgColor.b))/40;const [,colSat]=rgb2hsv(c.avgColor.r,c.avgColor.g,c.avgColor.b);const satDrop=Math.max(0,Math.min(1,(colSat-ringSat)*1.4));return Math.max(0,Math.min(1,brightDiff*.6+satDrop*.4))}
```

(`haloScoreOf`가 픽셀 단위로 `getImageData(x,y,1,1)`을 반복 호출하는 건 성능이 나쁘지만, VRBA 분류는 사진 하나당 블롭 수십~수백 개 수준이라 실사용에 문제없다 — 만약 실사진에서 느리면 링 영역을 한 번에 `getImageData`로 잘라서 순회하도록 최적화하는 것을 향후 과제로 남긴다.)

- [ ] **Step 4: 수동 QA**

VRBA 타입 선택 후 사진 업로드 → 콘솔에서 `S.colonies[0].avgColor`를 찍어 `{r,g,b}` 값이 실제로 들어있는지 확인(0이 아닌 의미있는 값). PCA/TSA/SDA/기타 타입에서는 이번 태스크가 그 값들을 아직 아무 데도 안 쓰므로 화면·개수·저장 동작이 Task 2 이후와 완전히 동일한지 확인(회귀 없음).

- [ ] **Step 5: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat(agar): 블롭별 평균 색상 + hue/halo 특징 추출 추가"
```

---

## Task 4: VRBA 4단계 분류 + 하드 사이즈 컷오프

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — agar IIFE의 `detect()`, `draw()`.

**Interfaces:**
- Consumes: `redPurpleScoreOf`, `haloScoreOf`, `rgb2hsv`(Task 3), `resolveClassScheme`(Task 1)
- Produces: VRBA 타입일 때 `S.colonies[i].cls`가 `'typical'|'possible'|'atypical'|'non_target'` 중 하나로 채워짐. 다른 타입은 `cls` 미설정(다음 태스크들이 채움).

- [ ] **Step 1: VRBA 전용 사이즈 컷오프 상수 추가**

agar IIFE 상단, `const PROFILES=...` 바로 다음 줄에 추가:

```js
  // VRBA 전용 하드 컷오프 — CLAUDE.md의 "단일 조건 하드 임계값 금지" 원칙에 대한
  // 의도적·국소적 예외(사용자 요청: 지름 0.5mm 미만은 계수에서 완전 제외).
  // 아직 plate 실측 스케일이 없어 mm 환산 대신 px 반지름 상수로 근사한다 —
  // 실제 사진으로 튜닝해서 이 값을 조정할 것. 다른 타입에는 적용하지 않는다.
  const VRBA_HARD_MIN_RADIUS_PX = 3;
```

- [ ] **Step 2: `detect()`에 VRBA 분류 + 컷오프 삽입**

`function detect(){if(!S.source)return;const x=buildMask(S.source),a=applyModel(components(x.mask,x.w,x.h,...));S.auto=JSON.parse(JSON.stringify(a));S.colonies=JSON.parse(JSON.stringify(a));...`(Task 3에서 이미 `imgData` 인자가 추가된 상태)를 찾아, `S.auto=...` 줄 바로 앞에 다음 분류 단계를 삽입한다:

```js
  function classifyVrba(list){
    return list
      .filter(c => c.radius >= VRBA_HARD_MIN_RADIUS_PX) // 하드 컷오프: 완전 제외
      .map(c => {
        const redPurpleScore = redPurpleScoreOf(c);
        const halo = haloScoreOf(c, S.source);
        const strongColor = redPurpleScore > .55, someColor = redPurpleScore > .28;
        const haloOk = halo > .45;
        let cls;
        if (strongColor && haloOk) cls = 'typical';
        else if (strongColor || (someColor && haloOk)) cls = 'possible';
        else if (someColor) cls = 'atypical';
        else cls = 'non_target';
        return Object.assign({}, c, { cls, redPurpleScore, haloScore: halo });
      });
  }
```

(이 함수를 `detect()` 바로 앞, 또는 `applyModel` 근처에 top-level 함수로 추가.) 그다음 `detect()` 본문에서 `applyModel(components(...))`의 결과를 담는 변수(`a`)를 만든 직후, VRBA일 때만 분류를 적용:

```js
  function detect(){if(!S.source)return;const w0=S.source.width,h0=S.source.height;const x=buildMask(S.source);let a=applyModel(components(x.mask,x.w,x.h,S.source.getContext('2d').getImageData(0,0,x.w,x.h).data));if(S.type==='vrba')a=classifyVrba(a);S.auto=JSON.parse(JSON.stringify(a));S.colonies=JSON.parse(JSON.stringify(a));S.history=[];S.future=[];$('agarResultTitle').textContent=(S.custom||document.querySelector('.agar-type-btn.active')?.textContent.split('\n')[0]||'Agar')+' · 자동 계수 결과';$('agarResultMeta').textContent=S.name+' · '+x.w+'×'+x.h;draw();counts();updateEditButtons()}
```

- [ ] **Step 3: `draw()`에 클래스별 색상 표시**

`function draw(){...ctx.strokeStyle=p.manual?'#F6C37B':'#8DD0E8';ctx.stroke();...}`를 찾아, VRBA 클래스가 있을 때 클래스별 색으로 원 색을 바꾼다. `ctx.strokeStyle=p.manual?'#F6C37B':'#8DD0E8';` 줄을 다음으로 교체:

```js
const VRBA_CLASS_COLORS = {typical:'#3FA65A',possible:'#D9A441',atypical:'#D97A3F',non_target:'#9AA5A1'};
ctx.strokeStyle = p.manual ? '#F6C37B' : (p.cls && VRBA_CLASS_COLORS[p.cls]) || '#8DD0E8';
```
(`VRBA_CLASS_COLORS` 상수는 `draw()` 함수 밖, agar IIFE 최상단에 한 번만 선언.)

- [ ] **Step 4: 수동 QA**

VRBA 타입 선택 후 사진 업로드 → 자동계수 결과에서 원 색이 typical(초록)/possible(황토)/atypical(주황)/non_target(회색)으로 나뉘어 보이는지 확인. 아주 작은(반지름 3px 미만) 잡티가 있는 사진이면 그게 아예 카운트에 안 잡히는지(하드 컷오프) 확인. TSA/PCA/TBX/SDA/기타 타입은 이번 변경으로 색이나 개수가 달라지지 않는지(회귀 없음) 확인.

- [ ] **Step 5: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat(agar): VRBA 4단계(typical/possible/atypical/non_target) 분류 + 하드 사이즈 컷오프"
```

---

## Task 5: TBX 색상 하드 게이트

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — agar IIFE의 `detect()`.

**Interfaces:**
- Consumes: `rgb2hsv`, `hueGateScore`(Task 3)
- Produces: TBX 타입일 때 청/청록 hue 게이트를 통과 못한 블롭은 `S.colonies`/`S.auto`에서 완전히 빠진다(VRBA와 달리 등급 없이 포함/제외 둘 뿐).

- [ ] **Step 1: TBX 게이트 함수 추가**

Task 4의 `classifyVrba` 함수 바로 뒤에 추가:

```js
  // TBX 전용 하드 색상 게이트 — CLAUDE.md 하드 임계값 금지 원칙의 TBX 전용,
  // 명시적 예외(사용자 요청: 청/청록 이외 색상 콜로니는 계수에서 완전 제외).
  // hue 범위는 실사진으로 튜닝 필요한 근사치로 시작.
  const TBX_HUE_GATE = [160, 260]; // 청록~파랑
  function filterTbx(list){
    return list.filter(c => {
      if (!c.avgColor) return true; // 색상 정보 없으면(구버전 데이터 등) 배제하지 않음
      const [hue] = rgb2hsv(c.avgColor.r, c.avgColor.g, c.avgColor.b);
      return hueGateScore(hue, TBX_HUE_GATE) > .3;
    });
  }
```

- [ ] **Step 2: `detect()`에 TBX 필터 연결**

Task 4에서 만든 `if(S.type==='vrba')a=classifyVrba(a);` 바로 뒤에 추가:

```js
if(S.type==='tbx')a=filterTbx(a);
```

- [ ] **Step 3: 수동 QA**

TBX 타입 선택 후, 청록색 콜로니와 무색/흰색 콜로니가 섞인 사진을 업로드 → 청록색만 카운트에 남고 무색/흰색은 아예 안 잡히는지 확인(등급 표시 없이 그냥 없는 것처럼). 다른 타입엔 영향 없는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat(agar): TBX 청/청록 색상 하드 게이트 추가"
```

---

## Task 6: 고체배지 클래스 태깅 UI ("분류" 모드) + export 다중클래스화

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — agar 마크업(버튼 추가), agar IIFE의 `mode()`, 클릭 핸들러, `saveSample()`, `labelLines()`, `exportDataset()`.

**Interfaces:**
- Consumes: `resolveClassScheme`(Task 1), `exportYoloZip`(Task 2)
- Produces: SDA(형태) 타입의 `yeast`/`mold` 수동 태깅 가능. 저장 시 `item.label`이 실제 클래스 인덱스를 반영. export 시 `dataset.yaml`의 `names`가 그 배치에 포함된 실제 타입들의 클래스 합집합.

- [ ] **Step 1: "분류" 모드 버튼 추가**

`콜로니 카운터 ai 연결.html`에서 `<button class="agar-btn ..." id="agarMoveBtn">이동</button>` 근처(agar 편집 도구 버튼들이 모여있는 곳 — `agarEditBtn`/`agarAddBtn`/`agarDeleteBtn`/`agarMoveBtn`이 나열된 마크업)를 찾아 그 옆에 추가:

```html
<button class="agar-btn" id="agarClassifyBtn">분류</button>
```

- [ ] **Step 2: `mode()`에 분류 모드 등록**

`function mode(m){S.mode=m;['agarEditBtn','agarAddBtn','agarDeleteBtn','agarMoveBtn'].forEach(id=>$(id).classList.remove('active'));const map={add:'agarAddBtn',delete:'agarDeleteBtn',move:'agarMoveBtn'};if(map[m])$(map[m]).classList.add('active');...}`를 찾아 배열과 map에 `'agarClassifyBtn'`을 추가:

```js
  function mode(m){S.mode=m;['agarEditBtn','agarAddBtn','agarDeleteBtn','agarMoveBtn','agarClassifyBtn'].forEach(id=>$(id).classList.remove('active'));const map={add:'agarAddBtn',delete:'agarDeleteBtn',move:'agarMoveBtn',classify:'agarClassifyBtn'};if(map[m])$(map[m]).classList.add('active');$('agarCanvas').style.cursor=m==='view'?'default':m==='move'?'grab':'crosshair'}
```

이벤트 리스너 등록부(`$('agarMoveBtn').addEventListener('click',()=>mode('move'));` 근처)에 추가:

```js
$('agarClassifyBtn').addEventListener('click',()=>mode('classify'));
```

- [ ] **Step 3: 클릭 시 클래스 순환**

`$('agarCanvas').addEventListener('click',e=>{if(!S.source||S.mode==='move')return;const p=point(e);if(S.mode==='add'){...}else if(S.mode==='delete'){...}});`를 찾아 `else if` 체인에 분류 분기를 추가:

```js
$('agarCanvas').addEventListener('click',e=>{if(!S.source||S.mode==='move')return;const p=point(e);if(S.mode==='add'){snap();S.colonies.push({id:'m'+Math.random().toString(36).slice(2),x:p.x,y:p.y,radius:6,area:113,manual:true,origin:'manual'});draw();counts()}else if(S.mode==='delete'){const n=nearest(p);if(n.ix>=0&&n.d<=Math.max(18,S.colonies[n.ix].radius*3)){snap();S.colonies.splice(n.ix,1);draw();counts()}}else if(S.mode==='classify'){const n=nearest(p);if(n.ix>=0&&n.d<=Math.max(18,S.colonies[n.ix].radius*3)){const scheme=resolveClassScheme(S.type);if(scheme.classes.length>1){snap();const cur=S.colonies[n.ix].cls;const idx=cur?scheme.classes.indexOf(cur):-1;S.colonies[n.ix].cls=scheme.classes[(idx+1)%scheme.classes.length];draw();counts()}}}});
```

- [ ] **Step 4: `draw()`에 미분류 점 표시**

Task 4에서 만든 `ctx.strokeStyle = p.manual ? '#F6C37B' : (p.cls && VRBA_CLASS_COLORS[p.cls]) || '#8DD0E8';` 바로 뒤에 추가 — SDA처럼 `basis:'shape'`인 타입에서 아직 `cls`가 없는 점은 눈에 띄게 표시(점선 테두리):

```js
const scheme=resolveClassScheme(S.type);
if(!scheme.auto && !p.cls){ctx.setLineDash([4,3]);ctx.strokeStyle='#C1443B';}
```
(이 두 줄을 `ctx.stroke();` 호출 **전**에 넣고, `ctx.stroke()` 직후 `ctx.setLineDash([]);`로 리셋 — 기존 `ctx.stroke()` 줄 앞뒤에 정확히 삽입할 것.)

- [ ] **Step 5: 저장 시 미분류 차단 + 라벨 다중클래스화**

`async function saveSample(){if(!S.source)return;const type=...` 함수 시작 부분에 가드 추가(첫 줄 `if(!S.source)return;` 바로 뒤):

```js
const __scheme=resolveClassScheme(S.type);
if(!__scheme.auto && S.colonies.some(c=>!c.cls)){alert('모든 콜로니를 분류(효모/곰팡이 등)한 뒤 저장해주세요.');return;}
```

같은 함수 안의 `label:labelLines(S.colonies,S.source.width,S.source.height)`는 그대로 두되, `labelLines()` 자체를 다중클래스로 바꾼다. `function labelLines(colonies,w,h){return colonies.map(c=>{const r=Math.max(3,c.radius||Math.sqrt((c.area||50)/Math.PI));const x1=clamp(c.x-r,0,w),y1=clamp(c.y-r,0,h),x2=clamp(c.x+r,0,w),y2=clamp(c.y+r,0,h);const cx=((x1+x2)/2/w).toFixed(6),cy=((y1+y2)/2/h).toFixed(6),bw=((x2-x1)/w).toFixed(6),bh=((y2-y1)/h).toFixed(6);return \`0 ${cx} ${cy} ${bw} ${bh}\`}).join('\\n')}`(agar IIFE 안의 버전)를 찾아 교체:

```js
  function labelLines(colonies,w,h,typeKey){
    const scheme=resolveClassScheme(typeKey);
    return colonies.map(c=>{
      const r=Math.max(3,c.radius||Math.sqrt((c.area||50)/Math.PI));
      const x1=clamp(c.x-r,0,w),y1=clamp(c.y-r,0,h),x2=clamp(c.x+r,0,w),y2=clamp(c.y+r,0,h);
      const cx=((x1+x2)/2/w).toFixed(6),cy=((y1+y2)/2/h).toFixed(6),bw=((x2-x1)/w).toFixed(6),bh=((y2-y1)/h).toFixed(6);
      const idx=Math.max(0,scheme.classes.indexOf(c.cls||scheme.classes[0]));
      return `${idx} ${cx} ${cy} ${bw} ${bh}`;
    }).join('\n');
  }
```

`saveSample()` 안의 `labelLines(S.colonies,S.source.width,S.source.height)` 호출을 `labelLines(S.colonies,S.source.width,S.source.height,S.type)`로 바꾼다. 또, `saveSample()`이 만드는 `item` 객체에 클래스 개수 집계를 추가 — `settings:{...}` 필드 바로 뒤에:

```js
classCounts: S.colonies.reduce((acc,c)=>{const k=c.cls||resolveClassScheme(S.type).classes[0];acc[k]=(acc[k]||0)+1;return acc},{}),
```

- [ ] **Step 6: export의 전역 클래스 합집합 + `boxOf` 재작성**

Task 2에서 만든 agar `exportDataset()`(`classNames:['colony']`, `boxOf: x => (x.label||'').split(...)`처럼 저장된 문자열을 재파싱하던 버전)를 다음으로 교체 — 이번엔 저장된 `label` 문자열이 아니라 `item.colonies`(원본 좌표)와 `item.type`으로 매번 전역 인덱스를 다시 계산한다(배치마다 합집합이 달라질 수 있으므로):

```js
  function buildGlobalClassList(items){
    const seen=[];
    Object.keys(window.TYPE_CLASS_SCHEMES).forEach(k=>{ // 선언 순서 고정
      if(!items.some(x=>x.type===k))return;
      resolveClassScheme(k).classes.forEach(c=>{if(!seen.includes(c))seen.push(c)});
    });
    if(items.some(x=>!(x.type in window.TYPE_CLASS_SCHEMES))&&!seen.includes('colony'))seen.push('colony');
    return seen.length?seen:['colony'];
  }
  async function exportDataset(){
    const all = await dbGetAll();
    const globalNames = buildGlobalClassList(all);
    await exportYoloZip({
      items: all,
      classNames: globalNames,
      boxOf: x => {
        const scheme = resolveClassScheme(x.type);
        return (x.colonies||[]).map(c=>{
          const r=Math.max(3,c.radius||Math.sqrt((c.area||50)/Math.PI));
          const cls = c.cls || scheme.classes[0];
          const gi = globalNames.indexOf(cls);
          return { classIndex: gi>=0?gi:0, cx: c.x/x.width, cy: c.y/x.height, w: (r*2)/x.width, h: (r*2)/x.height };
        });
      },
      zipName: 'Petricore_Agar_Training_Dataset_' + new Date().toISOString().slice(0,10) + '.zip',
      readmeText: 'Petricore Agar Colony Dataset\n\nClasses: ' + globalNames.join(', ') + '\nEach class corresponds to one agar-type counting rule — see TYPE_CLASS_SCHEMES / metadata.json (per-image `type`) for which type produced which class.\nSplit: 80% train / 10% validation / 10% test.\n',
      extraMetaOf: x => ({ auto: x.auto, current: x.current, settings: x.settings, classCounts: x.classCounts||{} }),
    });
  }
```

- [ ] **Step 7: 수동 QA**

1. SDA 타입 선택 → 자동계수 → "분류" 모드로 들어가 점을 클릭할 때마다 yeast↔mold로 바뀌는지(점선이 사라지는지) 확인.
2. 전부 분류하지 않은 채 "학습 데이터로 저장" 클릭 → 경고가 뜨고 저장이 안 되는지 확인. 전부 분류 후 저장되는지 확인.
3. VRBA 타입도 "분류" 모드로 들어가 typical→possible→atypical→non_target→typical로 순환하는지 확인(자동판정을 사람이 고칠 수 있어야 함).
4. TSA/PCA/기타 타입은 클래스가 1개뿐이라 "분류" 모드에서 클릭해도 아무 변화 없는지(순환할 게 없으므로) 확인.
5. 서로 다른 타입(예: TSA 1건 + VRBA 1건 + SDA 1건)을 저장한 뒤 export → zip의 `dataset.yaml`이 `colony`(TSA) + `typical/possible/atypical/non_target`(VRBA) + `yeast/mold`(SDA)를 합친 리스트인지, 각 `labels/*.txt`의 클래스 인덱스가 그 리스트 안에서 올바른 위치를 가리키는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat(agar): 클래스 태깅 UI(분류 모드) + export 다중클래스화"
```

---

## Task 7: 건조필름배지 EC pink 채널 + 타입별 colorMode 연결

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — 원본 Petricore 섹션의 `buildMask(data,w,h,labelPx,gate,channel)`, `detectColonies()`, `createRecordFromCanvas()`.

**Interfaces:**
- Consumes: 없음
- Produces: `detectColonies(canvas,{colorMode:'ec',...})` 지원 추가. `createRecordFromCanvas()`가 `dryType`에 따라 적절한 `colorMode`로 검출.

- [ ] **Step 1: `buildMask`에 pink 채널 추가**

`function buildMask(data, w, h, labelPx, gate, channel) {`로 시작하는 함수(원본 Petricore 섹션, 약 1281행)를 찾는다. 현재 내용:

```js
function buildMask(data, w, h, labelPx, gate, channel) {
    const mask = new Uint8Array(w * h);
    const gate2 = Math.max(4, gate - 5);
    for (let y = labelPx; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const R = data[i], G = data[i + 1], B = data[i + 2];
            let hit = false;
            if (channel === 'red') {
                hit = (R - G) > gate && (R - B) > gate2 && R < 235;
            } else {
                hit = (B - G) > gate && (B - R) > gate2 && B < 235;
            }
            if (hit) mask[y * w + x] = 1;
        }
    }
    return mask;
}
```

`else` 분기(blue 전용 가정)를 채널별 분기로 바꾼다:

```js
function buildMask(data, w, h, labelPx, gate, channel) {
    const mask = new Uint8Array(w * h);
    const gate2 = Math.max(4, gate - 5);
    for (let y = labelPx; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const R = data[i], G = data[i + 1], B = data[i + 2];
            let hit = false;
            if (channel === 'red') {
                hit = (R - G) > gate && (R - B) > gate2 && R < 235;
            } else if (channel === 'pink') {
                // EC 전용: 자주/마젠타 계열(R·B 둘 다 G보다 높음, 순수 blue는 제외).
                // 게이트 값은 실사진 검증 후 조정 필요.
                hit = (R - G) > gate && (B - G) > gate2 * 0.6 && Math.abs(R - B) < gate && R < 235 && B < 235;
            } else {
                hit = (B - G) > gate && (B - R) > gate2 && B < 235;
            }
            if (hit) mask[y * w + x] = 1;
        }
    }
    return mask;
}
```

- [ ] **Step 2: `detectColonies`에 `'ec'` colorMode 추가**

`function detectColonies(imageSource, options = {}) {`를 찾는다(약 1249~1278행 부근, 시그니처는 `sensitivity/labelHeightRatio/minArea/splitMergedBlobs/colorMode` 구조분해 후 `if (colorMode === 'red' || colorMode === 'both') {...}` `if (colorMode === 'blue' || colorMode === 'both') {...}` 형태). 그 두 `if` 블록 뒤에 추가:

```js
    if (colorMode === 'ec') {
        const blueMask = buildMask(data, w, h, labelPx, sensitivity, 'blue');
        colonies = colonies.concat(detectFromMask(blueMask, w, h, minArea, splitMergedBlobs, 'blue'));
        const pinkMask = buildMask(data, w, h, labelPx, sensitivity, 'pink');
        colonies = colonies.concat(detectFromMask(pinkMask, w, h, minArea, splitMergedBlobs, 'pink'));
    }
```

(`detectFromMask`의 마지막 인자가 각 콜로니 객체의 `.color`로 그대로 들어가므로, `'pink'`를 넘기면 `colony.color === 'pink'`가 된다 — 기존 `.color`(`'red'|'blue'`) 필드를 그대로 재사용, 새 필드 불필요.)

- [ ] **Step 3: `createRecordFromCanvas`가 타입별 colorMode를 쓰도록 수정**

`async function createRecordFromCanvas(canvas, filename, dryType = window.__dryMediaType || 'AC', dryCustomType = window.__dryMediaCustomType || '') {`를 찾는다. `colorMode: DEFAULTS.colorMode`로 레코드를 만드는 줄(`type: (dryType === 'other' ? 'other' : dryType), dryMediaType: dryType, ..., colorMode: DEFAULTS.colorMode,`가 있는 record 리터럴)에서, `colorMode: DEFAULTS.colorMode,` 를 다음으로 교체:

```js
colorMode: (dryType === 'EC' ? 'ec' : 'red'),
```

(현재 코드가 실제로 `record.colorMode`를 어디서 읽어 `detectColonies` 호출에 넘기는지도 같은 함수 안에서 확인 — `Promise.resolve(detectColonies(canvas, { sensitivity: record.sensitivity, labelHeightRatio: record.labelHeightRatio, minArea: record.minArea, colorMode: record.colorMode }))` 부분은 이미 `record.colorMode`를 읽으므로 추가 수정 불필요.)

- [ ] **Step 4: 수동 QA**

1. Dry media 타입을 EC로 선택하고 사진 업로드 → 콜로니 점들이 파란색(`blue`)과 분홍(`pink`) 두 색으로 나뉘어 그려지는지 확인(기존 렌더링 코드가 `color==='blue'`일 때만 다른 색으로 그렸다면, `pink`도 시각적으로 구분되게 그리는 부분이 있는지 렌더 코드(`SimpleViewer`/`ColonyEditor`의 원 색 결정 부분)를 확인하고, 필요하면 `pink` 케이스를 추가 — 렌더링 색상 매핑 코드를 찾아 `color==='blue'?'...':'...'` 형태의 삼항이 있으면 `pink` 분기를 끼워 넣는다).
2. AC/CC/EB 타입은 여전히 `red` 단일 채널로 검출되는지(회귀 없음) 확인.

- [ ] **Step 5: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat(drymedia): EC용 pink 채널 검출 + 타입별 colorMode 연결"
```

---

## Task 8: 건조필름배지 클래스 태깅 ("분류" 모드) + export 다중클래스화

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — `class ColonyEditor`(모드/클릭 처리), 에디터 마크업(버튼), drymedia-colony IIFE의 `saveCurrent`/`labelLines`/`exportDataset`.

**Interfaces:**
- Consumes: `resolveClassScheme`(Task 1), `exportYoloZip`(Task 2), Task 7의 `.color`(`'red'|'blue'|'pink'`)
- Produces: 콜로니 편집기에서 개별 점의 클래스(색상 기반은 자동판정 결과 수정, YM은 수동 태깅) 조정 가능. dry-media colony export가 다중클래스 반영.

- [ ] **Step 1: 에디터에 "분류" 모드 버튼 추가**

`<button id="btnModeAdd" class="es-mode-btn active">추가</button><button id="btnModeDelete" class="es-mode-btn">삭제</button><button id="btnModeMove" class="es-mode-btn">이동</button>`가 있는 마크업을 찾아 그 뒤에 추가:

```html
<button id="btnModeClassify" class="es-mode-btn">분류</button>
```

- [ ] **Step 2: `ColonyEditor`에 classify 모드 등록**

`class ColonyEditor {`의 생성자(`this.mode = 'view'; // 'view' | 'add' | 'delete' | 'move'`가 있는 곳)에서 주석을 갱신:

```js
this.mode = 'view'; // 'view' | 'add' | 'delete' | 'move' | 'classify'
```

`setEditorMode`/모드 전환 함수(`['btnModeAdd', 'btnModeDelete', 'btnModeMove'].forEach(id => document.getElementById(id).classList.remove('active'));`와 `const map = { add: 'btnModeAdd', delete: 'btnModeDelete', move: 'btnModeMove' };`가 있는 곳)를 찾아 배열/맵에 추가:

```js
['btnModeAdd', 'btnModeDelete', 'btnModeMove', 'btnModeClassify'].forEach(id => document.getElementById(id).classList.remove('active'));
const map = { add: 'btnModeAdd', delete: 'btnModeDelete', move: 'btnModeMove', classify: 'btnModeClassify' };
```

이벤트 리스너 등록부(`document.getElementById('btnModeMove').addEventListener('click', () => setEditorMode('move'));` 근처)에 추가:

```js
document.getElementById('btnModeClassify').addEventListener('click', () => setEditorMode('classify'));
```

- [ ] **Step 3: 클릭 시 클래스 순환**

`ColonyEditor` 클래스 안의 클릭 처리부(`if (this.mode === 'add') {...} else if (this.mode === 'delete') {...}`가 있는 곳, 약 2557~2570행 부근 — 정확한 변수명은 현재 코드를 읽고 그 스타일에 맞출 것)에 분기 추가:

```js
} else if (this.mode === 'classify') {
    const nearest = this._findNearestColony(pos); // 기존 delete 분기가 쓰는 것과 동일한 '가장 가까운 점 찾기' 헬퍼를 재사용 — 실제 메서드/변수명은 delete 분기 코드에서 확인해 맞출 것
    if (nearest) {
        const record = this._currentRecord(); // 현재 편집 중인 record를 가리키는 기존 접근자를 재사용
        const typeKey = record.dryMediaType || record.type;
        const scheme = window.resolveClassScheme(typeKey);
        if (scheme.classes.length > 1) {
            const pool = scheme.basis === 'shape' ? scheme.classes : (nearest.color ? [nearest.color, ...scheme.classes.filter(c => c !== nearest.color)] : scheme.classes);
            const cur = nearest.cls || (scheme.basis === 'color' ? nearest.color : null);
            const idx = cur ? pool.indexOf(cur) : -1;
            nearest.cls = pool[(idx + 1) % pool.length];
            this._redraw(); // 기존 다시그리기 호출을 그대로 재사용
        }
    }
}
```

> 이 스텝은 다른 태스크들과 달리 **정확한 기존 코드를 인용하지 않았다** — `ColonyEditor`의 클릭 핸들러 변수/메서드 이름(`nearest` 탐색 헬퍼, 현재 record 접근자, 다시그리기 호출)을 실제 코드에서 확인 후 그 이름 그대로 맞춰 넣을 것. 로직(가장 가까운 점을 찾아 `cls`를 스킴 순서대로 순환시키되, `basis:'color'`인 타입은 자동판정된 `.color`를 순환의 시작점으로 우선한다)만 지켜지면 된다.

- [ ] **Step 4: 에디터 렌더링에 미분류/클래스 표시 반영**

콜로니 점을 그리는 코드(원 색을 `color==='blue'?...:...` 식으로 결정하는 부분)를 찾아: (a) `pink` 색상 케이스 추가(Task 7에서 남긴 확인 사항과 동일), (b) `basis:'shape'`인 타입에서 `cls`가 없는 점은 점선 테두리로 표시(Task 6의 agar `draw()`와 동일한 시각 규칙 — `red`/`blue`/`pink` 등 기존 색상 팔레트와 겹치지 않는 강조색, 예: `#C1443B` 실선 대신 점선).

- [ ] **Step 5: 저장 시 미분류 차단 (dry-media colony IIFE)**

`async function saveCurrent(){const appState=window.PetricoreState;const idx=appState?.activeIndex;const record=idx!=null?appState.records[idx]:null;if(!record){...}if(!record.canvas||!record.colonies?.length){...}`를 찾아, 두 번째 `if` 체크(`!record.canvas||!record.colonies?.length`) 바로 뒤에 추가:

```js
const __typeKey = record.dryMediaType || record.type;
const __scheme = window.resolveClassScheme(__typeKey);
if (!__scheme.auto && record.colonies.some(c => !c.cls)) {
    alert('모든 콜로니를 분류(효모/곰팡이 등)한 뒤 저장해주세요. 콜로니 편집기에서 "분류" 모드로 지정할 수 있습니다.');
    return;
}
```

- [ ] **Step 6: `labelLines`/저장 항목에 클래스 반영**

drymedia-colony IIFE의 `function labelLines(colonies,w,h){return (colonies||[]).map(c=>{const r=...;return \`0 ${...}\`}).join('\\n')}`를 다음으로 교체:

```js
  function labelLines(colonies,w,h,typeKey){
    const scheme = window.resolveClassScheme(typeKey);
    return (colonies||[]).map(c=>{
      const r=Math.max(3,c.radius||Math.sqrt((c.area||40)/Math.PI));
      const x1=Math.max(0,c.x-r),y1=Math.max(0,c.y-r),x2=Math.min(w,c.x+r),y2=Math.min(h,c.y+r);
      const cls = c.cls || (scheme.basis==='color' ? c.color : scheme.classes[0]);
      const idx = Math.max(0, scheme.classes.indexOf(cls));
      return `${idx} ${(((x1+x2)/2)/w).toFixed(6)} ${(((y1+y2)/2)/h).toFixed(6)} ${((x2-x1)/w).toFixed(6)} ${((y2-y1)/h).toFixed(6)}`;
    }).join('\n');
  }
```

`saveCurrent()` 안의 `label:labelLines(record.colonies,record.canvas.width,record.canvas.height)` 호출을 `label:labelLines(record.colonies,record.canvas.width,record.canvas.height,__typeKey)`로 바꾸고, 같은 `item` 리터럴에 `classCounts` 필드 추가:

```js
classCounts: record.colonies.reduce((acc,c)=>{const k=c.cls||(__scheme.basis==='color'?c.color:__scheme.classes[0]);acc[k]=(acc[k]||0)+1;return acc},{}),
```

- [ ] **Step 7: export 다중클래스화**

Task 2에서 만든 drymedia-colony `exportDataset()`을 Task 6의 agar `buildGlobalClassList` 패턴과 동일하게 교체:

```js
  function buildGlobalClassList(items){
    const seen=[];
    Object.keys(window.TYPE_CLASS_SCHEMES).forEach(k=>{
      if(!items.some(x=>x.type===k))return;
      window.resolveClassScheme(k).classes.forEach(c=>{if(!seen.includes(c))seen.push(c)});
    });
    if(items.some(x=>!(x.type in window.TYPE_CLASS_SCHEMES))&&!seen.includes('colony'))seen.push('colony');
    return seen.length?seen:['colony'];
  }
  async function exportDataset(){
    const all = await dbGetAll();
    const globalNames = buildGlobalClassList(all);
    await exportYoloZip({
      items: all,
      classNames: globalNames,
      boxOf: x => {
        const scheme = window.resolveClassScheme(x.type);
        return (x.colonies||[]).map(c=>{
          const r=Math.max(3,c.radius||Math.sqrt((c.area||40)/Math.PI));
          const cls = c.cls || (scheme.basis==='color' ? c.color : scheme.classes[0]);
          const gi = globalNames.indexOf(cls);
          return { classIndex: gi>=0?gi:0, cx: c.x/x.width, cy: c.y/x.height, w: (r*2)/x.width, h: (r*2)/x.height };
        });
      },
      zipName: 'Petricore_DryMedia_Training_Dataset_' + new Date().toISOString().slice(0,10) + '.zip',
      readmeText: 'Petricore Dry media Colony Dataset\n\nClasses: ' + globalNames.join(', ') + '\nSee metadata.json (`type`) for which dry-media type produced which class.\nSplit: 80% train / 10% validation / 10% test.\n',
      extraMetaOf: x => ({ autoCount: x.autoCount, currentCount: x.currentCount, metadata: x.metadata, classCounts: x.classCounts||{} }),
    });
  }
```

- [ ] **Step 8: 수동 QA**

1. EC 타입 사진을 메인 표에서 처리 → 콜로니 편집기 열어 "분류" 모드로 blue/pink 점 하나를 클릭 → 순환되는지 확인.
2. YM 타입 사진 → 모든 점을 yeast/mold로 분류하기 전엔 학습탭 저장이 막히는지, 다 분류하면 저장되는지 확인.
3. AC/CC/EB(단일 클래스)는 "분류" 모드에서 클릭해도 변화 없는지(순환할 클래스가 1개뿐이므로) 확인.
4. EC+YM+AC 각각 하나씩 저장 후 export → `dataset.yaml`의 `names`가 `blue/pink/yeast/mold/red`(순서는 스킴 선언 순서 기준)의 합집합인지, 라벨 인덱스가 올바른지 확인.

- [ ] **Step 9: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat(drymedia): 콜로니 편집기 분류 모드 + export 다중클래스화"
```

---

## Task 9: 신규 "PLATE SEGMENTATION" 탭 (고체배지 plate 범위)

**Files:**
- Modify: `콜로니카운터 최종/콜로니 카운터 ai 연결.html` — agar 워크스페이스 마크업에 새 카드 추가, `initTrainingWorkspace()`에 새 카드 이동 로직 추가, 새 IIFE 추가(드라이미디어 필름형태학습 IIFE를 그대로 복제해 클래스명만 `plate`로).

**Interfaces:**
- Consumes: `exportYoloZip`(Task 2)
- Produces: 새 IndexedDB `petricore-agar-plate-dataset-v1`(store `pages`), "학습" 탭의 Agar 슬롯에 노출되는 새 카드.

- [ ] **Step 1: 마크업 추가**

기존 `<div class="drymedia-film-card petri-view" id="dryMediaFilmTrainingCard">...</div>` 블록 전체(약 935~960행 부근, `dryMediaFilmFileInput`/`dryMediaFilmCanvas`/`dryMediaFilmAutoBtn`/`dryMediaFilmUndoBtn`/`dryMediaFilmSaveBtn`/`dryMediaFilmExportBtn`/`dryMediaFilmClearDatasetBtn`/`dryMediaFilmList`/`dryMediaFilmDatasetCount` 등 id를 가진 마크업)를 찾아 그 구조를 그대로 복제하되, agar 워크스페이스 섹션(`<section id="agarWorkspace" ...>`) 안, `agar-dataset-card` 근처에 다음과 같이 붙여넣는다 — **모든 id에 `agarPlate` 접두어**를 쓴다(예: `dryMediaFilmFileInput` → `agarPlateFileInput`, `dryMediaFilmCanvas` → `agarPlateCanvas`, `dryMediaFilmAutoBtn` → `agarPlateAutoBtn`, `dryMediaFilmUndoBtn` → `agarPlateUndoBtn`, `dryMediaFilmSaveBtn` → `agarPlateSaveBtn`, `dryMediaFilmExportBtn` → `agarPlateExportBtn`, `dryMediaFilmClearDatasetBtn` → `agarPlateClearDatasetBtn`, `dryMediaFilmList` → `agarPlateList`, `dryMediaFilmDatasetCount` → `agarPlateDatasetCount`, 안내 문구는 "필름"→"Plate(배지 원판)"으로 바꿔 적는다). 카드의 `class="drymedia-film-card petri-view"`는 `class="agar-plate-card"`로(기존 `petri-view` 클래스는 Dry media 탭에서만 보이게 하는 용도라 agar 카드엔 불필요 — `initTrainingWorkspace()`가 어차피 학습 탭으로 옮기므로).

- [ ] **Step 2: IIFE 복제**

`(function(){` `const DB='petricore-drymedia-film-dataset-v1', STORE='pages';`로 시작하는 필름형태학습 IIFE 전체(약 3771~3805행)를 그대로 복사해 그 바로 뒤에 붙여넣고, 다음만 바꾼다:
- `DB='petricore-drymedia-film-dataset-v1'` → `DB='petricore-agar-plate-dataset-v1'`
- 모든 `$('dryMediaFilm...')` id 참조를 Step 1에서 정한 `$('agarPlate...')`로 치환
- `normalizeBox`가 반환하는 `label:'film'` → `label:'plate'`
- `saveCurrent()`의 `type` 결정 로직(`window.__dryMediaType`을 읽는 부분)을 agar 타입으로 교체: `const type=document.querySelector('.agar-type-btn.active')?.dataset.agarType||'tsa';`(agar 타입 버튼에서 현재 선택된 타입을 읽는다 — 필름과 달리 이 탭은 agar 워크스페이스 소속이므로)
- `exportDataset()`의 `classNames`를 `['plate']`로, `readmeText`를 다음으로 교체: `'Petricore Agar Plate Detector Dataset\n\nClass 0 = plate.\nEach label describes one complete agar plate/dish boundary in the original full-page photo.\nUse this model before colony detection: full photo -> plate detection -> crop each plate -> colony detector.\n'`, `zipName`을 `'Petricore_Agar_Plate_Detector_Dataset_' + new Date().toISOString().slice(0,10) + '.zip'`로
- (이 export도 Task 2의 `exportYoloZip` 공용 헬퍼를 쓰도록 새로 작성 — 복제해온 기존 `exportDataset` 본문을 Task 2 Step 4에서 만든 필름용 패턴 그대로 따라 쓰면 된다)
- 마지막 `init()` 안의 모든 `$('dryMediaFilm...')` id도 전부 `$('agarPlate...')`로 치환

- [ ] **Step 3: "학습" 탭에 노출**

`function initTrainingWorkspace(){...const dryFilm=document.querySelector('#dryMediaFilmTrainingCard');...if(dryFilm&&!drySlot.contains(dryFilm)){dryFilm.classList.remove('petri-view');drySlot.appendChild(dryFilm)}}`를 찾아, agar 관련 이동 블록(`if(agarTraining&&!agarSlot.contains(agarTraining))agarSlot.appendChild(agarTraining);if(agarDataset&&!agarSlot.contains(agarDataset))agarSlot.appendChild(agarDataset);` 근처)에 추가:

```js
const agarPlateCard=document.querySelector('.agar-plate-card');
if(agarPlateCard&&!agarSlot.contains(agarPlateCard))agarSlot.appendChild(agarPlateCard);
```

- [ ] **Step 4: 수동 QA**

1. "학습" 탭 열기 → Agar 슬롯에 새 "PLATE SEGMENTATION" 카드가 보이는지 확인.
2. 여러 배지가 찍힌 사진 업로드 → "자동 후보" → plate 박스가 대충이라도 잡히는지(필름형태학습과 같은 알고리즘이므로 배지 모양에 따라 정확도는 낮을 수 있음 — 수동으로 고칠 수 있으면 충분) 확인.
3. 수동 박스 추가/삭제/되돌리기 동작 확인.
4. 저장 → export → zip의 `dataset.yaml`이 `0: plate`인지, 이미지/라벨이 잘 들어있는지 확인.
5. 기존 "Dry media 필름형태학습" 카드는 이번 변경으로 전혀 영향받지 않았는지(id 충돌 없음) 확인.

- [ ] **Step 5: 커밋**

```bash
git add "콜로니카운터 최종/콜로니 카운터 ai 연결.html"
git commit -m "feat(agar): 신규 Plate Segmentation 학습탭 추가"
```

---

## Task 10: 최종 통합 수동 QA

**Files:** 없음(코드 변경 없음, 검증만)

**Interfaces:** 없음

- [ ] **Step 1: 스펙 §8 체크리스트 전체 재실행**

`콜로니카운터 최종/콜로니 카운터 ai 연결.html`을 처음부터 열어(localStorage/IndexedDB를 건드리지 않은 새 프로필이면 더 좋음) 다음을 순서대로 확인:

1. 건조필름배지 5개 타입(AC/EC/CC/YM/EB) 각각 최소 1장씩 업로드 → 자동판정이 그럴듯한지, 클래스 버튼/분류 모드가 그 타입의 클래스 개수만큼 보이는지.
2. 고체배지 5개 타입(TSA/PCA/VRBA/TBX/SDA) 각각 최소 1장씩 → 동일하게 확인. VRBA는 4단계 색 구분, TBX는 무색 제외, SDA는 분류 강제가 되는지.
3. Plate Segmentation 탭에서 박스 하나 만들어 저장 → export.
4. 모든 트랙(agar-colony, drymedia-colony, drymedia-film, agar-plate) 각각 최소 1건씩 저장 후 4개 zip을 전부 내보내 열어보고 `dataset.yaml`/`labels/*.txt`/`metadata.json`이 이번 스펙대로인지 최종 확인.
5. 기존에 저장해뒀던(리팩터 이전) 데이터가 있다면 — 새 코드에서도 export 시 에러 없이 처리되는지(스키마가 없는 옛 타입 데이터는 `colony` 폴백으로 처리되는지) 확인.

- [ ] **Step 2: 결과 기록**

발견된 문제가 있으면 해당 태스크로 돌아가 고친다. 전부 통과하면 완료.

---

## 자체 검토 결과

**스펙 커버리지:** §3(클래스 표) → Task 1. §4.1(EC pink) → Task 7. §4.2(형태 기반 수동 태깅) → Task 8(dry-media)/Task 6(agar SDA). §4.3~4.5(agar 색상특징·VRBA·TBX) → Task 3/4/5. §5.1(태깅 UI) → Task 6/8. §5.2(공용 인프라) → Task 2. §5.3(Plate 탭) → Task 9. §6(export 포맷) → Task 6/8의 `exportDataset` 재작성. §7(에러 처리) → 각 태스크의 가드(미분류 차단, ZIP 모듈 없음 등 기존 그대로 유지). §8(테스트 전략) → 각 태스크 Step의 수동 QA + Task 10.

**플레이스홀더 스캔:** Task 8 Step 3만 예외적으로 "정확한 기존 코드를 인용하지 않았다"고 명시 — `ColonyEditor`의 클릭 핸들러 내부 헬퍼 이름을 구현 시점에 확인해야 하는 정당한 사유(에디터 클래스 내부 헬퍼 이름을 사전 조사에서 확정하지 못함)가 있고, 그 사실과 지켜야 할 로직을 구체적으로 밝혔다. 나머지는 전부 실제 파일에서 읽은 현재 코드 + 완전한 교체 코드.

**타입 일관성:** `resolveClassScheme`(Task 1) → `TYPE_CLASS_SCHEMES`(Task 1) → agar `classifyVrba`/`filterTbx`(Task 4/5)/`labelLines`(Task 6) → dry-media `labelLines`(Task 8) 전부 같은 스킴 객체 형태(`{classes, basis, auto}`)를 일관되게 참조. `avgColor:{r,g,b}` 필드명이 Task 3에서 정의된 그대로 Task 4/5에서 쓰임. `exportYoloZip`의 `boxOf` 반환 형태(`{classIndex,cx,cy,w,h}`)가 Task 2 정의 그대로 Task 6/8/9에서 쓰임.
