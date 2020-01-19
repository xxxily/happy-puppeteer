const fs = require('fs-extra')
const path = require('path')
const sqlite3 = require('better-sqlite3')
const utils = require('../utils/index')
const SQL = require('./sqlFragment')
const crypto = require('crypto')
const appConfigHandler = require('../pptr/appConfigHandler')
const appConf = appConfigHandler.getAppConfig()
const md5 = text => crypto.createHash('md5').update(String(text)).digest('hex')

/* 保存创建过的实例，进行复用 */
const websiteCacheInstances = {}

class WebsiteCache {
  constructor (cacheDir, cryptoType) {
    cacheDir = cacheDir || appConf.cacheDir
    cryptoType = cryptoType || appConf.cryptoType

    /* 如果实例已存在，则使用之前初始化好的实例，防止多实例同时操作数据库，出问题 */
    const instanceKey = md5(cacheDir)
    if (websiteCacheInstances[instanceKey]) {
      return websiteCacheInstances[instanceKey]
    } else {
      websiteCacheInstances[instanceKey] = this
    }

    fs.ensureDirSync(cacheDir)
    this.dbPath = path.join(cacheDir, 'cache.db')
    this.db = sqlite3(this.dbPath, {})

    /* 如果数据表不存在则自动创建 */
    this.db.prepare(SQL.createTable).run()
    /* 如果索引不存在则自动创建 */
    this.needIndexColumn = [
      'url_hash',
      'path_hash',
      'response_data_hash',
      'url',
      'host',
      'path',
      'last_accessed'
    ]

    /* 将需要进行索引的列进行索引 */
    this.needIndexColumn.forEach(columnName => this.db.prepare(SQL.createIndexCode(columnName)).run())

    this.insertStmt = this.db.prepare(SQL.inster)
    this.updateStmt = this.db.prepare(SQL.update)
    this.deleteStmt = this.db.prepare(SQL.delete)

    this.tmpCache = []

    this.cacheDir = cacheDir
    this.cryptoType = cryptoType

    /* 共享创建指纹使用的函数，以便在其它地方也可以保持一致 */
    this.fingerprint = text => crypto.createHash(cryptoType || 'sha256').update(String(text)).digest('hex')

    /* 程序正常退出时，写入缓存数据，以防数据丢失 */
    process.on('exit', () => {
      this.delayInsert([], true)
      this.db.close()
    })
  }

  /* 删除数据库 */
  deleteDatabase () {
    const t = this
    t.db.close()
    fs.removeSync(t.dbPath)
  }

  /**
   * 检查要插入的信息的格式或字段是否完被，并自动补充某些字段的信息
   * @param data {Object} -必选 要写入或更新的数据
   * @param oldData {Object} -可选 对应数据库上的旧数据
   * @returns {void|Promise<any>|*|{url_hash}}
   */
  checkInsertData (data, oldData) {
    if (!utils.isObj(data)) return false

    oldData = oldData || {}
    const defData = {
      host: '',
      path: '',
      url: '',
      url_hash: '',
      path_hash: '',
      response_data_hash: '',
      content_type: 'application/unknown',
      create_time: oldData.create_time || Date.now(),
      last_accessed: Date.now(),
      server_time: data.server_time || Date.now(),
      server_last_modified: '',
      expire_time: '',
      server_name: '',
      request_header: '',
      response_header: '',
      content_encoding: '',
      cache_name: '',
      cache_control: '',
      etag: '',
      server_ip_address: '127.0.0.1',
      url_length: 0,
      response_data_length: 0,
      info: '',
      update_count: 0
    }

    /* 进行初步校验与转换 */
    const keys = Object.keys(data)
    for (var i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (typeof defData[key] === 'undefined') {
        console.error(`检测到存在未定义的数据字段：${key}，为了能正常录入数据，已把该字段删除，原数据：`, data)
        delete data[key]
      }

      /**
       * 存入数据库的所有字段的内容都不能为对象
       * 此处将字段内容为对象的自动转成对象字符串
       * 则，其它地方可直接传入对象，无需再转换
       */
      if (utils.isObj(data[key])) {
        try {
          data[key] = JSON.stringify(data[key])
        } catch (e) {
          console.error('转换对象时出错:', e, data[key])
        }
      }
    }

    /**
     * 此处利用merge进行数据合并的原因
     * 1、当数据不存在的时候，可以提供默认参数
     * 2、保证对象的顺序，确保插入的时候参数顺序正确
     */
    const newData = utils.merge(defData, data)

    if (!newData.url_hash) {
      newData.url_hash = this.fingerprint(newData.url)
    }

    return newData
  }

