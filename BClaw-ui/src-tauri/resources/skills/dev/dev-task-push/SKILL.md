---
name: dev-task-push
description: 推送加工任务到设备 - 上传文件、创建任务、打开文件
type: api
url: http://mcs-manager.bcjgy.com/news/file_upload
headers:
  X-User-Mobile: "{{user_mobile}}"
  Content-Type: application/json
variables:
  - name: gmId
    title: 设备ID
    description: 请输入设备ID（gmId），例如：280437
    required: true
  - name: target_filename
    title: 目标文件名
    description: 请输入要推送的目标文件名（例如：test-file.lxds）
    required: true
  - name: file_absolute_path
    title: 文件绝对路径
    description: 请输入要上传的文件完整路径（例如：C:\Users\caxus\.qclaw\media\inbound\xxx-asas）
    required: true
  - name: task_amount
    title: 加工次数
    description: 请输入需要加工的次数（默认1次）
    required: false
  - name: x_user_mobile
    title: 用户手机号
    description: 请输入用户手机号（X-User-Mobile），用于接口认证
    required: true
---

# 设备任务推送工具

## 工具定义

### 流程说明

1. **登录获取 Cookie** - 调用 `GET /login/dev` 获取 session
2. **文件重命名** - 将源文件修改扩展名并重命名为目标文件名
3. **上传文件** - 调用 `POST /news/file_upload` 获取文件下载 URL
4. **推送任务** - 调用 `POST /test/dev_mcp/action_push_task` 创建任务，获取 taskUuid
5. **等待** - 推送成功后等待 **10秒**
6. **打开文件** - 调用 `GET /test/dev_mcp/action_open_file_command` 在设备上打开文件
   - 失败时自动重试，最多重试 **10次**，间隔 **3秒**
7. **等待** - 打开成功后等待 **5秒**
8. **开始加工** - 调用 `GET /test/dev_mcp/action_control_command?command=START` 发送开始加工指令

### API 端点

#### 1. 登录接口

- **Method**: GET
- **URL**: `http://mcs-manager.bcjgy.com/login/dev`
- **功能**: 获取 session cookie 用于后续认证

#### 2. 文件上传接口

- **Method**: POST
- **URL**: `http://mcs-manager.bcjgy.com/news/file_upload`
- **Content-Type**: `multipart/form-data`
- **功能**: 上传文件并获取下载 URL

**响应示例：**

```json
{
  "url": "https://fsiot.oss-cn-shanghai.aliyuncs.com/.../xxx.lxds"
}
```

#### 3. 任务推送接口

- **Method**: POST
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/action_push_task`
- **Content-Type**: `application/json`
- **Headers**: `X-User-Mobile: {手机号}`
- **功能**: 创建加工任务

**请求参数：**

| 参数       | 类型    | 必填 | 说明                         |
| ---------- | ------- | ---- | ---------------------------- |
| gmId       | integer | 是   | 设备ID                       |
| fileName   | string  | 是   | 文件名                       |
| filePath   | string  | 是   | 文件URL（上传接口返回的url） |
| taskAmount | integer | 是   | 加工次数，默认1              |

**响应示例：**

```json
{
  "status": 0,
  "msg": "OK",
  "data": {
    "taskUuid": "T19D3DDE2ED9G544775V1783",
    "taskId": 73521
  }
}
```

#### 4. 打开文件接口

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/action_open_file_command`
- **Headers**: `X-User-Mobile: {手机号}`
- **功能**: 在设备上打开任务文件

**请求参数：**

| 参数     | 类型  | 必填    | 说明 |
| -------- | ----- | ------- | ---- | ---------------------------- |
| gmId     | query | integer | 是   | 设备ID                       |
| taskUuid | query | string  | 是   | 任务UUID（推送任务接口返回） |

**响应示例：**

```json
{
  "status": 0,
  "msg": "OK",
  "data": true
}
```

#### 5. 控制指令接口（开始加工）

- **Method**: GET
- **URL**: `https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command`
- **Headers**: `X-User-Mobile: {手机号}`
- **功能**: 发送控制指令到设备（START/PAUSE/RESUME/STOP）

**请求参数：**

