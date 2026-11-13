import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function createZipBuffer(sourceDir: string): Buffer {
  interface ZipEntry {
    name: string
    data: Buffer
    mtime: Date
  }

  const entries: ZipEntry[] = []

  function walk(currentDir: string, relativePath = '') {
    const files = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const file of files) {
      const fullPath = path.join(currentDir, file.name)
      const relPath = relativePath ? `${relativePath}/${file.name}` : file.name
      if (file.isDirectory()) {
        walk(fullPath, relPath)
      } else if (file.isFile()) {
        const data = fs.readFileSync(fullPath)
        const stat = fs.statSync(fullPath)
        entries.push({ name: relPath.replace(/\\/g, '/'), data, mtime: stat.mtime })
      }
    }
  }

  walk(sourceDir)

  const localHeaders: Buffer[] = []
  const centralHeaders: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const compressedData = zlib.deflateRawSync(entry.data)
    const crc = zlib.crc32(entry.data)
    const uncompressedSize = entry.data.length
    const compressedSize = compressedData.length

    const mtime = entry.mtime || new Date()
    const dosTime =
      ((mtime.getHours() & 0x1f) << 11) |
      ((mtime.getMinutes() & 0x3f) << 5) |
      (Math.floor(mtime.getSeconds() / 2) & 0x1f)
    const dosDate =
      (((mtime.getFullYear() - 1980) & 0x7f) << 9) |
      (((mtime.getMonth() + 1) & 0x0f) << 5) |
      (mtime.getDate() & 0x1f)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressedSize, 18)
    localHeader.writeUInt32LE(uncompressedSize, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localHeaders.push(localHeader, nameBuf, compressedData)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressedSize, 20)
    centralHeader.writeUInt32LE(uncompressedSize, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralHeaders.push(centralHeader, nameBuf)

    offset += 30 + nameBuf.length + compressedSize
  }

  const centralDirOffset = offset
  const centralDirSize = centralHeaders.reduce((sum, b) => sum + b.length, 0)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirSize, 12)
  eocd.writeUInt32LE(centralDirOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd])
}

function zipDistPlugin(zipName = 'BookmarkDesk.zip'): Plugin {
  return {
    name: 'vite-plugin-zip-dist',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist')
      const targetZip = path.resolve(process.cwd(), zipName)

      if (!fs.existsSync(distDir)) return

      try {
        const zipBuffer = createZipBuffer(distDir)
        fs.writeFileSync(targetZip, zipBuffer)
        const sizeKb = (zipBuffer.length / 1024).toFixed(2)
        console.log(`\n\x1b[32m✓\x1b[0m 已自动生成扩展分发包: ${zipName} (${sizeKb} KB)`)
      } catch (error) {
        console.error('自动打包 zip 失败:', error)
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [vue(), UnoCSS(), zipDistPlugin()],
  build: { rollupOptions: { input: 'dashboard.html' } },
})
