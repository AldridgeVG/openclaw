---
name: dev-cut-percent-notice
description: 设备加工进度监控通知工具 - 定时查询加工进度并在关键节点发送通知
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

# 设备加工进度监控通知工具

## 工具定义

### 功能说明

定时监控设备加工进度，当进度达到预设门槛时自动发送通知消息。

**监控门槛**: 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%

**特殊提示**:

- 进度首次达到 **≥50%** 时，消息补充"进度过半"
- 进度达到 **≥80%** 时，消息补充"即将完成"

### 流程说明

1. **初始化** - 设置设备ID、用户手机号、查询间隔（默认5秒）
2. **循环查询** - 每分钟调用 `query_cut_system_state` 查询当前加工进度
3. **门槛检测** - 检查进度是否达到新的门槛（10/20/30/40/50/60/70/80/90）
4. **发送通知** - 达到新门槛时，发送格式为 `{taskName} 当前加工进度 XX.XX%` 的消息
5. **结束条件** - 进度达到100%或加工完成时停止监控

### API 端点

#### 查询加工状态接口

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/query_cut_system_state`
- **Headers**: `X-User-Mobile: {手机号}`
- **功能**: 查询设备当前实时加工状态

**请求参数：**

| 参数 | 位置  | 类型    | 必填 | 说明   |
| ---- | ----- | ------- | ---- | ------ |
| gmId | query | integer | 是   | 设备ID |

**响应示例：**

```json
{
  "status": 0,
  "msg": "OK",
  "data": {
    "axisX": 999.17,
    "axisY": 2553.3,
    "axisZ": 0,
    "workTime": 0,
    "workTimeStr": "00:00:00.000",
    "workSpeed": 0,
    "cutPercent": 45.5,
    "laserPower": 1000,
    "taskName": "十个圆圆.lxds",
    "pwmFreq": 5000,
    "gasType": "Air",
    "gasPressure": 0,
    "pwmRatio": 1.0,
    "targetHeight": 0.5,
    "diodeCurrent": 100
  }
}
```

### 参数规范

| 参数             | 类型    | 必填 | 说明                    | 示例          |
| ---------------- | ------- | ---- | ----------------------- | ------------- |
| gmId             | integer | 是   | 设备唯一标识            | `280437`      |
| user_mobile      | header  | 是   | 用户手机号              | `13800138000` |
| interval_seconds | integer | 否   | 查询间隔（秒），默认5秒 | `5`           |

## Python 脚本

```python
import time
import requests
from typing import Set, Optional

# API 配置
MCENTER_API_BASE = "https://mcenter.bcjgy.com/api"

# 默认配置
DEFAULT_INTERVAL = 60  # 查询间隔（秒）
PERCENT_THRESHOLDS = [10, 20, 30, 40, 50, 60, 70, 80, 90]  # 监控门槛


def query_cut_system_state(gm_id: int, mobile: str) -> dict:
    """
    查询设备加工状态

    Args:
        gm_id: 设备ID
        mobile: 用户手机号

    Returns:
        加工状态数据
    """
    url = f"{MCENTER_API_BASE}/test/dev_mcp/query_cut_system_state"
    headers = {"X-User-Mobile": mobile}
    params = {"gmId": gm_id}

    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()

    result = response.json()
    if result.get("status") != 0:
        raise Exception(f"查询失败: {result.get('msg')}")

    return result.get("data", {})


def get_current_threshold(percent: float) -> Optional[int]:
    """
    根据当前进度获取应触发的门槛值

    Args:
        percent: 当前进度百分比

    Returns:
        门槛值或None
    """
    for threshold in PERCENT_THRESHOLDS:
        if percent >= threshold:
            return threshold
    return None


def send_notification(task_name: str, percent: float, passed_50: bool, passed_80: bool):
    """
    发送进度通知

    Args:
        task_name: 任务名称
        percent: 当前进度百分比
        passed_50: 是否已触发过50%提示
        passed_80: 是否已触发过80%提示
    """
    # 基础消息
    message = f"{task_name} 当前加工进度 {percent:.2f}%"

    # 附加提示（只提示一次）
    extra_notes = []
    if percent >= 50 and not passed_50:
        extra_notes.append("进度过半")
    if percent >= 80 and not passed_80:
        extra_notes.append("即将完成")

    if extra_notes:
        message += "，" + "，".join(extra_notes)

    # 打印/发送通知
    print(f"[NOTIFY] {message}")

    # TODO: 在这里集成实际的通知发送方式


