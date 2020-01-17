/**
 * chrome请求的拦截器
 * 其它处理器会在拦截器正常工作后统一注入
 */
const frameattachedHandler = require('./frameattachedHandler')
const domLoadedHandler = require('./domLoadedHandler')
const loadHandler = require('./loadHandler')
const consoleMsgHandler = require('./consoleMsgHandler')
const requestHandler = require('./requestHandler')
const responseHandler = require('./responseHandler')

const intercepter = {
  async setIntercepter (page) {
    /* 当传入target对象时，自动根据target对象提取page */
    if (page && page.page instanceof Function) {
      page = await page.page()
    }

    if (page && page.setRequestInterception && !page._isSetRequestInterception_) {
      /* 防止重复注册拦截事件 */
      page._isSetRequestInterception_ = true

      page.setCacheEnabled(false)

      await page.setRequestInterception(true)
      page.on('request', async req => {
        /**
         * 有时候puppeteer进行拦截请求操作的时间会落后于页面实际发出请求的时间
         * 所以会错过一部分链接的拦截，为了确保拦截正常，只能增加附加检测条件
         * 方案1： 如果拦截到的第一个请求不是文档页面，则自动刷新当前页
         */
        if (!page._firstReques_) {
          const maxReloadCount = 2
          page._autoReloadCount_ = page._autoReloadCount_ || 0
          const needReload = req.resourceType() !== 'document' &&
            page.url() !== req.url() &&
            page._autoReloadCount_ < maxReloadCount
          if (needReload) {
            page._autoReloadCount_ += 1
            await page.reload()
          } else {
            /* 标注当前page初始链接拦截成功 */
            page._firstReques_ = req.url()

            /**
             * 其它功能都应该在页面的首个请求拦截成功后初始化，
             * 否则容易出现功能异常，例如domcontentloaded事件不能100%执行
             */
            if (!page._globalInit_) {
              page.on('frameattached', () => frameattachedHandler(page))
              page.on('domcontentloaded', () => domLoadedHandler(page))
              page.on('load', () => loadHandler(page))
              page.on('console', msg => consoleMsgHandler(msg, page))

              page._globalInit_ = true
            }
          }
        }

        /* 通过requestHandler统一管理请求拦截逻辑 */
        await requestHandler(req, page)
      })

      page.on('response', async res => {
        /* 通过responseHandler统一管理请求拦截逻辑 */
        await responseHandler(res, page)
      })
    }
  }
}

if (module.hot) { module.hot.trigger = true }
module.exports = intercepter
