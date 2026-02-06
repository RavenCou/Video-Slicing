/**
 * 模板引擎
 * 负责加载、渲染 Prompt 模板
 */

const fs = require('fs');
const path = require('path');

class TemplateEngine {
  constructor(config) {
    this.templateDir = config.template_dir;
    this.config = config;
  }

  /**
   * 加载模板文件
   * @param {string} category - 模板类别 (breakdown/rewrite)
   * @param {string} templateName - 模板名称
   * @returns {string} 模板内容
   */
  loadTemplate(category, templateName) {
    const templatePath = path.join(this.templateDir, category, `${templateName}.md`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`模板文件不存在: ${templatePath}`);
    }

    const template = fs.readFileSync(templatePath, 'utf-8');
    return template;
  }

  /**
   * 渲染字段定义
   * @returns {string} 格式化的字段定义文本
   */
  renderFieldsDefinition() {
    const fields = this.config.fields.table_columns;

    const lines = fields.map(field => {
      const parts = [`- **${field.key}**：${field.description}`];

      if (field.type === 'enum' && field.options) {
        parts.push(`\n  - 选项：${field.options.join('、')}`);
      }

      if (field.min_length || field.max_length) {
        const length = [];
        if (field.min_length) length.push(`最少${field.min_length}字`);
        if (field.max_length) length.push(`最多${field.max_length}字`);
        parts.push(`\n  - 要求：${length.join('，')}`);
      }

      if (field.required) {
        parts.push('（必填）');
      }

      return parts.join('');
    });

    return lines.join('\n');
  }

  /**
   * 渲染模板（替换变量）
   * @param {string} template - 模板内容
   * @param {Object} variables - 变量对象
   * @returns {string} 渲染后的内容
   */
  render(template, variables) {
    let rendered = template;

    // 替换 {variable} 格式的变量
    Object.keys(variables).forEach(key => {
      const value = variables[key];
      const placeholder = `{${key}}`;

      if (typeof value === 'object') {
        // 对象类型转为 JSON 字符串或格式化文本
        if (value instanceof Error) {
          rendered = rendered.replace(new RegExp(placeholder, 'g'), value.message);
        } else {
          rendered = rendered.replace(
            new RegExp(placeholder, 'g'),
            JSON.stringify(value, null, 2)
          );
        }
      } else {
        rendered = rendered.replace(new RegExp(placeholder, 'g'), value || '');
      }
    });

    return rendered;
  }

  /**
   * 构建拆解提示词
   * @param {string} templateName - 模板名称
   * @param {Object} context - 上下文数据
   * @returns {Object} {systemPrompt, userPrompt}
   */
  buildBreakdownPrompt(templateName, context) {
    const template = this.loadTemplate('breakdown', templateName);

    const variables = {
      video_metadata: JSON.stringify(context.metadata, null, 2),
      visual_context: context.visualResult,
      asr_result: context.asrResult.text,
      fields_definition: this.renderFieldsDefinition()
    };

    const rendered = this.render(template, variables);

    // 分离系统提示词和用户提示词
    const parts = rendered.split(/^# 用户提示词|^# User Prompt/m);
    const systemPrompt = parts[0].trim();
    const userPrompt = parts[1] ? parts[1].trim() : '';

    return {
      systemPrompt,
      userPrompt: userPrompt || '请根据上述要求完成任务。'
    };
  }

  /**
   * 构建仿写提示词
   * @param {string} templateName - 模板名称
   * @param {Object} context - 上下文数据
   * @returns {Object} {systemPrompt, userPrompt}
   */
  buildRewritePrompt(templateName, context) {
    const template = this.loadTemplate('rewrite', templateName);

    const variables = {
      original_script: context.originalScript,
      user_instruction: context.userInstruction,
      video_metadata: JSON.stringify(context.metadata || {}, null, 2),
      fields_definition: this.renderFieldsDefinition()
    };

    const rendered = this.render(template, variables);

    // 分离系统提示词和用户提示词
    const parts = rendered.split(/^# 用户提示词|^# User Prompt/m);
    const systemPrompt = parts[0].trim();
    const userPrompt = parts[1] ? parts[1].trim() : '';

    return {
      systemPrompt,
      userPrompt: userPrompt || '请根据上述要求完成任务。'
    };
  }

  /**
   * 列出可用模板
   * @param {string} category - 模板类别
   * @returns {Array<string>} 模板名称列表
   */
  listTemplates(category) {
    const categoryDir = path.join(this.templateDir, category);

    if (!fs.existsSync(categoryDir)) {
      return [];
    }

    return fs.readdirSync(categoryDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.basename(f, '.md'));
  }

  /**
   * 获取模板描述（从模板文件中提取）
   * @param {string} category - 模板类别
   * @param {string} templateName - 模板名称
   * @returns {string} 模板描述
   */
  getTemplateDescription(category, templateName) {
    const template = this.loadTemplate(category, templateName);

    // 提取第一行或 # 开头的描述
    const lines = template.split('\n');
    const firstLine = lines[0].trim();

    if (firstLine.startsWith('#')) {
      return firstLine.replace(/^#+\s*/, '');
    }

    return templateName;
  }

  /**
   * 验证模板语法
   * @param {string} category - 模板类别
   * @param {string} templateName - 模板名称
   * @returns {Object} {valid: boolean, errors: Array<string>}
   */
  validateTemplate(category, templateName) {
    const errors = [];

    try {
      const template = this.loadTemplate(category, templateName);

      // 检查必需的变量占位符
      const requiredVars = ['{fields_definition}'];
      const breakdownVars = ['{visual_context}', '{asr_result}', '{video_metadata}'];
      const rewriteVars = ['{original_script}', '{user_instruction}'];

      if (category === 'breakdown') {
        requiredVars.push(...breakdownVars);
      } else if (category === 'rewrite') {
        requiredVars.push(...rewriteVars);
      }

      requiredVars.forEach(varName => {
        if (!template.includes(varName)) {
          errors.push(`缺少必需的变量占位符: ${varName}`);
        }
      });

      // 检查输出格式说明
      if (!template.includes('# 输出格式') && !template.includes('# Output Format')) {
        errors.push('缺少输出格式说明');
      }

      return {
        valid: errors.length === 0,
        errors
      };

    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * 创建自定义模板
   * @param {string} category - 模板类别
   * @param {string} templateName - 新模板名称
   * @param {string} content - 模板内容
   */
  createTemplate(category, templateName, content) {
    const templatePath = path.join(this.templateDir, category, `${templateName}.md`);

    if (fs.existsSync(templatePath)) {
      throw new Error(`模板已存在: ${templatePath}`);
    }

    // 确保目录存在
    const dir = path.dirname(templatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(templatePath, content, 'utf-8');
    console.log(`✓ 模板已创建: ${templatePath}`);
  }

  /**
   * 复制模板（用于创建自定义版本）
   * @param {string} category - 模板类别
   * @param {string} sourceName - 源模板名称
   * @param {string} newName - 新模板名称
   */
  copyTemplate(category, sourceName, newName) {
    const sourcePath = path.join(this.templateDir, category, `${sourceName}.md`);
    const targetPath = path.join(this.templateDir, category, `${newName}.md`);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`源模板不存在: ${sourcePath}`);
    }

    if (fs.existsSync(targetPath)) {
      throw new Error(`目标模板已存在: ${targetPath}`);
    }

    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✓ 模板已复制: ${targetPath}`);
  }
}

module.exports = TemplateEngine;
