// v4의 AI 모듈에서 순수 함수(iou/nms/decode/toOriginal)를 그대로 꺼내 검증한다.
const fs = require('fs');
const assert = require('assert');

const FILE = require('path').join(__dirname, 'Petricore-Colony-Counter-v4.html');
const html = fs.readFileSync(FILE, 'utf8');

const start = html.indexOf('    function iou(a,b){');
const end = html.indexOf('    function makeSlot(spec){');
assert(start > 0 && end > start, '대상 함수 블록을 찾지 못했습니다');
const source = html.slice(start, end);

const CONF = 0.25, IOU_THR = 0.45;
const srcW = s => s.width, srcH = s => s.height;
const { iou, nms, decode, toOriginal } = new Function(
    'CONF', 'IOU_THR', 'srcW', 'srcH', 'document',
    source + '\nreturn {iou,nms,decode,toOriginal};'
)(CONF, IOU_THR, srcW, srcH, undefined);

// --- 원본 1000x500 이미지를 640 letterbox에 넣었을 때의 파라미터 ---
const W = 1000, H = 500;
const scale = Math.min(640 / W, 640 / H);        // 0.64
const padX = (640 - W * scale) / 2;               // 0
const padY = (640 - H * scale) / 2;               // 160
const p = { scale, padX, padY, W, H };

// 원본 좌표 (100,100)-(300,200) 상자를 모델 좌표로 환산
const box = { x1: 100, y1: 100, x2: 300, y2: 200 };
const mx1 = box.x1 * scale + padX, my1 = box.y1 * scale + padY;
const mx2 = box.x2 * scale + padX, my2 = box.y2 * scale + padY;
const cx = (mx1 + mx2) / 2, cy = (my1 + my2) / 2, bw = mx2 - mx1, bh = my2 - my1;

// --- YOLOv8 기본 출력 [1, 4+nc, N] (channel-first), nc=6, 640입력 기준 앵커 8400개 ---
const N = 8400, C = 10;
const data = new Float32Array(C * N);
const put = (r, c, v) => { data[c * N + r] = v; };
// row0: 정답 상자, class 2 (CC), score .9
put(0, 0, cx); put(0, 1, cy); put(0, 2, bw); put(0, 3, bh); put(0, 4 + 2, 0.9);
// row1: row0과 거의 겹치는 중복 상자, 같은 class, score .7 → NMS로 제거되어야 함
put(1, 0, cx + 2); put(1, 1, cy + 2); put(1, 2, bw); put(1, 3, bh); put(1, 4 + 2, 0.7);
// row2: CONF 미만 → 버려져야 함
put(2, 0, 10); put(2, 1, 10); put(2, 2, 20); put(2, 3, 20); put(2, 4 + 0, 0.1);

const dets = decode({ dims: [1, C, N], data });
assert.strictEqual(dets.length, 1, `NMS/CONF 후 1개여야 하는데 ${dets.length}개`);
assert.strictEqual(dets[0].cls, 2, `클래스가 2여야 하는데 ${dets[0].cls}`);
assert(Math.abs(dets[0].score - 0.9) < 1e-6, 'score 불일치');

const orig = toOriginal(dets[0], p);
for (const [k, want] of Object.entries(box)) {
    assert(Math.abs(orig[k] - want) < 0.5, `${k}: ${orig[k]} != ${want}`);
}
assert(Math.abs(orig.w - 200) < 0.5 && Math.abs(orig.h - 100) < 0.5, 'w/h 불일치');

// --- 전치된 출력 [1, N, 4+nc] 도 같은 결과여야 한다 ---
const dataT = new Float32Array(C * N);
for (let r = 0; r < N; r++) for (let c = 0; c < C; c++) dataT[r * C + c] = data[c * N + r];
const detsT = decode({ dims: [1, N, C], data: dataT });
assert.strictEqual(detsT.length, 1, '전치 출력에서 개수 불일치');
assert.strictEqual(detsT[0].cls, 2, '전치 출력에서 클래스 불일치');

// --- NMS 완료형 출력 [1,N,6] ---
const d6 = new Float32Array(6 * 2);
d6.set([mx1, my1, mx2, my2, 0.8, 4], 0);   // class 4
d6.set([0, 0, 10, 10, 0.1, 0], 6);          // CONF 미만
const dets6 = decode({ dims: [1, 2, 6], data: d6 });
assert.strictEqual(dets6.length, 1, '[1,N,6] 개수 불일치');
assert.strictEqual(dets6[0].cls, 4, '[1,N,6] 클래스 불일치');

// --- 클래스가 다르면 겹쳐도 NMS로 지워지면 안 된다 ---
const d2 = new Float32Array(C * N);
const put2 = (r, c, v) => { d2[c * N + r] = v; };
put2(0, 0, cx); put2(0, 1, cy); put2(0, 2, bw); put2(0, 3, bh); put2(0, 4 + 1, 0.9);
put2(1, 0, cx); put2(1, 1, cy); put2(1, 2, bw); put2(1, 3, bh); put2(1, 4 + 3, 0.8);
assert.strictEqual(decode({ dims: [1, C, N], data: d2 }).length, 2, '클래스별 NMS 실패');

// --- 지원하지 않는 형식은 조용히 통과시키지 말 것 ---
assert.throws(() => decode({ dims: [1, 4], data: new Float32Array(4) }), /지원하지 않는/);

console.log('decode/NMS/letterbox 역변환 검증 통과');
