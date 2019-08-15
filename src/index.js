const semver = require('semver')
const chalk = require('chalk')
const requiredNodeVersion = require('../package.json').engines.node

if (!semver.satisfies(process.version, requiredNodeVersion)) {
  console.log(chalk.red(
    `\n[Hiper] Minimum Node version not met:` +
    `\nYou are using Node ${process.version}, but Hiper ` +
    `requries Node ${requiredNodeVersion}.\nPlease upgrade your Node version.\n`
  ))
  process.exit(1)
}

// 接受cli参数
// 装配opts
// 调用broswer拿到数据
// 调用分析模块
// 调用output
/**
 * Module dependencies.
 */
// 命令行对象
const Cli = require('../src/cli')
const Outputer = require('../src/output')
// 性能数据生成对象
const Performance = require('../src/performance')
const cli = new Cli()
const performance = new Performance()
const outputer = new Outputer()

// 监听命令行
let opts = cli.monitor()
performance.run(opts)

// console.log(JSON.stringify(opts))
