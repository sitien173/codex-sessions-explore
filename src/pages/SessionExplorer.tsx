import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionEntry, SearchEntry } from '../lib/types'
import { initSearch, search as searchSessions } from '../lib/search'
import SessionCard from '../components/SessionCard'
import SearchBar from '../components/SearchBar'
import FilterBar from '../components/FilterBar'
import type { DateRange } from '../components/FilterBar'

type SortKey = 'date' | 'size'

function SkeletonGrid() {
    return (
        <div className="skeleton-grid" aria-label="Loading sessions…">
            {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="skeleton-card">
                    <div className="skeleton-line skeleton-line--short" style={{ marginBottom: 16 }} />
                    <div className="skeleton-line skeleton-line--long" />
                    <div className="skeleton-line skeleton-line--med" />
                </div>
            ))}
        </div>
    )
}

interface SessionCardGridProps {
    sessions: SessionEntry[]
    startIdx: number
    onOpen: (id: string) => void
}

function SessionCardGrid({ sessions, startIdx, onOpen }: SessionCardGridProps) {
    return (
        <div className="session-grid">
            {sessions.map((session, i) => (
                <div
                    key={session.id}
                    style={{ animationDelay: `${Math.min(startIdx + i, 20) * 30}ms` }}
                >
                    <SessionCard
                        id={session.id}
                        title={session.title}
                        project={session.project}
                        model={session.model}
                        cli_version={session.cli_version}
                        git_branch={session.git_branch}
                        created_at={session.created_at}
                        file_size_bytes={session.file_size_bytes}
                        onClick={() => onOpen(session.id)}
                    />
                </div>
            ))}
        </div>
    )
}

