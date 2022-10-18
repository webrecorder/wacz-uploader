/* global localStorage */
import { ArchiveWrapper } from './archivewrapper.js'
import { create } from 'auto-js-ipfs'

const PERSIST_KEY = 'wacz-archives'

log('Initializing IPFS')

const { api: ipfs } = await create()

const wrapper = new ArchiveWrapper({
  ipfs
})

window.dropzone.addEventListener('ondragdrop', (e) => {
  wrapper.uploadFromDropEvent(e)
})

window.fileInput.addEventListener('change', (e) => {
  wrapper.uploadFromFileInputEvent(e)
})

wrapper.addEventListener('uploadstart', () => {
  log('Starting upload')
})

wrapper.addEventListener('uploadfinish', ({ url }) => {
  log('Finished: ' + url)
  if (saveResult(url)) {
    addResult(url)
  }
})

wrapper.addEventListener('uploaderror', ({ error }) => {
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
