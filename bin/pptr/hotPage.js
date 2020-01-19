const appConfigHandler = require('./appConfigHandler')
module.exports = async function (page) {
  const appConf = appConfigHandler.getAppConfig(page)
  if (appConf.defaultPage) {
    await page.goto(appConf.defaultPage)
  }

  /* 获取页面的所有框架 */
  // dumpFrameTree(page.mainFrame(), '')
  // function dumpFrameTree (frame, indent) {
  //   console.log(indent + frame.url())
  //   for (const child of frame.childFrames()) { dumpFrameTree(child, indent + '  ') }
  // }
}
