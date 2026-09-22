/**
 * 光路渲染器
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
                this.drawPlanoLens(ctx, x, y, halfHeight, lens);
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
    
    drawPlanoLens(ctx, x, y, halfHeight, lens) {
        const t = lens ? lens.getThickness() : 14;
        ctx.rect(x - t / 2, y - halfHeight, t, halfHeight * 2);
    }
    
    drawAsphericLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100);
        ctx.moveTo(x, y - halfHeight);
        ctx.bezierCurveTo(x + curveAmount * 0.8, y - halfHeight * 0.3, x + curveAmount * 0.8, y + halfHeight * 0.3, x, y + halfHeight);
        ctx.bezierCurveTo(x - curveAmount * 0.8, y + halfHeight * 0.3, x - curveAmount * 0.8, y - halfHeight * 0.3, x, y - halfHeight);
    }
    
    drawLightRays() {
        let rays;

        if (this.lightMode === CONFIG.LIGHT_MODES.PARALLEL) {
            rays = Physics.generateParallelRays(
                this.height, this.rayCount, this.incidentAngle, this.lenses
            );
        } else {
            rays = Physics.generatePointSourceRays(50, this.height / 2, this.rayCount);
        }

        // 色散模式：分别绘制红、绿、蓝三色光（蓝在上层最明显）
        // 单色模式：入射段红色、折射后蓝色
        if (this.showDispersion) {
            ['red', 'green', 'blue'].forEach(color => {
                rays.forEach(ray => this.traceRay(ray, color));
            });
        } else {
            rays.forEach(ray => this.traceRay(ray, null));
        }
    }

    /**
     * 追踪并绘制单条光线（支持多透镜，渲染与题目校验共用 Physics 规则）
     *
     * 光路规律（与帮助文案一致）：
     * - 凸透镜：光线向光轴会聚，边缘光线存在球差
     * - 凹透镜：光线向外发散（虚焦点在入射侧）
     * - 平面透镜：方向不变，垂直入射无侧移，斜入射发生微小侧移
     * - 非球面透镜：所有平行光线严格会聚到同一焦点
     *
     * @param {{x:number,y:number,angle:number}} ray 入射光线
     * @param {'red'|'green'|'blue'|null} color 色散模式下的光色
     */
    traceRay(ray, color = null) {
        const ctx = this.ctx;
        let rayX = ray.x;
        let rayY = ray.y;
        let rayAngle = ray.angle;
        let isIncident = true;
        let lastLensId = null;

        ctx.lineWidth = CONFIG.RENDER.RAY_WIDTH;

        ctx.beginPath();
        ctx.moveTo(rayX, rayY);

        // 入射段上色
        if (color) {
            ctx.strokeStyle = CONFIG.COLORS[`RAY_${color.toUpperCase()}`];
        } else {
            ctx.strokeStyle = CONFIG.COLORS.INCIDENT_RAY;
        }

        // 追踪光线穿过多个透镜
        for (let i = 0; i < 20; i++) {
            let nearest = null;
            let nearestLens = null;
            let minDist = Infinity;

            for (const lens of this.lenses) {
                if (lens.id === lastLensId) continue;

                const hit = Physics.calculateRayLensIntersection(rayX, rayY, rayAngle, lens);
                if (hit && hit.distance < minDist) {
                    minDist = hit.distance;
                    nearest = hit;
                    nearestLens = lens;
                }
            }

            if (!nearest) break;

            // 画到入射面
            ctx.lineTo(nearest.x, nearest.y);
            ctx.stroke();

            // 统一物理规则：薄透镜一次偏折 / 平面透镜两次折射
            const result = Physics.traceThroughLens(nearest, rayAngle, nearestLens, color);

            // 平面透镜：补画板内折线段
            for (const p of result.points) {
                ctx.beginPath();
                ctx.moveTo(nearest.x, nearest.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
            }

            rayX = result.exit.x;
            rayY = result.exit.y;
            rayAngle = result.exitAngle;
            lastLensId = nearestLens.id;

            // 折射后换颜色（单色模式入射红、出射蓝；色散模式全程光本色）
            if (!color && isIncident) {
                ctx.strokeStyle = CONFIG.COLORS.REFRACTED_RAY;
                isIncident = false;
            }

            ctx.beginPath();
            ctx.moveTo(rayX, rayY);
        }

        // 画到画布边缘
        const dirX = Math.cos(rayAngle);
        const dirY = Math.sin(rayAngle);
        let endX, endY;

        if (Math.abs(dirX) > 0.001) {
            endX = dirX > 0 ? this.width + 50 : -50;
            endY = rayY + dirY * (endX - rayX) / dirX;
        } else {
            endX = rayX;
            endY = dirY > 0 ? this.height + 50 : -50;
        }

        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    drawLabels() {
        const ctx = this.ctx;

        this.lenses.forEach(lens => {
            if (lens.type === CONFIG.LENS_TYPES.PLANO) return; // 平面透镜无焦点

            if (this.showDispersion) {
                // 色散模式：红、绿、蓝三色焦点分别画在光轴上（蓝近红远）
                const labelRows = { red: -14, green: -28, blue: -42 };
                ['red', 'green', 'blue'].forEach(color => {
                    const f = lens.getFocalLength(color);
                    if (!isFinite(f)) return;
                    const focalX = lens.x + f; // 凹透镜 f 为负，落在入射侧
                    if (focalX <= 0 || focalX >= this.width) return;

                    this.drawFocalMarker(
                        focalX, lens.y, CONFIG.COLORS[`RAY_${color.toUpperCase()}`],
                        lens.type === CONFIG.LENS_TYPES.CONCAVE
                    );
                    ctx.fillStyle = CONFIG.COLORS[`RAY_${color.toUpperCase()}`];
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${Math.round(Math.abs(f))}`, focalX, lens.y + labelRows[color]);
                });
            } else {
                // 单色模式：焦点位置即绿光（d 线）近轴焦点
                const f = lens.getFocalLength();
                if (!isFinite(f)) return;
                const focalX = lens.x + f;
                if (focalX <= 0 || focalX >= this.width) return;

                const isVirtual = lens.type === CONFIG.LENS_TYPES.CONCAVE;
                this.drawFocalMarker(focalX, lens.y, CONFIG.COLORS.FOCAL_POINT, isVirtual);

                ctx.fillStyle = isVirtual ? CONFIG.COLORS.OPTICAL_AXIS : CONFIG.COLORS.FOCAL_POINT;
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(
                    isVirtual ? `F(虚) ${Math.round(Math.abs(f))}` : `F ${Math.round(f)}`,
                    focalX, lens.y - 12
                );
            }
        });

        ctx.fillStyle = CONFIG.COLORS.OPTICAL_AXIS;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('光轴（刻度单位：像素）', 10, this.height / 2 - 8);
    }

    /**
     * 绘制焦点：实焦点实心圆，虚焦点空心圆，并在光轴上加短刻度
     */
    drawFocalMarker(x, y, color, isVirtual) {
        const ctx = this.ctx;

        // 光轴刻度（短竖线）
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, CONFIG.RENDER.FOCAL_POINT_RADIUS, 0, Math.PI * 2);
        if (isVirtual) {
            ctx.fillStyle = '#FAFAFA';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = CONFIG.COLORS.OPTICAL_AXIS;
            ctx.stroke();
        } else {
            ctx.fillStyle = color;
            ctx.fill();
        }
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
