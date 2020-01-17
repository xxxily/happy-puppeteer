/**
 * 页面指向 domcontentloaded 事件时的回调操作
 * @param page
 */
module.exports = async function (page) {
  if (!page._firstReques_) {
    console.error('初始化拦截失败，不应该执行此次的domcontentloaded事件', page.url())
    return false
  }

  const adaptor = require('./adaptor')
  adaptor.domcontentloaded(page)
}
