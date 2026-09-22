/**
 * 透镜类
 */
class Lens {
    constructor(options = {}) {
        this.id = options.id || Utils.generateId();
        this.type = options.type || CONFIG.LENS_TYPES.CONVEX;
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.refractiveIndex = options.refractiveIndex || CONFIG.LENS_DEFAULTS.refractiveIndex;
        this.size = options.size || CONFIG.LENS_DEFAULTS.size;
        this.curvature = options.curvature || CONFIG.LENS_DEFAULTS.curvature;
        this.material = options.material || CONFIG.LENS_DEFAULTS.material;
        this.selected = false;
        
        // 根据材料设置默认参数
        this.applyMaterial(this.material);
    }
    
    /**
     * 应用材料预设
     */
    applyMaterial(materialId, forceIndex = false) {
        const materials = CONFIG.MATERIALS;
        let material;
        
        switch (materialId) {
            case 'highIndex':
                material = materials.HIGH_INDEX;
                break;
            case 'lowDispersion':
                material = materials.LOW_DISPERSION;
                break;
            default:
                material = materials.NORMAL;
        }
        
        this.material = materialId;
        this.dispersion = material.dispersion;
        
        // 只在初始化（或显式强制）时设置折射率，避免改材料时冲掉用户滑块值
        if (forceIndex || !this._initialized) {
            this.refractiveIndex = material.refractiveIndex;
            this._initialized = true;
        }
    }
    
    /**
     * 获取透镜高度（口径）
     */
    getHeight() {
        return 80 * (this.size / 100);
    }

    /**
     * 获取透镜宽度（绘制用）
     */
    getWidth() {
        const baseWidth = this.type === CONFIG.LENS_TYPES.PLANO ? 8 : 30;
        return baseWidth * (this.size / 100) * (this.curvature / 50);
    }

    /**
     * 获取平面透镜（平行平板）的厚度
     * 厚度随尺寸变化，斜入射的侧移量与厚度成正比
     */
    getThickness() {
        return 14 * (this.size / 100);
    }

    /**
     * 获取近轴焦距（与 Physics 统一口径）
     * @param {'red'|'green'|'blue'|null} [color] 光色
     * @returns {number} px，凹透镜为负，平面透镜为 Infinity
     */
    getFocalLength(color = null) {
        if (this.type === CONFIG.LENS_TYPES.PLANO) {
            return Infinity;
        }
        const n = color
            ? Physics.calculateDispersionIndex(this.refractiveIndex, this.dispersion, color)
            : this.refractiveIndex;
        const magnitude = Physics.calculateFocalLength(n, this.curvature);
        // 凹透镜为虚焦点，焦距为负
        return this.type === CONFIG.LENS_TYPES.CONCAVE ? -magnitude : magnitude;
    }
    
    /**
     * 检测点是否在透镜内
     */
    containsPoint(px, py) {
        const halfWidth = this.getWidth() / 2 + 10; // 增加点击区域
        const halfHeight = this.getHeight() / 2 + 10;
        
        return px >= this.x - halfWidth && 
               px <= this.x + halfWidth &&
               py >= this.y - halfHeight && 
               py <= this.y + halfHeight;
    }
    
    /**
     * 获取透镜类型名称
     */
    getTypeName() {
        const names = {
            [CONFIG.LENS_TYPES.CONVEX]: '凸透镜',
            [CONFIG.LENS_TYPES.CONCAVE]: '凹透镜',
            [CONFIG.LENS_TYPES.PLANO]: '平面透镜',
            [CONFIG.LENS_TYPES.ASPHERIC]: '非球面透镜'
        };
        return names[this.type] || '透镜';
    }
    
    /**
     * 获取材料名称
     */
    getMaterialName() {
        const names = {
            normal: '普通玻璃',
            highIndex: '高折射率镜片',
            lowDispersion: '低色散镜片'
        };
        return names[this.material] || '普通玻璃';
    }
    
    /**
     * 重置为默认参数
     */
    reset() {
        this.refractiveIndex = CONFIG.LENS_DEFAULTS.refractiveIndex;
        this.size = CONFIG.LENS_DEFAULTS.size;
        this.curvature = CONFIG.LENS_DEFAULTS.curvature;
        // 保持当前材料，只把折射率等参数恢复到该材料的默认值
        this.applyMaterial(this.material, true);
    }
    
    /**
     * 序列化为JSON
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            refractiveIndex: this.refractiveIndex,
            size: this.size,
            curvature: this.curvature,
            material: this.material
        };
    }
    
    /**
     * 从JSON创建透镜
     */
    static fromJSON(json) {
        return new Lens(json);
    }
}

// Node 测试环境导出（浏览器中 globalThis 即 window，无副作用）
if (typeof globalThis !== 'undefined') {
    globalThis.Lens = Lens;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Lens };
}
