---
name: dev-work-log-query
description: 智能查询设备加工记录信息。
  支持通过设备ID(gmId)和时间范围查询设备加工记录，自动解析请求参数，格式化展示加工任务详情。
  适用于设备加工历史查询、生产效率统计、加工任务追溯等场景。当用户提问包括"加工记录"、"加工历史"、"生产记录"等关键词时，调用该工具。
type: api
url: https://mcenter.bcjgy.com/api/test/dev_mcp/query_work_logs
headers:
  X-User-Mobile: "{{user_mobile}}"
variables:
  - name: user_mobile
    title: 用户手机号
    description: 请输入您的手机号用于认证
    required: true
---

# 设备加工记录查询工具

## 工具定义

### API 端点

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/query_work_logs`
- **功能**: 查询设备指定时间范围内的加工记录

### 参数规范

| 参数          | 类型    | 必填 | 说明         | 智能解析规则                                                 |
| ------------- | ------- | ---- | ------------ | ------------------------------------------------------------ |
| gmId          | integer | 是   | 设备唯一标识 | 从"设备797322"、"797322机床"、"gmId 797322" 等表述中提取数字 |
| startTime     | string  | 是   | 开始时间     | 格式：`yyyy-MM-dd HH:mm:ss`。从"10月1号"、"上周"、"昨天"解析 |
| endTime       | string  | 是   | 结束时间     | 同上，默认为查询时段的结束时间点（如当天23:59:59）           |
| pageNum       | integer | 是   | 页码         | 从0开始的页数。"第1页"=0，"第2页"=1                          |
| pageSize      | integer | 是   | 每页条数     | 大于0的页面大小，默认20，最大100                             |
| X-User-Mobile | header  | 是   | 用户手机号   | 用于接口认证，通过变量输入                                   |

### CURL执行命令

#### 基础调用（原始JSON响应）

```bash
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_work_logs?gmId=280437&startTime=2026-03-01%2000:00:00&endTime=2026-03-30%2023:59:59&pageNum=0&pageSize=20" \
  -H "X-User-Mobile: 13800138000"
```

#### 格式化输出

```bash
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_work_logs?gmId=280437&startTime=2026-03-01%2000:00:00&endTime=2026-03-30%2023:59:59&pageNum=0&pageSize=20" \
  -H "X-User-Mobile: 13800138000" | python -m json.tool
```

### 响应结构

```json
{
  "status": 0,
  // 0=成功，非0=失败
  "msg": "OK",
  // 状态描述
  "data": {
    // 响应数据对象
    "list": [
      // 加工记录列表
      {
        "portionName": "排版1",
        // 排版名称
        "syncTime": "2026-03-25 14:30:25",
        // 数据同步时间
        "fileName": "test3.lxds",
        // 加工文件名
        "portionId": "T19C03513775G544775B2089",
        // 排版/任务ID
        "thickness": 16,
        // 材料厚度(mm)
        "timeTaken": 120.5,
        // 实际加工耗时(秒)
        "materialName": null,
        // 工艺名称
        "gmId": 280437,
        // 设备ID
        "material": "Q355B",
        // 材质
        "tmEstimate": 180.0,
        // 预计耗时(秒)
        "techParam": "{\"LaserPower\":1000,...}",
        // 工艺参数JSON字符串
        "startTime": "2026-03-25 14:28:20",
        // 加工开始时间
        "curveLength": 75299.0,
        // 加工路径长度(mm)
        "endTime": "2026-03-25 14:30:20",
        // 加工结束时间
        "pierceCount": 56
        // 穿孔次数
      }
    ],
    "totalCount": 150
    // 总记录数，用于分页
  }
}
```

### 响应字段说明

| 字段路径                   | 类型    | 说明                   |
| -------------------------- | ------- | ---------------------- |
| `data.list`                | array   | 加工记录列表           |
| `data.totalCount`          | integer | 总记录数，用于计算分页 |
| `data.list[].portionName`  | string  | 排版名称               |
| `data.list[].syncTime`     | string  | 数据同步时间           |
| `data.list[].fileName`     | string  | 加工文件名             |
| `data.list[].portionId`    | string  | 排版/任务ID            |
| `data.list[].thickness`    | integer | 材料厚度(mm)           |
| `data.list[].timeTaken`    | number  | 实际加工耗时(秒)       |
| `data.list[].materialName` | string  | 工艺名称               |
| `data.list[].gmId`         | integer | 设备ID                 |
| `data.list[].material`     | string  | 材质                   |
| `data.list[].tmEstimate`   | number  | 预计耗时(秒)           |
| `data.list[].techParam`    | string  | 工艺参数(JSON字符串)   |
| `data.list[].startTime`    | string  | 加工开始时间           |
| `data.list[].curveLength`  | number  | 加工路径长度(mm)       |
| `data.list[].endTime`      | string  | 加工结束时间           |
| `data.list[].pierceCount`  | integer | 穿孔次数               |

### 故障排查说明

- 若响应返回非0状态码，请检查 `gmId` 是否有效（确保为整数类型）
- 若返回认证错误，请确认 `X-User-Mobile` header 是否正确设置
- `startTime` 和 `endTime` 格式必须为 `yyyy-MM-dd HH:mm:ss`
- `pageNum` 从 **0** 开始计数，第一页为0，第二页为1
- 若数据为空，可能是该时间段内无加工记录
- 格式化输出需在系统中安装Python（可通过 `python --version` 或 `python3 --version` 命令检查）
