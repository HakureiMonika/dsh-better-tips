/** Original errors with supplementary evidence and concise troubleshooting checks. */
window.__ModuleLoader__.load({
  id: 'dsh-better-tips',
  factory (require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'better-tips'
    const KIND = 'better-tips-compaction'
    const CSS_TAG = 'dsh-better-tips/BetterTips.css'
    const zh = {
      'ui.authProtected': '认证错误正文已隐藏，避免回显凭据。请核对密钥、接口地址和模型权限。',
      'ui.authBodyProtected': '认证响应正文已受保护；仅保留安全的状态与请求标识。',
      'ui.details': '底层原始详情', 'ui.bottom': '底层', 'ui.unconfirmed': '关联未确认',
      'ui.candidates': '候选捕获 · {count}', 'ui.loading': '加载中',
      'ui.empty': '未取得额外网络诊断', 'ui.disabled': '额外网络诊断已关闭', 'ui.captureUnavailable': '额外网络诊断不可用', 'ui.loadFailed': '详情读取失败 · {message}',
      'ui.refresh': '重新读取', 'ui.bodyPending': '响应正文读取中', 'ui.bodyEmpty': '响应正文为空',
      'ui.bodyTruncated': '响应正文已截断', 'ui.bodyUnreadable': '响应正文读取失败',
      'ui.copyCapture': '复制截获错误', 'ui.copyError': '复制完整错误', 'ui.copyCoordinate': '复制日志坐标', 'ui.copyPath': '复制路径',
      'ui.copied': '已复制', 'ui.copyFailed': '复制失败，请手动选择文本', 'ui.copying': '复制中',
      'ui.error': '失败', 'ui.stopped': '已停止', 'ui.retry': '重试',
      'ui.retried': '已重试', 'ui.cancelled': '重试取消', 'ui.scheduled': '等待重试',
      'compact.title': '上下文已压缩', 'compact.completed': '{items} 条 · ~{tokens} tokens',
      'compact.running': '压缩中', 'compact.done': '压缩完成',
      'compact.failed': '压缩失败', 'compact.failedAuto': '自动压缩失败',
      'compact.recordMissing': '本次压缩的具体失败记录尚未加载，当前仅有命令提示。', 'compact.recordFailed': '本次压缩失败记录读取失败。',
      'compact.errorProtected': '压缩失败；持久化诊断缺少错误类型，正文已隐藏以避免回显凭据。',
      'compact.attempt': '尝试 {index}',
      'ui.expand': '错误详情', 'ui.original': 'DSH 原生报错', 'ui.network': '插件捕获的底层报错',
      'ui.nativeExcerpt': 'DSH 原生报错 · 摘要', 'ui.overviewSource': '插件整理 · 重试概览', 'ui.open': '展开', 'ui.close': '收起',
      'ui.earlierErrors': '更早的报错 · {count}', 'ui.earlierBlock': '更早的报错', 'ui.latestBlock': '最新的报错',
      'ui.history': '重试记录 · {count}', 'ui.record': '失败记录 {index}',
      'ui.categoryOverview': '类别概览', 'ui.different': '{count} 类错误',
      'ui.attempts': '请求尝试 · {count}', 'ui.logSection': '日志定位',
      'ui.timingMatch': '按时间关联 · 未确认请求身份', 'ui.wait': '计划等待 {ms} ms',
      'ui.historyNote': '按发生顺序；同一重试的等待与开始状态仅记一次。',
      'report.copy': '一键复制排障报告', 'report.building': '生成中', 'report.partial': '已复制 · 部分信息缺失',
      'report.fallback': '复制失败，可选择下方报告文本',
      'report.notice': '分享前检查：报错或响应可能回显输入；仅过滤常见凭据，不保证清除个人信息。',
      'compact.usage': '摘要请求用量（非会话总量）', 'log.contextWarning': '相邻事件可能含会话内容，分享前请检查。',
      'report.responseState': '响应状态',
      'report.intro': '记录于{time}：使用“{provider}”渠道的“{model}”模型时遇到{error}。',
      'report.plugins': '已启用第三方插件', 'report.pluginsPartial': '部分插件信息未能确认', 'report.pluginsUnavailable': '清单读取失败或不可用', 'report.pluginsNone': '无',
      'report.missing': '未记录', 'report.version': '截止生成本报告时', 'report.native': 'DSH 原生报错', 'report.underlying': '插件捕获的底层报错',
      'report.noEvidence': '未取得唯一匹配的底层证据', 'report.ambiguous': '有多个候选，未混入报告', 'report.readFailed': '读取失败',
      'report.unconfirmed': '同一时间附近捕获到以下报错：', 'report.summaryError': '摘要请求报错',
      'report.response': '响应摘要', 'report.truncated': '已省略，全文见错误详情', 'report.protected': '认证正文已隐藏',
      'report.timing': '请求耗时', 'report.wait': '计划等待（非实测）', 'report.retry': '重试记录',
      'report.help': '请协助排查；以上是已保留的错误证据，并非已确认根因。',
      'check.mixed': '本组包含不同错误；展开后按每条记录分别排查，勿将最后一种错误视为全部原因。',
    }
    const en = {
      'ui.authProtected': 'Authentication error text is hidden to avoid echoing credentials. Check the key, endpoint and model permissions.',
      'ui.authBodyProtected': 'Authentication response text is protected; only safe status and request identifiers are retained.',
      'ui.details': 'Underlying raw details', 'ui.bottom': 'Underlying', 'ui.unconfirmed': 'Unconfirmed match',
      'ui.candidates': 'Candidate captures · {count}', 'ui.loading': 'Loading',
      'ui.empty': 'No additional network diagnosis', 'ui.disabled': 'Additional network diagnosis is disabled', 'ui.captureUnavailable': 'Additional network diagnosis unavailable', 'ui.loadFailed': 'Details unavailable · {message}',
      'ui.refresh': 'Read again', 'ui.bodyPending': 'Reading response body', 'ui.bodyEmpty': 'Response body is empty',
      'ui.bodyTruncated': 'Response body truncated', 'ui.bodyUnreadable': 'Response body read failed',
      'ui.copyCapture': 'Copy captured error', 'ui.copyError': 'Copy full error', 'ui.copyCoordinate': 'Copy log coordinates', 'ui.copyPath': 'Copy path',
      'ui.copied': 'Copied', 'ui.copyFailed': 'Copy failed; select the text manually', 'ui.copying': 'Copying',
      'ui.error': 'Failed', 'ui.stopped': 'Stopped', 'ui.retry': 'Retrying',
      'ui.retried': 'Retried', 'ui.cancelled': 'Retry cancelled', 'ui.scheduled': 'Retry scheduled',
      'compact.title': 'Context compacted', 'compact.completed': '{items} items · ~{tokens} tokens',
      'compact.running': 'Compacting', 'compact.done': 'Compaction complete',
      'compact.failed': 'Compaction failed', 'compact.failedAuto': 'Automatic compaction failed',
      'compact.recordMissing': 'The specific failure record for this compaction is not loaded; only the command notice is available.', 'compact.recordFailed': 'Could not read this compaction failure record.',
      'compact.errorProtected': 'Compaction failed; durable diagnosis has no error type, so its text is withheld to avoid credential echoes.',
      'compact.attempt': 'Attempt {index}',
      'ui.expand': 'Error details', 'ui.original': 'DSH native error', 'ui.network': 'Plugin-captured underlying error',
      'ui.nativeExcerpt': 'DSH native error · excerpt', 'ui.overviewSource': 'Plugin summary · retries', 'ui.open': 'Expand', 'ui.close': 'Collapse',
      'ui.earlierErrors': 'Earlier errors · {count}', 'ui.earlierBlock': 'Earlier error', 'ui.latestBlock': 'Latest error',
      'ui.history': 'Retry history · {count}', 'ui.record': 'Failure record {index}',
      'ui.categoryOverview': 'Category overview', 'ui.different': '{count} error categories',
      'ui.attempts': 'Request attempts · {count}', 'ui.logSection': 'Log location',
      'ui.timingMatch': 'Time correlation · request identity unconfirmed', 'ui.wait': 'planned wait {ms} ms',
      'ui.historyNote': 'Chronological; scheduled and started states of one retry count once.',
      'report.copy': 'Copy troubleshooting report', 'report.building': 'Preparing', 'report.partial': 'Copied · some information missing',
      'report.fallback': 'Copy failed; select the report below',
      'report.notice': 'Review before sharing: errors/responses may echo input. Common credential filtering is not personal-data removal.',
      'compact.usage': 'Summary request usage (not session total)', 'log.contextWarning': 'Nearby events may contain conversation content. Review before sharing.',
      'report.responseState': 'Response state',
      'report.intro': 'At {time}, model “{model}” via provider “{provider}” returned {error}.',
      'report.plugins': 'Enabled third-party plugins', 'report.pluginsPartial': 'Some plugin information could not be verified', 'report.pluginsUnavailable': 'Inventory unavailable or read failed', 'report.pluginsNone': 'none',
      'report.missing': 'not recorded', 'report.version': 'As of this report', 'report.native': 'DSH native error', 'report.underlying': 'Plugin-captured underlying error',
      'report.noEvidence': 'No uniquely matched underlying evidence', 'report.ambiguous': 'Multiple candidates omitted', 'report.readFailed': 'Read failed',
      'report.unconfirmed': 'The following was captured around the same time:', 'report.summaryError': 'Summary request error',
      'report.response': 'Response excerpt', 'report.truncated': 'omitted; full text in error details', 'report.protected': 'Authentication text withheld',
      'report.timing': 'Request duration', 'report.wait': 'Planned wait (not measured)', 'report.retry': 'Retry record',
      'report.help': 'Please help investigate. These are retained observations, not a confirmed root cause.',
      'check.mixed': 'This chain contains different errors; inspect each record rather than treating the last as the cause of all failures.',
    }
    const checks = {
      generic: ['展开错误详情，核对请求地址与服务端日志。', 'Expand error details; verify the endpoint and server logs.'],
      dnsName: ['核对 API 域名及 DNS 解析结果。', 'Verify the API hostname and DNS resolution.'],
      dnsTemporary: ['检查 DNS 服务，稍后重试。', 'Check DNS availability, then retry later.'],
      refused: ['核对目标端口，确认服务及代理正在监听。', 'Verify the target port and that the service and proxy are listening.'],
      unreachable: ['检查网络路由、VPN 与防火墙。', 'Check routing, VPN and firewall rules.'],
      socket: ['检查代理与上游连接；持续发生时核对双方日志。', 'Check proxy and upstream connections; inspect both logs if persistent.'],
      connectTimeout: ['检查目标地址、代理与防火墙，再核对连接超时设置。', 'Check the endpoint, proxy and firewall, then the connection timeout.'],
      headersTimeout: ['核对上游响应头等待时间及代理超时设置。', 'Check upstream response-header latency and proxy timeouts.'],
      bodyTimeout: ['检查流式连接与上游输出停顿，核对读取超时设置。', 'Check stream connectivity and upstream stalls, then read timeouts.'],
      certExpired: ['核对系统时间及服务端证书有效期。', 'Check the system clock and server certificate validity.'],
      certChain: ['检查服务端证书链与本机信任库；不要关闭证书校验。', 'Check the server certificate chain and local trust store; keep verification enabled.'],
      certName: ['核对 API 域名与证书域名是否一致。', 'Check that the API hostname matches the certificate names.'],
      tls: ['核对代理 TLS 配置、证书及协议兼容性。', 'Check proxy TLS settings, certificates and protocol compatibility.'],
      request: ['查看响应正文，核对请求参数与模型支持范围。', 'Inspect the response body; verify parameters and model support.'],
      unauthorized: ['核对 API 密钥、请求地址及认证方式。', 'Verify the API key, endpoint and authentication scheme.'],
      forbidden: ['核对账号、模型权限及网关访问策略。', 'Check account/model permissions and gateway access policies.'],
      notFound: ['核对 API 路径、接口版本及模型标识。', 'Verify the API path, version and model ID.'],
      conflict: ['查看响应正文，确认冲突状态后再重试。', 'Inspect the response body and resolve the conflicting state before retrying.'],
      tooLarge: ['减少上下文、附件或单次请求大小，并核对网关限制。', 'Reduce context, attachments or request size; check gateway limits.'],
      rateLimit: ['核对 Retry-After、并发和速率限制，退避后重试。', 'Check Retry-After, concurrency and rate limits; retry with backoff.'],
      headersLarge: ['精简请求头，核对代理请求头大小限制。', 'Reduce request headers and check proxy header-size limits.'],
      closed: ['核对取消记录及客户端、代理超时日志。', 'Check cancellation records and client/proxy timeout logs.'],
      server: ['凭 request-id 核对服务端日志，稍后重试。', 'Check server logs using the request ID, then retry later.'],
      gateway: ['核对网关与上游日志、健康状态及超时设置。', 'Check gateway/upstream logs, health and timeouts.'],
      context: ['压缩上下文或减少输入，核对模型上下文上限。', 'Compact context or reduce input; verify the model context limit.'],
      quota: ['核对账号余额、用量配额及计费状态。', 'Check account balance, usage quota and billing status.'],
      credentials: ['检查凭据、账号状态及模型访问权限。', 'Check credentials, account status and model access.'],
      model: ['核对模型标识及当前账号可用的模型列表。', 'Verify the model ID against models available to this account.'],
      config: ['核对提供方地址、协议及模型配置。', 'Check provider endpoint, protocol and model configuration.'],
      adapter: ['确认已启用与当前模型协议匹配的适配器。', 'Ensure an adapter matching the model protocol is enabled.'],
      image: ['按原始提示处理图片或减少图片输入。', 'Follow the original image instructions or reduce image input.'],
      aborted: ['核对是否主动取消；非预期中止时检查超时设置。', 'Check for intentional cancellation; inspect timeouts if unexpected.'],
      timeout: ['检查网络与上游耗时，区分连接和读取超时。', 'Check network/upstream latency; distinguish connection and read timeouts.'],
      finishReason: ['核对 finish_reason、接口兼容性、上游提前结束及代理超时。', 'Check finish_reason, API compatibility, early upstream completion and proxy timeouts.'],
      transport: ['查看会话日志；有网络诊断时核对连接与代理。', 'Inspect the session log; check connectivity and proxy details when network evidence is available.'],
      empty: ['检查上游返回内容、流式协议及模型接口兼容性。', 'Check upstream output, streaming protocol and model API compatibility.'],
      tokens: ['核对摘要输出 token 上限及模型限制。', 'Check the summary output-token cap and model limits.'],
      stream: ['核对流式响应中断时的代理与上游日志。', 'Check proxy and upstream logs at the stream interruption.'],
      malformed: ['核对模型输出格式与工具参数 JSON；每次工具调用只传一个完整 JSON 对象。', 'Check the model response format and tool-argument JSON; send one complete JSON object per tool call.'],
      tools: ['核对工具服务与会话生命周期；保留堆栈排查失效上下文。', 'Check tool services and session lifecycle; retain the stack for inactive-context diagnosis.'],
    }
    zh['ui.advice'] = '排查'
    en['ui.advice'] = 'Check'
    for (const [key, [cn, english]] of Object.entries(checks)) {
      zh[`check.${key}`] = cn
      en[`check.${key}`] = english
    }
    const CODE_CHECKS = Object.freeze({
      ENOTFOUND: 'dnsName', EAI_AGAIN: 'dnsTemporary', ECONNREFUSED: 'refused',
      ENETUNREACH: 'unreachable', EHOSTUNREACH: 'unreachable',
      ECONNRESET: 'socket', EPIPE: 'socket', UND_ERR_SOCKET: 'socket',
      UND_ERR_CONNECT_TIMEOUT: 'connectTimeout', UND_ERR_HEADERS_TIMEOUT: 'headersTimeout', UND_ERR_BODY_TIMEOUT: 'bodyTimeout',
      CERT_HAS_EXPIRED: 'certExpired', CERT_NOT_YET_VALID: 'certExpired',
      UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'certChain', UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'certChain',
      DEPTH_ZERO_SELF_SIGNED_CERT: 'certChain', SELF_SIGNED_CERT_IN_CHAIN: 'certChain',
      ERR_TLS_CERT_ALTNAME_INVALID: 'certName', EPROTO: 'tls',
      AUTH: 'credentials', MISSING_CREDENTIAL: 'credentials', INVALID_CREDENTIAL: 'credentials', ACCOUNT_SIGNED_OUT: 'credentials',
      QUOTA: 'quota', ACCOUNT_QUOTA: 'quota', CONTEXT_WINDOW_EXCEEDED: 'context',
      IMAGE_OFFLOAD_REQUIRED: 'image', INVALID_MODEL: 'model', INVALID_CONFIG: 'config', NO_ADAPTER: 'adapter',
      ABORTED: 'aborted', INTERRUPTED: 'aborted', TIMEOUT: 'timeout', ETIMEDOUT: 'timeout',
      MALFORMED_RESPONSE: 'malformed',
      TRANSPORT: 'transport', SERVER: 'server', EMPTY_RESPONSE: 'empty', RATE_LIMIT: 'rateLimit', MAX_TOKENS: 'tokens',
      context_length_exceeded: 'context', insufficient_quota: 'quota', invalid_api_key: 'unauthorized',
      authentication_error: 'unauthorized', permission_error: 'forbidden', model_not_found: 'model',
      rate_limit_exceeded: 'rateLimit', rate_limit_error: 'rateLimit', invalid_request_error: 'request',
      overloaded_error: 'server', api_error: 'server',
    })
    const HTTP_CHECKS = Object.freeze({
      400: 'request', 401: 'unauthorized', 402: 'quota', 403: 'forbidden', 404: 'notFound',
      408: 'timeout', 409: 'conflict', 413: 'tooLarge', 422: 'request', 429: 'rateLimit',
      431: 'headersLarge', 499: 'closed', 500: 'server', 502: 'gateway', 503: 'server', 504: 'gateway',
      520: 'gateway', 521: 'gateway', 522: 'gateway', 523: 'gateway', 524: 'gateway', 525: 'tls', 526: 'certChain',
    })
    Object.assign(zh, {
      'log.open': '打开日志', 'log.close': '收起日志', 'log.title': '会话原始日志',
      'log.loading': '读取日志中', 'log.unavailable': '日志读取不可用', 'log.missing': '未找到对应原始事件；未跳转到其他记录。',
      'log.noCoordinate': '该错误缺少精确日志坐标', 'log.failed': '日志读取失败 · {message}',
      'log.target': '错误所在事件', 'log.context': '相邻事件', 'log.capture': '网络捕获 · 内存记录',
      'log.protected': '显示副本已隐藏认证正文及常见凭据；持久化原始日志未改写。',
      'log.notWire': '会话日志不是上游原始网络报文。',
      'log.file': '日志文件', 'log.pathMissing': '实际日志路径不可用',
      'log.metadataLoading': '读取日志路径与源码位置', 'log.metadataFailed': '路径与源码信息读取失败',
      'log.sourceMatch': '源码匹配（非调用堆栈）', 'log.sourceUnknown': '未取得可核验的生成函数。',
      'log.producer': '报错生成', 'log.classifier': '错误分类',
      'log.logical': '按 seq 定位；不是文件行号，压缩日志需解码查看。',
    })
    Object.assign(en, {
      'log.open': 'Open log', 'log.close': 'Close log', 'log.title': 'Raw session log',
      'log.loading': 'Loading log', 'log.unavailable': 'Log reader unavailable', 'log.missing': 'Exact source event not found; no other record was substituted.',
      'log.noCoordinate': 'This error has no exact log coordinates', 'log.failed': 'Log read failed · {message}',
      'log.target': 'Error source event', 'log.context': 'Nearby events', 'log.capture': 'Network capture · in memory',
      'log.protected': 'This display copy hides authentication text and common credentials; the durable source log is unchanged.',
      'log.notWire': 'Session events are not raw upstream network packets.',
      'log.file': 'Log file', 'log.pathMissing': 'Physical log path unavailable',
      'log.metadataLoading': 'Loading log path and source location', 'log.metadataFailed': 'Log path and source lookup failed',
      'log.sourceMatch': 'Source match (not an execution stack)', 'log.sourceUnknown': 'No verified error-producing function.',
      'log.producer': 'Error producer', 'log.classifier': 'Error classifier',
      'log.logical': 'Locate by seq, not file line number; compressed logs require decoding.',
    })
    Object.assign(zh, {
      'format.locale': 'zh-CN', 'format.list': '、', 'format.params': '；',
      'ui.requestTimeout': '请求超时',
    })
    Object.assign(en, {
      'format.locale': 'en-US', 'format.list': ', ', 'format.params': '; ',
      'ui.requestTimeout': 'Request timeout',
    })
    const diagnosticProblem = (value, t) => value === 'request-timeout' ? t('ui.requestTimeout') : text(value)
    let sessionService
    const CSS = [
      '.bt_errorGroup{margin:8px 0;padding:2px 0 4px 12px;border-left:2px solid var(--dsw-alias-state-error-primary);display:grid;gap:4px;font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.65;min-width:0}',
      '.bt_originalRow{grid-column:1/-1;display:grid;gap:3px;min-width:0}',
      '.bt_originalRow>.bt_title{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.bt_original,.bt_preview{margin:0;font:inherit;font-family:ui-monospace,monospace;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;user-select:text}',
      '.bt_protected{grid-column:1/-1;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.bt_error,.bt_compact{margin:2px 0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.6;min-width:0}',
      '.bt_error>summary,.bt_compact>summary{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;cursor:pointer;list-style:none;min-width:0;min-height:28px;padding:2px 0}',
      '.bt_error>summary::-webkit-details-marker,.bt_compact>summary::-webkit-details-marker{display:none}',
      '.bt_error>summary:before,.bt_compact>summary:before{content:"›";flex:none;color:var(--dsw-alias-label-secondary)}',
      '.bt_error[open]>summary:before,.bt_compact[open]>summary:before{content:"⌄"}',
      '.bt_title{flex:none;color:var(--dsw-alias-label-secondary)}',
      '.bt_error .bt_primary{color:var(--dsw-alias-state-error-primary)}',
      '.bt_primary{color:var(--dsw-alias-state-error-primary);font:inherit;font-family:ui-monospace,monospace;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.bt_logOpen{flex:1 1 100%;min-width:0}',
      '.bt_actions{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;min-width:0}',
      '.bt_action,.bt_logButton{display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:3px;background:transparent;color:var(--dsw-alias-label-primary);font:400 12px/1.4 system-ui,sans-serif;min-height:24px;padding:2px 7px;cursor:pointer;text-decoration:none;width:fit-content}',
      '.bt_action:hover,.bt_logButton:hover{border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.bt_action:disabled,.bt_logButton:disabled{cursor:not-allowed;opacity:.55;text-decoration:none}',
      '.bt_action:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}',
      '.bt_flag{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.bt_body{margin:4px 0 6px 14px;display:grid;gap:6px;min-width:0}',
      '.bt_body>.bt_refresh{justify-self:start}',
      '.bt_raw{margin:0;padding:6px 8px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto;',
      'font:12px/1.6 ui-monospace,monospace;color:var(--dsw-alias-label-primary);',
      'border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);user-select:text}',
      '.bt_meta{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}',
      '.bt_capture{display:grid;gap:3px;min-width:0}',
      '.bt_advice,.bt_captureAdvice{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;padding:2px 0;color:var(--dsw-alias-label-primary);font-size:12px;overflow-wrap:anywhere}.bt_advice>.bt_title,.bt_captureAdvice>.bt_title{font-weight:600;color:var(--dsw-alias-state-error-primary)}',
      '.bt_logButton:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}',
      '.bt_logPanel{margin:6px 0;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;min-width:0}',
      '.bt_logTarget{border-left:3px solid var(--dsw-alias-state-error-primary);padding-left:8px;min-width:0}',
      '.bt_logHeading{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.bt_advice{grid-column:1/-1;margin:1px 0 2px;min-width:0}',
      '.bt_compact{color:var(--dsw-alias-label-secondary)}',
      '.bt_error>summary:focus-visible,.bt_compact>summary:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}',
      '.bt_detailBody{margin:4px 0 8px 10px;gap:10px}.bt_section{min-width:0;border-top:1px solid var(--dsw-alias-border-l1);padding-top:7px}.bt_heading{margin:0 0 4px;font:inherit;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.bt_section>summary,.bt_attempt>summary{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;min-height:28px;cursor:pointer}.bt_section>summary:focus-visible,.bt_attempt>summary:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}.bt_attempt{min-width:0;margin:4px 0;padding-left:10px;border-left:1px solid var(--dsw-alias-border-l1)}.bt_attempt>div{display:grid;gap:5px;padding:6px 0}.bt_attemptPreview{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}',
      '.bt_attempt>summary,.bt_network>summary{list-style:none}.bt_attempt>summary::-webkit-details-marker,.bt_network>summary::-webkit-details-marker{display:none}.bt_attempt>summary:before,.bt_network>summary:before{content:"›";flex:none;color:var(--dsw-alias-label-secondary)}.bt_attempt[open]>summary:before,.bt_network[open]>summary:before{content:"⌄"}.bt_attemptPreview{font:inherit;font-family:ui-monospace,monospace}.bt_original{max-height:340px;overflow:auto}.bt_network>summary{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;min-height:28px;cursor:pointer}.bt_network>summary:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}',
      '.bt_reportText>summary{cursor:pointer;min-height:28px;font-size:12px;color:var(--dsw-alias-label-secondary)}.bt_reportText>summary:focus-visible,.bt_reportText pre:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}',
      '.bt_source{font:600 12px/1.6 system-ui,sans-serif;color:var(--dsw-alias-label-primary)}',
      '.bt_errorGroup details{min-width:0}.bt_errorGroup details>summary,.bt_compact>summary{display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;min-height:32px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;list-style:none}',
      '.bt_errorGroup details>summary::-webkit-details-marker{display:none}.bt_errorGroup details>summary:before,.bt_compact>summary:before{content:none}.bt_errorGroup details[open]>summary:before,.bt_compact[open]>summary:before{content:none}',
      '.bt_toggleLabel{display:inline-flex;flex:none;padding:1px 5px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);font:600 12px/1.7 system-ui,sans-serif;color:var(--dsw-alias-label-primary)}.bt_toggleLabel>.bt_whenOpen{display:none}details[open]>summary>.bt_toggleLabel>.bt_whenOpen{display:inline}details[open]>summary>.bt_toggleLabel>.bt_whenClosed{display:none}',
      '.bt_errorGroup details>summary:hover,.bt_compact>summary:hover{border-color:var(--dsw-alias-state-error-primary)}.bt_errorGroup details>summary:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}',
      '.bt_detailBody{margin:0;padding:0}.bt_section{border-top:0;padding-top:4px}.bt_attempt{margin:8px 0;padding:0;border-left:0}',
      '.bt_depth{display:grid;gap:8px;min-width:0;margin:8px 0 8px 10px;padding:4px 0 4px 12px;border-left:2px solid var(--dsw-alias-state-error-primary)}.bt_errorGroup .bt_depth>.bt_body{margin:0;padding:0}.bt_attempt>.bt_depth{padding:4px 0 4px 12px}.bt_logPanel{margin-left:10px;border-left:2px solid var(--dsw-alias-state-error-primary)}',
      '.bt_heading{margin-bottom:5px}.bt_original{font-size:12px}.bt_toggleLabel[hidden]{display:none}',
      '.bt_earlierNode{border-left:0;padding-left:0}.bt_earlierNode>.bt_depth,.bt_earlierErrors>.bt_depth,.bt_earlierError>.bt_depth{border-left:0;margin-left:0;padding-left:0}',
      '.bt_earlierNode>summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-size:12px;color:var(--dsw-alias-label-secondary)}.bt_earlierNode>summary::-webkit-details-marker{display:none}.bt_earlierNode>summary:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}',
      '.bt_latestNode{border-left:0;padding-left:0}.bt_latestNode>.bt_depth{border-left:0;margin-left:0;padding-left:0}.bt_latestNode>summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;min-height:28px;font-size:12px}.bt_latestNode>summary::-webkit-details-marker{display:none}.bt_latestNode>summary:focus-visible{outline:2px solid var(--dsw-alias-state-error-primary);outline-offset:2px}.bt_latestLabel{color:var(--dsw-alias-state-error-primary);font-weight:600}',
      '.bt_failureTitle{font-size:17px;font-weight:700;line-height:1.5;color:var(--dsw-alias-state-error-primary)}',
      '.bt_detailPair{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:8px;min-width:0}.bt_detailPair>details{margin:0}.bt_detailPair .bt_depth{margin-left:0;padding-left:8px}',
      '.bt_errorGroup>.bt_network>.bt_body{margin-left:0}.bt_primary{font-size:15px;line-height:1.6}.bt_original{font-size:14px}',
      '.bt_history{padding-top:0;display:grid;gap:6px}.bt_history>.bt_attempt{margin:0}.bt_history .bt_attempt>.bt_network>.bt_body{margin-left:0}.bt_attempt>.bt_captureAdvice{display:flex;align-items:baseline;gap:4px 8px;padding:2px 0}',
      '@media(max-width:640px){.bt_errorGroup{grid-template-columns:minmax(0,1fr);padding-left:9px}.bt_detailPair{grid-template-columns:minmax(0,1fr)}}',
    ].join('')
    const text = (value) => value === undefined || value === null ? '' : String(value)
    const rawFailure = (failure) => [failure?.code ? `[${failure.code}]` : '', text(failure?.message)].filter(Boolean).join(' ')

    /** Native codes only; never infer a cause from the Harness category. */
    function nativeHeadline (detail) {
      if (!detail) return ''
      if (detail.kind === 'response') return [`HTTP ${detail.status ?? '?'}`, text(detail.statusText)].filter(Boolean).join(' ')
      const chain = []
      let error = detail.error
      for (let depth = 0; error && depth < 16; depth++, error = error.cause) chain.push(error)
      const coded = chain.filter((entry) => entry.code !== undefined && entry.code !== '')
      return rawFailure(coded.at(-1) ?? chain.at(-1)) || (detail.kind === 'stream' ? `HTTP ${detail.status ?? 200}` : '')
    }
    const knownCheck = (code) => Object.hasOwn(CODE_CHECKS, code) ? CODE_CHECKS[code] : undefined
    const httpCheck = (status) => HTTP_CHECKS[status] ?? (status >= 500 && status <= 599 ? 'server' : 'generic')
    function providerCheck (body) {
      try {
        const parsed = JSON.parse(body)
        const error = parsed?.error
        // Only structured, allowlisted provider codes; arbitrary response prose is not a diagnosis.
        for (const code of [error?.code, error?.type, parsed?.code, parsed?.type]) {
          if (typeof code === 'string' && knownCheck(code)) return knownCheck(code)
        }
      } catch { /* Truncated/non-JSON bodies stay raw evidence. */ }
      return undefined
    }
    function failureCheck (failure) {
      if (text(failure?.message) === 'Stream ended without finish_reason') return 'finishReason'
      const byCode = knownCheck(text(failure?.code))
      if (byCode) return byCode
      const message = text(failure?.message)
      const prefix = message.match(/^\s*\[?([A-Z][A-Z0-9_]+)\]?(?=\s|:|$)/)?.[1]
      if (prefix && knownCheck(prefix)) return knownCheck(prefix)
      const status = message.match(/^\s*(?:HTTP\s+)?([45]\d{2})(?=\s|:|$)/)?.[1]
      if (status) return httpCheck(Number(status))
      if (message === 'terminated') return 'stream'
      if (message === 'cannot get required service "tools" in inactive context') return 'tools'
      return 'generic'
    }
    function detailCheck (detail) {
      if (detail?.kind === 'response') return (!detail.bodyState || detail.bodyState === 'complete' ? providerCheck(detail.body) : undefined) ?? httpCheck(detail.status)
      let native
      for (let error = detail?.error, depth = 0; error && depth < 16; depth++, error = error.cause) {
        if (error.code) native = error.code
      }
      if (native) return knownCheck(text(native)) ?? 'generic'
      return detail?.kind === 'stream' ? 'stream' : failureCheck(detail?.error)
    }
    function adviceRow (key, t, className = 'bt_advice') {
      return h('div', { className }, h('span', { className: 'bt_title' }, t('ui.advice')),
        h('span', null, t(`check.${key}`)))
    }
    function captureText (item) {
      const detail = item?.detail ?? {}
      const lines = []
      if (detail.status !== undefined) lines.push([`HTTP ${detail.status}`, detail.statusText].filter(Boolean).join(' '))
      const endpoint = `${detail.host ?? ''}${detail.path ?? ''}`
      if (endpoint) lines.push(endpoint)
      for (const [key, value] of Object.entries(detail.headers ?? {})) lines.push(`${key}: ${value}`)
      let error = detail.error
      for (let depth = 0; error && depth < 16; depth++, error = error.cause) {
        lines.push([depth ? '←' : '', error.name, rawFailure(error)].filter(Boolean).join(' '))
        const fields = ['errno', 'syscall', 'address', 'port'].filter((key) => error[key] !== undefined)
        if (fields.length) lines.push(fields.map((key) => `${key}=${error[key]}`).join(' '))
      }
      if (detail.bytes !== undefined) lines.push(`bytes=${detail.bytes}`)
      if (detail.elapsedMs !== undefined) lines.push(`elapsedMs=${detail.elapsedMs}`)
      if (item?.lagMs !== undefined) lines.push(`lagMs=${item.lagMs}`)
      if (detail.body) lines.push('', text(detail.body))
      return lines.join('\n')
    }
    async function fetchJson (url, signal) {
      const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }
    function useEvidence (url, revision) {
      const [state, setState] = React.useState(null)
      const [refreshIndex, setRefreshIndex] = React.useState(0)
      const identity = JSON.stringify([url, revision, refreshIndex])
      const cache = React.useRef(null)
      React.useEffect(() => {
        if (!url) return undefined
        if (cache.current?.identity === identity) { setState(cache.current); return undefined }
        setState(null)
        let cancelled = false
        const controller = new AbortController()
        const publish = (value) => { if (!cancelled) setState({ ...value, identity }) }
        const timeout = setTimeout(() => { controller.abort(); publish({ error: 'request-timeout' }) }, 10000)
        Promise.resolve().then(() => {
          if (controller.signal.aborted) return undefined
          return fetchJson(url, controller.signal)
        }).then((data) => {
          if (!cancelled && !controller.signal.aborted) {
            cache.current = { data, identity }
            setState(cache.current)
          }
        }).catch((error) => { if (!controller.signal.aborted) publish({ error: text(error?.message ?? error) }) })
          .finally(() => clearTimeout(timeout))
        return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
      }, [url, revision, refreshIndex])
      return [state?.identity === identity ? state : null, () => setRefreshIndex((value) => value + 1)]
    }
    function CopyButton ({ value, label, t }) {
      const [status, setStatus] = React.useState('')
      const alive = React.useRef(true)
      React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
      const copy = async () => {
        setStatus('ui.copying')
        try {
          if (typeof navigator?.clipboard?.writeText !== 'function') throw new Error('clipboard unavailable')
          await navigator.clipboard.writeText(value)
          if (alive.current) setStatus('ui.copied')
        } catch { if (alive.current) setStatus('ui.copyFailed') }
      }
      return h('span', { className: 'bt_actions' },
        h('button', { type: 'button', className: 'bt_action bt_copy', disabled: !value || status === 'ui.copying', onClick: copy }, t(label)),
        status ? h('span', { className: 'bt_meta', role: 'status' }, t(status)) : null)
    }
    function disclosureBlock (props, summary, ...children) {
      return h('details', props, summary, h('div', { className: 'bt_depth' }, ...children))
    }
    function toggleLabel (t) {
      return h('span', { className: 'bt_toggleLabel' },
        h('span', { className: 'bt_whenClosed' }, '▶ ' + t('ui.open')),
        h('span', { className: 'bt_whenOpen' }, '▼ ' + t('ui.close')))
    }
    function RefreshButton ({ refresh, t }) {
      return refresh ? h('button', { type: 'button', className: 'bt_action bt_refresh', onClick: refresh }, t('ui.refresh')) : null
    }
    function capturePreview (detail) {
      const headline = nativeHeadline(detail)
      let message = ''
      if (detail?.kind === 'response' && !detail.protected && detail.bodyReason !== 'credential-protection') {
        message = text(detail.body)
        if (!detail.bodyState || detail.bodyState === 'complete') {
          try {
            const parsed = JSON.parse(message)
            const providerMessage = parsed?.error?.message ?? parsed?.message
            if (typeof providerMessage === 'string') message = providerMessage
          } catch { /* Non-JSON responses stay literal. */ }
        }
      }
      return failurePreview({ message: [headline, message].filter(Boolean).join(' · ') })
    }
    function captureDetails (item, t, unconfirmed = false) {
      return item?.detail ? disclosureBlock({ className: 'bt_networkDetails' },
        h('summary', { className: 'bt_meta' }, toggleLabel(t), t('ui.details')),
        unconfirmed ? h('div', { className: 'bt_meta' }, t('ui.unconfirmed')) : null,
        unconfirmed ? adviceRow(detailCheck(item.detail), t, 'bt_captureAdvice') : null,
        h('pre', { className: 'bt_raw' }, captureText(item))) : null
    }
    function captureBlock (item, index, t, unconfirmed = false, showFailure = false, details = true, inlineCopy = true, captureAdvice = true) {
      const preview = capturePreview(item?.detail)
      return h('div', { className: 'bt_capture', key: `capture-${index}` },
        unconfirmed ? h('span', { className: 'bt_meta' }, t('ui.unconfirmed')) : null,
        showFailure && item?.failure ? h('span', { className: 'bt_meta' }, rawFailure(item.failure)) : null,
        preview.value ? h('code', { className: 'bt_primary' }, preview.value) : null,
        inlineCopy ? h(CopyButton, { value: captureText(item), label: 'ui.copyCapture', t }) : null,
        details ? captureDetails(item, t) : null,
        item?.detail?.kind === 'response' && (item.detail.bodyReason === 'credential-protection' || item.detail.bodyState !== 'complete' && item.detail.bodyState !== undefined || !item.detail.body) ? h('span', { className: 'bt_meta' },
          t(item.detail.bodyReason === 'credential-protection' ? 'ui.authBodyProtected' : item.detail.bodyState === 'pending' ? 'ui.bodyPending' : item.detail.bodyState === 'truncated' ? 'ui.bodyTruncated'
            : item.detail.bodyState === 'unreadable' || item.detail.bodyState === 'error' ? 'ui.bodyUnreadable'
              : 'ui.bodyEmpty')) : null,
        unconfirmed && captureAdvice ? adviceRow(detailCheck(item?.detail), t, 'bt_captureAdvice') : null)
    }
    function networkSection (selection, state, refresh, t, details = true) {
      return h('section', { className: 'bt_section bt_network' },
        h('h4', { className: 'bt_heading' }, t('ui.network')),
        evidenceBody({ state, ...selection, refresh, details }, t))
    }
    function evidenceBody ({ state, failure, chosen, unconfirmed, candidates = [], extra, refresh, details = true, inlineCopy = true, captureAdvice = true }, t) {
      return h('div', { className: 'bt_body' },
        rawFailure(failure) ? h('pre', { className: 'bt_raw' }, rawFailure(failure)) : null,
        chosen?.detail ? captureBlock(chosen, 0, t, unconfirmed, false, details, inlineCopy, captureAdvice) : null,
        candidates.length ? disclosureBlock( null,
          h('summary', { className: 'bt_meta' }, toggleLabel(t), t('ui.candidates', { count: candidates.length })),
          ...candidates.map((item, index) => disclosureBlock( { className: 'bt_attempt', key: item.attemptId ?? index },
            h('summary', { className: 'bt_meta' }, toggleLabel(t), t('ui.record', { index: index + 1 }), failurePreview(item.failure).value),
            captureBlock(item, index, t, true, true)))) : null,
        !state ? h('span', { className: 'bt_meta' }, t('ui.loading'))
          : state.error ? h('span', { className: 'bt_meta' }, t('ui.loadFailed', { message: diagnosticProblem(state.error, t) }))
            : !chosen?.detail && !candidates.length && !extra ? h('span', { className: 'bt_meta' }, t(state.data?.capture?.installed === false ? state.data.capture.reason === 'config-disabled' ? 'ui.disabled' : 'ui.captureUnavailable' : 'ui.empty')) : null,
        h(RefreshButton, { refresh, t }),
        extra ?? null)
    }
    function selectStep (state, step, failure, row = {}, sessionId) {
      const items = (Array.isArray(state?.data?.items) ? state.data.items : []).filter((item) => item?.step === step)
      const exact = items.filter((item) => text(item.failure?.message) === text(failure.message) && text(item.failure?.code) === text(failure.code))
      let matches = exact
      let timeBased = false
      const attemptId = row.attemptId ?? failure.attemptId
      const kind = row.retry !== undefined ? 'retry' : 'terminal'
      const eventMatches = exact.filter((item) => validSeq(row.seq) && item.event?.seq === row.seq
        && item.event.kind === kind && item.event.turn === row.turn && item.event.step === step)
      const eventBased = eventMatches.length === 1
      if (attemptId) matches = exact.filter((item) => item.attemptId === attemptId && (!item.event || eventMatches.includes(item)))
      else if (eventBased) matches = eventMatches
      else if (exact.some((item) => Object.hasOwn(item, 'event')) && validSeq(row.seq)) matches = []
      else if (exact.length > 1 && Number.isFinite(row.time)) {
        timeBased = true
        const near = exact.filter((item) => Number.isFinite(item.failureTime) && Math.abs(item.failureTime - row.time) <= 10)
        const distance = near.length ? Math.min(...near.map((item) => Math.abs(item.failureTime - row.time))) : Infinity
        matches = near.filter((item) => Math.abs(item.failureTime - row.time) === distance)
      }
      const chosen = matches.length === 1 ? matches[0] : !exact.length && items.length === 1 ? items[0] : undefined
      const context = chosen?.context ?? chosen?.detail?.context
      const confirmed = !timeBased && !!chosen && matches.length === 1 && matches[0] === chosen && chosen.provenance === 'request-context'
        && (!Object.hasOwn(chosen, 'event') || eventBased)
        && chosen.approximate !== true && context?.sessionId === sessionId
        && typeof chosen.attemptId === 'string' && chosen.attemptId !== '' && context.attemptId === chosen.attemptId
        && typeof context.provider === 'string' && context.provider !== ''
        && (!row.provider || context.provider === row.provider)
        && (!chosen.detail?.context || chosen.detail.context.attemptId === chosen.attemptId
          && chosen.detail.context.sessionId === sessionId && chosen.detail.context.provider === context.provider)
        && (!attemptId || context.attemptId === attemptId)
      return { chosen, unconfirmed: !!chosen && !confirmed, candidates: chosen ? [] : items }
    }
    function requestUrl (sessionId, turn, kind) {
      if (!sessionId || !Number.isSafeInteger(turn)) return ''
      return `api/better-tips/details?${new URLSearchParams({ sessionId, turn: String(turn), source: 'row', kind })}`
    }
    function logCoordinate (node) {
      const data = node?.data ?? {}
      const kind = node?.kind ?? data.kind
      if (kind === 'model-retry' || data.current) {
        return { kind: 'retry', seq: data.current?.seq, data: data.current ?? {} }
      }
      if (kind === 'manual-compaction' || data.command) {
        return { kind: 'command', seq: data.command?.seq, data: data.command ?? {} }
      }
      if (kind === KIND || data.compactionId) {
        return { kind: 'compaction', seq: data.endSeq ?? node?.anchorSeq, data }
      }
      return { kind: 'terminal', seq: data.seq ?? node?.anchorSeq, data }
    }
    const validSeq = (seq) => Number.isSafeInteger(seq) && seq >= 0
    function matchesLog (event, coordinate) {
      const actual = event?.data ?? {}
      const expected = coordinate.data
      const same = (key) => expected[key] === undefined || actual[key] === expected[key]
      if (coordinate.kind === 'retry') return event.type === 'llm/retry' && ['turn', 'step', 'retryId', 'retry'].every(same)
      if (coordinate.kind === 'command') return event.type === 'command/done' && expected.commandId && actual.commandId === expected.commandId
      if (coordinate.kind === 'compaction') return event.type === 'compaction/end' && expected.compactionId && actual.compactionId === expected.compactionId
      return event.type === 'turn/end' && same('turn')
    }
    function logWindow (binding, coordinate) {
      const events = (binding.eventSource.getSnapshot()?.entries ?? [])
        .filter((entry) => entry.type === 'event').map((entry) => entry.event)
      let matches
      if (coordinate.kind === 'command') {
        matches = events.filter((event) => event.seq >= coordinate.seq && matchesLog(event, coordinate))
      } else {
        matches = events.filter((event) => event.seq === coordinate.seq && matchesLog(event, coordinate))
      }
      if (matches.length !== 1) return { missing: true }
      const target = matches[0]
      const index = events.indexOf(target)
      return { target, events: events.slice(Math.max(0, index - 3), index + 4) }
    }
    function safeLogValue (value) {
      if (typeof value === 'string') return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
        .replace(/sk-[A-Za-z0-9._-]{8,}/gi, 'sk-[redacted]')
        .replace(/\b(?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi, '[credential redacted]')
      if (Array.isArray(value)) return value.map(safeLogValue)
      if (!value || typeof value !== 'object') return value
      const compactionError = value.type === 'compaction/end' && typeof value.data?.error === 'string'
        ? safeCompactionFailure(value.data.error) : undefined
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        value.type === 'compaction/end' && key === 'data' && typeof item?.error === 'string'
          ? safeLogValue({ ...item, error: compactionError?.message || '[compaction diagnostic hidden]' })
          : value.code === 'AUTH' && (key === 'message' || key === 'body') ? '[AUTH diagnostic hidden]' : safeLogValue(item)]))
    }
    const reportTime = (value, t) => {
      if (!Number.isFinite(value) || Math.abs(value) > 8640000000000000) return t('report.missing')
      return new Date(value).toLocaleString(t('format.locale'), { hour12: false }) + ' (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')'
    }
    const reportExcerpt = (value, limit, t) => {
      const clean = text(value).replace(/\s+/g, ' ').trim()
      const chars = Array.from(clean)
      return chars.length > limit ? chars.slice(0, limit).join('') + '… [' + t('report.truncated') + ']' : clean
    }
    /** A short support message, not a dump of every diagnostic field. Full evidence stays in the UI. */
    function troubleshootingReport ({ failure, row = {}, selection = {}, runtime, title, error, capture, record }, t) {
      const selected = selection.chosen
      const detail = selected?.detail
      const protectedAuth = failure?.code === 'AUTH' || selected?.failure?.code === 'AUTH' || selected?.thrown?.code === 'AUTH' || detail?.protected === true
      const missing = t('report.missing')
      let native = protectedAuth ? '[AUTH] ' + t('report.protected') : rawFailure(failure) || missing
      if (!protectedAuth) {
        const wrapper = text(failure?.message).match(/^\s*(?:HTTP\s+)?([45]\d{2}):\s*(\{[\s\S]*\})\s*$/)
        if (wrapper) {
          try {
            const parsed = JSON.parse(wrapper[2])
            const message = parsed?.error?.message ?? parsed?.message
            if (typeof message === 'string') native = [failure?.code ? '[' + failure.code + ']' : '', 'HTTP ' + wrapper[1], message].filter(Boolean).join(' ')
          } catch {}
        }
      }
      const headline = protectedAuth ? '[AUTH]' : failurePreview(failure).value || title
      const lines = [t('report.intro', {
        time: reportTime(row.time ?? row.endedAt, t),
        provider: row.provider || record?.provider || selected?.context?.provider || missing,
        model: record?.model || selected?.context?.model || missing,
        error: reportExcerpt(headline, 100, t).replace(/[.。…]+$/, ''),
      }), t('report.version') + ': DSH ' + (runtime?.dshVersion || missing) + ' · Better Tips ' + (runtime?.pluginVersion || missing)]
      const plugins = Array.isArray(runtime?.enabledPlugins) ? runtime.enabledPlugins : []
      const pluginNames = [...new Set(plugins.filter((plugin) => typeof plugin?.name === 'string' && plugin.name.trim())
        .map((plugin) => plugin.name + '@' + (typeof plugin.version === 'string' && plugin.version.trim() ? plugin.version : missing)))].sort()
      const inventory = runtime?.pluginsStatus === 'complete' ? pluginNames.join(t('format.list')) || t('report.pluginsNone')
        : (pluginNames.length ? pluginNames.join(t('format.list')) + ' · ' : '') + t(runtime?.pluginsStatus === 'partial' ? 'report.pluginsPartial' : 'report.pluginsUnavailable')
      lines.push(t('report.plugins') + ': ' + inventory, '', t('report.native') + ': ' + reportExcerpt(native, 600, t))
      if (record || selection.unconfirmed) lines.push('', t('report.unconfirmed'))
      if (record) lines.push(t('report.summaryError') + ': ' +
        (protectedAuth ? t('report.protected') : reportExcerpt(rawFailure(selected?.failure ?? selected?.thrown) || (selected?.finishReason ? 'finish=' + selected.finishReason : missing), 300, t)))
      if (!detail) lines.push(t('report.underlying') + ': ' +
        (error ? t('report.noEvidence') + ' · ' + t('report.readFailed') + ': ' + reportExcerpt(diagnosticProblem(error, t), 80, t)
          : capture?.installed === false ? t(capture.reason === 'config-disabled' ? 'ui.disabled' : 'ui.captureUnavailable')
            : t('report.noEvidence') + (selection.candidates?.length ? ' · ' + t('report.ambiguous') : '')))
      else {
        const safeDetail = protectedAuth ? { kind: detail.kind, status: detail.status } : detail
        lines.push(t('report.underlying') + ': ' + reportExcerpt(nativeHeadline(safeDetail) || missing, 300, t))
        const headers = detail.headers ?? {}
        const requestId = failure?.requestId || headers['x-request-id'] || headers['request-id'] || headers['x-correlation-id'] || headers['cf-ray']
        if (requestId) lines.push('request-id: ' + reportExcerpt(requestId, 160, t))
        if (detail.host || detail.path) lines.push('API: ' + (detail.host || '') + (detail.path || ''))
        if (!protectedAuth && detail.body) {
          let body = detail.body
          try { const parsed = JSON.parse(body); body = parsed?.error?.message ?? parsed?.message ?? body } catch {}
          const response = reportExcerpt(body, 300, t)
          // Often pi-ai already includes the same provider message; do not repeat it.
          if (response && !native.includes(text(body))) lines.push(t('report.response') + ': ' + response)
        }
        if (protectedAuth) lines.push(t('report.protected'))
        else if (detail.bodyState && detail.bodyState !== 'complete') lines.push(t('report.responseState') + ': ' + detail.bodyState)
      }
      const params = []
      if (Number.isFinite(detail?.elapsedMs)) params.push(t('report.timing') + ' ' + detail.elapsedMs + ' ms')
      if (Number.isFinite(row.delayMs)) params.push(t('report.wait') + ' ' + row.delayMs + ' ms')
      if (row.retry !== undefined) params.push(t('report.retry') + ' ' + row.retry + '/' + (row.maxRetries ?? '?'))
      const after = failure?.providerRetryAfterMs ?? detail?.headers?.['retry-after']
      if (after !== undefined) params.push('Retry-After ' + after + (failure?.providerRetryAfterMs !== undefined ? ' ms' : ''))
      if (params.length) lines.push(params.join(t('format.params')))
      lines.push('', t('report.help'))
      return safeLogValue(lines.join('\n'))
    }
    function ReportButton ({ url, state, select, failure, row, title, record, t }) {
      const [status, setStatus] = React.useState('')
      const [report, setReport] = React.useState('')
      const alive = React.useRef(true)
      const operation = React.useRef(null)
      const language = t('format.locale')
      React.useEffect(() => {
        alive.current = true
        setStatus('')
        setReport('')
        return () => { alive.current = false; operation.current?.abort(); operation.current = null }
      }, [language])
      const copy = async () => {
        if (operation.current) return
        const controller = new AbortController()
        operation.current = controller
        setStatus('report.building')
        const timer = setTimeout(() => controller.abort(), 10000)
        let data = state?.data
        let problem = state?.error
        try {
          if (!data && url) {
            try { data = await fetchJson(url, controller.signal); problem = undefined }
            catch (error) { problem = controller.signal.aborted ? t('ui.requestTimeout') : diagnosticProblem(error?.message ?? error, t) }
          }
          if (!alive.current || operation.current !== controller) return
          let environment
          try { environment = await fetchJson('api/better-tips/environment', controller.signal) }
          catch { environment = undefined }
          if (!alive.current || operation.current !== controller) return
          const selected = select?.({ data }) ?? {}
          const runtime = { ...data?.runtime, ...environment?.runtime,
            enabledPlugins: environment?.runtime?.enabledPlugins,
            pluginsStatus: Array.isArray(environment?.runtime?.enabledPlugins) ? environment.runtime.pluginsStatus ?? 'unavailable' : 'unavailable' }
          const value = troubleshootingReport({ failure, row, title, runtime,
            selection: selected, record: selected.record ?? record, error: problem, capture: data?.capture }, t)
          setReport(value)
          const partial = !runtime?.dshVersion || runtime.pluginsStatus !== 'complete' || !selected.chosen?.detail || !!problem
          try {
            if (typeof navigator?.clipboard?.writeText !== 'function') throw new Error('clipboard unavailable')
            await navigator.clipboard.writeText(value)
            if (alive.current && operation.current === controller) setStatus(partial ? 'report.partial' : 'ui.copied')
          } catch { if (alive.current && operation.current === controller) setStatus('report.fallback') }
        } finally { clearTimeout(timer); if (operation.current === controller) operation.current = null }
      }
      return h('div', { className: 'bt_report' },
        h('div', { className: 'bt_actions' },
          h('button', { type: 'button', className: 'bt_action bt_reportCopy', title: t('report.notice'), disabled: status === 'report.building', onClick: copy }, t('report.copy')),
          status ? h('span', { className: 'bt_meta', role: 'status' }, t(status)) : null),
        report && status === 'report.fallback' ? h('div', { className: 'bt_reportText' },
          h('pre', { className: 'bt_raw', tabIndex: 0 }, report)) : null)
    }
    function RawLog ({ sessionId, node, t, capture, unconfirmed }) {
      const [open, setOpen] = React.useState(false)
      const [state, setState] = React.useState(null)
      const [readIndex, setReadIndex] = React.useState(0)
      const coordinate = logCoordinate(node)
      const identity = JSON.stringify([sessionId, coordinate])
      React.useEffect(() => {
        if (!open) return undefined
        let cancelled = false
        let release
        setState(null)
        const fail = (error) => { if (!cancelled) setState({ error: text(error?.message ?? error) }) }
        try {
          const binding = sessionService?.binding(sessionId)
          if (!binding?.eventSource || typeof binding.session?.loadThrough !== 'function') {
            setState({ unavailable: true })
            return undefined
          }
          const readCurrent = () => {
            if (cancelled) return
            try { setState(logWindow(binding, coordinate)) } catch (error) { fail(error) }
          }
          release = binding.eventSource.subscribe(readCurrent)
          Promise.resolve(binding.session.loadThrough(coordinate.seq)).then(readCurrent, fail)
        } catch (error) { fail(error) }
        return () => { cancelled = true; release?.() }
      }, [open, identity, readIndex])
      const target = state?.target
      const metadataUrl = open && target ? `api/better-tips/log-metadata?${new URLSearchParams({ sessionId, seq: String(target.seq) })}` : ''
      const [metadata, refreshMetadata] = useEvidence(metadataUrl, target?.seq)
      return h('div', { className: open ? 'bt_log bt_logOpen' : 'bt_log' },
        h('button', { type: 'button', className: 'bt_logButton', disabled: !sessionId || !validSeq(coordinate.seq),
          title: validSeq(coordinate.seq) ? t('log.title') : t('log.noCoordinate'), 'aria-expanded': open,
          onClick: () => setOpen((value) => !value) }, t(open ? 'log.close' : 'log.open')),
        open ? h('section', { className: 'bt_logPanel', 'aria-label': t('log.title') },
          h('div', { className: 'bt_logHeading' }, `${t('log.title')} · ${sessionId}`),
          h('div', { className: 'bt_meta' }, t('log.protected')),
          h('div', { className: 'bt_actions' },
            target ? h(CopyButton, { value: `${sessionId} · seq=${target.seq}`, label: 'ui.copyCoordinate', t }) : null,
            h(RefreshButton, { refresh: () => { setReadIndex((value) => value + 1); refreshMetadata() }, t })),
          !state ? h('div', { className: 'bt_meta' }, t('log.loading'))
            : state.error ? h('div', { className: 'bt_meta', role: 'status' }, t('log.failed', { message: state.error }))
              : state.unavailable ? h('div', { className: 'bt_meta', role: 'status' }, t('log.unavailable'))
                : state.missing ? h('div', { className: 'bt_meta', role: 'status' }, t('log.missing')) : null,
          target ? h('div', { className: 'bt_logMetadata' },
            !metadata ? h('div', { className: 'bt_meta' }, t('log.metadataLoading'))
              : metadata.error ? h('div', { className: 'bt_meta' }, `${t('log.metadataFailed')} · ${diagnosticProblem(metadata.error, t)}`)
                : h(React.Fragment, null,
                  h('div', { className: 'bt_logHeading' }, t('log.file')),
                  h('pre', { className: 'bt_raw bt_logPath' }, metadata.data?.log?.status === 'found' ? metadata.data.log.path : t('log.pathMissing')),
                  metadata.data?.log?.status === 'found' ? h(CopyButton, { value: metadata.data.log.path, label: 'ui.copyPath', t }) : null,
                  h('div', { className: 'bt_meta' }, `seq=${target.seq} · ${t('log.logical')}`),
                  ...(metadata.data?.sources?.length ? [h('div', { className: 'bt_meta', key: 'source-title' }, t('log.sourceMatch')),
                    ...metadata.data.sources.map((source, index) => h('div', { className: 'bt_logSource', key: index },
                      h('div', { className: 'bt_logHeading' }, `${t(source.role === 'classifier' ? 'log.classifier' : 'log.producer')} · ${source.function}`),
                      h('pre', { className: 'bt_raw' }, `${source.path}:${source.line}`)))]
                    : [h('div', { className: 'bt_meta', key: 'unknown-source' }, t('log.sourceUnknown'))]))) : null,
          target ? h('div', { className: 'bt_logTarget', 'data-seq': target.seq },
            h('div', { className: 'bt_logHeading' }, `${t('log.target')} · #${target.seq} · ${target.type}`),
            h('pre', { className: 'bt_raw bt_logJson' }, JSON.stringify(safeLogValue(target), null, 2))) : null,
          target ? disclosureBlock( { className: 'bt_logContext' }, h('summary', { className: 'bt_meta' }, toggleLabel(t), t('log.context')),
            h('div', { className: 'bt_meta' }, t('log.contextWarning')),
            ...state.events.filter((event) => event !== target).map((event) => disclosureBlock( { key: event.seq },
              h('summary', { className: 'bt_meta' }, toggleLabel(t), `#${event.seq} · ${event.type}`),
              h('pre', { className: 'bt_raw' }, JSON.stringify(safeLogValue(event), null, 2))))) : null,
          capture?.detail ? disclosureBlock( null,
            h('summary', { className: 'bt_meta' }, toggleLabel(t), `${t('log.capture')}${capture.detail.id !== undefined ? ` · #${capture.detail.id}` : ''}${unconfirmed ? ` · ${t('ui.unconfirmed')}` : ''}`),
            h('pre', { className: 'bt_raw' }, JSON.stringify(safeLogValue(capture.detail), null, 2))) : null,
          h('div', { className: 'bt_meta' }, t('log.notWire'))) : null)
    }
    /** Literal excerpt, not a diagnosis. Complete text remains in the disclosure. */
    function failurePreview (failure) {
      const original = rawFailure(failure)
      let excerpt = original
      const message = text(failure?.message)
      const structured = message.match(/^\s*(?:HTTP\s+)?([45]\d{2}):\s*(\{[\s\S]*\})\s*$/)
      if (structured) {
        try {
          const body = JSON.parse(structured[2])
          const providerMessage = body?.error?.message ?? body?.message
          if (typeof providerMessage === 'string') excerpt = [failure?.code ? `[${failure.code}]` : '', `HTTP ${structured[1]}`, providerMessage].filter(Boolean).join(' ')
        } catch { /* Unparseable source stays a literal excerpt. */ }
      }
      const first = excerpt.split(/\r?\n/, 1)[0]
      const points = Array.from(first)
      const shortened = excerpt !== original || points.length > 120 || first.length < original.length
      return { value: points.slice(0, 120).join('') + (points.length > 120 || first.length < excerpt.length ? '…' : ''), shortened }
    }
    function originalControls (failure, t) {
      return h('div', { className: 'bt_originalControls' },
        h('pre', { className: 'bt_original' }, rawFailure(failure)),
        h(CopyButton, { value: rawFailure(failure), label: 'ui.copyError', t }))
    }
    // A recorder object without an error/status/body is not useful evidence.
    const hasCapture = (selection, allowUnconfirmed = false) => {
      if (selection?.unconfirmed && !allowUnconfirmed) return false
      const detail = selection?.chosen?.detail
      if (!detail || typeof detail !== 'object') return false
      const httpStatus = Number.isInteger(detail.status) && detail.status >= 100 && detail.status <= 599
      if (detail.kind === 'response') return httpStatus || (!detail.protected && detail.bodyReason !== 'credential-protection' && text(detail.body).trim() !== '')
      // A successful HTTP status alone is not a stream failure.
      if (!['network', 'undici', 'stream'].includes(detail.kind)) return false
      for (let error = detail.error, depth = 0; error && depth < 16; depth++, error = error.cause) {
        if (text(error.code).trim() || text(error.message).trim()) return true
      }
      return false
    }
    function nativeFallbackSection (failure, t) {
      return h('section', { className: 'bt_section bt_nativeFallback' },
        h('h4', { className: 'bt_heading' }, t('ui.original')),
        originalControls(failure, t))
    }
    function errorRow (title, failure, state, selection, t, log, disclosure = {}) {
      const check = selection.check ?? (text(failure?.message) === 'Stream ended without finish_reason' ? 'finishReason'
        : selection.chosen?.detail && !selection.unconfirmed ? detailCheck(selection.chosen.detail) : failureCheck(failure))
      const nativeFallback = !hasCapture(selection, disclosure.fallbackNative === true)
      return h('div', { className: 'bt_errorGroup' },
        h('div', { className: 'bt_failureTitle' }, title),
        disclosure.historyOnly ? null : nativeFallback ? nativeFallbackSection(failure, t)
          : networkSection(selection, state, null, t, false),
        disclosure.nativeStatus ?? null,
        disclosure.historyOnly ? null : failure?.code === 'AUTH' && !failure.message ? h('div', { className: 'bt_protected' }, t('ui.authProtected')) : adviceRow(check, t),
        disclosure.historyOnly ? null : disclosure.report ?? null,
        disclosure.historyOnly ? disclosure.history : h('div', { className: 'bt_detailPair' },
          nativeFallback ? null : captureDetails(selection.chosen, t),
          disclosureBlock({ className: 'bt_error bt_disclosure', open: disclosure.open, onToggle: disclosure.onToggle },
            h('summary', null, toggleLabel(t), h('span', { className: 'bt_title' }, t(nativeFallback ? 'ui.logSection' : 'ui.original')), disclosure.countLabel || null),
            h('div', { className: 'bt_body bt_detailBody' },
              nativeFallback ? disclosure.fallbackNative ? null : networkSection(selection, state, null, t) : originalControls(failure, t),
              disclosure.history ?? null,
              log ? h('section', { className: 'bt_section' },
                h('h4', { className: 'bt_heading' }, t('ui.logSection')),
                h(RawLog, { ...log, key: JSON.stringify([log.sessionId, logCoordinate(log.node)]), t, capture: selection.chosen, unconfirmed: selection.unconfirmed })) : null))),
        !disclosure.historyOnly ? h(RefreshButton, { refresh: log?.refresh, t }) : null)
    }
    function ErrorCard ({ title, failure, sessionId, node, url, revision, select, history, countLabel, historyOnly, reportFailure, reportRow, t }) {
      const [open, setOpen] = React.useState(false)
      const [state, refresh] = useEvidence(url, revision)
      const selection = select(state)
      return errorRow(title, failure, state, selection, t, { sessionId, node, refresh }, {
        open, onToggle: (event) => { if (!event.target || event.target === event.currentTarget) setOpen(event.currentTarget.open) },
        countLabel: countLabel?.(state), history: history?.(state, refresh), historyOnly, overview: selection.check === 'mixed',
        report: h(ReportButton, { key: JSON.stringify([sessionId, logCoordinate(node), revision]), url, state, select,
          failure: reportFailure ?? failure, row: reportRow ?? node?.data, title, t }),
      })
    }
    function TurnErrorRow ({ node, sessionId, t = (key) => key }) {
      const data = node?.data ?? {}
      const failure = { message: data.message, code: data.code, status: data.status,
        requestId: data.requestId, providerRetryAfterMs: data.providerRetryAfterMs }
      if (!node) return null
      return h(ErrorCard, { title: t(data.code === 'INTERRUPTED' || data.code === 'ACCOUNT_SIGNED_OUT' ? 'ui.stopped' : 'ui.error'),
        failure, sessionId, node, t, url: requestUrl(sessionId, data.turn, 'terminal'), revision: rawFailure(failure),
        select: (state) => selectStep(state, data.step, failure, { ...data, seq: data.seq ?? node.anchorSeq }, sessionId) })
    }
    function retryTitle (current, t) {
      const label = current.retryState === 'cancelled' ? 'ui.cancelled'
        : current.retryState === 'started' ? 'ui.retried' : current.retryState === 'scheduled' ? 'ui.retry' : 'ui.scheduled'
      const maximum = current.mode === 'always' ? '∞' : current.maxRetries ?? '?'
      const delay = Number.isFinite(current.delayMs) ? ' · ' + t('ui.wait', { ms: Math.round(current.delayMs) }) : ''
      return t(label) + ' ' + current.retry + '/' + maximum + delay
    }
    function isErrorNode (node) {
      return node?.visibility !== 'hidden' && (node?.kind === 'turn-error' || node?.kind === 'model-retry' || node?.kind === KIND
        || node?.kind === 'manual-compaction' && node.data?.command?.outcome?.kind === 'error')
    }
    function followingError (snapshot, node) {
      const order = snapshot?.order
      const index = order?.indexOf(node?.key) ?? -1
      if (index < 0 || !snapshot?.nodes?.get) return ''
      let latest = ''
      for (let at = index + 1; at < order.length; at++) {
        const next = snapshot.nodes.get(order[at])
        if (!next) return latest
        if (isErrorNode(next)) latest = next.key
      }
      return latest
    }
    function ErrorSequenceRow ({ component, useChat, node, t, ...props }) {
      const successor = typeof useChat === 'function' ? useChat((snapshot) => followingError(snapshot, node)) : ''
      const contentIdentity = JSON.stringify([props.sessionId, node?.key, node?.id, logCoordinate(node), node?.data?.message, node?.data?.endedAt])
      const identity = JSON.stringify([contentIdentity, successor])
      const [choice, setChoice] = React.useState(null)
      const open = choice?.identity === identity ? choice.open : !successor
      const content = () => h(component, { ...props, node, t, key: contentIdentity })
      if (!isErrorNode(node)) return content()
      return disclosureBlock({ className: `${successor ? 'bt_earlierNode' : 'bt_latestNode'} bt_errorGroup`, open,
        onToggle: (event) => { if (!event.target || event.target === event.currentTarget) setChoice({ identity, open: event.currentTarget.open }) } },
        h('summary', null, toggleLabel(t), h('span', { className: successor ? 'bt_earlierLabel' : 'bt_latestLabel' }, t(successor ? 'ui.earlierBlock' : 'ui.latestBlock'))),
        open ? content() : null)
    }
    function earlierErrors (blocks, t) {
      if (blocks.length < 2) return blocks
      return [disclosureBlock({ className: 'bt_earlierErrors', key: 'earlier:' + blocks.at(-1).props.key },
        h('summary', null, toggleLabel(t), t('ui.earlierErrors', { count: blocks.length - 1 })),
        ...blocks.slice(0, -1).map((block, index) => disclosureBlock({ className: 'bt_earlierError', key: block.props.key },
          h('summary', null, toggleLabel(t), t('ui.record', { index: index + 1 })), block))), blocks.at(-1)]
    }
    function retryHistory (attempts, state, sessionId, node, t, refresh) {
      const blocks = attempts.map((attempt, index) => {
        const failure = attempt.failure ?? {}
        const selection = selectStep(state, attempt.step, failure, attempt, sessionId)
        const attemptNode = { ...node, kind: 'model-retry', data: { current: attempt } }
        const check = text(failure.message) === 'Stream ended without finish_reason' ? 'finishReason'
          : selection.chosen?.detail && !selection.unconfirmed ? detailCheck(selection.chosen.detail) : failureCheck(failure)
        const nativeFallback = !hasCapture(selection)
        return h('div', { className: 'bt_attempt', key: attempt.seq ?? attempt.attemptId ?? index },
          index < attempts.length - 1 ? h('div', { className: 'bt_heading' }, retryTitle(attempt, t)) : null,
          nativeFallback ? nativeFallbackSection(failure, t)
            : networkSection({ ...selection, inlineCopy: false, captureAdvice: false }, state, null, t, false),
          failure.code === 'AUTH' && !failure.message ? h('div', { className: 'bt_meta' }, t('ui.authProtected')) : adviceRow(check, t, index === attempts.length - 1 ? 'bt_captureAdvice bt_advice' : 'bt_captureAdvice'),
          !nativeFallback ? h(CopyButton, { value: captureText(selection.chosen), label: 'ui.copyCapture', t }) : null,
          h(ReportButton, { key: JSON.stringify([sessionId, attempt.seq, attempt.attemptId]),
            url: requestUrl(sessionId, attempt.turn, 'retry'), state,
            select: (fresh) => selectStep(fresh, attempt.step, failure, attempt, sessionId),
            failure, row: attempt, title: retryTitle(attempt, t), t }),
          h('div', { className: 'bt_detailPair' },
            nativeFallback ? null : captureDetails(selection.chosen, t, selection.unconfirmed),
            disclosureBlock({ className: 'bt_attemptNative' },
              h('summary', null, toggleLabel(t), t(nativeFallback ? 'ui.logSection' : 'ui.original'), validSeq(attempt.seq) ? ' · seq=' + attempt.seq : ''),
              nativeFallback ? networkSection(selection, state, null, t) : originalControls(failure, t),
              h(RawLog, { key: JSON.stringify([sessionId, logCoordinate(attemptNode)]), sessionId, node: attemptNode, t, capture: selection.chosen, unconfirmed: selection.unconfirmed }))))
      })
      const grouped = earlierErrors(blocks, t)
      return h('section', { className: 'bt_section bt_history' },
        ...grouped.toReversed(), h(RefreshButton, { refresh, t }))
    }
    function ModelRetryRow ({ node, sessionId, t = (key) => key }) {
      const current = node?.data?.current ?? {}
      const failure = current.failure ?? {}
      if (current.retry === undefined) return null
      // Native node.attempts is producer-correlated durable history, not the volatile capture cache.
      const attempts = node.data.attempts?.length ? node.data.attempts : [current]
      return h(ErrorCard, { title: retryTitle(current, t), failure, sessionId, node, t, historyOnly: true,
        url: requestUrl(sessionId, current.turn, 'retry'), revision: JSON.stringify([node.id, attempts.length, current.seq, current.retry, current.retryState, failure]),
        select: (state) => selectStep(state, current.step, failure, current, sessionId),
        history: (state, refresh) => retryHistory(attempts, state, sessionId, node, t, refresh) })
    }
    function compactionUrl (sessionId) {
      return sessionId ? `api/better-tips/compaction?${new URLSearchParams({ sessionId, source: 'compaction-row' })}` : ''
    }
    /** Timing is correlation, not proof of request identity. */
    function selectCompaction (state, { startAt, endAt, status }) {
      let best
      let distance = Infinity
      for (const record of state?.data?.records ?? []) {
        if (record.status !== status && !(status === 'error' && ['thrown', 'max-tokens', 'incomplete'].includes(record.status))) continue
        const start = record.startedAt
        const end = record.endedAt ?? start
        if (Number.isFinite(startAt) && start < startAt - 5000) continue
        const delta = Number.isFinite(endAt) ? Math.abs(end - endAt) : Math.abs(start - startAt)
        const window = Number.isFinite(endAt) ? 120000 : 600000
        if (Number.isFinite(delta) && delta <= window && delta < distance) { best = record; distance = delta }
      }
      return best
    }
    function compactionExtra (record, t) {
      if (!record) return null
      const facts = [record.provider, record.model, Number.isFinite(record.durationMs) ? record.durationMs + ' ms' : ''].filter(Boolean)
      if (record.usage) facts.push(t('compact.usage') + ': ' + JSON.stringify(record.usage))
      if (record.delays?.length) facts.push('retryDelayMs=' + record.delays.join(','))
      return h('section', { className: 'bt_section bt_compactionHistory' },
        h('h4', { className: 'bt_heading' }, t('ui.attempts', { count: record.attempts?.length ?? 0 })),
        h('div', { className: 'bt_meta' }, t('ui.timingMatch')),
        h('div', { className: 'bt_meta' }, facts.join(' · ')),
        ...earlierErrors((record.attempts ?? []).map((attempt, index) => {
          const failure = attempt.failure ?? attempt.thrown
          return h('div', { className: 'bt_attempt', key: attempt.attemptId ?? record.id + ':' + (attempt.index ?? index) },
            h('h4', { className: 'bt_heading' }, t('compact.attempt', { index: attempt.index ?? index + 1 }) + (attempt.finishReason ? ' · finish=' + attempt.finishReason : '')),
            attempt.detail ? networkSection({ chosen: attempt, unconfirmed: true }, { data: {} }, null, t, false) : h('span', { className: 'bt_meta' }, t('ui.empty')),
            h('div', { className: 'bt_detailPair' },
              captureDetails(attempt, t),
              failure ? disclosureBlock({ className: 'bt_attemptNative' },
                h('summary', null, toggleLabel(t), t('ui.original')),
                originalControls(failure, t)) : null))
        }), t))
    }
    function safeCompactionFailure (message) {
      if (typeof message !== 'string') return undefined
      // errorChain persists text, not the original error code. Unknown text may
      // be an AUTH message; never recover it merely because the transaction matches.
      if (/\bAUTH\b/.test(message)) return { code: 'AUTH', message: '' }
      if (message === 'summarization truncated at the token cap (incomplete checkpoint)') return { code: 'MAX_TOKENS', message }
      if (message === 'summarization produced no text summary content'
        || message === 'compaction summary cannot contain image output'
        || /^summary is not smaller than the shadowed content \(\d+ estimated framed tokens >= \d+\)$/.test(message)
        || /^compaction: (?:session surface changed during summarization|selected surface changed before summarization began|the selected span changed during summarization|the selected span was rewritten during summarization)$/.test(message)) return { message }
      return undefined
    }
    function useManualCompactionFailure (sessionId, command) {
      const identity = JSON.stringify([sessionId, command?.commandId, command?.seq])
      const [state, setState] = React.useState(null)
      React.useEffect(() => {
        if (!sessionId || !command?.commandId) return undefined
        let cancelled = false
        let release
        const publish = (value) => { if (!cancelled) setState((previous) => value.error && previous?.identity === identity && previous.failure ? previous : { identity, ...value }) }
        try {
          const binding = sessionService?.binding(sessionId)
          if (!binding?.eventSource) { publish({ missing: true }); return undefined }
          const read = () => {
            if (cancelled) return
            try {
              const events = (binding.eventSource.getSnapshot()?.entries ?? []).filter((entry) => entry.type === 'event').map((entry) => entry.event)
              const own = events.filter((event) => event.data?.sourceCommandId === command.commandId)
              const ids = new Set(own.filter((event) => event.type === 'compaction/start' || event.type === 'compaction/end').map((event) => event.data.compactionId).filter((id) => typeof id === 'string' && id))
              const done = events.filter((event) => event.type === 'command/done' && event.data?.commandId === command.commandId)
              const ends = ids.size === 1 && done.length <= 1 ? own.filter((event) => event.type === 'compaction/end' && ids.has(event.data.compactionId)
                && validSeq(event.seq) && (!validSeq(command.seq) || event.seq >= command.seq)
                && (done.length !== 1 || event.seq <= done[0].seq)) : []
              const event = ends.length === 1 ? ends[0] : undefined
              if (!event || typeof event.data.error !== 'string' || !event.data.error) { publish({ missing: true }); return }
              const failure = safeCompactionFailure(event.data.error)
              if (!failure) { publish({ missing: true }); return }
              publish({ eventSeq: event.seq, compactionId: event.data.compactionId, time: event.time, failure })
            } catch { publish({ error: true }) }
          }
          release = binding.eventSource.subscribe(read)
          read()
          if (validSeq(command.seq) && typeof binding.session?.loadThrough === 'function') {
            Promise.resolve(binding.session.loadThrough(command.seq)).then(read, () => publish({ error: true }))
          }
        } catch { publish({ error: true }) }
        return () => { cancelled = true; release?.() }
      }, [identity])
      return state?.identity === identity ? state : null
    }
    function CompactionErrorCard ({ title, fallback, sessionId, node, match, revision, t }) {
      const [open, setOpen] = React.useState(false)
      const [state, refresh] = useEvidence(compactionUrl(sessionId), revision)
      const record = selectCompaction(state, match)
      const command = node?.data?.command
      const nativeRecord = useManualCompactionFailure(sessionId, command)
      const chosen = record?.attempts?.at(-1)
      const protect = chosen?.failure?.code === 'AUTH' || chosen?.thrown?.code === 'AUTH' || chosen?.detail?.protected
      const nativeFailure = nativeRecord?.failure ?? (command ? { message: fallback } : safeCompactionFailure(fallback))
      const failure = protect ? { code: 'AUTH', message: '' } : nativeFailure ?? { message: t('compact.errorProtected') }
      const selection = { chosen, unconfirmed: !!record }
      return errorRow(title, failure, state, selection, t, { sessionId, node, refresh }, {
        nativeStatus: !chosen?.detail && (chosen?.failure || chosen?.thrown) ? h('section', { className: 'bt_summaryFailure' },
          h('h4', { className: 'bt_heading' }, t('report.summaryError') + ' · ' + t('ui.unconfirmed')),
          protect ? h('div', { className: 'bt_protected' }, t('ui.authProtected'))
            : originalControls(chosen.failure ?? chosen.thrown, t))
          : chosen?.finishReason ? h('section', { className: 'bt_summaryFailure' },
            h('h4', { className: 'bt_heading' }, t('report.summaryError') + ' · ' + t('ui.unconfirmed')),
            h('code', { className: 'bt_meta' }, 'finish=' + chosen.finishReason))
            : command && !nativeRecord?.failure ? h('div', { className: 'bt_meta' }, t(nativeRecord?.error ? 'compact.recordFailed' : 'compact.recordMissing')) : null,
        fallbackNative: true,
        open, onToggle: (event) => { if (!event.target || event.target === event.currentTarget) setOpen(event.currentTarget.open) }, network: false,
        report: h(ReportButton, { key: JSON.stringify([sessionId, logCoordinate(node), revision, nativeRecord?.eventSeq, failure]),
          url: compactionUrl(sessionId), state, failure, row: command ?? node?.data, title, t,
          select: (fresh) => {
            const matched = selectCompaction(fresh, match)
            const attempt = matched?.attempts?.at(-1)
            return { chosen: attempt, unconfirmed: !!matched, record: matched }
          } }),
        history: h(React.Fragment, null, compactionExtra(record, t),
          !state || state.error || !record ? evidenceBody({ state, refresh }, t) : h(RefreshButton, { refresh, t })),
      })
    }
    function CompactionMarker ({ data, title, sessionId, t }) {
      const [open, setOpen] = React.useState(false)
      const [state] = useEvidence(open ? compactionUrl(sessionId) : '', data.time)
      const counts = Number.isSafeInteger(data.shadowedItemCount) && Number.isSafeInteger(data.shadowedTokenCount)
        ? t('compact.completed', { items: data.shadowedItemCount, tokens: data.shadowedTokenCount }) : ''
      return disclosureBlock( { className: 'bt_compact', open, onToggle: (event) => { if (!event.target || event.target === event.currentTarget) setOpen(event.currentTarget.open) } },
        h('summary', null, toggleLabel(t), h('span', { className: 'bt_title' }, title), counts),
        h('div', { className: 'bt_body' }, compactionExtra(selectCompaction(state, { endAt: data.time, status: 'ok' }), t),
          data.summary ? h('pre', { className: 'bt_raw' }, data.summary) : null))
    }
    function CompactionRow ({ node, sessionId, t = (key) => key }) {
      return h(CompactionMarker, { data: node?.data ?? {}, title: t('compact.title'), sessionId, t })
    }
    function ManualCompactionRow ({ node, sessionId, t = (key) => key }) {
      const data = node?.data ?? {}
      const command = data.command ?? {}
      if (data.compaction) return h(CompactionMarker, { data: data.compaction, title: t('compact.title'), sessionId, t })
      if (command.outcome?.kind === 'error') return h(CompactionErrorCard, { title: t('compact.failed'), fallback: command.outcome.text,
        sessionId, node, t, match: { startAt: command.time, status: 'error' }, revision: command.commandId + ':' + command.outcome.kind })
      return h('div', { className: 'bt_compact' }, command.outcome?.text || t(command.outcome ? 'compact.done' : 'compact.running'))
    }
    function CompactionFailureRow ({ node, sessionId, t = (key) => key }) {
      const data = node?.data ?? {}
      return h(CompactionErrorCard, { title: t('compact.failedAuto'), fallback: data.error,
        sessionId, node, t, match: { endAt: data.endedAt, status: 'error' }, revision: data.endedAt })
    }
    const compactionFailureDefinition = {
      kind: KIND, target: 'chat',
      match: (event) => {
        if (!['compaction/start', 'compaction/end', 'compaction/summary'].includes(event.type)) return null
        const data = event.data ?? {}
        if (data.sourceCommandId !== undefined || !data.compactionId) return null
        return { id: data.compactionId, role: event.type === 'compaction/start' ? 'start' : 'update' }
      },
      start: (_context, match) => ({ compactionId: match.event.data.compactionId, startedAt: match.event.time, error: null }),
      update: (context, match) => match.event.type === 'compaction/end'
        ? { ...context.state, endedAt: match.event.time, endSeq: match.event.seq, error: match.event.data.error ?? null } : context.state,
      buildViewNode: (context) => {
        const end = context.matches?.find((match) => match.event.type === 'compaction/end')
        const state = context.state ?? (end ? { ...end.event.data, endedAt: end.event.time, endSeq: end.event.seq } : undefined)
        const anchor = context.start ?? end ?? context.matches?.[0]
        if (!state?.error || !anchor) return null
        return { key: context.key, kind: KIND, id: context.id, target: 'chat',
          anchorSeq: state.endSeq ?? anchor.event.seq, location: anchor.location, groupTree: 'turn', visibility: 'visible', data: state }
      },
    }
    return {
      inject: ['slots', 'locale', 'uiConversation'],
      apply (ctx) {
        sessionService = ctx.get?.('sessions')
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {}
          if (document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_TAG)}]`)) return () => {}
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-better-tips'
          tag.dataset.pluginCss = CSS_TAG
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'better-tips: styles')
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'better-tips: dictionaries')
        ctx.effect(() => ctx.uiConversation.events.register(compactionFailureDefinition), 'better-tips: compaction failure definition')
        ctx.slots.inject('conversation.chat.node', function* () {
          for (const [key, component] of [
            ['turn-error', TurnErrorRow], ['model-retry', ModelRetryRow], ['compaction', CompactionRow],
            ['manual-compaction', ManualCompactionRow], [KIND, CompactionFailureRow],
          ]) yield ctx.slots.register({ name: 'conversation.chat.node', key, priority: -100, locale: NS },
            key === 'compaction' ? component : (props) => h(ErrorSequenceRow, { ...props, component }))
        })
      },
    }
  },
})
