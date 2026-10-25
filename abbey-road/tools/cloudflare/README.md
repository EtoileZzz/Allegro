# Cloudflare 网页端操作步骤（不用域名、不用命令行）

全部在 <https://dash.cloudflare.com> 网页里点，10 分钟能搞定。免费账号够用。

> 需要的两个文件就在这个目录：`schema.sql`、`worker.js`（直接复制粘贴）。

---

## 第 1 步：建 D1 数据库

1. 登录 <https://dash.cloudflare.com>。
2. 左侧栏 **Storage & Databases → D1 SQL Database**（旧界面在 **Workers & Pages → D1**）。
3. 点 **Create database**，名字填 `abbeyroad-sync`，点 **Create**。

## 第 2 步：建表

1. 点开刚建好的 `abbeyroad-sync`。
2. 切到 **Console** 标签（有的界面叫 **Query** / **Explore**）。
3. 把 `schema.sql` 全文粘进去，点 **Execute**（或 Run）。
4. 应该看到成功；这时库里有了 `state` 和 `history` 两张表。

> 这段 SQL 可以重复执行，不会清数据。

## 第 3 步：创建 Worker

1. 左侧栏 **Workers & Pages → Create**。
2. 选 **Workers** → **Start with Hello World!**（有的界面是 **Create Worker**）。
3. 名字填 `abbeyroad-sync`（这个名字会进 URL，只能用小写字母/数字/短横线），点 **Deploy**。
4. 部署完点 **Edit code**（或 **Continue to project → Edit code**），进在线编辑器。
   - 确认编辑器右上是 **ES module** 格式（不是 Service Worker 格式）。我们的代码用的是 `export default`。
5. 把编辑器里 `worker.js` 的内容**全选删掉**，粘贴本目录 `worker.js` 全文。
6. 点右上 **Deploy**。

## 第 4 步：把数据库绑给 Worker（变量名必须是 `DB`）

1. 回到这个 Worker 的页面 → **Settings → Bindings**（新版：**Settings → Bindings → Add**）。
2. 选 **D1 database**。
3. **Variable name** 填 `DB`（**必须是大写 DB，不能改**）。
4. **Database** 选 `abbeyroad-sync`。
5. **Save**（改完绑定要**再点一次 Deploy** 才会生效）。

## 第 5 步：加访问令牌（Secret）

1. 同一个 Worker → **Settings → Variables and Secrets**。
2. **Add** → 类型选 **Secret**（不是 Plaintext）。
3. **Name** 填 `SYNC_TOKEN`。
4. **Value** 粘贴一串你自己生成的随机字符串：64 位十六进制，例如在浏览器控制台（F12 → Console）执行：

   ```js
   [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')
   ```

   把这串东西存进你的密码管理器——App 里要填它。
5. **Encrypt / Save**。

> 千万别用 `abc123` 这类。这个 token 是公网上唯一的门锁，`workers.dev` 地址是公开可达的。

## 第 6 步：拿到地址并把 workers.dev 打开

1. Worker 页面 → **Settings → Domains & Routes**。
2. 如果还没有 `workers.dev` 子域，点 **Enable** / 设置一个子域名（免费，只用一次）。
3. 页面上显示的地址形如：

   ```
   https://abbeyroad-sync.<你的子域>.workers.dev
   ```

   这就是 App 里要填的「服务地址」。

## 第 7 步：在浏览器里自检（很重要）

打开这两个地址：

| 地址 | 期望结果 |
|---|---|
| `https://…workers.dev/health` | `{"ok":true,"db":true,"now":…}` —— `db` 要是 `true`，否则说明第 4 步的绑定没生效/没重新 Deploy |
| `https://…workers.dev/state` | `{"error":"unauthorized"}` —— 有 401 才对，说明 token 门锁在工作 |

再用带 token 的方式验一次（可选，在浏览器控制台执行）：

```js
fetch('https://…workers.dev/state', { headers: { Authorization: 'Bearer 你的token' } })
  .then(r => r.json()).then(console.log)   // 期望 { rev: 0, updatedAt: 0, envelope: null }
```

## 第 8 步：把信息交给 App

完成后你手里应该有三样东西：

1. **服务地址**：`https://abbeyroad-sync.<子域>.workers.dev`
2. **token**：第 5 步那串 64 位
3. **口令**：同步加密用的口令（自己定，App 里第一次设置时输入；**忘了就无法解密云端数据**）

把前两样（服务地址 + token）发我，我把 `app/js/sync.js` 和设置页入口接上；口令你自己在 App 里设，**不要发给我**。

---

## 常见问题

**`/health` 里 `db:false`**
→ 第 4 步的绑定变量名不是 `DB`，或改完绑定后没重新 **Deploy**。

**`/health` 打不开 / 404**
→ 第 6 步的 `workers.dev` 没打开；或 Worker 名称拼错。

**`/state` 返回 200 而不是 401**
→ 第 5 步的 `SYNC_TOKEN` 没存上（要选 Secret 类型）。

**改了 worker.js 之后行为没变**
→ 在在线编辑器里改了代码必须点 **Deploy** 才会生效（页面会提示 "Success! Your changes have been deployed"）。

**免费额度会不会超**
→ Workers 10 万请求/天、D1 500 万行读/天。个人用两台设备一天几十次请求，用不到 1%。超了也只是同步失败，本地数据不受影响。

## 想用命令行的话（可选）

```bash
npm i -g wrangler
wrangler login
wrangler d1 create abbeyroad-sync          # 把得到的 database_id 填进 wrangler.toml
wrangler d1 execute abbeyroad-sync --file=schema.sql
wrangler secret put SYNC_TOKEN
wrangler deploy
```

（`wrangler.toml` 里的 `database_name`/`database_id` 需要换成你自己的。）
