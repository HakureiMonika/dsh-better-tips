# Release Notes — 0.13.2

## 中文

- **原生错误退让**：没有有效、确认匹配的底层捕获时，直接显示 DSH 原生报错和完整错误复制入口；补充工具参数 JSON 格式错误的排查建议。
- **请求关联更准确**：通过请求身份和原始日志事件坐标匹配普通请求与重试记录。未确认的捕获不覆盖当前原生错误。
- **最新报错可折叠**：支持手动收起最新报错，保留红色「最新的报错」标记；新报错默认展开。
- **跟随 DSH 中英文**：界面、超时提示、复制反馈和新生成的排障报告随 DSH 语言切换，原始错误正文不翻译。
- **双语文档与截图**：重写中英文 README，补充目录及 8 张对应截图；npm 包也包含两份文档和截图。

### 验证与说明

- Node.js 24.21.0 下 240 项测试通过；语法检查与发包清单检查通过。
- 已在 Windows DSH 0.2.2-rc.3 中复现连接中断、429 限流和 502 网关错误，核验实际捕获及日志关联。
- 兼容声明：DSH `>=0.2.2-rc.2 <0.3.0`，Node.js `>=24.9.0`。Linux、macOS 尚未实机验证。
- 额外重试会发起真实请求，可能与其他重试插件叠加。两个重试预算设为 `0` 可关闭本插件的额外重试。
- 网络证据限量保存在进程内；退出后无法恢复。错误正文与相邻日志可能包含输入内容，分享前请检查。
- 0.13.1 已推送 GitHub，但未成功发布到 npm；本版包含该版本的功能更新。

## English

- **Native error fallback**: Shows the DSH native error and full-error copy control when no usable, confirmed capture exists. Adds troubleshooting checks for malformed tool-argument JSON.
- **More accurate request matching**: Links model and retry failures by request identity and exact log event coordinates. Unconfirmed captures do not replace the current native error.
- **Collapsible latest error**: Manually collapse the latest error into a red “Latest error” label. New errors expand by default.
- **Follows DSH Chinese/English**: Controls, timeout messages, copy feedback, and newly generated reports follow the DSH language. Original error text stays unchanged.
- **Bilingual docs and screenshots**: Updated READMEs with contents and 8 localized screenshots, all included in the npm package.

### Verification and notes

- 240 tests passed on Node.js 24.21.0; syntax and package-content checks passed.
- Socket failures, HTTP 429, and HTTP 502 were reproduced in Windows DSH 0.2.2-rc.3, with actual captures and log associations verified.
- Declared compatibility: DSH `>=0.2.2-rc.2 <0.3.0`, Node.js `>=24.9.0`. Linux and macOS have not been tested on real systems.
- Extra retries make real requests and may stack with other retry plugins. Set both budgets to `0` to disable this plugin's extra retries.
- Network evidence is bounded and process-local. Error bodies and nearby log events can contain input text; review before sharing.
- Version 0.13.1 was pushed to GitHub but not published successfully to npm. This release includes those features.

## Install

```sh
dsh plugin add dsh-better-tips@0.13.2
```
