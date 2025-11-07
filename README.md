# tgADBot

tgADBot 是一個專門幫助 Telegram 群組清理廣告訊息的審核機器人。它使用雲端 LLM 為每一則訊息打分並記錄結果，對高風險貼文自動刪除並回覆提示，同時保留長期成員與管理員的發言。

## 功能速覽
- **LLM 廣告評分**：透過 SiliconFlow Chat Completions 介面與自訂中文提示詞，在 0–10 間給訊息廣告分數。
- **可信度分層**：自動略過群組管理員與加入超過一個月的成員；針對新成員（兩天內）採取更嚴格的刪除門檻。
- **狀態持久化**：使用 `lowdb` 將訊息評分、成員加入時間與機器人提示訊息記錄在 `data/db.json` 中，重啟後不會遺失歷史資料。
- **衝突避免**：刪文後只保留一則最新的提示訊息，並在啟動時清理殘留通知。
- **回補更新**：啟動時會先呼叫 `getUpdates` 處理 backlog，降低停機期間漏判的風險。

## 專案架構
- `bot.js`：唯一的進入點，負責載入環境變數、初始化資料庫、啟動 `node-telegram-bot-api` 長輪詢、處理訊息與錯誤。
- `config/.env.example`：示範設定檔，請複製成 `.env.local` 並填入實際金鑰。
- `data/`：`lowdb` JSON 儲存，預設放在 `data/db.json`，建議排除在版本控制之外。

## 需求
- Node.js 20 或以上。
- npm 10（隨 Node.js 安裝提供）。
- 可連線至 SiliconFlow（或相容 OpenAI API 的 LLM）以取得廣告評分。

## 快速開始
1. 安裝依賴
   ```bash
   npm install
   ```
2. 準備環境變數  
   - 複製 `config/.env.example` 為 `.env.local`。  
   - 依照下方 [環境設定](#環境設定) 填入 BotFather token 與 LLM 相關資訊。  
   - 可直接貼上以下指令快速建立 `.env.local` 並替換為實際值：
     ```bash
     cat <<'EOF' > .env.local
     TELEGRAM_BOT_TOKEN=replace-with-telegram-bot-token
     LLM_API_URL=https://api.siliconflow.cn/v1
     LLM_API_KEY=replace-with-siliconflow-api-key
     LLM_MODEL=Qwen/Qwen3-8B
     DATABASE_PATH=./data/db.json
     EOF
     ```
3. 啟動機器人
   ```bash
   npm run dev
   ```
   預設會在本機以長輪詢模式啟動，成功登入後會持續監聽群組訊息。

## 環境設定
所有設定會優先讀取 `.env.local`，再退回系統環境變數：

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | ✅ | BotFather 提供的機器人金鑰。 |
| `LLM_API_KEY` | ✅ | SiliconFlow（或相容供應商）的 API Key。 |
| `LLM_API_URL` | ⛔️ | LLM 服務端點，預設 `https://api.siliconflow.cn/v1`。 |
| `LLM_MODEL` | ⛔️ | 使用的模型名稱，預設 `Qwen/Qwen3-8B`。 |
| `DATABASE_PATH` | ⛔️ | `lowdb` JSON 路徑，預設 `./data/db.json`。 |

> 提醒：`.env.local` 已加入 `.gitignore`，請勿把密鑰提交到版本庫。

## 指令
- `npm run dev`：以 `tsx watch` 啟動 `bot.js`，適合本地開發。
- `npm start`：使用 Node.js 直接執行 `bot.js`，適合部署環境。
- `npm test`：執行 Vitest 測試（若新增測試檔請 mirror 對應路徑）。
- `npm run lint`：以 ESLint 檢查程式碼。
- `npm run format`：使用 Prettier 套用格式。
- `npm audit`：檢查依賴套件的安全性（建議定期執行）。

## 運作細節
1. **訊息分類流程**  
   - 監聽群組訊息，抽取文字或圖片 caption。  
   - 跳過私人對話及無內容訊息。  
   - 若發送者是管理員或在群內超過一個月，直接跳過。  
   - 新成員的刪除門檻為 6 分，其餘成員為 8 分。  
   - 超過門檻的訊息會被刪除並留下提示訊息。  

2. **資料儲存**  
   - `messages`：每則訊息的評論結果、分數、是否刪除與時間戳。  
   - `members`：各群組成員首次加入時間，用於判斷是否為新成員或老成員。  
   - `botMessages`：目前顯示中的提示訊息 ID，方便在發送新提示前清除舊訊息。  

3. **錯誤與重啟**  
   - 啟動時會 ping 一次 LLM 以確保金鑰有效。  
   - 任何分類錯誤都會被記錄並回覆「暫時無法判斷」訊息，以利管理員追蹤。  
   - 接收到 `SIGINT` / `SIGTERM` 時會停止 polling 並正常結束。  

## 部署建議
- 若部署在雲端或容器，可使用 `npm start` 並以 `systemd`、PM2 或容器 init 監控程序。  
- 依需要將 `data/db.json` 挂載到持久磁碟，或設定 `DATABASE_PATH` 指向掛載位置。  
- 若要改為 webhook 模式，可在 `bot.js` 內調整 `node-telegram-bot-api` 初始化選項並設定 HTTPS 端點。  
- 可以在 `SYSTEM_PROMPT` 或 `USER_PROMPT_TEMPLATE` 中調整語氣與規則，以符合不同社群的敏感度。  

## 品質與維運
- 在提交 PR 前請至少執行 `npm run lint`、`npm run format` 以及相關測試。  
- 建議紀錄 `data/db.json` 的備份，以利稽核或模型校正。  
- 每月執行 `npm audit` 並更新依賴，避免使用過期套件。  
- 若需新增功能，請遵循 Conventional Commits（`feat:`、`fix:`...）並於 PR 中說明測試證據與潛在風險。