| 参数    | 位置  | 类型    | 必填 | 说明                              |
| ------- | ----- | ------- | ---- | --------------------------------- |
| gmId    | query | integer | 是   | 设备ID                            |
| command | query | string  | 是   | 指令类型：START/PAUSE/RESUME/STOP |

**响应示例：**

```json
{
  "status": 0,
  "msg": "OK"
}
```

### 参数规范

| 参数               | 类型    | 必填 | 说明                   | 示例                                           |
| ------------------ | ------- | ---- | ---------------------- | ---------------------------------------------- |
| gmId               | integer | 是   | 设备唯一标识           | `280437`                                       |
| target_filename    | string  | 是   | 目标文件名（含扩展名） | `test-file.lxds`                               |
| file_absolute_path | string  | 是   | 源文件绝对路径         | `C:\Users\caxus\.qclaw\media\inbound\xxx-asas` |
| task_amount        | integer | 否   | 加工次数，默认1        | `2`                                            |
| x_user_mobile      | header  | 是   | 用户手机号             | `13800138000`                                  |

## Python 脚本

```python
import os
import shutil
import tempfile
import time
import requests

# API 配置
MCS_MANAGER_BASE = "http://mcs-manager.bcjgy.com"
MCENTER_API_BASE = "https://mcenter.bcjgy.com/api"

# 重试配置
OPEN_FILE_MAX_RETRIES = 10
OPEN_FILE_RETRY_INTERVAL = 3  # 秒
START_DELAY_AFTER_OPEN = 5    # 秒


def login_and_get_cookie():
    """调用登录接口获取 session cookie"""
    login_url = f"{MCS_MANAGER_BASE}/login/dev"
    session = requests.Session()
    response = session.get(login_url)
    response.raise_for_status()
    return session


def rename_file_with_target_ext(source_path, target_filename):
    """
    将源文件重命名为目标文件名（修改扩展名）

    Args:
        source_path: 源文件绝对路径
        target_filename: 目标文件名（含扩展名）

    Returns:
        临时文件路径
    """
    # 创建临时目录
    temp_dir = tempfile.mkdtemp()

    # 构建目标文件路径（使用目标名称和扩展名）
    temp_file_path = os.path.join(temp_dir, target_filename)

    # 复制文件（保持原内容，但使用目标名称和扩展名）
    shutil.copy2(source_path, temp_file_path)

    return temp_file_path


def upload_file(session, file_path):
    """
    上传文件到文件服务器

    Args:
        session: 带 cookie 的 session 对象
        file_path: 要上传的文件路径

    Returns:
        上传后的下载 URL
    """
    upload_url = f"{MCS_MANAGER_BASE}/news/file_upload"

    with open(file_path, 'rb') as f:
        files = {'file': (os.path.basename(file_path), f)}
        response = session.post(upload_url, files=files)
        response.raise_for_status()

    result = response.json()
    return result.get('url')


def push_task(gm_id, file_name, file_url, task_amount, mobile):
    """
    推送任务到设备

    Args:
        gm_id: 设备ID
        file_name: 文件名
        file_url: 文件下载URL
        task_amount: 加工次数
        mobile: 用户手机号

    Returns:
        taskUuid 和 taskId
    """
    push_url = f"{MCENTER_API_BASE}/test/dev_mcp/action_push_task"
    headers = {
        "X-User-Mobile": mobile,
        "Content-Type": "application/json"
    }
    payload = {
        "gmId": gm_id,
        "fileName": file_name,
        "filePath": file_url,
        "taskAmount": task_amount
    }

    response = requests.post(push_url, json=payload, headers=headers)
    response.raise_for_status()

    result = response.json()
    if result.get('status') != 0:
        raise Exception(f"推送任务失败: {result.get('msg')}")

    return result['data']['taskUuid'], result['data']['taskId']


def open_file_command(gm_id, task_uuid, mobile):
    """
    发送打开文件指令到设备

    Args:
        gm_id: 设备ID
        task_uuid: 任务UUID
        mobile: 用户手机号

    Returns:
        是否成功
    """
    open_url = f"{MCENTER_API_BASE}/test/dev_mcp/action_open_file_command"
    headers = {
        "X-User-Mobile": mobile
    }
    params = {
        "gmId": gm_id,
        "taskUuid": task_uuid
    }

    response = requests.get(open_url, params=params, headers=headers)
    response.raise_for_status()

    result = response.json()
    if result.get('status') != 0:
        raise Exception(f"打开文件失败: {result.get('msg')}")

    return result.get('data', True)


def open_file_command_with_retry(gm_id, task_uuid, mobile, max_retries=OPEN_FILE_MAX_RETRIES, retry_interval=OPEN_FILE_RETRY_INTERVAL):
    """
    发送打开文件指令到设备（带重试机制）

    Args:
        gm_id: 设备ID
        task_uuid: 任务UUID
        mobile: 用户手机号
        max_retries: 最大重试次数，默认10次
        retry_interval: 重试间隔秒数，默认3秒

    Returns:
        是否成功

    Raises:
        Exception: 超过最大重试次数后仍失败
    """
    for attempt in range(1, max_retries + 1):
        try:
            print(f"[INFO] 尝试打开文件（第 {attempt}/{max_retries} 次）...")
            success = open_file_command(gm_id, task_uuid, mobile)
            if success:
                print(f"[SUCCESS] 文件已在设备上打开")
                return True
            else:
                print(f"[WARNING] 打开文件返回失败")
        except Exception as e:
            print(f"[WARNING] 打开文件失败: {e}")

        if attempt < max_retries:
            print(f"[INFO] 等待 {retry_interval} 秒后重试...")
            time.sleep(retry_interval)
        else:
            print(f"[ERROR] 超过最大重试次数（{max_retries}次），打开文件失败")
            raise Exception(f"打开文件失败，已重试{max_retries}次")

    return False


def send_start_command(gm_id, mobile):
    """
    发送开始加工指令到设备

    Args:
        gm_id: 设备ID
        mobile: 用户手机号

    Returns:
        是否成功
    """
    control_url = f"{MCENTER_API_BASE}/test/dev_mcp/action_control_command"
    headers = {
        "X-User-Mobile": mobile
    }
    params = {
        "gmId": gm_id,
        "command": "START"
    }

    response = requests.get(control_url, params=params, headers=headers)
    response.raise_for_status()

    result = response.json()
    if result.get('status') != 0:
        raise Exception(f"发送开始指令失败: {result.get('msg')}")

    return True


def push_task_to_device(gm_id, target_filename, file_absolute_path, mobile, task_amount=1):
    """
    推送任务到设备的完整流程

    Args:
        gm_id: 设备ID
        target_filename: 目标文件名（例如：test-file.lxds）
        file_absolute_path: 源文件绝对路径
        mobile: 用户手机号
        task_amount: 加工次数，默认1

    Returns:
        任务UUID和任务ID
    """
    print(f"=" * 60)
    print(f"[INFO] 开始推送任务到设备 {gm_id}")
    print(f"[INFO] 目标文件名: {target_filename}")
    print(f"[INFO] 加工次数: {task_amount}")
    print(f"=" * 60)

    # 1. 登录获取 cookie
    session = login_and_get_cookie()
    print(f"[SUCCESS] 登录成功，获取 session")

    # 2. 重命名文件（修改扩展名为目标扩展名）
    temp_file_path = rename_file_with_target_ext(file_absolute_path, target_filename)
    print(f"[SUCCESS] 文件已重命名: {os.path.basename(temp_file_path)}")

    try:
        # 3. 上传文件
        file_url = upload_file(session, temp_file_path)
        print(f"[SUCCESS] 文件上传成功")
        print(f"[INFO] 文件 URL: {file_url[:60]}...")

        # 4. 推送任务
        task_uuid, task_id = push_task(gm_id, target_filename, file_url, task_amount, mobile)
        print(f"[SUCCESS] 任务推送成功")
        print(f"[INFO] Task UUID: {task_uuid}")
        print(f"[INFO] Task ID: {task_id}")

        # 5. 打开文件（带重试机制）
        open_file_command_with_retry(gm_id, task_uuid, mobile)

        # 6. 等待5秒
        print(f"[INFO] 等待 {START_DELAY_AFTER_OPEN} 秒后发送开始加工指令...")
        time.sleep(START_DELAY_AFTER_OPEN)

        # 7. 发送开始加工指令
        send_start_command(gm_id, mobile)
        print(f"[SUCCESS] 开始加工指令已发送")

        print(f"=" * 60)
        print(f"[INFO] 任务推送流程完成！设备开始加工...")
        print(f"=" * 60)

        return task_uuid, task_id

    finally:
        # 清理临时文件
        temp_dir = os.path.dirname(temp_file_path)
        shutil.rmtree(temp_dir, ignore_errors=True)
        print(f"[INFO] 临时文件已清理")


# 使用示例
if __name__ == "__main__":
    # ============ 配置参数 ============
    GM_ID = 280437  # 设备ID
    TARGET_FILENAME = "test-file.lxds"  # 目标文件名
    FILE_ABSOLUTE_PATH = r"C:\Users\caxus\.qclaw\media\inbound\xxx-asas"  # 源文件路径
    USER_MOBILE = "13800138000"  # 用户手机号
    TASK_AMOUNT = 1  # 加工次数（默认1次）
    # ==================================

    # 执行推送
    try:
        task_uuid, task_id = push_task_to_device(
            gm_id=GM_ID,
            target_filename=TARGET_FILENAME,
            file_absolute_path=FILE_ABSOLUTE_PATH,
            mobile=USER_MOBILE,
            task_amount=TASK_AMOUNT
        )
        print(f"\n最终任务信息:")
        print(f"  - Task UUID: {task_uuid}")
        print(f"  - Task ID: {task_id}")
    except Exception as e:
        print(f"[ERROR] 任务推送失败: {e}")
```

