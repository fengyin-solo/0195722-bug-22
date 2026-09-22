/**
 * 一致性自检清单（本地开发与 Docker 构建共用同一份）
 *
 * 运行方式：node tests/consistency-check.js  （或 npm test）
 *
 * 该脚本直接加载浏览器同款 js/config.js、js/utils.js、js/physics.js、
 * js/lens.js 与 js/examples.js（在极简沙箱中执行），
 * 用同一套 Physics API 和同一份 EXAMPLES 数据核验：
 *   1. 帮助文案、题目说明声称的效果在物理引擎上真实成立；
 *   2. 渲染规则（焦距、焦点位置）与物理引擎同一口径；
 *   3. 每一条标准示例都能在画布范围内复现声称的现象。
 * 任一条不成立即退出码 1，阻止构建产物发布。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ---- 极简浏览器沙箱（只提供源码实际用到的全局对象） ----
const sandbox = {
    console,
    Math,
    Infinity,
    NaN,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    parseFloat,
    parseInt,
    isFinite,
    isNaN,
    setTimeout: () => 0,
    setInterval: () => 0,
    clearTimeout: () => {},
    clearInterval: () => {},
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    window: {},
    navigator: { maxTouchPoints: 0 }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(rel) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    vm.runInContext(code, sandbox, { filename: rel });
}

load('js/config.js');
load('js/utils.js');
load('js/physics.js');
load('js/lens.js');
load('js/examples.js');

// 顶层 const/class 位于 vm 共享词法环境，需在沙箱内显式取出
vm.runInContext(
    'globalThis.__testExports = { Physics, Lens, CONFIG, ExampleData };',
    sandbox
);
const { Physics, Lens, CONFIG, ExampleData } = sandbox.__testExports;

// ---- 断言框架 ----
let passed = 0;
const failures = [];

function check(name, cond, detail = '') {
    if (cond) {
        passed++;
    } else {
        failures.push(`${name}${detail ? ` —— ${detail}` : ''}`);
    }
}

function approx(a, b, tol) {
    return Math.abs(a - b) <= tol;
}

/** 按 EXAMPLES 原始参数造透镜 */
function lensFromExample(id) {
    const ex = ExampleData.get(id);
    const cfg = ex.lenses[0];
    return new Lens({
        type: cfg.type,
        x: 200,
        y: 200,
        size: cfg.size,
        curvature: cfg.curvature,
        material: cfg.material
    });
}

// ============ A. 平面透镜：垂直无侧移、斜入射有侧移、方向永不变 ============
{
    const plano = lensFromExample('plano_normal');

    const atNormal = Physics.analyzeLens(plano, { angleDeg: 0 });
    check('平面透镜垂直入射侧移为 0', atNormal.lateralShift === 0,
        `实际 ${atNormal.lateralShift}`);

    // 斜入射示例使用更厚的平板（plano_tilted, size=100）
    const planoTilted = lensFromExample('plano_tilted');
    const atTilt = Physics.analyzeLens(planoTilted, { angleDeg: 30 });
    check('平面透镜斜 30° 入射有可见侧移 (≥3px)', atTilt.lateralShift >= 3,
        `实际 ${atTilt.lateralShift.toFixed(2)}px`);

    // traceThroughLens：出射方向必须严格等于入射方向
    const trace = Physics.traceThroughLens(
        { x: 200 - planoTilted.getThickness() / 2, y: 220 },
        Math.PI / 6, planoTilted
    );
    check('平面透镜出射方向 = 入射方向', approx(trace.exitAngle, Math.PI / 6, 1e-12));
    check('平面透镜板内折线段存在（渲染看得到侧移）', trace.points.length === 1);

    const planoLabel = CONFIG.HELP_TEXTS.plano;
    check('帮助文案写明平面透镜斜入射有微小侧移', planoLabel.includes('侧移'));
}

// ============ B. 非球面：所有平行光线严格共焦 ============
{
    const lens = lensFromExample('aspheric_focus');
    const a = Physics.analyzeLens(lens, { rays: 11 });
    check('非球面透镜为会聚透镜', a.converging);
    check('非球面所有光线焦点重合（错开 ≤2px）', a.focalSpread <= 2,
        `错开 ${a.focalSpread.toFixed(3)}px`);
    check('非球面帮助文案声称“同一焦点”与画布一致',
        CONFIG.HELP_TEXTS.aspheric.includes('同一焦点'));
}

// ============ C. 球面凸透镜：存在球差，焦点确实错开 ============
{
    const lens = lensFromExample('convex_focus');
    const a = Physics.analyzeLens(lens, { rays: 11 });
    check('球面凸透镜为会聚透镜', a.converging);
    check('球面凸透镜存在球差（焦点错开 ≥8px）', a.focalSpread >= 8,
        `错开 ${a.focalSpread.toFixed(2)}px`);
    check('凸透镜文案承认存在球差', CONFIG.HELP_TEXTS.convex.includes('球差'));
}

// ============ D. 凹透镜：发散且虚焦点在入射侧 ============
{
    const lens = lensFromExample('concave_diverge');
    const a = Physics.analyzeLens(lens, { rays: 11 });
    check('凹透镜为发散透镜', a.diverging);
    check('凹透镜交点在入射侧（虚焦点 f<0）', a.fParaxial < 0,
        `f=${a.fParaxial.toFixed(1)}`);
    check('凹透镜文案写明虚焦点', CONFIG.HELP_TEXTS.concave.includes('虚焦点'));
}

