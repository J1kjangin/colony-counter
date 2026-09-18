// v4의 AI 전용 분할/검출 헬퍼를 실제 코드 그대로 꺼내 검증한다.
// 핵심: 모델이 없으면 분할도 검출도 하지 않고 원본 그대로 남아야 한다.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'Petricore-Colony-Counter-v4.html'), 'utf8');
const start = html.indexOf('const AI_NO_MODEL');
const end = html.indexOf('function rotateCanvas90');
assert(start > 0 && end > start, 'AI 헬퍼 블록을 찾지 못했습니다');

const win = {};
const { aiSplit, aiDetectColonies, untrainedTypeReason } = new Function(
    'window', 'console',
    html.slice(start, end) + '\nreturn {aiSplit,aiDetectColonies,untrainedTypeReason};'
)(win, { error() {} });

const canvas = { width: 1000, height: 800 };

(async () => {
    // --- 모델 미연결: 원본 그대로, 검출 0 ---
    win.PetricoreAI = undefined;
    let split = await aiSplit('dryMedia', canvas);
    assert.deepStrictEqual(split.panels, [canvas], '모델 없으면 원본 1장 그대로여야 함');
    assert.strictEqual(split.reason, 'AI 모델 미연결');

    let det = await aiDetectColonies('dryMedia', canvas);
    assert.deepStrictEqual(det.colonies, [], '모델 없으면 콜로니 0개');
    assert.strictEqual(det.reason, 'AI 모델 미연결');

    // --- 슬롯은 있지만 모델 미로드 ---
    win.PetricoreAI = { agar: { plate: { isReady: () => false }, colony: { isReady: () => false } } };
    split = await aiSplit('agar', canvas);
    assert.strictEqual(split.panels.length, 1, 'agar도 모델 없으면 분할 안 함');
    assert.strictEqual((await aiDetectColonies('agar', canvas)).colonies.length, 0);

    // --- 모델 연결: 분할은 읽기 순서(위->아래, 왼->오른쪽) ---
    const boxes = [
        { x1: 500, y1: 10, x2: 900, y2: 300, w: 400, h: 290 },   // 오른쪽 위
        { x1: 10, y1: 400, x2: 400, y2: 700, w: 390, h: 300 },   // 아래
        { x1: 10, y1: 20, x2: 400, y2: 300, w: 390, h: 280 }     // 왼쪽 위
    ];
    win.PetricoreAI = {
        dryMedia: {
            film: { isReady: () => true, detect: async () => boxes, crop: (src, b) => ({ tag: b.x1 + ',' + b.y1 }) },
            colony: {
                isReady: () => true,
                detect: async () => [{ x1: 100, y1: 200, x2: 110, y2: 214, w: 10, h: 14, score: 0.8, cls: 1, label: 'EC' }]
            }
        }
    };
    split = await aiSplit('dryMedia', canvas);
    assert.deepStrictEqual(split.panels.map(p => p.tag), ['10,20', '500,10', '10,400'], '읽기 순서 정렬 실패');
    assert.strictEqual(split.reason, '');

    det = await aiDetectColonies('dryMedia', canvas);
    assert.strictEqual(det.colonies.length, 1);
    const c = det.colonies[0];
    assert.strictEqual(c.x, 105, '중심 x');
    assert.strictEqual(c.y, 207, '중심 y');
    assert.strictEqual(c.radius, 5, '반지름 = 짧은 변/2');
    assert.strictEqual(c.label, 'EC');
    assert.strictEqual(c.color, 'red');

    // --- 모델이 아무것도 못 찾으면 원본 유지 + 사유 ---
    win.PetricoreAI.dryMedia.film.detect = async () => [];
    split = await aiSplit('dryMedia', canvas);
    assert.deepStrictEqual(split.panels, [canvas], '미검출 시 원본 유지');
    assert.strictEqual(split.reason, '구역 미검출');

    // --- 검출 중 오류가 나도 앱이 죽지 않고 사유를 남긴다 ---
    win.PetricoreAI.dryMedia.colony.detect = async () => { throw new Error('세션 없음'); };
    det = await aiDetectColonies('dryMedia', canvas);
    assert.deepStrictEqual(det.colonies, []);
    assert(det.reason.includes('세션 없음'), '오류 사유 전달 실패');

    // --- 학습 데이터 없는 타입 안내 ---
    assert(untrainedTypeReason('dryMedia', 'EB').includes('항상 0'));
    assert(untrainedTypeReason('dryMedia', 'YM').includes('항상 0'));
    assert(untrainedTypeReason('agar', 'SDA').includes('항상 0'));
    assert.strictEqual(untrainedTypeReason('agar', 'VRBA'), '', 'VRBA는 학습됨');
    assert.strictEqual(untrainedTypeReason('dryMedia', 'AC'), '');

    console.log('AI 전용 분할/검출 파이프라인 검증 통과');
})();
