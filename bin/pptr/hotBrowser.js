/*!
 * @name         hotBrowser.js
 * @description  支持热刷新地编写
 * @version      0.0.1
 * @author       Blaze
 * @date         2019/12/11 下午3:51
 * @github       https://github.com/xxxily
 */
const hotPage = require('./hotPage')
module.exports = async function (browser) {
  /* 新开一个可被管理的page页 */
  const newPage = await browser.newPage()

  /**
   * 启动应用或修改该文件时，关闭其它不受当前脚本控制的page
   */
  const pages = await browser.pages()
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (page !== newPage) {
      await page.close()
    }
  }

  hotPage(newPage)

  if (module.hot) {
    /* 热更新运行page相关的操作 */
    module.hot.runOnChange({
      modulePath: './hotPage',
      onChange: function (moduleContext) {
        moduleContext instanceof Function && moduleContext(newPage)
      }
    })
  }
}
