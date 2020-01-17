/**
 * 响应内容拦截处理器（该脚本负责处理全局逻辑）
 */
module.exports = async function (res, page) {
  /* 传递给响应拦截处理器，分配给各个应用进行单独处理 */
  const adaptor = require('./adaptor')
  await adaptor.response(res, page)
}
