require('../hotMod')
const path = require('path')
const rootPath = require('../rootPath')
const JsonFile = require('../jsonFile')
const apiTable = new JsonFile(path.join(rootPath, 'log/apiTable.json'))
// require('./test')
console.log('11223442342432')

if (module.hot) {
  module.hot.runOnChange({
    modulePath: './test',
    onChange: function (moduleContext) {
      moduleContext('module.hot.runOnChange')
    }
  })
}
