# AGENTS.md — 这个仓库给后续 agent 的硬规矩

代码在 `abbey-road/`。交付物（APK / EXE / src.zip）从 `abbey-road/dist/` 出，签名密钥在
`_build/allegro.keystore`（口令只在 `abbey-road/android/build.local.ps1`，**永远不要**让它进任何压缩包）。

## 交差前必须做的事

```
cd abbey-road
node tools/verify-compat-static.js      # 主回归（当前 221 条）
node tools/verify-sync.js               # 配置同步
node tools/verify-whisper-sync.js       # 日记云同步（真 Worker + 真 schema + 真客户端）
node tools/verify-whisper-e2e.js        # 真浏览器点一遍，截图写到 shots-whisper-e2e/
node tools/verify-mutations.js --e2e    # 把修过的错放回去，确认上面的检查会红
```

有一条不通过就别交差。

## 规则表

| 规则 | 由什么拦住 |
|---|---|
| 交差前跑通全部测试 | 上面 5 条命令；任何一条非 0 就重做 |
| 改了用户看得见的流程，附真浏览器截图 | `verify-whisper-e2e.js` → `shots-whisper-e2e/*.png`（控制台 error 直接判失败） |
| 修过的 bug 必须能被「放回去」打红 | `verify-mutations.js`（红不了的检查一律删掉重写） |
| 新表/新命名空间必须有 rev 0 种子行 | `schema.sql` 里 `INSERT OR IGNORE` + `verify-whisper-sync.js` R3/R19 |
| 浏览器端拼请求头，别自己拼对象 | `apiCall(method, path, body, ifMatch)` 第 4 个参数只传数字版本号；`verify-whisper-sync.js` R2 |
| 覆盖层（fixed overlay）自己吃返回键 | `AR.Whisper.handleBack()` + `boot.js` 里最先判断；`verify-whisper-e2e.js` 的两条返回用例 |
| 删重复函数前先确认没把隔壁函数一起删掉 | `verify-whisper-e2e.js` 第一步就查 `__whisper` 是否存在 |
| src.zip 只从 `make-src-zip.js` 的暂存目录压 | 该脚本会挡私人路径；不要直接压工作目录（曾经把 `build.local.ps1` 压进过公开 release） |

## 后台知识点（踩过的坑）

- 云端 D1 的 `blob_state` / `state` 靠 `UPDATE ... WHERE rev = ?` 做 CAS；表里没有那一行时永远 0 行受影响 → 客户端收到 409，第一次上传就死。补行在 Worker 里做（`INSERT OR IGNORE`），`schema.sql` 里也留种子行。
- 部署 Worker 用 `tools/cloudflare/update-worker.js`：它带 `keep_bindings: ['secret_text']`，不带的话 Cloudflare 会把 `SYNC_TOKEN` 绑定删掉，所有客户端立刻 401。部署后脚本会回头核对绑定。
- 线上 D1 运维：`tools/cloudflare/check-blob-state.js`（需要 `CF_TOKEN` 环境变量，只读核对 + 打印现状）。
- 版本号只用 `node tools/bump-version.js <version> <versionCode>` 改，别手改单处。
