const fs = require('fs-extra')
const path = require('path')
const rootPath = require('../bin/rootPath')
const appConf = {
  defaultPage: 'http://jandan.net/top',
  /* 拦截资源类型，可选值：image|stylesheet|font|script|xhr|other */
  // interceptResourceType: ['image', 'font', 'other'],
  /* 拦截url */
  interceptUrl: [],
  replaceUrl: [],
  logLevel: 'info',
  /* 配置全局使用的加密类型，可以是md5或sha256 */
  cryptoType: 'md5',
  cacheDir: path.join(rootPath, 'browser/pptr/cache'),
  /**
   * 缓存规则，三条规则为并的关系，即叠加限定
   * 例如同时配置了 resourceType:['image'], url: ['www.baidu.com'],
   * 即表示 保存url 包含 ’www.baidu.com‘ 的图片资源才会被缓存起来
   * 如果配置了match函数，则只有 match 函数返回了true 才会被缓存
   * 例如在前面的配置基础上，加了一个空函数，function () {}，
   * 因为函数任何时候都没返回true，则标识永远都不会进行缓存，所以如果配置了match函数，则必须明确返回true的条件
   * match函数支持异步函数，如果只想通过，resourceType和url规则控制缓存，则可以将match设为null，或写一个始终返回true的函数
   */
  cacheRules: {
    // resourceType: ['image', 'xhr'],
    // url: [],
    // match: async function (res) { return true }
  },

  /* 重置缓存数据，如果为true，则每次重启应用将清空之前缓存到的所有内容 */
  resetCacheData: false,

  /**
   * 全局配置输出浏览器里哪些类型的消息，
   * true 全部类型的消息都输出， false 不输出任何消息
   * 其它可选值放在数组里面，表示指定输出哪种类型的消息
   * 例如 log|error|info|table等
   */
  printConsoleMsg: false,
  /* 不建议在此处配置pages选项，请在pages目录下进行逐个配置 */
  pages: [
    {
      describe: 'demo',
      enabled: false,
      matchRules: /\s+/,
      defaultEntry: 'https://news.163.com',
      /* 拦截资源类型，可选值：image|stylesheet|font|script|xhr|other */
      interceptResourceType: ['image', 'font', 'other'],
      onDomcontentloaded: async function (page) {},
      onLoad: function (page) {},
      onRequest: async function (req, page) {
        // console.log('onRequest:', req.url())
        // await req.sleep(3000)
      },
      onResponse: async function (res, page) {
        // const req = res.request()
        // console.log('onResponse', req.url())
      },
      printConsoleMsg: ['log'],
      onConsole: function (msg, page) {}
    }
  ]
}

/* 自动生成缓存目录 */
fs.ensureDirSync(appConf.cacheDir)
/* 清空旧缓存数据 */
if (appConf.resetCacheData) { fs.emptyDirSync(appConf.cacheDir) }

module.exports = appConf
