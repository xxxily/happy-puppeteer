/*!
 * @name      Pipeline.js
 * @version   0.0.1
 * @author    Blaze
 * @date      2019/12/13 22:27
 * @github    https://github.com/xxxily
 */

/**
 * 流水线化处理某些数据
 *
 * 主要应用场景：
 * 某些事件产生了需要处理的数据，希望按照产生的先后顺序来输出
 * 如果处理函数全部是同步操作，则无需使用流水线化处理，直接调用就是正确顺序
 * 但如果处理函数可能是同步也可能是异步的时候，直接在事件回调里面处理，最后会导致处理的数据结果会先后混乱
 * 为了保证不管是同步还是异步，都能按事件的触发的先后顺序来输出处理结果，则需对事件产生的数据进行流水线管理
 *
 * 实现思路：
 * 将事件产生的数据先通过压入数组的形式存储起来，处理函数对这些数据进行逐个提取出来，全部按异步方式进行处理
 * 等异步执行完成了再处理下一个压入的数据，如此循环往复，实现流水线形式处理数据，确保顺序的正确性
 */

class Pipeline {
  /**
   * @param handler {Function} -必选 对数据物料进行处理的函数
   * @param onerror {Function} -可选 handler出错的回调函数，默认出错了直接在控制台打错误信息，并不影响后续handler的执行
   */
  constructor (handler, onerror) {
    if (!(handler instanceof Function)) {
      console.error('handler must be a function')
      return false
    }
    this.dataQueue = []
    this.handler = handler
    this.onerror = onerror || async function () {}
    this.isWorking = false
  }

  /**
   * 按队列的方式进行数据物料处理，直到所有数据物料被处理完成
   * @returns {Promise<boolean>}
   * @private
   */
  async _handler () {
    const t = this
    if (t.isWorking) return true

    /* 标识正在进行流水线作业 */
    t.isWorking = true

    async function handle () {
      /* 根据当前的数据物料长度，通过t.handler进行一个接着一个的队列 */
      const len = t.dataQueue.length
      for (let i = 0; i < len; i++) {
        await t.handler(t.dataQueue.shift()).catch(async err => {
          if (t.onerror instanceof Function) {
            await t.onerror(err).catch(err => console.error(err))
          } else {
            console.error(err)
          }
        })
      }

      /**
       * handle完成后，检查有没有新的数据物料被添加到队列，如果有则继续handle
       * 如果持续有数据物料进来，则一直工作，直到把数据物料处理完才会停止工作
       */
      if (t.dataQueue.length) {
        await handle().catch(err => console.error(err))
      }
    }

    await handle().catch(err => console.error(err))

    /* 本次流水线作业完成（现有的数据物料处理完成） */
    t.isWorking = false
  }

  /**
   * 将数据推送给handler，由handler进行队列处理
   * @param data
   */
  pushToHandler (data) {
    this.dataQueue.push(data)
    this._handler()
  }
}
module.exports = Pipeline
