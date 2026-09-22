/**
 * 物理计算模块（全项目唯一的光路规则来源）
 *
 * 渲染器（renderer.js）、题目校验（quiz.js）、焦距标注与一致性测试
 * （tests/consistency-check.js）都必须使用本模块的 API，
 * 不允许各自再实现一套偏折/焦距规则。
 *
 * 教学模型（与画布表现严格一致）：
 * 1. 薄透镜（凸透镜 / 凹透镜 / 非球面透镜）
 *    光线在透镜主平面（x = lens.x）处发生一次偏折：
 *      tan θ' = tan θ − h / f(h)
 *    θ 为入射角，h 为入射点到光轴的距离（y 轴向下为正）。
 *    - 凸透镜（球面）：边缘光线偏折过度，存在球差，
 *      f(h) = f0 / (1 + S·(h/a)⁴)，各条光线焦点分散；
 *    - 非球面透镜：S = 0，f(h) = f0，所有平行光线严格交于同一焦点；
 *    - 凹透镜：f0 < 0，光线向外发散，反向延长线交于虚焦点。
 * 2. 平面透镜（有真实厚度的平行平板）
 *    两个表面互相平行，按两次折射追踪：
 *      sin r = sin i / n（板内折射角）
 *    出射光方向与入射光完全相同；垂直入射时无侧移，
 *    斜入射时发生与厚度、折射率相关的微小侧移。
 * 3. 色散（柯西公式教学版，λ 以 μm 计）
 *      n(λ) = n_d + K·dispersion·(1/λ² − 1/λ_d²)
 *    蓝光折射率最大、焦距最短（焦点最靠近透镜），红光反之；
 *    K 为教学放大系数，让普通玻璃与低色散玻璃的差异在画布上清晰可见。
 */
