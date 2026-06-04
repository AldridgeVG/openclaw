---
name: dev-control-command
description: 设备MCP控制指令发送工具。
  支持向指定设备发送控制命令，包括暂停加工、恢复加工、重新开始加工、停止加工等操作。
  适用于设备远程控制、紧急情况处理、生产流程管理等场景。当用户提问包括"暂停"、"恢复"、"停止"、"控制"等关键词时，调用该工具。
type: api
url: https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command
headers:
  X-User-Mobile: "{{user_mobile}}"
variables:
  - name: user_mobile
    title: 手机号
    description: 请输入你的手机号
    required: true
---

# 设备MCP控制指令发送工具

## 工具定义

### API 端点

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command`
- **Content-Type**: `application/json`
- **功能**: 向指定设备发送控制指令，实现远程控制加工流程

### 参数规范

| 参数    | 类型    | 必填 | 说明         | 智能解析规则                                             |
| ------- | ------- | ---- | ------------ | -------------------------------------------------------- |
| gmId    | integer | 是   | 设备唯一标识 | 从"设备797322"、"797322机床"、"gmId 797322"等提取数字    |
| command | string  | 是   | 控制指令     | 支持：PAUSE(暂停)、RESUME(恢复)、START(开始)、STOP(停止) |

### 指令说明

| 指令值 | 说明         | 适用场景                   |
| ------ | ------------ | -------------------------- |
| PAUSE  | 暂停加工     | 需要临时中断当前加工任务   |
| RESUME | 恢复加工     | 暂停后恢复之前的加工任务   |
| START  | 重新开始加工 | 开始新的加工任务或重新启动 |
| STOP   | 停止加工     | 完全停止当前加工任务       |

### 请求头

| 参数          | 类型   | 必填 | 说明       |
| ------------- | ------ | ---- | ---------- |
| X-User-Mobile | string | 是   | 用户手机号 |

### CURL执行命令

基础调用示例

```bash
# 暂停加工
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command?gmId=797322&command=PAUSE" \
  -H "X-User-Mobile: {{user_mobile}}"

# 恢复加工
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command?gmId=797322&command=RESUME" \
  -H "X-User-Mobile: {{user_mobile}}"

# 开始加工
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command?gmId=797322&command=START" \
  -H "X-User-Mobile: {{user_mobile}}"

# 停止加工
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command?gmId=797322&command=STOP" \
  -H "X-User-Mobile: {{user_mobile}}"
```

格式化输出（推荐）

```bash
# Linux / macOS
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command?gmId=797322&command=PAUSE" \
  -H "X-User-Mobile: {{user_mobile}}" | python3 -m json.tool

# Windows (CMD / PowerShell)
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command?gmId=797322&command=PAUSE" \
  -H "X-User-Mobile: {{user_mobile}}" | python -m json.tool
```

### 响应结构

```json
{
  "status": 0, // 0=成功，非0=失败
  "msg": "OK" // 状态描述，成功返回"OK"，失败返回错误信息
}
```

### 响应状态码说明

| status | msg      | 说明                        |
| ------ | -------- | --------------------------- |
| 0      | OK       | 指令发送成功                |
| 非0    | 错误信息 | 指令发送失败，具体原因见msg |

### 故障排查说明

- 若响应返回非0状态码，请检查：
  - gmId是否有效（确保为整数类型）
  - command参数是否正确（必须为PAUSE/RESUME/START/STOP之一）
  - 设备是否在线
- 确保已正确提供手机号（X-User-Mobile请求头）
- 格式化输出需在系统中安装Python（可通过`python --version`或`python3 --version`命令检查）
- 确保网络可连接请求地址（可通过`ping mcenter.bcjgy.com`命令测试）
- 控制指令有一定的执行延迟，请耐心等待设备响应
- 部分指令可能受设备当前状态限制（如PAUSE只能在WORKING状态下执行）
