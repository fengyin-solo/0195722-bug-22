/**
 * 物理计算模块（统一规则实现，画布渲染与测验判定共用同一套计算）
 *
 * 光路规律（与 spec.js / 帮助文案一致）：
 * - 凸透镜：薄透镜偏折 + 球差，边缘光线额外向光轴偏折，焦位略靠前
 * - 凹透镜：光线远离光轴偏折（发散），反向延长线交于虚焦点
 * - 平面透镜：按真实平行平板处理，垂直入射不偏折不侧移，
 *   斜入射发生侧移，但出射光与入射光方向平行
 * - 非球面透镜：按近轴焦距精确瞄准，所有平行光线汇聚到同一焦点
 *
 * 色散：
 * - 柯西公式 n(λ) = n0 + B(1/λ² − 1/λ0²)
 * - 蓝光折射率大、焦距短（焦点更靠近透镜）；红光反之
 * - 低色散材料 B 很小，三色焦点几乎重合
 */
const Physics = {
    /**
     * 透镜半高（兼容 Lens 实例与普通对象）
     */
    getHalfHeight(lens) {
        const h = typeof lens.getHeight === 'function' ? lens.getHeight() : 80 * (lens.size / 100);
        return h / 2;
    },

    /**
     * 平面透镜（平行平板）厚度
     */
    getPlateThickness(lens) {
        const size = lens.size || 100;
        return OPTICS_SPEC.PLATE_THICKNESS * (size / 100);
    },

    /**
     * 光焦度（越强焦距越短）：P = (n-1) × 弧度
     */
    calculateOpticalPower(lens, refractiveIndex = lens.refractiveIndex) {
        return (refractiveIndex - 1) * (lens.curvature / 100);
    },

    /**
     * 近轴焦距（px）。凸透镜/非球面为正，凹透镜为负（虚焦点），平面透镜为无穷大。
     * 该数值与光线实际交汇位置使用同一公式，保证标注与画布一致。
     */
    calculateFocalLength(lens, refractiveIndex = lens.refractiveIndex) {
        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            return Infinity;
        }
        const halfHeight = this.getHalfHeight(lens);
        const power = this.calculateOpticalPower(lens, refractiveIndex);
        if (power <= 0.0001) return Infinity;
        const sign = lens.type === CONFIG.LENS_TYPES.CONCAVE ? -1 : 1;
        return sign * halfHeight / power;
    },

    /**
     * 薄透镜对某一高度光线的偏折角（弧度，正值向屏幕下方）
     *
     * @param {number} rayAngle 入射方向角
     * @param {number} hitY 与透镜平面交点的 y 坐标
     * @param {object} lens 透镜（可为临时对象）
     * @param {number} [n] 该光线的折射率（色散时按颜色传入）
     */
    calculateRefractedAngle(rayAngle, hitY, lens, n = lens.refractiveIndex) {
        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            // 平面透镜不是薄透镜，偏折由 traceRay 中两次表面折射处理
            return rayAngle;
        }

        const halfHeight = this.getHalfHeight(lens);
        const rel = (hitY - lens.y) / halfHeight; // -1（上边缘）到 1（下边缘）
        const power = this.calculateOpticalPower(lens, n);

        let deflection = 0;
        switch (lens.type) {
            case CONFIG.LENS_TYPES.CONVEX:
                // 基础近轴偏折：向光轴
                deflection = -rel * power;
                // 球差：边缘光线额外向光轴偏折（上边缘额外向下、下边缘额外向上）
                // 附加量随弧度增大，体现“弧度越大球差越明显”
                deflection += -Math.sign(rel) *
                    (n - 1) * OPTICS_SPEC.SPHERICAL_ABERRATION_REL *
                    (lens.curvature / 100) ** 2 * rel * rel;
                break;

            case CONFIG.LENS_TYPES.CONCAVE:
                // 远离光轴偏折（发散）
                deflection = rel * power;
                break;

            case CONFIG.LENS_TYPES.ASPHERIC:
                // 精确瞄准近轴焦点 F = halfHeight / power：
                // 水平入射光线经偏折后严格经过 (lens.x + F, lens.y)
                deflection = -Math.atan(rel * power);
                break;
        }

        return rayAngle + deflection;
    },

    /**
     * 某颜色光的折射率（柯西公式简化模型）
     */
    calculateDispersionIndex(baseIndex, dispersion, color) {
        const wavelengths = OPTICS_SPEC.WAVELENGTHS;
        const lambda = wavelengths[color] || wavelengths.green;
        const lambda0 = wavelengths.green;
        const B = (dispersion || 0) * OPTICS_SPEC.DISPERSION_CAUCHY_B;
        return baseIndex + B * (1 / (lambda * lambda) - 1 / (lambda0 * lambda0));
    },

    /**
     * 阿贝数（越大色散越小）
     */
    calculateAbbeNumber(baseIndex, dispersion) {
        if (!(dispersion > 0)) return Infinity;
        const nF = this.calculateDispersionIndex(baseIndex, dispersion, 'blue');
        const nC = this.calculateDispersionIndex(baseIndex, dispersion, 'red');
        return (baseIndex - 1) / (nF - nC);
    },

    /**
     * 生成平行光。传入透镜时，让光线在透镜平面上均匀铺满其口径，
     * 保证默认的几条光线都能真正穿过透镜、效果在画布上可见。
     */
    generateParallelRays(canvasHeight, rayCount, angle, targetLens = null, startX = 0) {
        const rays = [];
        const angleRad = Utils.degToRad(angle);

        if (targetLens) {
            const half = this.getHalfHeight(targetLens);
            for (let i = 0; i < rayCount; i++) {
                const rel = rayCount > 1 ? (i / (rayCount - 1)) * 1.8 - 0.9 : 0;
                const yAtLens = targetLens.y + rel * half;
                const startY = yAtLens - (targetLens.x - startX) * Math.tan(angleRad);
                rays.push({ x: startX, y: startY, angle: angleRad });
            }
            return rays;
        }

        const spacing = canvasHeight / (rayCount + 1);
        for (let i = 1; i <= rayCount; i++) {
            rays.push({ x: 0, y: spacing * i, angle: angleRad });
        }
        return rays;
    },

    /**
     * 生成点光源光线
     */
    generatePointSourceRays(sourceX, sourceY, rayCount, spreadAngle = 60) {
        const rays = [];
        const halfSpread = Utils.degToRad(spreadAngle / 2);
        const step = rayCount > 1 ? (2 * halfSpread) / (rayCount - 1) : 0;
        for (let i = 0; i < rayCount; i++) {
            rays.push({ x: sourceX, y: sourceY, angle: -halfSpread + step * i });
        }
        return rays;
    },

    /**
     * 计算光线与某透镜“入射面”的交点（仅考虑沿 +x 方向传播）
     * 薄透镜（凸/凹/非球面）：x = lens.x；平面透镜：x = lens.x − 厚度/2
     * @returns {{x:number,y:number,t:number,lens:object}|null}
     */
    intersectLensEntry(rayX, rayY, rayAngle, lens) {
        const cosA = Math.cos(rayAngle);
        if (cosA <= 0.001) return null;

        const thickness = lens.type === CONFIG.LENS_TYPES.PLANO ? this.getPlateThickness(lens) : 0;
        const surfaceX = lens.x - thickness / 2;
        const t = (surfaceX - rayX) / cosA;
        if (t <= 1e-6) return null;

        const hitY = rayY + t * Math.sin(rayAngle);
        const half = this.getHalfHeight(lens);
        if (hitY < lens.y - half || hitY > lens.y + half) return null;

        return { x: surfaceX, y: hitY, t, lens };
    },

    /**
     * 光线追踪：得到一条光线依次穿过各透镜后的完整折线
     *
     * @param {Array} lenses 透镜数组（Lens 实例或同结构普通对象）
     * @param {{x:number,y:number,angle:number}} initialRay 初始光线
     * @param {object} [options]
     * @param {string|null} [options.color] 色散模式传入 'red'|'green'|'blue'
     * @param {number} [options.extend=8000] 最后一段向外延长的距离
     * @returns {{segments:Array, exit:{x:number,y:number,angle:number}}}
     *   segment: {x1,y1,x2,y2,phase:'incident'|'inside'|'outgoing'}
     */
    traceRay(lenses, initialRay, options = {}) {
        const color = options.color || null;
        const extend = options.extend || 8000;
        const segments = [];

        let x = initialRay.x;
        let y = initialRay.y;
        let angle = initialRay.angle;
        let lastLensId = null;
        let hasEnteredLens = false;

        const nOf = (lens) => color
            ? this.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion || 0, color)
            : lens.refractiveIndex;

        for (let bounce = 0; bounce < 20; bounce++) {
            // 寻找沿光线方向最近的入射面
            let nearest = null;
            for (const lens of lenses) {
                if (lens.id === lastLensId) continue;
                const hit = this.intersectLensEntry(x, y, angle, lens);
                if (hit && (!nearest || hit.t < nearest.t)) nearest = hit;
            }
            if (!nearest) break;

            const lens = nearest.lens;
            const phaseBefore = hasEnteredLens ? 'outgoing' : 'incident';
            segments.push({ x1: x, y1: y, x2: nearest.x, y2: nearest.y, phase: phaseBefore });
            x = nearest.x;
            y = nearest.y;

            if (lens.type === CONFIG.LENS_TYPES.PLANO) {
                // —— 平行平板：两次折射（空气→玻璃→空气）——
                const n = nOf(lens);
                const sin1 = Math.sin(angle);
                const sin2 = sin1 / n;
                const insideAngle = Math.asin(Utils.clamp(sin2, -1, 1));

                const exitX = lens.x + this.getPlateThickness(lens) / 2;
                const tInside = (exitX - x) / Math.cos(insideAngle);
                const exitY = y + tInside * Math.sin(insideAngle);

                segments.push({ x1: x, y1: y, x2: exitX, y2: exitY, phase: 'inside' });

                // 出射角：玻璃→空气，两表面平行 ⇒ 出射方向 = 入射方向
                const exitAngle = Math.asin(Utils.clamp(n * sin2, -1, 1));

                x = exitX;
                y = exitY;
                angle = exitAngle;
            } else {
                // —— 薄透镜：在主平面处一次偏折 ——
                angle = this.calculateRefractedAngle(angle, y, lens, nOf(lens));
            }

            hasEnteredLens = true;
            lastLensId = lens.id;
        }

        // 最后一段延长到画布外（渲染器自行裁剪）
        const tailPhase = hasEnteredLens ? 'outgoing' : 'incident';
        segments.push({
            x1: x, y1: y,
            x2: x + extend * Math.cos(angle),
            y2: y + extend * Math.sin(angle),
            phase: tailPhase
        });

        return { segments, exit: { x, y, angle } };
    },

    /**
     * 分析平行光通过薄透镜后的会聚/发散情况（测验判定与测试共用）
     *
     * @returns {{
     *   focalLength:number, converging:boolean, diverging:boolean,
     *   focusNear:number, focusFar:number, focusSpread:number, spreadRatio:number,
     *   colorFocus:Object
     * }}
     */
    analyzeParallelBeam(lens, options = {}) {
        const angleDeg = options.angle || 0;
        const rayCount = options.rayCount || 9;
        const startX = options.startX || 0;

        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            return this.analyzeParallelPlate(lens, angleDeg, startX);
        }

        const colors = ['red', 'green', 'blue'];
        const colorFocus = {};

        const crossingsFor = (color) => {
            const n = color
                ? this.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion || 0, color)
                : lens.refractiveIndex;
            const half = this.getHalfHeight(lens);
            const crossings = [];
            for (let i = 0; i < rayCount; i++) {
                const rel = rayCount > 1 ? (i / (rayCount - 1)) * 1.8 - 0.9 : 0;
                if (Math.abs(rel) < 0.02) continue;
                const yAtLens = lens.y + rel * half;
                const startY = yAtLens - (lens.x - startX) * Math.tan(Utils.degToRad(angleDeg));
                const out = this.calculateRefractedAngle(
                    Utils.degToRad(angleDeg), yAtLens, lens, n
                );
                const slope = Math.tan(out);
                if (Math.abs(slope) < 1e-9) continue;
                // 距透镜多远与光轴相交
                const d = (lens.y - yAtLens) / slope;
                crossings.push({ rel, d });
            }
            return crossings;
        };

        const summarize = (crossings) => {
            const forward = crossings.filter(c => c.d > 0).map(c => c.d);
            const backward = crossings.filter(c => c.d < 0).map(c => c.d);
            if (forward.length) {
                return {
                    converging: true,
                    diverging: false,
                    focusNear: Math.min(...forward),
                    focusFar: Math.max(...forward)
                };
            }
            if (backward.length) {
                return {
                    converging: false,
                    diverging: true,
                    focusNear: Math.min(...backward), // 虚焦点（透镜后方，负值）
                    focusFar: Math.max(...backward)
                };
            }
            return { converging: false, diverging: false, focusNear: NaN, focusFar: NaN };
        };

        const base = summarize(crossingsFor(null));
        colors.forEach(c => {
            const s = summarize(crossingsFor(c));
            colorFocus[c] = s;
        });

        const paraxialF = this.calculateFocalLength(lens);
        const focusSpread = isFinite(base.focusNear) ? Math.abs(base.focusFar - base.focusNear) : NaN;
        const spreadRatio = isFinite(focusSpread) && paraxialF > 0 ? focusSpread / paraxialF : NaN;

        return {
            focalLength: paraxialF,
            converging: base.converging,
            diverging: base.diverging,
            focusNear: base.focusNear,
            focusFar: base.focusFar,
            focusSpread,
            spreadRatio,
            colorFocus,
            // 色散焦位差：取同一条边缘光线（|rel|≈0.9）红/蓝与光轴交点之差
            colorFocusDelta: Math.abs(
                (colorFocus.blue.focusNear + colorFocus.blue.focusFar) / 2 -
                (colorFocus.red.focusNear + colorFocus.red.focusFar) / 2
            )
        };
    },

    /**
     * 分析平行光通过平面透镜（平板）的行为
     * @returns {{plate:boolean, sideShift:number, directionDelta:number, sameDirection:boolean}}
     */
    analyzeParallelPlate(lens, angleDeg = 0, startX = 0) {
        const angle = Utils.degToRad(angleDeg);
        const startY = lens.y - (lens.x - startX) * Math.tan(angle);
        const sampleLens = { ...lens, id: lens.id || 'sample-plate' };
        const traced = this.traceRay([sampleLens], { x: startX, y: startY, angle });

        // 入射段与出射段
        const first = traced.segments[0];
        const last = traced.segments[traced.segments.length - 1];
        const outAngle = traced.exit.angle;
        const directionDelta = Math.abs(outAngle - angle);

        // 侧移：出射点相对“无平板原方向直线”的垂直距离
        const yUndeflected = startY + (last.x1 - startX) * Math.tan(angle);
        const lateral = (last.y1 - yUndeflected) * Math.cos(angle);

        return {
            plate: true,
            sideShift: Math.abs(lateral),
            directionDelta,
            sameDirection: directionDelta < OPTICS_SPEC.TOLERANCES.NO_DEFLECTION_ANGLE,
            focalLength: Infinity,
            converging: false,
            diverging: false
        };
    }
};
