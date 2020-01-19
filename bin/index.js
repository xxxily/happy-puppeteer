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
const utils = require('./utils/index')
const path = require('path')
const JsonFile = require('./jsonFile')
const appConf = require('../config/app.conf')
const launchConf = require('../config/chrome.launch.conf')
const WebsiteCache = require('./sqlite3/websiteCache')

class HappyPuppeteer {
  constructor (config) {
    this._config = appConf || {}
    this._config.chromeLaunch = launchConf || {}

    this.browser = null
    this.chrome = null

    /* 对外提供WebsiteCache是为了方便外部程序对存储下的请求信息进行分析加工 */
    this.WebsiteCache = WebsiteCache

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
    this._config = utils.merge(this._config, config || {})
  }

  getConfig () { return this._config }

  /**
   * 启动HappyPuppeteer实例
   * @param config {Object} -可选 实例运行时的相关配置，如果不传则使用默认配置
   * @returns {Promise<void>}
   */
  async start (config) {
    const t = this

    if (utils.isObj(config)) {
      t.setConfig(config)
    }

    const conf = t.getConfig()
    const logFile = path.join(conf.logDir, 'appLog.json')
    const appLog = new JsonFile(logFile)
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
    const chrome = await chromeLauncher.launch(conf.chromeLaunch)
    t.chrome = chrome

    conf.chromeLaunch.port = chrome.port

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

    browser.happyPuppeteer = this
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
