# GitHub 與 Hugging Face 雙向自動同步

設定日期：2026-11-20（台北時間）。GitHub Actions 已配置本專案的加密授權。

同步對象：

- GitHub：`johnnylee830/LEEsufegyw3w8` 的 `main`
- Hugging Face Space：`LEEsufegyw3w8/Taiwan-ETF-Planner` 的 `main`

## 觸發與規則

- GitHub 的 main 有新提交時，立即觸發 GitHub Actions。
- 排程約每五分鐘檢查一次 Hugging Face。GitHub 排程可能延遲，不是即時服務；亦可從 Actions 手動執行。
- 兩邊版本相同：不做變更。
- 只有其中一邊新增提交，而且另一邊的歷史是它的祖先：以 fast-forward 同步到落後的一邊，保留所有提交。
- 兩邊各自新增提交而分岔：停止同步，保留雙方歷史，建立 GitHub Issue 並通知 @johnnylee830。既有的同一衝突通知不會重複建立。
- 不會自動強制推送、不會刪除分支、不會猜測哪一邊的修改應被丟棄。
- 同步前會執行財務、資料及同步歷史測試。測試失敗時不更新另一個遠端。

## 一次性設定

在 GitHub 儲存庫的 Settings → Secrets and variables → Actions 建立 `HF_TOKEN`。
它需要上述 ETF Space 的讀寫權限，不需其他 Hugging Face 專案權限。Token 不應放進程式碼。

本機已備有專用的安全輸入工作 `SYNC: Configure HF_TOKEN for GitHub Actions`。
它會驗證帳號及 Space，透過 GitHub CLI 的 stdin 將 Token 存成加密 repository secret，不寫入本機檔案。

workflow 使用 GitHub 自動提供的 `GITHUB_TOKEN` 更新此 GitHub repo 與建立衝突 Issue，不需要另存 GitHub PAT。
工作流權限限定為 repository contents write 與 issues write。

## 平常使用

1. 在 VS Code 編輯並提交，再推送到 GitHub main；或在 Hugging Face Files 頁面修改應用程式。
2. 查看 GitHub 的 **Actions → Sync GitHub and Hugging Face**。
3. 成功時，摘要會列出方向及兩邊共用的提交 SHA。

同步設定檔請在 GitHub 維護。若 Hugging Face 移除或單獨修改工作流，會當作需要人工處理的衝突，避免自動同步被意外停用。

GitHub 使用 GITHUB_TOKEN 推回 main 的提交不會再次觸發 push 工作流，避免形成循環；排程仍會繼續檢查。
若 repository 被歸檔、停用 Actions 或自動排程停用，需先在 GitHub 恢復相應功能。

## 發生衝突時

本機 `git fetch origin` 與 `git fetch github`，檢視 `origin/main`（Hugging Face）及 `github/main`。
保留兩邊變更並人工合併，檢查後將**同一個合併提交**推送到兩個 main。
最後重新執行工作流確認一致，再關閉自動建立的衝突 Issue。

不要使用 force push 來消除提示；那會捨棄另一邊的版本歷史。

## 範圍

同步的是程式碼及已提交的 ETF 資料快照，不會自動重抓證交所行情，也不會上傳瀏覽器內儲存的個人投資計畫。
不會改變 Space 或 GitHub 儲存庫的私人／公開設定。

## 官方參考

- [GitHub Actions 排程與事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Hugging Face 與 GitHub Actions](https://huggingface.co/docs/hub/spaces-github-actions)
