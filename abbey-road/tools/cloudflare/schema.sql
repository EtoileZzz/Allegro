-- Abbey Road · 云同步（Cloudflare D1）
--
-- 用法：在 Cloudflare 控制台进 D1 数据库 → Console(查询) → 粘贴本文件 → Execute。
-- 全部语句可重复执行（IF NOT EXISTS / INSERT OR IGNORE），不会清掉已有数据。
--
-- 设计要点：
--   · 只存**一个**状态行（id=1），envelope 是客户端加密后的整包密文，
--     Worker 永远看不到明文（课程名/任务/备注都在密文里）。
--   · rev 是单调递增的版本号，PUT 时用 `WHERE rev = ?` 做原子比较交换（CAS），
--     两台设备同时推不会互相覆盖，落后的那台会拿到 409 + 当前版本。
--   · history 保留最近若干版本，用于「回滚到某个版本」。

CREATE TABLE IF NOT EXISTS state (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  rev         INTEGER NOT NULL DEFAULT 0,
  envelope    TEXT,
  updated_at  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO state (id, rev, envelope, updated_at) VALUES (1, 0, NULL, 0);

CREATE TABLE IF NOT EXISTS history (
  rev         INTEGER PRIMARY KEY,
  envelope    TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 可选：按时间清理旧历史（默认保留 20 版，Worker 每次写入后会自己裁一次）
CREATE INDEX IF NOT EXISTS idx_history_rev ON history (rev DESC);
