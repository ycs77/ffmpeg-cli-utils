import fs from 'fs'
import { spawn } from 'child_process'
import colors from 'colors'
import Bottleneck from 'bottleneck'
import progressbar from './progressbar'
import { SingleBar } from 'cli-progress'
import { createTimer } from './timer'
import { formatTotalTime1 } from './output'
import { debug, LogPrinter } from './debug'

export type VideoBatchExec = (cmd: string) => Promise<void>
export type VideoBatchHandle = (options: VideoBatchHandleOptions) => Promise<void>

export interface VideoBatchHandleOptions {
  file: string
  bar: SingleBar
  exec: VideoBatchExec
  log: LogPrinter
}

export interface VideoBatchOptions {
  handle: VideoBatchHandle
  maxConcurrent?: number
  onStart?: () => void
  onStop?: () => void
}

export const file_ext = (filename: string, ext: string) => filename.replace('.mp4', ext)

export function video_batch(options: VideoBatchOptions) {
  const {
    handle,
    maxConcurrent = 8,
    onStart,
    onStop,
  } = options

  const isDebug = process.argv.includes('--debug')
  const isLog = process.argv.includes('--log')

  const log = debug('log', isLog)
  const bar = progressbar({ isLogMode: isLog })
  const timer = createTimer()
  const limiter = new Bottleneck({ maxConcurrent })

  fs.readdir('dist', async (err, files) => {

    if (onStart) onStart()

    const video_filter_pattern = process.argv[2] || '.*'
    const videos = files.filter(file => new RegExp(`^${video_filter_pattern}\\\.mp4$`).test(file))

    log('dist files', files)
    log('video_filter_pattern', `^${video_filter_pattern}\\\.mp4$`)

    const exec: VideoBatchExec = cmd => new Promise<void>(resolve => {
      const proc = spawn(
        cmd.split(' ')[0],
        cmd.split(' ').splice(1)
      )

      if (isDebug) {
        proc.stderr.setEncoding('utf8')
        proc.stderr.on('data', err => {
          console.log('')
          console.error(err)
        })
      }

      proc.on('close', () => {
        resolve()
      })
    })

    bar.start(videos.length, 0, { speed: 'N/A' })
    timer.start()

    await Promise.all(
      videos.map(file => limiter.schedule(() => new Promise<void>(async resolve => {
        await handle({ file, bar, exec, log })

        bar.increment()

        resolve()
      })))
    )

    timer.stop()
    bar.stop()

    if (onStop) onStop()

    console.log(colors.green('Successfully'))
    formatTotalTime1(timer.seconds, '執行時間：')

  })
}
