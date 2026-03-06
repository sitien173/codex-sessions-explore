#!/usr/bin/env node
/**
 * scripts/build-index.ts
 *
 * Streaming JSONL parser that:
 *  1. Discovers all *.jsonl files under SESSIONS_DIR (default: ./sessions)
 *     Falls back to scanning YYYY/MM/DD at workspace root for convenience.
 *  2. Streams each file line-by-line (readline) – stops after the first user_message
 *  3. Writes public/sessions.json and public/search_index.json
 *
 * Usage:
 *   npx tsx scripts/build-index.ts                       # looks in ./sessions
 *   npx tsx scripts/build-index.ts --sessions-dir /path  # custom path
 *   npx tsx scripts/build-index.ts --watch               # rebuild on new files
 */

import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionMetaPayload {
    id: string
    timestamp: string
    cwd: string
    cli_version: string
    model_provider: string
    git?: {
        branch?: string
        repository_url?: string
    }
}

interface SessionEntry {
    id: string           // UUID extracted from filename – always unique per file
    session_meta_id: string  // session_meta.payload.id – may be shared across continuations
    title: string
    project: string
    cwd: string
    model: string
    cli_version: string
    git_branch: string
    git_repo: string
    created_at: string
    file: string
    file_size_bytes: number
}

interface SearchEntry {
    session_id: string
    text: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(process.cwd())
const PUBLIC_DIR = path.join(ROOT, 'public')

/**
 * Extract the UUID from a rollout filename.
 * Pattern: rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl
 * The UUID is the last hyphen-separated group(s) before the extension.
 * e.g. rollout-2026-03-06T13-12-32-019cc1c6-b464-7c12-adc4-ac8ddaba8454.jsonl
 *   => 019cc1c6-b464-7c12-adc4-ac8ddaba8454
 */
function extractFileUuid(filePath: string): string {
    const base = path.basename(filePath, '.jsonl')
    // Match the last UUID-shaped segment: 8-4-4-4-12 hex chars
    const m = base.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
    if (m) return m[1]
    // Fallback: use the whole filename as an id
    return base
}

/** Resolve the sessions directory from CLI args or defaults */
function resolveSessionsDir(): string {
    const args = process.argv.slice(2)
    const flagIdx = args.indexOf('--sessions-dir')
    if (flagIdx !== -1 && args[flagIdx + 1]) {
        return path.resolve(args[flagIdx + 1])
    }
    // Default: ./sessions subfolder
    const sessionsDefault = path.join(ROOT, 'sessions')
    if (fs.existsSync(sessionsDefault)) {
        return sessionsDefault
    }
    // Fallback: scan workspace root directly for YYYY dirs
    return ROOT
}

/** Walk a base directory for YYYY/MM/DD/*.jsonl files */
function findJsonlFiles(baseDir: string): string[] {
    const results: string[] = []

    let yearDirEntries: fs.Dirent[]
    try {
        yearDirEntries = fs.readdirSync(baseDir, { withFileTypes: true })
    } catch {
        return results
    }

    const yearDirs = yearDirEntries
        .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
        .map(d => path.join(baseDir, d.name))

    for (const yearDir of yearDirs) {
        const monthDirs = fs.readdirSync(yearDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && /^\d{2}$/.test(d.name))
            .map(d => path.join(yearDir, d.name))

        for (const monthDir of monthDirs) {
            const dayDirs = fs.readdirSync(monthDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{2}$/.test(d.name))
                .map(d => path.join(monthDir, d.name))

            for (const dayDir of dayDirs) {
                try {
                    const files = fs.readdirSync(dayDir)
                        .filter(f => f.endsWith('.jsonl'))
                        .map(f => path.join(dayDir, f))
                    results.push(...files)
                } catch { /* skip unreadable dir */ }
            }
        }
    }

    return results
}

/** Parse a single JSONL file, stream until first user_message, return extracted data */
async function parseSessionFile(filePath: string): Promise<{ meta: SessionMetaPayload | null; title: string }> {
    return new Promise((resolve) => {
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' })
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

        let meta: SessionMetaPayload | null = null
        let title = ''
        let lineNum = 0
        let closed = false

        const close = () => {
            if (!closed) {
                closed = true
                rl.close()
                fileStream.destroy()
            }
        }

        rl.on('line', (line) => {
            lineNum++
            if (!line.trim()) return

            try {
                const event = JSON.parse(line) as { type: string; payload?: Record<string, unknown> }

                if (event.type === 'session_meta' && event.payload) {
                    meta = event.payload as unknown as SessionMetaPayload
                }

                if (
                    event.type === 'event_msg' &&
                    event.payload?.type === 'user_message' &&
                    typeof event.payload.message === 'string' &&
                    (event.payload.message as string).trim()
                ) {
                    title = (event.payload.message as string).trim()
                    close()
                    return
                }
            } catch {
                // Silently skip malformed lines
            }

            // Safety: stop after line 100 even if user_message not found
            if (lineNum >= 100 && !title) {
                close()
            }
        })

        rl.on('close', () => resolve({ meta, title }))
        rl.on('error', () => resolve({ meta, title }))
        fileStream.on('error', () => resolve({ meta, title }))
    })
}

// ── Core build logic ───────────────────────────────────────────────────────────

async function buildIndex(sessionsDir: string): Promise<void> {
    const label = `[${new Date().toLocaleTimeString()}]`
    console.log(`${label} 🔍 Scanning: ${sessionsDir}`)

    const files = findJsonlFiles(sessionsDir)
    if (files.length === 0) {
        console.warn(`${label} ⚠️  No JSONL files found – skipping write.`)
        return
    }

    const sessions: SessionEntry[] = []
    const searchIndex: SearchEntry[] = []
    let errors = 0

    // Process files concurrently in batches of 20
    const BATCH_SIZE = 20
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
            batch.map(async (filePath) => {
                const { meta, title } = await parseSessionFile(filePath)
                return { filePath, meta, title }
            })
        )

