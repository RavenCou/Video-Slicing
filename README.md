# 爆款视频拆解仿写工具

一个开箱即用的视频分析拆解和仿写工具，帮助团队快速拆解爆款视频并创作新脚本。

## 功能特性

- 🎬 **多平台支持** - 抖音、小红书、B站等平台视频下载
- 🧠 **AI 智能分析** - 阿里云 Qwen 视觉理解 + 语音识别
- 📝 **自动拆解脚本** - 提取分镜、台词、景别、画面描述
- ✍️ **智能仿写** - 换场景、换口吻、创意混剪
- 🎯 **零代码定制** - 通过 Prompt 模板自定义业务逻辑
- 💾 **智能缓存** - 避免重复下载和分析

## 快速开始

### 1. 安装依赖

```bash
# 安装 yt-dlp (视频下载)
pip install yt-dlp

# 安装 ffmpeg (视频处理)
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows: 从 https://ffmpeg.org/download.html 下载
```

### 2. 配置 API 密钥

```bash
# 设置阿里云 API 密钥
export QWEN_API_KEY=sk-your-api-key-here
```

获取 API 密钥：https://dashscope.aliyuncs.com/

### 3. 开始使用

在 Claude Code 中输入：

```
帮我分析这个视频：https://www.xiaohongshu.com/explore/...
```

## 使用流程

### 第一步：分析视频

```
请输入视频链接: > https://www.xiaohongshu.com/explore/...

检测到视频时长：2分34秒

选择视觉分析方案:
[1] 直接视频分析（< 3分钟）
[2] 智能关键帧采样（1-5分钟）★推荐
[3] 自定义采样间隔

请选择 [1/2/3]（默认 2）: > 2

选择拆解模板:
[1] default - 标准拆解
[2] detailed - 详细拆解
[3] fast - 快速拆解

请选择 [1/2/3]（默认 1）: > 1

开始分析...
✓ 下载视频中...
✓ 提取关键帧（20 帧）...
✓ 视觉分析中...
✓ 语音转录中...
✓ 脚本拆解中...

✅ 分析完成！
```

### 第二步：查看结果

```markdown
| 序号 | 台词 | 景别 | 分镜名称 | 画面描述 |
|------|------|------|----------|----------|
| 1 | 姐妹们看过来，今天分享一款超好用的底妆 | 中景 | 开场介绍 | 主播面对镜头... |
| 2 | [无台词] | 特写 | 产品展示 | 手部特写镜头... |
| 3 | 这款底妆遮瑕力超强，而且非常轻薄 | 近景 | 效果讲解 | 主播近距离展示... |
```

### 第三步：仿写脚本（可选）

```
请输入仿写要求:
> 改成美食教程，保持快节奏

选择仿写策略:
[1] 换场景（推荐）
[2] 完全重写

请选择 [1/2]（默认 1）: > 1

✅ 仿写完成！
```

## 输出示例

### 拆解结果

```markdown
# 视频拆解脚本

**视频信息**
- 标题：《3分钟学会爆款视频剪辑技巧》
- 时长：2分34秒
- 平台：小红书
- 镜头数：24 个

**分镜脚本**

| 序号 | 台词 | 景别 | 分镜名称 | 画面描述 |
|------|------|------|----------|----------|
| 1 | "今天教大家..." | 中景 | 开场白 | 主播手持产品，微笑着开场 |
| 2 | "首先..." | 特写 | 操作演示 | 手部动作特写 |
...
```

### 仿写结果

```markdown
# 仿写脚本

**原视频：** 美妆教程
**新主题：** 美食教程
**仿写策略：** 换场景（保持结构）

| 序号 | 台词 | 景别 | 分镜名称 | 画面描述 |
|------|------|------|----------|----------|
| 1 | "宝子们看过来，今天教你一道超好吃的家常菜" | 中景 | 开场介绍 | 厨师面对镜头... |
| 2 | [无台词] | 特写 | 食材展示 | 手部轻捏食材... |
...
```

## 自定义配置

### 1. 修改字段定义

编辑 `.claude/skills/viral-video-analyzer/config/fields.json`：

