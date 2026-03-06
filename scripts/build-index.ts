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
 *   npx tsx scripts/build-index.ts                      # looks in ./sessions
 *   npx tsx scripts/build-index.ts --sessions-dir /path  # custom path
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
    id: string
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

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
    const sessionsDir = resolveSessionsDir()
    console.log(`🔍 Scanning sessions from: ${sessionsDir}`)

    const files = findJsonlFiles(sessionsDir)
    console.log(`📂 Found ${files.length} JSONL session files`)

    if (files.length === 0) {
        console.error('❌ No JSONL files found.')
        console.error('   Expected directory structure: YYYY/MM/DD/rollout-*.jsonl')
        console.error('   Place sessions in ./sessions/ or pass --sessions-dir <path>')
        process.exit(1)
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
                console.warn(`⚠️  No session_meta found: ${path.relative(ROOT, filePath)}`)
                errors++
                continue
            }

            const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/')
            const cwdBasename = path.basename(meta.cwd)
            const stat = fs.statSync(filePath)

            const entry: SessionEntry = {
                id: meta.id,
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
            searchIndex.push({ session_id: meta.id, text: entry.title })
        }

        process.stdout.write(`  ✓ Processed ${Math.min(i + BATCH_SIZE, files.length)}/${files.length}\r`)
    }

    console.log('')  // newline after progress

    // Sort sessions newest first
    sessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Write outputs
    fs.mkdirSync(PUBLIC_DIR, { recursive: true })
    fs.writeFileSync(path.join(PUBLIC_DIR, 'sessions.json'), JSON.stringify(sessions, null, 2))
    fs.writeFileSync(path.join(PUBLIC_DIR, 'search_index.json'), JSON.stringify(searchIndex, null, 2))

    console.log(`✅ Written public/sessions.json (${sessions.length} sessions)`)
    console.log(`✅ Written public/search_index.json (${searchIndex.length} entries)`)
    if (errors) console.warn(`⚠️  ${errors} files had issues (skipped)`)
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
