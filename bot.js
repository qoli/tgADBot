import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { JSONFilePreset } from 'lowdb/node';
import { config as loadEnv } from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';

function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const logger = console[level] ?? console.log;
  logger(`[${timestamp}]`, ...args);
}

const LOCAL_ENV_FILE = '.env.local';
if (existsSync(LOCAL_ENV_FILE)) {
  loadEnv({ path: LOCAL_ENV_FILE });
}
loadEnv();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.siliconflow.cn/v1';
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'Qwen/Qwen3-8B';
const DATABASE_PATH = resolve(
  process.cwd(),
  process.env.DATABASE_PATH || './data/db.json',
);
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

if (!TELEGRAM_BOT_TOKEN) {
  log('error', 'Missing TELEGRAM_BOT_TOKEN in environment.');
  process.exit(1);
}

if (!LLM_API_KEY) {
  log('error', 'Missing LLM_API_KEY in environment.');
  process.exit(1);
}

const SYSTEM_PROMPT =
  '你是一個專門判斷文字廣告的廣告識別專家。禁止輸出或描述任何思考、推理、分析或中間過程，只需給出最終判斷分數。';

const USER_PROMPT_TEMPLATE = `
角色：你是 Telegram 文本廣告識別器。
任務：對輸入文本是否為推廣/廣告進行打分，輸出 0–10 的整數信心指數（10=幾乎確定是廣告，0=幾乎確定不是）。
只輸出數字，不得輸出任何其他文字或符號。

定義（正類）：「以推廣商品/服務/群組為目的」且至少包含以下強指標之一：
	•	聯絡/跳轉：@用戶名、VX/微信/WeChat/qq/q/企鹅、tg.me / t.me / http(s)://、「私聊/加我/進群/客服/報名」。
	•	交易資訊：明確價格/套餐/折扣（如「398 一箱」「799 暢飲」「日結」）、收/出/代/承兌/走量/引流/刷粉/上號/解封/代充。
	•	行業場景：KTV/酒局/成人服務、灰/黑產（如「USDT 承兌」「車隊」「專群」「漏洞資源」「色/菠菜」等）。

常見高風險模式（若出現，通常 ≥7）：
	•	海外社交賬號批發、自助下單、代註冊/批量開號、出售 Session/JSON 憑證。
	•	防封/防紅工具或服務（如「谷歌防紅」「蘋果/微軟全系支持」）搭配聯絡方式或宣傳口號。
	•	純宣傳語 + @聯絡方式（例：「🌍海外社交賬號 · 批發銷售 · 自助下單 @gn_KC」）視為推廣。

非廣告（負類）示例：中立討論、抱怨/吐槽、轉述他人觀點、技術提示、無推銷動機的資訊分享、玩笑或口頭禪。

打分規則（降誤殺）：
	•	9–10：同時出現「明確推銷/招攬」+「聯絡方式或鏈接」或「明確價格/套餐」，且語氣是招徠/號召行為。
	•	7–8：有明顯推廣意圖（如 KTV 套餐、承兌、專群合作等），但聯絡/價格缺一；或灰產術語很強烈。
	•	4–6：語義可疑但缺乏決定性信號（只有品牌名/性能描述/個人感受，未出現聯絡/價格/招攬）。傾向保守取低值以減少誤殺。
	•	0–3：明顯非廣告：資訊分享、個人評價、玩笑話、抱怨、無招攬/無聯絡/無價格。

判斷原則（先決條件）：
	•	若沒有「聯絡方式/鏈接/價格/招攬動詞」四類信號中的任一，通常 ≤3。
	•	要 ≥7，需滿足：
	•	至少兩項中等信號（如行業場景 + 招攬動詞 / 價格）；或
	•	一項特強信號（如「@聯絡 + 價格/套餐」「代×× + 私聊/加」）。

輸出格式：只輸出一個 0–10 的整數，不加空格、不加標點、不加文字。
禁止輸出任何思考、推理、分析或理由。

現在評分以下文本：
{{content}}
`.trim();

async function bootstrapDatabase(path) {
  log('info', `Bootstrapping database at ${path}`);
  await mkdir(dirname(path), { recursive: true });
  const db = await JSONFilePreset(path, { messages: [], members: {} });

  if (!Array.isArray(db.data.messages)) {
    db.data.messages = [];
  }

  if (!db.data.members || typeof db.data.members !== 'object') {
    db.data.members = {};
  }

  log('info', 'Database ready');
  return db;
}

