#!/usr/bin/env node

/**
 * 爆款视频拆解仿写工具 - 主执行脚本
 */

const fs = require('fs');
const path = require('path');

// 加载配置
const config = require('./config/settings.json');
const fields = require('./config/fields.json');

// 加载工具类
const QwenClient = require('./utils/qwen-client');
const VideoProcessor = require('./utils/video-processor');
const TemplateEngine = require('./utils/template-engine');

class VideoAnalyzer {
  constructor() {
    // 计算项目根目录（向上3级：viral-video-analyzer/ -> skills/ -> .claude/ -> 项目根目录）
    const projectRoot = path.resolve(__dirname, '../../..');

    this.config = {
      ...config,
      fields,
      cache_dir: path.join(__dirname, 'cache'),
      template_dir: path.join(__dirname, 'templates'),
      output_dir: path.join(projectRoot, 'output')  // 输出到项目根目录的 output/
    };

    this.qwen = new QwenClient({
      api_key: process.env.QWEN_API_KEY,
      base_url: config.api.base_url,
      models: config.api.models,
      flash_models: config.api.flash_models,
      use_flash: config.api.use_flash || false,
      timeout: config.api.timeout
    });

    this.video = new VideoProcessor({
      cache_dir: this.config.cache_dir,
      min_duration: config.video.min_duration,
      max_duration: config.video.max_duration,
      supported_platforms: config.video.supported_platforms
    });

    this.template = new TemplateEngine(this.config);
  }

