# 介绍

paa === Performance Analyze Assistant

由于在内部开发工程中，hiper无法满足需求并存在一些使用问题未得到解决，基于hiper重新开发，用于帮助开发者和测试同学更好更全面的定制页面测试方案，得到想要的性能数据
另外还希望在这个工具的基础上尽可能多的扩展一些日常开发的小工具，例如：视觉还原度分析、页面灰度测试、UI自动化、埋点分析等

### 特性
* 返回基础的页面性能数据：dns耗时、TCP耗时、首字节返回耗时、白屏时间、DOMContentLoaded时间、DOMReady时间、load时间等
* 首屏时间：基于 [`auto-compute-first-screen-time`](https://github.com/hoperyy/auto-compute-first-screen-time) 获取，具体原理可以看作者的介绍：[如何自动获取首屏时间](https://github.com/weidian-inc/weidian-tech-blog/issues/1)
* 页面资源请求分析：资源文件体积计算、资源文件体积校验、资源CDN域名校验、请求返回正确性校验、请求数量校验
* FPS：大致估测帧数，用于分析目标页面是否卡顿
* 支持 cookie、localstorage、sessionstorage、user-agent 自定义传入
* 支持模拟移动端设备、控制屏幕尺寸、切换横屏
* 支持离线模式、页面缓存、禁用脚本
* 支持命令行参数和文件两种方式执行
* 跟踪功能：分析浏览器活动同时生成报告，当前目录下`tracing_<date>.json`，在chrome下打开 chrome://tracing/ 导入后查看浏览器活动热力图
* 获取页面的运行时指标，生成报告，当前目录下

# 使用文档
 
### 安装

```
npm install -g paa
```

### 开始使用

```
paa https://m.myweimai.com/new/mall/index.html?areaId=0 -n 1
```

你也可以通过配置文件的方式来执行命令，传入的参数更加清晰易懂

```
paa -c text.json

// text.json
{
    "url": "http://integration.m.myweimai.com/new/mall/index.html?areaId=0",
    "viewport": {
        "isMobile": true,
        "width": 375,
        "height": 667,
        "deviceScaleFactor": 2
    },
    "cookies": [
        {
            "name": "token",
            "value": "7cb89837-599c-4dfc-ae39-29d0f9a266e3",
            "domain": "m.myweimai.com"
        }
    ],
    "localStorage": [{
        "name": "userInfo",
        "value": {
            "name":"若榴"
         }
    }],
    "count": 1,
    "noCache": "false",
    "noJavascript": "false",
    "noOnline": "false",
    "useragent": "Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1"
}
```

```
Options:

   -v, --version                输出版本号
   -n, --count <n>              指定加载次数（默认20次）
   -c, --config <path>           载入指定的配置文件
   -u, --useragent <ua>         设置useragent
   -H, --headless [b]           是否使用无头模式（默认为true）
   -e, --executablePath <path>  使用指定的Chrome浏览器
   --no-cache                   禁用缓存（默认为false）
   --no-javascript              禁用JavaScript (默认为false)
   --no-online                  禁用网络（默认为false）
   --tracing                    开启浏览器活动分析
   --metrics                    开启页面的运行时指标收集
   -h, --help                   输出帮助信息
```


### 返回结果

* dnsTime: DNS 服务作用于网络连接之前，将域名解析为 IP 地址供后续流程进行连接，DNS 查询时，会先在本地缓存中尝试查找，如果不存在或是记录过期，就继续向 DNS 服务器发起递归查询,这里的 DNS 服务器一般就是运营商的 DNS 服务器
* tcpTime: TCP连接的建立，需要经历3个报文的交互过程，沟通相关连接参数，这个过程称为三次握手
* TTFB: 首字节时间，浏览器开始收到服务器响应数据的时间(后台处理时间+重定向时间)
* pageDownloadTime: html下载耗时
* whiteScreenTime: 白屏时间，浏览器从响应用户输入网址地址，到浏览器开始显示内容的时间
* DOMContentLoadedTime: 当初始的 HTML 文档被完全加载和解析完成之后，DOMContentLoaded 事件被触发，而无需等待样式表、图像和子框架的完成加载
* DOMReadyTime: domready时间，表示DOMContentLoaded事件完成到浏览器发起任何请求之前的时间
* afterDOMReadyDownloadTime: 解析dom树耗时，表示浏览器html文档解析完毕到html文档完全解析完毕的时间
* loadTime: load 应该仅用于检测一个完全加载的页面 当一个资源及其依赖资源已完成加载时，将触发load事件
* firstScreenTime: 首屏时间，参考[如何自动获取首屏时间](https://github.com/weidian-inc/weidian-tech-blog/issues/1)
* fullRequestNumber: 完整请求数，直到页面完全加载前发出的请求
* successRequestNumber: 成功请求数
* errorRequestNumber: 错误请求数，当页面的请求失败时触发，比如某个请求超时了
* firstScreenRequestNumber: 首屏请求数，截止到firstScreenTime首屏时间前的请求数量
* fullRequestSize: 页面总请求体积大小
* firstScreenRequestSize: 首屏请求体积，截止到firstScreenTime首屏时间前的请求体积大小
* overSizeJSCSS: 超出预计js、css资源大小限制部分`jscssLimit`的体积
* overSizeImg: 超出预计图片资源大小限制部分`imgLimit`的体积
* overSizeBase64: 超出预计base64资源大小限制部分`base64Limit`的体积
* notCDNAssetCount: 不在CDN白名单内的资源请求数
* errorRequestCount: 请求异常数量（status >= 400）
* FPSList: 页面内fps的打点


# TODO
* 页面性能变化趋势，优化前后结果比对，分析优化收益是否满足预期
* 优化FPS数据准确性
* 支持以命令行表格形式展示数据
* GZIP压缩校验
* 图片压缩校验
* 模拟地理位置，用于模拟api接口调用环境和需要灰度的情况
* 支持提供模拟更多设备的用户代理和视口的选项