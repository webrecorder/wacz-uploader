/**
 * App UI state
 */
import { createMachine, interpret, assign } from 'https://unpkg.com/xstate@4.33.6/dist/xstate.web.js'

// Context stored in app state
const initialContext = {
  /**
   * Files being uploaded
   * @type File[]
   */
  fileList: [],
  /**
   * @type { [file.name]: boolean }
   */
  fileRejected: {},
  /**
   * @type { [file.name]: boolean }
   */
  fileUploaded: {},
  /**
   * Files to wrap into website and upload
   * @type (Map | null)
   */
  filesToWrap: null,
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
      on: {
        UPLOAD_FILE_LIST_START: {
          target: 'uploadingFileList',
          actions: assign({ fileList: (ctx, { fileList }) => fileList}),
        }
      },
    },
    uploadingFileList: {
      id: 'uploadingFileList',
      entry: (ctx) => this.renderUploading(ctx),
      states: {
        uploadIncomplete: {
          entry: () => this.enableContinueBtn(),
          on: {
            CONTINUE: '#incompleteFileListUpload',
          },
        },
        uploadComplete: {
          entry: () => this.enableContinueBtn(),
          on: {
            CONTINUE: {
              target: '#creatingSite',
              actions: (ctx) => this.uploadSite(ctx),
            },
          },
        },
      },
      on: {
        FILE_UPLOAD_START: {
          actions: (ctx, evt) => this.renderFileStart(evt)
        },
        FILE_UPLOAD_ERROR: {
          actions: [
            assign({ fileRejected: (ctx, { file }) => ({ ...ctx.fileRejected, [file.name]: true })}),
            (ctx, evt) => this.renderFileError(evt)
          ]
        },
        FILE_UPLOAD_SUCCESS: {
          actions: [
            assign({ fileUploaded: (ctx, { file }) => ({ ...ctx.fileUploaded, [file.name]: true })}),
            (ctx, evt) => this.renderFileSuccess(evt)
          ]
        },
        UPLOAD_FILE_LIST_ERROR: {
          actions: (ctx, evt) => this.renderErrorMessage(evt),
        },
        UPLOAD_FILE_LIST_FINISH: [{
          target: '.uploadIncomplete',
          cond: (ctx, evt) => evt.rejected,
        }, {
          target: '.uploadComplete',
          cond: (ctx, evt) => !evt.rejected,
          actions: assign({ filesToWrap: (ctx, { completed }) => completed }),
        }],
      },
    },
    incompleteFileListUpload: {
      id: 'incompleteFileListUpload',
      entry: () => this.renderIncompleteWarning(),
      on: {
        BACK: {
          target: 'uploadingFileList.uploadIncomplete',
        },
        CONTINUE: {
          target: 'creatingSite',
          actions: (ctx) => this.uploadSite(ctx),
        },
      },
    },
    creatingSite: {
      id: 'creatingSite',
      entry: () => this.renderCreatingSite(),
      states: {
        error: {
          entry: (ctx, evt) => this.renderCreatingSiteError(evt),
          on: {
            BACK: '#uploadingFileList.uploadComplete',
          }
        }
      },
      on: {
        UPLOAD_SITE_START: {
          actions: () => console.debug('TODO handle UPLOAD_SITE_START'),
        },
        UPLOAD_SITE_ERROR: '.error',
        UPLOAD_SITE_FINISH: 'done'
      },
    },
    done: {
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
    this.stateService = interpret(createMachine({
      initial: 'initial',
      predictableActionArguments: true,
      context: initialContext,
      states: this.states,
    }))
      .onTransition((state) => console.debug(state.value))
      .start()
    this.wrapperService = {
      uploadWrappedArchives: (...args) => wrapper.uploadWrappedArchives(...args),
    }

    wrapper.addEventListener('uploadfilestart', (evt) => this.stateService.send('FILE_UPLOAD_START', evt))
    wrapper.addEventListener('uploadfilefinish', (evt) => this.stateService.send('FILE_UPLOAD_SUCCESS', evt))
    wrapper.addEventListener('uploadfileerror', (evt) => this.stateService.send('FILE_UPLOAD_ERROR', evt))
    wrapper.addEventListener('uploadfileliststart', (evt) => this.stateService.send('UPLOAD_FILE_LIST_START', evt))
    wrapper.addEventListener('uploadfilelistfinish', (evt) => this.stateService.send('UPLOAD_FILE_LIST_FINISH', evt))
    wrapper.addEventListener('uploadfilelisterror', (evt) => this.stateService.send('UPLOAD_FILE_LIST_ERROR', evt))
    wrapper.addEventListener('uploadsitestart', (evt) => this.stateService.send('UPLOAD_SITE_START', evt))
    wrapper.addEventListener('uploadsitefinish', (evt) => this.stateService.send('UPLOAD_SITE_FINISH', evt))
    wrapper.addEventListener('uploadsiteerror', (evt) => this.stateService.send('UPLOAD_SITE_ERROR', evt))
  }

  renderInitial() {
    console.debug('TODO renderInitial')
  }

  renderUploading({ fileList, fileRejected, fileUploaded }) {
    const template = document.querySelector('#uploadProgressScreen')
    const section = template.content.cloneNode(true)
    this.appRoot.replaceChildren(section)
    this.appRoot.classList.remove('app-content-2-col')

    fileList.forEach(file => {
      this.renderFile({ file })

      if (fileUploaded[file.name]) {
        this.renderFileSuccess({ file })
      } else if (fileRejected[file.name]) {
        this.renderFileError({ file })
      }
    })
  }

  renderFile({ file }) {
    const template = document.querySelector('#fileListItem')
    const listItem = template.content.cloneNode(true)
    listItem.querySelector('li').setAttribute('data-name', file.name)
    listItem.querySelector('.name').innerText = file.name
    listItem.querySelector('.size').setAttribute('value', file.size)
    this.appRoot.querySelector('.file-list').appendChild(listItem)
  }

  renderFileStart({ file }) {
    const listItem = this.appRoot.querySelector(`.file-list-item[data-name="${file.name}"]`)
    listItem.querySelector('.status').innerHTML = '<sl-spinner class="icon"></sl-spinner>'    
  }

  renderFileError({ file }) {
    const listItem = this.appRoot.querySelector(`.file-list-item[data-name="${file.name}"]`)
    listItem.querySelector('.status').innerHTML = '<i class="icon danger"></i>'
  }

  renderFileSuccess({ file }) {
    const listItem = this.appRoot.querySelector(`.file-list-item[data-name="${file.name}"]`)
    listItem.querySelector('.status').innerHTML = '<i class="icon success"></i>'
  }

  renderIncompleteWarning() {
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
    const template = document.querySelector('#creatingSiteScreen')
    const section = template.content.cloneNode(true)
    this.appRoot.replaceChildren(section)
  }

  renderCreatingSiteError({ error }) {
    const template = document.querySelector('#creatingSiteErrorScreen')
    const section = template.content.cloneNode(true)
    const errorElem = section.querySelector('.error-message')
    errorElem.innerText = error.message
    section.querySelector('.back-btn').addEventListener('click', () => {
      this.stateService.send('BACK')
    })
    this.appRoot.replaceChildren(section)
  }

  renderDone({ url }) {
    const template = document.querySelector('#createSiteDoneScreen')
    const section = template.content.cloneNode(true)
    section.querySelector('.site-url').innerText = url
    section.querySelector('.restart-btn').addEventListener('click', () => {
      // TODO reset state instead of refreshing page
      window.location.reload()
      // this.stateService.send('RESTART')
    })
    this.appRoot.replaceChildren(section)
  }

  renderErrorMessage({ error }) {
    const errorElem = this.appRoot.querySelector('.error-message')

    if (errorElem) {
      errorElem.innerText = error.message
    }
  }

  enableContinueBtn() {
    const btn = this.appRoot.querySelector('.continue-btn')
    btn.addEventListener('click', () => {
      this.stateService.send('CONTINUE')
    })
    btn.removeAttribute('disabled')
  }

  uploadSite({ filesToWrap }) {
    this.wrapperService.uploadWrappedArchives(filesToWrap)
  }
}