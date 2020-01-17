/**
 * 从缓存中移除module
 * 源码出自： https://www.jianshu.com/p/efb8b3f37977
 * 另外可参考 clear-module
 * https://github.com/sindresorhus/clear-module
 */

/**
 * 遍历缓存来查找通过特定模块名缓存下的模块
 */
function searchCache (moduleName, callback) {
  //  通过指定的名字resolve模块
  let mod = require.resolve(moduleName)
  // 通过modSet记录已找到的模块，防止循环引用导致无限递归
  let modSet = {}

  // 检查该模块在缓存中是否被resolved并且被发现
  if (mod && ((mod = require.cache[mod]) !== undefined)) {
    // 递归的检查结果
    (function traverse (mod, deep) {
      /* 防止递归过深导致内存溢出 */
      deep = deep || 0
      if (deep && deep > 20) return false

      /* 检查该模块的子模块并遍历它们 */
      mod.children.forEach(function (child) {
        /* 排除node_modules和已经找出来的模块 */
        if (!/\S+node_modules\S+/.test(child.path) && !modSet[child.id]) {
          modSet[child.id] = true
          traverse(child, deep + 1)
        }
      })

      // 调用指定的callback方法，并将缓存的module当做参数传入
      callback(mod)
    }(mod))
  }

  /* 主动释放内存 */
  modSet = null
}

function purgeCache (moduleName) {
  // 遍历缓存来找到通过指定模块名载入的文件
  searchCache(moduleName, function (mod) {
    delete require.cache[mod.id]
  })

  // 删除模块缓存的路径
  // 多谢@bentael指出这点
  Object.keys(module.constructor._pathCache).forEach(function (cacheKey) {
    if (cacheKey.indexOf(moduleName) > 0) {
      console.log('cacheKey', cacheKey)
      delete module.constructor._pathCache[cacheKey]
    }
  })
}

module.exports = purgeCache
