const fs = require('fs');

const dirPath = "./tmp/"
const nodeExits = () => {
  return new Promise((resolve, reject) => {
    fs.exists(dirPath, (exists) => {
      if (!exists) {
        // reject();
        resolve(false);
      }
      console.log("目录存在");
      resolve(true)
    })
  })
  
}

const nodeMkdir = () => {
  return new Promise(async(resolve, reject) => {
    const res = await nodeExits()
    if (!res) {
      fs.mkdir(dirPath,function(err){
        if (err) {
          reject(err);
        }
        console.log("目录创建成功。");
        resolve()
      });
    }
    resolve()
  })
}

module.exports = (params) => {
  return new Promise(async(resolve, reject) => {
    //实行文件操作
    //文件写入
    //实现文件写入操作
    var msg = params && params.json || '';
    //调用fs.writeFile() 进行文件写入
    await nodeMkdir()
    const unixStr = (params.name ? params.name : '') + Date.now() || 'default'
    console.log("unix时间戳：", unixStr)
    const filePathStr = `${dirPath}${unixStr}.json`
    fs.writeFile(filePathStr, msg, 'utf8', function (err) {
      //如果err=null，表示文件使用成功，否则，表示写入文件失败
      if (err) {
        console.log('写文件出错了，错误是：' + err);
        reject()
      } else {
        resolve()
      }
    })
  })
}