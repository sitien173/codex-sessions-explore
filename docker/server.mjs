/**
 * docker/server.mjs
 *
 * Production HTTP server that:
 *  1. Serves the built SPA from /app/dist (with proper SPA fallback)
 *  2. Serves /_sessions/<url-encoded-absolute-path> for JSONL files
 *     (replicates the Vite dev middleware for production)
 *  3. Serves /sessions.json and /search_index.json from /app/data
 *     (written by the indexer container via shared volume)
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import { lookup as mimeLookup } from 'mime-types'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const DIST_DIR = path.resolve('/app/dist')
const DATA_DIR = path.resolve('/app/data')   // shared volume with indexer

function send(res, status, contentType, body) {
    res.writeHead(status, { 'Content-Type': contentType })
    res.end(body)
}

function serveFile(res, filePath, extraHeaders = {}) {
    try {
        if (!fs.existsSync(filePath)) return false
        const stat = fs.statSync(filePath)
        const mime = mimeLookup(filePath) || 'application/octet-stream'
        res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': stat.size,
            'Last-Modified': stat.mtime.toUTCString(),
            ...extraHeaders,
        })
        createReadStream(filePath).pipe(res)
        return true
    } catch {
        return false
    }
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`)

    // ── /_sessions/<encoded-absolute-path> ─────────────────────────────────
    if (url.pathname.startsWith('/_sessions/')) {
        const encoded = url.pathname.slice('/_sessions/'.length)
        const decoded = decodeURIComponent(encoded)
        const filePath = path.normalize(decoded)

        if (!filePath.endsWith('.jsonl')) {
            send(res, 403, 'text/plain', 'Only .jsonl files are allowed')
            return
        }
        const served = serveFile(res, filePath, { 'Cache-Control': 'no-cache' })
        if (!served) send(res, 404, 'text/plain', `Not found: ${filePath}`)
        return
    }

    // ── /sessions.json and /search_index.json from shared data volume ───────
    if (url.pathname === '/sessions.json' || url.pathname === '/search_index.json') {
        const filePath = path.join(DATA_DIR, url.pathname)
        const served = serveFile(res, filePath, { 'Cache-Control': 'no-store' })
        if (!served) send(res, 404, 'text/plain', 'Index not ready yet – run build-index first')
        return
    }

    // ── Static SPA files ────────────────────────────────────────────────────
    let filePath = path.join(DIST_DIR, url.pathname)

    // Prevent path traversal
    if (!filePath.startsWith(DIST_DIR)) {
        send(res, 403, 'text/plain', 'Forbidden')
        return
    }

    // Try file, then index.html for SPA fallback
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html')
    }

    const cacheControl = filePath.endsWith('index.html')
        ? 'no-store'
        : 'public, max-age=31536000, immutable'    // assets have content-hash in name

    const served = serveFile(res, filePath, { 'Cache-Control': cacheControl })
    if (!served) send(res, 404, 'text/plain', 'Not found')
})

server.listen(PORT, () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`)
    console.log(`   SPA:       ${DIST_DIR}`)
    console.log(`   Data:      ${DATA_DIR}`)
    console.log(`   Sessions:  /_sessions/<encoded-path>`)
})
