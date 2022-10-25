/**
 * App UI state
 */
import { createMachine, interpret, assign } from 'https://unpkg.com/xstate@4.33.6/dist/xstate.web.js'

// Context stored in app state
const initialContext = {
  /**
   * File[]
   */
  files: [],
  /**
   * { [file.name]: boolean }
   */
  errored: {},
  /**
   * { [file.name]: boolean }
   */
  done: {},
}

export class App {
  appRoot = null
  stateService = null
  states = {
    default: {
      entry: () => this.renderInitial(),
      on: { UPLOAD_START: 'uploading' },
    },
    uploading: {
      entry: () => this.renderUploading(),
      on: {
        FILE_UPLOAD_START: {
          actions: [
            assign({ files: (ctx, { file }) => ([ ...ctx.files, file ])}),
            (ctx, evt) => {
              this.renderFile(evt)
              this.renderFileStart(evt)
            }
          ]
        },
        FILE_UPLOAD_ERROR: {
          actions: [
            assign({ errored: (ctx, { file }) => ({ ...ctx.errored, [file.name]: true })}),
            (ctx, evt) => this.renderFileError(evt)
          ]
        },
        FILE_UPLOAD_SUCCESS: {
          actions: [
            assign({ done: (ctx, { file }) => ({ ...ctx.done, [file.name]: true })}),
            (ctx, evt) => this.renderFileSuccess(evt)
          ]
        },
        UPLOAD_INCOMPLETE: {
          target: 'uploadIncomplete',
          actions: [
            (ctx, evt) => this.renderErrorMessage(evt),
            () => this.enableContinueBtn()
          ],
        },
        UPLOAD_COMPLETE: {
          target: 'uploadComplete',
          actions: () => this.enableContinueBtn(),
        },
      },
    },
    uploadIncomplete: {
      on: {
        CONTINUE: 'warnIncomplete',
      },
    },
    uploadComplete: {
      on: {
        CONTINUE: 'creatingSite',
      },
    },
    warnIncomplete: {
      entry: () => this.renderIncompleteWarning(),
      on: {
        BACK: {
          target: 'uploadIncomplete',
          actions: [
            () => this.renderUploading(),
            () => this.enableContinueBtn(),
            (ctx) => {
              ctx.files.forEach(file => {
                this.renderFile({ file })
                
                if (ctx.done[file.name]) {
                  this.renderFileSuccess({ file })
                } else if (ctx.errored[file.name]) {
                  this.renderFileError({ file })
                }
              })
            }
          ],
        },
        CONTINUE: 'creatingSite',
      },
    },
    creatingSite: {
      entry: () => this.renderCreatingSite(),
      on: { CREATE_SITE_COMPLETE: 'done' },
    },
    done: {
      entry: (ctx, evt) => this.renderDone(evt),
      on: {
        RESTART: {
          target: 'default',
          actions: assign(initialContext),
        },
      },
    },
  }

  constructor({ wrapper }) {
    this.appRoot = document.getElementById('appRoot')
    this.stateService = interpret(createMachine({
      initial: 'default',
      predictableActionArguments: true,
      preserveActionOrder: true,
      context: initialContext,
      states: this.states,
    }))
      .onTransition((state) => console.debug(state.value))
      .start()

    wrapper.addEventListener('uploadfilestart', (evt) => this.stateService.send('FILE_UPLOAD_START', evt))
    wrapper.addEventListener('uploadfilefinish', (evt) => this.stateService.send('FILE_UPLOAD_SUCCESS', evt))
    wrapper.addEventListener('uploadfileerror', (evt) => this.stateService.send('FILE_UPLOAD_ERROR', evt))
    wrapper.addEventListener('uploadstart', (evt) => this.stateService.send('UPLOAD_START'))
    wrapper.addEventListener('uploadfinish', (evt) => this.stateService.send('UPLOAD_COMPLETE'))
    wrapper.addEventListener('uploaderror', (evt) => {
      console.debug(evt.error)
      this.stateService.send('UPLOAD_INCOMPLETE', { error: evt.error.message })
    })

    // window.setTimeout(() => {
    //   this.stateService.send('UPLOAD_START')
    //   const files = [new File([], 'temp 1'), new File([], 'temp 2'), new File([], 'temp 3')]
    //   this.stateService.send('FILE_UPLOAD_START', { file: files[0] })
    //   this.stateService.send('FILE_UPLOAD_START', { file: files[1] })
    //   this.stateService.send('FILE_UPLOAD_START', { file: files[2]})

    //   window.setTimeout(() => {
    //     this.stateService.send('FILE_UPLOAD_SUCCESS', { file: files[0] })
    //     // this.stateService.send('FILE_UPLOAD_SUCCESS', { file: files[1] })
    //     this.stateService.send('FILE_UPLOAD_SUCCESS', { file: files[2] })
    //     // this.stateService.send('UPLOAD_COMPLETE')
    //     this.stateService.send('FILE_UPLOAD_ERROR', { file: files[1] })
    //     this.stateService.send('UPLOAD_INCOMPLETE', { error: 'test' })
    //   }, 500)
      
    // }, 100)
  }

  renderInitial() {
    console.debug('TODO renderInitial')
  }

  renderUploading() {
    const template = document.querySelector('#uploadProgressScreen')
    const section = template.content.cloneNode(true)
    this.appRoot.replaceChildren(section)
    this.appRoot.classList.remove('app-content-2-col')
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
      errorElem.innerText = error
    }
  }

  enableContinueBtn() {
    const btn = this.appRoot.querySelector('.continue-btn')
    btn.addEventListener('click', () => {
      this.stateService.send('CONTINUE')
    })
    btn.removeAttribute('disabled')
  }
}