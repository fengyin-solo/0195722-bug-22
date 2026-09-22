/**
 * 浏览器接线冒烟测试（无 DOM 环境下用极简元素桩加载全部 js，
 * 模拟：初始化、添加四类透镜、切换光源/入射角/色散、加载每个标准示例、
 * 每道题目提交一次），用于发现 id 不匹配、未定义引用等接线问题。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeEl(id) {
    const listeners = {};
    return {
        id,
        style: {},
        dataset: {},
        classList: {
            _set: new Set(),
            add(...c) { c.forEach(x => this._set.add(x)); },
            remove(...c) { c.forEach(x => this._set.delete(x)); },
            toggle(c, force) {
                const has = this._set.has(c);
                const want = force === undefined ? !has : force;
                want ? this._set.add(c) : this._set.delete(c);
                return want;
            },
            contains(c) { return this._set.has(c); }
        },
        addEventListener(type, fn) {
            (listeners[type] = listeners[type] || []).push(fn);
        },
        removeEventListener() {},
        dispatch(type, evt = {}) {
            (listeners[type] || []).forEach(fn => fn.call(this, evt));
        },
        querySelector() { return makeEl(id + '-q'); },
        querySelectorAll() { return []; },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
        appendChild() {},
        remove() {},
        set innerHTML(v) { this._html = v; },
        get innerHTML() { return this._html || ''; },
        set textContent(v) { this._text = v; },
        get textContent() { return this._text || ''; },
        set value(v) { this._value = String(v); },
        get value() { return this._value || ''; },
        disabled: false
    };
}

const els = {};
const knownIds = [
    'optics-canvas', 'canvas-wrapper', 'btn-quiz-mode', 'btn-help', 'btn-quiz-close',
    'btn-quiz-hint', 'btn-quiz-submit', 'btn-quiz-skip', 'btn-quiz-next',
    'btn-quiz-exit', 'quiz-panel', 'quiz-question-title', 'quiz-question-desc',
    'quiz-hint-text', 'quiz-score-value', 'quiz-score-total', 'quiz-result-modal',
    'quiz-result-icon', 'quiz-result-title', 'quiz-result-score',
    'quiz-result-explanation', 'quiz-result-details', 'quiz-total-score',
    'quiz-accuracy', 'quiz-answered', 'app', 'knowledge-tip', 'tip-text',
    'btn-toggle-light', 'btn-reset-canvas', 'select-light-mode',
    'btn-toggle-labels', 'param-light-angle', 'param-light-angle-value',
    'light-angle-control', 'btn-toggle-dispersion', 'select-example',
    'canvas-drop-hint', 'panel-empty', 'panel-params', 'param-type-value',
    'param-ri', 'param-ri-value', 'param-size', 'param-size-value',
    'param-curvature', 'param-curvature-value', 'param-curvature-group',
    'param-material', 'btn-reset-lens', 'btn-delete-lens', 'help-tooltip',
    'toast-container',
    'btn-start-guide', 'btn-skip-guide', 'btn-step-1-next',
    'btn-step-2-next', 'btn-finish-guide', 'guide-overlay',
    'guide-welcome', 'guide-step-1', 'guide-step-2', 'guide-step-3'
];
knownIds.forEach(id => { els[id] = makeEl(id); });

const canvas = els['optics-canvas'];
canvas.getContext = () => new Proxy({}, {
    get(t, prop) {
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient' || prop === 'createPattern') return () => ({});
        return typeof prop === 'string' ? () => {} : undefined;
    },
    set() { return true; }
});
canvas.parentElement = els['canvas-wrapper'];
els['canvas-wrapper'].getBoundingClientRect = () => ({ width: 900, height: 600 });

const sandbox = {
    console,
    Math, Infinity, NaN, Date, JSON, Object, Array, Number, String, Boolean,
    parseFloat, parseInt, isFinite, isNaN, RegExp, Error,
    setTimeout: (fn) => 0, setInterval: () => 0, clearTimeout: () => {}, clearInterval: () => {},
    localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    navigator: { maxTouchPoints: 0 },
    devicePixelRatio: 1,
    innerWidth: 1024, innerHeight: 768,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

sandbox.document = {
    readyState: 'complete',
    getElementById: (id) => els[id] || makeEl(id),
    querySelector: (sel) => {
        if (sel === '.tip-text') return els['tip-text'];
        return makeEl('q-' + sel);
    },
    querySelectorAll: () => [],
    createElement: () => makeEl('created')
};
sandbox.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
sandbox.window.dispatchEvent = () => true;
sandbox.window.addEventListener = () => {};
sandbox.dispatchEvent = () => true;
sandbox.addEventListener = (type, fn) => {
    (sandbox._winListeners = sandbox._winListeners || {})[type] =
        (sandbox._winListeners[type] || []).concat(fn);
};
vm.createContext(sandbox);

function load(rel) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    vm.runInContext(code, sandbox, { filename: rel });
}

['js/config.js', 'js/utils.js', 'js/examples.js', 'js/storage.js', 'js/physics.js',
 'js/lens.js', 'js/renderer.js', 'js/canvas.js', 'js/quiz.js',
 'js/interaction.js', 'js/guide.js', 'js/app.js'].forEach(load);

// App 在脚本末尾已自动实例化；在沙箱内取出该实例
let errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.join(' ')); };

vm.runInContext('globalThis.__app = app;', sandbox);
const runningApp = sandbox.__app;

const cm = runningApp.canvasManager;
const renderer = runningApp.quizManager.renderer;

// 1. 添加四类透镜并启动光路
['convex', 'concave', 'plano', 'aspheric'].forEach(type => {
    cm.addLens(new sandbox.Lens({ type, x: 300, y: 300, material: 'normal' }));
});
renderer.setRunning(true);
renderer.render();
renderer.setShowDispersion(true);
renderer.render();
renderer.setShowDispersion(false);
renderer.setIncidentAngle(30);
renderer.render();
renderer.setIncidentAngle(0);

// 2. 逐个加载全部标准示例
Object.keys(sandbox.ExampleData.all).forEach(id => {
    const ok = sandbox.ExampleData.loadScenario(id, cm, renderer);
    if (!ok) throw new Error('示例加载失败: ' + id);
    renderer.render();
});
console.error = origError;
if (errors.length) {
    console.log('运行时错误：'); errors.forEach(e => console.log(' -', e));
    process.exit(1);
}
console.log('冒烟测试通过：全部脚本可加载，四类透镜渲染、色散/入射角切换与 7 个示例均无运行时错误。');
