// Internationalization - Chinese default, English toggle

const STORAGE_KEY = "openclaw-hub.lang";

const translations = {
  zh: {
    // App
    "app.title": "OpenClaw Hub",

    // Login
    "login.title": "OpenClaw Hub",
    "login.subtitle": "多实例 Web 前端。输入用户名开始使用。",
    "login.username": "用户名",
    "login.username.placeholder": "输入你的名字",
    "login.submit": "进入",

    // Sidebar
    "sidebar.logout": "退出",
    "sidebar.no_connections": "暂无连接",
    "sidebar.busy": "(忙碌)",
    "nav.connections": "连接管理",
    "nav.chat": "聊天",
    "nav.status": "状态",
    "nav.cron": "定时任务",

    // Connections
    "conn.title": "连接管理",
    "conn.add": "+ 添加连接",
    "conn.add_first": "+ 添加你的第一个 VPS 连接",
    "conn.edit": "编辑",
    "conn.delete": "删除",
    "conn.connect": "连接",
    "conn.disconnect": "断开",
    "conn.open": "打开",
    "conn.connecting": "连接中...",
    "conn.remove_confirm": "确定移除此连接？",
    "conn.add_title": "添加连接",
    "conn.edit_title": "编辑连接",
    "conn.name": "名称",
    "conn.name.placeholder": '例如 "工作VPS"',
    "conn.address": "地址",
    "conn.address.placeholder": "https://xxx.trycloudflare.com",
    "conn.token": "密钥",
    "conn.token.placeholder": "Gateway 密钥",
    "conn.cancel": "取消",
    "conn.test": "测试",
    "conn.testing": "测试中...",
    "conn.save": "保存",
    "conn.test_success": "连接成功！",
    "conn.test_fail": "连接失败：",
    "conn.fill_all": "请填写所有字段",
    "conn.fill_url_token": "请填写地址和密钥",
    "conn.connected_to": "已连接到",
    "conn.reconnected": "已重新连接",
    "conn.reconnecting": "正在重连...",

    // Chat
    "chat.no_connection": "未选择连接",
    "chat.no_connection_desc": "从侧边栏选择一个 VPS 或添加新连接。",
    "chat.connected": "已连接",
    "chat.disconnected": "未连接",
    "chat.abort": "中断",
    "chat.abort_success": "已中断",
    "chat.abort_fail": "中断失败：",
    "chat.placeholder": "输入消息...",
    "chat.placeholder_disabled": "请先连接",
    "chat.send": "发送",
    "chat.send_fail": "发送失败：",
    "chat.generating": "生成中...",
    "chat.you": "你",
    "chat.assistant": "助手",
    "chat.system": "系统",
    "chat.attachment": "[附件]",
    "chat.extracting": "正在提取文件内容...",
    "chat.extract_fail": "文件提取失败：",
    "chat.unsupported_file": "不支持的文件类型",

    // Status
    "status.title": "状态",
    "status.no_connection": "未选择连接",
    "status.no_connection_desc": "从侧边栏选择一个 VPS 查看状态。",
    "status.refresh": "刷新",
    "status.connection": "连接状态",
    "status.connected": "已连接",
    "status.disconnected": "未连接",
    "status.agent": "Agent 状态",
    "status.busy": "忙碌",
    "status.idle": "空闲",
    "status.loading": "加载中...",
    "status.online_users": "在线用户",
    "status.no_users": "暂无检测到用户",
    "status.health": "健康详情",
    "status.health_fail": "获取健康信息失败",

    // Cron
    "cron.title": "定时任务",
    "cron.no_connection": "未选择连接",
    "cron.no_connection_desc": "从侧边栏选择一个 VPS 查看定时任务。",
    "cron.refresh": "刷新",
    "cron.service": "定时服务",
    "cron.active": "运行中",
    "cron.disabled": "已禁用",
    "cron.unknown": "未知",
    "cron.loading": "加载定时任务中...",
    "cron.load_fail": "加载失败：",
    "cron.no_jobs": "暂无定时任务",
    "cron.no_jobs_desc": "此 VPS 未配置定时任务。",
    "cron.col_name": "名称",
    "cron.col_schedule": "计划",
    "cron.col_status": "状态",
    "cron.col_last_run": "上次执行",
    "cron.col_next_run": "下次执行",
    "cron.col_actions": "操作",
    "cron.enabled": "已启用",
    "cron.run_now": "立即执行",
    "cron.running": "执行中...",
    "cron.runs": "记录",
    "cron.detail": "查看",
    "cron.detail_title": "任务详情",
    "cron.job_triggered": "任务已触发",
    "cron.job_fail": "执行失败：",
    "cron.recent_runs": "执行记录",
    "cron.close": "关闭",
    "cron.no_runs": "暂无执行记录。",
    "cron.col_time": "时间",
    "cron.col_duration": "耗时",
    "cron.col_details": "详情",
    "cron.runs_fail": "加载失败：",

    // Language
    "lang.toggle": "EN",
  },
  en: {
    // App
    "app.title": "OpenClaw Hub",

    // Login
    "login.title": "OpenClaw Hub",
    "login.subtitle": "Multi-instance web frontend. Enter a username to get started.",
    "login.username": "Username",
    "login.username.placeholder": "Enter your name",
    "login.submit": "Continue",

    // Sidebar
    "sidebar.logout": "Logout",
    "sidebar.no_connections": "No connections yet",
    "sidebar.busy": "(busy)",
    "nav.connections": "Connections",
    "nav.chat": "Chat",
    "nav.status": "Status",
    "nav.cron": "Cron Jobs",

    // Connections
    "conn.title": "Connections",
    "conn.add": "+ Add Connection",
    "conn.add_first": "+ Add your first VPS connection",
    "conn.edit": "Edit",
    "conn.delete": "Delete",
    "conn.connect": "Connect",
    "conn.disconnect": "Disconnect",
    "conn.open": "Open",
    "conn.connecting": "Connecting...",
    "conn.remove_confirm": "Remove this connection?",
    "conn.add_title": "Add Connection",
    "conn.edit_title": "Edit Connection",
    "conn.name": "Name",
    "conn.name.placeholder": 'e.g. "Work VPS"',
    "conn.address": "Address",
    "conn.address.placeholder": "https://xxx.trycloudflare.com",
    "conn.token": "Token",
    "conn.token.placeholder": "Gateway token",
    "conn.cancel": "Cancel",
    "conn.test": "Test",
    "conn.testing": "Testing...",
    "conn.save": "Save",
    "conn.test_success": "Connection successful!",
    "conn.test_fail": "Connection failed: ",
    "conn.fill_all": "Please fill in all fields",
    "conn.fill_url_token": "Please fill in address and token",
    "conn.connected_to": "Connected to",
    "conn.reconnected": "Reconnected",
    "conn.reconnecting": "Reconnecting...",

    // Chat
    "chat.no_connection": "No connection selected",
    "chat.no_connection_desc": "Select a VPS from the sidebar or add a new connection.",
    "chat.connected": "Connected",
    "chat.disconnected": "Disconnected",
    "chat.abort": "Abort",
    "chat.abort_success": "Run aborted",
    "chat.abort_fail": "Abort failed: ",
    "chat.placeholder": "Type a message...",
    "chat.placeholder_disabled": "Connect first to send messages",
    "chat.send": "Send",
    "chat.send_fail": "Send failed: ",
    "chat.generating": "Generating...",
    "chat.you": "You",
    "chat.assistant": "Assistant",
    "chat.system": "System",
    "chat.attachment": "[attachment]",
    "chat.extracting": "Extracting file content...",
    "chat.extract_fail": "File extraction failed: ",
    "chat.unsupported_file": "Unsupported file type",

    // Status
    "status.title": "Status",
    "status.no_connection": "No connection selected",
    "status.no_connection_desc": "Select a VPS from the sidebar to view its status.",
    "status.refresh": "Refresh",
    "status.connection": "Connection",
    "status.connected": "Connected",
    "status.disconnected": "Disconnected",
    "status.agent": "Agent Status",
    "status.busy": "Busy",
    "status.idle": "Idle",
    "status.loading": "Loading...",
    "status.online_users": "Online Users",
    "status.no_users": "No users detected",
    "status.health": "Health Details",
    "status.health_fail": "Failed to fetch health info",

    // Cron
    "cron.title": "Cron Jobs",
    "cron.no_connection": "No connection selected",
    "cron.no_connection_desc": "Select a VPS from the sidebar to view cron jobs.",
    "cron.refresh": "Refresh",
    "cron.service": "Cron Service",
    "cron.active": "Active",
    "cron.disabled": "Disabled",
    "cron.unknown": "Unknown",
    "cron.loading": "Loading cron jobs...",
    "cron.load_fail": "Failed to load: ",
    "cron.no_jobs": "No cron jobs",
    "cron.no_jobs_desc": "No scheduled tasks configured on this VPS.",
    "cron.col_name": "Name",
    "cron.col_schedule": "Schedule",
    "cron.col_status": "Status",
    "cron.col_last_run": "Last Run",
    "cron.col_next_run": "Next Run",
    "cron.col_actions": "Actions",
    "cron.enabled": "Enabled",
    "cron.run_now": "Run Now",
    "cron.running": "Running...",
    "cron.runs": "Runs",
    "cron.detail": "Detail",
    "cron.detail_title": "Job Details",
    "cron.job_triggered": "Job triggered",
    "cron.job_fail": "Failed: ",
    "cron.recent_runs": "Recent Runs",
    "cron.close": "Close",
    "cron.no_runs": "No runs recorded.",
    "cron.col_time": "Time",
    "cron.col_duration": "Duration",
    "cron.col_details": "Details",
    "cron.runs_fail": "Failed: ",

    // Language
    "lang.toggle": "中文",
  },
};

let currentLang = localStorage.getItem(STORAGE_KEY) || "zh";

export function t(key) {
  return translations[currentLang]?.[key] || translations.zh[key] || key;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

export function toggleLang() {
  setLang(currentLang === "zh" ? "en" : "zh");
}
