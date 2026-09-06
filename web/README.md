# 廢校預警 ・ React 版

[`yellowsoar/small_school_renaissance`](https://github.com/yellowsoar/small_school_renaissance) 的前端。把原本的單檔 `docs/index.html`（Leaflet + PapaParse + 全域 script tag）重寫成一個現代 JavaScript 的 React 專案。

上游 fork 自 [`g0v/small_school_renaissance`](https://github.com/g0v/small_school_renaissance)。

## 技術棧

| 項目 | 選擇 |
| --- | --- |
| 建置工具 | Vite 6（ESM、無 bundler 設定負擔） |
| UI | React 19 + react-leaflet 5 |
| 地圖 | Leaflet 1.9 + leaflet.heat |
| 資料 | PapaParse 解析教育部統計處 CSV |
| 測試 | Vitest 3 |
| 語法 | 原生 ES2023 JavaScript（無 TypeScript） |

## 快速開始

```bash
cd web
npm install
cp .env.example .env   # 選用，不設也能跑
npm run dev            # 會自動下載資料集後啟動 http://localhost:5173
```

其他指令：

```bash
npm run fetch:data # 強制重新抓取上游 CSV
npm run build      # 產出 dist/
npm run preview    # 預覽 production build
npm run lint
npm test           # Vitest 單次執行
npm run test:watch # watch 模式
npm run coverage   # 覆蓋率報告
```

需要 Node.js 20.19 以上。

## 測試

`src/lib/` 是純函式層，也是測試的重心：

- `schools.test.js` 涵蓋 `tierFor`、`parseSchools`、`filterSchools`、`summarize`。Fixture 直接組出真的 CSV 字串而不是預先 parse 好的 row，所以連 PapaParse 的設定（`header`、`skipEmptyLines`、`transformHeader`）也一起測到。重點在邊界：分級上界是閉區間、沒有座標的 row 會被丟掉、空欄位變成 `null` 而不是空字串、開啟分級篩選時沒有推估值的學校會被排除。
- `shapes.test.js` 確認每個風險分級都有對應圖形、未知圖形會退回圓形、星形頂點不會超出 viewBox。

測試設定放在 `vitest.config.js`，與 `vite.config.js` 分開：這些是純函式，不需要 React plugin 也不需要 Pages 的 base path。`markerIcons.js` 不列入覆蓋率，它只是把 `shapes.js` 接到 Leaflet，需要 DOM 才跑得起來。

## 資料來源

`scripts/fetch-data.js` 會抓 `113-107.csv`（約 2,600 所國小）到 `public/data/`，因此 CSV 不進版控。

**注意**：`yellowsoar/small_school_renaissance` 目前只有 `main` 分支，也還沒有 `docs/113-107.csv`，所以預設仍指向 fork 來源 `g0v` 的 `gh-pages`。等資料集進到這個 repo 之後改環境變數即可，不用動程式：

```bash
DATA_OWNER=yellowsoar DATA_BRANCH=gh-pages npm run fetch:data -- --force
```

可覆寫的變數：`DATA_OWNER`、`DATA_REPO`、`DATA_BRANCH`、`DATA_PATH`，或直接用 `DATA_SOURCE_URL` 指定完整網址（含本機 file server）。完整說明見 [`.env.example`](.env.example)：

```bash
cp .env.example .env
```

`.env` 不進版控（由 repo 根目錄的 allow list `.gitignore` 擋掉），`.env.example` 才是文件。`scripts/fetch-data.js` 用 Node 內建的 `process.loadEnvFile()` 讀取，Vite 端則由 `loadEnv()` 讀 `BASE_PATH`；兩邊都是「真正的環境變數 > `.env`」。

原始資料由教育部統計處的「國民小學校別基本資料」與「偏遠地區學校名錄」爬取後合併（見 `scripts/*.sh`），推估欄位為 `推估114年人數` … `推估130年人數`。

## 推估值怎麼讀

推估欄位是上游資料集算好的，以 113 與 107 學年度的學生人數變化趨勢外推，**未計入遷徙、新生兒數與學區調整**。它適合拿來排序風險，不適合當成廢校預測。這句話也直接放在畫面的圖例裡（`METHODOLOGY`，定義於 `src/config/index.js`），避免「推估歸零」被誤讀成「這間學校會關」。

沒有 107 學年度對照資料的學校無法推估，popup 會直接說明，而不是顯示 0。

## 相較原版的改動

- **可切換推估年度**：原版寫死 130 學年，這裡改成 114–130 的滑桿，直接看趨勢怎麼滾。
- **篩選器**：縣市、風險分級、校名／鄉鎮搜尋，並即時更新統計列；篩不到東西時可一鍵清除。
- **點位圖示自繪**：以 `L.divIcon` + inline SVG 取代 `leaflet-svg-shape-markers` CDN 相依。圖形幾何集中在 `lib/shapes.js`，地圖與圖例讀同一份，不會再有兩邊對不起來的問題。
- **只畫看得到的點**：依視窗範圍裁切，加上每個分級只建立一次 icon，避免 2,600 個 marker 同時掛在 DOM 上。
- **熱區就地更新**：熱區圖層只建立一次，拉動年度滑桿時用 `setLatLngs()` 換點，不會整層拆掉重建。
- **修正熱區參數**：原版 `blur: 0` + `radius: 80` 會糊成一塊色斑，改為 `radius: 45 / blur: 22`。
- **可近用性**：語意化 `<dl>` / `<fieldset>`、`aria-pressed`、篩選 chip 與滑桿都有 focus ring、`prefers-reduced-motion`。
- **標註推估方法**：畫面上直接寫明數字怎麼來、不含哪些因素。
- **錯誤與空狀態**：Error boundary 接住 render 例外，篩不到學校時也會明講，而不是給一張空白地圖。
- **資料層與畫面分離**：`src/lib/` 是純函式（解析、篩選、統計、圖形幾何），並附上 Vitest 測試。
- **部署**：GitHub Actions 走官方 Pages artifact 流程，push 到 `main` 就發布，不再手動 commit 產出物到 `gh-pages`。
- **資料不進版控**：CSV 由建置流程抓取，repo 只放程式碼。

## 目錄結構

前端全部收在 repo 的 `web/` 底下，根目錄留給原本的 bash / uv 資料處理流程。

```
web/
├── index.html
├── package.json
├── vite.config.js               # base path、build 設定
├── vitest.config.js             # 測試設定
├── eslint.config.js             # 瀏覽器與 Node 兩組環境分開
├── .env.example                 # 環境變數文件
├── scripts/
│   └── fetch-data.js            # 建置前下載 CSV 到 public/data/
└── src/
    ├── App.jsx                  # 版面組裝與狀態
    ├── main.jsx
    ├── config/index.js          # 風險分級、熱區、地圖常數、推估方法說明
    ├── lib/
    │   ├── schools.js           # CSV → 正規化資料、篩選、統計（純函式）
    │   ├── shapes.js            # 圖示幾何，地圖與圖例共用的唯一來源
    │   ├── markerIcons.js       # Leaflet divIcon 產生與快取
    │   └── *.test.js            # Vitest 測試
    ├── hooks/
    │   ├── useSchoolData.js     # 載入 + 解析，支援 AbortController
    │   └── useVisibleSchools.js # 依視窗範圍與縮放層級裁切點位
    ├── components/
    │   ├── SchoolMap.jsx
    │   ├── HeatmapLayer.jsx     # leaflet.heat 的命令式包裝
    │   ├── SchoolMarkers.jsx
    │   ├── SchoolPopup.jsx
    │   ├── TierGlyph.jsx        # 圖例用的 JSX 版圖示
    │   ├── ControlPanel.jsx
    │   ├── SummaryBar.jsx
    │   ├── Legend.jsx
    │   └── ErrorBoundary.jsx
    └── styles/global.css
```

CI 設定放在 repo 根目錄（GitHub 只認根目錄的 workflow）：`ci.yml` 在 push 與 pull request 上跑 lint 與測試，`deploy.yml` 只負責 `main` 的 Pages 發布。
`.gitignore` 也只有根目錄那一份，採 allow list 寫法，已把前端需要的副檔名加進去。

## 部署

Push 到 `main` 且變更落在 `web/` 時，會觸發 `.github/workflows/deploy.yml`，lint 與測試通過後以官方 Pages artifact 發布到
<https://yellowsoar.github.io/small_school_renaissance/>。記得到 repo Settings → Pages 把 Source 設成 **GitHub Actions**。

`BASE_PATH` 預設為 `/small_school_renaissance/`（專案站台路徑）。自訂網域或改 repo 名時覆寫：

```bash
BASE_PATH=/ npm run build
```

資料來源也可以在 repo Settings → Variables 設 `DATA_OWNER` / `DATA_BRANCH`，workflow 會直接吃。

## 授權

程式碼採 MIT，資料著作權歸教育部統計處。
