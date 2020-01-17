const utils = require('../utils/index')
module.exports = async function (req, page) {
  /* 增加休眠(挂起)方法 */
  req.sleep = utils.sleep

  const appConf = require('../../config/app.conf.js')
  req.abortReq = function () {
    if (!req._isAbort_) {
      req.abort()
      req._isAbort_ = true
    }
  }

  /* 已被abort处理的直接continue会抛错，所以需要根据标记来确定要不要continue */
  req.continueReq = function () {
    if (!req._isAbort_) {
      req.continue()
    }
  }

  /* 根据配置拦截对应类型的内容 */
  if (Array.isArray(appConf.interceptResourceType) && appConf.interceptResourceType.includes(req.resourceType())) {
    req.abortReq()
  }

  /* 传递给请求拦截处理器，分配给各个应用进行单独处理 */
  const adaptor = require('./adaptor')
  await adaptor.request(req, page)

  req.continueReq()
}