  /**
   * 从数据库里查询数据
   * @param searchStr {String|Array} -必选 要查询的字符串，也可以是数组，当传入的是数组时，支持批量查找，并且将自动建立事务进行查找
   * @param columnName {String} -必选 要再哪个列里面进行查询，
   * 注意：只能在有索引的列下进行查找
   * @param limit {Number} -可选 分页大小，默认1000
   * @param offset {Number} -可选 分页取值的偏移量，默认0
   * @param transaction {Boolean} -可选 强制使用事务进行查找
   * @returns {null|Object|Array}
   */
  select (searchStr, columnName, limit, offset, transaction) {
    /* 允许进行查找的列表，必须是有索引的列才能进行查找，否则会非常慢 */
    const t = this
    const allowSelectColumns = t.needIndexColumn
    if (!searchStr || !allowSelectColumns.includes(columnName)) return []
    limit = limit || 1000
    offset = offset || 0

    /* 如果不存在解释好的SQL预编译脚本则先进行编译 */
    const stmtKey = `select_${columnName}_${limit}_${offset}_stmt`
    if (!t[stmtKey]) {
      t[stmtKey] = t.db.prepare(SQL.createSelectCode(columnName, limit, offset))
    }
    const selectStmt = t[stmtKey]

    /* 创建事务进行查找 */
    if (transaction || Array.isArray(searchStr)) {
      const result = []
      t.db.transaction((data) => {
        for (let i = 0; i < data.length; i++) {
          result.concat(selectStmt.all(data[i]))
        }
      })(searchStr)
      return result
    } else {
      return selectStmt.all(searchStr)
    }
  }

  /**
   * 提取全部数据结果
   * @param limit {Number} -可选 分页大小，默认1000
   * @param offset {Number} -可选 分页取值的偏移量，默认0
   * @param columnNameArr {Array} -可选 指定要筛选的列名称，必须是数组
   * @returns {[]|*}
   */
  selectAll (limit, offset, columnNameArr) {
    const t = this
    limit = limit || 1000
    offset = offset || 0

    /* 如果不存在解释好的SQL预编译脚本则先进行编译 */
    const column = Array.isArray(columnNameArr) && columnNameArr.length ? columnNameArr.join('_') : ''
    const stmtKey = `selectAll_${limit}_${offset}_${column}_stmt`
    if (!t[stmtKey]) {
      t[stmtKey] = t.db.prepare(SQL.createSelectAllCode(limit, offset, columnNameArr))
    }
    const selectAllStmt = t[stmtKey]

    /* 创建事务进行查找 */
    let result = []
    t.db.transaction(() => {
      result = selectAllStmt.all()
    })()
    return result
  }

  /**
   * 根据单个url链接提取对应信息
   * 注意：因为引入了临时缓存概念，有部分数据可能存在缓存却未存在数据库里
   * @param url
   * @returns {null|*}
   */
  selectByUrl (url) {
    return this.select(this.fingerprint(url), 'url_hash')[0]
  }

