/**
 * 数据访问层。
 *
 * 同一套前端支持两种运行方式：
 *   - server：连 FastAPI（`python -m uvicorn backend.main:app`），走 /api/*；
 *   - static：读预生成的静态 JSON（GitHub Pages 等纯静态托管），走 data/*.json。
 *
 * 由 <html data-mode="server|static"> 决定，构建脚本会把 index.html 改成 static。
 */
const Api = (() => {
    const MODE = (document.documentElement.dataset.mode || 'server').toLowerCase() === 'static'
        ? 'static'
        : 'server';
    const isStatic = MODE === 'static';
    const DATA_BASE = new URL('data/', document.baseURI).href;

    // 静态模式下只加载一次
    const cache = new Map();

    async function fetchJson(url) {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(`${url} -> HTTP ${resp.status}`);
        return resp.json();
    }

    function staticJson(name) {
        if (!cache.has(name)) {
            cache.set(name, fetchJson(DATA_BASE + name).catch(err => {
                cache.delete(name);
                throw err;
            }));
        }
        return cache.get(name);
    }

    function buildQuery(params) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params || {})) {
            if (value !== undefined && value !== null && value !== '') {
                query.set(key, String(value));
            }
        }
        const str = query.toString();
        return str ? `?${str}` : '';
    }

    async function getMetadata() {
        if (isStatic) return staticJson('metadata.json');
        return fetchJson('/api/metadata');
    }

    async function getProvinces() {
        if (isStatic) return staticJson('provinces.json');
        return fetchJson('/api/provinces');
    }

    async function getCountries() {
        if (isStatic) return staticJson('countries.json');
        return fetchJson('/api/countries');
    }

    async function getRegions(code) {
        if (!isStatic) return fetchJson(`/api/regions/${encodeURIComponent(code)}`);
        const key = String(code).toUpperCase();
        try {
            const meta = await getMetadata();
            const available = meta && meta.regions_available;
            // 只有 7 个国家有地区明细，其余直接返回空，避免 404
            if (Array.isArray(available) && !available.includes(key)) return {};
        } catch (_) { /* 拿不到元信息就按文件读取 */ }
        try {
            return await staticJson(`regions/${key}.json`);
        } catch (_) {
            return {};
        }
    }

    async function countryCodeByName(name) {
        if (!name) return null;
        try {
            const countries = await getCountries();
            for (const [code, info] of Object.entries(countries)) {
                if (info && info.name === name) return code;
            }
        } catch (_) { /* 忽略，按名称匹配即可 */ }
        return null;
    }

    /**
     * @param {{province?:string, country?:string, region?:string, limit?:number, includeBranches?:boolean}} options
     */
    async function getUniversities(options = {}) {
        const { province, country, region, limit, includeBranches } = options;

        if (!isStatic) {
            const query = buildQuery({
                province,
                country,
                region,
                limit,
                include_branches: includeBranches ? 'true' : undefined,
            });
            return fetchJson(`/api/universities${query}`);
        }

        const all = await staticJson('universities.json');
        let rows = includeBranches
            ? all
            : all.filter(u => !u.campus_of && !u.alias_of);

        if (province) rows = rows.filter(u => u.province === province);
        if (country) rows = rows.filter(u => u.country === String(country).toUpperCase());
        if (region) {
            const code = await countryCodeByName(region);
            rows = rows.filter(u => u.region === region || (code && u.country === code));
        }
        if (limit) rows = rows.slice(0, limit);
        return rows;
    }

    return { mode: MODE, isStatic, getMetadata, getProvinces, getCountries, getRegions, getUniversities };
})();
