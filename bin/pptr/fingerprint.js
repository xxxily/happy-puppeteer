/*!
 * @name         fingerprint.js
 * @description  根据全局配置创建指纹信息
 * @version      0.0.1
 * @author       Blaze
 * @date         2019/12/30 上午10:23
 * @github       https://github.com/xxxily
 */

const appConf = require('./appConfigHandler.js')
const crypto = require('crypto')

/* 根据全局配置来创建md5或sha256指纹 */
const fingerprint = text => crypto.createHash(appConf.cryptoType || 'sha256').update(String(text)).digest('hex')

module.exports = fingerprint
