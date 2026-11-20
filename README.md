---
title: ETF 慢慢存
emoji: 🌱
colorFrom: green
colorTo: yellow
sdk: static
app_file: index.html
pinned: false
license: mit
short_description: 台股 ETF 配息查詢、定期定額與含息情境試算
fullWidth: true
---

# ETF 慢慢存 · Taiwan ETF Planner

繁體中文的台股 ETF 理財規劃工具。原生 HTML、CSS 與 JavaScript，無建置步驟、無 API Key、無付費後端；可部署到 Hugging Face Static Space。

## 功能

- **投資試算**：首次投入、每月底定期定額、1–50 年年期、每年增額投入。
- **三種股息走法**：再投入、領現金與不含息；並排曲線、年度明細與 CSV 匯出。
- **假設與成本**：價格年成長率、年配息率、通膨、買賣手續費、自訂有效股息稅率與期末賣出費稅。
- **ETF 探索**：官方 ETF 名稱、追蹤指數、上市日期、最近收盤價、近一年已發放配息紀錄。
- **收藏與比較**：本機收藏、最多比較三檔，檢視詳細配息紀錄。
- **現金流目標**：反推所需持有部位、第一年每月投入與跌幅壓力測試。
- **本機儲存**：計畫、收藏與比較清單保存在瀏覽器，不上傳個人投資金額。

## 本機使用

需 Node.js 22 以上，不需 npm install。

```powershell
npm.cmd run dev
```

瀏覽 <http://127.0.0.1:4173>。不要用 file:// 直接開啟，瀏覽器會限制模組與 JSON 讀取。

```powershell
npm.cmd test
npm.cmd run update-data
```

更新腳本需網路權限。先擷取並驗證官方資料，再覆寫 `data/etfs.json`；資料來源失敗時保留舊快照。更新後須提交並推送才會更新線上資料。本版不宣稱自動每日更新或即時行情。

## 資料口徑

- **涵蓋範圍**：證交所上市，基金類型為「國內成分證券指數股票型基金」或「國內成分證券主動式交易所交易基金(股票)」，且不包含國外成分股。不是全臺上市櫃 ETF，不含上櫃、債券、槓桿及反向 ETF。
- **行情**：最近官方收盤價，不是即時報價；每檔保留自己的行情日期，整體快照亦保留市場日期與擷取時間。
- **配息率**：以市場基準日前 12 個月內、已實際發放的每單位配息加總，除以基準收盤價。未來公告排除；上市未滿一年不年化，不把沒有資料直接判定成不配息。
- **單位分割**：校正明確列出的已知事件（0050 於 2025-06-18 一拆四、0052 於 2025-11-26 一拆七），按除息日判斷舊單位配息。未找到完整官方歷史分割 API，不保證所有企業行動均已納入；配息率不可單獨用來排名購買，也不會自動填入未來假設。
- **費用與報酬**：未取得可靠的歷史調整後總報酬、完整費用率、成分股及折溢價，顯示未提供，不編造數值。

官方來源：

1. [ETF 基本資料](https://openapi.twse.com.tw/v1/opendata/t187ap47_L)
2. [最新收盤行情](https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL)
3. [ETF 配息紀錄](https://www.twse.com.tw/rwd/zh/ETF/etfDiv?response=json)
4. [ETF e添富](https://www.twse.com.tw/zh/ETFortune/index)

## 試算公式

本工具是未來情境試算，不是歷史回測。預設的價格成長 4%、配息 3%、通膨 2% 都是假設，不是特定 ETF 的預測。

1. 股價月成長因子 = `(1 + 股價年成長率)^(1/12)`；價格報酬已不含配息。
2. 月配息 = 當月成長後、投入新本金前的 ETF 市值 × 年配息率 / 12，扣除自訂有效股息稅率。
3. 再投入：稅後股息按買進手續費折成 ETF 市值；領現金：另累積成不生息現金；不含息：忽略配息。
4. 每月底新增投入；每滿一個投資年度依增額比例調整月投入。
5. 合計資產 = ETF 市值 + 累計領現股息；勾選期末賣出時，ETF 市值先扣自訂賣出費率與交易稅率。
6. 現值 = 合計資產 / `(1 + 年通膨率)^年數`。

以可分割單位計算，未模擬整數股數、實際配息日、撮合滑價、最低費用、個人稅法與補充保費。內扣費用視為反映在股價假設，不重複扣除。完整說明亦在網站「投資前，先懂一點」。

## 部署到 Hugging Face

1. 用自己的帳號建立 `Taiwan-ETF-Planner` Space，SDK 選 **Static**。
2. 將本專案 Git 儲存庫的 origin 指向新 Space（不能指向 Photo-Enhancer）。
3. 使用具有新 Space 寫入權限的 Hugging Face Token 在本機終端機登入，然後提交並推送 main。

靜態 Space 直接讀取 `index.html`，不需 Docker、GPU 或伺服器 API。請勿將 Token 放進原始碼。既有只授權 Photo-Enhancer 的細分 Token 不一定能寫入這個新 Space。

## 雙向自動同步

GitHub main 更新後觸發同步；另外約每五分鐘檢查 Hugging Face main。
只有可 fast-forward 的變更才會自動傳到另一邊；兩邊分岔時保留歷史，停止並建立 GitHub 衝突通知。
詳見 [自動同步設定與衝突處理](docs/AUTO_SYNC.md)。需要在 GitHub Actions 設定 `HF_TOKEN` 加密密鑰。

## 檔案

- `src/math.mjs`：純財務計算，可獨立測試。
- `src/app.js`：互動、資料呈現、收藏、比較與儲存。
- `src/chart.js`：原生 SVG 資產曲線。
- `scripts/update-data.mjs`：官方資料快照更新。
- `scripts/serve.mjs`：僅綁定本機的預覽伺服器。
- `tests/`：財務公式與資料完整性檢查。

這是情境理解工具，不提供個人化投資建議，也不保證未來報酬。
