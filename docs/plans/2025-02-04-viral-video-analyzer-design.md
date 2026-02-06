# 爆款视频拆解仿写 Skill 架构设计

**创建日期：** 2025-02-04
**设计目标：** 为团队提供开箱即用的视频分析拆解和仿写工具

---

## 1. 整体架构

### 管道式架构

```
用户输入
  ↓
[下载器] ← yt-dlp + 缓存管理
  ↓
[分析器] ← Qwen VL-vision + ASR
  ↓
[拆解器] ← LLM 结构化提取
  ↓
[仿写器] ← LLM 创意重写
  ↓
输出
```

### 核心设计理念

- **单一职责**：每个阶段只做一件事，便于调试和替换
- **可组合**：支持跳过某些阶段（如已有视频文件，直接从第 2 步开始）
- **状态可恢复**：每个阶段产出持久化文件
- **平台无关**：通过 yt-dlp 统一处理不同平台

---

## 2. 目录结构

```
.claude/skills/viral-video-analyzer/
├── skill.md                    # Skill 主文件
├── templates/                  # Prompt 模板目录
│   ├── breakdown/              # 拆解器模板
│   │   ├── default.md          # 默认拆解模板
│   │   ├── detailed.md         # 精细拆解
│   │   └── fast.md             # 快速拆解
│   └── rewrite/                # 仿写器模板
│       ├── default.md          # 默认仿写模板
│       ├── change-scene.md     # 换场景仿写
│       ├── change-tone.md      # 换口吻仿写
│       └── remix.md            # 创意混剪仿写
├── config/                     # 配置文件
│   ├── fields.json             # 字段定义（单一数据源）
│   └── settings.json           # 默认模板选择、API 配置
├── utils/                      # 工具函数
│   ├── qwen-client.js          # 阿里云 API 封装
│   ├── video-processor.js      # 视频下载和采样
│   └── template-engine.js      # 模板渲染引擎
├── cache/                      # 缓存目录
│   ├── videos/                 # 视频文件
│   ├── audio/                  # 音频文件
│   ├── keyframes/              # 关键帧图片
│   └── analysis/               # 分析结果
├── output/                     # 输出目录
│   ├── scripts/                # 生成的脚本（Markdown）
│   └── pdf/                    # 导出的 PDF
└── logs/                       # 日志文件
```

---

## 3. 数据结构和模板系统

### 统一的表格结构

**拆解输出和仿写输出使用相同的表头：**

```markdown
| 序号 | 台词 | 景别 | 分镜名称 | 画面描述 |
|------|------|------|----------|----------|
| 1 | "今天给大家分享..." | 中景 | 开场白 | 主播面对镜头，手持产品... |
```

### 字段定义系统

**`config/fields.json`** - 字段定义（单一数据源）

```json
{
  "table_columns": [
    {"key": "序号", "type": "number", "required": true},
    {"key": "台词", "type": "text", "required": true},
    {"key": "景别", "type": "enum", "options": ["特写", "近景", "中景", "全景", "远景"]},
    {"key": "分镜名称", "type": "text", "max_length": 10},
    {"key": "画面描述", "type": "text", "min_length": 50}
  ]
}
```

### Prompt 模板设计

每个模板文件包含：
1. **系统提示词**：定义 LLM 的角色和任务
2. **输入变量**：如 `{video_context}`、`{user_instruction}`
3. **输出格式**：明确要求的结构化输出（JSON/Markdown）
4. **示例**：给出 1-2 个参考样例

**示例 - `templates/breakdown/default.md`：**

