// Agar 에디터 mm 격자 회귀 테스트.
// 배경: agarPxPerMm이 캔버스 대신 plate 박스({w,h})를 받도록 바뀌었는데, drawMmGrid가
// 여전히 캔버스({width,height})를 넘겨서 Math.min(undefined,undefined)=NaN이 되고
// 격자선이 한 줄도 안 그려지는 회귀가 있었다(1fbdf0f/bfbe31c).
//
// 이 테스트는 drawMmGrid의 "산수를 재구현"하지 않는다 — 산수를 재구현하면 drawMmGrid가
// 실제로 무엇을 넘기든 결과가 안 바뀌어서 버그를 못 잡는다(1차 버전의 실패 원인).
// 대신 HTML에서 drawMmGrid의 실제 본문을 중괄호 균형으로 그대로 꺼내 stub ctx/this로
// 실행하고, stroke() 호출 횟수(격자선이 실제로 그려졌는가)와 arc() 반지름이 유한수인가를 센다.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function extractAgarHelpers(html) {
    const start = html.indexOf('const AGAR_TYPE_OPTIONS');
    const end = html.indexOf('async function createAgarRecordFromCanvas');
    assert(start > 0 && end > start, 'Agar 규칙 블록을 찾지 못했습니다');
    const { agarPxPerMm, AGAR_PLATE_MM } = new Function(
        html.slice(start, end) + '\nreturn {agarPxPerMm, AGAR_PLATE_MM};'
    )();
    return { agarPxPerMm, AGAR_PLATE_MM };
}

// drawMmGrid(sx, sy, sw, sh) { ... } 본문을 중괄호 깊이를 세서 그대로 꺼낸다(정규식으로
// 끝을 추측하지 않음 — 본문 안에 중괄호가 여러 겹 있어서 오려내면 코드가 깨진다).
function extractDrawMmGridBody(html) {
    const sigIdx = html.indexOf('drawMmGrid(sx, sy, sw, sh) {');
    assert(sigIdx > 0, 'drawMmGrid를 찾지 못했습니다');
    const openBrace = html.indexOf('{', sigIdx);
    let depth = 0, i = openBrace;
    for (; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') { depth--; if (depth === 0) break; }
    }
    assert(depth === 0, 'drawMmGrid의 중괄호 짝을 못 찾았습니다');
    return html.slice(openBrace + 1, i);
}

function makeCtxStub() {
    const calls = { stroke: 0, arcRadii: [], strokeStyles: [] };
    return {
        calls,
        get strokeStyle() { return this._strokeStyle; },
        set strokeStyle(v) { this._strokeStyle = v; calls.strokeStyles.push(v); },
        lineWidth: 1,
        beginPath() {}, moveTo() {}, lineTo() {},
        stroke() { calls.stroke++; },
        arc(x, y, r) { calls.arcRadii.push(r); },
        setLineDash() {},
    };
}

// drawMmGrid 본문을 실행 가능한 함수로 만든다. agarPxPerMm/AGAR_PLATE_MM은 본문 안에서
// 자유 변수로 쓰이므로 클로저로 넣어준다. this 바인딩은 .call()로 그대로 전달한다.
function makeDrawMmGridFn(body, agarPxPerMm, AGAR_PLATE_MM) {
    const inner = new Function('agarPxPerMm', 'AGAR_PLATE_MM', 'sx', 'sy', 'sw', 'sh', body);
    return function (sx, sy, sw, sh) {
        return inner.call(this, agarPxPerMm, AGAR_PLATE_MM, sx, sy, sw, sh);
    };
}

function runDrawMmGrid(drawMmGridFn, { canvas, plateBox, gridMm }) {
    const ctx = makeCtxStub();
    const self = { ctx, scale: 1, cssW: canvas.width, cssH: canvas.height, gridMm, record: { canvas, plateBox } };
    drawMmGridFn.call(self, 0, 0, canvas.width, canvas.height);
    return ctx.calls;
}

function verify(html, label) {
    const { agarPxPerMm, AGAR_PLATE_MM } = extractAgarHelpers(html);
    const body = extractDrawMmGridBody(html);
    const drawMmGridFn = makeDrawMmGridFn(body, agarPxPerMm, AGAR_PLATE_MM);
    const canvas = { width: 900, height: 900 };

    // agarPxPerMm 자체의 계약: plate 미검출(null)이면 null — VRBA 필터가 캔버스로
    // 조용히 폴백하면 안 된다는 보장은 그대로 유지돼야 한다.
    assert.strictEqual(agarPxPerMm(null), null, `[${label}] agarPxPerMm(null)이 null이 아닙니다(VRBA 오염 위험)`);
    assert(Number.isFinite(agarPxPerMm({ w: 900, h: 900 })), `[${label}] plate 박스가 있는데 agarPxPerMm이 유한수가 아닙니다`);

    // drawMmGrid 실제 코드 실행: plate 박스 있음/없음 x gridMm 여러 값에서
    // 격자선이 실제로 그려지는지(stroke 호출이 1회보다 많은지) 확인.
    // stroke 1회뿐이면 90mm 원만 그려지고 격자선은 0줄이라는 뜻 — 이번 버그 그 자체.
    for (const plateBox of [{ w: 900, h: 900 }, null]) {
        for (const gridMm of [0.1, 1, 5, 90]) {
            const calls = runDrawMmGrid(drawMmGridFn, { canvas, plateBox, gridMm });
            assert(
                calls.stroke > 1,
                `[${label}] plateBox=${plateBox ? '있음' : '없음'} gridMm=${gridMm}: stroke 호출이 ${calls.stroke}회뿐입니다(격자선 0줄 — 회귀 재현)`
            );
            assert(
                calls.arcRadii.length > 0 && calls.arcRadii.every(Number.isFinite),
                `[${label}] plateBox=${plateBox ? '있음' : '없음'} gridMm=${gridMm}: 90mm 원 반지름이 유한수가 아닙니다: ${calls.arcRadii}`
            );
        }
    }

    // plate 박스 유무에 따라 90mm 원 색이 달라야 한다(추정값임을 눈으로 구분하는 장치).
    const withBoxColor = runDrawMmGrid(drawMmGridFn, { canvas, plateBox: { w: 900, h: 900 }, gridMm: 1 }).strokeStyles.pop();
    const noBoxColor = runDrawMmGrid(drawMmGridFn, { canvas, plateBox: null, gridMm: 1 }).strokeStyles.pop();
    assert.notStrictEqual(withBoxColor, noBoxColor, `[${label}] plate 박스 유무에 따라 90mm 원 색이 달라지지 않습니다`);

    console.log(`[${label}] Agar mm 격자 회귀 테스트 통과 (plate 박스 있음/없음 × gridMm 0.1/1/5/90 전부 격자선 실측, 원 색 구분 확인)`);
}

const targetPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'Petricore-Colony-Counter-v4.html');
const html = fs.readFileSync(targetPath, 'utf8');
verify(html, path.basename(targetPath));
