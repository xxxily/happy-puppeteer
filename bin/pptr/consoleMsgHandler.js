const Pipeline = require('../Pipeline')
/* 将事件产生的数据按事件触发的先后顺序进行输出 */
const msgPipeline = new Pipeline(async function (data) {
  const { msg, page } = data
  if (console[msg.type()]) {
    const args = [`from [ ${page.url()} ] console.${msg.type()}:`]

    /* 尝试提取json数据 */
    for (let i = 0; i < msg.args().length; ++i) {
      const JSHandle = msg.args()[i]
      const val = await JSHandle.jsonValue().catch(() => {})
      if (val && JSON.stringify(val) !== '{}')args.push(val)
    }

    /* 如果提取失败，则直接输出msg.text */
    if (args.length === 1) {
      args.push(msg.text())
    }

    /* 在node控制台打印浏览器的控制台输出 */
    const appConf = require('../../config/app.conf')
    if (appConf.printConsoleMsg === true) {
      /* 输出全部类型的消息 */
      console[msg.type()].apply(console, args)
    } else if (Array.isArray(appConf.printConsoleMsg)) {
      /* 输出指定类型的消息 */
      if (appConf.printConsoleMsg.includes(msg.type())) {
        console[msg.type()].apply(console, args)
      }
    }

    /* 通过适配器，适配到各个页面的输出规则 */
    msg.args = args
    const adaptor = require('./adaptor')
    adaptor.printConsoleMsg(msg, page)
  }
})

module.exports = (msg, page) => {
  /* 通过console适配器，将浏览器的console分配到给各个pages进行单独处理 */
  const adaptor = require('./adaptor')
  adaptor.console(msg, page)

  /* 按顺序进行纯打印输出 */
  msgPipeline.pushToHandler({ msg, page })
}
