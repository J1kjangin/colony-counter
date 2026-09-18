"""
Petricore 4개 모델 Kaggle 학습 스크립트
======================================
Kaggle 노트북 셀에 통째로 붙여넣고 실행하세요. (Accelerator: GPU T4 x2 또는 P100)

사전 준비
---------
1. Kaggle > Datasets > New Dataset 으로 아래 2개 zip 업로드
   - petricore_agar_AI_training_dataset.zip
   - petricore_dryMedia_AI_training_dataset.zip
   (하나의 데이터셋에 둘 다 넣어도 되고, 따로 만들어도 됩니다)
2. 노트북 우측 "+ Add Input" 에서 그 데이터셋을 연결
3. Settings > Accelerator > GPU 선택, Internet ON
4. 이 스크립트 실행

산출물
------
/kaggle/working/onnx/ 폴더에 ONNX 4개가 생성됩니다.
노트북 우측 Output 탭에서 다운로드 → Petricore v4 앱의 "AI 모델 설정" 4개 슬롯에 각각 연결.
"""

import os, shutil, zipfile
from pathlib import Path

os.system("pip install -q ultralytics onnx onnxslim onnxruntime")

from ultralytics import YOLO

WORK = Path("/kaggle/working")
DATA = WORK / "data"
OUT = WORK / "onnx"
DATA.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- 1. 데이터 준비
print("=" * 70)
print("1. 입력 데이터 탐색")
print("=" * 70)

INPUT = Path("/kaggle/input")

zips = sorted(INPUT.rglob("*.zip"))
if zips:
    for z in zips:
        print(f"  zip 발견: {z}  ({z.stat().st_size/1e6:.0f} MB)")
        with zipfile.ZipFile(z) as zf:
            zf.extractall(DATA)
else:
    # Kaggle이 데이터셋 생성 시 zip을 자동으로 압축 해제해버리는 경우가 있음.
    # 그 경우 /kaggle/input 안에 폴더 상태로 이미 존재 (단, 이 경로는 읽기 전용이라
    # dataset.yaml을 직접 고칠 수 없으므로 쓰기 가능한 DATA로 복사한다).
    found_any = False
    for yml in INPUT.rglob("dataset.yaml"):
        root = yml.parent
        if not (root / "images" / "train").is_dir():
            continue
        found_any = True
        dst = DATA / root.name
        if not dst.exists():
            shutil.copytree(root, dst)
            print(f"  압축 해제된 상태로 발견 (복사함): {root.name}")
    if not found_any:
        raise SystemExit("/kaggle/input 에서 학습 데이터를 찾지 못했습니다. 우측 '+ Add Input'으로 데이터셋을 연결하세요.")

# 각 detector 폴더를 찾아 dataset.yaml 의 path 를 절대경로로 교정
# (원본 yaml 은 path: . 이라 Kaggle 에서 그대로 쓰면 이미지를 못 찾습니다)
detectors = {}
for yml in DATA.rglob("dataset.yaml"):
    root = yml.parent
    if not (root / "images" / "train").is_dir():
        continue
    text = yml.read_text(encoding="utf-8")
    fixed = []
    for line in text.splitlines():
        fixed.append(f"path: {root.as_posix()}" if line.strip().startswith("path:") else line)
    yml.write_text("\n".join(fixed) + "\n", encoding="utf-8")
    detectors[root.name] = yml
    n_train = len(list((root / "images" / "train").glob("*")))
    n_val = len(list((root / "images" / "val").glob("*")))
    print(f"  준비됨: {root.name}  (train {n_train} / val {n_val})")

# ---------------------------------------------------------------- 2. 학습 설정
# imgsz 주의:
#   앱(Petricore v4)은 현재 640 고정 letterbox 로 추론합니다.
#   agar 콜로니는 1920x1200 원본에서 16px 이라 640 으로 줄이면 5.3px 이 되어
#   YOLO P3 헤드(stride 8) 한 칸보다 작아집니다. 그래서 1280 으로 학습합니다.
#   -> 이 모델을 쓰려면 앱의 해당 슬롯 입력 크기도 1280 으로 맞춰야 합니다.
CONFIGS = [
    # (detector 폴더명,                  base model,    imgsz, epochs, batch)
    ("dry_media_plate_detector",         "yolo11s.pt",   640,   120,   16),
    ("dry_media_colony_detector",        "yolo11s.pt",   640,   150,   16),
    ("agar_plate_plate_detector",        "yolo11s.pt",   640,   100,   16),
    ("agar_plate_colony_detector",       "yolo11s.pt",  1280,   200,    4),
]

results = {}

for name, base_model, imgsz, epochs, batch in CONFIGS:
    if name not in detectors:
        print(f"\n[건너뜀] {name}: 데이터가 없습니다.")
        continue

    print("\n" + "=" * 70)
    print(f"2. 학습: {name}  (imgsz={imgsz}, epochs={epochs}, batch={batch})")
    print("=" * 70)

    model = YOLO(base_model)
    model.train(
        data=str(detectors[name]),
        imgsz=imgsz,
        epochs=epochs,
        batch=batch,
        project=str(WORK / "runs"),
        name=name,
        exist_ok=True,
        patience=50,        # 개선 없으면 조기 종료
        pretrained=True,
        # 데이터가 적어 증강을 넉넉히
        degrees=180,        # 배지/필름은 회전 방향 의미 없음
        fliplr=0.5,
        flipud=0.5,
        scale=0.3,
        mosaic=1.0,
        close_mosaic=10,
        seed=0,
    )

    metrics = model.val()
    results[name] = {
        "mAP50": float(metrics.box.map50),
        "mAP50-95": float(metrics.box.map),
        "imgsz": imgsz,
    }

    # ---------- ONNX export (앱이 기대하는 형식: [1,3,imgsz,imgsz] -> [1,4+nc,N]) ----------
    onnx_path = model.export(format="onnx", imgsz=imgsz, opset=12, simplify=True, dynamic=False)
    dst = OUT / f"{name}.onnx"
    shutil.copy(onnx_path, dst)
    print(f"  ONNX 저장: {dst}  ({dst.stat().st_size/1e6:.1f} MB)")

# ---------------------------------------------------------------- 3. 결과 요약
print("\n" + "=" * 70)
print("3. 학습 결과 요약")
print("=" * 70)
for name, r in results.items():
    print(f"  {name:36s} imgsz={r['imgsz']:5d}  mAP50={r['mAP50']:.3f}  mAP50-95={r['mAP50-95']:.3f}")

print("\n생성된 ONNX 파일:")
for f in sorted(OUT.glob("*.onnx")):
    print(f"  {f.name}  ({f.stat().st_size/1e6:.1f} MB)")

print("""
다음 단계
---------
1. 노트북 우측 Output 탭에서 onnx/ 폴더의 4개 파일 다운로드
2. Petricore v4 앱 > AI 모델 설정 에서 각 슬롯에 연결
   - dryMedia 필름 분할  <- dry_media_plate_detector.onnx
   - dryMedia 콜로니     <- dry_media_colony_detector.onnx
   - agar plate 구역     <- agar_plate_plate_detector.onnx
   - agar 콜로니         <- agar_plate_colony_detector.onnx  (앱 입력 크기 1280 필요)
""")