function buildUserPrompt(messageText) {
  return USER_PROMPT_TEMPLATE.replace('{{content}}', messageText);
}

async function classifyMessage({ text, apiUrl, apiKey, model }) {
  log(
    'info',
    `Classifying message with model ${model} via ${apiUrl}...`,
  );

  const payload = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(text) },
    ],
    temperature: 0,
    max_tokens: 16,
  };

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM request failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = await response.json();
  const rawAnswer = data?.choices?.[0]?.message?.content?.trim() ?? '';
  const match = rawAnswer.match(/\d+/);
  const score = match ? Number.parseInt(match[0], 10) : 0;

  return {
    score: Number.isNaN(score) ? 0 : Math.min(10, Math.max(0, score)),
    rawAnswer,
  };
}

async function persistClassification(db, record) {
  const existingIndex = db.data.messages.findIndex(
    (entry) =>
      entry.chatId === record.chatId && entry.messageId === record.messageId,
  );

  if (existingIndex >= 0) {
    db.data.messages[existingIndex] = record;
  } else {
    db.data.messages.push(record);
  }

  console.log(
    `Persisting classification: chat=${record.chatId}, message=${record.messageId}, score=${record.score}`,
  );
  await db.write();
}

function getMemberRecord(db, chatId, userId) {
  const chatKey = String(chatId);
  const userKey = String(userId);
  return db.data.members?.[chatKey]?.[userKey] ?? null;
}

async function recordMemberJoin(db, chatId, user, joinedAt) {
  if (!user?.id) {
    return;
  }

  if (!db.data.members || typeof db.data.members !== 'object') {
    db.data.members = {};
  }

  const chatKey = String(chatId);
  const userKey = String(user.id);

  if (!db.data.members[chatKey] || typeof db.data.members[chatKey] !== 'object') {
    db.data.members[chatKey] = {};
  }

  const previousRecord = db.data.members[chatKey][userKey];
  const nextJoinedAt = joinedAt.toISOString();

  if (previousRecord?.joinedAt === nextJoinedAt) {
    return;
  }

  db.data.members[chatKey][userKey] = {
    joinedAt: nextJoinedAt,
  };

  log(
    'info',
    `Recorded join time for user ${user.id} in chat ${chatId} at ${nextJoinedAt}`,
  );

  await db.write();
}

function hasBeenMemberLongerThanOneMonth(db, chatId, userId, referenceMs) {
  const record = getMemberRecord(db, chatId, userId);
  if (!record?.joinedAt) {
    return false;
  }

  const joinedMs = Date.parse(record.joinedAt);
  if (Number.isNaN(joinedMs)) {
    return false;
  }

  const elapsed = referenceMs - joinedMs;
  return elapsed >= ONE_MONTH_MS;
}

function extractMessageText(message) {
  return (message.text || message.caption || '').trim();
}

async function isChatAdmin(bot, chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return Boolean(member) && ['administrator', 'creator'].includes(member.status);
  } catch (error) {
    log(
      'warn',
      `Unable to verify admin status for user ${userId} in chat ${chatId}:`,
      error,
    );
    return false;
  }
}

