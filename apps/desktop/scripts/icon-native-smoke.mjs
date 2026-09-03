/** Run with Electron after the desktop build; no browser driver or user Profile is used. */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, nativeImage, Tray } from 'electron'
import { DesktopIconManager } from '../lib/desktop-icons.js'
import { decodeIconImage, encodeIconIco, loadDefaultApplicationIcon, renderIconPresentation } from '../lib/icon-image.js'

const directory = mkdtempSync(join(tmpdir(), 'dsh-native-icons-'))
app.setPath('userData', directory)
async function run() {
  let window
  let tray
  try {
    await app.whenReady()
    const defaultApplication = loadDefaultApplicationIcon('darwin')
    assert.equal(defaultApplication.isEmpty(), false)
    const defaultSize = defaultApplication.getSize()
    const defaultBitmap = defaultApplication.toBitmap()
    const alphaAt = (x, y) => defaultBitmap[(y * defaultSize.width + x) * 4 + 3]
    const center = Math.floor(defaultSize.width / 2)
    assert.equal(alphaAt(center, 0), 0)
    assert.equal(alphaAt(center, Math.floor(defaultSize.height * 0.05)), 0)
    // The shipped artwork includes slightly translucent pixels inside its background.
    assert.ok(alphaAt(center, Math.floor(defaultSize.height * 0.15)) >= 250)
    assert.equal(alphaAt(Math.floor(defaultSize.width * 0.1), Math.floor(defaultSize.height * 0.1)), 0)
    const windowArtwork = nativeImage.createFromPath(new URL('../lib/icon.png', import.meta.url).pathname)
    assert.deepEqual(loadDefaultApplicationIcon('win32').toBitmap(), windowArtwork.toBitmap())
    for (const packaged of [false, true]) {
      const defaults = {
        directory: join(directory, `defaults-${packaged}`), platform: 'darwin', packaged,
        defaultApplication: loadDefaultApplicationIcon('darwin'), defaultTray: windowArtwork,
        apply() { return [] }, notify() {},
      }
      const manager = new DesktopIconManager(defaults)
      assert.deepEqual(manager.images().application.toBitmap(), defaultBitmap)
      assert.equal(manager.status().application, defaultApplication.resize({ width: 64, height: 64 }).toDataURL())
      const selection = manager.selectBytes(1, windowArtwork.toPNG())
      manager.apply(1, selection.id, 'application', { x: 0, y: 0, size: 512 })
      manager.reset('application')
      assert.deepEqual(manager.images().application.toBitmap(), defaultBitmap)
      assert.equal(manager.images().trayTemplate, true)
      assert.deepEqual(new DesktopIconManager(defaults).images().application.toBitmap(), defaultBitmap)
    }
    // Native codec receives a real transparent PNG and a real JPEG, not header doubles.
    const rgba = Buffer.alloc(80 * 60 * 4)
    for (let i = 0; i < rgba.length; i += 4) { rgba[i + 2] = 255; rgba[i + 3] = i < 80 * 4 ? 0 : 255 }
    const image = nativeImage.createFromBitmap(rgba, { width: 80, height: 60 })
    const decoded = decodeIconImage(image.toPNG())
    assert.equal(decoded.toBitmap()[3], 0)
    const jpeg = image.toJPEG(90)
    const exif = Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000', 'hex')
    const app1 = Buffer.alloc(4); app1.writeUInt16BE(0xffe1); app1.writeUInt16BE(exif.length + 2, 2)
    const rotated = decodeIconImage(Buffer.concat([jpeg.subarray(0, 2), app1, exif, jpeg.subarray(2)]))
    assert.deepEqual(rotated.getSize(), { width: 60, height: 80 })
    const solid = nativeImage.createFromBitmap(Buffer.alloc(512 * 512 * 4, 255), { width: 512, height: 512 })
    for (const platform of ['darwin', 'win32']) {
      const rounded = renderIconPresentation(solid, platform, 'application')
      const bitmap = rounded.toBitmap()
      const inset = platform === 'darwin' ? 50 : 16
      const alpha = (x, y) => bitmap[(y * 512 + x) * 4 + 3]
      assert.equal(alpha(256, inset - 1), 0)
      assert.equal(alpha(256, inset), 255)
      assert.equal(alpha(inset, inset), 0)
      assert.equal(alpha(256, 256), 255)
      const frames = encodeIconIco(rounded)
      for (let index = 0; index < 7; index++) {
        const offset = frames.readUInt32LE(6 + index * 16 + 12)
        const length = frames.readUInt32LE(6 + index * 16 + 8)
        const frame = nativeImage.createFromBuffer(frames.subarray(offset, offset + length))
        assert.equal(frame.toBitmap()[3], 0)
      }
      if (process.env.DSH_ICON_SMOKE_PREVIEW !== undefined) {
        const artwork = nativeImage.createFromPath(new URL('../src/icon.png', import.meta.url).pathname)
        writeFileSync(join(process.env.DSH_ICON_SMOKE_PREVIEW, `icon-${platform}.png`), renderIconPresentation(artwork, platform, 'application').toPNG())
      }
    }
    const translucent = nativeImage.createFromBitmap(Buffer.alloc(512 * 512 * 4, 128), { width: 512, height: 512 })
    const softened = renderIconPresentation(translucent, 'darwin', 'application')
    assert.equal(softened.toBitmap()[(256 * 512 + 256) * 4 + 3], 128)
    const ico = encodeIconIco(decoded)
    assert.equal(ico.readUInt16LE(4), 7)
    for (let index = 0; index < 7; index++) {
      const offset = ico.readUInt32LE(6 + index * 16 + 12)
      const length = ico.readUInt32LE(6 + index * 16 + 8)
      assert.equal(nativeImage.createFromBuffer(ico.subarray(offset, offset + length)).isEmpty(), false)
    }
    const options = {
      directory: join(directory, 'icons'), platform: process.platform, packaged: false,
      defaultApplication: loadDefaultApplicationIcon(process.platform), defaultTray: image,
      notify() {},
      apply(images) {
        window.setIcon(images.application)
        if (process.platform === 'darwin') app.dock.setIcon(images.application)
        const trayImage = images.tray.resize({ width: 22, height: 22 })
        trayImage.setTemplateImage(images.trayTemplate)
        tray.setImage(trayImage)
        return [{ surface: 'application', status: 'applied' }, { surface: 'tray', status: 'applied' }]
      },
    }
    const manager = new DesktopIconManager(options)
    window = new BrowserWindow({ show: false, icon: manager.images().application })
    tray = new Tray(image.resize({ width: 22, height: 22 }))
    const selection = manager.selectBytes(window.webContents.id, image.toPNG())
    const status = manager.apply(window.webContents.id, selection.id, 'application', { x: 0, y: 0, size: 60 })
    assert.equal(status.applicationCustom, true)
    const state = readFileSync(join(options.directory, 'state.json'), 'utf8')
    assert.equal(state.includes(directory), false)
    assert.equal(new DesktopIconManager(options).status().application, status.application)
    assert.deepEqual(new DesktopIconManager(options).images().application.toBitmap(), manager.images().application.toBitmap())
    manager.reset('application')
    assert.equal(new DesktopIconManager(options).status().applicationCustom, false)
    assert.deepEqual(manager.images().application.toBitmap(), options.defaultApplication.toBitmap())
    console.log('PASS: real default macOS artwork has padding/corners; packaged and development startup, preview, reset and restart preserve it without repeated insetting')
    console.log('PASS: native padding, rounded corners in seven ICO sizes, preserved alpha, JPEG EXIF orientation, Dock/window + tray apply/reset, persistence without repeated insetting')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    tray?.destroy()
    window?.destroy()
    rmSync(directory, { recursive: true, force: true })
    app.exit(process.exitCode ?? 0)
  }
}
void run()