```markdown
# 角色
你是一位专业的视频脚本拆解师，擅长将短视频拆解为可复用的分镜脚本。

# 任务
分析视频内容，提取以下信息：
- 分镜编号（从 1 开始）
- 台词（字幕/语音内容）
- 景别（特写/近景/中景/全景/远景）
- 分镜名称（3-5 字概括）
- 画面描述（50-100 字，包含主体、动作、背景、运镜）

# 输入
- 视频画面理解：{visual_context}
- 语音识别结果：{asr_result}
- 视频元数据：{video_metadata}

# 输出格式
Markdown 表格

# 示例
| 序号 | 台词 | 景别 | 分镜名称 | 画面描述 |
|------|------|------|----------|----------|
| 1 | "今天给大家分享..." | 中景 | 开场白 | 主播面对镜头，手持产品，微笑着开场 |
...
```

### 动态模板渲染

Skill 在运行时会：
1. 读取 `config/fields.json`
2. 将字段定义注入到 Prompt 模板中
3. 拆解器和仿写器都使用**相同**的字段约束
4. 确保输出结构一致

### 自定义字段

如果同事想增加字段（如"情绪标签"、"时长"）：

**步骤 1：** 修改 `config/fields.json`
```json
{
  "table_columns": [
    // ... 原有字段
    {"key": "情绪", "type": "enum", "options": ["兴奋", "平静", "紧张"]},
    {"key": "时长(秒)", "type": "number"}
  ]
}
```

**步骤 2：** 拆解器和仿写器**自动适配**新字段，无需修改模板

---

## 4. 技术实现

### 核心 API 调用模块

**阿里云 API 封装：**

```javascript
// utils/qwen-client.js
class QwenClient {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  // 视觉理解 - 分析关键帧
  async analyzeVideoFrames(imageBase64Array) {
    // 调用 qwen-vl-max 或 qwen-vl-plus
    // 返回：场景识别、人物动作、画面描述
  }

  // 语音识别 - 转录音频
  async transcribeAudio(audioFile) {
    // 调用 qwen-audio-turbo 或 paraformer-realtime-v2
    // 返回：时间戳化的文本转录
  }

  // 通用 LLM - 执行 Prompt 模板
  async executeTemplate(template, variables) {
    // 渲染模板 + 调用 qwen-plus/qwen-max
    // 返回：结构化输出（JSON/Markdown）
  }
}
```

### 视频处理管道

**阶段 1：视频下载**
```bash
# 使用 yt-dlp 下载
yt-dlp -f "best[ext=mp4]" -o "%(title)s.%(ext)s" [URL]

# 同时提取音频轨道
yt-dlp -x --audio-format mp3 -o "%(title)s.%(ext)s" [URL]
```

**阶段 2：智能采样**
```javascript
// 动态计算采样间隔
function calculateInterval(duration) {
  const targetFrames = 20;  // 目标：分析 15-30 个关键帧
  return Math.ceil(duration / targetFrames);
}

// 示例：
// 1 分钟视频 → 每 3 秒采样 1 帧 → 共 20 帧
// 3 分钟视频 → 每 9 秒采样 1 帧 → 共 20 帧
// 5 分钟视频 → 每 15 秒采样 1 帧 → 共 20 帧

async sampleVideoKeyframes(videoFile, interval) {
  // 使用 ffmpeg 截图
  // 返回关键帧的 base64 编码
}
```

**阶段 3：并行分析**
```javascript
// 视觉和语音并行处理（节省时间）
const [visualResult, asrResult] = await Promise.all([
  qwen.analyzeVideoFrames(keyframes),
  qwen.transcribeAudio(audioFile)
]);
```

**阶段 4：信息融合**
```javascript
// 将视觉 + ASR 结果合并，形成完整上下文
const videoContext = mergeContexts({
  visual: visualResult,
  audio: asrResult,
  metadata: { duration, platform, url }
});
```

### 视觉分析方案选择

**方案 A：直接输入视频**
- 适用：< 60 秒短视频
- 优点：保留完整时序信息
- 缺点：API 调用次数较多

**方案 B：智能关键帧采样（推荐）**
- 适用：1-5 分钟中视频
- 优点：成本可控，可调试
- 缺点：丢失部分时序信息

**混合策略（推荐）：**
- 根据视频长度动态选择
- 或通过交互让用户选择

