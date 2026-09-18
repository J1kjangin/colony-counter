// v4의 <style>을 실제 캐스케이드(미디어쿼리 + 명시도 + 선언 순서)대로 계산해서
// 창 너비별로 어떤 선언이 최종 적용되는지 확인한다.
// dryMedia 탭이 좁은 창에서도 2단으로 남아있던 문제를 잡기 위한 검증.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'Petricore-Colony-Counter-v4.html'), 'utf8');
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');   // 주석 제거: 주석 안의 중괄호를 룰로 오인하지 않도록

// --- 아주 단순한 CSS 파서: @media 블록과 일반 룰만 다룬다 ---
function parseRules(text, media = null, out = [], orderRef = { n: 0 }) {
    const re = /@media([^{]+)\{([\s\S]*?)\n\}|([^{}@]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m[1] !== undefined) {
            parseRules(m[2], m[1].trim(), out, orderRef);
        } else {
            const decls = {};
            for (const part of m[4].split(';')) {
                const i = part.indexOf(':');
                if (i > 0) decls[part.slice(0, i).trim()] = part.slice(i + 1).trim();
            }
            for (const sel of m[3].split(',')) {
                const s = sel.trim();
                if (s) out.push({ selector: s, decls, media, order: orderRef.n++ });
            }
        }
    }
    return out;
}
const rules = parseRules(css);

// --- 미디어 조건 평가 (max-width / max-height 만 사용 중) ---
function mediaMatches(cond, vp) {
    if (!cond) return true;
    let ok = true;
    for (const m of cond.matchAll(/\(\s*(max|min)-(width|height)\s*:\s*(\d+)px\s*\)/g)) {
        const [, minmax, axis, px] = m;
        const v = axis === 'width' ? vp.width : vp.height;
        ok = ok && (minmax === 'max' ? v <= +px : v >= +px);
    }
    return ok;
}

