/**
 * 可选配置选项参考文档：
 * https://github.com/GoogleChrome/chrome-launcher
 * 使用chrome-launcher启动puppeteer，参考如下示例：
 * https://github.com/puppeteer/examples/blob/master/lighthouse/chromelauncher_puppeteer.js
 */
const fs = require('fs-extra')
const rootPath = require('../bin/rootPath')
const path = require('path')
const browserUserDataDir = path.join(rootPath, '.browser/userData/')
fs.ensureDirSync(browserUserDataDir)

module.exports = {
  // https://github.com/GoogleChrome/chrome-launcher/blob/master/docs/chrome-flags-for-tools.md
  // https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
  chromeFlags: [
    // '--disable-setuid-sandbox',
    // '--headless'
    // '--disable-gpu'
  ],
  // chromePath: 'D:\\Program Files\\MyChrome\\Chrome\\chrome.exe',
  // ignoreDefaultFlags: true,
  userDataDir: browserUserDataDir,
  logLevel: 'info',
  output: 'json'
}
