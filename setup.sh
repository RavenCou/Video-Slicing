#!/bin/bash

# 爆款视频拆解仿写工具 - 环境配置脚本

echo "🚀 设置环境变量..."

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 加载 .env 文件
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
    echo "✓ 环境变量已加载"
    echo "  QWEN_API_KEY=${QWEN_API_KEY:0:10}..."
else
    echo "⚠️  警告：.env 文件不存在"
    echo "  请复制 .env.example 为 .env 并填入 API 密钥"
fi

# 检查依赖
echo ""
echo "🔍 检查依赖..."

# 检查 Node.js
if command -v node &> /dev/null; then
    echo "✓ Node.js $(node --version)"
else
    echo "✗ Node.js 未安装"
fi

# 检查 Python
if command -v python3 &> /dev/null; then
    echo "✓ Python $(python3 --version)"
else
    echo "✗ Python 未安装"
fi

# 检查 yt-dlp
if command -v yt-dlp &> /dev/null; then
    echo "✓ yt-dlp 已安装"
else
    echo "✗ yt-dlp 未安装"
fi

# 检查 ffmpeg
if command -v ffmpeg &> /dev/null; then
    echo "✓ ffmpeg 已安装"
else
    echo "✗ ffmpeg 未安装"
fi

echo ""
echo "✅ 环境配置完成！"
echo ""
echo "💡 使用提示："
echo "  在 Claude Code 中输入："
echo "  \"帮我分析这个视频：https://www.xiaohongshu.com/explore/...\""
