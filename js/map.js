/**
 * 地图可视化模块 —— 世界地图 & 中国地图。
 *
 * 依赖：
 *   - 本地 vendor/echarts.min.js
 *   - 本地 assets/world.json、assets/china.json（GeoJSON）
 * 全部资源本地化，无需联网。
 */
const MapVis = (() => {
    const CHINA_GEO_URL = 'assets/china.json';
    const WORLD_GEO_URL = 'assets/world.json';

    // 中国地图 GeoJSON 的省名 → 数据里的简称
    const PROVINCE_NAME = {
        '北京市': '北京', '天津市': '天津', '河北省': '河北', '山西省': '山西',
        '内蒙古自治区': '内蒙古', '辽宁省': '辽宁', '吉林省': '吉林', '黑龙江省': '黑龙江',
        '上海市': '上海', '江苏省': '江苏', '浙江省': '浙江', '安徽省': '安徽',
        '福建省': '福建', '江西省': '江西', '山东省': '山东', '河南省': '河南',
        '湖北省': '湖北', '湖南省': '湖南', '广东省': '广东', '广西壮族自治区': '广西',
        '海南省': '海南', '重庆市': '重庆', '四川省': '四川', '贵州省': '贵州',
        '云南省': '云南', '西藏自治区': '西藏', '陕西省': '陕西', '甘肃省': '甘肃',
        '青海省': '青海', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
        '台湾省': '台湾', '香港特别行政区': '香港', '澳门特别行政区': '澳门',
    };

    // 世界地图 GeoJSON 的英文国名 → 后端国家代码
    const COUNTRY_NAME_TO_CODE = {
        'United States of America': 'US', 'United States': 'US',
        'United Kingdom': 'UK', 'England': 'UK', 'Scotland': 'UK', 'Wales': 'UK',
        'Northern Ireland': 'UK',
        'China': 'CN', 'Germany': 'DE', 'Japan': 'JP', 'Canada': 'CA',
        'Australia': 'AU', 'France': 'FR', 'Switzerland': 'CH',
        'South Korea': 'KR', 'Korea': 'KR', 'Republic of Korea': 'KR',
        'Singapore': 'SG', 'Netherlands': 'NL', 'Sweden': 'SE',
        'India': 'IN', 'Russia': 'RU', 'Russian Federation': 'RU',
        'Israel': 'IL', 'New Zealand': 'NZ',
    };

    const DIM_LABELS = {
        'composite': '综合评分', 'top_universities': '顶尖大学',
        'international': '国际影响力', 'discipline_strength': '学科实力',
        'faculty': '师资力量', 'scale': '办学规模', 'research': '科研产出',
    };

    const GRADE_COLORS = {
        'S': '#22c55e', 'A': '#3b82f6', 'B': '#eab308', 'C': '#f97316', 'D': '#ef4444',
    };

    const COLORS = ['#243447', '#2c5a7a', '#3a86a8', '#55a88f', '#8cbf5a', '#d4c34a', '#f0a03c', '#f26b3a'];

    let chart = null;
    let chinaGeoJson = null;
    let worldGeoJson = null;
    let currentData = null;
    let currentDimension = 'composite';
    let currentScope = 'world';
    let clickHandler = null;

    function assetUrl(relative) {
        return new URL(relative, document.baseURI).href;
    }

    async function fetchJson(url) {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(`${url} -> HTTP ${resp.status}`);
        return resp.json();
    }

    function showFatal(container, message) {
        container.innerHTML = `<div class="fatal-error">
            <div class="fatal-icon">⚠️</div>
            <p>${message}</p>
        </div>`;
    }

    async function init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return false;
        if (typeof echarts === 'undefined') {
            showFatal(container, '图表库 echarts.min.js 未加载，请确认 frontend/vendor/echarts.min.js 存在。');
            return false;
        }

        // 先注册地图，缺一个不影响另一个
        const geoResults = await Promise.allSettled([
            fetchJson(assetUrl(CHINA_GEO_URL)),
            fetchJson(assetUrl(WORLD_GEO_URL)),
        ]);

        if (geoResults[0].status === 'fulfilled') {
            chinaGeoJson = geoResults[0].value;
            echarts.registerMap('china', chinaGeoJson);
        } else {
            console.error('加载中国地图失败:', geoResults[0].reason);
        }

        if (geoResults[1].status === 'fulfilled') {
            worldGeoJson = geoResults[1].value;
            for (const feature of worldGeoJson.features) {
                const props = feature.properties || (feature.properties = {});
                if (!props.name) props.name = props.NAME || props.ADMIN || props.name_en || '';
            }
            echarts.registerMap('world', worldGeoJson);
        } else {
            console.error('加载世界地图失败:', geoResults[1].reason);
        }

        if (!chinaGeoJson && !worldGeoJson) {
            showFatal(container, '地图数据 assets/world.json、assets/china.json 加载失败。');
            return false;
        }

        chart = echarts.init(container);
        renderMap();
        return true;
    }

    function setScope(scope) {
        currentScope = scope === 'china' ? 'china' : 'world';
        renderMap();
    }

    function update(data, dimension, filters = {}) {
        currentData = data;
        currentDimension = dimension || 'composite';
        renderMap(filters);
    }

    function renderMap(filters = {}) {
        if (!chart) return;
        const scope = currentScope;
        const mapName = scope === 'china' ? 'china' : 'world';
        const available = scope === 'china' ? !!chinaGeoJson : !!worldGeoJson;
        if (!available) {
            showFatal(document.getElementById('mapChart'), '当前视图的地图数据缺失。');
            return;
        }

        const mapData = buildMapData(scope, filters);
        const dimensionLabel = DIM_LABELS[currentDimension] || currentDimension;

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(30, 45, 61, 0.95)',
                borderColor: '#2a3a4a',
                textStyle: { color: '#e8edf2', fontSize: 13 },
                formatter(params) {
                    if (!params.data || params.data.value === -1 || params.data.value === undefined) {
                        return `<b>${params.name || ''}</b><br/>暂无数据`;
                    }
                    const d = params.data;
                    const label = d.shortName || d.name || params.name;
                    let html = `<b style="font-size:15px">${label}</b>`;
                    html += `<br/>等级: <span style="color:${GRADE_COLORS[d.grade]};font-weight:700">${d.grade} (${d.gradeLabel || ''})</span>`;
                    html += `<br/>${dimensionLabel}: <b>${(d.value || 0).toFixed(1)}</b>`;
                    if (currentDimension === 'composite') {
                        const n = d.normalized || {};
                        html += '<hr style="border-color:#2a3a4a;margin:6px 0"/>';
                        html += `顶尖大学: ${fmt(n.top_universities)}<br/>`;
                        html += `国际影响力: ${fmt(n.international)}<br/>`;
                        html += `学科实力: ${fmt(n.discipline_strength)}<br/>`;
                        html += `师资力量: ${fmt(n.faculty)}<br/>`;
                        html += `办学规模: ${fmt(n.scale)}<br/>`;
                        html += `科研产出: ${fmt(n.research)}`;
                    }
                    return html;
                },
            },
            visualMap: {
                // 图例改由页面底部的 HTML 渐变条呈现，这里只负责着色
                type: 'continuous', min: 0, max: 100, show: false,
                inRange: { color: COLORS },
                outOfRange: { color: ['#1a2530'] },
            },
            series: [{
                name: '大学水平', type: 'map', map: mapName, roam: true,
                zoom: scope === 'world' ? 1.5 : 1.15,
                center: scope === 'world' ? [10, 25] : [104.5, 36],
                scaleLimit: { min: 1, max: 8 },
                label: {
                    show: true, color: '#c3d0dc',
                    fontSize: scope === 'world' ? 9 : 9,
                    fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
                    // 世界地图只标注有数据的国家，中国地图使用省份简称
                    formatter(params) {
                        const data = params.data || {};
                        if (scope === 'world') return data.displayName || '';
                        return data.shortName || '';
                    },
                },
                emphasis: {
                    label: { show: true, color: '#fff', fontSize: 13, fontWeight: 'bold' },
                    itemStyle: {
                        areaColor: '#4a6fa5', borderColor: '#fff',
                        borderWidth: 2, shadowBlur: 20,
                        shadowColor: 'rgba(59, 130, 246, 0.4)',
                    },
                },
                itemStyle: { areaColor: '#1a2530', borderColor: '#3a4a5a', borderWidth: 1 },
                nameProperty: 'name',
                data: mapData,
            }],
        };

        chart.setOption(option, true);
    }

    function fmt(value) {
        return typeof value === 'number' ? value.toFixed(1) : '-';
    }

    function buildMapData(scope, filters) {
        const mapData = [];
        const geo = scope === 'china' ? chinaGeoJson : worldGeoJson;
        if (!geo || !geo.features) return mapData;

        for (const feature of geo.features) {
            const fullName = feature.properties && feature.properties.name;
            if (!fullName) continue;

            let entry = scope === 'china'
                ? lookupChinaEntry(fullName)
                : lookupWorldEntry(fullName);

            if (!entry) {
                mapData.push({ name: fullName, value: -1 });
                continue;
            }
            mapData.push(makeDataPoint(fullName, entry.data, entry.label, filters));
        }
        return mapData;
    }

    function lookupChinaEntry(fullName) {
        if (!currentData) return null;
        const shortName = PROVINCE_NAME[fullName] || fullName;
        const data = currentData[shortName];
        return data ? { data, label: shortName } : null;
    }

    function lookupWorldEntry(worldName) {
        if (!currentData) return null;
        const code = COUNTRY_NAME_TO_CODE[worldName];
        if (code && currentData[code]) return { data: currentData[code], label: code };
        if (currentData[worldName]) return { data: currentData[worldName], label: worldName };
        return null;
    }

    function makeDataPoint(name, entry, shortLabel, filters) {
        const score = currentDimension === 'composite'
            ? entry.composite
            : (entry.normalized && entry.normalized[currentDimension]) || 0;
        const region = entry.region;
        const grade = entry.grade;
        const passesRegion = !filters.region || region === filters.region;
        const passesGrade = !filters.grade || grade === filters.grade;
        return {
            name: name,
            shortName: shortLabel,
            value: (passesRegion && passesGrade) ? score : -1,
            composite: entry.composite,
            grade: grade,
            gradeLabel: entry.grade_label || '',
            normalized: entry.normalized || {},
            scores: entry.scores || {},
            region: region,
            filtered: !(passesRegion && passesGrade),
            countryCode: shortLabel,
            displayName: entry.name || shortLabel,
        };
    }

    function onClick(handler) {
        clickHandler = handler;
        if (!chart) return;
        chart.off('click');
        chart.on('click', function (params) {
            if (!params.data || !clickHandler) return;
            const d = params.data;
            // value < 0 表示无数据 / 被筛除，不响应
            if (d.value === -1 || d.value === undefined) return;
            const key = currentScope === 'world'
                ? (d.countryCode || d.shortName || '')
                : (d.shortName || '');
            if (key) clickHandler(key);
        });
    }

    function resize() {
        if (chart) chart.resize();
    }

    function isReady() {
        return !!chart;
    }

    return { init, update, onClick, resize, setScope, isReady };
})();
