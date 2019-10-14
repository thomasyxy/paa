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
    let startTimestamp = Date.now() // 开始时间
    let loadsize = 0; // 加载资源大小
    // 获取传递参数
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

    // puppeteer默认配置项
    let launchOpts = {
      headless,
      // headless: false,
      // args: ['--unlimited-storage', '--full-memory-crash-report']
      args: ['--no-sandbox']
    }
    let requestTimeList = []

    let requestObject = {}
    // 请求结果初始参数
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

    if (executablePath) {
      launchOpts.executablePath = executablePath
    }

    // 启动浏览器进程
    const browser = await puppeteer.launch(launchOpts)

    // 打开tab
    const tab = await browser.newPage()

    // 建立CDP连接，开启网络请求相关功能
    const client = await tab.target().createCDPSession();
    await client.send('Network.enable');

    // 监听加载事件,统计资源大小
    client.on('Network.loadingFinished', (e) => {
      loadsize += e.encodedDataLength
    })
    
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
      
      // 页面内部执行脚本
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

      requests.count.firstScreen = requestTimeList.filter(item => item < JSON.parse(result).firstScreenTimestamp).length
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
        // 完成后关闭浏览器
        setTimeout(() => browser.close())
        // 输出最终结果
        console.log(JSON.stringify(this.log))
      }
    }
    tab.once('load', loadHandler)

    // 向网页顶层注入全局方法
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
    // 跳转页面
    await tab.goto(url, { timeout: 5000, waitUntil: 'load' })
    global.__hiper__.runInterval = Date.now() - startTimestamp
  }
}
