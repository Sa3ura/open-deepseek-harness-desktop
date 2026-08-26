import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const desktopRoot = fileURLToPath(new URL('..', import.meta.url))

describe('packaged desktop CLI inputs', () => {
  it('ships only dsh and keeps silent installation opt-in', async () => {
    const cliDirectory = fileURLToPath(new URL('../build/cli-bin/', import.meta.url))
    await expect(access(`${cliDirectory}dsh.cmd`)).resolves.toBeUndefined()
    await expect(access(`${cliDirectory}manage-path.ps1`)).resolves.toBeUndefined()
    await expect(access(`${cliDirectory}npm.cmd`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(`${cliDirectory}pnpm.cmd`)).rejects.toMatchObject({ code: 'ENOENT' })

    const installer = await readFile(`${desktopRoot}/build/installer.nsh`, 'utf8')
    expect(installer).toContain('StrCpy $CliPathRequested "0"')
    expect(installer).toContain('${GetOptions} $0 "/ADDCLI=" $1')
    expect(installer).toContain('${If} $1 == "1"')
    expect(installer).toContain('!macro customHeader')
    expect(installer).toContain('Page custom CliPathPageCreate CliPathPageLeave')
    expect(installer).not.toContain('dangerouslyAllowAllBuilds')
  })

  it('packages the launcher as ESM on Windows and macOS', async () => {
    for (const config of ['electron-builder.yml', 'electron-builder.macos.yml']) {
      const source = await readFile(`${desktopRoot}/${config}`, 'utf8')
      expect(source).toContain('from: lib/desktop-cli-launcher.js')
      expect(source).toContain('to: cli/desktop-cli.mjs')
    }
  })
})
