#!/bin/bash

# 环境配置检查脚本

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 环境配置检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查环境变量
echo "📌 环境变量："
if [ -n "$QWEN_API_KEY" ]; then
    echo "  ✅ QWEN_API_KEY: ${QWEN_API_KEY:0:15}..."
else
    echo "  ❌ QWEN_API_KEY: 未设置"
fi

if [ -n "$QWEN_BASE_URL" ]; then
    echo "  ✅ QWEN_BASE_URL: $QWEN_BASE_URL"
else
    echo "  ⚠️  QWEN_BASE_URL: 使用默认值"
fi

echo ""
echo "📦 依赖检查："

# 检查 Node.js
if command -v node &> /dev/null; then
    echo "  ✅ Node.js $(node --version)"
else
    echo "  ❌ Node.js 未安装"
fi

# 检查 Python
if command -v python3 &> /dev/null; then
    echo "  ✅ Python $(python3 --version)"
else
    echo "  ❌ Python 未安装"
fi

# 检查 yt-dlp
if command -v yt-dlp &> /dev/null; then
    echo "  ✅ yt-dlp $(yt-dlp --version)"
else
    echo "  ❌ yt-dlp 未安装"
fi

# 检查 ffmpeg
if command -v ffmpeg &> /dev/null; then
    echo "  ✅ ffmpeg $(ffmpeg -version 2>&1 | head -n 1 | awk '{print $3}')"
else
    echo "  ❌ ffmpeg 未安装"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查是否所有依赖都就绪
NODE_OK=$(command -v node &> /dev/null && echo "1" || echo "0")
PYTHON_OK=$(command -v python3 &> /dev/null && echo "1" || echo "0")
YTDL_OK=$(command -v yt-dlp &> /dev/null && echo "1" || echo "0")
FFMPEG_OK=$(command -v ffmpeg &> /dev/null && echo "1" || echo "0")
API_OK=$( [ -n "$QWEN_API_KEY" ] && echo "1" || echo "0")

if [ "$NODE_OK" = "1" ] && [ "$PYTHON_OK" = "1" ] && [ "$YTDL_OK" = "1" ] && [ "$FFMPEG_OK" = "1" ] && [ "$API_OK" = "1" ]; then
    echo "✅ 所有依赖已就绪，可以开始使用！"
    echo ""
    echo "💡 在 Claude Code 中输入："
    echo '   "帮我分析这个视频：[视频链接]"'
else
    echo "⚠️  部分依赖缺失，请检查安装"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
