const fs = require('fs-extra')
const path = require('path')
const utils = require('../utils/index')
const appConf = require('./appConfigHandler.js')
const WebsiteCache = require('../sqlite3/websiteCache')

module.exports = function (res, conf) {
  if (!conf || !conf.cacheRules) return
  const cacheDir = conf.cacheDir || appConf.cacheDir
  const cryptoType = conf.cryptoType || appConf.cryptoType
  const cache = new WebsiteCache(cacheDir, cryptoType)

  const cacheResponse = {
    /* 保存response数据 */
    save: async function (res) {
      const req = res.request()
      const url = req.url()
      const base64Url = url.startsWith('data:')

      /* 不报错非200状态或为base64url的数据 */
      if (res.status() !== 200 || base64Url) return false

      const urlInfo = new URL(url)
      const urlPath = urlInfo.origin + urlInfo.pathname
      const urlPathFingerprint = cache.fingerprint(urlPath)
      const urlFingerprint = cache.fingerprint(url)

      // fs.ensureDirSync(path.join(cacheDir, urlInfo.host))

      const fileBuffer = await res.buffer().catch(() => {
        console.error('读取响应内容buffer失败：', url)
      })

      /* 未获取到buffer或buffer长度为0，都不再往下执行 */
      if (!fileBuffer || !fileBuffer.length) return false

      const responseDataFingerprint = cache.fingerprint(fileBuffer.toString())

      const filePathname = (!urlInfo.pathname || urlInfo.pathname === '/') ? '/' + urlInfo.host : urlInfo.pathname
      let filePath = path.join(cacheDir, urlInfo.host, filePathname)

      /* 消除同一个路径下，参数不一样，返回内容一样的文件 */
      if (urlInfo.search && fs.existsSync(filePath)) {
        const stat = await fs.stat(filePath)
        if (stat.isFile()) {
          /* 提取同一路径下的所有信息记录 */
          const cacheData = cache.select(urlPathFingerprint, 'path_hash')

          /* 附带操作：修剪同一路径下不同内容的缓存数据，使其保持在最近条10左右，而不是无限累积 */
          const trimData = cacheData.concat(cache.tmpCache.filter(item => item.path_hash === urlPathFingerprint))
          trimData.length > 20 && cacheResponse.trimCacheData(trimData)

          /* 删除旧有数据中与当前内容一致的记录 */
          const theSameData = cacheData.filter(item => item.response_data_hash === responseDataFingerprint)
          if (theSameData.length) {
            cache.deleteByUrls(theSameData.map(item => item.url))
            cacheResponse.deleteCacheFileByCacheData(theSameData)
          }

          /* 删除临时缓存中的相关数据 */
          let tmpCacheData = cache.tmpCache.filter(item => item.response_data_hash === responseDataFingerprint)
          tmpCacheData = tmpCacheData.filter(item => item.path_hash === urlPathFingerprint)
          if (tmpCacheData.length) {
            const tmpObj = {}
            tmpCacheData.forEach(item => { tmpObj[item.url_hash] = item })
            cache.tmpCache = cache.tmpCache.filter(item => !tmpObj[item.url_hash])
            cacheResponse.deleteCacheFileByCacheData(tmpCacheData)
          }
        }

        /* 根据url指纹产生新文件路径 */
        filePath = path.join(cacheDir, urlInfo.host, urlInfo.pathname + '_' + urlFingerprint)
      }

      /* 存储文件到缓存目录 */
      fs.outputFile(filePath, fileBuffer).catch(() => {
        console.error('缓存失败：', url)
      })

      const resHeaders = res.headers()

      /* 记录相关信息到cache文件 */
      const cacheInfo = {
        host: urlInfo.host,
        path: urlPath,
        url: url,
        url_hash: urlFingerprint,
        path_hash: urlPathFingerprint,
        response_data_hash: responseDataFingerprint,
        content_type: resHeaders['content-type'],
        server_time: resHeaders.date,
        server_name: resHeaders.server,
        request_header: req.headers(),
        response_header: res.headers(),
        content_encoding: resHeaders['content-encoding'],
        cache_name: '',
        cache_control: resHeaders['cache-control'],
        etag: resHeaders.etag,
        server_ip_address: res.remoteAddress().ip,
        url_length: url.length,
        response_data_length: resHeaders['content-length'],
        info: {
          method: req.method(),
          postData: req.postData(),
          // redirectChain 是循环引用的对象,会导致入库时出错
          // redirectChain: req.redirectChain(),
          resourceType: req.resourceType()
        }
      }

      cache.delayInsert(cacheInfo)
    },

    /**
     * 对缓存结果进行修剪优化
     * @param cacheData {Object|Array} -必选 缓存数据
     */
    trimCacheData (cacheData) {
      cacheData = utils.argToArr(cacheData)
      const trimResult = cache.trimResult(cacheData, 10)
      console.log('存在需要修剪优化的数据：', trimResult.length)
      cacheResponse.deleteCacheFileByCacheData(trimResult)
    },

    /**
     * 根据缓存数据信息，删除对应的缓存文件
     * @param cacheData {Object|Array} -必选 缓存数据
     */
    deleteCacheFileByCacheData (cacheData) {
      cacheData = utils.argToArr(cacheData)
      cacheData.forEach(item => {
        const urlInfo = new URL(item.url)
        const filePath = path.join(cacheDir, urlInfo.host, urlInfo.pathname + '_' + item.url_hash)
        fs.remove(filePath).catch(err => {
          console.log('文件删除失败：', filePath, err)
        })
      })
    },

    /**
     * 根据缓存规则进行数据存储
     * @param res
     * @param cacheRules
     * @returns {Promise<unknown>}
     */
    saveWithCacheRules: async function (res, cacheRules) {
      if (res._saveing_) {
        await res._saveing_.catch(err => console.error(err))
      }

      /* 防止多次存储 */
      if (res._saved_) return true

      async function saveingHandler (resolve, reject) {
        const req = res.request()
        const url = req.url()
        const resTypeRule = utils.argToArr(cacheRules.resourceType)
        const urlRule = utils.argToArr(cacheRules.url)
        const matchRule = cacheRules.match

        /* 检测是否命中resourceType规则 */
        if (resTypeRule.length && !resTypeRule.includes(req.resourceType())) {
          return resolve(false)
        }

        /* 检测是否命中url规则 */
        let isMatchUrlRule = false
        if (urlRule.length) {
          for (let i = 0; i < urlRule.length; i++) {
            const rule = urlRule[i]
            if (utils.isRegExp(rule) && rule.test(url)) {
              isMatchUrlRule = true
              break
            } else if (typeof rule === 'string' && url.includes(rule)) {
              isMatchUrlRule = true
              break
            }
          }
        } else {
          /* 未定义url规则，则视为100%命中 */
          isMatchUrlRule = true
        }
        if (!isMatchUrlRule) return resolve(false)

        /* 检测是否命中match函数规则 */
        if (matchRule instanceof Function) {
          let matchRuleResult = await matchRule(res).catch(err => {
            matchRuleResult = false
            console.error('进行函数规则匹配时出错：', err)
          })

          if (matchRuleResult !== true) return resolve(false)
        }

        /* 通过规则校验，则可进行数据存储了 */
        cacheResponse.save(res).then(() => {
          res._saved_ = true
          resolve(true)
        }).catch(err => {
          console.error(err)
          resolve(false)
        })
      }

      res._saveing_ = new Promise(saveingHandler)

      return res._saveing_
    }
  }

  /* 执行保存操作 */
  cacheResponse.saveWithCacheRules(res, conf.cacheRules)
}
