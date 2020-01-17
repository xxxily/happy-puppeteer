const Module = require('module')
const isBuiltinModule = require('is-builtin-module')
const chokidar = require('chokidar')
const isObj = obj => Object.prototype.toString.call(obj) === '[object Object]'

function createDebugMethod (defMsg) {
  function consoleWraper (name) {
    return function () {
      /* 根据debug选项绝对要不要进行内容输出 */
      if (hotModule && !hotModule.opts.debugMode) return true

      const arg = Array.from(arguments)
      defMsg && arg.unshift(defMsg)
      console[name].apply(console, arg)
    }
  }

  const debug = {}
  const tmpArr = ['log', 'error', 'info', 'table', 'warn']
  tmpArr.forEach(name => {
    debug[name] = consoleWraper(name)
  })

  return debug
}
const debug = createDebugMethod('[hotModule]')

const watcher = chokidar.watch(__filename)
watcher.on('change', function (filePath) {
  debug.log('文件被修改：', filePath)
  hotModule.updateModule(filePath)
})

const hotModule = {
  /* 可自定义的选项 */
  opts: {
    /**
     * 忽略无需加入热更新集合的模块
     * 支持 正则、函数、完整的路径地址，并且支持配置成数组，变成整组忽略规则
     */
    ignore: /\S+node_modules\S+/,
    /**
     * 递归查找的最大深度
     */
    traverseDeep: 20,
    /**
     * 禁止Watch相关功能，但不影响其它功能的初始化
     */
    disableWatch: false,
    debugMode: true
  },

  watcher,

  /* 热模块集合 */
  hotModuleSet: {},

  parentModuleSet: {},

  /**
   * 判断是否需要忽略加入热模块集合的方法
   * @param path {String} -必选 模块路径
   * @returns {boolean|*} 返回 true or false
   */
  isNeedIgnore: function (path) {
    /* 忽略原生模块 */
    if (!path || isBuiltinModule(path)) return true

    let ignoreRules = hotModule.opts.ignore
    ignoreRules = Array.isArray(ignoreRules) ? ignoreRules : [ignoreRules]

    /* 遍历ignore规则列表，只要其中一条规则命中则即刻返回 */
    let needIgnore = false
    for (let i = 0; i < ignoreRules.length; i++) {
      const rule = ignoreRules[i]
      if (rule instanceof RegExp && rule.test(path)) {
        /* 如果规则是正则表达式，则必须匹配通过才忽略 */
        needIgnore = true
        break
      } else if (rule instanceof Function && rule(path) === true) {
        /* 如果规则是函数，则必须返回true才是需要忽略的 */
        needIgnore = true
        break
      } else if (typeof rule === 'string' && rule === path) {
        /* 如果规则是字符串，则必须跟路径全等才忽略 */
        needIgnore = true
        break
      }
    }

    return needIgnore
  },

  addHotHooks: function (module) {
    if (!module || module.hot) return true

    /* 注入热更新管理对象 */
    const t = hotModule
    const resolve = name => Module._resolveFilename(name, module)
    const hot = {
      watcher,
      purgeCache: t.purgeCache,
      searchChildrenModule: t.searchChildrenModule,
      reloadHandlers: [],
      /**
       * 用于标识当前模块是否为需要触发重载的父模块
       * 默认为false，当在模块里直接标注为 module.hot.trigger=true时
       * 子模块被修改后会进行递归，递归到trigger=true的父模块则停止递归
       * 并对基于该父模块下的所有模块内容进行热替换
       * 如果整条调用链都没有trigger=true标识，
       * 则只对被修改的模块以及其附属的子模块进行热替换
       */
      trigger: false,
      /**
       * 当有模块内容被修改，触发了重载机制时，会先调用该函数
       * 如果回调函数返回了true，则会终止默认的重载操作，例如通过判断修改的是某个模块
       * 从而局部更新某些数据即可，而无需完全重载整个调用链
       * @param callback {Function} -必选 触发reload时的回调
       * 调用回调函数的时候会传入被修改的模块地址
       */
      onReload: function (callback) {
        if (callback instanceof Function && !hot.reloadHandlers.includes(callback)) {
          console.log('添加回调', module.filename)
          // hot.reloadHandlers = []
          hot.reloadHandlers.push(callback)
        }
      },
      /**
       * 配置模块在变更的时候自动清空缓存并重新加载模块和运行onChange回调
       * 注意：调用该函数的会先加载一遍模块和执行回调，之后才是根据内容变更重新执行
       * @param conf {Object} -必选 运行配置
       * @param conf.modulePath {String} -必选 模块路径，参考getModulePath
       * @param conf.onChange {Function} -必选 变更时的回调操作，回把重载到的模块内容，和模块逻辑传入该回调
       * @param conf.id {String} -可选 注册id，用于区分是否来自同一处地方注册，减少回调的重复调用次数
       * 之所以要用id来区分，是因为回调函数指针再不断重载过程中会并不一致，所以不能通过函数指针来区分是否来自同一个调用者
       * @param conf.autoRequire {boolean} 初始化的时候，自动加载模块并执行一次onChange回调，默认false
       * @returns {boolean}
       */
      runOnChange: function (conf) {
        if (!conf.modulePath || !(conf.onChange instanceof Function)) {
          console.error('运行参数不正确，函数无法正常运行', conf)
          return false
        }

        const hotModuleSet = t.hotModuleSet
        const modulePath = resolve(conf.modulePath)

        /* 热更新重载的时候会不断压入新函数，提供id的时候会把id相同的函数移除，减少onChange时候回调函数的个数 */
        if (hotModuleSet[modulePath] && conf.id) {
          const onChangeFnArr = hotModuleSet[modulePath].onChange
          const duplicate = onChangeFnArr.filter(item => item.id === conf.id)
          if (duplicate.length) {
            // console.log('函数已注册', duplicate.length)
            conf.autoRequire && conf.onChange(require(modulePath), modulePath)
            return true
          }
        }

        /* 首次运行 */
        conf.autoRequire && conf.onChange(require(modulePath))

        if (!hotModuleSet[modulePath]) {
          hotModuleSet[modulePath] = { onChange: [] }
        }

        /* 压入回调函数 */
        hotModuleSet[modulePath].onChange.push(conf.onChange)
      },
      getParents: function (filename) {
        if (filename) {
          return t.parentModuleSet[filename] || t.parentModuleSet
        } else {
          return t.parentModuleSet[module.filename || module.id]
        }
      }
    }
    module.hot = hot
  },

  addToWatch: function (module) {
    if (!module) return false

    /* 排成需要忽略的路径 */
    const t = hotModule
    const hotModuleSet = t.hotModuleSet

    /* 如果传入的并不是模块对象，而是模块路径，则尝试在缓存寻找模块，找到了则继续 */
    if (typeof module === 'string') {
      module = require.cache[module]
      if (!module) return false
    }

    const modulePath = module.filename

    /* 已加入到热模块集合或是需要忽略的模块，直接return掉 */
    const hasWatch = hotModuleSet[modulePath] && hotModuleSet[modulePath].module === module
    if (hasWatch || t.isNeedIgnore(modulePath) || modulePath === __filename) return false

    /* 加入到监控队列 */
    if (!hotModuleSet[modulePath] && t.opts.disableWatch === false) {
      hotModuleSet[modulePath] = {
        onChange: [],
        module
      }
      debug.log('add to watch:', modulePath)
      watcher.add(modulePath)
    }

    t.addHotHooks(module)
    hotModuleSet[modulePath].module = module
  },

  /**
   * 将当前加载的模块关联的父模快都收集起来，放在Module._load里收集可以实现在模块还没创建前收集到相关父依赖
   * 通过收集到ParentModuleSet数据，可以分析出某个模块被哪些模块引用过
   * 注意：因为收集过程只有添加，没有删除与更新，所以依赖被动态修改后，其对应的父模快可能是错误的
   * 但可以确定曾经是被该父模块引用过的
   * @param modu
   * lePath
   * @param parent
   * @returns {boolean}
   */
  collectToParentModuleSet (modulePath, parent) {
    const t = hotModule
    if (!parent || t.isNeedIgnore(modulePath) || modulePath === __filename) return false

    const parentModuleSet = t.parentModuleSet[modulePath] || {}
    if (parent && (parent.filename || parent.id)) {
      // parentModuleSet[parent.filename || parent.id] = parent
      parentModuleSet[parent.filename || parent.id] = true
    }
    t.parentModuleSet[modulePath] = parentModuleSet
  },

  /**
   * 根据路径或模块对象，查找其对应的子模块路径
   * 支持通过模块路径直接查找，也支持指定模块对象查找
   * @param modulePath {path|Object} -必选 可以是模块路径也可以是模块对象
   * @returns {string[]} 返回子模块对应的全部路径信息
   */
  searchChildrenModule (modulePath) {
    let mod = null

    if (isObj(modulePath)) {
      mod = modulePath
    } else if (typeof modulePath === 'string') {
      modulePath = require.resolve(modulePath)
      mod = require.cache[modulePath]
    }

    // 通过modSet记录已找到的模块，防止循环引用导致无限递归
    const modSet = {}
    // 检查该模块在缓存中是否被resolved并且被发现
    if (mod) {
      // 递归的检查结果
      (function traverse (mod, deep) {
        /* 防止递归过深导致内存溢出 */
        deep = deep || 0
        if (deep && deep > 20) return false

        /* 检查该模块的子模块并遍历它们 */
        mod.children.forEach(function (child) {
          /* 排除node_modules目录下的模块和已经找出来的模块 */
          if (!/\S+node_modules\S+/.test(child.path) && !modSet[child.id]) {
            const modPath = child.filename || child.id
            modSet[modPath] = true
            traverse(child, deep + 1)
          }
        })
      }(mod))
    }

    return Object.keys(modSet)
  },

  /**
   * 清除模块缓存
   * @param modulePath {path|Object} -必选 可以是模块路径也可以是模块对象
   * @returns {boolean}
   */
  purgeCache (modulePath) {
    const childrenMods = hotModule.searchChildrenModule(modulePath)

    /* 提取模块对象转的路径，或尝试将传入的路径解析成绝对路径 */
    modulePath = isObj(modulePath) ? (modulePath.filePath || modulePath.id) : require.resolve(modulePath)
    if (modulePath === __filename) return true

    /* 批量移除子模块缓存 */
    childrenMods.forEach(modPath => {
      if (modPath !== __filename) {
        delete require.cache[modPath]
      }
    })

    /* 删除模块缓存的路径信息 */
    const pathCache = module.constructor._pathCache
    const pathKeys = Object.keys(pathCache)
    const delPathCache = function (pathKey, modulePath, index) {
      if (pathKey === modulePath && modulePath !== __filename) {
        delete pathCache[pathKeys[index]]
      }
    }

    Object.values(pathCache).forEach(function (pathKey, index) {
      delPathCache(pathKey, modulePath, index)
      childrenMods.forEach(modPath => {
        delPathCache(pathKey, modPath, index)
      })
    })

    pathKeys.forEach(function (cacheKey) {
      if (cacheKey.indexOf(modulePath) > 0) {
        delete pathCache[cacheKey]
      }
    })
  },

  execReloadHandlers (mod, triggerSource) {
    let needCancelReload = false

    if (mod && mod.hot && mod.hot.reloadHandlers) {
      for (let i = 0; i < mod.hot.reloadHandlers.length; i++) {
        const callback = mod.hot.reloadHandlers[i]
        if (callback instanceof Function) {
          try {
            const execResult = callback(triggerSource)
            if (execResult === true) {
              needCancelReload = true
            }
          } catch (err) {
            debug.error('执行reloadHandlers函数时出错：', err)
          }
        }
      }
    }

    return needCancelReload
  },

  updateModule (filePath) {
    const t = hotModule
    const oldModule = require.cache[filePath]
    if (!oldModule) { debug.log('未找到模块缓存，无法执行更新操作') }
    if (!oldModule || filePath === __filename) return false
    const newModule = new Module(filePath, oldModule.parent)

    let needReloadMod = newModule
    let hasParentTrigger = false
    if (oldModule.parent) {
      /* 递归找到需要重载的父节点模块 */
      (function traverse (parentMod, deep) {
        /* 防止递归过深导致内存溢出 */
        deep = deep || 0
        if (deep && deep > t.opts.traverseDeep) return false

        if (parentMod.hot && parentMod.hot.trigger === true) {
          /* 找到需要重载的父模块 */
          needReloadMod = parentMod
          hasParentTrigger = true
        } else {
          /* 继续向上递归查找需要重载的模块 */
          if (parentMod.parent && parentMod.parent.hot) {
            traverse(parentMod.parent, deep++)
          }
        }
      }(oldModule.parent))
    }

    require.cache[filePath] = newModule

    /* 重载所有已加载了当前模块的父模块节点 */
    const reloaded = {}
    // const parents = t.parentModuleSet[filePath] || {}
    // Object.keys(parents).forEach(async modulePath => {
    //   reloaded[modulePath] = true
    //   const oldModule = require.cache[modulePath]
    //   const newModule = new Module(modulePath, oldModule.parent)
    //
    //   const needCancelReload = t.execReloadHandlers(oldModule, filePath)
    //   if (!needCancelReload) {
    //     try {
    //       newModule.load(modulePath)
    //     } catch (err) {
    //       console.error('父模块重载失败：', err)
    //     }
    //   }
    // })

    const hot = hasParentTrigger ? needReloadMod.hot : oldModule.hot
    const needReloadFilePath = needReloadMod.filename || needReloadMod.id

    if (reloaded[needReloadFilePath]) return true

    /* 重载模块 */
    try {
      /* 如果要重载的是父级模块，则必须清空其所有子级缓存，否则只能重载到父模块本身 */
      if (hot && hot.purgeCache === true) {

      }

      if (hasParentTrigger || (hot && hot.trigger)) {
        t.purgeCache(needReloadFilePath)
      } else if (!hasParentTrigger && oldModule.hot && oldModule.hot.trigger === true) {
        /**
         * 这里必须把旧模块的对象传给purgeCache
         * 原因是使用new Module生成的模块，在还没加载的情况下，其父子模块皆为空
         * 所以肯定无法正确查找调用链信息，必须代入旧模块对象信息才能正常清除缓存
         */
        t.purgeCache(oldModule)
      }

      /* 执行自定义的onReload回调函数 */
      const needCancelReload = t.execReloadHandlers(needReloadMod, filePath)
      if (needCancelReload === true) return true

      /**
       * 重载前，必须将loaded置为false，否则当遇到以加载的模块时会出现断言错误
       * https://github.com/nodejs/node/blob/398790149d18a26dd4b9ec263214345467d7439e/lib/internal/modules/cjs/loader.js#L1036
       */
      needReloadMod.loaded = false
      needReloadMod.load(needReloadFilePath)
      debug.log('模块已更新：', needReloadFilePath)
    } catch (err) {
      console.error('模块热更新失败：', err)
    }

    /* 执行onChange队列 */
    t.hotModuleSet[needReloadFilePath].onChange.forEach(callback => {
      if (callback instanceof Function) {
        callback(require.cache[needReloadFilePath].exports)
      }
    })
  }
}