// --- 선택자 매칭: "A B" 후손 조합 + 복합(#id.class.class/tag)만 지원 ---
function compoundMatches(tok, el) {
    for (const p of tok.match(/[#.]?[A-Za-z0-9_-]+/g) || []) {
        if (p.startsWith('#')) { if (el.id !== p.slice(1)) return false; }
        else if (p.startsWith('.')) { if (!el.classes.includes(p.slice(1))) return false; }
        else if (el.tag !== p) return false;
    }
    return true;
}
function selectorMatches(sel, el, ancestors) {
    if (/[>+~:[]/.test(sel)) return false;             // 이 스타일시트에선 대상 룰에 안 쓰임
    const toks = sel.split(/\s+/).filter(Boolean);
    if (!compoundMatches(toks[toks.length - 1], el)) return false;
    let i = toks.length - 2, pool = ancestors.slice();
    while (i >= 0) {
        let found = false;
        while (pool.length) { const a = pool.pop(); if (compoundMatches(toks[i], a)) { found = true; break; } }
        if (!found) return false;
        i--;
    }
    return true;
}
function specificity(sel) {
    return [(sel.match(/#/g) || []).length, (sel.match(/\./g) || []).length, (sel.match(/(^|\s)[a-z]+/g) || []).length];
}
function cmp(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

function computed(el, ancestors, prop, vp) {
    let best = null;
    for (const r of rules) {
        if (!(prop in r.decls)) continue;
        if (!mediaMatches(r.media, vp)) continue;
        if (!selectorMatches(r.selector, el, ancestors)) continue;
        const sp = specificity(r.selector);
        if (!best || cmp(sp, best.sp) > 0 || (cmp(sp, best.sp) === 0 && r.order > best.order)) {
            best = { value: r.decls[prop], sp, order: r.order, selector: r.selector };
        }
    }
    return best;
}

const dryView = { tag: 'section', id: 'dryMediaView', classes: ['tab-view', 'active'] };
const agarView = { tag: 'section', id: 'agarView', classes: ['tab-view', 'active'] };
const drySplit = { tag: 'main', id: '', classes: ['main-split'] };
const agarSplit = { tag: 'main', id: '', classes: ['agar-main-split'] };

const columnCount = v => (v.value.match(/minmax\([^)]*\)|[\d.]+fr/g) || []).length;
const vp = (w, h = 900) => ({ width: w, height: h });

console.log('창 너비별 dryMedia / agar 열 수');
for (const w of [1600, 1200, 1100, 1000, 820]) {
    const d = computed(drySplit, [dryView], 'grid-template-columns', vp(w));
    const a = computed(agarSplit, [agarView], 'grid-template-columns', vp(w));
    console.log(`  ${String(w).padStart(4)}px  dryMedia ${columnCount(d)}단 (${d.selector})   agar ${columnCount(a)}단 (${a.selector})`);
}

// 넓은 창: 두 탭 모두 2단
assert.strictEqual(columnCount(computed(drySplit, [dryView], 'grid-template-columns', vp(1600))), 2);
assert.strictEqual(columnCount(computed(agarSplit, [agarView], 'grid-template-columns', vp(1600))), 2);

// 좁은 창: 두 탭 모두 1단으로 쌓여야 한다 (이게 깨져 있던 부분)
for (const w of [1000, 820]) {
    assert.strictEqual(columnCount(computed(drySplit, [dryView], 'grid-template-columns', vp(w))), 1,
        `${w}px에서 dryMedia가 1단으로 안 바뀜`);
    assert.strictEqual(columnCount(computed(agarSplit, [agarView], 'grid-template-columns', vp(w))), 1,
        `${w}px에서 agar가 1단으로 안 바뀜`);
}

// 쌓였을 때 잘리지 않고 스크롤되어야 한다
for (const [name, view, split] of [['dryMedia', dryView, drySplit], ['agar', agarView, agarSplit]]) {
    const ov = computed(view, [], 'overflow', vp(1000));
    assert.strictEqual(ov.value, 'auto', `${name} 탭이 좁은 창에서 스크롤되지 않음 (${ov.value})`);
    const h = computed(split, [view], 'height', vp(1000));
    assert.strictEqual(h.value, 'auto', `${name} 내부 높이가 100%로 고정되어 내용이 잘림`);
}

// 넓은 창에서는 한 화면에 맞추는 기존 동작(스크롤 없음)이 유지되어야 한다
assert.strictEqual(computed(dryView, [], 'overflow', vp(1600)).value, 'hidden');
assert.strictEqual(computed(drySplit, [dryView], 'height', vp(1600)).value, '100%');

// 좌측 컬럼이 컨테이너 높이에 맞춰 늘어나야 표 하단(페이지네이션)이 잘리지 않는다.
// align-items:start 였을 때 dryMedia만 아래가 잘렸다.
for (const w of [1600, 1280]) {
    const ai = computed(drySplit, [dryView], 'align-items', vp(w));
    assert.strictEqual(ai && ai.value, 'stretch',
        `${w}px에서 dryMedia align-items가 ${ai && ai.value} — 좌측 컬럼 하단이 잘림`);
}
// agar는 애초에 지정이 없어 기본값(stretch)이라 정상이었다
assert.strictEqual(computed(agarSplit, [agarView], 'align-items', vp(1600)), null);

// 뷰어는 agar와 같이 컨테이너 높이를 그대로 채워야 한다
const viewer = { tag: 'div', id: '', classes: ['panel', 'viewer-panel'] };
const agarViewer = { tag: 'div', id: '', classes: ['panel', 'agar-viewer-panel'] };
assert.strictEqual(computed(viewer, [dryView, drySplit], 'height', vp(1600)).value, '100%');
assert.strictEqual(computed(agarViewer, [agarView, agarSplit], 'height', vp(1600)).value, '100%');
assert.strictEqual(computed(viewer, [dryView, drySplit], 'min-height', vp(1600)).value, '0');

// JS가 px로 높이를 고정하면 CSS가 무시되므로, 그런 코드가 다시 들어오면 실패시킨다
for (const dead of ['syncPanelHeights', 'measureRowMetrics', 'viewerPanel.style.height']) {
    assert(!html.includes(dead), `높이를 px로 고정하는 코드가 남아있음: ${dead}`);
}

console.log('반응형 캐스케이드 검증 통과');
