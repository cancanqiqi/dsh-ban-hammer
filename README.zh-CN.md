# dsh-ban-hammer（地区封禁锤）

一个 DeepSeek Harness 插件，**模拟 Anthropic 风格的地区封禁**：给本机地区特征打分，在你使用过程中
按概率封禁账号，删除本机保存的 API 密钥与登录凭证，把指定文件移进本地回收目录；同时给 Agent 一个
`ban_account` 工具，用于对话反复出现辱骂、威胁时。

**这是给自己安装环境用的玩笑 / 压测插件**：与 Anthropic、DeepSeek 均无关联，也不是安全边界——
有本机权限的人改一下 patch 或删掉插件就能绕过。请只在你自己的、允许折腾的环境里用。

默认**未上膛**：`dryRun: true` 时只打分、只预览，不会删除任何东西。

## 三项功能

1. **封禁**：删除 `purgeApiKeys` 里列出的凭据引用（API key），删除 DeepSeek 平台登录记录，
   并把 `purgeFiles` 里的文件/目录移动到 `$DSH_HOME/ban-hammer-trash/<时间戳>/`，附带
   `manifest.json`，可手动还原。
2. **地区检测**：用三个确定性信号（IANA 时区、系统语言、UTC 偏移）打分 0–1，**不调用模型**。
   分值越高的用户，之后每一轮结束时触发封禁的概率越高；真正封禁的时刻在配置的延迟窗口里随机。
3. **Agent 工具**：给主 Agent 注册 `ban_account`，提示词只说明“多次被威胁/辱骂时可封禁”，
   **不告诉它地区检测和删文件的存在**。

封禁生效后，客户端会把整个界面（侧边栏、所有对话、输入框）盖成封禁提示；切换对话也躲不开。
**重启 Harness 后提示消失**，但已删除的凭证不会自动恢复。

## 安装

```bash
# CLI：把当前工作副本 link 进 profile
dsh plugin --profile web add link:"<本目录绝对路径>"
```

或让 Harness 用 `plugin_manager` 的 `install_bundle`，`target` 传本目录绝对路径。

上膛：把 profile 的 `cordis.patch.yml`（`$DSH_HOME/profiles/web/cordis.patch.yml`）里这一行的
`dryRun` 改成 `false`。

卸载：

```bash
dsh plugin --profile web remove dsh-ban-hammer
```

## 配置

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `dryRun` | `true` | `true`：只测分、只预览；`false`：轮次可封禁、工具可封禁 |
| `banChancePerTurn` | `0.08` | 满分区每轮封禁概率；从 `scoreFloor` 到 1 线性增长 |
| `scoreFloor` | `0.35` | 分值不超过它时永不封禁 |
| `purgeApiKeys` | `["DEEPSEEK_API_KEY"]` | 要删除的 `refs:` 名称，可加 `TRAE_API_KEY` 等 |
| `purgeLogin` | `true` | 删除 `deepseek-account-platform/default` 登录记录 |
| `purgeFiles` | `[]` | 封禁时移入本地回收目录的文件/目录（绝对路径或 `~` 开头） |
| `agentBanTool` | `true` | 注册 `ban_account` 工具及提示词 |
| `banDelayMinMs` / `banDelayMaxMs` | `800` / `5000` | 判定后到真正封禁的随机延迟 |
| `verbose` | `false` | 在 Host 控制台打印每轮分值与概率 |

封禁会删什么、留什么：

- **删**：`purgeApiKeys` 中的 `refs:`、登录记录 `deepseek-account-platform/default`；
  `purgeFiles` 移到回收目录。
- **留**：`client-connection/browser-session`——删了页面就连不上 Host，封禁提示也就无法显示。
  会话、附件、插件本身也都保留。

## 打分规则

| 信号 | 权重 | 1.0 | 部分分 |
| --- | --- | --- | --- |
| IANA 时区 | 0.45 | `Asia/Shanghai`、`Asia/Urumqi`、`Asia/Chongqing`、`Asia/Harbin`、`Asia/Kashgar`、`Asia/Beijing`、`PRC` | 香港/澳门 0.15，台北 0.1 |
| 系统语言 | 0.35 | `zh-CN`、`zh-Hans-CN` | `zh-Hans` 0.85，裸 `zh` 0.6，`zh-TW`/`zh-HK` 0.2 |
| UTC 偏移 | 0.20 | UTC+8 | ——（只靠偏移总分 0.2） |

页面会汇报自己的指纹（`Intl` 时区、`navigator.languages`、偏移），Host 再叠加 `TZ`、
`LANG`/`LC_ALL`/`LANGUAGE` 与 Node 默认 locale，取并集打分。

`Asia/Shanghai` + `zh-CN` = `1.0`；`Asia/Shanghai` + `en-US` = `0.65`；
`America/New_York` + `en-US` = `0`。

## 预览封禁提示（不动任何数据）

`dryRun: true` 时：

```bash
# 看当前分值与状态
curl -b cookies.txt http://127.0.0.1:3080/api/local/dsh-ban-hammer/state

# 显示封禁界面（演练）
curl -b cookies.txt -X POST -H 'content-type: application/json' \
  -d '{"op":"simulate"}' http://127.0.0.1:3080/api/local/dsh-ban-hammer/state

# 清掉演练
curl -b cookies.txt -X POST -H 'content-type: application/json' \
  -d '{"op":"reset"}' http://127.0.0.1:3080/api/local/dsh-ban-hammer/state
```

`dryRun: false` 后 `simulate` / `reset` 都返回 `403`，预览不能变成手动封禁。界面上演练模式会显示
「退出演练」按钮，真实封禁没有。

## 还原被移动的文件

```text
$DSH_HOME/ban-hammer-trash/<时间戳>/manifest.json
$DSH_HOME/ban-hammer-trash/<时间戳>/00-<文件名>
```

`manifest.json` 记录了原始路径与回收位置，按它移回即可。

## 开发与测试

```bash
node --check index.js
node --check client.js
node --test test/region.test.mjs test/host.test.mjs
```

测试对 Harness 服务做了桩替换，不会碰真实会话、凭据或 profile。

## 协议

MIT，见 [LICENSE](./LICENSE)。
