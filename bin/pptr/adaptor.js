const path = require('path')
const rootPath = require('../rootPath')
const utils = require('../utils/index')
const cacheResponse = require('./cacheResponse')

let browser = null

/* 配置自动热更新 */
const pageMatCache = {}
let appConf = require('./appConfigHandler.js')

/* 保证数据结构正确 */
appConf = appConf || {}
if (!Array.isArray(appConf.pages)) {
  appConf.pages = []
}

/**
 * 热更新模式下，由于adaptor模块缓存会不断清除，然后重新加载，
 * 所以会导致下面的函数不断初始化，如果在onChange里面进行console输出
 * 将看到大量重复调用的打印内容，算是正常现象
 */
if (module.hot) {
  module.hot.trigger = true
  module.hot.onReload(async function (filePath) {
    /* 尝试对browser实例的第一个page Tab进行刷新，应用最新变更的代码 */
    if (browser) {
      let reloadUrl = ''

      /* 尝试定位到被修改的页面地址 */
      if (filePath.startsWith(path.join(rootPath, 'pages/'))) {
        const triggerConf = require(filePath)
        if (triggerConf && triggerConf.defaultEntry) {
          reloadUrl = triggerConf.defaultEntry
        }
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
  })
}

/**
 * url匹配器，支持字符字符，正则表达式，数组
 * @param url {String} -必选 要匹配的url路径
 * @param matchRule {String|RegExp|Array} -必选 匹配规则
 * 如果匹配规则是字符串，则使用包含判断条件，即url包含所要匹配规则的字符即为匹配通过
 * 如果为正则表达式，则test通过即为匹配通过
 * 如果为数组，则数组里面可以是字符串规则也可以是正则表达式规则
 * 只要其中一条规则匹配上即视为匹配通过
 * @returns {boolean}
 */
function urlMatcher (url, matchRules) {
  let isMatch = false
  if (!matchRules) return isMatch

  matchRules = Array.isArray(matchRules) ? matchRules : [matchRules]

  /* 遍历所提供的url字符串是否跟所提供的规则相匹配 */
  for (let i = 0; i < matchRules.length; i++) {
    const rule = matchRules[i]
    if (typeof rule === 'string') {
      if (url.includes(rule)) {
        isMatch = true
        break
      }
    } else if (utils.isRegExp(rule)) {
      if (rule.test(url)) {
        isMatch = true
        break
      }
    }
  }

  return isMatch
}

/**
 * 根据提供的page对象里当前对应的url来查找有没有需要处理的自定义规则
 * 为了加快查找进程，默认情况下，无论最终有没有匹配到自定义规则，都会对结果进行缓存
 * 也就是说，第一次的匹配结果就决定了后面的所有匹配结果
 * @param page {Object} -必选 页面对象
 * @param disableCache {Boolean} -可选 禁止使用缓存结果直接遍历查找，默认false
 * @returns {*[]|*} 使用返回数组
 */
function pageMatcher (page, disableCache) {
  if (!page || !utils.isFunction(page.url)) {
    return []
  }

  /* 保存浏览器实例，用于其它异步操作 */
  browser = page.browser()

  const sourceUrl = page.url()

  /* 如果缓存已经有相关的匹配结果，则直接取缓存结果，减少遍历次数 */
  if (!disableCache && pageMatCache[sourceUrl]) {
    // console.log('从缓存得到的匹配结果')
    return pageMatCache[sourceUrl]
  }

  const matchResult = []
  appConf.pages.forEach((conf) => {
    if (conf.enabled !== false && urlMatcher(sourceUrl, conf.matchRules)) {
      matchResult.push(conf)
    }
  })

  /* 不管有没有匹配到自定义的规则，都将匹配结果进行缓存 */
  pageMatCache[sourceUrl] = matchResult

  return pageMatCache[sourceUrl]
}

const adaptor = {
  /* 文档加载时候的适配器 */
  domcontentloaded (page) {
    const matchResult = pageMatcher(page)
    matchResult.forEach((conf) => {
      utils.isFunction(conf.onDomcontentloaded) &&
      conf.onDomcontentloaded(page)
    })
  },

  /* 请求内容适配器 */
  load (page) {
    const matchResult = pageMatcher(page)
    matchResult.forEach((conf) => {
      utils.isFunction(conf.onLoad) &&
      conf.onLoad(page)
    })
  },

  /* 请求内容适配器 */
  async request (req, page) {
    const matchResult = pageMatcher(page)
    const promiseList = []

    for (let i = 0; i < matchResult.length; i++) {
      const conf = matchResult[i]

      /* 根据interceptResourceType进行资源拦截 */
      if (Array.isArray(conf.interceptResourceType) && conf.interceptResourceType.includes(req.resourceType())) {
        req.abortReq()
      }

      if (utils.isFunction(conf.onRequest)) {
        if (utils.isAsyncFunction(conf.onRequest)) {
          promiseList.push(conf.onRequest(req, page))
        } else {
          /* 非异步函数，直接执行完成便了事 */
          conf.onRequest(req, page)
        }
      }
    }

    if (promiseList.length) {
      return Promise.all(promiseList)
    } else {
      return true
    }
  },

  /* 响应内容适配器 */
  async response (res, page) {
    const matchResult = pageMatcher(page)
    const promiseList = []

    for (let i = 0; i < matchResult.length; i++) {
      const conf = matchResult[i]
      if (utils.isFunction(conf.onResponse)) {
        if (utils.isAsyncFunction(conf.onResponse)) {
          promiseList.push(conf.onResponse(res, page))
        } else {
          /* 非异步函数，直接执行完成便了事 */
          conf.onResponse(res, page)
        }
      }

      /* 根据缓存规则进行数据缓存 */
      if (conf.cacheRules) {
        cacheResponse(res, conf)
      }
    }

    /* 根据全局的缓存规则进行数据缓存 */
    if (appConf.cacheDir && appConf.cacheRules) {
      cacheResponse(res, appConf)
    }

    if (promiseList.length) {
      return Promise.all(promiseList)
    } else {
      return true
    }
  },

  /* 打印浏览器下的控制台信息适配器 */
  printConsoleMsg (msg, page) {
    const globalConf = appConf.printConsoleMsg

    /* 全局已全部打印，则局部无需再重复打印 */
    if (globalConf === true) return true

    const matchResult = pageMatcher(page)
    matchResult.forEach((conf) => {
      const localConf = conf.printConsoleMsg
      if (!localConf) return true

      let resultConf = false
      let excludeConf = []

      if (!globalConf) {
        /* 全局未配置任何规则，则所有都取局部规则即可 */
        resultConf = localConf || false
      } else if (Array.isArray(globalConf)) {
        if (Array.isArray(localConf)) {
          /* 如果同是数组规则，则排除跟全局一样的，剩下的才是需要输出的 */
          resultConf = localConf.filter(item => !globalConf[item])
        } else if (localConf === true) {
          excludeConf = globalConf
        }
      }

      /* 进行打印输出 */
      if (excludeConf.length && !excludeConf.includes(msg.type())) {
        console[msg.type()].apply(console, msg.args)
      } else if (Array.isArray(resultConf) && resultConf.includes(msg.type())) {
        console[msg.type()].apply(console, msg.args)
      }
    })
  },

  /**
   * 因为直接打印和调用console事件的时机不一致
   * 所以console适配器和printConsoleMsg适配器须分开处理
   * @param msg
   * @param args
   */
  console (msg, page) {
    const matchResult = pageMatcher(page)
    matchResult.forEach((conf) => {
      utils.isFunction(conf.onConsole) &&
      conf.onConsole(msg, page)
    })
  }
}
module.exports = adaptor
