#!/usr/bin/env node
/**
 * 测试 GLM-4.7 API 响应时间
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

async function testGLMAPI() {
  // 智谱 API 配置
  const apiKey = process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY;
  const baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  if (!apiKey) {
    console.error('❌ 未找到 ZHIPU_API_KEY 或 GLM_API_KEY 环境变量');
    console.log('💡 请设置环境变量: export ZHIPU_API_KEY=your-api-key');
    return;
  }

  console.log('🧪 测试智谱 GLM-4.7 API 响应时间...\n');
  console.log(`📡 API 端点: ${baseUrl}\n`);

  const testPrompts = [
    { name: '简单文本', prompt: '说一句话', max_tokens: 50 },
    { name: '中等复杂度', prompt: '用3个关键词概括春天', max_tokens: 100 },
    { name: '复杂任务', prompt: '写一个100字的短视频脚本开场', max_tokens: 200 }
  ];

  const results = [];

  for (let i = 0; i < testPrompts.length; i++) {
    const test = testPrompts[i];
    console.log(`\n📝 测试 ${i + 1}/${testPrompts.length}: ${test.name}`);
    console.log(`   提示词: "${test.prompt}"`);

    try {
      const startTime = Date.now();

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'glm-4.7',
          messages: [
            { role: 'user', content: test.prompt }
          ],
          max_tokens: test.max_tokens,
          temperature: 0.7
        }),
        timeout: 60000
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (response.ok) {
        const data = await response.json();
        const responseText = data.choices[0].message.content;

        console.log(`   ✅ 响应成功`);
        console.log(`   ⏱️  响应时间: ${responseTime}ms (${(responseTime / 1000).toFixed(2)}s)`);
        console.log(`   📊 状态码: ${response.status}`);
        console.log(`   📄 返回内容: "${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}"`);

        if (data.usage) {
          console.log(`   📏 Token 使用: ${JSON.stringify(data.usage)}`);
          const tokensPerSec = (data.usage.total_tokens / (responseTime / 1000)).toFixed(2);
          console.log(`   ⚡ 生成速度: ~${tokensPerSec} tokens/s`);
        }

        results.push({
          test: test.name,
          time: responseTime,
          success: true,
          usage: data.usage
        });
      } else {
        const error = await response.text();
        const responseTime = endTime - startTime;
        console.log(`   ❌ 请求失败 (${responseTime}ms)`);
        console.log(`   错误: ${error}`);

        results.push({
          test: test.name,
          time: responseTime,
          success: false,
          error: error
        });
      }
    } catch (error) {
      console.log(`   ❌ 网络错误: ${error.message}`);
      results.push({
        test: test.name,
        success: false,
        error: error.message
      });
    }

    // 测试间隔，避免请求过快
    if (i < testPrompts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 输出统计信息
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果统计');
  console.log('='.repeat(50));

  const successfulTests = results.filter(r => r.success);
  if (successfulTests.length > 0) {
    const avgTime = successfulTests.reduce((sum, r) => sum + r.time, 0) / successfulTests.length;
    const minTime = Math.min(...successfulTests.map(r => r.time));
    const maxTime = Math.max(...successfulTests.map(r => r.time));

    console.log(`✅ 成功测试: ${successfulTests.length}/${results.length}`);
    console.log(`⏱️  平均响应时间: ${avgTime.toFixed(0)}ms (${(avgTime / 1000).toFixed(2)}s)`);
    console.log(`🚀 最快响应: ${minTime}ms`);
    console.log(`🐢 最慢响应: ${maxTime}ms`);

    if (successfulTests[0].usage) {
      const avgTokens = successfulTests.reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0) / successfulTests.length;
      const avgSpeed = (avgTokens / (avgTime / 1000)).toFixed(2);
      console.log(`⚡ 平均生成速度: ~${avgSpeed} tokens/s`);
    }
  } else {
    console.log('❌ 所有测试都失败了');
  }

  console.log('\n✨ 测试完成！');
}

// 运行测试
testGLMAPI().catch(console.error);