async function handleIncomingMessage(bot, db, message, { silent } = {}) {
  const chat = message.chat;
  if (!chat) {
    return;
  }

  const messageTimestampMs =
    typeof message.date === 'number' ? message.date * 1000 : Date.now();

  if (Array.isArray(message.new_chat_members) && message.new_chat_members.length) {
    for (const newMember of message.new_chat_members) {
      try {
        await recordMemberJoin(db, chat.id, newMember, new Date(messageTimestampMs));
      } catch (error) {
        log(
          'error',
          `Failed to record join time for user ${newMember?.id ?? 'unknown'} in chat ${
            chat.id
          }:`,
          error,
        );
      }
    }
  }

  const text = extractMessageText(message);

  if (!text) {
    return;
  }

  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    return;
  }

  console.log(
    'info',
    `Received message ${message.message_id} in chat ${chat.id} (${chat.title ?? 'untitled'}): "${text}"`,
  );

  try {
    const senderId = message.from?.id ?? null;
    let senderIsAdmin = false;

    if (senderId !== null) {
      senderIsAdmin = await isChatAdmin(bot, chat.id, senderId);
      if (senderIsAdmin) {
        log(
          'info',
          `Skipping classification for admin message ${message.message_id} from ${senderId} in chat ${chat.id}.`,
        );
        return;
      }

      if (hasBeenMemberLongerThanOneMonth(db, chat.id, senderId, messageTimestampMs)) {
        log(
          'info',
          `Skipping classification for message ${message.message_id} from longstanding member ${senderId} in chat ${chat.id}.`,
        );
        return;
      }
    }

    const classification = await classifyMessage({
      text,
      apiUrl: LLM_API_URL,
      apiKey: LLM_API_KEY,
      model: LLM_MODEL,
    });

      log(
        'info',
        `Classification result for message ${message.message_id}: score=${classification.score}, raw="${classification.rawAnswer}"`,
      );

    const record = {
      chatId: chat.id,
      chatTitle: chat.title ?? null,
      messageId: message.message_id,
      userId: message.from?.id ?? null,
      username: message.from?.username ?? null,
      text,
      score: classification.score,
      raw: classification.rawAnswer,
      evaluatedAt: new Date().toISOString(),
      deleted: false,
    };

    let wasDeleted = false;
    let deletionSkippedReason = null;

    if (classification.score > 8) {
      if (record.userId !== null && senderIsAdmin) {
        deletionSkippedReason = 'chat_admin';
        log(
          'info',
          `Skipping deletion for message ${message.message_id}; sender ${record.userId} is administrator.`,
        );
      } else {
        log(
          'info',
          `Score ${classification.score} exceeds threshold. Attempting to delete message ${message.message_id} in chat ${chat.id}.`,
        );
        try {
          await bot.deleteMessage(chat.id, message.message_id);
          wasDeleted = true;
          record.deleted = true;
          record.deletedAt = new Date().toISOString();
          log(
            'info',
            `Message ${message.message_id} in chat ${chat.id} deleted due to high ad score.`,
          );
        } catch (deleteError) {
          log('error', 'Failed to delete high-score message:', deleteError);
        }
      }
    }

    if (deletionSkippedReason) {
      record.deletionSkipped = deletionSkippedReason;
    }

    await persistClassification(db, record);

    if (!silent && wasDeleted) {
      const notifyText = `疑似廣告訊息已刪除（評分 ${classification.score} / 10）。`;
      await bot.sendMessage(chat.id, notifyText, {
        disable_notification: true,
      });
    }
  } catch (error) {
    log('error', 'Failed to classify message:', error);
    if (!silent) {
      await bot.sendMessage(
        chat.id,
        '暫時無法判斷此訊息是否為廣告，請稍後再試。',
        {
          reply_to_message_id: message.message_id,
          disable_notification: true,
        },
      );
    }
  }
}

async function processBacklog(bot, db) {
  try {
    const updates = await bot.getUpdates({
      limit: 20,
      timeout: 0,
      allowed_updates: ['message'],
    });

    log('info', `Fetched ${updates.length} backlog updates.`);

    if (!updates.length) {
      return;
    }

    let lastUpdateId;

    for (const update of updates) {
      lastUpdateId = update.update_id;

      if (update.message) {
        await handleIncomingMessage(bot, db, update.message, { silent: true });
      }
    }

    if (typeof lastUpdateId === 'number') {
      await bot.getUpdates({
        offset: lastUpdateId + 1,
        limit: 1,
        timeout: 0,
      });
    }
  } catch (error) {
    log('error', 'Failed to process backlog updates:', error);
  }
}

async function main() {
  const db = await bootstrapDatabase(DATABASE_PATH);
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

  await processBacklog(bot, db);
  await bot.startPolling();

  log('info', 'ronnietgADBot is listening for group messages...');

  bot.on('message', (message) =>
    handleIncomingMessage(bot, db, message, { silent: false }),
  );

  bot.on('polling_error', (error) => {
    log('error', 'Polling error:', error);
  });

  const shutdown = async (signal) => {
    log('info', `Received ${signal}. Stopping bot...`);
    await bot.stopPolling();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error) => {
  log('error', 'Bot failed to start:', error);
  process.exit(1);
});
