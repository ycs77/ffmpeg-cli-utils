import spawn from 'cross-spawn'

export function exec(command: string) {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      const parts = command.split(' ')
      const proc = spawn(parts[0], parts.splice(1), {
        stdio: process.argv.includes('--log-spawn') ? 'inherit' : 'ignore',
      })

      proc.on('close', () => {
        resolve()
      })
    }, 100)
  })
}
