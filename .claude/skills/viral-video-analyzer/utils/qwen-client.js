/**
 * 阿里云 Qwen API 客户端
 * 封装视觉理解、语音识别、通用 LLM 调用
 */

const fs = require('fs');
const path = require('path');

class QwenClient {
  constructor(config) {
    this.apiKey = config.api_key || process.env.QWEN_API_KEY;
    this.baseUrl = config.base_url;
    this.models = config.models;
    this.flashModels = config.flash_models || {};
    this.useFlash = config.use_flash || false;
    this.timeout = config.timeout || 120000;

    if (!this.apiKey) {
      throw new Error('QWEN_API_KEY 环境变量未设置');
    }
  }

  /**
   * 获取实际使用的模型名称
   */
  getModel(modelType) {
    if (this.useFlash && this.flashModels[modelType]) {
      return this.flashModels[modelType];
    }
    return this.models[modelType];
  }

  /**
   * 调用阿里云 API 的通用方法
   */
  async callAPI(model, messages, options = {}) {
    const fetch = require('node-fetch');

    const requestBody = {
      model,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
      ...options
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        timeout: this.timeout
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API 调用失败: ${response.status} ${error}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      throw new Error(`Qwen API 调用失败: ${error.message}`);
    }
  }

  /**
   * 视觉理解：分析视频关键帧
   * @param {Array<string>} imageBase64Array - 图片的 base64 编码数组
   * @param {string} prompt - 分析提示词
   * @returns {Promise<string>} 分析结果
   */
  async analyzeVideoFrames(imageBase64Array, prompt = '分析这些视频帧的内容，识别场景、人物、动作等') {
    // 构建多模态消息
    const content = [
      {
        type: 'text',
        text: prompt
      }
    ];

    // 添加图片（最多20张,平衡准确性和token限制）
    const maxImages = Math.min(imageBase64Array.length, 20);
    for (let i = 0; i < maxImages; i++) {
      content.push({
        type: 'image_url',
        image_url: {
          url: imageBase64Array[i]
        }
      });
    }

    const messages = [
      {
        role: 'user',
        content
      }
    ];

    return await this.callAPI(this.getModel('vision'), messages, {
      max_tokens: 4000  // 增加输出长度
    });
  }

  /**
   * 语音识别：转录音频文件（使用 DashScope 原生多模态API）
   * @param {string} audioFilePath - 音频文件路径
   * @returns {Promise<Object>} 转录结果 {text: string, audio_file: string}
   *
   * 注意：qwen2-audio-instruct 模型对音频长度有限制（约60-90秒），
   * 更长的音频只会转录前面的部分。如需完整转录，需要实现分段处理。
   */
  async transcribeAudio(audioFilePath) {
    const fs = require('fs');
    const fetch = require('node-fetch');

    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`音频文件不存在: ${audioFilePath}`);
    }

    // 读取音频文件并转 base64
    const audioBuffer = fs.readFileSync(audioFilePath);
    const audioBase64 = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;

    // DashScope 原生 API 端点（多模态）
    const nativeApiUrl = this.baseUrl.replace('/compatible-mode/v1', '/api/v1/services/aigc/multimodal-generation/generation');

    // DashScope 原生 API 请求格式（适配FunASR）
    const requestBody = {
      model: 'fun-asr-2025-11-07',  // 使用FunASR模型，支持长音频
      input: {
        file_urls: [audioBase64],  // FunASR使用file_urls参数
        prompt: '请完整转录这段音频的所有语音内容，逐字逐句记录，不要删减、不要总结、不要省略任何内容。'
      },
      parameters: {
        result_format: 'message'
      }
    };

    try {
      const response = await fetch(nativeApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        timeout: this.timeout
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`DashScope API 调用失败: ${response.status} ${error}`);
      }

      const data = await response.json();

      // DashScope 原生 API 响应格式
      if (data.output && data.output.choices && data.output.choices[0]) {
        let rawContent = data.output.choices[0].message.content;

        // 处理不同类型的content
        let content = '';
        if (typeof rawContent === 'string') {
          content = rawContent;
          if (content.startsWith('[')) {
            try {
              const parsed = JSON.parse(content);
              if (Array.isArray(parsed) && parsed[0] && parsed[0].text) {
                content = parsed[0].text;
              }
            } catch (e) {
              // 解析失败，保持原样
            }
          }
        } else if (typeof rawContent === 'object' && rawContent !== null) {
          if (Array.isArray(rawContent)) {
            if (rawContent[0] && rawContent[0].text) {
              content = rawContent[0].text;
            } else {
              content = JSON.stringify(rawContent);
            }
          } else if (rawContent.text) {
            content = rawContent.text;
          } else {
            content = JSON.stringify(rawContent);
          }
        } else {
          content = String(rawContent);
        }

        return {
          text: content,
          audio_file: audioFilePath
        };
      } else {
        throw new Error('无法解析 DashScope API 响应');
      }
    } catch (error) {
      throw new Error(`DashScope 语音识别失败: ${error.message}`);
    }
  }

  /**
   * 通用 LLM：执行 Prompt 模板
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userPrompt - 用户提示词
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} LLM 响应
   */
  async executeTemplate(systemPrompt, userPrompt, options = {}) {
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    return await this.callAPI(this.models.llm, messages, {
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 4000
    });
  }

  /**
   * 结构化输出：确保返回 JSON 格式
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @returns {Promise<Object>} 解析后的 JSON 对象
   */
  async executeStructured(systemPrompt, userPrompt) {
    const response = await this.executeTemplate(systemPrompt, userPrompt + '\n\n请以 JSON 格式返回结果。');

    try {
      // 尝试提取 JSON（处理可能的前后文本）
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      throw new Error(`无法解析 LLM 返回的 JSON: ${error.message}\n原始响应: ${response}`);
    }
  }

  /**
   * 健康检查：验证 API 配置是否正确
   */
  async healthCheck() {
    try {
      const result = await this.callAPI(this.models.llm, [
        { role: 'user', content: '测试连接' }
      ], { max_tokens: 10 });

      console.log('✓ Qwen API 连接成功');
      return true;
    } catch (error) {
      console.error('✗ Qwen API 连接失败:', error.message);
      throw error;
    }
  }
}

module.exports = QwenClient;
