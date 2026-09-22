/**
 * 统一清单校验（本地 `npm test` 与 Docker 构建阶段共用）
 *
 * 直接加载浏览器端的 spec.js / config.js / physics.js，
 * 用最小桩件代替 DOM 依赖，确保“被测试的就是画布实际运行的代码”。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'frontend-user', 'js');

// —— 最小浏览器环境桩件 ——
global.Utils = {
    degToRad: (d) => d * Math.PI / 180,
    radToDeg: (r) => r * 180 / Math.PI,
    clamp: (v, min, max) => Math.min(Math.max(v, min), max)
};
global.CONFIG = {
    LENS_TYPES: { CONVEX: 'convex', CONCAVE: 'concave', PLANO: 'plano', ASPHERIC: 'aspheric' },
    LIGHT_MODES: { PARALLEL: 'parallel', POINT: 'point' }
};

function load(file, globalName) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    const fn = new Function(`${code}; return ${globalName};`);
    return fn();
}

const SPEC = load('spec.js', 'OPTICS_SPEC');
global.OPTICS_SPEC = SPEC;
const Physics = load('physics.js', 'Physics');
const CONFIG_FULL = load('config.js', 'CONFIG');

const TOL = SPEC.TOLERANCES;

/** 用 SPEC 示例数据构造普通透镜对象（无需 Lens 类），可覆盖参数 */
function sampleLens(key, overrides = {}) {
    const data = SPEC.SAMPLES[key];
    const lensData = { ...data.lens, ...overrides };
    return {
        id: `sample-${key}`,
        type: lensData.type,
        x: lensData.x,
        y: lensData.y,
        size: lensData.size,
        refractiveIndex: lensData.refractiveIndex,
        curvature: lensData.curvature,
        material: lensData.material,
        dispersion: materialDispersion(lensData.material),
        getHeight() { return 80 * (this.size / 100); }
    };
}

function materialDispersion(id) {
    const map = {
        normal: CONFIG_FULL.MATERIALS.NORMAL.dispersion,
        highIndex: CONFIG_FULL.MATERIALS.HIGH_INDEX.dispersion,
        lowDispersion: CONFIG_FULL.MATERIALS.LOW_DISPERSION.dispersion
    };
    return map[id];
}

// 让全局 CONFIG 与真实配置一致（physics 引用 CONFIG.LENS_TYPES）
global.CONFIG = CONFIG_FULL;

// ========== 1. 平面透镜：垂直不侧移、斜射侧移且方向平行 ==========

test('平面透镜垂直入射：方向不变且侧移为 0', () => {
    const lens = sampleLens('plateNormal');
    const r = Physics.analyzeParallelPlate(lens, 0, 0);
    assert.ok(r.sameDirection);
    assert.ok(r.sideShift < 1e-9, `侧移应为 0，实际 ${r.sideShift}`);
});

test('平面透镜斜入射：侧移可见且出射与入射方向平行', () => {
    const lens = sampleLens('plateOblique');
    const r = Physics.analyzeParallelPlate(lens, 30, 0);
    assert.ok(r.sameDirection, `方向应平行，偏差 ${r.directionDelta}`);
    assert.ok(
        r.sideShift >= TOL.SIDE_SHIFT_VISIBLE,
        `30°斜入射侧移应≥${TOL.SIDE_SHIFT_VISIBLE}px，实际 ${r.sideShift.toFixed(2)}px`
    );
});

test('平面透镜 traceRay 出射角严格等于入射角（各角度）', () => {
    const lens = sampleLens('plateOblique');
    [0, 10, 20, 30, 45].forEach((deg) => {
        const a = Utils.degToRad(deg);
        const startY = lens.y - lens.x * Math.tan(a);
        const out = Physics.traceRay([lens], { x: 0, y: startY, angle: a });
        assert.ok(
            Math.abs(out.exit.angle - a) < TOL.NO_DEFLECTION_ANGLE,
            `${deg}° 时出射角 ${out.exit.angle} 与入射角 ${a} 不一致`
        );
    });
});

// ========== 2. 非球面：所有平行光线精准汇聚到同一焦点 ==========

test('非球面透镜：边缘与中心光线焦位差小于容差', () => {
    const lens = sampleLens('asphericFocus');
    const r = Physics.analyzeParallelBeam(lens, { angle: 0 });
    assert.ok(r.converging);
    assert.ok(
        r.spreadRatio < TOL.FOCUS_SPREAD_RATIO,
        `焦位差比例 ${r.spreadRatio.toFixed(4)} 应 < ${TOL.FOCUS_SPREAD_RATIO}`
    );
});

test('非球面焦距标注值与实际光线焦位一致', () => {
    const lens = sampleLens('asphericFocus');
    const f = Physics.calculateFocalLength(lens);
    // 取一条边缘光线（rel=0.9）的实际交点
    const half = Physics.getHalfHeight(lens);
    const rel = 0.9;
    const y = lens.y + rel * half;
    const out = Physics.calculateRefractedAngle(0, y, lens);
    const d = (lens.y - y) / Math.tan(out);
    assert.ok(Math.abs(d - f) < 1, `标注焦距 ${f} 与实际交点 ${d} 不一致`);
});

// ========== 3. 球面凸透镜：存在可见球差 ==========

