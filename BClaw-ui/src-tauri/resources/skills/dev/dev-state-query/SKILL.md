---
name: dev-state-query
description: 智能查询设备及加工系统状态信息。
  支持通过设备ID(gmId)查询设备实时状态，自动解析请求参数，格式化展示设备系统状态、应用信息、任务记录、工艺参数及加工系统状态。
  适用于设备实时监控、故障排查、运行状态追溯等场景。当用户提问包括 "当前"、"实时"、"正在"等指示实时数据查询的关键词时，调用该工具。
type: api
url: https://mcenter.bcjgy.com/api/test/dev_mcp/query_real_time_state
headers:
  X-User-Mobile: "{{user_mobile}}"
variables:
  - name: user_mobile
    title: 手机号
    description: 请输入你的手机号
    required: true
---

# 设备及加工系统状态查询工具

## 工具定义

### API 端点

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/query_real_time_state`
- **Content-Type**: `application/json`
- **功能**: 获取设备系统状态、应用信息、任务记录、报警信息、工艺参数等实时状态

### 参数规范

| 参数 | 类型    | 必填 | 说明         | 智能解析规则                                                 |
| ---- | ------- | ---- | ------------ | ------------------------------------------------------------ |
| gmId | integer | 是   | 设备唯一标识 | 从"设备797322"、"797322机床"、"gmId 797322" 等表述中提取数字 |

### 设备系统状态说明

响应中的 `devState` 字段表示设备系统当前状态，可选值及说明如下：

| 状态值   | 说明                             |
| -------- | -------------------------------- |
| OFFLINE  | 加工系统离线                     |
| IDLE     | 加工系统空闲（无正在进行的任务） |
| WORKING  | 加工系统处于加工状态             |
| PAUSE    | 加工系统处于暂停状态             |
| ALARMING | 加工系统处于报警状态             |

### CURL执行命令

#### 基础调用（原始JSON响应）

```bash
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_real_time_state?gmId=797322"
```

根据内容总结重要信息回答

### 响应结构

```json
{
  "status": 0,
  // 0=成功，非0=失败
  "msg": "OK",
  // 状态描述
  "data": {
    // 设备实时状态数据
    "devState": "PAUSE",
    // 设备系统状态：OFFLINE/IDLE/WORKING/PAUSE/ALARMING
    "fsdcState": {
      // 设备联网详细信息
      "clientId": "F18FA32107D044775ZJS2",
      // 客户端唯一标识
      "gmid": 280437,
      // 设备ID
      "updateAt": "2024-05-23 09:46:44",
      // 信息更新时间
      "apps": {
        // 运行软件列表
        "CypCut": {
          // 软件信息对象（以实际运行的软件名为key）
          "appName": "CypCut",
          // 软件名称
          "appVer": "6.3.763.11",
          // 软件版本
          "pid": 11192,
          // 进程ID
          "startAt": "2024-05-23 09:46:22",
          // 软件启动时间
          "infoSources": [
            "[System",
            "CypCut",
            "ExtBoards",
            "Laser",
            "MotionCard",
            "CutSystemState",
            "LayerParams",
            "CutSystem",
            "Follower",
            "GlobalParams",
            "Statistics]"
          ],
          // 信息来源列表
          "curAlarms": [],
          // 当前报警信息（空数组表示无报警）
          "lastWork": {
            // 最近一次加工任务详情
            "startTime": "2024-05-23 10:41:15",
            // 加工开始时间
            "finishTime": "2024-05-23 10:41:23",
            // 加工结束时间
            "fileName": "D:\fsdata\...\爱达塔筒-Q345-T12-排版1.lxds",
            // 加工文件名
            "materialName": "",
            // 材料名称
            "cutState": 1,
            // 切割状态
            "payload": "{...}"
            // 加工额外信息（JSON字符串）
          },
          "payload": "{...}"
          // 设备额外信息（JSON字符串）
        }
      }
    }
  }
}
```

### 响应字段说明

| 字段路径                                          | 类型    | 说明                                              |
| ------------------------------------------------- | ------- | ------------------------------------------------- |
| `data.devState`                                   | string  | 设备系统状态：OFFLINE/IDLE/WORKING/PAUSE/ALARMING |
| `data.fsdcState.clientId`                         | string  | 客户端唯一标识                                    |
| `data.fsdcState.gmid`                             | integer | 设备ID                                            |
| `data.fsdcState.updateAt`                         | string  | 信息更新时间                                      |
| `data.fsdcState.apps`                             | object  | 运行软件列表（key为软件名）                       |
| `data.fsdcState.apps.{app}.appName`               | string  | 软件名称                                          |
| `data.fsdcState.apps.{app}.appVer`                | string  | 软件版本                                          |
| `data.fsdcState.apps.{app}.pid`                   | integer | 进程ID                                            |
| `data.fsdcState.apps.{app}.startAt`               | string  | 软件启动时间                                      |
| `data.fsdcState.apps.{app}.infoSources`           | array   | 信息来源列表                                      |
| `data.fsdcState.apps.{app}.curAlarms`             | array   | 当前报警信息列表                                  |
| `data.fsdcState.apps.{app}.lastWork`              | object  | 最近一次加工信息                                  |
| `data.fsdcState.apps.{app}.lastWork.startTime`    | string  | 加工开始时间                                      |
| `data.fsdcState.apps.{app}.lastWork.finishTime`   | string  | 加工结束时间                                      |
| `data.fsdcState.apps.{app}.lastWork.fileName`     | string  | 加工文件名                                        |
| `data.fsdcState.apps.{app}.lastWork.materialName` | string  | 工艺名称                                          |
| `data.fsdcState.apps.{app}.lastWork.cutState`     | integer | 切割状态                                          |
| `data.fsdcState.apps.{app}.lastWork.payload`      | string  | 加工额外信息（JSON字符串）                        |
| `data.fsdcState.apps.{app}.payload`               | string  | 设备额外信息（JSON字符串）                        |

### 故障排查说明

- 若响应返回非0状态码，请检查gmId是否有效（确保为整数类型）
- 若响应中 `fsdcState` 数据缺失，很可能设备当前联网状态异常
- 若 `devState` 返回 OFFLINE/UNKNOWN/空，表示加工系统离线，无法获取加工状态
- 格式化输出需在系统中安装Python（可通过`python --version`或`python3 --version`命令检查）
- 确保网络可连接请求地址（可通过`ping mcenter.bcjgy.com`命令测试）
