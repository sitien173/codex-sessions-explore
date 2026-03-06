import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        {
            // Custom plugin: serve JSONL files from any absolute path on disk
            // Routes: GET /_sessions/<url-encoded-absolute-path>
            name: 'jsonl-file-server',
            configureServer(server) {
                server.middlewares.use('/_sessions', (req, res) => {
                    // req.url is the path after /_sessions, e.g. /Y%3A%2F.codex%2Fsessions%2F...
                    const encoded = req.url ?? ''
                    // Strip leading slash, then decode
                    const decoded = decodeURIComponent(encoded.replace(/^\//, ''))

                    // Security: only allow .jsonl files
                    if (!decoded.endsWith('.jsonl')) {
                        res.statusCode = 403
                        res.end('Only .jsonl files are allowed')
                        return
                    }

                    // Normalize path separators
                    const filePath = path.normalize(decoded)

                    try {
                        if (!fs.existsSync(filePath)) {
                            res.statusCode = 404
                            res.end(`File not found: ${filePath}`)
                            return
                        }
                        const stat = fs.statSync(filePath)
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                        res.setHeader('Content-Length', stat.size)
                        res.setHeader('Cache-Control', 'no-cache')
                        fs.createReadStream(filePath).pipe(res)
                    } catch (err) {
                        res.statusCode = 500
                        res.end(`Error reading file: ${err}`)
                    }
                })
            },
        },
    ],
    publicDir: 'public',
    server: {
        fs: {
            allow: ['.'],
        },
    },
})