        for (const { filePath, meta, title } of results) {
            if (!meta) {
                errors++
                continue
            }

            const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/')
            const cwdBasename = path.basename(meta.cwd)
            const stat = fs.statSync(filePath)
            const fileUuid = extractFileUuid(filePath)

            const entry: SessionEntry = {
                id: fileUuid,
                session_meta_id: meta.id,
                title: title || '(no user message)',
                project: cwdBasename,
                cwd: meta.cwd,
                model: meta.model_provider,
                cli_version: meta.cli_version,
                git_branch: meta.git?.branch ?? '',
                git_repo: meta.git?.repository_url ?? '',
                created_at: meta.timestamp,
                file: relPath,
                file_size_bytes: stat.size,
            }

            sessions.push(entry)
            searchIndex.push({ session_id: fileUuid, text: entry.title })
        }

        process.stdout.write(`  ✓ ${Math.min(i + BATCH_SIZE, files.length)}/${files.length}\r`)
    }

    process.stdout.write('\n')

    // Sort sessions newest first
    sessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Write outputs atomically (write to temp, rename to avoid partial reads)
    fs.mkdirSync(PUBLIC_DIR, { recursive: true })

    const sessionsTmp = path.join(PUBLIC_DIR, 'sessions.json.tmp')
    const searchTmp = path.join(PUBLIC_DIR, 'search_index.json.tmp')

    fs.writeFileSync(sessionsTmp, JSON.stringify(sessions, null, 2))
    fs.writeFileSync(searchTmp, JSON.stringify(searchIndex, null, 2))

    fs.renameSync(sessionsTmp, path.join(PUBLIC_DIR, 'sessions.json'))
    fs.renameSync(searchTmp, path.join(PUBLIC_DIR, 'search_index.json'))

    console.log(`${label} ✅ ${sessions.length} sessions → public/sessions.json`)
    if (errors) console.warn(`${label} ⚠️  ${errors} files skipped (no session_meta)`)
}

// ── Watch mode ─────────────────────────────────────────────────────────────────

function watchMode(sessionsDir: string): void {
    console.log(`👁  Watching for new sessions in: ${sessionsDir}`)
    console.log(`    Press Ctrl+C to stop.\n`)

    // Debounce: avoid re-running for every line written mid-session
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    function scheduleRebuild(reason: string) {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
            console.log(`\n🔄 Change detected (${reason}) – rebuilding…`)
            try {
                await buildIndex(sessionsDir)
            } catch (err) {
                console.error('Error during rebuild:', err)
            }
        }, 1500)  // wait 1.5 s after last event before rebuilding
    }

    // Watch the entire sessions directory tree recursively
    // fs.watch with recursive:true works on Windows (uses ReadDirectoryChangesW)
    // and macOS (uses kqueue). On Linux, set up watchers per-directory instead.
    try {
        fs.watch(sessionsDir, { recursive: true }, (event, filename) => {
            if (filename && filename.endsWith('.jsonl')) {
                scheduleRebuild(`${event}: ${filename}`)
            }
        })
    } catch {
        // Fallback for Linux where recursive watch isn't supported
        console.warn('⚠️  Recursive watch not supported — watching top-level year dirs only.')
        const entries = fs.readdirSync(sessionsDir, { withFileTypes: true })
        const yearDirs = entries
            .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
            .map(d => path.join(sessionsDir, d.name))

        for (const dir of yearDirs) {
            fs.watch(dir, { recursive: true }, (event, filename) => {
                if (filename && filename.endsWith('.jsonl')) {
                    scheduleRebuild(`${event}: ${filename}`)
                }
            })
        }
    }
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2)
    const isWatch = args.includes('--watch')
    const sessionsDir = resolveSessionsDir()

    // Always do an initial build
    await buildIndex(sessionsDir)

    if (isWatch) {
        watchMode(sessionsDir)
        // Keep process alive
        process.stdin.resume()
    }
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