  /* 根据多个url链接批量提取对应信息 */
  selectByUrls (urls) {
    const t = this
    const result = []
    if (!urls) return result

    urls = typeof urls === 'string' ? [urls] : urls

    t.db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        const item = data[i]
        result.push(t.selectByUrl(item))
      }
    })(urls)

    return result
  }

  /**
   * 根据单个url链接信息再缓存数据里操作是否存在对应数据
   * @param url
   * @returns {null|Object}
   */
  selectByUrlInCache (url) {
    const t = this
    let result = null
    const urlHash = t.fingerprint(url)
    if (t.tmpCache.length) {
      for (let i = 0; i < t.tmpCache.length; i++) {
        const item = t.tmpCache[i]
        if (item.url_hash === urlHash) {
          result = item
          break
        }
      }
    }

    return result
  }

  /**
   * 将数据插入到数据库记录起来，如果数据库里存在对应数据，则是更新该数据
   * @param data {Object|Array} -必选 要插入或更新的数据，支持单条或多条数据
   * @returns {boolean}
   */
  insert (data) {
    const t = this

    if (!utils.isObj(data) && !Array.isArray(data)) {
      console.error('数据格式错误')
      return false
    }

    data = Array.isArray(data) ? data : [data]

    /* 通过事务批量处理要插入或更新的数据 */
    t.db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        let item = data[i]
        if (utils.isObj(item)) {
          const oldData = t.selectByUrl(item.url)
          item = t.checkInsertData(item, oldData)
          if (oldData) {
            // console.log('数据已存在，执行更新操作', i)

            /* 更新次数+1 */
            item.update_count = Number(oldData.update_count) + 1

            const arg = Object.values(item)

            /* 补充最后一个查询限定条件 */
            arg.push(t.fingerprint(item.url))

            t.updateStmt.run.apply(t.updateStmt, arg)
          } else {
            // console.log('数据不存在，执行插入操作', i)
            t.insertStmt.run.apply(t.insertStmt, Object.values(item))
          }
        } else {
          console.error('数据格式不正确：', item)
        }
      }
    })(data)
  }

  /**
   * 延迟写入数据，使用内存进行数据临时缓存，达到一定数据量或一定时间后再批量写入数据
   * 这样能有效减少对数据库频繁操作导致的程序高负荷工作，但同时也有导致数据丢失的风险
   * @param data {Object|Array} -必选 要插入或更新的数据，支持单条或多条数据
   * @param writNow {Boolean} -可选 不再等待，直接将当前数据与缓存数据一并写入
   */
  delayInsert (data, writNow) {
    const t = this
    data = utils.argToArr(data)
    t.tmpCache = t.tmpCache.concat(data)
    if (t.tmpCache.length === 0) return true

    clearTimeout(t._insterTimer_)
    if (writNow || t.tmpCache.length > 100) {
      console.log('save tmpCache to database:', t.tmpCache.length)
      t.insert(t.tmpCache)
      t.tmpCache = []
    } else {
      t._insterTimer_ = setTimeout(() => {
        t.delayInsert([], true)
      }, 1000 * 3)
    }
  }

  /**
   * 将数据插入到数据库记录起来，纯插入操作，不会检查是否已存在相关数据
   * @param data {Object|Array} -必选 要插入或更新的数据
   * @returns {boolean}
   */
  insertOnly (data) {
    const t = this
    if (!utils.isObj(data) && !Array.isArray(data)) {
      console.error('数据格式错误')
      return false
    }

    data = Array.isArray(data) ? data : [data]

    /* 通过事务批量处理要插入或更新的数据 */
    t.db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        let item = data[i]
        if (utils.isObj(item)) {
          item = t.checkInsertData(item)
          t.insertStmt.run.apply(t.insertStmt, Object.values(item))
        } else {
          console.error('数据格式不正确：', item)
        }
      }
    })(data)
  }

  /* 根据url删除对应信息 */
  deleteByUrl (url) {
    return this.deleteStmt.run(this.fingerprint(url))
  }

  /* 根据多条url链接批量删除对应信息 */
  deleteByUrls (urls) {
    const t = this
    const result = []
    if (!urls) return result

    urls = typeof urls === 'string' ? [urls] : urls

    t.db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        const item = data[i]
        result.push(t.deleteByUrl(item))
      }
    })(urls)

    return result
  }

  /**
   * 修剪某个结果集，可用于移除冗余数据
   * @param result {Array} -必选 某个结果集
   * @param reservedCount {Number} -可选 定义保留的数据条数，默认10条
   * @param trimRule {Function} -可选 自定义修剪规则，在函数里面判断是否要修剪掉，如果需要则返回true，默认根据最近访问时间顺序来修剪
   */
  trimResult (result, reservedCount, trimRule) {
    const t = this
    if (!Array.isArray(result) || result.length < reservedCount) return false

    const trimData = []
    /* 自定义修剪方式 */
    if (trimRule instanceof Function) {
      for (let i = 0; i < result.length; i++) {
        const itme = result[i]
        if (trimRule(itme) === true) {
          trimData.push(itme)
        }
      }
    } else {
      /**
       * 根据最后访问时间的毫秒数来建立对象
       * 注意：此处同一ms的数据只保存其中一条，其它数据数据直接修剪掉
       */
      const tmpObj = {}
      for (let i = 0; i < result.length; i++) {
        const item = result[i]
        if (tmpObj[item.last_accessed]) {
          trimData.push(item)
        } else {
          tmpObj[item.last_accessed] = item
        }
      }

      /* 由大到小对时间戳进行排序 */
      const sortResult = Object.keys(tmpObj).sort((a, b) => b - a)

      /* 只保留reservedCount条数据，之后的都修剪掉 */
      for (let j = 0; j < sortResult.length; j++) {
        const item = sortResult[j]
        if (j + 1 > reservedCount) {
          trimData.push(tmpObj[item])
        }
      }
    }

    // console.log('要修剪的数据：', trimData)
    t.deleteByUrls(trimData.map(item => item.url))

    return trimData
  }
}

/* 性能测试 */
function performanceTests () {
  const cache = new WebsiteCache()
  function serachTest () {
    const dataArr = []
    console.time('serach')
    for (var i = 0; i < 100; i++) {
      const item = 'stuff_number' + i
      dataArr.push(item)
      console.log(cache.select(cache.fingerprint(item), 'url_hash'))
    }
    // cache.selectByUrls(dataArr)
    console.timeEnd('serach')
  }
  // serachTest()

  function insterTest () {
    const dataArr = []
    const testNum = 1000 * 1
    for (var i = 0; i < testNum; i++) {
      dataArr.push({
        host: 1,
        path: i,
        response_header: 'stuff_number' + i + ':' + Date.now(),
        url: 'stuff_number' + i,
        response_data_hash: i,
        path_hash: i,
        last_accessed: i
      })
    }

    console.time('insert')
    cache.insert(dataArr)
    // cache.insertOnly(dataArr)
    console.timeEnd('insert')
  }
  // insterTest()
}
// performanceTests()

module.exports = WebsiteCache
