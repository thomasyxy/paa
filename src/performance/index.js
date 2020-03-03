const puppeteer = require('puppeteer')
const fs = require('fs-extra');
const path = require('path');
const Analyzer = require('../analyzer')
const analyzer = new Analyzer()
const FPS = require('./fps.js');
module.exports = class Performance {
  constructor (opts) {
    this.opts = opts // 入参透传
    this.times = 0
    this.log = {}
    this.loadReport = null // onload数据
    this.fristScreenReport = null // 首屏报告数据
    this.networkTimer = null // 网络定时器，500ms内没有请求发起认为可关闭页面
  }
  
  async run (opts = this.opts) {
    let startTimestamp = Date.now() // 开始时间
    let loadsize = 0; // 加载资源大小
    let firstScreenLoadsize = 0 // 首屏加载资源大小
    let DOMContentLoadedTime = 0 // DOMContentLoaded时间
    let firstFlag = true
    // 获取传递参数
    let {
      executablePath,
      url,
      count = 1,
      headless,
      useragent,
      viewport,
      cookies,
      localStorage,
      sessionStorage,
      cache,
      javascript,
      online,
      metrics,
      tracing,
      cdnOrigin,
      domainOrigin,
      jscssOrigin,
      imgOrigin,
      jscssLimit = 100,
      imgLimit = 50,
      base64Limit = 1
    } = opts

    let base64Reg = /base64/i
    let cdnReg = new RegExp(cdnOrigin);
    let domainReg = new RegExp(domainOrigin);
    let jscssReg = new RegExp(jscssOrigin, "i");
    let imgReg = new RegExp(imgOrigin, "i");

    // puppeteer默认配置项
    let launchOpts = {
      headless,
      // headless: false, // 用于本地调试，发布时必须注释掉，因为linux系统不支持
      // args: ['--unlimited-storage', '--full-memory-crash-report']
      args: ['--no-sandbox']
    }
    let requestTimeList = []

    let requestItemList = []
    
    let requestObject = {}
    // 页面请求结果初始参数
    let requests = {
      list: [],
      count: {
        firstScreen: 0,
        error: 0,
        success: 0,
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
    client.on('Network.loadingFinished', async (e) => {
      if (firstFlag) {
        pageInit()
        firstFlag = false
      }
      
      requestItemList.map(l => {
        if (l.requestId === e.requestId) {
          l.encodedDataLength = e.encodedDataLength
          l.timestampEnd = e.timestamp
          l.timestamp = l.timestampEnd - l.timestampStart + l.wallTime
        }
        return l;
      })
    })
    
    client.on('Network.requestWillBeSent', (e) => {
      // console.log(e)
      requestItemList.push({
        requestId: e.requestId,
        url: e.request.url,
        method: e.request.method,

        wallTime: e.wallTime,
        timestampStart: e.timestamp // 系统启动时间 MonotonicTime
      })
      // console.log(e.requestId, e.wallTime, e.timestamp, e.request.url)// , e.request.url, e.request.method)
    })
    client.on('Network.responseReceived', (e) => {
      requestItemList.map(l => {
        if (l.requestId === e.requestId) {
          l.timing = e.response.timing
          l.status = e.response.status
        }
        return l;
      })
    })
    let settingTasks = [
      tab.setCacheEnabled(cache),
      tab.setJavaScriptEnabled(javascript),
      tab.setOfflineMode(!online),
      tab.setRequestInterception(false)
    ]

    async function pageInit () {
      if (localStorage) {
        localStorage.map(async (ls) => {
          if (ls.name && ls.value) {
            await tab.evaluate((name, value) => { 
              window.localStorage.setItem(name, value)
            }, ls.name, JSON.stringify(ls.value))
          }
        })
      }
      if (sessionStorage) {
        sessionStorage.map(async (ss) => {
          if (ss.name && ss.value) {
            await tab.evaluate((name, value) => { 
              window.localStorage.setItem(name, value)
            }, ss.name, JSON.stringify(ss.value))
          }
        })
      }
      // 载入首屏统计脚本
      await tab.evaluate(async() => {
        const content = await window.readfile('/util/acfst.js');
        eval(content)
      })

      // 页面内部执行脚本
      this.fristScreenReport = await tab.evaluate(async() => {
        const fristScreenPromise = new Promise((resolve, reject) => {
          // 获取首屏时间
          window.autoComputeFirstScreenTime({
            onReport: function (result) {
              if (result.success) {
                resolve({
                  firstScreenTime: result.firstScreenTime,
                  firstScreenTimeStamp: (new Date()).valueOf()
                });
              }
            }
          });
        }).then(result => result).catch(e => e);
        return fristScreenPromise
      })
    }
    // 请求发起事件回调
    function logRequest(interceptedRequest) {
      requestTimeList.push((new Date()).valueOf())
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
        startTime: (new Date()).valueOf() // 请求发起时间
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
      //   requestObject[interceptedRequest.url()].endTime = (new Date()).valueOf() //请求返回时间
      // })
      requests.count.success = requests.count.success + 1
    }
    function getAutoComputeFirstScreenTime () {
      const autoComputeFirstScreenTime = require('auto-compute-first-screen-time')
      return autoComputeFirstScreenTime
    }
    function computedAssetSize () {
      // let jsCssRequestCount = 0;
      // let imgRequestCount = 0;
      let overSizeJSCSS = 0;
      let overSizeImg = 0;
      let overSizeBase64 = 0;
      let errorRequestCount = 0;
      let notCDNAssetCount = 0;

      requestItemList.map(item => {
        const url = item.url.split('?')[0]
        let overSize = 0
        console.log(url);
        
        if (jscssReg.test(url)) {
          // jsCssRequestCount += 1;
          overSize = item.encodedDataLength - (jscssLimit * 1024);
          (overSize > 0) && (overSizeJSCSS += overSize)
        } else if (imgReg.test(url)) {
          // imgRequestCount += 1;
          overSize = item.encodedDataLength - (imgLimit * 1024);
          (overSize > 0) && (overSizeImg += overSize);
        } else if (base64Reg.test(url)) {
          overSize = item.encodedDataLength - (base64Limit * 1024);
          (overSize > 0) && (overSizeBase64 += overSize);
        }
        if (jscssReg.test(url) || imgReg.test(url)) {
          (!cdnReg.test(url) && !domainReg.test(url)) && (notCDNAssetCount += 1);
        }
        if (item.status >= 400) {
          errorRequestCount += 1;
        }
        return item
      })
      return {
        // jsCssRequestCount,
        // imgRequestCount,
        overSizeJSCSS: (overSizeJSCSS / 1024).toFixed(2),
        overSizeImg: (overSizeImg / 1024).toFixed(2),
        overSizeBase64,
        notCDNAssetCount,
        errorRequestCount
      }
    }
    tab.on('request', logRequest)
    // tab.on('requestfinished', logEndRequest)
    tab.on('requestfailed', logFailRequest)
    tab.on('requestfinished', logSuccessRequest)
    // tab.on('console', msg => {
    //   for (let i = 0; i < msg.args().length; ++i)
    //     console.log(`${i}: ${msg.args()[i]}`); 
    // });
    FPS.setFpsRAF(tab) // 设置requestAnimationFrame 计算FPS

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

    const logResult = async () => {

      // console.log('fristScreenReport:' + this.fristScreenReport);
      // console.log('loadReport:' + this.loadReport);
      
      if (!this.fristScreenReport || !this.loadReport) {
        return false
      }
      const fpsListObj = await FPS.getFpsList(tab)

      if (tracing) {
        // 结束跟踪
        await tab.tracing.stop();
      }

      if (metrics) {
        // 返回页面的运行时指标
        const metrics = await tab.metrics();
        console.info(metrics);
      }
      
      // 完成后关闭浏览器
      setTimeout(() => browser.close())

      // 获取首屏请求数
      requests.count.firstScreen = requestTimeList.filter(item => item < this.fristScreenReport.firstScreenTimeStamp).length

      // 获取首屏资源大小
      requestItemList.map(item => {
        if (item.encodedDataLength) {
          loadsize += item.encodedDataLength
          if (item.timestamp * 1000 < this.fristScreenReport.firstScreenTimeStamp) {
            firstScreenLoadsize += item.encodedDataLength
          }
        }
      })

      this.log = {
        page: {
          ...analyzer.statistics({
            ...JSON.parse(this.loadReport),
            firstScreenTime: this.fristScreenReport.firstScreenTime,
            firstScreenTimeStamp: this.fristScreenReport.firstScreenTimeStamp,
            DOMContentLoadedTime: DOMContentLoadedTime,
          }).pageData,
          fullRequestNumber: requests.count.full,
          successRequestNumber: requests.count.success,
          errorRequestNumber: requests.count.error,
          firstScreenRequestNumber: requests.count.firstScreen,
          fullRequestSize: (loadsize / 1024).toFixed(2),
          firstScreenRequestSize: (firstScreenLoadsize / 1024).toFixed(2),
          ...computedAssetSize(),
          ...fpsListObj
          // fpsList: FPSList,
          // imgList: imgList // 超出可视区域的img src列表
        },
      }
      
      if (this.times < count) {
        await Promise.all(settingTasks)
        tab.once('load', loadHandler)
        await tab.goto(url, { timeout: 5000, waitUntil: 'load' })
      } else {
        // 输出最终结果
        console.log(JSON.stringify(this.log))
      }
    }

    // 页面domcontentloaded回调
    const domContentLoadedHandler = async () => {
      DOMContentLoadedTime = (new Date()).valueOf()

      logResult()
    }
    
    // 页面onload回调
    const loadHandler = async () => {
      this.times = this.times + 1
      
      // 页面内部执行脚本
      this.loadReport = await tab.evaluate(async() => {
        const loadPromise = new Promise((resolve, reject) => {
          const pageData = window.performance
          const entries = pageData.getEntries()
          const data = JSON.stringify({ pageData, entries })
          resolve(data);
        }).then(result => result).catch(e => e);
        return loadPromise
      })

      logResult()
    }
    tab.once('domcontentloaded', domContentLoadedHandler)
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

    if (tracing) {
      // 开始跟踪
      await tab.tracing.start({ path: `tracing_${Date.parse( new Date())}.json` });
    }

    // 跳转页面
    await tab.goto(url, { timeout: 5000, waitUntil: 'load' })

    global.__paa__.runInterval = Date.now() - startTimestamp
  }
}
