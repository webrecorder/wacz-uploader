/* global localStorage */
import { ArchiveWrapper } from './archivewrapper.js'
import { create } from 'auto-js-ipfs'
import { App } from './ui.js'

const PERSIST_KEY = 'wacz-archives'

log('Initializing IPFS')

const { api: ipfs } = await create({
  web3StorageToken: __define__.WEB3_STORAGE_TOKEN
})

const wrapper = new ArchiveWrapper({
  ipfs
})

new App({ wrapper })

if (window.location.search.includes('debug')) {
  document.querySelector('#debug').classList.remove('hidden')
}

wrapper.addEventListener('uploadsitestart', () => {
  log('Starting wrapper upload')
})

wrapper.addEventListener('uploadsitefinish', ({ url }) => {
  log('Done: Generated page at ' + url)
  if (saveResult(url)) {
    addResult(url)
  }
})

wrapper.addEventListener('uploadsiteerror', ({ error }) => {
  log(error.stack)
})

wrapper.addEventListener('uploadfilestart', ({ file }) => {
  const name = file.name || 'archives.json'
  log(`Uploading file: ${name}`)
})

wrapper.addEventListener('uploadfilefinish', ({ file, url }) => {
  const name = file.name || 'archives.json'
  log(`Finished uploading file: ${name} ${url}`)
})

getResults().map(addResult)

log('Ready')

function log (message) {
  console.log(message)
  const p = document.createElement('p')
  p.innerText = message
  window.statuslog.append(p)
}

function addResult (url) {
  const a = document.createElement('a')
  a.href = url
  a.innerText = url
  window.resultzone.append(a)
}

function saveResult (url) {
  const existing = getResults()
  if (existing.includes(url)) return false
  existing.push(url)
  saveResults(existing)
  return true
}

function saveResults (urls) {
  localStorage.setItem(PERSIST_KEY, JSON.stringify(urls))
}

function getResults () {
  const cached = localStorage.getItem(PERSIST_KEY)
  if (!cached) return []
  return JSON.parse(cached)
}