### 缓存策略

```javascript
// 缓存结构
.cache/
├── videos/
│   └── [hash(url)].mp4          # 视频文件
├── audio/
│   └── [hash(url)].mp3          # 音频文件
├── keyframes/
│   └── [hash(url)]/             # 关键帧图片
└── analysis/
    └── [hash(url)].json         # 分析结果
```

**缓存逻辑：**
- URL 哈希作为缓存键
- 检查缓存是否存在 → 存在则跳过下载/分析
- 提供 `--force-refresh` 参数强制重新分析

---

## 5. 交互式配置

### 首次运行引导

```
📹 开始分析视频...

请输入视频链接（支持抖音/小红书/B站）:
> https://www.xiaohongshu.com/explore/...

检测到视频时长：2分34秒

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
选择视觉分析方案：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] 直接视频分析（推荐）
    • 优点：保留完整时序信息，理解动作连续性
    • 缺点：API 调用次数较多
    • 适用：< 3 分钟的短视频

[2] 智能关键帧采样
    • 优点：成本可控，可调试，分析 20-30 个关键帧
    • 缺点：丢失部分时序信息
    • 适用：中长视频（1-5 分钟）

[3] 自定义采样间隔
    • 每 N 秒提取 1 帧，自行控制精度

请选择 [1/2/3]（默认 2）:
> 2

已选择：智能关键帧采样
预计分析帧数：20 帧（每 7 秒采样）

继续？[Y/n]
> y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
选择拆解模板：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] default（默认）- 标准分镜拆解
[2] detailed - 详细拆解（增加情绪、时长字段）
[3] fast - 快速拆解（只保留关键镜头）

请选择 [1/2/3]（默认 1）:
> 1

开始分析...
```

### 配置持久化

**`config/user-preferences.json`**
```json
{
  "analysis_method": "keyframe_sampling",
  "sampling_interval": "auto",
  "breakdown_template": "default",
  "rewrite_template": "default",
  "output_format": ["markdown", "table"],
  "platform": "xiaohongshu"
}
```

**后续运行：**
```
检测到用户配置：
- 分析方案：智能关键帧采样
- 拆解模板：default

使用现有配置？[Y/n]（或输入 --reset 重置）
```

### 命令行参数模式

```bash
# 跳过交互，直接指定参数
/video-analyzer analyze [URL] \
  --method keyframe \
  --interval 5 \
  --template detailed \
  --output script.md
```

---

## 6. 仿写阶段交互流程

### 拆解完成后的用户确认

```
✅ 视频分析完成！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
拆解结果预览
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
视频信息：
• 标题：《3分钟学会爆款视频剪辑技巧》
• 时长：2分34秒
• 平台：小红书
• 镜头数：24 个

分镜脚本（前 5 个）：
┌──────┬────────────┬────┬──────────┬──────────────────┐
│ 序号 │ 台词        │ 景别│ 分镜名称 │ 画面描述         │
├──────┼────────────┼────┼──────────┼──────────────────┤
│ 1    │ "今天教大家..." │ 中景│ 开场白  │ 主播手持产品... │
│ 2    │ "首先..."      │ 特写│ 操作演示 │ 手部动作特写... │
...

完整脚本已保存到：output/scripts/2025-02-04_视频标题.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
下一步操作
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] 开始仿写这个脚本
[2] 重新拆解（选择其他模板）
[3] 查看完整拆解结果
[4] 退出

请选择 [1/2/3/4]:
> 1
```

### 仿写指令输入

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
开始仿写
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

当前模板：default（通用仿写）

请输入仿写要求（可以描述：改场景、换口吻、目标受众等）:
> 把这个美妆教程改成美食教程，保持同样的快节奏风格

正在生成仿写脚本...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
仿写策略选择
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
根据你的要求，推荐以下策略：

[1] 换场景（推荐）
    • 保留：节奏、镜头切换频率
    • 替换：美妆产品 → 食材/厨具
    • 替换：化妆动作 → 烹饪动作

