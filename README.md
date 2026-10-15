# 国协云工

国协云工集团有限公司的远程办公与灵活用工平台。雇主和平台是同一家单位。第一期只做合规闭环：实名、单独同意、先签署再干活、交付与验收、核算单确认、双人付款登记、终止、审计和证据包。

劳动员工和项目合作方从注册起就分开。劳动合同对工资，项目服务协议对服务费。名册、用语、合同和付款登记不能混用。

平台不计算工资、个税、社保、公积金，不开发票，也不划转资金。付款只是登记银行已经付过的结果。

## 本地运行

需要 Node.js 22。

```bash
npm --prefix apps/api ci
npm --prefix apps/web ci
npm run dev
```

页面在 <http://127.0.0.1:43123>，接口在 <http://127.0.0.1:8794>。第一次访问接口时，如果用户表是空的，会自动写入测试数据。

```bash
npm test
```

本地数据在 `apps/api/.wrangler/state`。想重新种子，先停掉进程再删掉这个目录。

`scripts/browser-check.mjs` 会用本机 Playwright 把两条闭环、注册、签署、终止和各页表单点一遍。运行前设置 `PLAYWRIGHT_ENTRY` 指向已安装的 `playwright/index.mjs`。

可选：把 `apps/api/.dev.vars.example` 复制为 `apps/api/.dev.vars`。不复制也能跑，开发环境会使用内置回退密钥。

## 测试账号

密码只用于测试，登录页也能看到。不要用于正式人员。

| 身份 | 姓名 | 邮箱 | 密码 |
| --- | --- | --- | --- |
| 制单管理员 | 梁淑敏 | maker@guoxie.chang2.ccwu.cc | Test-only-Maker-2026 |
| 复核管理员 | 韩砺 | checker@guoxie.chang2.ccwu.cc | Test-only-Checker-2026 |
| 劳动员工 | 林晓雯 | employee@guoxie.chang2.ccwu.cc | Test-only-Employee-2026 |
| 项目合作方 | 周启明 | collaborator@guoxie.chang2.ccwu.cc | Test-only-Collaborator-2026 |

另有一名已终止的劳动员工何牧：hemu@guoxie.chang2.ccwu.cc / Test-only-Terminated-2026。登录会返回「账号已停用」。四个日常测试账号保持可用。

梁淑敏负责发单、上传核算单、登记付款。韩砺负责验收和复核。同一个人不能既发单又验收，也不能既制单又复核。管理员权限不能绕过这两条，数据库触发器也会拦住。

## 两条线怎么走

劳动员工：平台协议（注册时）→ 个人信息单独同意 → 实名 → 劳动合同 → 本人在电子签沙箱签署 → 工作任务四要素 → 提交工作成果 → 另一人验收 → 工资核算单发到指定邮箱 → 本人确认或提出异议 → 制单登记工资发放 → 另一人复核。未回复不视为确认工资。

项目合作方：同样先单独同意和实名，再签项目服务协议。若约定沉默确认，签署时必须再勾一次，否则签不完。服务费核算单确认可以用平台、邮件回复（正文含「确认」）或邮件里的链接。只有协议里事先同意，逾期沉默才算确认，按自然日而不是工作日。

驳回必须写原因。再次提交会留下新版本。核算单以最后一张已确认的版本作为付款依据，金额按分保存。

终止合同会停用账号，并把未结事项标成已结清或待结清。

## 部署到 Cloudflare

账号 `d0e845fde248a912a971bdeb055c6bd4`。站点只用自定义域名：

<https://guoxie.chang2.ccwu.cc>

这个账号的 workers.dev 会返回错误 1101，配置里已关闭 workers.dev。不要把接口或页面指到 workers.dev。

部署前在 Cloudflare 控制台开通 R2（需要付款方式）。令牌至少需要：

- 账户 / Workers Scripts / Edit，或创建新 Worker 时的 Workers Admin
- 账户 / D1 / Edit
- 账户 / Workers R2 Storage / Edit
- 区域 `chang2.ccwu.cc` / Workers Routes / Edit，用来绑定自定义域名

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=d0e845fde248a912a971bdeb055c6bd4
npm --prefix apps/api ci
npm --prefix apps/web ci
npm run deploy
```

`scripts/deploy.sh` 只依赖上面两个环境变量。它会创建 D1 数据库 `guoxie-yungong` 和 R2 桶 `guoxie-yungong-files`（已存在则沿用），把 database_id 写进 `apps/api/wrangler.jsonc`，执行迁移，构建页面，部署 Worker，写入测试用 `SESSION_PEPPER` 与 `ESIGN_WEBHOOK_SECRET`，然后请求 `/api/health` 直到种子数据完成，并验证四个测试账号可以登录、何牧不能登录。

允许的浏览器来源包括 `https://guoxie.chang2.ccwu.cc`。生产页面和接口同域，`/api` 由 Worker 处理，其余是静态页面。

正式使用前轮换这两个密钥。测试口令写在部署脚本里，只为了让验收账号在空库上可用。

GitHub Actions 的 `deploy` 工作流在密钥为空时直接跳过，不会调用 wrangler。`test` 工作流不需要密钥。

管理路径建议放在 Cloudflare Access 后面，只保护 `/api/admin/*`，不要挡住整个域名，否则劳动员工和项目合作方无法登录。设置 `ACCESS_AUD` 或 `ACCESS_TEAM_DOMAIN` 后，生产环境会检查 Access 令牌的受众和过期时间。签名校验尚未对接团队证书，Access 仍应配置在边缘。

## 仍是模拟

- 实名：`mock-identity`。格式通过即视为核验。不保存证件原图，只存掩码和哈希。
- 电子签：`mock-esign`。沙箱页不是国协云工自己的页面。回传的是 UTF-8 文本。正式服务商应回传 PDF。
- 邮件：`mock-email`。正文留在「邮件存根」，不会真正发出。确认链接指向 `WEB_ORIGIN/confirm/`。

合同模板标明「法务初稿 V0.1，未经法务审核，不得对外使用」。

审计日志只允许追加，更新和删除会被数据库拒绝。每人或每项任务可以导出证据包，导出时会重算文件 SHA-256。每天 09:15（北京时间）的定时任务负责沉默确认到期、提醒邮件和备份。备份会去掉密码哈希和证件哈希。