// ============ E. 色散：蓝近红远，普通玻璃分离明显，低色散几乎重合 ============
{
    const normal = lensFromExample('dispersion_normal');
    const low = lensFromExample('dispersion_low');

    const nRed = Physics.analyzeLens(normal, { color: 'red' });
    const nBlue = Physics.analyzeLens(normal, { color: 'blue' });
    check('蓝光折射率大于红光', nBlue.n > nRed.n,
        `n蓝=${nBlue.n} n红=${nRed.n}`);
    check('蓝光焦距短于红光（蓝近红远）', nBlue.fParaxial < nRed.fParaxial);
    const normalSep = Math.abs(nRed.fParaxial - nBlue.fParaxial);
    check('普通玻璃红蓝焦点明显分离（≥8px）', normalSep >= 8,
        `分离 ${normalSep.toFixed(2)}px`);

    const lRed = Physics.analyzeLens(low, { color: 'red' });
    const lBlue = Physics.analyzeLens(low, { color: 'blue' });
    const lowSep = Math.abs(lRed.fParaxial - lBlue.fParaxial);
    check('低色散玻璃红蓝焦点接近（<6px）', lowSep < 6,
        `分离 ${lowSep.toFixed(2)}px`);
    check('普通玻璃色散强于低色散玻璃', normalSep > lowSep * 2);
}

// ============ F. 焦距标注与光线实测同一口径 ============
{
    const lens = lensFromExample('aspheric_focus');
    const fLabel = lens.getFocalLength();
    const a = Physics.analyzeLens(lens, { rays: 11 });
    check('Lens.getFocalLength 与 Physics 焦距公式一致',
        approx(fLabel, a.fParaxial, 1e-9),
        `标注=${fLabel} 实测=${a.fParaxial}`);
    check('非球面实测交点与焦距标注一致',
        approx(a.focalMean, fLabel, 0.5),
        `实测均值=${a.focalMean.toFixed(2)} 标注=${fLabel}`);
    check('getFocalLength 支持按颜色取值（焦点随颜色变化）',
        lens.getFocalLength('red') !== lens.getFocalLength('blue'));

    const plano = lensFromExample('plano_normal');
    check('平面透镜焦距为 Infinity（不画焦点）', plano.getFocalLength() === Infinity);
}

// ============ G. 材料参数与文案口径一致 ============
{
    check('低色散材料色散系数 < 0.15（题目阈值）',
        CONFIG.MATERIALS.LOW_DISPERSION.dispersion < 0.15);
    check('普通玻璃色散系数 ≥ 0.2（题目阈值）',
        CONFIG.MATERIALS.NORMAL.dispersion >= 0.2);
    check('高折射率材料折射率最高',
        CONFIG.MATERIALS.HIGH_INDEX.refractiveIndex >
        CONFIG.MATERIALS.NORMAL.refractiveIndex);
    check('高折射率文案写“焦距更短”', CONFIG.HELP_TEXTS.highIndex.includes('焦距更短'));
}

// ============ H. 题目校验依赖的现象在对应示例上真实成立 ============
{
    // 聚焦题：示例凸透镜焦距在 50-300px 内
    const focus = Physics.analyzeLens(lensFromExample('convex_focus'));
    check('聚焦题示例：凸透镜焦距在 50-300px',
        focus.fParaxial >= 50 && focus.fParaxial <= 300,
        `f=${focus.fParaxial.toFixed(1)}`);

    // 球差题：默认参数已能看到球差
    check('球差题示例：默认凸透镜球差 ≥8px', focus.focalSpread >= 8,
        `spread=${focus.focalSpread.toFixed(1)}`);

    // 色散题：默认普通玻璃 + 弧度70 已达到分离阈值
    const disp = Physics.analyzeLens(lensFromExample('dispersion_normal'), { color: 'red' });
    const dispB = Physics.analyzeLens(lensFromExample('dispersion_normal'), { color: 'blue' });
    check('色散题示例：默认参数红蓝分离 ≥8px',
        Math.abs(disp.fParaxial - dispB.fParaxial) >= 8);

    // 低色散题：默认 ED 玻璃分离小于普通玻璃
    const lowR = Physics.analyzeLens(lensFromExample('dispersion_low'), { color: 'red' });
    const lowB = Physics.analyzeLens(lensFromExample('dispersion_low'), { color: 'blue' });
    check('低色散题示例：默认 ED 玻璃红蓝分离 <6px',
        Math.abs(lowR.fParaxial - lowB.fParaxial) < 6);
}

// ============ I. 题目文案不再承诺画布做不到的事 ============
{
    const planoQ = CONFIG.QUIZ_QUESTIONS.find(q => q.id === 'no_deflection_plano');
    check('平面题要求平行光', !!planoQ.validation.checkLightMode);
    check('平面题正确文案不再声称“垂直入射有侧移”',
        !planoQ.explanation.correct.includes('垂直入射时方向不变，只会发生微小的侧移'));
    check('平面题正确文案区分垂直/斜入射',
        planoQ.explanation.correct.includes('斜着入射'));

    const asphericQ = CONFIG.QUIZ_QUESTIONS.find(q => q.id === 'aspheric_correction');
    check('非球面题要求平行光', asphericQ.requirements.lightMode === 'parallel');
}

// ============ J. 所有示例都有画布可见的运行配置 ============
{
    Object.keys(ExampleData.all).forEach(id => {
        const ex = ExampleData.get(id);
        check(`示例 ${id} 含透镜与光源配置`,
            Array.isArray(ex.lenses) && ex.lenses.length === 1 && !!ex.light &&
            ex.light.mode && ex.run === true);
    });
}

// ---- 汇总输出 ----
console.log(`\n一致性清单：${passed} 条通过，${failures.length} 条失败`);
if (failures.length > 0) {
    console.log('\n失败项：');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
}
console.log('全部通过：题目、帮助文案、画布物理规则与示例数据口径一致。');