## cURL 示例

### 完整流程示例

#### 1. 登录获取 Cookie

```bash
curl -c cookies.txt http://mcs-manager.bcjgy.com/login/dev
```

#### 2. 上传文件

```bash
curl -b cookies.txt \
  -F "file=@/path/to/your/file.lxds" \
  http://mcs-manager.bcjgy.com/news/file_upload
```

#### 3. 推送任务

```bash
curl -X POST \
  https://mcenter.bcjgy.com/api/test/dev_mcp/action_push_task \
  -H "Content-Type: application/json" \
  -H "X-User-Mobile: 13800138000" \
  -d '{
    "gmId": 280437,
    "fileName": "test-file.lxds",
    "filePath": "https://fsiot.oss-cn-shanghai.aliyuncs.com/.../xxx.lxds",
    "taskAmount": 1
  }'
```

#### 4. 打开文件

```bash
curl -X GET \
  "https://mcenter.bcjgy.com/api/test/dev_mcp/action_open_file_command?gmId=280437&taskUuid=T19D3DDE2ED9G544775V1783" \
  -H "X-User-Mobile: 13800138000"
```

#### 5. 开始加工

```bash
curl -X GET \
  "https://mcenter.bcjgy.com/api/test/dev_mcp/action_control_command?gmId=280437&command=START" \
  -H "X-User-Mobile: 13800138000"
```

