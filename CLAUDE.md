# ColonyCount — Agar Plate Colony Counter

브라우저에서 단독으로 동작하는 Agar Plate Colony Counter 프로토타입. 서버 없음, 모든 이미지 분석은 클라이언트에서 실행.

## 현재 상태

`index.html` = v2 (엔진 추상화 리팩터링 완료). 단일 파일에 CSS+JS 전부 포함.

지원 Agar Type: **PCA, TSA, VRBA, NA, Custom** — 5개 고정. 새 타입 추가 금지(요구사항).

## 핵심 아키텍처 (반드시 유지할 것)

```
IMAGE → PLATE DETECTION → AGAR PROFILE → PREPROCESSING
      → DETECTION ENGINE (opencv | ai | hybrid)
      → INSTANCE COLONIES → FEATURE EXTRACTION
      → AGAR-SPECIFIC VALIDATION → CONFIDENCE
      → HUMAN REVIEW → FINAL COUNT → CFU/mL → SAVE / EXPORT
```

- `detectionEngine.detect(image, agarType, options)` 파사드가 opencv/ai/hybrid 분기. 기본값 `opencv`.
- `detectColoniesOpenCV()` — 실제 구현됨 (Sobel edge 기반 plate 검출, integral-image box blur, connected component, distance-transform 기반 watershed-lite 분리).
- `detectColoniesAI()` — **인터페이스만 존재, 모델 없음.** 백엔드 미등록 시 `{unavailable:true, reason:'AI Model Not Connected'}` 반환. 절대 가짜 결과를 만들면 안 됨.
- `colonyAI.register(agarType, {predict(imageData, opts)})` — 콘솔에서 모델 등록하는 진입점 (`window.colonyAI`).
- `extractInstanceFeatures()` — 모든 엔진이 공유하는 feature 추출 (area, diameter, perimeter, circularity, aspectRatio, solidity, extent, eccentricity, RGB/HSV/LAB, ΔE, contrast, texture, edgeStrength, haloScore, redPurpleScore).
- `validateInstance()` — agar별 `validationWeights`로 소프트 검증 점수. **hard threshold 금지** ("2mm보다 작으면 colony 아님" 같은 단일 조건 금지 — 원 요구사항).
- `computeConfidence()` — AI confidence / Image quality / Plate detection / Morphology validation / Detection stability를 분리 표시. AI 미연결 시 AI 항목은 `null`로 두고 UI에서 "not connected"로 표시.

## Agar별 특이사항

- **VRBA만 색상+halo가 핵심** (`detectionMode:'color-halo'`, hueGate `[280,20]` = purple→red→pink). 나머지는 형태/contrast가 우선.
- VRBA는 `vrbaCandidateClass()`로 typical/possible/atypical/non-target 구분 — 이건 균종 동정이 아니라 이미지 분석 결과라는 점을 UI 문구에서 계속 명시할 것.
- 종 동정(species identification) 관련 문구는 절대 넣지 말 것. "colony counting assistant, never species identification" 원칙 유지.

## 데이터 흐름 / 내보내기

- Human-in-the-loop: Add / Reject(negative class 라벨) / Merge / Split / Undo / Reset.
- `plate.corrections = {originalPrediction, userCorrections, correctedPrediction, timestamp, agarType}` — active learning용 교정 로그.
- **Export annotations** 버튼 → `dataset/<AGAR>/images/*.png` + `dataset/<AGAR>/masks/*.json` 레이아웃 JSON (RLE 마스크 포함).
- Negative sample 클래스: `dust, air_bubble, scratch, reflection, agar_defect, condensation, debris, not_colony`.

## 지금까지 합의된 로드맵

1. **GitHub 업로드** — 이 리포. GitHub Pages로 `index.html` 바로 배포.
2. **기능/디자인 개선** — 실제 사진으로 plate 검출 정확도 검증이 최우선 순위(지금은 합성 데모 이미지로만 검증됨). Evaluation 패널(ground truth count 입력)로 여러 사진에 대해 오차 측정하며 agar별 weight 튜닝.
3. **AI connect** — 2단계가 안정된 후. YOLOv8/v11-seg를 agar별 fine-tuning → ONNX export → ONNX Runtime Web으로 브라우저 로드 → `colonyAI.register()`에 연결하는 방향으로 합의됨. Export annotations JSON을 YOLO-seg 라벨 포맷으로 변환하는 스크립트가 필요.

이 순서를 건너뛰거나 AI 관련 기능을 앞당겨 구현하지 말 것 — 현재는 2단계 진행 전 단계.

## 하지 말아야 할 것

- OpenCV 엔진 제거/대체 금지 (향후 AI/hybrid와 병행 유지해야 함).
- 색상/크기 단일 조건으로 colony 판정하는 로직 추가 금지.
- AI가 연결 안 된 상태에서 AI confidence나 AI 결과를 표시하는 것 금지 — 항상 "AI Model Not Connected" 명시.
