import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { SessionEntry, RawEvent } from '../lib/types'
import EventTimeline from '../components/EventTimeline'
import TableOfContents from '../components/TableOfContents'
import type { TocEntry } from '../components/TableOfContents'


function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function formatDateShort(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
    })
}

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Route JSONL fetches through the Vite dev server middleware (handles any absolute path) */
function sessionFileUrl(filePath: string): string {
    return `/_sessions/${encodeURIComponent(filePath)}`
}

/** Copy text to clipboard, returns true on success */
async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Fallback for non-HTTPS contexts
        const el = document.createElement('textarea')
        el.value = text
        el.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(el)
        el.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(el)
        return ok
    }
}

export default function SessionViewer() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const [session, setSession] = useState<SessionEntry | null>(null)
    const [siblings, setSiblings] = useState<SessionEntry[]>([])
    const [events, setEvents] = useState<RawEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [tocEntries, setTocEntries] = useState<TocEntry[]>([])

    const handleCopyResume = useCallback(async () => {
        if (!session) return
        const cmd = `codex resume ${session.session_meta_id} --yolo`
        const ok = await copyToClipboard(cmd)
        if (ok) {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [session])

    useEffect(() => {
        if (!id) return
        let cancelled = false

        // Reset before loading new session (handles navigation between sessions)
        setSession(null)
        setSiblings([])
        setEvents([])
        setError(null)
        setLoading(true)

        async function load() {
            try {
                const sessionsRes = await fetch('/sessions.json')
                if (!sessionsRes.ok) throw new Error('Failed to load sessions index')
                const sessions: SessionEntry[] = await sessionsRes.json()
                const meta = sessions.find(s => s.id === id)
                if (!meta) throw new Error(`Session ${id} not found in index`)
                if (cancelled) return
                setSession(meta)

                // Continuation sessions: same session_meta_id, different file UUID
                const related = sessions
                    .filter(s => s.session_meta_id === meta.session_meta_id && s.id !== meta.id)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                setSiblings(related)

                // Fetch JSONL via the /_sessions/ dev server middleware
                const fileRes = await fetch(sessionFileUrl(meta.file))
                if (!fileRes.ok) throw new Error(`Failed to load JSONL (${fileRes.status}): ${meta.file}`)

                const text = await fileRes.text()
                if (cancelled) return

                const parsed: RawEvent[] = text
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        try { return JSON.parse(line) as RawEvent }
                        catch { return null }
                    })
                    .filter((e): e is RawEvent => e !== null)

                setEvents(parsed)
            } catch (e) {
                if (!cancelled) setError((e as Error).message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [id])

    return (
        <div className="viewer-shell">
            {/* Topbar */}
            <header className="topbar">
                <a className="topbar__logo" href="/" aria-label="Codex Session Explorer home">
                    <div className="topbar__logo-icon" aria-hidden>⬡</div>
                    Codex Sessions
                </a>
                <div className="topbar__spacer" />
                {session && (
                    <span className="topbar__count" style={{ fontFamily: 'var(--font-mono)' }}>
                        {events.length} events
                    </span>
                )}
            </header>

            {/* Session Header */}
            <div className="viewer-header">
                <div className="viewer-header__nav">
                    <button className="back-btn" onClick={() => navigate(-1)} aria-label="Go back">
                        ← Back
                    </button>
                    {session && (
                        <button
                            id="copy-resume-btn"
                            className={`copy-resume-btn ${copied ? 'copy-resume-btn--copied' : ''}`}
                            onClick={handleCopyResume}
                            title={`Copy: codex resume ${session.session_meta_id} --yolo`}
                            aria-label="Copy codex resume command"
                        >
                            {copied ? '✓ Copied!' : '⎘ codex resume --yolo'}
                        </button>
                    )}
                </div>

                {loading && !session && (
                    <div className="skeleton-card" style={{ height: 80 }}>
                        <div className="skeleton-line skeleton-line--med" />
                        <div className="skeleton-line skeleton-line--short" style={{ marginTop: 12 }} />
                    </div>
                )}

                {session && (
                    <>
                        <p className="viewer-header__title">{session.title}</p>
                        <div className="viewer-header__meta">
                            <span className="chip chip--model">⬡ {session.model}</span>
                            {session.git_branch && (
                                <span className="chip chip--branch">⎇  {session.git_branch}</span>
                            )}
                            <span className="chip chip--cli">v{session.cli_version}</span>
                            <span className="chip chip--size">{formatBytes(session.file_size_bytes)}</span>
                            <span className="chip chip--size">{formatDate(session.created_at)}</span>
                            <span
                                className="chip chip--size"
                                style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}
                            >
                                {session.project}
                            </span>
                        </div>

                        {/* Continuation sessions banner */}
                        {siblings.length > 0 && (
                            <div className="continuations">
                                <span className="continuations__label">
                                    ⟳ {siblings.length} continuation{siblings.length > 1 ? 's' : ''}:
                                </span>
                                {siblings.map(s => (
                                    <a
                                        key={s.id}
                                        href={`/session/${s.id}`}
                                        className="continuations__chip"
                                        title={`${formatDate(s.created_at)} · ${formatBytes(s.file_size_bytes)}`}
                                    >
                                        {formatDateShort(s.created_at)} · {formatBytes(s.file_size_bytes)}
                                    </a>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Two-column body: TOC sidebar + Event Timeline */}
            <div className="viewer-body">
                {/* TOC sidebar — only show when events are loaded */}
                {!loading && !error && (
                    <TableOfContents entries={tocEntries} />
                )}

                {/* Main content */}
                <div className="viewer-main">
                    {error && (
                        <div className="empty-state">
                            <div className="empty-state__icon">⚠</div>
                            <p className="empty-state__title">Failed to load session</p>
                            <p className="empty-state__body">{error}</p>
                        </div>
                    )}

                    {loading && !error && (
                        <div className="timeline">
                            {Array.from({ length: 5 }, (_, i) => (
                                <div key={i} className="timeline-event" style={{ marginBottom: 20 }}>
                                    <div style={{ width: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div className="skeleton-line" style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 14 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton-card skeleton-line" style={{ height: 80, borderRadius: 10 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && !error && (
                        <EventTimeline
                            events={events}
                            onTocEntries={setTocEntries}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
