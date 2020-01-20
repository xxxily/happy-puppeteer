const path = require('path')
const rootPath = require('../bin/rootPath')

module.exports = {
  describe: '图片提取测试11321',
  enabled: true,
  matchRules: [
    'jandan.net'
  ],
  defaultEntry: 'http://jandan.net/top',
  onDomcontentloaded: async function (page) {},
  onLoad: function (page) {},
  /* 拦截资源类型，可选值：image|stylesheet|font|script|xhr|other */
  // interceptResourceType: ['image', 'font', 'other'],
  onRequest: async function (req, page) {},
  cacheDir: path.join(rootPath, '.browser/images.collecter'),
  cacheRules: {
    resourceType: ['image'],
    url: [],
    match: async function (res) {
      const req = res.request()
      const url = req.url()
      const imageBuf = await res.buffer()

      if (imageBuf.length > 1024 * 30 && !url.includes('jandan.net')) {
        console.log('图片已保存：', url)
        return true
      }
    }
  },
  onResponse: async function (res, page) {
    const req = res.request()
    const url = req.url()

    if (res.status() !== 200) {
      console.error('状态码不正确：', url, res.status())
      return false
    }
  },
  printConsoleMsg: ['log'],
  onConsole: function (msg, page) {}
}
