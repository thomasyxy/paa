module.exports = {
  cdnReg: /(cdn.a.com|static.b.com|img.c.com)/,
  urlReg: /baidu.com/,
  jscssReg: /(js|css)$/i,
  imgReg: /(png|jpg)$/i,
  base64Reg: /base64/i,
  jscssLimit: 100 * 1024,
  imgLimit: 50 * 1024,
  base64Limit: 1 * 1024
}
