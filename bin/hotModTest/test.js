require('../hotMod')
// if (module.hot) {
//   module.hot.trigger = true
// }
const now = Date.now()
console.log('te131234221--test tes2 12', now)
module.exports = function (msg) {
  console.log('test', msg, now)
}

setInterval(function () {
  // console.log('-------')
  require('./a')
}, 1000 * 3)
