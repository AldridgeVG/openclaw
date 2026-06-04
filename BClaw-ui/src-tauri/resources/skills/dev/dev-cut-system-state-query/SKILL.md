---
name: query-cut-system-state
description: 智能查询设备当前实时运行状态，包括加工进度、坐标位置、运行参数及当前任务信息。
  支持通过设备ID(gmId)获取设备实时运行状态，包括加工进度、坐标位置、运行参数及当前任务信息。
  适用于设备实时监控、加工进度查询、运行状态判断等场景。当用户提问包括"加工进度"、"现在在干嘛"、"加工到哪了"等关键词时，调用该工具。
type: api
url: https://mcenter.bcjgy.com/api/test/dev_mcp/query_cut_system_state
headers:
  X-User-Mobile: "{{user_mobile}}"
variables:
  - name: user_mobile
    title: 用户手机号
    description: 请输入您的手机号用于认证
    required: true
---

# 设备加工状态查询工具

## 工具定义

### API 端点

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/query_cut_system_state`
- **Content-Type**: `application/json`
- **功能**: 智能查询设备当前实时运行状态，包括加工进度、坐标位置、运行参数及当前任务信息。

---

### 参数规范

| 参数 | 类型    | 必填 | 说明         | 智能解析规则                                                          |
| ---- | ------- | ---- | ------------ | --------------------------------------------------------------------- |
| gmId | integer | 是   | 设备唯一标识 | 从“设备280437”、“280437机床”、“gmId 280437”、“查一下280437状态”等提取 |

### 请求头

| 参数          | 类型   | 必填 | 说明       |
| ------------- | ------ | ---- | ---------- |
| X-User-Mobile | string | 是   | 用户手机号 |

---

### CURL执行命令

基础调用（原始JSON响应）

```bash
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_cut_system_state?gmId=280437" \
  -H "X-User-Mobile: 13800138000"
```

格式化输出（推荐）

```bash
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_cut_system_state?gmId=280437" \
  -H "X-User-Mobile: 13800138000" | python -m json.tool
```

### 响应结构

```json
{
  "status": 0, // 0=成功，非0=失败
  "msg": "OK", // 状态描述
  "data": {
    // 设备加工状态信息
    "axisX": 999.167732743023, // X轴坐标
    "axisY": 2553.29987318892, // Y轴坐标
    "axisZ": 0, // Z轴坐标
    "workTime": 0, // 加工已用时间(天)
    "workTimeStr": "00:00:00.000", // 加工已用时间字符串格式
    "workSpeed": 0, // 切割速度（米/秒）
    "cutPercent": 0, // 加工进度百分比（%）
    "laserPower": 1000, // 激光功率（瓦）
    "taskName": "十个圆圆.lxds", // 当前加工任务名称
    "pwmFreq": 5000, // PWM频率（赫兹）
    "gasType": "Air", // 气体类型
    "gasPressure": 0, // 气体压力（兆帕）
    "pwmRatio": 1.0, // PWM占空比
    "targetHeight": 0.5, // 跟随高度（毫米）
    "diodeCurrent": 100 // 峰值功率（%）
  }
}
```

### 响应字段说明

| 字段路径          | 类型    | 示例值        | 说明                         | 单位 |
| ----------------- | ------- | ------------- | ---------------------------- | ---- |
| status            | integer | 0             | 请求状态码，0=成功，非0=失败 | -    |
| msg               | string  | OK            | 状态描述                     | -    |
| data              | object  | -             | 设备加工状态信息             | -    |
| data.axisX        | number  | 999.1677      | X轴坐标                      | mm   |
| data.axisY        | number  | 2553.2998     | Y轴坐标                      | mm   |
| data.axisZ        | number  | 0             | Z轴坐标                      | mm   |
| data.workTime     | number  | 0             | 加工已用时间                 | 天   |
| data.workTimeStr  | string  | 00:00:00.000  | 加工已用时间（格式化）       | -    |
| data.workSpeed    | number  | 0             | 切割速度                     | m/s  |
| data.cutPercent   | number  | 0             | 加工进度百分比               | %    |
| data.laserPower   | number  | 1000          | 激光功率                     | W    |
| data.taskName     | string  | 十个圆圆.lxds | 当前加工任务名称             | -    |
| data.pwmFreq      | number  | 5000          | PWM频率                      | Hz   |
| data.gasType      | string  | Air           | 气体类型                     | -    |
| data.gasPressure  | number  | 0             | 气体压力                     | MPa  |
| data.pwmRatio     | number  | 1.0           | PWM占空比                    | -    |
| data.targetHeight | number  | 0.5           | 跟随高度                     | mm   |
| data.diodeCurrent | number  | 100           | 峰值功率                     | %    |

### 故障排查说明

- 若响应返回非0状态码，请检查 `gmId` 是否有效（确保为整数类型）
- 若返回认证错误，请确认 `X-User-Mobile` header 是否正确设置
- 若数据为空，可能是设备没有开机或没有联网
- 格式化输出需在系统中安装Python（可通过 `python --version` 或 `python3 --version` 命令检查）
