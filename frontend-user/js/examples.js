/**
 * 标准示例数据（题目、帮助、画布与一致性测试共用的唯一示例清单）
*
 * 浏览器中加载示例：ExampleData.loadScenario(id, canvasManager, renderer)
 * Node 测试中读取原始参数：EXAMPLES[id]（见 tests/consistency-check.js）
 *
 * 坐标使用归一化比例（x/y 为画布宽高的 0-1），加载时换算成像素，
 * 保证在不同尺寸的设备上光路都落在画布内。
 */
(function (global) {
    const EXAMPLES = {
        // 凸透镜聚焦：边缘光线略有球差
        convex_focus: {
            id: 'convex_focus',
            name: '凸透镜聚焦（有轻微球差）',
            light: { mode: 'parallel', rayCount: 7, angle: 0 },
            showDispersion: false,
            run: true,
            lenses: [{
                type: 'convex', xRatio: 0.32, yRatio: 0.5,
                size: 100, curvature: 50, material: 'normal'
            }]
        },
        // 非球面消球差：所有平行光线严格交于一点
        aspheric_focus: {
            id: 'aspheric_focus',
            name: '非球面消球差（严格共焦）',
            light: { mode: 'parallel', rayCount: 7, angle: 0 },
            showDispersion: false,
            run: true,
            lenses: [{
                type: 'aspheric', xRatio: 0.32, yRatio: 0.5,
                size: 100, curvature: 50, material: 'normal'
            }]
        },
        // 凹透镜发散：虚焦点在入射侧
        concave_diverge: {
            id: 'concave_diverge',
            name: '凹透镜发散（虚焦点）',
            light: { mode: 'parallel', rayCount: 7, angle: 0 },
            showDispersion: false,
            run: true,
            lenses: [{
                type: 'concave', xRatio: 0.32, yRatio: 0.5,
                size: 100, curvature: 50, material: 'normal'
            }]
        },
        // 平面透镜垂直入射：方向不变、无侧移
        plano_normal: {
            id: 'plano_normal',
            name: '平面透镜垂直入射（直线穿过）',
            light: { mode: 'parallel', rayCount: 5, angle: 0 },
            showDispersion: false,
            run: true,
            lenses: [{
                type: 'plano', xRatio: 0.32, yRatio: 0.5,
                size: 70, curvature: 50, material: 'normal'
            }]
        },
        // 平面透镜斜入射：方向不变，但有明显侧移
        plano_tilted: {
            id: 'plano_tilted',
            name: '平面透镜斜入射（微小侧移）',
            light: { mode: 'parallel', rayCount: 5, angle: 30 },
            showDispersion: false,
            run: true,
            lenses: [{
                type: 'plano', xRatio: 0.35, yRatio: 0.5,
                size: 100, curvature: 50, material: 'normal'
            }]
        },
        // 普通玻璃色散：红/绿/蓝三个焦点明显分离
        dispersion_normal: {
            id: 'dispersion_normal',
            name: '普通玻璃色散（三色焦点分离）',
            light: { mode: 'parallel', rayCount: 5, angle: 0 },
            showDispersion: true,
            run: true,
            lenses: [{
                type: 'convex', xRatio: 0.32, yRatio: 0.5,
                size: 100, curvature: 70, material: 'normal'
            }]
        },
        // 低色散玻璃：三色焦点几乎重合
        dispersion_low: {
            id: 'dispersion_low',
            name: '低色散镜片（三色焦点几乎重合）',
            light: { mode: 'parallel', rayCount: 5, angle: 0 },
            showDispersion: true,
            run: true,
            lenses: [{
                type: 'convex', xRatio: 0.32, yRatio: 0.5,
                size: 100, curvature: 70, material: 'lowDispersion'
            }]
        }
    };

    const ExampleData = {
        all: EXAMPLES,

        get(id) {
            return EXAMPLES[id] || null;
        },

        /**
         * 在浏览器中把示例加载到画布。
         * @param {string} id 示例 id
         * @param {CanvasManager} canvasManager
         * @param {Renderer} renderer
         */
        loadScenario(id, canvasManager, renderer) {
            const scenario = EXAMPLES[id];
            if (!scenario) return false;

            canvasManager.clear();
            renderer.setRunning(false);

            const width = renderer.width;
            const height = renderer.height;

            scenario.lenses.forEach(cfg => {
                const lens = new Lens({
                    type: cfg.type,
                    x: cfg.xRatio * width,
                    y: cfg.yRatio * height,
                    size: cfg.size,
                    curvature: cfg.curvature,
                    material: cfg.material
                });
                canvasManager.addLens(lens);
            });

            renderer.setLightMode(scenario.light.mode);
            renderer.setRayCount(scenario.light.rayCount);
            renderer.setIncidentAngle(scenario.light.angle);
            renderer.setShowDispersion(!!scenario.showDispersion);
            renderer.setRunning(!!scenario.run);

            return true;
        }
    };

    global.ExampleData = ExampleData;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { EXAMPLES, ExampleData };
    }
})(typeof window !== 'undefined' ? window : globalThis);