/**
 * 在node中require方法是调用了Node中Module模块的私有方法_load实现的
 * 此处通过重写_load方法,实现动态监听任意模块的动态监听
 * https://github.com/nodejs/node/blob/master/lib/internal/modules/cjs/loader.js#L889
 */
const moduleRequire = Module._load
Module._load = function (request, parent, isMain) {
  const requirePath = Module._resolveFilename(request, parent)

  /* 收集当前要加载的模块所依赖的父模快集合 */
  hotModule.collectToParentModuleSet(requirePath, parent)

  /**
   * 使用原生的Module._load加载模块，加载过后或在Module._extensions内才会得到模块的缓存对象
   * 所以此处代码的先后顺序非常重要
   */
  const moduleContext = moduleRequire(request, parent, isMain)

  /* 加入侦听（侦听函数再区分到底要不要真的加入侦听队列，此处不做任何处理） */
  hotModule.addToWatch(require.cache[requirePath], requirePath)

  return moduleContext
}

/**
 * hooks模块的加载函数
 * 由于Module._load下的侦听时机靠后，即模块完全被运行了之后才会触发相关的hooks
 * 为了能正确读取模块对hot对象的自定义信息，必须在模块被解析却还未运行前植入hooks
 * 所以还需要此hooks进行辅助
 */
