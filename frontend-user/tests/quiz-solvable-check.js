/**
 * 题目可行性测试：对每一道测验题构造其说明所暗示的“标准答案”配置，
 * 验证在画布真实物理规则下提交一定能通过。
 * 防止题目文案承诺的操作实际上做不到（如色散题此前根本没有色散开关）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const sandbox = {
    console, Math, Infinity, NaN, Date, JSON, Object, Array, Number, String,
    Boolean, parseFloat, parseInt, isFinite, isNaN, RegExp, Error,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {}, clearInterval: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: {}, navigator: { maxTouchPoints: 0 }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(rel) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf-8'), sandbox, { filename: rel });
}

['js/config.js', 'js/utils.js', 'js/physics.js', 'js/lens.js'].forEach(load);
vm.runInContext(
    'globalThis.__t = { Physics, Lens, CONFIG };', sandbox
);
const { Lens, CONFIG } = sandbox.__t;

// 极简 CanvasManager/Renderer 桩，QuizManager 只用到这些
function makeHarness() {
    const lenses = [];
    return {
        canvasManager: {
            lenses,
            getRenderer() { return renderer; }
        },
        renderer: null
    };
}

// 直接在沙箱里重建 QuizManager 需要的最小环境并加载 quiz.js
sandbox.window.addEventListener = () => {};
sandbox.addEventListener = () => {};
sandbox.CustomEvent = class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } };
sandbox.dispatchEvent = () => true;

// 每题的标准解
const SOLUTIONS = {
    focus_convex: () => ({ type: 'convex', curvature: 50, light: 'parallel', running: true }),
    diverge_concave: () => ({ type: 'concave', curvature: 50, light: 'parallel', running: true }),
    no_deflection_plano: () => ({ type: 'plano', light: 'parallel', angle: 0, running: true }),
    myopia_correction: () => ({ type: 'concave', ri: 1.5, running: true }),
    hyperopia_correction: () => ({ type: 'convex', ri: 1.5, running: true }),
    magnifier: () => ({ type: 'convex', curvature: 70, ri: 1.5, running: true }),
    dispersion_demo: () => ({
        type: 'convex', material: 'normal', curvature: 70,
        light: 'parallel', dispersion: true, running: true
    }),
    low_dispersion_lens: () => ({
        type: 'convex', material: 'lowDispersion', dispersion: true, running: true
    }),
    spherical_aberration: () => ({ type: 'convex', curvature: 70, light: 'parallel', running: true }),
    aspheric_correction: () => ({ type: 'aspheric', curvature: 50, light: 'parallel', running: true })
};

// 在沙箱内执行测试主体（复用 QuizManager 类）
const testCode = `
(() => {
    const results = [];
    for (const q of CONFIG.QUIZ_QUESTIONS) {
        const spec = __SOLUTIONS[q.id]();
        const lens = new Lens({
            type: spec.type,
            x: 300, y: 300,
            curvature: spec.curvature,
            material: spec.material || 'normal'
        });
        if (spec.ri) lens.refractiveIndex = spec.ri;

        const renderer = {
            lightMode: spec.light || 'parallel',
            incidentAngle: spec.angle || 0,
            showDispersion: !!spec.dispersion,
            isRunning: spec.running
        };
        const canvasManager = { lenses: [lens], getRenderer: () => renderer };
        const quiz = new QuizManager(canvasManager);
        quiz.currentQuestion = q;

        const out = quiz.submitAnswer();
        results.push({ id: q.id, isCorrect: out.isCorrect, explanation: out.explanation,
                       details: out.details.filter(d => !d.correct).map(d => d.name + ':' + d.actual) });
    }
    return results;
})()
`;

// quiz.js 顶层 const QuizManager 需在同一 context 词法环境中
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/quiz.js'), 'utf-8'), sandbox, { filename: 'quiz.js' });
sandbox.__SOLUTIONS = SOLUTIONS;
const results = vm.runInContext(testCode, sandbox);

let failed = 0;
for (const r of results) {
    if (r.isCorrect) {
        console.log(`PASS ${r.id}`);
    } else {
        failed++;
        console.log(`FAIL ${r.id} —— 失败检查项: ${r.details.join('; ') || '(无详情)'}`);
        console.log(`       解释: ${r.explanation}`);
    }
}
if (failed) {
    console.log(`\n${failed} 道题的标准解未通过`);
    process.exit(1);
}
console.log(`\n全部 ${results.length} 道题的标准解均通过。`);
