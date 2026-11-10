# 全球大学水平 PK · 可视化

把中国 31 个省级行政区与全球 17 个国家的高等教育水平放在同一套六维指标下比较：
世界地图 / 中国地图点选、维度切换、地区与等级筛选、国家下钻、单省/单国详情与雷达图对比。

> 在线访问：<https://yellow0311.github.io/university_pk/>
> 本仓库是**构建好的纯静态站点**（无后端），由 `scripts/build_static.py` 生成。


---

## 功能

- **两套视图**：世界（17 国）与中国（31 省）地图，色阶 0–100，无数据地区灰显
- **六个维度**：综合评分、顶尖大学、国际影响力、学科实力、师资力量、办学规模、科研产出
- **筛选联动**：地区（大洲 / 大区）与等级（S/A/B/C/D）同时作用于地图与排行榜
- **国家下钻**：点击美国、英国、德国、日本、澳大利亚、加拿大、法国，查看各州 / 大区排名
- **详情面板**：综合得分、六维归一化分值、雷达图（叠加当前视图平均值）、TOP 10 大学
- **完全离线**：ECharts、世界地图、中国地图全部随仓库托管，不依赖任何 CDN

---

## 评分口径

综合得分 = 六维原始分先做 Min-Max 归一化，再按权重加权求和：

| 维度 | 权重 |
| --- | --- |
| 顶尖大学 `top_universities` | 25% |
| 学科实力 `discipline_strength` | 25% |
| 师资力量 `faculty` | 20% |
| 办学规模 `scale` | 15% |
| 科研产出 `research` | 10% |
| 国际影响力 `international` | 5% |

等级：`≥80 S 卓越`、`≥65 A 优秀`、`≥50 B 良好`、`≥35 C 一般`、`<35 D 较弱`。

**大学计数口径**：同一所大学在**同一省份内**的校区 / 分院不重复计数（如山东大学(威海)并入山东大学）；
**跨省校区**单独计数（如哈尔滨工业大学(威海)、中国人民大学(苏州校区)）。

> 归一化是相对口径：中国视图是 31 省之间比较，世界视图是 17 国之间比较，两边分数不能直接对比。

---

## 目录结构

```
.
├── index.html            # 单页入口（data-mode="static"，读 data/*.json）
├── css/style.css
├── js/
│   ├── api.js            # 数据访问层（静态模式下读 data/）
│   ├── app.js            # 主控制器：视图、筛选、下钻
│   ├── map.js            # ECharts 地图渲染
│   └── panel.js          # 排行榜、详情、雷达图、大学清单
├── vendor/echarts.min.js # ECharts 5.5.0
├── assets/               # 世界 / 中国 GeoJSON、favicon
└── data/                 # 预生成数据，等价于原后端 /api/*
    ├── provinces.json  countries.json  metadata.json  universities.json
    └── regions/{US,UK,DE,JP,AU,CA,FR}.json
```

---

## 如何更新数据

本仓库只存放构建产物，**不要直接改 `data/` 里的 JSON**（下次构建会被覆盖）。正确流程：

1. 在源码仓库修改 `backend/data/*.json`（或调整 `backend/calculator.py` 的权重）；
2. 运行 `python scripts/build_static.py`；
3. 把新的 `dist/` 内容覆盖到本仓库根目录并提交。

源码仓库若配置了 GitHub Actions，则推送后会自动重建并发布，无需手动上传。

---

## 技术说明

- 纯 HTML / CSS / 原生 JavaScript，无框架、无打包器，打开即用
- 地图基于 ECharts 5.5.0（`map` series），GeoJSON 来自 DataV 与公开世界地图数据
- 所有资源使用相对路径，因此可以部署在 `https://<用户>.github.io/<仓库名>/` 这类子路径下
- 完全静态：不需要数据库、不需要 API、不发起任何外部网络请求

### 本地预览

浏览器在 `file://` 协议下会拦截 JSON 读取，请用任意静态服务器打开：

```bash
python -m http.server 8000     # 然后访问 http://127.0.0.1:8000
# 或
npx serve .
```

---

## 数据与声明

- 原始分值来自公开资料（QS 排名、教育部学科评估、学校公开信息等）手工整理，**属于个人研究性口径，不是任何官方排名**；
- 大学名单与分值会随年份变化，仅供参考与学习交流，不构成报考建议；
- 地图边界仅用于数据可视化，不代表任何政治立场；
- 如引用或二次分发，请注明出处。

---

- ECharts：<https://echarts.apache.org/>
- 中国地图数据：<https://datav.aliyun.com/portal/school/atlas/area_selector>