export default function SessionExplorer() {
    const navigate = useNavigate()

    const [sessions, setSessions] = useState<SessionEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchReady, setSearchReady] = useState(false)

    const [query, setQuery] = useState('')
    const [selectedProjects, setSelectedProjects] = useState<string[]>([])
    const [model, setModel] = useState('')
    const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
    const [sort, setSort] = useState<SortKey>('date')
    const [grouped, setGrouped] = useState(true)   // group by project by default
    const [showEmpty, setShowEmpty] = useState(false) // hide sessions with no user message by default

    // Load sessions + search index in parallel on mount
    useEffect(() => {
        let cancelled = false
        let lastModified = ''

        async function load(silent = false) {
            try {
                const [sessionsRes, searchRes] = await Promise.all([
                    fetch('/sessions.json'),
                    fetch('/search_index.json'),
                ])

                if (!sessionsRes.ok) throw new Error(`Failed to load sessions: ${sessionsRes.status}`)
                if (!searchRes.ok) throw new Error(`Failed to load search index: ${searchRes.status}`)

                // Track Last-Modified for polling
                lastModified = sessionsRes.headers.get('Last-Modified') ?? ''

                const sessionsData: SessionEntry[] = await sessionsRes.json()
                const searchData: SearchEntry[] = await searchRes.json()

                if (cancelled) return

                setSessions(sessionsData)
                await initSearch(searchData)
                setSearchReady(true)
                if (!silent) setLoading(false)
            } catch (e) {
                if (!cancelled && !silent) {
                    setError((e as Error).message)
                    setLoading(false)
                }
            }
        }

        load()

        // Poll every 10 s for new sessions (when build-index --watch is running)
        const pollId = setInterval(async () => {
            if (cancelled) return
            try {
                const res = await fetch('/sessions.json', { method: 'HEAD' })
                const lm = res.headers.get('Last-Modified') ?? ''
                if (lm && lm !== lastModified) {
                    console.log('[SessionExplorer] sessions.json changed – reloading…')
                    await load(true)
                }
            } catch { /* network hiccup, ignore */ }
        }, 10_000)

        return () => {
            cancelled = true
            clearInterval(pollId)
        }
    }, [])

    const matchIds = useMemo(() => {
        if (!searchReady) return null
        return searchSessions(query)
    }, [query, searchReady])

    const filtered = useMemo(() => {
        let list = sessions

        // Hide sessions that have no user message (empty sessions)
        if (!showEmpty) {
            list = list.filter(s => s.title !== '(no user message)')
        }

        // Full-text search
        if (matchIds !== null) {
            list = list.filter(s => matchIds.has(s.id))
        }

        // Project filter (multi)
        if (selectedProjects.length > 0) {
            list = list.filter(s => selectedProjects.includes(s.project))
        }

        // Model filter
        if (model) {
            list = list.filter(s => s.model === model)
        }

        // Date range filter
        if (dateRange.from) {
            const from = new Date(dateRange.from).getTime()
            list = list.filter(s => new Date(s.created_at).getTime() >= from)
        }
        if (dateRange.to) {
            const to = new Date(dateRange.to).getTime() + 86_400_000
            list = list.filter(s => new Date(s.created_at).getTime() <= to)
        }

        // Sort within each group (or overall)
        const sortFn = sort === 'date'
            ? (a: SessionEntry, b: SessionEntry) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            : (a: SessionEntry, b: SessionEntry) =>
                b.file_size_bytes - a.file_size_bytes

        return [...list].sort(sortFn)
    }, [sessions, matchIds, selectedProjects, model, dateRange, sort, showEmpty])

    /** When grouped: Map<projectName, SessionEntry[]> ordered by most-recent session */
    const groups = useMemo(() => {
        if (!grouped) return null
        const map = new Map<string, SessionEntry[]>()
        for (const s of filtered) {
            const bucket = map.get(s.project) ?? []
            bucket.push(s)
            map.set(s.project, bucket)
        }
        // Sort groups by the date of their most-recent session
        return Array.from(map.entries()).sort(
            ([, a], [, b]) =>
                new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime()
        )
    }, [filtered, grouped])

    const handleOpen = useCallback((id: string) => {
        navigate(`/session/${id}`)
    }, [navigate])

    const hasFilters = query || selectedProjects.length > 0 || model || dateRange.from || dateRange.to

    return (
        <div className="app-shell">
            <header className="topbar">
                <a className="topbar__logo" href="/" aria-label="Codex Session Explorer home">
                    <div className="topbar__logo-icon" aria-hidden>⬡</div>
                    Codex Sessions
                </a>
                <div className="topbar__spacer" />
                {!loading && (
                    <span className="topbar__count">
                        {filtered.length} / {sessions.length}
                    </span>
                )}
            </header>

            <main className="main-content">
                <div className="filter-bar">
                    <SearchBar value={query} onChange={setQuery} />
                    <FilterBar
                        sessions={sessions}
                        selectedProjects={selectedProjects}
                        onProjectsChange={setSelectedProjects}
                        currentModel={model}
                        onModelChange={setModel}
                        dateRange={dateRange}
                        onDateRangeChange={setDateRange}
                        currentSort={sort}
                        onSortChange={setSort}
                        grouped={grouped}
                        onGroupedChange={setGrouped}
                        showEmpty={showEmpty}
                        onShowEmptyChange={setShowEmpty}
                    />
                </div>

                {loading && <SkeletonGrid />}

                {error && (
                    <div className="empty-state">
                        <div className="empty-state__icon">⚠</div>
                        <p className="empty-state__title">Couldn't load sessions</p>
                        <p className="empty-state__body">{error}</p>
                        <p className="empty-state__body" style={{ marginTop: 12, fontSize: '0.82rem' }}>
                            Run <code>npm run build-index</code> to generate the index files.
                        </p>
                    </div>
                )}

                {!loading && !error && filtered.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-state__icon">⊘</div>
                        <p className="empty-state__title">No sessions match</p>
                        <p className="empty-state__body">Try a different search or clear the filters.</p>
                    </div>
                )}

                {!loading && !error && filtered.length > 0 && (
                    <>
                        <div className="results-meta">
                            <strong>{filtered.length}</strong>
                            {filtered.length === 1 ? ' session' : ' sessions'}
                            {grouped && groups && (
                                <span className="results-meta__groups">
                                    {' '}across {groups.length} project{groups.length !== 1 ? 's' : ''}
                                </span>
                            )}
                            {hasFilters && (
                                <span>
                                    {query && <span> &mdash; &ldquo;{query}&rdquo;</span>}
                                    {selectedProjects.length > 0 && (
                                        <span> · {selectedProjects.map(p => p.split(/[/\\]/).pop()).join(', ')}</span>
                                    )}
                                    {model && <span> · {model}</span>}
                                    {(dateRange.from || dateRange.to) && (
                                        <span> · {dateRange.from || '…'} → {dateRange.to || '…'}</span>
                                    )}
                                </span>
                            )}
                        </div>

                        {/* ── Grouped view ── */}
                        {grouped && groups ? (
                            <div className="project-groups">
                                {groups.map(([projectName, projectSessions], groupIdx) => (
                                    <section
                                        key={projectName}
                                        className="project-group"
                                        aria-label={`Project: ${projectName}`}
                                    >
                                        <div className="project-group__header">
                                            <h2 className="project-group__name">{projectName}</h2>
                                            <span className="project-group__count">
                                                {projectSessions.length} session{projectSessions.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <SessionCardGrid
                                            sessions={projectSessions}
                                            startIdx={groupIdx * 3}
                                            onOpen={handleOpen}
                                        />
                                    </section>
                                ))}
                            </div>
                        ) : (
                            /* ── Flat view ── */
                            <SessionCardGrid
                                sessions={filtered}
                                startIdx={0}
                                onOpen={handleOpen}
                            />
                        )}
                    </>
                )}
            </main>
        </div>
    )
}
