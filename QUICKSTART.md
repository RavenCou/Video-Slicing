# 快速开始指南

## ✅ 环境配置完成

所有依赖已成功安装！

### 已安装组件
- ✅ Node.js v25.2.1
- ✅ Python 3.12.12
- ✅ yt-dlp 2026.02.04
- ✅ ffmpeg 8.0.1
- ✅ node-fetch (Node.js 依赖)

### 环境变量
- ✅ QWEN_API_KEY 已配置

---

## 🚀 开始使用

### 方式 1：每次使用前加载环境变量

```bash
cd "/Users/raven/Documents/200 精进领域/Vibe Coding/爆款拆解仿写"
source setup.sh
```

### 方式 2：永久配置环境变量（推荐）

编辑你的 shell 配置文件（`~/.zshrc` 或 `~/.bash_profile`）：

```bash
# 添加以下内容
export QWEN_API_KEY=sk-9d8195c2f3024e4aada63b45187597b2
```

然后重新加载：
```bash
source ~/.zshrc
# 或
source ~/.bash_profile
```

---

## 💬 在 Claude Code 中使用

### 分析视频

```
帮我分析这个视频：https://www.xiaohongshu.com/explore/...
```

### 指定模板分析

```
使用详细模板分析这个视频：[链接]
使用快速模板分析这个视频：[链接]
```

### 仿写脚本

```
仿写这个脚本：改成美食教程风格
使用换场景模式仿写：把美妆改成美食
```

### 管理缓存

```
清理这个视频的缓存：[链接]
清理所有缓存
强制重新分析：[链接]
```

---

## 📁 文件位置

### Skill 目录
```
.claude/skills/viral-video-analyzer/
```

### 输出目录
```
output/scripts/          # 生成的脚本
cache/                   # 缓存文件
```

### 配置文件
```
config/fields.json       # 字段定义
config/settings.json     # 系统配置
templates/               # Prompt 模板
```

---

## 🎯 首次使用建议

1. **先用短视频测试**（< 1分钟）
2. **选择"智能关键帧采样"模式**（节省 API 成本）
3. **使用"默认模板"**（标准 5 字段）
4. **查看输出结果**后再决定是否仿写

---

## 🔧 常见问题

### Q: 提示环境变量未设置？
```bash
echo $QWEN_API_KEY
# 如果为空，运行：
source setup.sh
```

### Q: yt-dlp 下载失败？
```bash
# 更新 yt-dlp
pip3 install --break-system-packages --upgrade yt-dlp
```

### Q: 想修改输出字段？
编辑 `.claude/skills/viral-video-analyzer/config/fields.json`

### Q: 想创建自定义模板？
```bash
cp .claude/skills/viral-video-analyzer/templates/breakdown/default.md \
   .claude/skills/viral-video-analyzer/templates/breakdown/my-template.md
```

---

## 📚 更多文档

- [README.md](README.md) - 完整使用说明
- [架构设计文档](docs/plans/2025-02-04-viral-video-analyzer-design.md) - 技术架构
- [Skill 主文件](.claude/skills/viral-video-analyzer/skill.md) - Skill 详细说明

---

## ✨ 准备就绪！

现在你可以开始分析视频了！

在 Claude Code 中输入：
```
帮我分析这个视频：[你的视频链接]
```
