/**
 * 视频处理器
 * 负责视频下载、音频提取、关键帧采样等
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class VideoProcessor {
  constructor(config) {
    this.cacheDir = config.cache_dir;
    this.minDuration = config.min_duration || 5;
    this.maxDuration = config.max_duration || 300;
    this.supportedPlatforms = config.supported_platforms || [];

    // 确保缓存目录存在
    this.ensureCacheDirs();
  }

  /**
   * 确保缓存目录存在
   */
  ensureCacheDirs() {
    const dirs = [
      path.join(this.cacheDir, 'videos'),
      path.join(this.cacheDir, 'audio'),
      path.join(this.cacheDir, 'keyframes'),
      path.join(this.cacheDir, 'analysis')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 生成 URL 哈希作为缓存键
   */
  hashUrl(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * 检查 URL 是否支持
   */
  checkPlatformSupport(url) {
    if (this.supportedPlatforms.length === 0) {
      return { supported: true, platform: 'unknown' };
    }

    const platform = this.supportedPlatforms.find(p => url.includes(p));
    return {
      supported: !!platform,
      platform: platform || 'unknown'
    };
  }

  /**
   * 下载视频（使用 yt-dlp）
   * @param {string} url - 视频 URL
   * @param {Object} options - 选项 {forceRefresh: boolean}
   * @returns {Promise<Object>} {videoPath, audioPath, metadata}
   */
  async downloadVideo(url, options = {}) {
    const urlHash = this.hashUrl(url);
    const videoCachePath = path.join(this.cacheDir, 'videos', `${urlHash}.mp4`);
    const audioCachePath = path.join(this.cacheDir, 'audio', `${urlHash}.mp3`);
    const metadataCachePath = path.join(this.cacheDir, 'analysis', `${urlHash}-metadata.json`);

    // 检查缓存
    if (!options.forceRefresh && fs.existsSync(videoCachePath) && fs.existsSync(audioCachePath) && fs.existsSync(metadataCachePath)) {
      console.log('✓ 使用缓存文件');
      const metadata = JSON.parse(fs.readFileSync(metadataCachePath, 'utf-8'));
      return {
        videoPath: videoCachePath,
        audioPath: audioCachePath,
        metadata
      };
    }

    // 检查平台支持
    const platformCheck = this.checkPlatformSupport(url);
    if (!platformCheck.supported) {
      console.warn(`⚠️  警告：平台 ${platformCheck.platform} 未经过充分测试`);
    }

    try {
      console.log('正在下载视频...');

      // 检查是否需要使用 Cookie（抖音）
      let cookieParams = '';
      if (url.includes('douyin.com')) {
        const cookieFile = path.join(__dirname, '../config/douyin-cookies.txt');
        if (fs.existsSync(cookieFile)) {
          // 读取 Cookie 文件
          const cookieContent = fs.readFileSync(cookieFile, 'utf-8');
          // 直接使用原始 Cookie 字符串
          cookieParams = `--cookies "${cookieContent.trim()}"`;
          console.log('   ✓ 使用抖音 Cookie');
        }
      }

      // 下载视频
      const videoCmd = [
        'yt-dlp',
        '-f', 'best[ext=mp4]/best',
        '-o', `"${videoCachePath}"`,
        '--no-playlist',
        cookieParams,
        `"${url}"`
      ].filter(Boolean).join(' ');

      execSync(videoCmd, { stdio: 'inherit' });

      if (!fs.existsSync(videoCachePath)) {
        throw new Error('视频下载失败');
      }

      // 提取音频
      console.log('正在提取音频...');
      const audioCmd = [
        'yt-dlp',
        '-x',
        '--audio-format', 'mp3',
        '-o', `"${audioCachePath.replace('.mp3', '')}"`,
        `"${url}"`
      ].join(' ');

      execSync(audioCmd, { stdio: 'inherit' });

      // 如果音频文件名不是预期的，查找它
      if (!fs.existsSync(audioCachePath)) {
        const dir = path.dirname(audioCachePath);
        const files = fs.readdirSync(dir);
        const mp3File = files.find(f => f.startsWith(urlHash) && f.endsWith('.mp3'));
        if (mp3File) {
          fs.renameSync(path.join(dir, mp3File), audioCachePath);
        }
      }

      // 获取视频元数据
      const metadata = await this.getVideoMetadata(videoCachePath);
      fs.writeFileSync(metadataCachePath, JSON.stringify(metadata, null, 2));

      console.log(`✓ 下载完成：${metadata.duration}秒`);

      return {
        videoPath: videoCachePath,
        audioPath: audioCachePath,
        metadata
      };

    } catch (error) {
      throw new Error(`视频下载失败: ${error.message}`);
    }
  }

  /**
   * 获取视频元数据（使用 ffprobe）
   */
  async getVideoMetadata(videoPath) {
    try {
      const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const output = execSync(cmd, { encoding: 'utf-8' });
      const data = JSON.parse(output);

      const videoStream = data.streams.find(s => s.codec_type === 'video');
      const audioStream = data.streams.find(s => s.codec_type === 'audio');

      return {
        duration: parseFloat(data.format.duration),
        width: videoStream?.width,
        height: videoStream?.height,
        fps: eval(videoStream?.r_frame_rate || '30/1'),
        hasAudio: !!audioStream,
        codec: videoStream?.codec_name,
        size: data.format.size,
        bitrate: data.format.bit_rate
      };
    } catch (error) {
      throw new Error(`无法获取视频元数据: ${error.message}`);
    }
  }

  /**
   * 计算采样间隔
   * @param {number} duration - 视频时长（秒）
   * @param {number} targetFrames - 目标帧数
   * @returns {number} 采样间隔（秒）
   */
  calculateInterval(duration, targetFrames = 20) {
    const interval = Math.ceil(duration / targetFrames);
    return Math.max(interval, 2); // 最小2秒
  }

  /**
   * 提取关键帧（使用 ffmpeg）
   * @param {string} videoPath - 视频文件路径
   * @param {number} interval - 采样间隔（秒）
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 关键帧文件路径数组
   */
  async extractKeyframes(videoPath, interval, options = {}) {
    const urlHash = path.basename(videoPath, '.mp4');
    const keyframesDir = path.join(this.cacheDir, 'keyframes', urlHash);

    // 检查缓存
    if (!options.forceRefresh && fs.existsSync(keyframesDir)) {
      const frames = fs.readdirSync(keyframesDir)
        .filter(f => f.endsWith('.jpg'))
        .sort();
      if (frames.length > 0) {
        console.log(`✓ 使用缓存关键帧：${frames.length} 帧`);
        return frames.map(f => path.join(keyframesDir, f));
      }
    }

    // 创建目录
    fs.mkdirSync(keyframesDir, { recursive: true });

    try {
      console.log(`正在提取关键帧（每 ${interval} 秒采样）...`);

      // 使用 ffmpeg 提取关键帧
      const cmd = [
        'ffmpeg',
        '-i', `"${videoPath}"`,
        '-vf', `fps=1/${interval}`,
        '-q:v', '2',
        `"${path.join(keyframesDir, 'frame_%04d.jpg')}"`
      ].join(' ');

      execSync(cmd, { stdio: 'inherit', shell: true });

      const frames = fs.readdirSync(keyframesDir)
        .filter(f => f.endsWith('.jpg'))
        .sort();

      console.log(`✓ 提取完成：${frames.length} 帧`);

      return frames.map(f => path.join(keyframesDir, f));

    } catch (error) {
      throw new Error(`关键帧提取失败: ${error.message}`);
    }
  }

  /**
   * 将图片转换为 base64
   * @param {Array<string>} imagePaths - 图片路径数组
   * @returns {Promise<Array<string>>} base64 编码数组
   */
  async imagesToBase64(imagePaths) {
    return imagePaths.map(imagePath => {
      try {
        const buffer = fs.readFileSync(imagePath);
        const ext = path.extname(imagePath).slice(1);
        return `data:image/${ext};base64,${buffer.toString('base64')}`;
      } catch (error) {
        console.error(`无法读取图片 ${imagePath}:`, error.message);
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * 验证视频时长
   */
  validateDuration(duration) {
    if (duration < this.minDuration) {
      throw new Error(`视频过短（${duration}秒 < ${this.minDuration}秒），无法进行有效拆解`);
    }

    if (duration > this.maxDuration) {
      console.warn(`⚠️  警告：视频较长（${duration}秒 > ${this.maxDuration}秒），分析可能耗时较长`);
    }

    return true;
  }

  /**
   * 清理缓存
   */
  clearCache(url = null) {
    if (url) {
      const urlHash = this.hashUrl(url);
      const files = [
        path.join(this.cacheDir, 'videos', `${urlHash}.mp4`),
        path.join(this.cacheDir, 'audio', `${urlHash}.mp3`),
        path.join(this.cacheDir, 'keyframes', urlHash),
        path.join(this.cacheDir, 'analysis', `${urlHash}-metadata.json`)
      ];

      files.forEach(file => {
        if (fs.existsSync(file)) {
          if (fs.statSync(file).isDirectory()) {
            fs.rmSync(file, { recursive: true });
          } else {
            fs.unlinkSync(file);
          }
        }
      });

      console.log(`✓ 已清理 ${url} 的缓存`);
    } else {
      // 清理所有缓存
      fs.rmSync(this.cacheDir, { recursive: true });
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log('✓ 已清理所有缓存');
    }
  }
}

module.exports = VideoProcessor;