[2] 完全重写
    • 只保留原视频的结构框架
    • 根据你的要求自由创作

请选择 [1/2]（默认 1）:
> 1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
选择仿写模板
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] default - 默认仿写
[2] change-scene - 换场景（保持结构）
[3] creative - 创意混剪

请选择 [1/2/3]（自动推荐：2）:
>

已自动选择：change-scene
```

### 仿写结果展示

```
✅ 仿写完成！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
仿写结果预览（前 5 个镜头）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
原版 → 仿写对比：

┌──────┬──────────────┬──────────────────┬──────────────┬──────────────────┐
│      │ 原版台词      │ 仿写台词          │ 原版画面      │ 仿写画面          │
├──────┼──────────────┼──────────────────┼──────────────┼──────────────────┤
│ 1    │ "今天教大家..." │ "姐妹们看过来！" │ 手持粉底...  │ 手持食材...      │
│ 2    │ "首先打底..."   │ "先准备食材..." │ 手部抹粉底... │ 切菜动作...      │
...

完整仿写脚本：output/scripts/2025-02-04_视频标题_仿写.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
后续操作
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] 对这个仿写结果继续调整
[2] 拆解其他视频
[3] 导出为可拍摄脚本（PDF/Word）
[4] 退出

请选择 [1/2/3/4]:
```

### 迭代优化

```
选择 [1] 后：

请输入调整要求:
> 把第3-5个镜头的节奏加快一点，画面描述更详细

正在重新生成...
✅ 调整完成！已更新脚本
```

---

## 7. 错误处理

### 快速失败策略

```javascript
class VideoAnalyzerError extends Error {
  constructor(stage, message, details) {
    super(message);
    this.stage = stage;        // 'download' | 'analyze' | 'breakdown' | 'rewrite'
    this.details = details;    // 详细错误信息
    this.recoverable = false;  // 是否可恢复
  }
}
```

### 分阶段错误处理

**阶段 1：视频下载失败**
```
❌ 下载失败

错误信息：无法从该链接下载视频
链接：https://www.xiaohongshu.com/explore/...
原因：平台限制或链接已失效

建议：
• 检查链接是否可访问
• 尝试使用浏览器打开链接
• 如果是私密内容，请提供公开链接

[R] 重试   [C] 取消   [I] 输入其他链接
```

**阶段 2：API 调用失败**
```
❌ 视觉分析失败

错误信息：阿里云 API 调用失败
错误码：401 Authentication Failed
原因：API 密钥无效或已过期

检查清单：
• 确认已设置环境变量：export QWEN_API_KEY=sk-xxx
• 验证密钥是否有效：https://dashscope.aliyuncs.com/
• 检查账户余额是否充足

[1] 重新输入密钥   [2] 配置环境变量后重试   [3] 退出
```

**阶段 3：拆解失败**
```
❌ 脚本拆解失败

错误信息：无法从视频中提取有效信息
可能原因：
• 视频无语音内容（ASR 返回空）
• 画面过于模糊（视觉理解失败）
• 视频格式不支持

调试信息：
• ASR 结果：[空]
• 视觉分析：成功识别了 8 个场景
• 建议尝试：直接视频分析模式

[1] 重试（使用其他分析模式）   [2] 查看详细日志   [3] 退出
```

**阶段 4：仿写失败**
```
❌ 仿写生成失败

错误信息：LLM 返回格式不符合要求
期望格式：Markdown 表格
实际输出：自由文本段落

原因：模型未遵循输出格式约束

[1] 重试（使用不同的仿写模板）   [2] 手动调整指令   [3] 退出
```

### 边界情况处理

**情况 1：视频没有语音**
```javascript
if (asrResult.text.trim() === '') {
  console.warn('⚠️  警告：视频无语音内容');
  console.log('将仅基于视觉画面进行拆解');
  // 继续执行，但标记为"无台词"脚本
}
```

**情况 2：视频时长异常**
```javascript
if (duration < 5) {
  throw new VideoAnalyzerError('download',
    '视频过短（< 5秒），无法进行有效拆解');
}

