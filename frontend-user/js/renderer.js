/**
 * 光路渲染器
 *
 * 所有光路均通过 Physics.traceRay / Physics.analyzeParallelBeam 计算，
 * 画布所见即题目、参数面板与测验判定所用的同一套规则。
 */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.lenses = [];
        this.lightMode = CONFIG.LIGHT_DEFAULTS.mode;
        this.rayCount = CONFIG.LIGHT_DEFAULTS.rayCount;
        this.incidentAngle = CONFIG.LIGHT_DEFAULTS.angle;
        this.isRunning = false;
        this.showLabels = true;
        this.showDispersion = false;
        this.simpleMode = false;

        this.resize();
    }

    resize() {
        const wrapper = this.canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;

        this.render();
    }

    setLenses(lenses) {
        this.lenses = lenses;
        this.render();
    }

    setLightMode(mode) {
        this.lightMode = mode;
        this.render();
    }

    setRayCount(count) {
        this.rayCount = count;
        this.render();
    }

    setIncidentAngle(angle) {
        this.incidentAngle = angle;
        this.render();
    }

    toggleRunning() {
        this.isRunning = !this.isRunning;
        this.render();
        return this.isRunning;
    }

    setRunning(running) {
        this.isRunning = running;
        this.render();
    }

    toggleLabels() {
        this.showLabels = !this.showLabels;
        this.render();
        return this.showLabels;
    }

    setShowDispersion(show) {
        this.showDispersion = show;
        this.render();
    }

    setSimpleMode(simple) {
        this.simpleMode = simple;
        this.render();
    }

    render() {
        this.clear();
        this.drawGrid();
        this.drawOpticalAxis();

        if (this.isRunning) {
            this.drawLightRays();
        }

        this.drawLenses();

        if (this.showLabels && this.isRunning) {
            this.drawLabels();
        }
    }

    clear() {
        this.ctx.fillStyle = '#FAFAFA';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawGrid() {
        if (this.simpleMode) return;

        const gridSize = 40;
        this.ctx.strokeStyle = CONFIG.COLORS.GRID;
        this.ctx.lineWidth = 0.5;

        for (let x = gridSize; x < this.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }

        for (let y = gridSize; y < this.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
    }

    drawOpticalAxis() {
        const centerY = this.height / 2;

        this.ctx.strokeStyle = CONFIG.COLORS.OPTICAL_AXIS;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.width, centerY);
        this.ctx.stroke();

        this.ctx.setLineDash([]);
    }

    drawLenses() {
        this.lenses.forEach(lens => this.drawLens(lens));
    }

    drawLens(lens) {
        const ctx = this.ctx;
        const x = lens.x;
        const y = lens.y;
        const width = lens.getWidth();
        const halfHeight = lens.getHeight() / 2;

        ctx.save();

        let fillColor = CONFIG.COLORS.LENS_FILL;
        let strokeColor = CONFIG.COLORS.LENS_STROKE;

        if (lens.material === 'lowDispersion') {
            fillColor = 'rgba(93, 122, 58, 0.3)';
            strokeColor = '#5D7A3A';
        } else if (lens.material === 'highIndex') {
            fillColor = 'rgba(93, 78, 140, 0.3)';
            strokeColor = '#5D4E8C';
        }

        if (lens.selected) {
            strokeColor = CONFIG.COLORS.LENS_SELECTED;
            ctx.shadowColor = CONFIG.COLORS.LENS_SELECTED;
            ctx.shadowBlur = 10;
        }

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = CONFIG.RENDER.LENS_STROKE_WIDTH;

        ctx.beginPath();

        switch (lens.type) {
            case CONFIG.LENS_TYPES.CONVEX:
                this.drawConvexLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
            case CONFIG.LENS_TYPES.CONCAVE:
                this.drawConcaveLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
            case CONFIG.LENS_TYPES.PLANO:
                this.drawPlanoLens(ctx, x, y, width, halfHeight);
                break;
            case CONFIG.LENS_TYPES.ASPHERIC:
                this.drawAsphericLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
        }

        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    drawConvexLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100);
        ctx.moveTo(x, y - halfHeight);
        ctx.quadraticCurveTo(x + curveAmount, y, x, y + halfHeight);
        ctx.quadraticCurveTo(x - curveAmount, y, x, y - halfHeight);
    }

    drawConcaveLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100) * 0.5;
        const edgeWidth = width * 0.3;
        ctx.moveTo(x - edgeWidth, y - halfHeight);
        ctx.quadraticCurveTo(x + curveAmount, y, x - edgeWidth, y + halfHeight);
        ctx.lineTo(x + edgeWidth, y + halfHeight);
        ctx.quadraticCurveTo(x - curveAmount, y, x + edgeWidth, y - halfHeight);
        ctx.closePath();
    }

    drawPlanoLens(ctx, x, y, thickness, halfHeight) {
        // 两面平行的平板，厚度即 Physics 中的平板厚度
        ctx.rect(x - thickness / 2, y - halfHeight, thickness, halfHeight * 2);
    }

    drawAsphericLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100);
        ctx.moveTo(x, y - halfHeight);
        ctx.bezierCurveTo(x + curveAmount * 0.8, y - halfHeight * 0.3, x + curveAmount * 0.8, y + halfHeight * 0.3, x, y + halfHeight);
        ctx.bezierCurveTo(x - curveAmount * 0.8, y + halfHeight * 0.3, x - curveAmount * 0.8, y - halfHeight * 0.3, x, y - halfHeight);
    }

    /**
     * 生成初始光线
     */
    buildInitialRays() {
        if (this.lightMode === CONFIG.LIGHT_MODES.PARALLEL) {
            // 让平行光在最左侧透镜平面上均匀铺满口径，保证效果可见
            const firstLens = this.lenses.reduce(
                (min, l) => (l.x < min.x ? l : min),
                this.lenses[0]
            );
            return Physics.generateParallelRays(
                this.height, this.rayCount, this.incidentAngle, firstLens || null, 0
            );
        }
        return Physics.generatePointSourceRays(50, this.height / 2, this.rayCount);
    }

    drawLightRays() {
        const rays = this.buildInitialRays();

        // 色散模式：只有存在色散材料时才分色绘制
        const hasDispersiveLens = this.lenses.some(l => (l.dispersion || 0) > 0.05);
        const useDispersion = this.showDispersion && hasDispersiveLens;

        if (useDispersion) {
            ['red', 'green', 'blue'].forEach(color => {
                rays.forEach(ray => this.drawTracedRay(ray, color));
            });
        } else {
            rays.forEach(ray => this.drawTracedRay(ray, null));
        }
    }

    /**
     * 追踪并绘制一条光线（统一入口，规则来自 Physics.traceRay）
     * - 色散模式（color 非空）：整条线使用该颜色
     * - 普通模式：入射段红色、透镜内部橙色、出射段蓝色
     */
    drawTracedRay(ray, color) {
        const ctx = this.ctx;
        const traced = Physics.traceRay(this.lenses, ray, { color });

        traced.segments.forEach((seg, idx) => {
            let style;
            if (color) {
                style = CONFIG.COLORS[`RAY_${color.toUpperCase()}`];
            } else if (seg.phase === 'incident') {
                style = CONFIG.COLORS.INCIDENT_RAY;
            } else if (seg.phase === 'inside') {
                style = '#F39C12';
            } else {
                style = CONFIG.COLORS.REFRACTED_RAY;
            }
            ctx.strokeStyle = style;
            ctx.lineWidth = CONFIG.RENDER.RAY_WIDTH;
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            const clipped = this.clipToCanvas(seg);
            ctx.lineTo(clipped.x, clipped.y);
            ctx.stroke();
        });
    }

    /**
     * 把一条线段（终点可能在画布外很远）裁剪到画布范围内
     */
    clipToCanvas(seg) {
        const pad = 50;
        const minX = -pad, maxX = this.width + pad;
        const minY = -pad, maxY = this.height + pad;

        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;

        // 起点在画布内时，找到最先离开边界的比例
        let t = 1;
        if (dx !== 0) {
            const t1 = (minX - seg.x1) / dx;
            const t2 = (maxX - seg.x1) / dx;
            const candidates = [t1, t2].filter(v => v > 0 && v < t);
            if (candidates.length) t = Math.min(...candidates);
        }
        if (dy !== 0) {
            const t1 = (minY - seg.y1) / dy;
            const t2 = (maxY - seg.y1) / dy;
            const candidates = [t1, t2].filter(v => v > 0 && v < t);
            if (candidates.length) t = Math.min(...candidates);
        }
        return { x: seg.x1 + dx * t, y: seg.y1 + dy * t };
    }

    /**
     * 焦点标注：
     * - 凸/非球面：实焦点（实心）
     * - 凹透镜：虚焦点（空心，位于透镜入射侧）
     * - 色散开启：红/绿/蓝三色焦点与刻度，位置随颜色变化
     */
    drawLabels() {
        this.lenses.forEach(lens => {
            if (lens.type === CONFIG.LENS_TYPES.PLANO) return;

            const hasDispersion = this.showDispersion && (lens.dispersion || 0) > 0.05;
            if (hasDispersion) {
                this.drawColorFocalMarks(lens);
            } else {
                this.drawSingleFocalMark(lens);
            }
        });

        this.ctx.fillStyle = CONFIG.COLORS.OPTICAL_AXIS;
        this.ctx.font = '10px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('光轴', 10, this.height / 2 - 8);
    }

    drawSingleFocalMark(lens) {
        const f = lens.getFocalLength();
        if (!isFinite(f)) return;

        const fx = lens.x + f;
        const fy = lens.y;
        const isVirtual = f < 0;

        if (fx < -30 || fx > this.width + 30) return;

        this.drawAxisTick(fx, fy, CONFIG.COLORS.FOCAL_POINT, isVirtual);

        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = CONFIG.COLORS.FOCAL_POINT;
        const label = isVirtual
            ? `虚焦点 ${Math.abs(Math.round(f))}`
            : `F ≈ ${Math.round(f)}`;
        this.ctx.fillText(label, fx, fy - 12);
    }

    drawColorFocalMarks(lens) {
        const colors = ['red', 'green', 'blue'];
        this.ctx.font = '10px sans-serif';
        this.ctx.textAlign = 'center';

        colors.forEach((color, i) => {
            const n = Physics.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion || 0, color);
            const f = Physics.calculateFocalLength(lens, n);
            if (!isFinite(f) || f <= 0) return; // 凹透镜为虚焦点，不绘制色散实焦刻度

            const fx = lens.x + f;
            if (fx < -30 || fx > this.width + 30) return;

            const style = CONFIG.COLORS[`RAY_${color.toUpperCase()}`];
            this.drawAxisTick(fx, lens.y, style, false);

            this.ctx.fillStyle = style;
            const name = { red: '红', green: '绿', blue: '蓝' }[color];
            this.ctx.fillText(`${name}F ${Math.round(f)}`, fx, lens.y - 12 - i * 12);
        });

        // 三色若几乎重合（低色散），补一条说明
        const nR = Physics.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion || 0, 'red');
        const nB = Physics.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion || 0, 'blue');
        const fR = Physics.calculateFocalLength(lens, nR);
        const fB = Physics.calculateFocalLength(lens, nB);
        if (isFinite(fR) && fR > 0 && isFinite(fB) && fB > 0 &&
            Math.abs(fR - fB) < OPTICS_SPEC.TOLERANCES.LOW_DISPERSION_FOCUS_DELTA) {
            this.ctx.fillStyle = '#5D7A3A';
            this.ctx.font = '10px sans-serif';
            this.ctx.fillText('三色焦点几乎重合（低色散）', lens.x, lens.y + 22);
        }
    }

    drawAxisTick(x, y, color, hollow) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1;

        // 光轴上的刻度短线
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();

        // 焦点圆点
        ctx.beginPath();
        ctx.arc(x, y, CONFIG.RENDER.FOCAL_POINT_RADIUS, 0, Math.PI * 2);
        if (hollow) {
            ctx.fillStyle = '#FAFAFA';
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fill();
        }
        ctx.restore();
    }

    getLensAtPoint(x, y) {
        for (let i = this.lenses.length - 1; i >= 0; i--) {
            if (this.lenses[i].containsPoint(x, y)) {
                return this.lenses[i];
            }
        }
        return null;
    }
}
