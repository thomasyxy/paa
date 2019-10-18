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
    this.loadReport = null
    this.domContentLoadedReport = null
  }
  
  async run (opts = this.opts) {
    let startTimestamp = Date.now() // 开始时间
    let loadsize = 0; // 加载资源大小
    let firstScreenLoadsize = 0 // 首屏加载资源大小
    let DOMContentLoadedTime = 0 // DOMContentLoaded时间
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
      online
    } = opts

    // puppeteer默认配置项
    let launchOpts = {
      headless,
      headless: false,
      // args: ['--unlimited-storage', '--full-memory-crash-report']
      args: ['--no-sandbox']
    }
    let requestTimeList = []

    let requestItemList = []
    
    let requestObject = {}
    // 请求结果初始参数
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
    let firstFlag = 0
    // 监听加载事件,统计资源大小
    client.on('Network.loadingFinished', async (e) => {
      if (!firstFlag) {
        firstFlag = true
        try{
          if (localStorage) {
            localStorage.map(async (ls) => {
              if (ls.name && ls.value) {
                await tab.evaluate((name, value) => { 
                  window.localStorage.setItem(name, value)
                }, ls.name, JSON.stringify(ls.value))
                // await tab.evaluate(() => { 
                //   window.localStorage.setItem("userInfo", JSON.stringify({"CHANGZHUDZ":null,"GUID":"bd7eed81-c864-4dd8-b457-2bf0e0fea17c","KEHUBH":"910300000000671856","NICHENG":"","RENZHENGBZ":null,"SHENFENZH":"330183199205278940","SHENGSHIQXMC":null,"SHOUJIHAO":"17000000000","TIAOZHUANDZ":null,"TOKEN":"1a00f766-f4fb-471f-9714-f3ad0c81041e","WANSHANBZ":"1","WEIMAIHAO":"910300000000671855","XINGBIE":"2","XINGMING":"测试小零","YONGHUBH":null,"YONGHULB":null,"RongCloudToken":"","ImageUrl":"","IsNewRegister":"0","noPassword":false,"isLogin":true})
                //   )
                // })
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
        }catch(err){
          console.log(err)
        }
      }
      requestItemList.map(l => {
        if (l.requestId === e.requestId) {
          l.encodedDataLength = e.encodedDataLength
          l.timestampEnd = e.timestamp
          l.timestamp = l.timestampEnd - l.timestampStart + l.wallTime
        }
        return l;
      })
      if (!this.loadedReport) {
        loadsize += e.encodedDataLength
      }
      if (!this.domContentLoadedReport) {
        firstScreenLoadsize += e.encodedDataLength
      }
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

    // 请求发起事件回调
    function logRequest(interceptedRequest) {
      // if ()
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
        const jscssReg = /(js|css)$/i;
        const imgReg = /(png|jpg)$/i;
        const base64Reg = /base64/i;
        let overSize = 0
        if (jscssReg.test(url)) {
          // jsCssRequestCount += 1;
          overSize = item.encodedDataLength - (100 * 1024);
          (overSize > 0) && (overSizeJSCSS += overSize)
        } else if (imgReg.test(url)) {
          // imgRequestCount += 1;
          overSize = item.encodedDataLength - (50 * 1024);
          (overSize > 0) && (overSizeImg += overSize);
        } else if (base64Reg.test(url)) {
          overSize = item.encodedDataLength - (1 * 1024);
          (overSize > 0) && (overSizeBase64 += overSize);
        }
        try{
          const cdnReg = /(cdn.myweimai.com|static.qstcdn.com)/;
          const integrationReg = /integration.m.myweimai.com/;
          (!cdnReg.test(url) && !integrationReg.test(url)) && (notCDNAssetCount += 1);
        }catch(e){
          console.log(e)
        }
        // integrationReg.test(url) && (integrationAssetCount += 1);
        if (item.status >= 400) {
          errorRequestCount += 1;
        }
        return item
      })
      return {
        // jsCssRequestCount,
        // imgRequestCount,
        overSizeJSCSS,
        overSizeImg,
        overSizeBase64,
        notCDNAssetCount,
        errorRequestCount
      }
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

    const logResult = async () => {
      if (this.loadReport && this.domContentLoadedReport) {
        // 完成后关闭浏览器
        setTimeout(() => browser.close())
        
        requests.count.firstScreen = requestTimeList.filter(item => item < this.domContentLoadedReport.firstScreenTimestamp).length

        this.log = {
          page: {
            ...analyzer.statistics({
              ...JSON.parse(this.loadReport),
              firstScreenTime: this.domContentLoadedReport.firstScreenTime,
              DOMContentLoadedTime: DOMContentLoadedTime,
            }).pageData,
            fullRequestNumber: requests.count.full,
            successRequestNumber: requests.count.success,
            errorRequestNumber: requests.count.error,
            firstScreenRequestNumber: requests.count.firstScreen,
            fullRequestSize: (loadsize / 1024).toFixed(2),
            firstScreenRequestSize: (firstScreenLoadsize / 1024).toFixed(2),
            ...computedAssetSize()
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
    }

    // 页面domcontentloaded回调
    const domContentLoadedHandler = async () => {
      DOMContentLoadedTime = (new Date()).valueOf()
      // 载入首屏统计脚本
      await tab.evaluate(async() => {
        const content = await window.readfile('/util/acfst.js');
        eval(content)
      })

      // 页面内部执行脚本
      this.domContentLoadedReport = await tab.evaluate(async() => {
        const domContentLoadedPromise = new Promise((resolve, reject) => {
          // 获取首屏时间
          window.autoComputeFirstScreenTime({
            onReport: function (result) {
              if (result.success) {
                resolve({
                  firstScreenTime: result.firstScreenTime,
                  firstScreenTimestamp: (new Date()).valueOf()
                });
              }
            }
          });
        }).then(result => result).catch(e => e);
        return domContentLoadedPromise
      })
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
  
    // 跳转页面
    await tab.goto(url, { timeout: 5000, waitUntil: 'load' })

    global.__hiper__.runInterval = Date.now() - startTimestamp
  }
}
