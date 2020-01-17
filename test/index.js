/*!
 * @name         index.js
 * @description  test file
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/1/17 上午11:49
 * @github       https://github.com/xxxily
 */
const path = require('path')
const rootPath = require('../bin/rootPath')
const HappyPuppeteer = require('../bin/index')
const myPptr = new HappyPuppeteer({
  app: {
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
    cacheRules: {
      // resourceType: ['image', 'xhr'],
      // url: [],
      // match: async function (res) { return true }
    },
    printConsoleMsg: false,
    pagesHandlerFilesDir: '',
    /* 不建议在此处配置pages选项，请在pages目录下进行逐个配置 */
    pages: [
      {
        describe: 'demo',
        enabled: false,
        matchRules: /\s+/,
        defaultEntry: 'https://news.163.com',
        interceptResourceType: ['image', 'font', 'other'],
        onDomcontentloaded: async function (page) {},
        onLoad: function (page) {},
        onRequest: async function (req, page) {},
        onResponse: async function (res, page) {},
        printConsoleMsg: ['log'],
        onConsole: function (msg, page) {}
      }
    ]
  },
  chromeLaunch: {
    chromeFlags: [
      // '--disable-setuid-sandbox',
      // '--headless'
      // '--disable-gpu'
    ],
    // chromePath: 'D:\\Program Files\\MyChrome\\Chrome\\chrome.exe',
    userDataDir: path.join(rootPath, '.browser/userData/'),
    logLevel: 'info',
    output: 'json'
  }
})
myPptr.start()
// myPptr.stop()