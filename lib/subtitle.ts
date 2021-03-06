import fs from 'fs'
import { map, resync, parse, stringify, Node } from 'subtitle'
import { Stream, Transform } from 'stream'
import { rm } from './fs'
import { f } from './filename'
import { exec } from './process'

export function srtStream(stream: Stream) {
  return stream
    .pipe(resync(-250))
    .pipe(srtStartZero())
    .pipe(fillSubtitleGap(250))
}

export function srtStartZero() {
  return map(node => {
    if (node.type === 'cue' && node.data.start < 0) {
      node.data.start = 0
    }
    return node
  })
}

export function fillSubtitleGap(threshold: number) {
  return mapWithPrev((node, prev) => {
    if (node.type === 'cue' &&
        prev?.type === 'cue' &&
        node.data.start - prev?.data?.end < threshold
    ) {
      node.data.start = prev.data.end
    }
    return node
  })
}

export function mapWithPrev(mapper: (node: Node, prev: Node, index: number) => any) {
  let index = 0
  let prev: Node
  return new Transform({
    objectMode: true,
    autoDestroy: false,
    transform(chunk: Node, _encoding, callback) {
      callback(null, mapper(chunk, prev, index++))
      prev = chunk
    },
  })
}

export interface HandleSubtitleHandleOptions {
  input: string
  output: string
  done: () => void
}

export interface ModifySubtitleOptions {
  assOutputFile?: string
  writeAss?: boolean
}

export async function handleSubtitle(
  assFile: string,
  handle: (options: HandleSubtitleHandleOptions) => void,
  options: ModifySubtitleOptions = {}
) {
  const {
    assOutputFile = undefined,
    writeAss = true,
  } = options

  const assFileF = f(assFile).nameDeAppend('-original')
  const assInputPath = `dist-ass/${assFile}`
  const assOutputPath = `dist-ass/${assOutputFile || assFile}`
  const srtInputPath = `dist-ass/${assFileF.clone().nameAppend('_in').ext('srt')}`
  const srtOutputPath = `dist-ass/${assFileF.clone().nameAppend('_out').ext('srt')}`

  if (!fs.existsSync(assInputPath)) return

  rm(srtInputPath)
  rm(srtOutputPath)

  await exec(`ffmpeg -i ${assInputPath} -c:s text ${srtInputPath}`)

  await new Promise<void>(resolve => {
    handle({
      input: srtInputPath,
      output: srtOutputPath,
      done: resolve,
    })
  })

  if (writeAss) {
    rm(assOutputPath)

    await exec(`ffmpeg -i ${srtOutputPath} ${assOutputPath}`)
  }

  rm(srtInputPath)
  rm(srtOutputPath)

  if (writeAss) {
    updateASSMetadata(assOutputPath, `../dist/${assFileF.clone().ext('mp4')}`)
  }
}

export async function modifySubtitle(
  assFile: string,
  handle: (stream: Stream) => Stream = stream => stream,
  options: ModifySubtitleOptions = {}
) {
  await handleSubtitle(assFile, ({ input, output, done }) => {
    handle(
      fs.createReadStream(input)
        .pipe(parse())
    )
        .pipe(stringify({ format: 'SRT' }))
        .pipe(fs.createWriteStream(output))
        .on('finish', done)
  }, options)
}

export function updateASSMetadata(assPath: string, videoPath: string): void {
  let content = fs.readFileSync(assPath, { encoding: 'utf-8' })

  const ass_header = `[Script Info]
; Script generated by Aegisub 3.2.2
; http://www.aegisub.org/
WrapStyle: 0
ScaledBorderAndShadow: yes
ScriptType: v4.00+
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[Aegisub Project Garbage]
Last Style Storage: Default
Audio File: ${videoPath}
Video File: ${videoPath}
Video AR Mode: 4
Video AR Value: 1.777778
Video Zoom Percent: 0.500000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans TC Bold,64,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,1.2,0,1,1.1,1.2,2,10,10,64,1`

  content = content.replace(/^[\s\S]+(?=\r?\n\r?\n\[Events\])/, ass_header)

  fs.writeFileSync(assPath, content, { encoding: 'utf-8' })
}
