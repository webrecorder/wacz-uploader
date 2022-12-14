/* global Blob */
import { CarWriter } from '@ipld/car/writer'

import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'

import * as DagPB from '@ipld/dag-pb'
import { sha256 } from 'multiformats/hashes/sha2'

import { toGatewayURL } from 'auto-js-ipfs'

// const DEFAULT_TEMPLATE = 'ipfs://bafybeihrupxyvw4tqdi4voy3olmhstmrosxjgfwyjtknaxzh27t5sa6zkm/'
const DEFAULT_TEMPLATE = 'ipfs://bafybeic3zi46caikdvukly7xwnjrecbvmllafvopvlyw6ylt3oeht7h5om/'
const ARCHIVES_INDEX_NAME = 'wrg-config.json'

export class UploadFileStartEvent extends Event {
  constructor (file) {
    super('uploadfilestart')
    this.file = file
  }
}

export class UploadFileMetadataStartEvent extends Event {
  constructor (file) {
    super('uploadfilemetadatastart')
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

export class UploadFileListStartEvent extends Event {
  /**
   * @param {File[]} files 
   */
  constructor (files) {
    super('uploadfileliststart')
    this.files = files
  }
}

export class UploadFileListFinishEvent extends Event {
  /**
   * @param {{ completed: Map; rejected: null | Map }}
   */
  constructor ({ completed, rejected }) {
    super('uploadfilelistfinish')
    this.completed = completed
    this.rejected = rejected
  }
}

export class UploadFileListErrorEvent extends Event {
  constructor (error) {
    super('uploadfilelisterror')
    this.error = error
  }
}

export class UploadSiteStartEvent extends Event {
  constructor () {
    super('uploadsitestart')
  }
}

export class UploadSiteMetadataEvent extends Event {
  constructor () {
    super('uploadsitemetadatastart')
  }
}

export class UploadSiteFinishEvent extends Event {
  constructor (url, gatewayUrl) {
    super('uploadsitefinish')
    this.url = url
    this.gatewayUrl = gatewayUrl
  }
}

export class UploadSiteErrorEvent extends Event {
  constructor (error) {
    super('uploadsiteerror')
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

  async uploadFromFileInputEvent(e) {
    return this.uploadFiles(e.target.files)
  }

  async uploadFromDropEvent(e) {
    return this.uploadFiles(e.dataTransfer.files)
  }

  /**
   * @param {FileList} fileList
   * @returns {Map} Map of successfully uploaded files
   */
  async uploadFiles (fileList) {
    try {
      this.dispatchEvent(new UploadFileListStartEvent([...fileList]))

      const results = await Promise.allSettled([...fileList]
        .map((file) => this.uploadFile(file))
      )

      const archiveMap = new Map()
      let rejectedMap = null

      results.forEach(({ status, value, reason }, i) => {
        const file = fileList[i]

        if (status === 'rejected') {
          console.debug(`uploadFiles ${file.name} rejected reason: ${reason}`)
          rejectedMap = rejectedMap || new Map()
          rejectedMap.set(file.name, { reason })
        } else {
          const { url, name, size } = value
          archiveMap.set(file.name, { url, size, name })
        }
      })

      this.dispatchEvent(new UploadFileListFinishEvent({
        completed: archiveMap,
        rejected: rejectedMap
      }))

      return archiveMap
    } catch (e) {
      this.dispatchEvent(new UploadFileListErrorEvent(e))
      throw e
    }
  }

  async uploadFile (file) {
    const { name } = file
    try {
      this.dispatchEvent(new UploadFileStartEvent(file))
      console.log('Uploading', file, this.ipfs, name)

      // TODO: Chunking here!
      const url = (await this.ipfs.uploadFile(file)) + '#' + name

      this.dispatchEvent(new UploadFileMetadataStartEvent(file))
      console.log('Uploaded, getting metadata')
      // Also ends up preloading the file into IPFS gateways for us
      // const size = await this.ipfs.getSize(url)
      const size = file.size

      console.log('Got size and metadata', size, url)

      this.dispatchEvent(new UploadFileFinishEvent(file, url))

      return { url, file, size, name }
    } catch (e) {
      this.dispatchEvent(new UploadFileErrorEvent(file))
      throw e
    }
  }

  /**
   * @param {Map} archiveMap - Map of successfully uploaded files
   * @returns {string} URL to archives website
   */
  async uploadWrappedArchives (archiveMap) {
    console.debug('Uploading archiveMap:', archiveMap)
    try {
      this.dispatchEvent(new UploadSiteStartEvent())
      const url = await this.wrapArchives(archiveMap)
      const gatewayUrl = toGatewayURL(url)
      this.dispatchEvent(new UploadSiteFinishEvent(url, gatewayUrl))

      return url
    } catch (e) {
      this.dispatchEvent(new UploadSiteErrorEvent(e))
      throw e
    }
  }

  async wrapArchives (archiveMap) {
    const root = await this.getTemplateRoot()

    const archives = []

    for (const [fileName, { name, url, size, description = "" }] of archiveMap) {
      this.addLink(root, fileName, url, size)
      archives.push({ name: name || fileName, url, description })
    }

    const archivesJSON = JSON.stringify({ archives }, null, '\t')

    this.dispatchEvent(new UploadSiteMetadataEvent())
    console.debug({ archivesJSON })

    const url = await this.ipfs.uploadFile(archivesJSON)

    const size = new TextEncoder().encode(archivesJSON).length

    this.addLink(root, ARCHIVES_INDEX_NAME, url, size)

    const resultURL = await this.saveRoot(root)

    return resultURL
  }

  async saveRoot (rootNode) {
    // Encode to dag-pb from UnixFS
    const prepared = DagPB.prepare(rootNode)

    // Encode to block
    const block = await Block.encode({
      value: prepared,
      codec: DagPB,
      hasher: sha256
    })

    // This is needed because web3.storage requires a non-root block in CAR files
    // Kind of a gross hack, but we can figure it out after they get back to us
    const blocknt = await Block.encode({
      value: DagPB.prepare({}),
      codec: DagPB,
      hasher: sha256
    })

    // Create CarWriter
    const { writer, out } = await CarWriter.create([block.cid])
    const onBuffer = collectBuffer(out)

    // Put block into writer
    await writer.put({
      cid: block.cid,
      bytes: block.bytes
    })
    await writer.put({
      cid: blocknt.cid,
      bytes: blocknt.bytes
    })
    await writer.close()

    // Upload CAR to IPFS
    const [url] = await this.ipfs.uploadCAR(await onBuffer)

    return url
  }

  async getTemplateRoot () {
    // Get the raw block
    // Note that some gateways don't support the `format` functionality
    // For details check the Block/Car section of these gateways:
    // https://ipfs.github.io/public-gateway-checker/
    const blockBuffer = await collectBuffer(
      this.ipfs.get(this.templateURL, {
        format: 'raw'
      })
    )
    const block = new Uint8Array(blockBuffer)

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
