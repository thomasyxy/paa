const puppeteer = require('puppeteer')
const Analyzer = require('../analyzer')
const analyzer = new Analyzer()

module.exports = class Performance {
  constructor (opts) {
    this.opts = opts
    this.times = 0
    this.log = []
  }

  async run (opts = this.opts) {
    let startTimestamp = Date.now()
    let {
      executablePath,
      url,
      count,
      headless,
      useragent,
      viewport,
      cookies,
      cache,
      javascript,
      online
    } = opts

    let launchOpts = {
      headless,
      // args: ['--unlimited-storage', '--full-memory-crash-report']
      args: ['--no-sandbox']
    }

    if (executablePath) {
      launchOpts.executablePath = executablePath
    }

    const browser = await puppeteer.launch(launchOpts)
    let tab = await browser.newPage()
    let loadTasks = []
    let loadEvents = []
    let settingTasks = [
      tab.setCacheEnabled(cache),
      tab.setJavaScriptEnabled(javascript),
      tab.setOfflineMode(!online),
      tab.setRequestInterception(false)
    ]
    if (cookies) {
      settingTasks.push(tab.setCookie(...cookies))
    }
    if (viewport) {
      settingTasks.push(tab.setViewport(viewport))
    }
    if (useragent) {
      settingTasks.push(tab.setUserAgent(useragent))
    }
    await Promise.all(settingTasks)
    // for (let i = 0; i < count; i++) {
    //   loadTasks.push(
    //     tab.goto(url, { timeout: 5000, waitUntil: 'load' })
    //   )
    //   let loadHandler = () => {
    //     console.log(1);
    //     loadEvents.push(tab.evaluate(async statisticData => {
    //       let total = window.performance
    //       let entries = total.getEntries()
    //       let data = await analyzer.statistics(statisticData)
    //       console.log('data:', JSON.stringify({ total, entries }))
    //       outputer.output(data)
    //     }))
    //   }
    // }
    let loadHandler = async () => {
      this.times = this.times + 1
      const result = await tab.evaluate(() => {
        let total = window.performance
        let entries = total.getEntries()
        let data = JSON.stringify({ total, entries })
        return data
      })
      this.log.push(result)
      if (this.times < count) {
        tab.goto(url, { timeout: 5000, waitUntil: 'load' })
        tab.once('load', loadHandler)
      } else {
        setTimeout(() => browser.close())
        console.log(JSON.stringify(analyzer.statistics(this.log).total))
      }
    }
    tab.goto(url, { timeout: 5000, waitUntil: 'load' })
    tab.once('load', loadHandler)
    global.__hiper__.runInterval = Date.now() - startTimestamp
    // console.log(`跑完 ${global.__hiper__.url} 全部性能测试用时：${(Date.now() - startTimestamp) / 1000}s`)
    // console.log(`\n---------------------- 🚀 各项指标平均耗时（${global.__hiper__.count}次）----------------------\n`)
    // return performances
  }
}
