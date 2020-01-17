/*!
 * @name         jsonFile.js
 * @description  读写json文件，基于fs-extra，简化json操作，减少异常处理
 * @version      0.0.1
 * @author       Blaze
 * @date         2019/1/21 17:15
 * @github       https://github.com/xxxily
 */

const fs = require('fs-extra')
const path = require('path')

class JsonFile {
  /**
   * new 的时候可以传一个json文件的路径和写入的格式选项
   * @param filePath
   * @param options
   */
  constructor (filePath, options) {
    this.setFilePath(filePath)
    this.setOptions(options)
  }

  /**
   * 设置写入json的格式选项，默认使用制表符进行格式，更多选项请参考：
   * https://github.com/jprichardson/node-fs-extra/blob/master/docs/writeJson.md
   * @param options
   */
  setOptions (options) {
    const defOpt = this.getOptions()
    options = Object.assign(defOpt, options || {})
    this.options = options
  }

  getOptions () {
    return this.options || {
      spaces: '\t'
    }
  }

  setFilePath (filePath) {
    this.jsonFilePath = filePath || this.jsonFilePath || ''
  }

  getFilePath () {
    return this.jsonFilePath
  }

  /**
   * 读取json信息，文件不存在也不会报错，只会空对象{}
   * @param filePath {path} -可选，指定文件路径，如果不指定则使用初始化或setFilePath时的路径
   * @returns {Promise<any>}
   */
  read (filePath) {
    const t = this
    const jsonPath = filePath || t.getFilePath()
    return new Promise(async function (resolve, reject) {
      const jsonPathExists = await t.isExists(jsonPath).catch(reject)
      let json = {}

      if (jsonPathExists) {
        json = await fs.readJson(jsonPath).catch(reject)
      }

      resolve(json)
    })
  }

  readSync (filePath) {
    const t = this
    const jsonPath = filePath || t.getFilePath()
    const jsonPathExists = fs.existsSync(jsonPath)
    let json = {}

    if (jsonPathExists) {
      json = fs.readJsonSync(jsonPath, { throws: false })
    }

    return json || {}
  }

  /**
   * 写入json信息
   * @param json {object} -必选 json对象
   * @param options {object} -可选 写入json的格式化选项
   * @param filePath {path} -可选，同read方法的filePath
   * @returns {Promise<any>}
   */
  write (json, options, filePath) {
    const t = this
    const jsonPath = filePath || t.getFilePath()
    return new Promise(async function (resolve, reject) {
      const jsonPathExists = await t.isExists(jsonPath).catch(reject)

      if (!jsonPathExists) {
        await fs.ensureDir(path.dirname(jsonPath)).catch(reject)
      }

      options = Object.assign(t.getOptions(), options || {})
      await fs.writeJson(jsonPath, json || {}, options).then(resolve).catch(reject)
    })
  }

  writeSync (json, options, filePath) {
    const t = this
    const jsonPath = filePath || t.getFilePath()
    const jsonPathExists = fs.existsSync(jsonPath)

    if (!jsonPathExists) {
      fs.ensureDirSync(path.dirname(jsonPath))
    }

    options = Object.assign(t.getOptions(), options || {})
    fs.writeJsonSync(jsonPath, json || {}, options)
  }

  /**
   * 判断是否存在，由于不管是否存在json文件，read的时候都会返回对象，
   * 所以如果有需要进行存在性判断则可以使用这个方法
   * @param filePath {path} -可选，指定文件路径
   * @returns {Promise<any>}
   */
  isExists (filePath) {
    const t = this
    const jsonPath = filePath || t.getFilePath()
    return fs.pathExists(jsonPath)
  }

  isObj (obj) {
    return Object.prototype.toString.call(obj) === '[object Object]'
  }

  /**
   * 根据path从一个对象中获取其对应的对象值
   * @param json {json} -必选 数据对象，例如：{a:{b:1}}
   * @param path {string} -必选 获取里面的对象里面数据的路径字符串，如'a.b'
   * @returns {*}
   */
  getData (json, path) {
    if (!path) {
      return json
    }

    const t = this
    const keys = path.split('.')
    let result = json

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]
      if (index === keys.length - 1) {
        result = result[key]
      } else {
        if (t.isObj(result[key])) {
          result = result[key]
        }
      }
    }
    return result
  }

  /**
   * 根据path将数据写入到json的指定位置，注意，路径的所有节点必须为对象，如果不是会自动转成对象，然后递归进入到最终节点，再写入数据
   * @param json {json} -必选 -必选 同getData
   * @param path {string} -必选 同getData
   * @param data {*} -必选 要写入的数据
   * @returns {*}
   */
  setData (json, path, data) {
    const t = this

    if (!path || !t.isObj(json)) {
      console.error('参数不正确，无法进行数据设置~')
      return json
    }

    const keys = path.split('.')
    let tmpObj = json

    // 例如对象指针的特性，步步递进到目标节点，并对最终节点进行赋值
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]
      if (index === keys.length - 1) {
        tmpObj[key] = data
      } else {
        if (!t.isObj(tmpObj[key])) {
          tmpObj[key] = {}
        }
        tmpObj = tmpObj[key]
      }
    }
    return json
  }

  /**
   * 将数据写入某个节点，该操作每次都会去读取json文件，然后写入，对于需频繁修改的，建议先读取完json数据，修改完后再一次性写入会好很多
   * 注意: 如果同一时刻进行多次写入操作，将会导致数据流异常，建议使用同步方法
   * @param data {all} -必选 所有json支持的数据类型
   * @param chainPath {string} -必选 节点路径，例如 'data.count' 则最终写到json数据的data.coutn下
   * @param filePath {path} -可选，同read方法的filePath
   */
  writeToNode (nodePath, data, filePath) {
    if (!nodePath) {
      console.error('写入失败，必须提供节点路径')
      return false
    }

    const t = this
    const jsonPath = filePath || t.getFilePath()
    return new Promise(async function (resolve, reject) {
      let json = await t.read(jsonPath).catch(reject)
      json = t.setData(json, nodePath, data)
      t.write(json, t.getOptions(), jsonPath).then(resolve).catch(reject)
    })
  }

  writeToNodeSync (nodePath, data, filePath) {
    if (!nodePath) {
      console.error('写入失败，必须提供节点路径')
      return false
    }

    const t = this
    const jsonPath = filePath || t.getFilePath()
    let json = t.readSync(jsonPath)
    json = t.setData(json, nodePath, data)
    t.writeSync(json, t.getOptions(), jsonPath)
  }

  /**
   * 读取某个节点的数据，该操作每次都会去读取json文件，不建议频繁进行节点读取
   * @param chainPath {string} -必选 节点路径，例如 'data.count' 则最终写到json数据的data.coutn下
   * @param filePath {path} -可选，同read方法的filePath
   */
  readNode (nodePath, filePath) {
    if (!nodePath) {
      console.error('读取失败，必须提供节点路径')
      return false
    }

    const t = this
    const jsonPath = filePath || t.getFilePath()
    return new Promise(async (resolve, reject) => {
      const json = await t.read(jsonPath).catch(reject)
      const result = t.getData(json, nodePath)
      resolve(result)
    })
  }

  readNodeSync (nodePath, filePath) {
    if (!nodePath) {
      console.error('读取失败，必须提供节点路径')
      return false
    }

    const t = this
    const jsonPath = filePath || t.getFilePath()
    const json = t.readSync(jsonPath)
    const result = t.getData(json, nodePath)
    return result
  }
}

module.exports = JsonFile