def monitor_cut_progress(gm_id: int, mobile: str, interval: int = DEFAULT_INTERVAL):
    """
    监控设备加工进度

    Args:
        gm_id: 设备ID
        mobile: 用户手机号
        interval: 查询间隔（秒），默认5秒
    """
    print(f"=" * 60)
    print(f"[INFO] 开始监控设备 {gm_id} 的加工进度")
    print(f"[INFO] 查询间隔: {interval}秒")
    print(f"[INFO] 监控门槛: {PERCENT_THRESHOLDS}%")
    print(f"=" * 60)

    # 已触发的门槛记录
    notified_thresholds: Set[int] = set()

    # 特殊标记
    has_passed_50 = False
    has_passed_80 = False

    # 当前任务名
    current_task_name: Optional[str] = None

    try:
        while True:
            try:
                # 查询加工状态
                data = query_cut_system_state(gm_id, mobile)

                task_name = data.get("taskName", "未知任务")
                cut_percent = data.get("cutPercent", 0)

                # 检测任务切换
                if current_task_name and current_task_name != task_name:
                    print(f"[INFO] 检测到新任务: {task_name}，重置监控状态")
                    notified_thresholds.clear()
                    has_passed_50 = False
                    has_passed_80 = False

                current_task_name = task_name

                print(f"[INFO] {task_name} - 当前进度: {cut_percent:.2f}%")

                # 检查是否完成
                if cut_percent >= 100:
                    send_notification(task_name, cut_percent, has_passed_50, has_passed_80)
                    print(f"[SUCCESS] 加工完成！")
                    break

                # 计算当前应触发的门槛
                current_threshold = get_current_threshold(cut_percent)

                if current_threshold and current_threshold not in notified_thresholds:
                    # 发送通知
                    send_notification(task_name, cut_percent, has_passed_50, has_passed_80)

                    # 记录已触发的门槛
                    notified_thresholds.add(current_threshold)

                    # 更新特殊标记
                    if cut_percent >= 50:
                        has_passed_50 = True
                    if cut_percent >= 80:
                        has_passed_80 = True

            except Exception as e:
                print(f"[ERROR] 查询异常: {e}")

            # 等待下一次查询
            time.sleep(interval)

    except KeyboardInterrupt:
        print(f"\n[INFO] 用户中断，停止监控")

    print(f"=" * 60)
    print(f"[INFO] 监控结束")
    print(f"=" * 60)


# 使用示例
if __name__ == "__main__":
    # ============ 配置参数 ============
    GM_ID = 280437  # 设备ID
    USER_MOBILE = "13800138000"  # 用户手机号
    INTERVAL = 60  # 查询间隔（秒）
    # ==================================

    # 开始监控
    monitor_cut_progress(
        gm_id=GM_ID,
        mobile=USER_MOBILE,
        interval=INTERVAL
    )
```

## cURL 示例

### 查询加工状态

```bash
curl "https://mcenter.bcjgy.com/api/test/dev_mcp/query_cut_system_state?gmId=280437" \
  -H "X-User-Mobile: 13800138000"
```

## 通知消息示例

| 进度 | 消息内容                                      |
| ---- | --------------------------------------------- |
| 10%  | `十个圆圆.lxds 当前加工进度 10.00%`           |
| 20%  | `十个圆圆.lxds 当前加工进度 20.50%`           |
| 50%  | `十个圆圆.lxds 当前加工进度 50.00%，进度过半` |
| 65%  | `十个圆圆.lxds 当前加工进度 65.30%`           |
| 80%  | `十个圆圆.lxds 当前加工进度 80.00%，即将完成` |
| 90%  | `十个圆圆.lxds 当前加工进度 90.20%，即将完成` |

## 故障排查说明

| 问题         | 可能原因               | 解决方案                    |
| ------------ | ---------------------- | --------------------------- |
| 查询失败     | 设备ID无效             | 检查 gmId 是否正确          |
| 认证失败     | 手机号无效             | 检查 X-User-Mobile 是否正确 |
| 进度始终为0  | 设备未在加工           | 确认设备正在执行加工任务    |
| 任务名称为空 | 设备刚启动或未加载文件 | 等待设备加载加工文件        |