const Physics = {
    /**
     * 焦距模型常数。
     * f0 = FOCAL_CONSTANT / ((n - 1) * curvature/100)
     * 默认普通玻璃凸透镜（n=1.5, 曲率50）时 f0 = 104px。
     */
    FOCAL_CONSTANT: 26,

    /** 色散教学放大系数（λ 以 μm 计） */
    DISPERSION_K: 0.12,

    /** 特征谱线波长（μm）：红 C 线 / 绿 d 线 / 蓝 F 线 */
    WAVELENGTHS_UM: {
        red: 0.6563,
        green: 0.5876,
        blue: 0.4861
    },

    /**
     * 计算近轴焦距（薄透镜公式，唯一口径）。
     * @param {number} refractiveIndex 折射率（d 线）
     * @param {number} curvature 曲率 0-100
     * @param {number} [size] 透镜尺寸（保留参数，焦距与口径无关）
     * @returns {number} 焦距 px，凹透镜为负，平面透镜为 Infinity
     */
    calculateFocalLength(refractiveIndex, curvature, size) {
        const c = Math.max(0.01, curvature / 100);
        return this.FOCAL_CONSTANT / ((refractiveIndex - 1) * c);
    },

    /**
     * 计算光线与透镜入射面的交点。
     * 薄透镜入射面即主平面 x = lens.x；
     * 平面透镜入射面为前表面 x = lens.x - thickness/2。
     */
    calculateRayLensIntersection(rayX, rayY, rayAngle, lens) {
        const lensY = lens.y;
        const halfHeight = lens.getHeight() / 2;
        const surfaceX = lens.type === CONFIG.LENS_TYPES.PLANO
            ? lens.x - lens.getThickness() / 2
            : lens.x;

        const dirX = Math.cos(rayAngle);
        const dirY = Math.sin(rayAngle);

        if (Math.abs(dirX) < 0.001) {
            return null;
        }

        const dx = surfaceX - rayX;

        // 光线必须朝向透镜入射面
        if ((dx > 0 && dirX < 0) || (dx < 0 && dirX > 0)) {
            return null;
        }

        // 距离太近跳过（避免重复穿过同一块透镜）
        if (Math.abs(dx) < 1) {
            return null;
        }

        const t = dx / dirX;
        const intersectY = rayY + t * dirY;

        if (intersectY < lensY - halfHeight || intersectY > lensY + halfHeight) {
            return null;
        }

        return {
            x: surfaceX,
            y: intersectY,
            distance: Math.abs(dx)
        };
    },

    /**
     * 球面凸透镜的球差强度系数（随曲率增大）。
     * @param {number} curvature 曲率 0-100
     * @returns {number} 边缘光线相对过度偏折系数
     */
    getSphericalAberrationCoeff(curvature) {
        // 教学放大：50 弧度时边缘过度偏折约 16%，90 弧度时约 36%，
        // 使边缘/中心光线焦点错开在画布上清晰可辨
        return 0.08 + 0.32 * (curvature / 100);
    },

    /**
     * 某颜色光的折射率（柯西公式教学版）。
     * @param {number} baseIndex d 线（绿光）折射率
     * @param {number} dispersion 材料色散系数 0-1
     * @param {'red'|'green'|'blue'} color 光色
     * @returns {number} 该颜色光的折射率
     */
    calculateDispersionIndex(baseIndex, dispersion, color) {
        const lams = this.WAVELENGTHS_UM;
        const lam = lams[color] || lams.green;
        return baseIndex + this.DISPERSION_K * dispersion *
            (1 / (lam * lam) - 1 / (lams.green * lams.green));
    },

    /**
     * 计算阿贝数 Vd = (nd - 1) / (nF - nC)，数值越大色散越小。
     */
    calculateAbbeNumber(baseIndex, dispersion) {
        if (dispersion <= 0) return Infinity;
        const nF = this.calculateDispersionIndex(baseIndex, dispersion, 'blue');
        const nC = this.calculateDispersionIndex(baseIndex, dispersion, 'red');
        return (baseIndex - 1) / (nF - nC);
    },

    /**
     * 薄透镜出射角（凸透镜含球差，非球面严格共焦，凹透镜发散）。
     * @param {number} theta 入射角（弧度）
     * @param {number} h 入射点相对光轴的距离
     * @param {number} halfHeight 透镜半高
     * @param {Lens} lens 透镜
     * @param {string|null} color 光色（色散模式）
     * @returns {number} 出射角（弧度）
     */
    bendThinLens(theta, h, halfHeight, lens, color = null) {
        const n = color
            ? this.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion, color)
            : lens.refractiveIndex;
        const fMag = this.calculateFocalLength(n, lens.curvature);
        // 凹透镜焦距为负（虚焦点在入射侧），其余为正
        const f0 = lens.type === CONFIG.LENS_TYPES.CONCAVE ? -fMag : fMag;

        let f = f0;
        if (lens.type === CONFIG.LENS_TYPES.CONVEX) {
            // 球面透镜：边缘有效焦距更短 → 边缘光线过度偏折（球差）
            const q = halfHeight !== 0 ? h / halfHeight : 0;
            const s = this.getSphericalAberrationCoeff(lens.curvature);
            f = f0 / (1 + s * q * q * q * q);
        }
        // ASPHERIC：f = f0，所有平行光线严格汇聚到同一焦点
        // CONCAVE：f = f0 < 0，光线向外发散

        return Math.atan(Math.tan(theta) - h / f);
    },

    /**
     * 兼容旧调用名：计算薄透镜折射后角度（平面透镜返回原方向）。
     */
    calculateRefractedAngle(rayAngle, rayY, lens, color = null) {
        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            return rayAngle;
        }
        const halfHeight = lens.getHeight() / 2;
        const h = rayY - lens.y;
        return this.bendThinLens(rayAngle, h, halfHeight, lens, color);
    },

    /**
     * 光线穿过一块透镜后的完整路径（渲染与测试共用）。
     *
     * @param {{x:number,y:number}} entry 入射点
     * @param {number} rayAngle 入射角（弧度，x 轴为 0）
     * @param {Lens} lens 透镜
     * @param {'red'|'green'|'blue'|null} color 光色
     * @returns {{points: Array<{x:number,y:number,inside:boolean}>,
     *           exit:{x:number,y:number}, exitAngle:number, lateralShift:number}}
     *   points  透镜内部需要补画的折点（平面透镜的板内段终点；薄透镜为空）
     *   exit    光线离开透镜的位置
     *   exitAngle 出射方向
     *   lateralShift 仅平面透镜：出射光相对入射直线的横向错开量（px）
     */
    traceThroughLens(entry, rayAngle, lens, color = null) {
        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            const t = lens.getThickness();
            const n = color
                ? this.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion, color)
                : lens.refractiveIndex;

            // 第一次折射（空气 → 平板），法线沿 x 轴
            const sinR = Utils.clamp(Math.sin(rayAngle) / n, -1, 1);
            const r = Math.asin(sinR);

            // 板内沿折射角走到后表面
            const x2 = lens.x + t / 2;
            const y2 = entry.y + t * Math.tan(r);

            // 第二次折射（平板 → 空气），出射方向恢复为入射方向；
            // 横向错开量 = 板厚 × (tan i − tan r)
            const lateralShift = t * (Math.tan(rayAngle) - Math.tan(r));

            return {
                points: [{ x: x2, y: y2, inside: true }],
                exit: { x: x2, y: y2 },
                exitAngle: rayAngle,
                lateralShift
            };
        }

        const halfHeight = lens.getHeight() / 2;
        const h = entry.y - lens.y;
        const exitAngle = this.bendThinLens(rayAngle, h, halfHeight, lens, color);

        return {
            points: [],
            exit: { x: entry.x, y: entry.y },
            exitAngle,
            lateralShift: 0
        };
    },

    /**
     * 分析透镜对水平平行光的实际作用（测验校验与焦点标注共用）。
     *
     * @param {Lens} lens 透镜
     * @param {object} [opts]
     * @param {number} [opts.rays=9] 采样光线条数
     * @param {'red'|'green'|'blue'|null} [opts.color=null] 光色
     * @param {number} [opts.angleDeg=0] 平行光倾角（仅平面透镜侧移使用）
     * @returns {object} 分析结果
     */
    analyzeLens(lens, opts = {}) {
        const rays = opts.rays || 9;
        const color = opts.color || null;
        const angleDeg = typeof opts.angleDeg === 'number' ? opts.angleDeg : 0;
        const n = color
            ? this.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion, color)
            : lens.refractiveIndex;

        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            const theta = Utils.degToRad(angleDeg);
            const t = lens.getThickness();
            const sinR = Utils.clamp(Math.sin(theta) / n, -1, 1);
            const r = Math.asin(sinR);
            const lateralShift = Math.abs(t * (Math.tan(theta) - Math.tan(r)));
            return {
                type: lens.type,
                converging: false,
                diverging: false,
                virtualFocus: false,
                fParaxial: Infinity,
                focalMin: Infinity,
                focalMax: Infinity,
                focalSpread: 0,
                lateralShift,
                directionChange: 0,
                n
            };
        }

        const a = lens.getHeight() / 2;
        const fMag = this.calculateFocalLength(n, lens.curvature);
        const f0 = lens.type === CONFIG.LENS_TYPES.CONCAVE ? -fMag : fMag;
        const crossings = [];

        for (let i = 1; i <= rays; i++) {
            const h = -a + 2 * a * (i / (rays + 1));
            if (Math.abs(h) < 1e-6) continue;
            const exitAngle = this.bendThinLens(0, h, a, lens, color);
            // 出射光从 (0, h) 出发 y(x) = h + tan θ'·x，与光轴交于 x = −h/tan θ'
            const crossing = -h / Math.tan(exitAngle);
            crossings.push(crossing);
        }

        const focalMin = Math.min(...crossings);
        const focalMax = Math.max(...crossings);
        const focalMean = crossings.reduce((s, v) => s + v, 0) / crossings.length;
        const converging = focalMean > 0;

        return {
            type: lens.type,
            converging,
            diverging: !converging,
            virtualFocus: !converging, // 凹透镜交点在入射侧，为虚焦点
            fParaxial: f0,
            focalMin,
            focalMax,
            focalMean,
            focalSpread: focalMax - focalMin,
            lateralShift: 0,
            directionChange: 0,
            n
        };
    },

    /**
     * 生成平行光线（从画布左侧射入）。
     * @param {number} canvasHeight 画布高
     * @param {number} rayCount 光线条数
     * @param {number} angle 倾角（度）
     * @param {Array<{y:number,getHeight():number}>} [lenses] 画布上的透镜，
     *        提供时光线优先均匀覆盖最靠左透镜的口径
     */
    generateParallelRays(canvasHeight, rayCount, angle, lenses = []) {
        const angleRad = Utils.degToRad(angle);

        // 找到最靠左的透镜，按其口径布光，保证多条光线真正穿过透镜
        let target = null;
        for (const lens of lenses) {
            if (!target || lens.x < target.x) target = lens;
        }

        if (target) {
            const halfHeight = target.getHeight() / 2 * 0.92;
            // 反算光线起点，使倾斜的平行光在透镜位置均匀覆盖口径，
            // 否则大倾角时光束会整体错开、打不到透镜
            const rays = [];
            for (let i = 0; i < rayCount; i++) {
                const offset = rayCount === 1
                    ? 0
                    : -halfHeight + 2 * halfHeight * (i / (rayCount - 1));
                const yAtLens = target.y + offset;
                const yStart = yAtLens - target.x * Math.tan(angleRad);
                rays.push({ x: 0, y: yStart, angle: angleRad });
            }
            return rays;
        }

        const spacing = canvasHeight / (rayCount + 1);
        const rays = [];
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
            rays.push({
                x: sourceX,
                y: sourceY,
                angle: -halfSpread + step * i
            });
        }
        return rays;
    }
};
