/* global Blob */
import { CarWriter } from '@ipld/car/writer'

import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'

import * as DagPB from '@ipld/dag-pb'
import { sha256 } from 'multiformats/hashes/sha2'

const DEFAULT_TEMPLATE = 'ipfs://example/'

export class UploadFileStartEvent extends Event {
  constructor (file) {
    super('uploadfilestart')
    this.file = file
  }
}

export class UploadFileFinishEvent extends Event {
  constructor (file, url) {
    super('uploadfilefinish')
    this.file = file
    this.url = url
  }
}

export class UploadFileErrorEvent extends Event {
  constructor (file, error) {
    super('uploadfileerror')
    this.file = file
    this.error = error
  }
}

export class UploadStartEvent extends Event {
  constructor () {
    super('uploadstart')
  }
}

export class UploadFinishEvent extends Event {
  constructor (url) {
    super('uploadfinish')
    this.url = url
  }
}

export class UploadErrorEvent extends Event {
  constructor (error) {
    super('uploaderror')
    this.error = error
  }
}

export class ArchiveWrapper extends EventTarget {
  constructor ({
    templateURL = DEFAULT_TEMPLATE,
    ipfs = throwError('Must pass in auto-js-ipfs instance')
  }) {
    super()
    this.templateURL = templateURL
    this.ipfs = ipfs
  }

  async uploadFromFileInputEvent (e) {
    const fileList = e.target.files
    return this.uploadFiles(fileList)
  }

  async uploadFromDropEvent (e) {
    const fileList = e.dataTransfer.files
    return this.uploadFiles(fileList)
  }

  async uploadFiles (fileList) {
    try {
      this.dispatchEvent(new UploadStartEvent())
      console.log('start uploading files', fileList)

      const results = await Promise.allSettled([...fileList]
        .map((file) => this.uploadFile(file))
      )

      console.log('Building up archive Map')

      const archiveMap = new Map()

      for (const { status, value, reason } of results) {
        if (status === 'rejected') throw reason
        const { url, name, size } = value
        archiveMap.set(name, { url, size, name })
      }

      console.log('Wrapping with template')

      const url = await this.wrapArchives(archiveMap)

      this.dispatchEvent(new UploadFinishEvent(url))

      console.log('Finished', url)

      return url
    } catch (e) {
      this.dispatchEvent(new UploadErrorEvent(e))
      throw e
    }
  }

  async uploadFile (file) {
    const { name } = file
    try {
      this.dispatchEvent(new UploadFileStartEvent(file))
      console.log('Uploading', file, this.ipfs, name)

      // TODO: Chunking here!
      const url = await this.ipfs.uploadFile(file)

      console.log('Uploaded, getting metadata')
      // Also ends up preloading the file into IPFS gateways for us
      const size = await this.ipfs.getSize(url)

      console.log('Got size and metadata', size, url)

      this.dispatchEvent(new UploadFileFinishEvent(file, url))

      return { url, file, size, name }
    } catch (e) {
      this.dispatchEvent(new UploadFileErrorEvent(file))
      throw e
    }
  }

  async wrapArchives (archiveMap) {
    const root = await this.getTemplateRoot()

    for (const [name, { url, size }] of archiveMap) {
      this.addLink(root, name, url, size)
    }

    const resultURL = await this.saveRoot(root)

    return resultURL
  }

  async saveRoot (rootNode) {
    // Encode to dag-pb from UnixFS
    const prepared = DagPB.prepare(rootNode)

    // Encode to block
    const block = Block.encode({
      value: prepared,
      codec: DagPB,
      hasher: sha256
    })

    // Create CarWriter
    const { writer, out } = await CarWriter.create([block.cid])

    // Put block into writer
    writer.put(block)
    writer.close()

    // Upload CAR to IPFS
    await this.ipfs.uploadCAR(out)

    // Return block CID as URL
    const url = `ipfs://${block.cid}/`
    return url
  }

  async getTemplateRoot () {
    // Get the raw block
    const toFetch = new URL(this.templateURL)
    toFetch.searchParams.set('format', 'raw')
    const block = await collectBuffer(this.ipfs.get(toFetch.href))

    const decoded = DagPB.decode(block)

    return decoded
  }

  addLink (dirNode, name, url, size) {
    const cidString = url.slice('ipfs://'.length).split('/')[0]
    const cid = CID.parse(cidString)
    const existing = dirNode.Links.find(({ Name }) => Name === name)
    if (existing) {
      existing.Hash = cid
      existing.Tsize = size
    } else {
      dirNode.Links.push({
        Hash: cid,
        Name: name,
        Tsize: size
      })
    }
  }
}

function throwError (message) {
  throw new Error(message)
}

async function collectBuffer (iterator) {
  const chunks = []
  for await (const chunk of iterator) {
    chunks.push(chunk)
  }

  const blob = new Blob(chunks)

  return blob.arrayBuffer()
}