function hooksModuleExtensionsMethods () {
  const originalExtensions = Module._extensions
  const newExtensions = {}
  if (originalExtensions.__isHooks__) return true

  Object.keys(originalExtensions).forEach(extension => {
    newExtensions[extension] = function (module, filename) {
      /* 只针对js和json加hooks */
      if (extension === '.js' || extension === '.json') {
        hotModule.addToWatch(module)
      }
      return originalExtensions[extension](module, filename)
    }
  })
  newExtensions.__isHooks__ = true
  Module._extensions = newExtensions
}
hooksModuleExtensionsMethods()

/**
 * 如果当前模块被顶级模块加载时，只有子模块被注入了hoosk，
 * 而加载当前模块的父模块却不会存在hooks，所以需要为父模块单独注入hoosk
 */
if (module.parent && !module.parent.hot) {
  hotModule.addToWatch(module.parent)
}

module.exports = hotModule

/***
 * 重载的几种方式
 * 1、单独重载，哪个模块修改了就单独重载哪个模块
 * 2、完全重载，某个模块修改后，从其父模块开始，整条调用链都进行重载
 * 3、按需重载：
 * 某些子模块修改后，触发父模块的完全重载机制
 * 某些子模块修改后重新运行某个子函数，子模块的函数由依赖父模块进行调用
 */
