const path = require('path')
const rootPath = require('../rootPath')
const glob = require('fast-glob')
const appConf = require('../../config/app.conf')
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

module.exports = appConf
