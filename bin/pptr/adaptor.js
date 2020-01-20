const utils = require('../utils/index')
const cacheResponse = require('./cacheResponse')
const appConfigHandler = require('./appConfigHandler.js')

/* 配置自动热更新 */
const pageMatCache = {}
let appConf = appConfigHandler.getAppConfig()

/* 保证数据结构正确 */
appConf = appConf || {}
if (!Array.isArray(appConf.pages)) {
  appConf.pages = []
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

  /* 更新happyPuppeteer的自定义的配置 */
  appConf = appConfigHandler.getAppConfig(page)

  const happyPuppeteer = appConfigHandler.getHappyPuppeteer(page)
  const sourceUrl = page.url()

  /* 如果缓存已经有相关的匹配结果，则直接取缓存结果，减少遍历次数 */
  const cacheResult = pageMatCache[sourceUrl]
  if (!disableCache && cacheResult) {
    if (happyPuppeteer) {
      /* 获取跟全局保持一致的page配置 */
      const result = []
      for (let i = 0; i < cacheResult.length; i++) {
        const conf = cacheResult[i]
        if (happyPuppeteer.pagesConfig[conf._filePath]) {
          result.push(happyPuppeteer.pagesConfig[conf._filePath])
        } else {
          result.push(conf)
        }
      }
      return result
    } else {
      /* 纯缓存配置 */
      console.log('从缓存得到的匹配结果')
      return cacheResult
    }
  }

  const matchResult = []
  appConf.pages.forEach((conf) => {
    if (conf.enabled !== false && urlMatcher(sourceUrl, conf.matchRules)) {
      // console.log('匹配到的规则数据：', conf)
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
