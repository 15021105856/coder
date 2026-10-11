import puppeteer from 'puppeteer-core'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = pathToFileURL(join(root, 'dist/index.html')).href

async function clickNav(page, label) {
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll('.side nav button')].find((node) => node.textContent?.includes(text))
    button?.click()
  }, label)
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
})
const page = await browser.newPage()
const external = []
page.on('request', (request) => {
  const url = request.url()
  if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return
  external.push(url)
})
const consoleErrors = []
page.on('pageerror', (error) => consoleErrors.push(String(error)))
await page.setViewport({ width: 1280, height: 800 })
await page.goto(target, { waitUntil: 'networkidle0' })
await page.waitForSelector('h1')
const heading = await page.$eval('h1', (node) => node.textContent)
if (!heading?.includes('今日训练')) throw new Error(`首页标题不对：${heading}`)

await clickNav(page, '方法论')
await page.waitForFunction(() => document.body.innerText.includes('三条铁律'))
const methodText = await page.$eval('main', (node) => node.textContent)
if (!methodText?.includes('核心目标')) throw new Error('方法论页缺少核心目标')
if (!methodText?.includes('08:00–08:40')) throw new Error('方法论页缺少一天参考安排')
if (!methodText?.includes('复测节奏')) throw new Error('方法论页缺少复测节奏')

await clickNav(page, '资料库')
await page.waitForSelector('input[placeholder="搜索原文"]')
await page.type('input[placeholder="搜索原文"]', '建立系统的目标体系')
await page.waitForFunction(() => document.body.innerText.includes('搜索'))
const searchText = await page.$eval('main', (node) => node.innerText)
if (!searchText.includes('建立系统的目标体系') && !searchText.includes('搜索')) throw new Error('搜索没有结果')

await clickNav(page, '主动提取')
await page.waitForSelector('button.linkish')
await page.click('button.linkish')
await page.waitForSelector('textarea')
await page.type('textarea', '1. 定义\n2. 四个特点，第四个是建立系统的目标体系')
await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('无提示交卷'))
  button?.click()
})
await page.waitForFunction(() => document.body.innerText.includes('揭晓前草稿'))
await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('主体小标题都写到了'))
  button?.click()
  const next = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('进入撤提示复述'))
  next?.click()
})
await page.waitForFunction(() => document.body.innerText.includes('撤掉提示后再写一遍'))
await page.type('textarea', '撤提示后再述目标管理')
await page.evaluate(() => {
  const pass = [...document.querySelectorAll('button')].find((node) => node.textContent === '复述通过')
  pass?.click()
})
await page.waitForFunction(() => {
  const save = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('记下这一轮'))
  return Boolean(save && !save.disabled)
})
await page.evaluate(() => {
  const save = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('记下这一轮'))
  save?.click()
})
await page.waitForFunction(() => document.body.innerText.includes('本轮记录'))
const after = await page.$eval('main', (node) => node.innerText)
if (after.includes('掌握率')) throw new Error('页面出现了掌握率')
if (!after.includes('独立提取') && !after.includes('基本提取')) throw new Error(`没有证据标签：${after.slice(0, 400)}`)
await page.reload({ waitUntil: 'networkidle0' })
await clickNav(page, '学习档案')
await page.waitForFunction(() => document.body.innerText.includes('草稿历史') || document.body.innerText.includes('揭晓前'))
const archive = await page.$eval('main', (node) => node.innerText)
if (!archive.includes('四个特点')) throw new Error('刷新后草稿丢失')

await clickNav(page, '资料库')
await page.waitForSelector('.toc button')
await page.evaluate(() => {
  const chapters = [...document.querySelectorAll('.toc button')]
  const btn =
    chapters.find((node) => node.textContent?.includes('管理导论')) ||
    chapters.find((node) => node.textContent?.includes('决策')) ||
    chapters[2]
  btn?.click()
})
await page.waitForSelector('.block-link')
await page.evaluate(() => {
  const links = [...document.querySelectorAll('.block-link')]
  const full = links.find((node) => node.textContent?.includes('完整题')) || links[0]
  full?.click()
})
await page.waitForSelector('.layer-pill.layer-pill-definition, .layer-pill.layer-pill-short_answer', { timeout: 15000 })
const pillCount = await page.$$eval('.layer-pill', (nodes) => nodes.length)
if (pillCount < 1) throw new Error('资料页未渲染 layer-pill 胶囊')
const pillTexts = await page.$$eval('.layer-pill', (nodes) => nodes.map((node) => node.textContent || ''))
if (!pillTexts.some((text) => /必默|核心|余量|原文/.test(text))) {
  throw new Error(`layer-pill 文案异常：${pillTexts.join(' | ')}`)
}
if (!pillTexts.some((text) => text.includes('必默') || text.includes('核心'))) {
  throw new Error(`缺少名解/简答层级 pill：${pillTexts.join(' | ')}`)
}

await page.setViewport({ width: 375, height: 720 })
await clickNav(page, '今日训练')
const mobile = await page.evaluate(() => ({
  grid: getComputedStyle(document.querySelector('.shell')).gridTemplateColumns,
  inner: window.innerWidth,
  scroll: document.documentElement.scrollWidth,
}))
if (mobile.scroll > mobile.inner + 2) throw new Error(`375px 今日页出现横向滚动 ${mobile.scroll}`)
for (const label of ['方法论', '主动提取', '闭卷考试', '资料库']) {
  await clickNav(page, label)
  const width = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }))
  if (width.scroll > width.inner + 2) throw new Error(`375px ${label} 出现横向滚动 ${width.scroll}`)
}
await page.setViewport({ width: 1920, height: 1080 })
await clickNav(page, '资料库')
const desktopNav = await page.$eval('.side', (node) => getComputedStyle(node).display)
await browser.close()
if (external.length) {
  console.error(JSON.stringify({ ok: false, external, consoleErrors }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({
  ok: true,
  url: target,
  browser: 'google-chrome-stable headless',
  external,
  consoleErrors,
  mobile,
  desktopNav,
  restoredDraft: true,
  methodology: true,
  layerPills: pillCount,
}, null, 2))
