/**
 * App UI state
 */
import {
  createMachine,
  interpret,
  assign,
} from 'https://cdn.jsdelivr.net/npm/xstate@4.33.6/dist/xstate.web.js'

// Context stored in app state
const initialContext = {
  /**
   * Web archive files to upload
   * Mapped by original file name (ID)
   * @type {Map<string,{
   *   name: string;
   *   description: string;
   *   size: number;
   *   file: File;
   *   isUploading: boolean;
   *   error: Error;
   *   url: string;
   * }>}
   */
  fileMap: new Map(),
}

function formatFileName(fileName) {
  return fileName.slice(0, fileName.lastIndexOf('.'))
}

/**
 * @param {FileList} fileList
 * @returns {{ accept: FileList; reject: FileList }}
 */
function filesByAccept(fileList) {
  const acceptList = new DataTransfer();
  const rejectList = new DataTransfer();
  Array.from(fileList).forEach((file) => {
    const { name, type } = file;
    if (/\.wa(cz|rc)$/.test(name) || /\/wa(cz|rc)$/.test(type)) {
      acceptList.items.add(file);
    } else {
      rejectList.items.add(file);
    }
  });

  return {
    accept: acceptList.files,
    reject: rejectList.files,
  };
}

export class App {
  appRoot = null
  wrapperService = null
  stateService = null
  // xstate state configuration
  // Common args:
  //  ctx: context (.context object)
  //  evt: event (passed through from `ArchiveWrapper` events)
  states = {
    initial: {
      entry: () => this.renderInitial(),
      states: {
        noValidFiles: {
          entry: () => this.renderNoValidFiles(),
        },
      },
      on: {
        FILE_INPUT_CHANGE: [{
          target: 'editFileInformation',
          actions: assign({
            fileMap: (ctx, { fileList }) =>
              new Map(
                Array.from(fileList).map((file) => 
                  [file.name, { name: formatFileName(file.name), file }])
              ),
          }),
          cond: (ctx, evt) => filesByAccept(evt.fileList).accept.length > 0,
        }, {
          target: '.noValidFiles',
          cond: (ctx, evt) => !filesByAccept(evt.fileList).accept.length,
        }],
      },
    },
    editFileInformation: {
      id: 'editFileInformation',
      entry: (ctx) => this.renderFileInformation(ctx),
      on: {
        REMOVE_FILE: [{
          // target: 'initial',
          actions: () => {
            // TODO transition to initial
            window.location.reload()
          },
          cond: (ctx) => ctx.fileMap.size === 1,
        }, {
          actions: [
            assign({
              fileMap: (ctx, { file }) => {
                ctx.fileMap.delete(file.name)
                return ctx.fileMap
              },
            }),
            (ctx, evt) => this.renderDeletedFile(evt),
          ],
          cond: (ctx) => ctx.fileMap.size > 1,
        }],
        UPDATE_FILE_NAME: {
          actions: [
            assign({
              fileMap: (ctx, { name, file }) => {
                const data = ctx.fileMap.get(file.name)
                ctx.fileMap.set(file.name, { ...data, name })
                return ctx.fileMap
              },
            }),
            ({ fileMap }, { file }) => {
              const data = fileMap.get(file.name)
              this.renderFileNames(data)
            },
          ],
        },
        UPDATE_FILE_DESCRIPTION: {
          actions: assign({
            fileMap: (ctx, { file, description }) => {
              const data = ctx.fileMap.get(file.name)
              ctx.fileMap.set(file.name, { ...data, description })
              return ctx.fileMap
            },
          }),
        },
        CONTINUE: 'creatingSite.uploadingFiles',
      },
    },
    incompleteFileListUpload: {
      id: 'incompleteFileListUpload',
      entry: () => this.renderIncompleteWarning(),
      on: {
        BACK: 'editFileInformation',
        CONTINUE: 'creatingSite.uploadingSite',
      },
    },
    creatingSite: {
      id: 'creatingSite',
      entry: () => this.renderCreatingSite(),
      states: {
        uploadingFiles: {
          entry: (ctx) => this.uploadFiles(ctx),
          on: {
            UPLOAD_FILE_LIST_START: {
              actions: () => this.renderCreatingSiteStatusMessage({
                message: 'Starting upload...'
              }),
            },
            UPLOAD_FILE_LIST_FINISH: [{
              target: '#incompleteFileListUpload',
              cond: (ctx, evt) => evt.rejected && evt.rejected.size,
            }, {
              target: 'uploadingSite',
              cond: (ctx, evt) => !evt.rejected || !evt.rejected.size,
            }],
            FILE_UPLOAD_START: {
              actions: assign({
                fileMap: (ctx, { file }) => {
                  const data = ctx.fileMap.get(file.name)
                  ctx.fileMap.set(file.name, { ...data, isUploading: true })
                  return ctx.fileMap
                },
              }),
            },
            FILE_UPLOAD_ERROR: {
              actions: assign({
                fileMap: (ctx, { file, error }) => {
                  const data = ctx.fileMap.get(file.name)
                  ctx.fileMap.set(file.name, { ...data, error })
                  return ctx.fileMap
                },
              }),
            },
            FILE_UPLOAD_SUCCESS: {
              actions: assign({
                fileMap: (ctx, { file, url }) => {
                  const data = ctx.fileMap.get(file.name)
                  ctx.fileMap.set(file.name, { ...data, url })
                  return ctx.fileMap
                },
              }),
            },
          },
        },
        uploadingSite: {
          entry: (ctx) => this.uploadSite(ctx),
          on: {
            UPLOAD_SITE_START: {
              actions: () => this.renderCreatingSiteStatusMessage({
                message: 'Uploading site to IPFS...'
              }),
            },
            UPLOAD_SITE_METADATA_START: {
              actions: () => this.renderCreatingSiteStatusMessage({
                message: 'Almost done...'
              }),
            },
            UPLOAD_SITE_ERROR: 'siteUploadError',
            UPLOAD_SITE_FINISH: '#done',
          },
        },
        siteUploadError: {
          entry: (ctx, evt) => this.renderCreatingSiteError(evt),
          on: {
            BACK: '#editFileInformation',
            RETRY: '#creatingSite.uploadingSite',
          },
        },
      },
    },
    done: {
      id: 'done',
      type: 'final',
      entry: (ctx, evt) => this.renderDone(evt),
      // on: {
      //   RESTART: {
      //     target: 'initial',
      //     actions: assign(initialContext),
      //   },
      // },
    },
  }

