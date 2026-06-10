# 📝 徐爸陪读笔记辅助学习系统

纯前端 SPA 应用，无需远程服务器，兼容 iPad 浏览器。

## 功能特性

- ✅ **学科管理**：创建/删除多学科（数学、语文、英语等）
- ✅ **题目管理**：手动输入 + 拍照 OCR 识别（Tesseract.js）
- ✅ **随机组卷**：按学科随机抽取 N 道题目
- ✅ **答题考试**：支持选择题/判断题/填空题，可选计时
- ✅ **即时批改**：答完立即看成绩，错题自动入错题本
- ✅ **AI 记忆辅助**：答错后调用 DeepSeek API 生成顺口溜/图像记忆
- ✅ **错题本**：记录错题，生成记忆口诀，掌握后可移除
- ✅ **数据导入导出**：JSON 格式备份与恢复
- ✅ **iPad 适配**：响应式布局，触控友好

## 快速开始

### 1. 安装依赖

```bash
cd /Users/xujiang_mini/WorkBuddy/2026-06-10-07-52-28/exam-system
npm install
```

### 2. 配置 DeepSeek API（可选，用于 AI 记忆辅助）

```bash
# 设置环境变量（替换为你的 Key）
export DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx

# 启动服务器
npm start
# 或
node server.js
```

> ⚠️ 若不配置 API Key，AI 记忆辅助功能不可用，其余功能正常。

### 3. 打开浏览器

- **本机访问**：http://localhost:3000
- **iPad 访问**：确保 iPad 和电脑在同一 WiFi，然后访问 `http://[电脑IP]:3000`
  - 查电脑 IP：`ifconfig | grep "inet " | grep -v 127.0.0.1`

### 4. iPad 添加到主屏（获得原生 App 体验）

1. Safari 中打开系统地址
2. 点击底部分享按钮 → 「添加到主屏幕」
3. 以后直接从主屏图标启动

## 使用流程

```
添加学科 → 添加题目（手动或拍照识别）→ 开始考试 → 查看错题本 → AI 生成顺口溜
```

### 添加题目

- **手动输入**：点击「题目管理」→「＋ 手动输入」，填写题目内容、选项、答案
- **拍照识别**：点击「📷 拍照识别」，上传图片，系统自动 OCR 识别文字（需校对）

### 开始考试

1. 进入「✏️ 考试」标签
2. 选择学科、题目数量、考试时间（0 = 不限时）
3. 点击「开始答题」
4. 逐题作答，答完提交
5. 查看成绩和错题解析

### 错题本

- 答错的题目自动进入错题本
- 点击「🧠 生成记忆辅助」调用 AI 生成顺口溜
- 已掌握的题目点击「已掌握」移出错题本

## 数据存储

所有数据存储在浏览器的 **IndexedDB** 中（本地，不上传服务器）：

| 表 | 说明 |
|---|---|
| subjects | 学科列表 |
| questions | 题目（含图片 base64） |
| examRecords | 考试记录 |
| wrongQuestions | 错题本 |

## 注意事项

1. **Tesseract.js 中文识别**：首次加载需下载 ~40MB 中文训练数据，请耐心等待
2. **题目图片**：存储为 base64，大量图片可能占用较多空间，建议压缩后上传
3. **iPad 访问**：必须通过 HTTP（不能用 `file://`），需启动 `server.js`
4. **DeepSeek API Key**：配置在 `server.js` 的环境变量中，不会暴露给前端
6. **浏览器兼容**：Chrome / Safari / Edge 最新版，不支持 IE

## 文件结构

```
exam-system/
├── index.html          # 主页面（SPA）
├── css/style.css      # 响应式样式 + iPad 适配
├── js/
│   ├── storage.js     # IndexedDB 数据层（Dexie.js）
│   ├── llm.js         # DeepSeek API 调用（顺口溜生成）
│   ├── ocr.js         # Tesseract.js OCR 识别
│   ├── exam.js        # 考试逻辑（组卷/答题/批改）
│   ├── import.js      # 数据导入导出
│   └── app.js         # 主应用逻辑 & 路由
├── server.js          # 本地 HTTP 服务器（静态文件 + API 代理）
└── package.json
```

## 技术栈

- **前端**：纯 HTML/CSS/JS（无框架）
- **数据库**：IndexedDB（通过 Dexie.js 封装）
- **OCR**：Tesseract.js（浏览器端中文识别）
- **AI**：DeepSeek API（通过本地服务器代理，隐藏 Key）
- **服务器**：Express.js（仅用于静态文件服务和 API 代理）

## 常见问题

**Q：iPad 上打不开？**
A：确保电脑启动了 `server.js`，且 iPad 和电脑在同一 WiFi。检查防火墙是否允许端口 3000。

**Q：OCR 识别不准确？**
A：Tesseract.js 中文识别率约 70-80%，识别后请务必人工校对再保存。

**Q：DeepSeek API 怎么申请？**
A：访问 https://platform.deepseek.com 注册并充值，获取 API Key。

**Q：数据会丢失吗？**
A：浏览器数据持久化存储，但清除浏览器数据会丢失。建议定期使用「导出数据」功能备份。

**Q：能脱离电脑独立在 iPad 上运行吗？**
A：需要电脑运行 `server.js`（用于 API 代理和静态文件）。若不需要 AI 记忆辅助，可尝试将文件传到 iPad 用 Safari 直接打开 `index.html`（但 IndexedDB 在 `file://` 协议下可能受限）。
