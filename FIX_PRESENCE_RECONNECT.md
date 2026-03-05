# 修复：重连后在线用户栏消失问题

## 问题描述

当浏览器最小化一段时间后，重新打开时发现聊天页面顶部的"在线用户"栏消失了。

## 问题原因

### 问题流程

```
1. 浏览器最小化
   ↓
2. 5-30 分钟后 WebSocket 连接超时断开
   ↓
3. 触发 "disconnected" 事件
   ↓
4. 执行 store.setOnlineUsers(connectionId, [])
   ↓
5. 在线用户数据被清空
   ↓
6. 重新打开浏览器
   ↓
7. WebSocket 自动重连成功
   ↓
8. 触发 "connected" 事件
   ↓
9. ❌ 但是没有重新获取 presence 数据
   ↓
10. 在线用户栏消失（因为数据为空）
```

### 根本原因

在 `main.js` 的重连处理中，只设置了连接状态，但没有重新获取 presence 数据：

```javascript
// 之前的代码
client.on("connected", () => {
  store.setConnectionStatus(connectionId, "connected");
  showToast(t("conn.reconnected") || "Reconnected", "success");
  // ❌ 缺少：重新获取 presence 数据
});
```

## 解决方案

在重连成功后，主动调用 `system-presence` 请求获取最新的在线用户数据。

### 修改代码

**文件：** `src/main.js`

```javascript
// Listen for successful reconnection
client.on("connected", () => {
  store.setConnectionStatus(connectionId, "connected");
  showToast(t("conn.reconnected") || "Reconnected", "success");

  // ✅ 新增：重新获取 presence 数据
  client.request("system-presence", {})
    .then((presence) => {
      if (Array.isArray(presence)) {
        store.setOnlineUsers(connectionId, presence);
      }
    })
    .catch((err) => {
      console.warn("Failed to fetch presence after reconnection:", err);
    });
});
```

### 工作原理

1. **重连成功** → 触发 `connected` 事件
2. **发送请求** → `client.request("system-presence", {})`
3. **获取数据** → 服务器返回当前在线用户列表
4. **更新状态** → `store.setOnlineUsers(connectionId, presence)`
5. **触发渲染** → 聊天页面的 `onPresence` 监听器更新 UI
6. **显示栏** → 在线用户栏重新出现

## 修复后的流程

```
1. 浏览器最小化
   ↓
2. WebSocket 连接断开
   ↓
3. 在线用户数据被清空
   ↓
4. 重新打开浏览器
   ↓
5. WebSocket 自动重连成功
   ↓
6. ✅ 主动请求 presence 数据
   ↓
7. ✅ 更新 store 中的在线用户数据
   ↓
8. ✅ 在线用户栏重新显示
```

## 技术细节

### system-presence 请求

这是 OpenClaw Gateway 协议中的标准请求：

```javascript
client.request("system-presence", {})
```

**返回格式：**
```javascript
[
  {
    instanceId: "uuid",
    displayName: "User Name",
    host: "hostname",
    mode: "ui",
    reason: "connect",
    // ... 其他字段
  },
  // ... 更多用户
]
```

### 错误处理

使用 `.catch()` 捕获错误，避免影响重连流程：

```javascript
.catch((err) => {
  console.warn("Failed to fetch presence after reconnection:", err);
});
```

即使获取 presence 失败，也不会影响连接状态。

### 异步处理

使用 Promise 异步获取数据，不阻塞重连流程：

- 重连成功立即显示 toast 提示
- 同时异步获取 presence 数据
- 数据到达后更新 UI

## 测试场景

### 场景 1：正常重连

```
1. 打开应用，连接 OpenClaw
2. 看到在线用户栏：👥 在线用户: User1, User2
3. 最小化浏览器 10 分钟
4. 重新打开浏览器
5. ✅ 看到 "已重新连接" 提示
6. ✅ 在线用户栏重新出现
```

### 场景 2：快速重连

```
1. 连接 OpenClaw
2. 手动断开网络
3. 立即恢复网络
4. ✅ 自动重连
5. ✅ 在线用户栏正常显示
```

### 场景 3：长时间离线

```
1. 连接 OpenClaw
2. 最小化浏览器 1 小时
3. 重新打开
4. ✅ 重连成功
5. ✅ 获取最新的在线用户列表
6. ✅ 显示当前实际在线的用户
```

## 其他改进

### 初始连接也使用相同逻辑

初始连接时已经有类似的处理：

```javascript
// main.js 第 86-88 行
if (helloPayload?.snapshot?.presence) {
  store.setOnlineUsers(connectionId, helloPayload.snapshot.presence);
}
```

现在重连时也使用相同的方式获取数据，保持一致性。

### 心跳机制

OpenClaw Gateway 每 15 秒会自动轮询 presence：

```javascript
// gateway.js 第 234-238 行
this.request("system-presence", {}).then((presence) => {
  if (Array.isArray(presence)) {
    this._emit("presence", { presence });
  }
});
```

所以即使重连时获取失败，最多 15 秒后也会通过心跳更新。

## 优势

1. **用户体验改善** - 重连后立即恢复在线用户显示
2. **数据一致性** - 获取最新的在线用户列表
3. **不影响性能** - 异步请求，不阻塞重连
4. **容错性好** - 失败不影响连接状态
5. **代码简洁** - 只增加 8 行代码

## 相关代码位置

- **修改文件：** `src/main.js` 第 71-85 行
- **相关逻辑：** `src/gateway.js` 第 234-238 行（心跳轮询）
- **UI 更新：** `src/pages/chat.js` 第 230-250 行（presence 监听器）

## 注意事项

1. **网络延迟**
   - 重连后可能需要 1-2 秒才能看到在线用户栏
   - 这是正常的网络请求延迟

2. **服务器状态**
   - 如果服务器没有其他在线用户，栏不会显示
   - 这是预期行为

3. **浏览器兼容性**
   - 所有支持 WebSocket 的浏览器都支持
   - 不需要额外的 polyfill

## 未来改进

可选的增强功能：

1. **加载状态**
   ```
   重连后显示：👥 在线用户: 加载中...
   数据到达后更新为实际用户
   ```

2. **缓存机制**
   ```
   断开前保存在线用户数据
   重连后先显示缓存数据
   然后更新为最新数据
   ```

3. **重试机制**
   ```
   如果第一次获取失败
   自动重试 2-3 次
   ```

---

**修复完成！** 现在重连后在线用户栏会正常显示了。✅