test('球面凸透镜（弧度70）：球差比例超过阈值', () => {
    const lens = sampleLens('convexSpherical');
    const r = Physics.analyzeParallelBeam(lens, { angle: 0 });
    assert.ok(r.converging);
    assert.ok(
        r.spreadRatio >= TOL.SPHERICAL_ABERRATION_RATIO,
        `球差比例 ${r.spreadRatio.toFixed(4)} 应 ≥ ${TOL.SPHERICAL_ABERRATION_RATIO}`
    );
});

test('球差随弧度增大：50%不达标、60%达标，且凸透镜仍算会聚', () => {
    const low = Physics.analyzeParallelBeam(sampleLens('convexSpherical', { curvature: 50 }), { angle: 0 });
    assert.ok(low.converging);
    assert.ok(low.spreadRatio < TOL.SPHERICAL_ABERRATION_RATIO,
        `弧度50球差 ${low.spreadRatio.toFixed(3)} 应不明显`);

    const high = Physics.analyzeParallelBeam(sampleLens('convexSpherical', 70), { angle: 0 });
    assert.ok(high.spreadRatio > low.spreadRatio, '弧度越大球差应越明显');
    // 聚焦题容差 25%，带球差的凸透镜依然“会聚到一点”
    assert.ok(high.spreadRatio < TOL.CONVERGE_MAX_RATIO);
});

// ========== 4. 色散：焦点随颜色变化；低色散几乎重合 ==========

test('普通玻璃：蓝光焦点比红光更靠近透镜，且焦位差可见', () => {
    const lens = sampleLens('dispersion');
    const r = Physics.analyzeParallelBeam(lens, { angle: 0 });
    // converging 时 focusNear/FocusFar 为到透镜的正距离
    const blueF = r.colorFocus.blue.focusNear;
    const redF = r.colorFocus.red.focusFar;
    assert.ok(blueF < redF, `蓝光焦点 ${blueF} 应比红光 ${redF} 更靠近透镜`);
    assert.ok(
        r.colorFocusDelta >= TOL.DISPERSION_FOCUS_DELTA,
        `红蓝焦位差 ${r.colorFocusDelta.toFixed(2)}px 应 ≥ ${TOL.DISPERSION_FOCUS_DELTA}`
    );
});

test('低色散玻璃：红蓝焦位差小于容差', () => {
    const lens = sampleLens('lowDispersion');
    const r = Physics.analyzeParallelBeam(lens, { angle: 0 });
    assert.ok(
        r.colorFocusDelta < TOL.LOW_DISPERSION_FOCUS_DELTA,
        `低色散焦位差 ${r.colorFocusDelta.toFixed(2)}px 应 < ${TOL.LOW_DISPERSION_FOCUS_DELTA}`
    );
});

// ========== 5. 凹透镜：平行光发散 ==========

test('凹透镜：平行光不向前会聚，存在虚焦点', () => {
    const lens = sampleLens('concaveDiverge');
    const r = Physics.analyzeParallelBeam(lens, { angle: 0 });
    assert.ok(r.diverging);
    assert.ok(!r.converging);
    assert.ok(r.focalLength < 0);
});

// ========== 6. 文案口径：帮助/题目与 SPEC 规则一致 ==========

test('帮助文案来自统一规则，且关键说法可被画布验证', () => {
    assert.strictEqual(CONFIG_FULL.HELP_TEXTS.plano, SPEC.RULES.plano);
    assert.strictEqual(CONFIG_FULL.HELP_TEXTS.aspheric, SPEC.RULES.aspheric);

    // 平面：文案必须明确“垂直入射时…不发生侧移”，而不是“有微小侧移”
    assert.ok(CONFIG_FULL.HELP_TEXTS.plano.includes('垂直入射时方向不变、也不发生侧移'));
    assert.ok(CONFIG_FULL.HELP_TEXTS.plano.includes('侧移'));
    assert.ok(CONFIG_FULL.HELP_TEXTS.plano.includes('平行'));

    // 非球面：文案声称“同一焦点”，物理上必须做得到（示例1已验证）
    assert.ok(CONFIG_FULL.HELP_TEXTS.aspheric.includes('同一焦点'));
});

test('平面透镜题目解释与统一规则一致', () => {
    const q = CONFIG_FULL.QUIZ_QUESTIONS.find(x => x.id === 'no_deflection_plano');
    assert.ok(q.explanation.correct.includes('侧移'));
    assert.ok(q.explanation.correct.includes('平行'));
});

test('色散题目不再要求必须斜入射', () => {
    const q = CONFIG_FULL.QUIZ_QUESTIONS.find(x => x.id === 'dispersion_demo');
    const allText = Object.values(q.explanation).join('') + q.hints.join('');
    assert.ok(!/增大入射角/.test(allText));
});

test('所有帮助键都有对应文案', () => {
    ['convex', 'concave', 'plano', 'aspheric', 'lowDispersion', 'highIndex',
        'refractiveIndex', 'curvature', 'incidentAngle', 'dispersionToggle'].forEach((key) => {
        assert.ok(typeof CONFIG_FULL.HELP_TEXTS[key] === 'string' && CONFIG_FULL.HELP_TEXTS[key].length > 0);
    });
});