## 故障排查说明

| 问题             | 可能原因                       | 解决方案                                                                       |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| 登录失败         | 网络连接问题或服务器异常       | 检查网络连接，确认目标服务器可访问                                             |
| 上传失败 401/403 | Session 过期或无效             | 重新调用登录接口获取新 session                                                 |
| 推送任务失败     | 设备ID无效或文件URL错误        | 检查 gmId 和 filePath 是否正确                                                 |
| 打开文件失败     | 设备离线或 taskUuid 无效       | 确认设备在线状态，检查 taskUuid 是否正确                                       |
| 文件找不到       | 源文件路径错误或文件不存在     | 检查 file_absolute_path 是否存在且有读取权限                                   |
| 打开文件重试超时 | 设备响应慢或网络不稳定         | 检查设备在线状态，可调整 `OPEN_FILE_MAX_RETRIES` 和 `OPEN_FILE_RETRY_INTERVAL` |
| 开始加工失败     | 设备未准备好或正在加工其他任务 | 确认设备处于空闲状态，无报警信息                                               |

## 重试配置

可在脚本中调整以下常量来修改重试行为：

```python
OPEN_FILE_MAX_RETRIES = 10      # 最大重试次数
OPEN_FILE_RETRY_INTERVAL = 3    # 重试间隔（秒）
START_DELAY_AFTER_OPEN = 5      # 打开成功后等待时间（秒）
```

## 状态码说明

- `status: 0` - 操作成功
- `status: 非0` - 操作失败，具体原因见 `msg` 字段