if (duration > 300) {
  console.warn('⚠️  警告：视频较长（> 5分钟），分析可能耗时较长');
  const confirm = await askUser('是否继续？');
  if (!confirm) throw new Error('用户取消');
}
```

**情况 3：平台不支持**
```javascript
const supportedPlatforms = ['douyin.com', 'xiaohongshu.com', 'bilibili.com'];
if (!supportedPlatforms.some(p => url.includes(p))) {
  console.warn('⚠️  警告：该平台未经过充分测试');
  console.log('将尝试使用 yt-dlp 下载，可能失败');
  const confirm = await askUser('是否继续？');
  if (!confirm) throw new Error('用户取消');
}
```

---

## 8. 完整工作流示例

### 用户使用流程

**场景：分析一个小红书爆款视频并仿写**

```bash
# 步骤 1：触发 skill
Claude Code> 帮我分析这个小红书视频：https://www.xiaohongshu.com/explore/...

# 步骤 2：交互式配置（首次运行）
请输入视频链接: > [已输入]
检测到视频时长：2分34秒

选择视觉分析方案 [1/2/3]: > 2
选择拆解模板 [1/2/3]: > 1

# 步骤 3：自动执行
✓ 下载视频中...
✓ 提取关键帧（20 帧）...
✓ 视觉分析中...
✓ 语音转录中...
✓ 脚本拆解中...

✅ 分析完成！

# 步骤 4：查看结果
分镜脚本已保存：output/scripts/2025-02-04_美妆教程.md

[1] 开始仿写   [2] 重新拆解   [3] 退出
> 1

# 步骤 5：输入仿写指令
请输入仿写要求:
> 改成美食教程，保持快节奏

✅ 仿写完成！
仿写脚本：output/scripts/2025-02-04_美妆教程_仿写.md

# 步骤 6：导出
[1] 继续调整   [2] 导出 PDF   [3] 退出
> 2
✓ 已导出：output/scripts/2025-02-04_美妆教程_仿写.pdf
```

---

## 9. 技术依赖

### 核心依赖
- **yt-dlp**：视频下载
- **ffmpeg**：视频处理和关键帧提取
- **Node.js / Python**：运行环境（待定）

### AI 服务
- **阿里云 DashScope**
  - BaseURL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - 视觉模型: `qwen-vl-max` 或 `qwen-vl-plus`
  - 语音模型: `qwen-audio-turbo` 或 `paraformer-realtime-v2`
  - 通用模型: `qwen-plus` 或 `qwen-max`

### 配置方式
- API 密钥通过环境变量配置：`export QWEN_API_KEY=sk-xxx`

---

## 10. 特性总结

### 核心特性
✅ 多平台支持（抖音、小红书、B站等）
✅ 零代码可配置（Prompt 模板系统）
✅ 智能缓存管理
✅ 交互式引导
✅ 快速失败错误处理
✅ 结构化输出（Markdown + 表格）
✅ 迭代优化

### 扩展性
✅ 自定义字段（修改 JSON 配置）
✅ 自定义模板（复制编辑 .md 文件）
✅ 多种分析模式（直接视频 / 关键帧采样）
✅ 多种仿写策略（换场景 / 换口吻 / 创意混剪）

### 用户友好
✅ 首次运行引导
✅ 配置持久化
✅ 进度提示
✅ 友好的错误信息
✅ 调试模式

---

## 11. 下一步

完成架构设计后，可以进入实施阶段：

1. **环境准备**：安装依赖（yt-dlp、ffmpeg）
2. **Skill 实现**：编写 skill.md 和核心逻辑
3. **模板创建**：创建默认的拆解和仿写模板
4. **测试验证**：使用真实视频测试完整流程
5. **文档完善**：编写用户使用指南

是否继续进入实施阶段？
