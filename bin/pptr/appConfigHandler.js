const path = require('path')
const utils = require('../utils/index')
const glob = require('fast-glob')

let appConf = require('../../config/app.conf')
if (!Array.isArray(appConf.pages)) {
  appConf.pages = []
}

const appConfigHandler = {
  getHappyPuppeteer (page) {
    let happyPuppeteer = null
    if (page && page.browser) {
      const browser = page.browser()
      happyPuppeteer = browser.happyPuppeteer
    }
    return happyPuppeteer
  },

  /**
   * 获取app的配置信息
   * @param page {page} -可选 默认只能获取到固定的配置信息，需要动态地获取到用户传入的配置信息，则需要通过page对象下查找
   * @returns {Object}
   */
  getAppConfig (page) {
    if (page && page.browser) {
      const browser = page.browser()
      if (browser.happyPuppeteer) {
        appConf = browser.happyPuppeteer.getConfig()
      }
    }

    return appConf || {}
  },

  /**
   * 获取pages目录下的所有page配置信息
   * @param pagesDir
   * @returns {{}}
   */
  getPagesConf (pagesDir) {
    const pagesConf = {}
    if (!pagesDir) return pagesConf

    /* 加载pages目录下的自定义page配置模块 */
    let pagesConfFiles = glob.sync([
      '*.js',
      '*/index.js'
    ], { cwd: pagesDir })

    pagesConfFiles = pagesConfFiles.map(item => path.join(pagesDir, item))

    /* 合并pages模块下的配置信息到appConf.pages字段下 */
    pagesConfFiles.forEach(function (pagesFile) {
      const pageConf = appConfigHandler.loadPageConfByPath(pagesFile)
      if (pageConf) {
        pagesConf[pagesFile] = pageConf
      }
    })

    return pagesConf
  },

  loadPageConfByPath (filePath) {
    let pageConf = null
    try {
      pageConf = require(filePath)
      if (utils.isObj(pageConf)) {
        pageConf._lastLoadTime = Date.now()
        pageConf._filePath = filePath
        pageConf[filePath] = pageConf
      }
    } catch (e) {
      console.error(e)
    }
    return pageConf
  }
}

module.exports = appConfigHandler