  /**
   * 分析视频
   */
  async analyze(url, options = {}) {
    try {
      console.log('📹 开始分析视频...\n');

      // 计算URL哈希用于缓存
      const crypto = require('crypto');
      const urlHash = crypto.createHash('md5').update(url).digest('hex');

      // 1. 下载视频和提取音频
      console.log('📥 步骤 1/5: 下载视频...');
      const { videoPath, audioPath, metadata } = await this.video.downloadVideo(url, {
        forceRefresh: options.forceRefresh
      });

      console.log(`   ✓ 时长: ${metadata.duration}秒`);
      console.log(`   ✓ 分辨率: ${metadata.width}x${metadata.height}`);
      console.log(`   ✓ 大小: ${(metadata.size / 1024 / 1024).toFixed(2)}MB\n`);

      // 2. 验证时长
      this.video.validateDuration(metadata.duration);

      // 3. 提取关键帧
      console.log('🎞️  步骤 2/5: 提取关键帧...');

      // 使用固定间隔采样,更密集地捕获镜头变化
      let interval;
      if (config.video.sampling.use_fixed_interval) {
        interval = config.video.sampling.default_interval || 3;
        console.log(`   使用固定采样间隔: ${interval}秒/帧`);
      } else {
        interval = this.video.calculateInterval(
          metadata.duration,
          config.video.sampling.target_frames
        );
        console.log(`   采样间隔: ${interval}秒/帧`);
      }

      const keyframePaths = await this.video.extractKeyframes(videoPath, interval, {
        forceRefresh: options.forceRefresh
      });
      console.log(`   ✓ 提取了 ${keyframePaths.length} 个关键帧\n`);

      // 4. AI分析（视觉 + 语音）
      console.log('🤖 步骤 3/5: AI分析...');

      // 执行视觉分析
      const visualResult = await this.analyzeVisual(keyframePaths, interval);

      // 执行语音识别（如果失败则继续）
      let asrResult;
      try {
        asrResult = await this.analyzeAudio(audioPath);
        console.log('   ✓ 语音转录完成');

        // 保存ASR结果到缓存
        const asrCachePath = path.join(this.config.cache_dir, 'analysis', `${urlHash}-asr.json`);
        fs.writeFileSync(asrCachePath, JSON.stringify(asrResult, null, 2), 'utf-8');
        console.log(`   ✓ ASR结果已缓存`);
      } catch (err) {
        console.warn('   ⚠️  语音识别失败:', err.message);
        console.warn('   将仅基于视觉画面分析');
        asrResult = { text: '[语音识别暂不可用，仅基于视觉分析]' };
      }

      console.log('   ✓ 视觉分析完成\n');

      // 保存视觉分析结果到缓存
      const visualCachePath = path.join(this.config.cache_dir, 'analysis', `${urlHash}-visual.json`);
      fs.writeFileSync(visualCachePath, JSON.stringify(visualResult, null, 2), 'utf-8');
      console.log(`   ✓ 视觉分析结果已缓存\n`);

      // 5. 脚本拆解
      console.log('📝 步骤 4/5: 脚本拆解...');
      const breakdownResult = await this.breakdownScript({
        metadata,
        visualResult,
        asrResult
      }, options.template || 'default');

      // 6. 展示表格预览
      console.log('📊 脚本预览：');
      console.log(breakdownResult.trim().substring(0, 500) + '...\n');
      console.log('   ✓ 脚本拆解完成\n');

      // 7. 保存结果
      console.log('💾 步骤 5/5: 保存结果...');
      const { mdPath, htmlPath } = await this.saveResult({
        url,
        metadata,
        script: breakdownResult
      });

      console.log(`\n✅ 分析完成！\n`);

      // 自动打开 HTML 文件（如果配置启用）
      if (this.config.ui?.auto_confirm !== false && this.config.output?.auto_open_html) {
        const { exec } = require('child_process');
        console.log(`🌐 正在浏览器中打开...`);
        exec(`open "${htmlPath}"`, (error) => {
          if (error) {
            console.log(`   💡 手动打开: open "${htmlPath}"`);
          }
        });
      } else {
        console.log(`💡 提示：用浏览器打开 HTML 文件可以查看更美观的表格`);
        console.log(`   open "${htmlPath}"\n`);
      }

      return {
        success: true,
        script: breakdownResult,
        metadata,
        mdPath,
        htmlPath
      };

    } catch (error) {
      console.error('\n❌ 分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 视觉分析
   */
  async analyzeVisual(imagePaths, interval = 3) {
    const base64Images = await this.video.imagesToBase64(imagePaths);

    const prompt = `请仔细分析这 ${base64Images.length} 个视频关键帧（按时间顺序，每${interval}秒采样一帧），识别并描述所有镜头变化：

**对于每个镜头，请详细描述**：
1. **镜头序号**：从1开始，每次场景/动作/角度变化即为新镜头
2. **时段**：根据关键帧的采样间隔（每${interval}秒），推算每个镜头的起止时间
   - 格式：MM:SS-MM:SS（分:秒-分:秒）
   - 第1个关键帧在 00:00，第2个在 00:${interval.toString().padStart(2, '0')}，依此类推
   - 镜头的起止时间应该与关键帧的时间戳对应
3. **场景**：室内/室外、具体地点、环境特征
4. **人物**：人物数量、位置、动作（在做什么）、表情、手势
5. **镜头特点**：
   - 景别（特写/近景/中景/全景/远景）
   - 运镜方式（固定/推/拉/摇/移/跟/手持晃动等）
   - 拍摄角度（平视/俯拍/仰拍/侧拍等）
6. **画面元素**：出现的物品、文字、图标、字幕等

**重要**：
- 仔细识别相邻帧之间的差异，哪怕细微变化也可能是镜头切换
- 视频可能包含30个以上的镜头，请完整识别所有镜头
- 按时间顺序逐帧分析，不要遗漏任何镜头变化
- **每个镜头必须标注准确的时间段（基于${interval}秒采样间隔推算）**

请用结构化的方式描述，方便后续提取完整的分镜脚本（包含时段信息）。`;

    return await this.qwen.analyzeVideoFrames(base64Images, prompt);
  }

  /**
   * 音频转录
   */
  async analyzeAudio(audioPath) {
    return await this.qwen.transcribeAudio(audioPath);
  }

  /**
   * 脚本拆解
   */
  async breakdownScript(context, templateName) {
    const { systemPrompt, userPrompt } = this.template.buildBreakdownPrompt(
      templateName,
      context
    );

    return await this.qwen.executeTemplate(systemPrompt, userPrompt, {
      temperature: 0.7,
      max_tokens: 4000
    });
  }

  /**
   * 保存结果
   */
  async saveResult(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const title = data.metadata.title || '视频';
    const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');

    // 获取当前日期 (YYYY-MM-DD 格式)
    const today = new Date().toISOString().slice(0, 10);

    // 确保输出目录存在（按日期归类）
    const scriptsDir = path.join(this.config.output_dir, 'scripts', today);
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    // 保存 Markdown 格式
    const mdFilename = `${timestamp}_${safeTitle}.md`;
    const mdPath = path.join(scriptsDir, mdFilename);
    const mdContent = this.formatOutput(data);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    // 保存 HTML 格式
    const htmlFilename = `${timestamp}_${safeTitle}.html`;
    const htmlPath = path.join(scriptsDir, htmlFilename);
    const htmlContent = this.formatHTMLOutput(data);
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

    console.log(`   ✓ Markdown: ${mdPath}`);
    console.log(`   ✓ HTML: ${htmlPath}`);

    return { mdPath, htmlPath };
  }

  /**
   * 格式化输出
   */
  formatOutput(data) {
    const title = data.metadata.title || '未知标题';
    return `# 视频拆解脚本

**分析时间**: ${new Date().toLocaleString('zh-CN')}

**视频信息**:
- 标题：${title}
- 时长：${data.metadata.duration}秒
- 分辨率：${data.metadata.width}x${data.metadata.height}
- 视频链接：${data.url}

---

## 分镜脚本

${data.script}

---

*本脚本由 AI 自动生成，仅供参考*
`;
  }

  /**
   * 格式化 HTML 输出
   */
  formatHTMLOutput(data) {
    const title = data.metadata.title || '未知标题';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>视频拆解脚本 - ${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header .meta { font-size: 14px; opacity: 0.9; }
        .info {
            padding: 20px 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        .info p { margin: 5px 0; color: #495057; }
        .info strong { color: #212529; }
        .table-container {
            padding: 30px;
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        thead {
            background: #667eea;
            color: white;
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
        }
        th { font-weight: 600; white-space: nowrap; }
        tr:hover { background: #f8f9fa; }
        td:nth-child(1) { font-weight: 600; color: #667eea; }
        td:nth-child(2) {
            min-width: 200px;
            color: #495057;
        }
        td:nth-child(3) {
            font-size: 12px;
            padding: 8px 15px;
        }
        td:nth-child(4) {
            font-weight: 500;
            color: #212529;
        }
        td:nth-child(5) {
            min-width: 300px;
            color: #6c757d;
            font-size: 13px;
            line-height: 1.5;
        }
        .footer {
            padding: 20px 30px;
            text-align: center;
            color: #6c757d;
            font-size: 13px;
            border-top: 1px solid #e9ecef;
            background: #f8f9fa;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 视频拆解脚本</h1>
            <div class="meta">分析时间: ${new Date().toLocaleString('zh-CN')}</div>
        </div>

        <div class="info">
            <p><strong>📺 标题:</strong> ${title}</p>
            <p><strong>⏱️ 时长:</strong> ${data.metadata.duration}秒</p>
            <p><strong>📐 分辨率:</strong> ${data.metadata.width}x${data.metadata.height}</p>
            <p><strong>🔗 链接:</strong> <a href="${data.url}" target="_blank">${data.url}</a></p>
        </div>

        <div class="table-container">
            ${this.convertMarkdownTableToHTML(data.script)}
        </div>

        <div class="footer">
            ✨ 本脚本由 AI 自动生成，仅供参考
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * 将 Markdown 表格转换为 HTML
   */
  convertMarkdownTableToHTML(markdown) {
    // 提取表格内容
    const tableMatch = markdown.match(/\|[\s\S]*?\|[\s\S]*?\|[-:\s|]+\|[\s\S]*?\n((?:\|[^\n]*\|\n?)+)/);
    if (!tableMatch) {
      return '<p style="color: #dc3545;">无法解析表格内容</p>';
    }

    const lines = tableMatch[0].trim().split('\n');
    const headers = lines[0].split('|').filter(h => h.trim()).map(h => h.trim());
    const rows = lines.slice(2).map(line =>
      line.split('|').filter(cell => cell.trim()).map(cell => cell.trim())
    );

    let html = '<table>\n<thead>\n<tr>';
    headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += '</tr>\n</thead>\n<tbody>\n';

    rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        // 处理换行符
        const processedCell = cell.replace(/<br>/g, '<br>');
        html += `<td>${processedCell}</td>`;
      });
      html += '</tr>\n';
    });

    html += '</tbody>\n</table>';
    return html;
  }

  /**
   * 格式化仿写 HTML 输出
   */
  formatRewriteHTML(data) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>仿写脚本 - ${data.originalTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 30px;
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header .meta { font-size: 14px; opacity: 0.9; }
        .info {
            padding: 20px 30px;
            background: #fff5f5;
            border-bottom: 1px solid #e9ecef;
        }
        .info p { margin: 5px 0; color: #495057; }
        .info strong { color: #c92a2a; }
        .info-section {
            padding: 15px 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        .info-section h3 {
            font-size: 16px;
            color: #c92a2a;
            margin-bottom: 8px;
        }
        .info-section p {
            font-size: 14px;
            color: #6c757d;
            white-space: pre-wrap;
            line-height: 1.8;
        }
        .table-container {
            padding: 30px;
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        thead {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
        }
        th { font-weight: 600; white-space: nowrap; }
        tr:hover { background: #fff5f5; }
        td:nth-child(1) { font-weight: 600; color: #f5576c; }
        td:nth-child(2) {
            min-width: 200px;
            color: #495057;
        }
        td:nth-child(3) {
            font-size: 12px;
            padding: 8px 15px;
        }
        td:nth-child(4) {
            font-weight: 500;
            color: #212529;
        }
        td:nth-child(5) {
            min-width: 300px;
            color: #6c757d;
            font-size: 13px;
            line-height: 1.5;
        }
        .footer {
            padding: 20px 30px;
            text-align: center;
            color: #6c757d;
            font-size: 13px;
            border-top: 1px solid #e9ecef;
            background: #f8f9fa;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✍️ 仿写脚本</h1>
            <div class="meta">仿写时间: ${new Date().toLocaleString('zh-CN')}</div>
        </div>

        <div class="info">
            <p><strong>📺 原脚本:</strong> ${data.originalTitle}</p>
        </div>

        <div class="info-section">
            <h3>📋 仿写要求</h3>
            <p>${this.escapeHtml(data.userInstruction)}</p>
        </div>

        <div class="table-container">
            ${this.convertMarkdownTableToHTML(data.script)}
        </div>

        <div class="footer">
            ✨ 本脚本由 AI 自动生成，仅供参考
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * 仿写脚本
   */
  async rewrite(originalScript, userInstruction, options = {}) {
    try {
      console.log('✍️  开始仿写脚本...\n');

      const templateName = options.template || 'default';

      const { systemPrompt, userPrompt } = this.template.buildRewritePrompt(
        templateName,
        {
          originalScript,
          userInstruction,
          metadata: options.metadata || {}
        }
      );

      const result = await this.qwen.executeTemplate(systemPrompt, userPrompt, {
        temperature: 0.8,
        max_tokens: 4000
      });

      console.log('✓ 仿写完成\n');

      // 保存仿写结果
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      // 获取当前日期 (YYYY-MM-DD 格式)
      const today = new Date().toISOString().slice(0, 10);

      // 确保输出目录存在（按日期归类）
      const rewritesDir = path.join(this.config.output_dir, 'rewrites', today);
      if (!fs.existsSync(rewritesDir)) {
        fs.mkdirSync(rewritesDir, { recursive: true });
      }

      // 保存 Markdown 文件
      const mdFilename = `${timestamp}_仿写.md`;
      const mdPath = path.join(rewritesDir, mdFilename);

      const content = `# 仿写脚本

**仿写时间**: ${new Date().toLocaleString('zh-CN')}

**原脚本**: ${options.originalTitle || '未知'}

**仿写要求**: ${userInstruction}

---

## 仿写结果

${result}

---

*本脚本由 AI 自动生成，仅供参考*
`;

      fs.writeFileSync(mdPath, content, 'utf-8');
      console.log(`   ✓ Markdown: ${mdPath}`);

      // 保存 HTML 文件
      const htmlFilename = `${timestamp}_仿写.html`;
      const htmlPath = path.join(rewritesDir, htmlFilename);
      const htmlContent = this.formatRewriteHTML({
        originalTitle: options.originalTitle || '未知',
        userInstruction,
        script: result
      });
      fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
      console.log(`   ✓ HTML: ${htmlPath}\n`);

      // 自动打开 HTML 文件（如果配置启用）
      if (this.config.ui?.auto_confirm !== false && this.config.output?.auto_open_html) {
        const { exec } = require('child_process');
        console.log(`🌐 正在浏览器中打开...`);
        exec(`open "${htmlPath}"`, (error) => {
          if (error) {
            console.log(`   💡 手动打开: open "${htmlPath}"`);
          }
        });
      } else {
        console.log(`💡 提示：用浏览器打开 HTML 文件可以查看更美观的表格`);
        console.log(`   open "${htmlPath}"\n`);
      }

      return {
        success: true,
        script: result,
        mdPath,
        htmlPath
      };

    } catch (error) {
      console.error('\n❌ 仿写失败:', error.message);
      throw error;
    }
  }
}

// CLI 接口
if (require.main === module) {
  const url = process.argv[2];
  const command = process.argv[3] || 'analyze';

  if (!url) {
    console.log('用法: node index.js <视频URL> [command]');
    console.log('命令: analyze (默认) | rewrite');
    process.exit(1);
  }

  const analyzer = new VideoAnalyzer();

  (async () => {
    try {
      if (command === 'analyze') {
        await analyzer.analyze(url);
        console.log('✅ 分析完成！');
      }
    } catch (error) {
      console.error('错误:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = VideoAnalyzer;
