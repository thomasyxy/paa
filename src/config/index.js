module.exports = {
  cdnReg: /(cdn.myweimai.com|static.qstcdn.com|img.qstcdn.com|article.myweimai.com|weimai-yunyin.oss-cn-hangzhou.aliyuncs.com|dev.cdn.myweimai.com)/,
  urlReg: /integration.m.myweimai.com/,
  jscssReg: /(js|css)$/i,
  imgReg: /(png|jpg)$/i,
  base64Reg: /base64/i,
  jscssLimit: 100 * 1024,
  imgLimit: 50 * 1024,
  base64Limit: 1 * 1024
}