  constructor({ wrapper }) {
    this.appRoot = document.getElementById('appRoot')
    this.stateService = interpret(
      createMachine({
        initial: 'initial',
        predictableActionArguments: true,
        context: initialContext,
        states: this.states,
      })
    )
      .onTransition((state) => console.debug(state.value))
      .start()
    this.wrapperService = {
      uploadFiles: (...args) => wrapper.uploadFiles(...args),
      uploadWrappedArchives: (...args) => wrapper.uploadWrappedArchives(...args),
    }
    
    wrapper.addEventListener('uploadfilestart', (evt) =>
      this.stateService.send('FILE_UPLOAD_START', evt)
    )
    wrapper.addEventListener('uploadfilemetadatastart', (evt) =>
      this.stateService.send('FILE_UPLOAD_METADATA_START', evt)
    )
    wrapper.addEventListener('uploadfilefinish', (evt) =>
      this.stateService.send('FILE_UPLOAD_SUCCESS', evt)
    )
    wrapper.addEventListener('uploadfileerror', (evt) =>
      this.stateService.send('FILE_UPLOAD_ERROR', evt)
    )
    wrapper.addEventListener('uploadfileliststart', (evt) =>
      this.stateService.send('UPLOAD_FILE_LIST_START', evt)
    )
    wrapper.addEventListener('uploadfilelistfinish', (evt) =>
      this.stateService.send('UPLOAD_FILE_LIST_FINISH', evt)
    )
    wrapper.addEventListener('uploadfilelisterror', (evt) =>
      this.stateService.send('UPLOAD_FILE_LIST_ERROR', evt)
    )
    wrapper.addEventListener('uploadsitestart', (evt) =>
      this.stateService.send('UPLOAD_SITE_START', evt)
    )
    wrapper.addEventListener('uploadsitemetadatastart', (evt) =>
      this.stateService.send('UPLOAD_SITE_METADATA_START', evt)
    )
    wrapper.addEventListener('uploadsitefinish', (evt) =>
      this.stateService.send('UPLOAD_SITE_FINISH', evt)
    )
    wrapper.addEventListener('uploadsiteerror', (evt) =>
      this.stateService.send('UPLOAD_SITE_ERROR', evt)
    )
  }