```json
{
  "table_columns": [
    {"key": "序号", "type": "number", "required": true},
    {"key": "台词", "type": "text", "required": true},
    {"key": "景别", "type": "enum", "options": ["特写", "近景", "中景", "全景", "远景"]},
    {"key": "分镜名称", "type": "text", "max_length": 10},
    {"key": "画面描述", "type": "text", "min_length": 30, "max_length": 150},
    {"key": "情绪", "type": "enum", "options": ["兴奋", "平静", "紧张"], "required": false}
  ]
}
```

### 2. 创建自定义模板

```bash
# 复制默认模板
cp .claude/skills/viral-video-analyzer/templates/breakdown/default.md \
   .claude/skills/viral-video-analyzer/templates/breakdown/my-template.md

# 编辑模板
vim .claude/skills/viral-video-analyzer/templates/breakdown/my-template.md
```

### 3. 切换默认模板

编辑 `.claude/skills/viral-video-analyzer/config/settings.json`：

```json
{
  "templates": {
    "default_breakdown": "my-template",
    "default_rewrite": "change-scene"
  }
}
```

## 仿写模式

### 1. 默认仿写
根据用户要求自由创作

```
仿写这个脚本：改成美食教程风格
```

### 2. 换场景仿写
保持结构、节奏，只替换主题

```
使用换场景模式：把美妆改成美食
```

### 3. 换口吻仿写
保持内容，调整语气

```
使用换口吻模式：改成专业讲师风格
```

### 4. 创意混剪
自由重组镜头

```
使用创意混剪：倒叙结构，加快节奏
```

## 命令参考

### 分析视频

```
# 对话式
帮我分析这个视频：[链接]

# 指定模板
使用详细模板分析：[链接]

# 指定模式
使用关键帧采样分析：[链接]
```

### 仿写脚本

```
# 仿写
仿写这个脚本：改成美食教程

# 指定模式
使用换场景模式仿写

# 继续调整
把第3-5个镜头节奏加快
```

### 缓存管理

```
# 清理特定缓存
清理 [链接] 的缓存

# 清理所有缓存
清理所有缓存

# 强制重新分析
强制重新分析：[链接]
```

## 常见问题

### Q: 视频下载失败？

1. 确认链接可以正常访问
2. 更新 yt-dlp：`pip install -U yt-dlp`
3. 检查是否为付费内容或需要登录

### Q: API 调用失败？

1. 检查环境变量：`echo $QWEN_API_KEY`
2. 验证密钥：https://dashscope.aliyuncs.com/
3. 检查账户余额

### Q: 分析速度慢？

1. 使用关键帧采样模式
2. 增大采样间隔
3. 使用缓存避免重复分析

### Q: 拆解结果不准确？

1. 尝试详细模板 (detailed)
2. 尝试直接视频分析模式
3. 优化 Prompt 模板

## 文件结构

```
.claude/skills/viral-video-analyzer/
├── skill.md                    # Skill 主文件
├── templates/                  # Prompt 模板
│   ├── breakdown/              # 拆解器模板
│   └── rewrite/                # 仿写器模板
├── config/                     # 配置文件
│   ├── fields.json             # 字段定义
│   └── settings.json           # 系统配置
├── utils/                      # 工具函数
│   ├── qwen-client.js          # 阿里云 API
│   ├── video-processor.js      # 视频处理
│   └── template-engine.js      # 模板引擎
├── cache/                      # 缓存目录
└── output/                     # 输出目录
    └── scripts/                # 生成的脚本
```

## 技术栈

- **视频下载**: yt-dlp
- **视频处理**: ffmpeg
- **AI 服务**: 阿里云 Qwen (VL-vision + ASR + LLM)
- **模板系统**: 自研 Prompt 模板引擎
- **运行环境**: Node.js

## 架构设计

详细架构设计文档：[docs/plans/2025-02-04-viral-video-analyzer-design.md](docs/plans/2025-02-04-viral-video-analyzer-design.md)

## 版本历史

### v1.0.0 (2025-02-04)
- 初始版本发布
- 支持多平台视频下载
- 集成阿里云 Qwen 多模态
- Prompt 模板系统
- 智能缓存管理

## 许可证

MIT License

## 联系方式

如有问题或建议，请联系团队。
