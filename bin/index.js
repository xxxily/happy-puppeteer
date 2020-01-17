/*!
 * @name         index.js
 * @description
 * @version      0.0.1
 * @author       Blaze
 * @date         2019/12/6 下午3:39
 * @github       https://github.com/xxxily
 */

const chromeLauncher = require('chrome-launcher')
const puppeteer = require('puppeteer')
const request = require('request')
const util = require('util')
const path = require('path')
const JsonFile = require('./jsonFile')
const rootPath = require('./rootPath')
const launchConf = require('../config/chrome.launch.conf')
const appLog = new JsonFile(path.join(rootPath, 'log/appLog.json'))

class HappyPuppeteer {
  constructor (config) {
    this._config = {}
    this.browser = null
    this.chrome = null

    this.setConfig(config || {})
  }

  /**
   * 创建一个新实例
   * @param config {Object} -可选 实例运行时的相关配置，如果不传则使用默认配置
   * @returns {HappyPuppeteer}
   */
  create (config) {
    return new HappyPuppeteer(config)
  }

  /**
   * 设置实例的配置，一般只在运行前设置，否则后面无法动态更新配置
   * @param config {Object} -可选 实例运行时的相关配置，如果不传则使用默认配置
   */
  setConfig (config) {
    this._config = util.merge(this._config, config || {})
  }

  /**
   * 启动HappyPuppeteer实例
   * @param config {Object} -可选 实例运行时的相关配置，如果不传则使用默认配置
   * @returns {Promise<void>}
   */
  async start (config) {
    const t = this

    if (util.isObj(config)) {
      t.setConfig(config)
    }

    const runLog = await appLog.read()

    /**
     * window下无法正常终结子程序，
     * 重新运行程序的时候，尝试把上次运行的进程终结掉，方便调试
     */
    if (runLog.lastInfo && runLog.lastInfo.pid) {
      try {
        process.kill(runLog.lastInfo.pid)
      } catch (e) {}
    }

    // Launch chrome using chrome-launcher.
    const chrome = await chromeLauncher.launch(launchConf)
    t.chrome = chrome

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
    t.browser = browser

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
  }

  /**
   * 停止happyPuppeteer实例程序运行
   * @returns {Promise<void>}
   */
  async stop () {
    const t = this

    if (t.browser) {
      await t.browser.disconnect()
      t.browser = null
    }

    if (t.chrome) {
      await t.chrome.kill()
      t.chrome = null
    }
  }
}

const happyPuppeteerInstance = new HappyPuppeteer()
module.exports = happyPuppeteerInstance