  renderInitial() {
    window.dropzone.addEventListener('drag', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    window.dropzone.addEventListener('dragstart', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    window.dropzone.addEventListener('dragend', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    window.dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    window.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    window.dropzone.addEventListener('dragenter', (e) => {
      if (!window.dropzone.contains(e.relatedTarget)) {
        window.dropzone.querySelector('sl-animation').setAttribute('play', true)
      }
    })
    window.dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.stateService.send('FILE_INPUT_CHANGE', { fileList: e.dataTransfer.files })
    })
    window.fileInput.addEventListener('change', (e) => {
      this.stateService.send('FILE_INPUT_CHANGE', { fileList: e.target.files })
    })
  }

  renderFileInformation({ fileMap }) {
    const template = document.querySelector('#uploadProgressScreen')
    const section = template.content.cloneNode(true)
    section.querySelector('.continue-btn').addEventListener('click', () => {
      this.stateService.send('CONTINUE')
    })
    this.appRoot.replaceChildren(section)
    this.appRoot.classList.add('app-content-2-col')

    fileMap.forEach((value) => {
      this.renderFile(value)
      this.renderFileDetail(value)

      if (value.error) {
        this.renderFileError(value)
      } else if (value.url) {
        this.renderFileSuccess(value)
      } else if (value.isUploading) {
        this.renderFileStart(value)
      }
    })
  }

  renderFile({ name, size, file }) {
    const template = document.querySelector('#fileListItem')
    const listItem = template.content.cloneNode(true)
    listItem
      .querySelector('[data-file-name]')
      .setAttribute('data-file-name', file.name)
    listItem.querySelector('.name').innerText = file.name
    listItem.querySelector('.size').setAttribute('value', size || file.size)
    listItem.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      this.stateService.send('REMOVE_FILE', { file })
    })
    this.appRoot.querySelector('.file-list').appendChild(listItem)
  }

  renderFileDetail({ name, description, file }) {
    const template = document.querySelector('#fileDetailItem')
    const detail = template.content.cloneNode(true)
    const textarea = detail.querySelector('textarea')
    detail
      .querySelector('[data-file-name]')
      .setAttribute('data-file-name', file.name)
    detail.querySelector('.name').innerText = name || file.name
    detail.querySelector('.name-input').setAttribute('value', name || file.name)
    textarea.innerText = description || ''
    textarea.addEventListener('change', (e) => {
      this.stateService.send('UPDATE_FILE_DESCRIPTION', {
        file,
        description: e.target.value,
      })
    })
    detail.querySelector('.edit-btn').addEventListener('click', (e) => {
      const parent = e.target.closest('[data-file-name]')
      const header = parent.querySelector('.file-detail-header')
      const form = parent.querySelector('.name-form')
      header.classList.add('hidden')
      form.classList.remove('hidden')
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        this.stateService.send('UPDATE_FILE_NAME', {
          file,
          name: form.querySelector('input').value,
        })
        header.classList.remove('hidden')
        form.classList.add('hidden')
      })
    })
    this.appRoot.querySelector('.file-detail-list').appendChild(detail)
  }

  renderFileStart({ file }) {
    const listItem = this.appRoot.querySelector(
      `.file-list [data-file-name="${file.name}"]`
    )
    listItem.querySelector('.status').innerHTML =
      '<sl-spinner class="icon"></sl-spinner>'
  }

  renderFileError({ file }) {
    const listItem = this.appRoot.querySelector(
      `.file-list [data-file-name="${file.name}"]`
    )
    listItem.querySelector('.file-info').setAttribute('aria-disabled', true)
    listItem.querySelector('.status').innerHTML =
      '<sl-icon class="icon danger" src="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/assets/icons/exclamation-circle-fill.svg"></sl-icon>'
  }

  renderFileSuccess({ file }) {
    const listItem = this.appRoot.querySelector(
      `.file-list [data-file-name="${file.name}"]`
    )
    listItem.querySelector('.status').innerHTML =
      '<sl-icon class="icon success" src="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/assets/icons/check-circle-fill.svg"></sl-icon>'
    listItem.querySelector('.file-info').addEventListener('click', (e) => {
      const item = this.appRoot.querySelector(
        `.file-detail-list [data-file-name="${file.name}"]`
      )
      item.scrollIntoView({ behavior: 'smooth' })
      item.classList.add('selected')
      window.setTimeout(() => {
        item.classList.remove('selected')
      }, 1000)
    })
  }

  renderDeletedFile({ file }) {
    const items = this.appRoot.querySelectorAll(
      `[data-file-name="${file.name}"]`
    )
    Array.from(items).forEach((item) => {
      item.classList.add('hidden')
    })
  }

  renderFileNames({ name, file }) {
    const item = this.appRoot.querySelector(
      `.file-detail-list [data-file-name="${file.name}"] .name`
    )
    item.innerText = name
  }

  renderIncompleteWarning() {
    this.appRoot.classList.remove('app-content-2-col')
    const template = document.querySelector('#incompleteWarningScreen')
    const section = template.content.cloneNode(true)
    section.querySelector('.back-btn').addEventListener('click', () => {
      this.stateService.send('BACK')
    })
    section.querySelector('.continue-btn').addEventListener('click', () => {
      this.stateService.send('CONTINUE')
    })
    this.appRoot.replaceChildren(section)
  }

  renderCreatingSite() {
    this.appRoot.classList.remove('app-content-2-col')
    const template = document.querySelector('#creatingSiteScreen')
    const section = template.content.cloneNode(true)
    this.appRoot.replaceChildren(section)
  }

  renderCreatingSiteStatusMessage({ message }) {
    this.appRoot.querySelector('.site-status').innerText = message
  }

  renderCreatingSiteError({ error }) {
    const template = document.querySelector('#creatingSiteErrorScreen')
    const section = template.content.cloneNode(true)
    const errorElem = section.querySelector('.error-message')
    errorElem.innerText = error.message
    section.querySelector('.back-btn').addEventListener('click', () => {
      this.stateService.send('BACK')
    })
    section.querySelector('.retry-btn').addEventListener('click', () => {
      this.stateService.send('RETRY')
    })
    this.appRoot.replaceChildren(section)
  }

  renderDone({ url, gatewayUrl }) {
    const template = document.querySelector('#createSiteDoneScreen')
    const section = template.content.cloneNode(true)
    const link = section.querySelector('.site-url')
    link.href = gatewayUrl || url
    link.innerText = url
    section.querySelector('.restart-btn').addEventListener('click', () => {
      // TODO reset state instead of refreshing page
      window.location.reload()
      // this.stateService.send('RESTART')
    })
    this.appRoot.replaceChildren(section)
  }

  renderNoValidFiles() {
    const dropzone = this.appRoot.querySelector('#dropzone')
    dropzone.classList.add('has-error')
    dropzone.querySelector('.error-message').classList.remove('hidden')
  }

  renderErrorMessage({ error }) {
    const errorElem = this.appRoot.querySelector('.error-message')

    if (errorElem) {
      errorElem.innerText = error.message
    }
  }

  uploadFiles({ fileMap }) {
    console.debug('upload files:', fileMap)
    const fileList = Array.from(fileMap.values()).map(({ file }) => file)
    this.wrapperService.uploadFiles(fileList)
  }

  uploadSite({ fileMap }) {
    console.debug('upload site:', fileMap)
    this.wrapperService.uploadWrappedArchives(fileMap)
  }
}
