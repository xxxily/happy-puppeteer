const path = require('path')
const sqlite3 = require('better-sqlite3')
const utils = require('../utils/index')
const SQL = require('./sqlFragment')

const appConf = require('../../config/app.conf')
const dbPath = path.join(appConf.cacheDir, 'cache.db')
const crypto = require('crypto')
const fingerprint = text => crypto.createHash(appConf.cryptoType || 'sha256').update(String(text)).digest('hex')

/* 移除旧数据 */
// const fs = require('fs-extra')
// fs.removeSync(dbPath)

const db = sqlite3(dbPath, {})

/* 如果数据表不存在则自动创建 */
db.prepare(SQL.createTable).run()
/* 如果索引不存在则自动创建 */
const needIndexColumn = [
  'url_hash',
  'path_hash',
  'response_data_hash',
  'url',
  'host',
  'path',
  'last_accessed'
]

/* 将需要进行索引的列进行索引 */
needIndexColumn.forEach(columnName => db.prepare(SQL.createIndexCode(columnName)).run())

const insertStmt = db.prepare(SQL.inster)
const updateStmt = db.prepare(SQL.update)
const deleteStmt = db.prepare(SQL.delete)

const cache = {
  tmpCache: [],
  /* 共享创建指纹使用的函数，以便在其它地方也可以保持一致 */
  fingerprint,
  /* 检查要插入的信息的格式或字段是否完被，并自动补充某些字段的信息 */
  checkInsertData: function (data, oldData) {
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
      update_count: 0
    }

    /**
     * 此处利用merge进行数据合并的原因
     * 1、当数据不存在的时候，可以提供默认参数
     * 2、保证对象的顺序，确保插入的时候参数顺序正确
     */
    const newData = utils.merge(defData, data)

    if (!newData.url_hash) {
      newData.url_hash = fingerprint(newData.url)
    }

    return newData
  },

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
  select: function (searchStr, columnName, limit, offset, transaction) {
    /* 允许进行查找的列表，必须是有索引的列才能进行查找，否则会非常慢 */
    const allowSelectColumns = needIndexColumn
    if (!searchStr || !allowSelectColumns.includes(columnName)) return []
    limit = limit || 1000
    offset = offset || 0

    /* 如果不存在解释好的SQL预编译脚本则先进行编译 */
    const stmtKey = `select_${columnName}_${limit}_${offset}_stmt`
    if (!cache[stmtKey]) {
      cache[stmtKey] = db.prepare(SQL.createSelectCode(columnName, limit, offset))
    }
    const selectStmt = cache[stmtKey]

    /* 创建事务进行查找 */
    if (transaction || Array.isArray(searchStr)) {
      const result = []
      db.transaction((data) => {
        for (let i = 0; i < data.length; i++) {
          result.concat(selectStmt.all(data[i]))
        }
      })(searchStr)
      return result
    } else {
      return selectStmt.all(searchStr)
    }
  },

  /**
   * 根据单个url链接提取对应信息
   * 注意：因为引入了临时缓存概念，有部分数据可能存在缓存却未存在数据库里
   * @param url
   * @returns {null|*}
   */
  selectByUrl: url => cache.select(fingerprint(url), 'url_hash')[0],

  /* 根据多个url链接批量提取对应信息 */
  selectByUrls: function (urls) {
    const result = []
    if (!urls) return result

    urls = typeof urls === 'string' ? [urls] : urls

    db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        const item = data[i]
        result.push(cache.selectByUrl(item))
      }
    })(urls)

    return result
  },

  /**
   * 根据单个url链接信息再缓存数据里操作是否存在对应数据
   * @param url
   * @returns {null|Object}
   */
  selectByUrlInCache: url => {
    let result = null
    const urlHash = fingerprint(url)
    if (cache.tmpCache.length) {
      for (let i = 0; i < cache.tmpCache.length; i++) {
        const item = cache.tmpCache[i]
        if (item.url_hash === urlHash) {
          result = item
          break
        }
      }
    }

    return result
  },

  /**
   * 将数据插入到数据库记录起来，如果数据库里存在对应数据，则是更新该数据
   * @param data {Object|Array} -必选 要插入或更新的数据，支持单条或多条数据
   * @returns {boolean}
   */
  insert: function (data) {
    if (!utils.isObj(data) && !Array.isArray(data)) {
      console.error('数据格式错误')
      return false
    }

    data = Array.isArray(data) ? data : [data]

    /* 通过事务批量处理要插入或更新的数据 */
    db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        let item = data[i]
        if (utils.isObj(item)) {
          const oldData = cache.selectByUrl(item.url)
          item = cache.checkInsertData(item, oldData)
          if (oldData) {
            // console.log('数据已存在，执行更新操作', i)

            /* 更新次数+1 */
            item.update_count = Number(oldData.update_count) + 1

            const arg = Object.values(item)

            /* 补充最后一个查询限定条件 */
            arg.push(fingerprint(item.url))

            updateStmt.run.apply(updateStmt, arg)
          } else {
            // console.log('数据不存在，执行插入操作', i)
            insertStmt.run.apply(insertStmt, Object.values(item))
          }
        } else {
          console.error('数据格式不正确：', item)
        }
      }
    })(data)
  },

  /**
   * 延迟写入数据，使用内存进行数据临时缓存，达到一定数据量或一定时间后再批量写入数据
   * 这样能有效减少对数据库频繁操作导致的程序高负荷工作，但同时也有导致数据丢失的风险
   * @param data {Object|Array} -必选 要插入或更新的数据，支持单条或多条数据
   * @param writNow {Boolean} -可选 不再等待，直接将当前数据与缓存数据一并写入
   */
  delayInsert: function (data, writNow) {
    data = utils.argToArr(data)
    cache.tmpCache = cache.tmpCache.concat(data)
    if (cache.tmpCache.length === 0) return true

    clearTimeout(cache._insterTimer_)
    if (writNow || cache.tmpCache.length > 100) {
      console.log('save tmpCache to database:', cache.tmpCache.length)
      cache.insert(cache.tmpCache)
      cache.tmpCache = []
    } else {
      cache._insterTimer_ = setTimeout(() => {
        cache.delayInsert([], true)
      }, 1000 * 3)
    }
  },

  /**
   * 将数据插入到数据库记录起来，纯插入操作，不会检查是否已存在相关数据
   * @param data {Object|Array} -必选 要插入或更新的数据
   * @returns {boolean}
   */
  insertOnly: function (data) {
    if (!utils.isObj(data) && !Array.isArray(data)) {
      console.error('数据格式错误')
      return false
    }

    data = Array.isArray(data) ? data : [data]

    /* 通过事务批量处理要插入或更新的数据 */
    db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        let item = data[i]
        if (utils.isObj(item)) {
          item = cache.checkInsertData(item)
          insertStmt.run.apply(insertStmt, Object.values(item))
        } else {
          console.error('数据格式不正确：', item)
        }
      }
    })(data)
  },

  /* 根据url删除对应信息 */
  deleteByUrl: url => deleteStmt.run(fingerprint(url)),

  /* 根据多条url链接批量删除对应信息 */
  deleteByUrls: function (urls) {
    const result = []
    if (!urls) return result

    urls = typeof urls === 'string' ? [urls] : urls

    db.transaction((data) => {
      for (let i = 0; i < data.length; i++) {
        const item = data[i]
        result.push(cache.deleteByUrl(item))
      }
    })(urls)

    return result
  },

  /**
   * 修剪某个结果集，可用于移除冗余数据
   * @param result {Array} -必选 某个结果集
   * @param reservedCount {Number} -可选 定义保留的数据条数，默认10条
   * @param trimRule {Function} -可选 自定义修剪规则，在函数里面判断是否要修剪掉，如果需要则返回true，默认根据最近访问时间顺序来修剪
   */
  trimResult (result, reservedCount, trimRule) {
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
    cache.deleteByUrls(trimData.map(item => item.url))

    return trimData
  }
}

/* 程序正常退出时，写入缓存数据，以防数据丢失 */
process.on('exit', () => cache.delayInsert([], true))

module.exports = cache

/* 性能测试 */
function performanceTests () {
  function serachTest () {
    const dataArr = []
    console.time('serach')
    for (var i = 0; i < 100; i++) {
      const item = 'stuff_number' + i
      dataArr.push(item)
      console.log(cache.select(fingerprint(item), 'url_hash'))
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

  // console.time('insert11111')
  // const startTime = Date.now`()
  // for (let i = 0; i < 1000; i++) {
  //   insterTest()
  //   console.log('已写入：' + ((100000 * (i + 1)) / 1000000) + '百万数据')
  //   console.log('已耗时：' + utils.millisecondToDate(Date.now() - startTime, true))
  // }
  // console.time('insert11111')`
}
// performanceTests()
