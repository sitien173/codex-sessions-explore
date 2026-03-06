import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { SessionEntry, RawEvent } from '../lib/types'
import EventTimeline from '../components/EventTimeline'

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SessionViewer() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const [session, setSession] = useState<SessionEntry | null>(null)
    const [events, setEvents] = useState<RawEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!id) return

        let cancelled = false

        async function load() {
            try {
                // Load session metadata first
                const sessionsRes = await fetch('/sessions.json')
                if (!sessionsRes.ok) throw new Error('Failed to load sessions index')
                const sessions: SessionEntry[] = await sessionsRes.json()
                const meta = sessions.find(s => s.id === id)
                if (!meta) throw new Error(`Session ${id} not found in index`)
                if (cancelled) return
                setSession(meta)

                // Fetch and stream-parse the JSONL file
                const fileRes = await fetch(`/${meta.file}`)
                if (!fileRes.ok) throw new Error(`Failed to load JSONL file: ${fileRes.status}`)

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
                            <span className="chip chip--branch">⎇  {session.git_branch || 'no branch'}</span>
                            <span className="chip chip--cli">v{session.cli_version}</span>
                            <span className="chip chip--size">{formatBytes(session.file_size_bytes)}</span>
                            <span className="chip chip--size">{formatDate(session.created_at)}</span>
                            <span className="chip chip--size" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>
                                {session.project}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Event Timeline */}
            <div style={{ overflowY: 'auto' }}>
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

                {!loading && !error && <EventTimeline events={events} />}
            </div>
        </div>
    )
}
