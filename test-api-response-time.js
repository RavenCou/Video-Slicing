#!/usr/bin/env node
/**
 * 测试 Qwen API 响应时间
 */

const fs = require('fs');
const path = require('path');

// 读取 .env 文件
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
}

loadEnv();

async function testQwenAPI() {
  const fetch = require('node-fetch');
  const apiKey = process.env.QWEN_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  if (!apiKey) {
    console.error('❌ 未找到 QWEN_API_KEY');
    return;
  }

  console.log('🧪 测试阿里云 Qwen API 响应时间...\n');

  const testPrompts = [
    { name: '简单文本', prompt: '说一句话' },
    { name: '中等复杂度', prompt: '用3个关键词概括春天' },
    { name: '复杂任务', prompt: '写一个100字的短视频脚本开场' }
  ];

  for (const test of testPrompts) {
    console.log(`\n📝 测试: ${test.name}`);
    console.log(`   提示词: "${test.prompt}"`);

    try {
      const startTime = Date.now();

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          messages: [
            { role: 'user', content: test.prompt }
          ],
          max_tokens: 200,
          temperature: 0.7
        }),
        timeout: 30000
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (response.ok) {
        const data = await response.json();
        const responseText = data.choices[0].message.content;

        console.log(`   ✅ 响应成功`);
        console.log(`   ⏱️  响应时间: ${responseTime}ms`);
        console.log(`   📊 状态码: ${response.status}`);
        console.log(`   📄 返回内容: "${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}"`);
        console.log(`   📏 Token 数: ${JSON.stringify(data.usage)}`);
      } else {
        const error = await response.text();
        const responseTime = endTime - startTime;
        console.log(`   ❌ 请求失败 (${responseTime}ms)`);
        console.log(`   错误: ${error}`);
      }
    } catch (error) {
      console.log(`   ❌ 网络错误: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✨ 测试完成！');
}

// 运行测试
testQwenAPI().catch(console.error);
