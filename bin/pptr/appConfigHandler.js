const path = require('path')
const rootPath = require('../rootPath')
const glob = require('fast-glob')
let appConf = require('../../config/app.conf')
if (!Array.isArray(appConf.pages)) {
  appConf.pages = []
}

/* 加载pages目录下的自定义page配置模块 */
const pagesBasePath = path.join(rootPath, 'pages/')
let pagesConfFiles = glob.sync('*.js', { cwd: pagesBasePath })
pagesConfFiles = pagesConfFiles.map(item => path.join(pagesBasePath, item))

/* 合并pages模块下的配置信息到appConf.pages字段下 */
pagesConfFiles.forEach(function (pagesFile) {
  const pagesConf = require(pagesFile)
  appConf.pages.push(pagesConf)
})

module.exports = {
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
  }
}
