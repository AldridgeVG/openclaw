---
name: dev-task-query
description: 智能查询设备MCP任务信息。
  支持通过设备ID(gmId)查询设备的任务列表，包括任务名称、材质、厚度、加工数量、完成状态等详细信息。
  适用于任务管理、生产进度跟踪、任务历史查询等场景。当用户提问包括"任务"、"待加工任务"、"已完成任务"、"任务列表"、"生产任务"等关键词时，调用该工具。
type: api
url: https://mcenter.bcjgy.com/api/test/dev_mcp/query_tasks
headers:
  X-User-Mobile: "{{user_mobile}}"
variables:
  - name: user_mobile
    title: 手机号
    description: 请输入你的手机号
    required: true
---

# 设备MCP任务查询工具

## 工具定义

### API 端点

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/query_tasks`
- **Content-Type**: `application/json`
- **功能**: 查询指定设备的MCP任务列表，支持已完成/未完成任务筛选和分页查询

### 参数规范

| 参数     | 类型    | 必填 | 说明               | 智能解析规则                                                               |
| -------- | ------- | ---- | ------------------ | -------------------------------------------------------------------------- |
| gmId     | integer | 是   | 设备唯一标识       | 从"设备797322"、"797322机床"、"gmId 797322"等提取数字                      |
| finished | boolean | 是   | 是否查询已完成任务 | true=查询已完成任务，false=查询未完成任务                                  |
| pageNum  | integer | 是   | 页码               | 大于0的页码，默认为 0，用户说"下一页"、"第2页"，或者需要查询更多数据时递增 |
| pageSize | integer | 是   | 每页大小           | 大于0的页面大小，默认 20                                                   |

### 请求头

| 参数          | 类型   | 必填 | 说明       |
| ------------- | ------ | ---- | ---------- |
| X-User-Mobile | string | 是   | 用户手机号 |

### CURL执行命令

基础调用（原始JSON响应）

```bash
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_tasks?gmId=797322&finished=false&pageNum=1&pageSize=20" \
  -H "X-User-Mobile: {{user_mobile}}"
```

格式化输出（推荐）

```bash
# Linux / macOS
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_tasks?gmId=797322&finished=false&pageNum=1&pageSize=20" \
  -H "X-User-Mobile: {{user_mobile}}" | python3 -m json.tool

# Windows (CMD / PowerShell)
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_tasks?gmId=797322&finished=false&pageNum=1&pageSize=20" \
  -H "X-User-Mobile: {{user_mobile}}" | python -m json.tool
```

### 响应结构

```json
{
  "status": 0, // 0=成功，非0=失败
  "msg": "OK", // 状态描述
  "data": {
    "list": [
      // 任务列表
      {
        "taskUuid": "T19C03513775G544775B2089", // 任务UUID
        "taskName": "test3", // 任务名称
        "fileName": "test3.lxds", // 文件名
        "material": "Q355B", // 材质
        "thickness": 16, // 厚度(mm)
        "plateSize": "1265.0 X 12800.0", // 板材尺寸
        "taskAmount": 1, // 任务数量
        "partPlanCount": 74, // 计划加工件数
        "partFinishCount": 0, // 已完成件数
        "nestPlanCount": 1, // 排版计划数
        "nestFinishCount": 0, // 排版完成数
        "piercePlanCount": 1, // 穿孔计划数
        "pierceCount": 0, // 实际穿孔数
        "planCurveLength": 75299.0007, // 计划曲线长度
        "curveLength": 0, // 实际曲线长度
        "utilization": 99.558053359684, // 材料利用率(%)
        "tmEstimate": 1008, // 预估加工时间(秒)
        "timeTaken": 0, // 实际耗时(秒)
        "status": 6, // 任务状态
        "gasType": 0, // 气体类型
        "gasTypeName": "未知", // 气体类型名称
        "createTime": "2026-01-28 14:36:20", // 创建时间
        "finishTime": null, // 完成时间
        "machineNickname": "FS-280437", // 设备昵称
        "originAlias": "我的机床", // 设备别名
        "linked": false, // 是否关联
        "linkTechnicName": "", // 关联工艺名称
        "canMove": true, // 是否可移动
        "canTop": true, // 是否可置顶
        "canBottom": true, // 是否可置底
        "canDel": true, // 是否可删除
        "canDelFinished": true, // 是否可删除已完成
        "canDelUnfinished": true, // 是否可删除未完成
        "canLink": true, // 是否可关联
        "canAssign": true, // 是否可分配
        "canUpdateAmount": true, // 是否可更新数量
        "canUpdateRemark": true, // 是否可更新备注
        "canWorkAgain": false, // 是否可重新加工
        "remarks": null, // 备注
        "pictureUrl": "...", // 图片URL
        "hdPictureUrl": "...", // 高清图片URL
        "plateUrl": "..." // 板材文件URL
      }
    ],
    "totalCount": 26 // 总记录数
  }
}
```

### 任务状态说明

| 状态值 | 说明     |
| ------ | -------- |
| 0      | 等待中   |
| 1      | 加工中   |
| 2      | 暂停     |
| 3      | 完成     |
| 4      | 取消     |
| 5      | 错误     |
| 6      | 等待开始 |

### 故障排查说明

- 若响应返回非0状态码，请检查gmId是否有效（确保为整数类型）
- 若返回空列表，可能该设备暂无任务或筛选条件不匹配
- 确保已正确提供手机号（X-User-Mobile请求头）
- 格式化输出需在系统中安装Python（可通过`python --version`或`python3 --version`命令检查）
- 确保网络可连接请求地址（可通过`ping mcenter.bcjgy.com`命令测试）
