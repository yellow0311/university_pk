/**
 * 侧边栏面板 —— 排名列表、详情、雷达图、大学清单。
 *
 * 数据来源由 app.js 注入：省份数据、国家数据、某国海外地区数据都能复用。
 */
const Panel = (() => {
    const DIM_NAMES = {
        'top_universities': '顶尖大学', 'international': '国际影响力',
        'discipline_strength': '学科实力', 'faculty': '师资力量',
        'scale': '办学规模', 'research': '科研产出',
    };
    const GRADE_COLORS = { 'S': '#22c55e', 'A': '#3b82f6', 'B': '#eab308', 'C': '#f97316', 'D': '#ef4444' };
    const UNI_CACHE = new Map();

    let allData = null;
    let currentDimension = 'composite';
    let currentScope = 'world';
    let currentContextName = '';
    let selectedKey = null;
    let radarChart = null;

    function _el(id) { return document.getElementById(id); }

    function dimValue(info, dimension) {
        if (!info) return 0;
        if (dimension === 'composite' || !DIM_NAMES[dimension]) return Number(info.composite) || 0;
        return Number(info.normalized && info.normalized[dimension]) || 0;
    }

    function dimLabel(dimension) {
        return dimension === 'composite' ? '综合' : (DIM_NAMES[dimension] || dimension);
    }

    function titleForScope() {
        if (currentScope === 'region') {
            return `🏆 ${currentContextName || '国家'} · 地区排名`;
        }
        return currentScope === 'world' ? '🏆 全球排名 TOP 10' : '🏆 全国排名 TOP 10';
    }

    // ------------------------------------------------ public API

    function init(data, dimension, scope) {
        allData = data;
        currentDimension = dimension || 'composite';
        currentScope = scope || 'world';
        selectedKey = null;
        showRankings();
    }

    function update(data, dimension, scope) {
        allData = data;
        currentDimension = dimension || currentDimension;
        if (scope) currentScope = scope;
        if (selectedKey && data && data[selectedKey]) {
            showDetail(selectedKey);
        } else {
            showRankings();
        }
    }

    function showRankings() {
        selectedKey = null;
        const detail = _el('provinceDetail');
        const content = _el('sidebarContent');
        if (detail) detail.style.display = 'none';
        if (content) content.style.display = 'block';
        const title = _el('panelTitle');
        if (title) title.textContent = titleForScope();
        renderRankList();
    }

    function renderRankList() {
        const listEl = _el('rankList');
        if (!listEl) return;
        if (!allData || Object.keys(allData).length === 0) {
            listEl.innerHTML = '<li class="rank-item"><div class="rank-info"><div class="rank-province">当前筛选条件下暂无数据</div></div></li>';
            return;
        }

        const sorted = Object.entries(allData)
            .map(([name, info]) => ({ name, info, score: dimValue(info, currentDimension) }))
            .sort((a, b) => b.score - a.score);

        const topN = currentScope === 'region' ? sorted : sorted.slice(0, 10);
        const label = dimLabel(currentDimension);

        listEl.innerHTML = topN.map((item, i) => {
            const info = item.info;
            const displayName = info.name || item.name;
            const sub = [info.region, label].filter(Boolean).join(' · ');
            return `<li class="rank-item" data-key="${item.name}" tabindex="0">
                <span class="rank-num">${i + 1}</span>
                <div class="rank-info">
                    <div class="rank-province">${displayName}</div>
                    <div class="rank-region">${sub}</div>
                </div>
                <span class="rank-grade grade-${info.grade}">${info.grade}</span>
                <span class="rank-score">${item.score.toFixed(1)}</span>
            </li>`;
        }).join('');

        listEl.querySelectorAll('.rank-item[data-key]').forEach(el => {
            const open = () => showDetail(el.dataset.key);
            el.addEventListener('click', open);
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
            });
        });
    }

    function showDetail(key) {
        if (!allData || !allData[key]) return;
        selectedKey = key;

        const info = allData[key];
        const content = _el('sidebarContent');
        const detail = _el('provinceDetail');
        if (content) content.style.display = 'none';
        if (detail) detail.style.display = 'flex';
        _el('panelTitle').textContent = '📊 详细指标';

        const displayName = info.name || key;
        _el('detailProvinceName').textContent = displayName;
        _el('detailGrade').innerHTML = `
            综合得分: <b style="font-size:24px;color:${GRADE_COLORS[info.grade] || '#e8edf2'}">${(info.composite || 0).toFixed(1)}</b>
            <span class="rank-grade grade-${info.grade}">${info.grade} (${info.grade_label || ''})</span>`;

        _el('detailScores').innerHTML = Object.entries(DIM_NAMES).map(([k, name]) => {
            const value = (info.normalized && info.normalized[k]) || 0;
            return `<div class="detail-score-item">
                <div class="ds-label">${name}</div>
                <div class="ds-value">${value.toFixed(1)}</div>
            </div>`;
        }).join('');

        renderRadar(displayName, info);
        renderUniversityList(key, info);
    }

    async function renderUniversityList(key, info) {
        const el = _el('uniList');
        if (!el) return;

        const cacheKey = `${currentScope}:${key}`;
        if (UNI_CACHE.has(cacheKey)) {
            renderUniversities(el, UNI_CACHE.get(cacheKey));
            return;
        }

        el.innerHTML = '<div class="uni-empty">加载中...</div>';
        const queries = [];
        const push = q => { if (!queries.includes(q)) queries.push(q); };
        if (info && info.country) push({ country: info.country, region: key });
        push({ province: key });
        push({ country: key });
        push({ region: key });

        let unis = [];
        for (const query of queries) {
            try {
                const arr = await Api.getUniversities({ ...query, limit: 10 });
                if (Array.isArray(arr) && arr.length) { unis = arr; break; }
            } catch (_) { /* 继续尝试下一个查询 */ }
        }

        UNI_CACHE.set(cacheKey, unis);
        renderUniversities(el, unis);
    }

    function renderUniversities(el, unis) {
        if (!unis || unis.length === 0) {
            el.innerHTML = '<div class="uni-empty">暂无大学明细数据</div>';
            return;
        }
        el.innerHTML = unis.slice(0, 10).map((u, i) => {
            const badgeClass = `badge-${(u.type || '普通本科').replace(/\s+/g, '')}`;
            let note = '';
            if (u.note) note = `<span class="uni-note">${u.note}</span>`;
            else if (u.qs_rank) note = `<span class="uni-note">QS ${u.qs_rank}</span>`;
            return `<div class="uni-item">
                <span class="uni-rank">${i + 1}</span>
                <span class="uni-name" title="${u.name}">${u.name}</span>
                <span class="uni-type-badge ${badgeClass}">${u.type || '本科'}</span>
                <span class="uni-score">${u.score}</span>
                ${note}
            </div>`;
        }).join('');
    }

    function renderRadar(label, info) {
        const container = _el('radarChart');
        if (!container || typeof echarts === 'undefined') return;
        if (!radarChart) radarChart = echarts.init(container);

        const dims = Object.entries(DIM_NAMES);
        const values = dims.map(([k]) => (info.normalized && info.normalized[k]) || 0);
        const entries = Object.entries(allData || {});
        const avgValues = dims.map(([k]) => {
            if (!entries.length) return 0;
            const sum = entries.reduce((acc, [, v]) => acc + ((v.normalized && v.normalized[k]) || 0), 0);
            return sum / entries.length;
        });

        radarChart.setOption({
            backgroundColor: 'transparent',
            legend: {
                data: [label, '平均值'], bottom: 0,
                textStyle: { color: '#8899a6', fontSize: 11 },
                itemWidth: 12, itemHeight: 8, itemGap: 18,
            },
            radar: {
                center: ['50%', '50%'], radius: '56%',
                indicator: dims.map(([, name]) => ({ name, max: 100 })),
                axisName: { color: '#8899a6', fontSize: 10 },
                axisLine: { lineStyle: { color: '#2a3a4a' } },
                splitLine: { lineStyle: { color: '#2a3a4a' } },
                splitArea: { areaStyle: { color: ['transparent'] } },
            },
            series: [{
                type: 'radar',
                data: [
                    {
                        value: values, name: label, symbol: 'circle', symbolSize: 4,
                        lineStyle: { color: '#3b82f6', width: 2 },
                        areaStyle: { color: 'rgba(59,130,246,0.15)' },
                        itemStyle: { color: '#3b82f6' },
                    },
                    {
                        value: avgValues, name: '平均值', symbol: 'circle', symbolSize: 3,
                        lineStyle: { color: '#5c6e7a', width: 1.5, type: 'dashed' },
                        areaStyle: { color: 'transparent' },
                        itemStyle: { color: '#5c6e7a' },
                    },
                ],
            }],
        }, true);
    }

    function backToRanking() {
        showRankings();
    }

    function showSubRegions(regionData, countryCode, countryName) {
        allData = regionData;
        currentScope = 'region';
        currentContextName = countryName || countryCode || '';
        selectedKey = null;
        _el('provinceDetail').style.display = 'none';
        _el('sidebarContent').style.display = 'block';
        _el('panelTitle').textContent = titleForScope();
        renderRankList();
    }

    return {
        init, update, showRankings, showDetail, backToRanking, showSubRegions,
        getSelectedKey: () => selectedKey,
        getScope: () => currentScope,
    };
})();
