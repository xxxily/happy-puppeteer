/*!
 * @name         index.js
 * @description
 * @version      0.0.1
 * @author       Blaze
 * @date         2019/12/6 下午3:39
 * @github       https://github.com/xxxily
 */

/* 引入热模块的支持 */
require('./hotMod')

const chromeLauncher = require('chrome-launcher')
const puppeteer = require('puppeteer')
const request = require('request')
const util = require('util')
const path = require('path')
const JsonFile = require('./jsonFile')
const rootPath = require('./rootPath')
const launchConf = require('../config/chrome.launch.conf')
const appLog = new JsonFile(path.join(rootPath, 'log/appLog.json'))

async function main () {
  const runLog = await appLog.read()

  /* window下无法正常终结子程序，重新运行程序的时候，尝试把上次运行的进程终结掉，方便调试 */
  if (runLog.lastInfo && runLog.lastInfo.pid) {
    try {
      process.kill(runLog.lastInfo.pid)
    } catch (e) {}
  }

  // Launch chrome using chrome-launcher.
  const chrome = await chromeLauncher.launch(launchConf)
  launchConf.port = chrome.port

  /* 记录下运行日志 */
  appLog.write({
    lastInfo: JSON.parse(JSON.stringify(chrome))
  })

  // Connect to it using puppeteer.connect().
  const resp = await util.promisify(request)(`http://localhost:${chrome.port}/json/version`)
  const { webSocketDebuggerUrl } = JSON.parse(resp.body)
  const browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
    defaultViewport: null
  })

  /* 开启全局请求拦截，其它处理器会在拦截器正常工作后统一注入 */
  browser.on('targetchanged', target => require('./pptr/intercepter').setIntercepter(target))
  browser.on('targetcreated', target => require('./pptr/intercepter').setIntercepter(target))

  const hotBrowser = require('./pptr/hotBrowser')
  hotBrowser(browser)

  if (module.hot) {
    /* 使用热更新代码进行开发调试 */
    module.hot.runOnChange({
      modulePath: './pptr/hotBrowser',
      onChange: function (moduleContext) {
        moduleContext instanceof Function && moduleContext(browser)
      }
    })
  }

  // await browser.disconnect()
  // await chrome.kill()
}
main()