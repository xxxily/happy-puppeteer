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
const fs = require('fs-extra')
const path = require('path')
const chokidar = require('chokidar')
const utils = require('./utils/index')
const JsonFile = require('./jsonFile')
const appConfigHandler = require('./pptr/appConfigHandler')
const launchConf = require('../config/chrome.launch.conf')
const WebsiteCache = require('./sqlite3/websiteCache')
const purgeCache = require('./purgeCache')

class HappyPuppeteer {
  constructor (config) {
    this._config = appConfigHandler.getAppConfig() || {}
    this._config.chromeLaunch = launchConf || {}

    this.browser = null
    this.chrome = null
    this.pagesConfig = {}

    /* 对外提供WebsiteCache是为了方便外部程序对存储下的请求信息进行分析加工 */
    this.WebsiteCache = WebsiteCache

    this.setConfig(config || {})

    this.watcher = null
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

    /* 自动提取pagesDir下的pages配置 */
    const conf = this._config
    if (conf.pagesDir) {
      const pagesConf = appConfigHandler.getPagesConf(conf.pagesDir)

      if (!Array.isArray(conf.pages)) {
        conf.pages = []
      }

      /* 对原有的配置进行遍历提取 */
      conf.pages.forEach((pageConf, index) => {
        const keyName = pageConf._filePath || 'app_pages_conf_' + Date.now() + '_' + index

        /* 为每个配置都加上唯一标识，防止多份一样的配置 */
        if (!pageConf._filePath) {
          pageConf._filePath = keyName
        }

        /* 将旧的独有的数据追加到新的pagesConf里面 */
        if (!pagesConf[keyName]) {
          pagesConf[keyName] = pageConf
        }
      })
      conf.pages = conf.pages.concat(Object.values(pagesConf))

      this.pagesConfig = pagesConf
      this._config = conf
    }
  }

  getConfig () { return this._config }

  /* 监控pages目录下面的文件变化，一旦有变化就刷新页面 */
  async watchPagesDir (pagesDir) {
    const t = this

    if (t.watcher && t.watcher.close) {
      await t.watcher.close()
      t.watcher = null
    }

    t.watcher = chokidar.watch([
      path.join(pagesDir, '*.js'),
      path.join(pagesDir, '*/index.js')
    ])

    t.watcher.on('change', (filePath) => {
      console.log('文件被修改：', filePath)
      t.updatePageConfByFile(filePath)
      t.reloadWithPageFile(filePath)
    })

    /* 对后续加入的pages配置进行合并 */
    t.watcher.on('add', (filePath) => {
      if (!t.pagesConfig[filePath]) {
        t.updatePageConfByFile(filePath)
      }
    })
  }

  updatePageConfByFile (filePath) {
    if (!filePath) return false
    const t = this
    const conf = t.getConfig()

    if (!Array.isArray(conf.pages)) {
      conf.pages = []
    }

    /* 更新前先清空模块缓存 */
    if (t.pagesConfig[filePath]) {
      console.log('purgeCache:', filePath)
      purgeCache(filePath)
    }

    const pageConf = appConfigHandler.loadPageConfByPath(filePath)
    if (pageConf) {
      console.log('t.pagesConfig:', filePath)
      t.pagesConfig[filePath] = pageConf

      if (t.pagesConfig[filePath]) {
        for (let i = 0; i < conf.pages.length; i++) {
          const _pageConf = conf.pages[i]
          if (_pageConf._filePath === filePath) {
            conf.pages[i] = pageConf
            break
          }
        }
      } else {
        /* 没有则作为新配置加入到整个配置表里 */
        conf.pages.push(pageConf)
      }
    }
  }

  /**
   * 根据page的配置文件自动刷新对应页面，以便进行热更新调试
   * @param filePath
   * @returns {Promise<void>}
   */
  async reloadWithPageFile (filePath) {
    const t = this
    const browser = t.browser
    const conf = t.getConfig()

    /* 尝试对browser实例的第一个page Tab进行刷新，应用最新变更的代码 */
    if (browser && !conf.hotReload === false && fs.existsSync(filePath)) {
      let reloadUrl = ''

      /* 尝试定位到被修改的页面地址 */
      try {
        const triggerConf = require(filePath)
        if (triggerConf && triggerConf.defaultEntry) {
          reloadUrl = triggerConf.defaultEntry
        }
      } catch (e) {
        console.error(e)
      }

      const pages = await browser.pages()
      const page = pages[0]

      if (reloadUrl && page.url() !== reloadUrl) {
        page.goto(reloadUrl)
      } else {
        page.reload()
      }

      /**
       * 如果page不处于可视区域，则尝试将其置于可视范围
       * 注：置于可视范围后，浏览器会重新获得焦点，其它软件则自动失去焦点
       */
      const vState = await page.evaluate(() => document.visibilityState).catch(() => {})
      if (vState !== 'visible') {
        await page.bringToFront().catch(() => {})
      }
    }
  }

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

    if (conf.pagesDir) {
      t.watchPagesDir(conf.pagesDir)
    }

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
