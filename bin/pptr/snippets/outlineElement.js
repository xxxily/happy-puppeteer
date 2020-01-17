/**
 * 鼠标经过时高亮该元素的边框
 * @param page
 * @returns {Promise<void>}
 */

module.exports = async function outlineElement (page) {
  await page.evaluate(async () => {
    document.body.addEventListener('mouseover', event => {
      const target = event.target
      // target.style.outline = '3px dashed #1976d2 !important'
      target.style.outlineWidth = '3px'
      target.style.outlineColor = '#1976d2'
      target.style.outlineStyle = 'dashed'

      function mouseout () {
        target.style.outlineWidth = ''
        target.style.outlineColor = ''
        target.style.outlineStyle = ''
        target.removeEventListener('mouseout', mouseout)
      }
      target.addEventListener('mouseout', mouseout)
      // console.log(target.style.outline)
    })
  }).catch(() => {})
}
