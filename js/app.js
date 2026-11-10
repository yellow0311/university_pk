/**
 * 主控制器 —— 世界 / 中国 两级地图 + 国家下钻。
 *
 * 页面状态集中放在 state 里，任何交互（切换视图、切换维度、筛选、点击地图）
 * 最终都走 render()，避免数据源和面板显示不一致。
 */
(async function App() {
    const COUNTRIES_WITH_REGIONS = new Set(['US', 'UK', 'DE', 'JP', 'AU', 'CA', 'FR']);

    const SCOPE_REGIONS = {
        world: ['北美', '欧洲', '亚洲', '大洋洲', '中东', '非洲', '南美'],
        china: ['华北', '东北', '华东', '华中', '华南', '西南', '西北'],
    };

    const state = {
        scope: 'world',                                  // world | china
        dimension: 'composite',
        filters: { region: null, grade: null },
        data: { world: null, china: null },
        drill: null,                                     // { code, name, data }
        meta: null,
    };

    const scopeTabs = document.getElementById('scopeTabs');
    const dimensionTabs = document.getElementById('dimensionTabs');
    const regionFilter = document.getElementById('regionFilter');
    const gradeFilter = document.getElementById('gradeFilter');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const backBtn = document.getElementById('backToRanking');
    const crumb = document.getElementById('sidebarCrumb');
    const crumbRoot = document.getElementById('crumbRoot');
    const crumbCurrent = document.getElementById('crumbCurrent');

    // ------------------------------------------------------------ 数据选择

    function baseData() {
        return state.data[state.scope] || {};
    }

    function viewData() {
        return state.drill ? state.drill.data : baseData();
    }

    function panelScope() {
        return state.drill ? 'region' : state.scope;
    }

    function filteredData() {
        const data = viewData();
        if (!state.filters.region && !state.filters.grade) return data;
        const result = {};
        for (const [key, info] of Object.entries(data)) {
            const okRegion = !state.filters.region || info.region === state.filters.region;
            const okGrade = !state.filters.grade || info.grade === state.filters.grade;
            if (okRegion && okGrade) result[key] = info;
        }
        return result;
    }

    // ------------------------------------------------------------ 渲染

    function render(options = {}) {
        MapVis.update(baseData(), state.dimension, state.filters);
        if (options.resetPanel) {
            Panel.init(filteredData(), state.dimension, panelScope());
        } else {
            Panel.update(filteredData(), state.dimension, panelScope());
        }
        updateCrumb();
    }

    function updateCrumb() {
        if (!crumb) return;
        if (!state.drill) {
            crumb.hidden = true;
            return;
        }
        crumb.hidden = false;
        crumbRoot.textContent = state.scope === 'world' ? '🌍 世界' : '🇨🇳 中国';
        crumbCurrent.textContent = state.drill.name;
    }

    // ------------------------------------------------------------ 启动

    async function init() {
        showLoading(true);
        try {
            const [countries, provinces, meta] = await Promise.all([
                Api.getCountries(),
                Api.getProvinces(),
                Api.getMetadata(),
            ]);
            state.data.world = countries;
            state.data.china = provinces;
            state.meta = meta;
        } catch (err) {
            console.error(err);
            showLoading(false);
            showError(Api.isStatic
                ? '静态数据加载失败，请确认 <code>data/</code> 目录完整（刚部署时可能需要等 Pages 构建完成）。'
                : '无法连接到后端服务，请确认 <code>python -m uvicorn backend.main:app</code> 已启动。');
            return;
        }

        const mapReady = await MapVis.init('mapChart');
        if (!mapReady) {
            showLoading(false);
            return;
        }

        populateRegionFilter();
        MapVis.setScope(state.scope);
        render({ resetPanel: true });
        bindEvents();
        showLoading(false);
    }

    // ------------------------------------------------------------ 交互

    function switchScope(scope) {
        if (scope === state.scope) return;
        state.scope = scope;
        state.drill = null;
        state.filters = { region: null, grade: null };
        gradeFilter.value = '';
        scopeTabs.querySelectorAll('.scope-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.scope === scope);
        });
        populateRegionFilter();
        MapVis.setScope(scope);
        render({ resetPanel: true });
    }

    async function drillInto(code) {
        const country = state.data.world[code] || {};
        showLoading(true);
        try {
            const regionData = await Api.getRegions(code);
            if (regionData && Object.keys(regionData).length > 0) {
                state.drill = { code, name: country.name || code, data: regionData };
                state.filters = { region: null, grade: null };
                gradeFilter.value = '';
                regionFilter.value = '';
                Panel.showSubRegions(regionData, code, state.drill.name);
                updateCrumb();
            } else {
                Panel.showDetail(code);
            }
        } catch (err) {
            console.error('下钻失败:', err);
        } finally {
            showLoading(false);
        }
    }

    function goBack() {
        if (!state.drill) return;
        state.drill = null;
        render({ resetPanel: true });
    }

    function handleMapClick(key) {
        if (!key) return;
        if (state.drill) {
            if (state.drill.data[key]) Panel.showDetail(key);
            else goBack();
            return;
        }
        if (!baseData()[key]) return;
        if (state.scope === 'world' && COUNTRIES_WITH_REGIONS.has(key)) {
            drillInto(key);
        } else {
            Panel.showDetail(key);
        }
    }

    function bindEvents() {
        scopeTabs.addEventListener('click', e => {
            const tab = e.target.closest('.scope-tab');
            if (tab) switchScope(tab.dataset.scope);
        });

        dimensionTabs.addEventListener('click', e => {
            const tab = e.target.closest('.tab');
            if (!tab || tab.dataset.dim === state.dimension) return;
            state.dimension = tab.dataset.dim;
            dimensionTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            render();
        });

        regionFilter.addEventListener('change', function () {
            state.filters.region = this.value || null;
            render();
        });

        gradeFilter.addEventListener('change', function () {
            state.filters.grade = this.value || null;
            render();
        });

        MapVis.onClick(handleMapClick);

        backBtn.addEventListener('click', () => {
            if (state.drill) goBack();
            else Panel.backToRanking();
        });

        crumbRoot.addEventListener('click', goBack);

        sidebarToggle.addEventListener('click', function () {
            sidebar.classList.toggle('collapsed');
            if (sidebar.classList.contains('collapsed')) {
                this.textContent = '▶';
                this.title = '显示面板';
            } else {
                this.textContent = '◀';
                this.title = '收起面板';
                Panel.showRankings();
            }
            setTimeout(() => MapVis.resize(), 350);
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (state.drill) goBack();
                else Panel.backToRanking();
            }
        });

        window.addEventListener('resize', () => MapVis.resize());
    }

    // ------------------------------------------------------------ 辅助

    function populateRegionFilter() {
        const options = SCOPE_REGIONS[state.scope] || SCOPE_REGIONS.world;
        regionFilter.innerHTML = '';
        const all = document.createElement('option');
        all.value = '';
        all.textContent = '📍 全部地区';
        regionFilter.appendChild(all);
        for (const opt of options) {
            const el = document.createElement('option');
            el.value = opt;
            el.textContent = opt;
            regionFilter.appendChild(el);
        }
        regionFilter.value = '';
    }

    function showLoading(show) {
        const mapSection = document.getElementById('mapSection');
        if (!mapSection) return;
        let overlay = mapSection.querySelector('.loading-overlay');
        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'loading-overlay';
                overlay.innerHTML = '<div class="loading-spinner"></div>';
                mapSection.appendChild(overlay);
            }
        } else if (overlay) {
            overlay.remove();
        }
    }

    function showError(message) {
        const el = document.getElementById('mapChart');
        if (el) {
            el.innerHTML = `<div class="fatal-error">
                <div class="fatal-icon">⚠️</div>
                <p>${message}</p>
            </div>`;
        }
    }

    init();
})();
