/**
 * 光学规则与示例数据统一清单（SPEC）
 *
 * 这是题目、帮助文案、参数面板、结果弹窗与画布渲染共同遵守的唯一口径：
 * - RULES：每条“说法”对应的规则文字（帮助/题目文案引用这里的关键词）
 * - SAMPLES：同一套示例透镜与光路数据（画布演示、测验判定、自动测试共用）
 * - TOLERANCES：判定阈值（测验弹窗与测试脚本共用同一组数值）
 *
 * 本地开发：运行 `npm test`（node --test）校验本清单
 * Docker 构建：构建阶段执行同样的校验，不通过则镜像构建失败
 */
(function (root, factory) {
    const SPEC = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = SPEC;
    }
    root.OPTICS_SPEC = SPEC;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    const SPEC = {
        // 物理模型版本：画布与文案以这一版规则为准
        MODEL_VERSION: '2.0.0',

        // 平面透镜（平行平板）厚度（px，对应 size=100%）
        PLATE_THICKNESS: 28,

        // 色散建模用的柯西 B 系数（教学放大，保证色焦差肉眼可见）
        DISPERSION_CAUCHY_B: 260000,

        // 凸透镜球差附加系数（边缘光线额外偏折的比例）
        SPHERICAL_ABERRATION_REL: 0.22,

        // 三种演示波长（nm）：红 C 线 / 绿 d 线 / 蓝 F 线
        WAVELENGTHS: {
            red: 656.3,
            green: 587.6,
            blue: 486.1
        },

        // 判定阈值（测验弹窗与测试脚本共用）
        TOLERANCES: {
            FOCUS_SPREAD_RATIO: 0.06,      // 边缘与中心光线焦位差 / 焦距，小于此值视为“精准汇聚”
            CONVERGE_MAX_RATIO: 0.25,      // 小于此值判定为“会聚到一点”
            SPHERICAL_ABERRATION_RATIO: 0.10, // 球差明显：焦位差比例需大于此值
            NO_DEFLECTION_ANGLE: 0.01,     // 平面透镜出射-入射方向角差阈值（弧度）
            SIDE_SHIFT_VISIBLE: 2,         // 侧移肉眼可见阈值（px，size=100%、30°入射时）
            DISPERSION_FOCUS_DELTA: 5,     // 普通玻璃红/蓝焦位差阈值（px）
            LOW_DISPERSION_FOCUS_DELTA: 1.5 // 低色散玻璃红/蓝焦位差需小于此值（px）
        },

        // 统一“说法”：帮助文案与题目解释都围绕这些关键词组织
        RULES: {
            convex: '凸透镜：中间厚、边缘薄，使光线向光轴会聚到焦点；边缘光线因球差会会聚在稍靠近透镜的位置。',
            concave: '凹透镜：中间薄、边缘厚，使光线向外发散，反向延长线交于虚焦点。',
            plano: '平面透镜：两面是互相平行的平面。垂直入射时方向不变、也不发生侧移；斜入射时会发生侧移，但出射光与入射光方向保持平行。',
            aspheric: '非球面透镜：表面曲率从中心到边缘逐渐变化，补偿球差，使平行光的各条光线精准汇聚到同一焦点。',
            lowDispersion: '低色散镜片（ED玻璃）：色散很小，红、绿、蓝光的焦点几乎重合，彩色边缘不明显。',
            highIndex: '高折射率镜片：折射率更高，焦距更短、聚光能力更强，色散也较明显。',
            refractiveIndex: '折射率：数值越大，光线偏折越明显，焦距越短。不同颜色光的折射率略有不同，这就是色散的成因。',
            curvature: '弧度：调节透镜表面的弯曲程度，弧度越大光焦度越强、焦距越短；凸透镜弧度越大球差也越明显。',
            incidentAngle: '入射角：平行光相对光轴的倾斜角度。斜射入平面透镜时可观察到侧移。',
            dispersionToggle: '色散：开启后分别追踪红、绿、蓝三色光，可观察焦点随颜色前后变化；普通玻璃分离明显，低色散镜片几乎重合。'
        },

        // 统一示例数据：画布演示、测验判定、自动测试共用同一组参数
        SAMPLES: {
            // 非球面精准汇聚
            asphericFocus: {
                lens: { type: 'aspheric', x: 300, y: 200, size: 100, refractiveIndex: 1.5, curvature: 50, material: 'normal' },
                light: { mode: 'parallel', angle: 0 },
                expect: { preciseFocus: true }
            },
            // 球面凸透镜存在球差
            convexSpherical: {
                lens: { type: 'convex', x: 300, y: 200, size: 100, refractiveIndex: 1.5, curvature: 70, material: 'normal' },
                light: { mode: 'parallel', angle: 0 },
                expect: { hasSphericalAberration: true }
            },
            // 平面透镜：垂直入射无侧移，30°斜入射有可见侧移且方向不变
            plateNormal: {
                lens: { type: 'plano', x: 300, y: 200, size: 100, refractiveIndex: 1.5, curvature: 50, material: 'normal' },
                light: { mode: 'parallel', angle: 0 },
                expect: { sideShift: 0, sameDirection: true }
            },
            plateOblique: {
                lens: { type: 'plano', x: 300, y: 200, size: 100, refractiveIndex: 1.5, curvature: 50, material: 'normal' },
                light: { mode: 'parallel', angle: 30 },
                expect: { sideShiftMin: 2, sameDirection: true }
            },
            // 普通玻璃色散明显
            dispersion: {
                lens: { type: 'convex', x: 300, y: 200, size: 100, refractiveIndex: 1.6, curvature: 70, material: 'normal' },
                light: { mode: 'parallel', angle: 0 },
                expect: { blueFocusCloser: true, focusDeltaMin: 5 }
            },
            // 低色散玻璃焦点几乎重合
            lowDispersion: {
                lens: { type: 'convex', x: 300, y: 200, size: 100, refractiveIndex: 1.52, curvature: 70, material: 'lowDispersion' },
                light: { mode: 'parallel', angle: 0 },
                expect: { focusDeltaMax: 1.5 }
            },
            // 凹透镜发散
            concaveDiverge: {
                lens: { type: 'concave', x: 300, y: 200, size: 100, refractiveIndex: 1.5, curvature: 50, material: 'normal' },
                light: { mode: 'parallel', angle: 0 },
                expect: { diverging: true }
            }
        }
    };

    return SPEC;
});
