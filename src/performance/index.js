const puppeteer = require('puppeteer')
const fs = require('fs-extra');
const path = require('path');
const Analyzer = require('../analyzer')
const analyzer = new Analyzer()

module.exports = class Performance {
  constructor (opts) {
    this.opts = opts
    this.times = 0
    this.log = {}
  }
  
  async run (opts = this.opts) {
    let startTimestamp = Date.now()
    let loadsize = 0;
    let {
      executablePath,
      url,
      count = 1,
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
      // headless: false,
      // args: ['--unlimited-storage', '--full-memory-crash-report']
      args: ['--no-sandbox']
    }
    let requestTimeList = []

    if (executablePath) {
      launchOpts.executablePath = executablePath
    }

    const browser = await puppeteer.launch(launchOpts)
    let tab = await browser.newPage()
    const client = await tab.target().createCDPSession();
    // const clientPms = await client.send('window.performance');
    // console.log('back:', clientPms)
    // await client.send('Performance.enable')
    // const response = await client.send('Performance.getMetrics');
    // console.log('CDPSession' + JSON.stringify(response, null, 2));
    let str = ''
    let loadCount = 0
    await client.send('Network.enable');
    client.on('Network.loadingFinished', (e) => {
      loadsize += e.encodedDataLength
      loadCount += 1
    })
    let requestObject = {}
    let requests = {
      list: [],
      count: {
        firstScreen: 0,
        error: 0,
        success: 0,
        full: 0
      },
      size: {
        full: 0
      }
    }
    
    let settingTasks = [
      tab.setCacheEnabled(cache),
      tab.setJavaScriptEnabled(javascript),
      tab.setOfflineMode(!online),
      tab.setRequestInterception(false)
    ]

    // 请求发起事件回调
    function logRequest(interceptedRequest) {
      requestTimeList.push(Date.parse(new Date()))
      requests.count.full = requests.count.full + 1
    }
    // 请求发起事件回调
    function logEndRequest(interceptedRequest) {
      requestObject[interceptedRequest.url()] = {
        url: interceptedRequest.url(), // 请求url
        headers: interceptedRequest.headers(), //请求头
        method: interceptedRequest.method(), // 请求方式
        data: interceptedRequest.postData(), // 请求参数
        resourceType: interceptedRequest.resourceType(), // 请求资源类型
        startTime: Date.parse(new Date()) // 请求发起时间
      }
    }
    // 请求失败事件回调
    function logFailRequest(interceptedRequest) {
      requests.count.error = requests.count.error + 1
    }
    // 请求响应事件回调
    async function logSuccessRequest(interceptedRequest) {
      // response.text().then((res) => {
      //   requestObject[interceptedRequest.url()].response = {
      //     headers: JSON.stringify(response.headers()), // 响应头
      //     ok: response.ok(), // 请求是否成功
      //     statusText: response.statusText(), // http状态码
      //     // json: res
      //   }
      //   requestObject[interceptedRequest.url()].endTime = Date.parse(new Date()) //请求返回时间
      // })
      // requests.count.success = requests.count.success + 1
    }
    function getAutoComputeFirstScreenTime () {
      const autoComputeFirstScreenTime = require('auto-compute-first-screen-time')
      return autoComputeFirstScreenTime
    }
    tab.on('request', logRequest)
    // tab.on('requestfinished', logEndRequest)
    tab.on('requestfailed', logFailRequest)
    tab.on('requestfinished', logSuccessRequest)
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
    
    // 页面onload回调
    let loadHandler = async () => {
      // 载入首屏统计脚本
      await tab.evaluate(async() => {
        const content = await window.readfile('/util/acfst.js');
        eval(content)
      })
      this.times = this.times + 1
      
      const result = await tab.evaluate(async() => {
        const loadPromise = new Promise((resolve, reject) => {
          let pageData = window.performance
          let entries = pageData.getEntries()
          // 获取首屏时间
          window.autoComputeFirstScreenTime({
            onReport: function (result) {
              if (result.success) {
                let firstScreenTime = result.firstScreenTime
                let firstScreenTimestamp = Date.parse(new Date())
                let data = JSON.stringify({ pageData, entries, firstScreenTime, firstScreenTimestamp })
                resolve(data);
              } else {
                console.log(result);
              }
            }
          });
        }).then(result => result).catch(e => e);
        return loadPromise
      })

      for(var i in requestObject){
        requests.list.push(requestObject[i]);
      }

      let resultObj = JSON.parse(result)
      

      let timeList = requestTimeList.filter(item => item < resultObj.firstScreenTimestamp)

      // console.log(resultObj.firstScreenTimestamp)

      // console.log('requestTimeList: ' + requestTimeList);
      // console.log('timeList: ' + timeList);

      requests.count.firstScreen = timeList.length
      requests.size.full = loadsize / 1024
      this.log = {
        page: analyzer.statistics(result).pageData,
        requests
      }
      if (this.times < count) {
        await Promise.all(settingTasks)
        tab.once('load', loadHandler)
        await tab.goto(url, { timeout: 5000, waitUntil: 'load' })
      } else {
        setTimeout(() => browser.close())
        console.log(JSON.stringify(this.log))
      }
    }
    tab.once('load', loadHandler)

    await tab.exposeFunction('readfile', async filePath => {
      return new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, '..', filePath), 'utf8', (err, text) => {
          if (err) {
            reject(err);
          } else {
            resolve(text);
          }
        });
      });
    });
    await tab.goto(url, { timeout: 5000, waitUntil: 'load' })
    global.__hiper__.runInterval = Date.now() - startTimestamp
    // console.log(`跑完 ${global.__hiper__.url} 全部性能测试用时：${(Date.now() - startTimestamp) / 1000}s`)
    // console.log(`\n---------------------- 🚀 各项指标平均耗时（${global.__hiper__.count}次）----------------------\n`)
    // return performances
  }
}
