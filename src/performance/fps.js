module.exports = {
  getFpsList: async (tab) => {
    const FPSList = await tab.evaluate(() => { return Promise.resolve(window.localStorage.getItem('FPSList')) });
    // console.log('fps:', FPSList)
    // console.log('allFrameCount:', await tab.evaluate(() => {return Promise.resolve(window.localStorage.getItem('allFrameCount'))}))

    // 获取超出可视区域高度的图片列表 img src
    const imgList = await tab.evaluate(() => {
      const height = document.documentElement.clientHeight;
      const obj = document.getElementsByTagName('img');
      const strImg = [];
      try {
        Array.from(obj).map(e => {
          const imgSrc = e.getAttribute('src')
          // if(imgSrc){
          //   strImg.push(imgSrc);
          // }
          if (e.offsetTop > height) {
            strImg.push(imgSrc);
          }
        })
      } catch (e) {
        console.log('err:', e.toString())
      }
      return strImg;
    });
    const Fs = FPSList.split(',')
    if (Fs.length > 10) {
      Fs.pop();
      Fs.shift();
    }
    return {
      FPSList,
      Fs: Fs.join(','),
      imgList // 获取超出可视区域高度的图片列表 img src
    }
  },
  setFpsRAF: (tab) => {
    tab.on('framenavigated', async () => {
      // fps
      await tab.evaluate(() => { 
        var rAF = function () {    
          return (
            window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            function (callback) {
              window.setTimeout(callback, 1000 / 60);
            }
          );
        }();
        var fpsList = []
        var frame = 0;
        var allFrameCount = 0;
        var lastTime = Date.now();
        var lastFameTime = Date.now();
        var loop = function () {
          var now = Date.now();
          var fs = (now - lastFameTime);
          var fps = Math.round(1000 / fs);
        
          lastFameTime = now;
          // 不置 0，在动画的开头及结尾记录此值的差值算出 FPS
          allFrameCount++;
          frame++;
        
          if (now > 100 + lastTime) {
            var fps = Math.round((frame * 1000) / (now - lastTime));
            // console.log(`${new Date()} 1S内 FPS：`, fps);
            fpsList.push(fps)
            window.localStorage.setItem('FPSList', fpsList)
            window.localStorage.setItem('allFrameCount', allFrameCount)
            frame = 0;
            lastTime = now;
          };
          rAF(loop);
        }
        window.localStorage.setItem('paaArr', 'start')
        // console.log('start:')
        loop();
      })
    })
  }
}