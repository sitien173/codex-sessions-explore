import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionEntry, SearchEntry } from '../lib/types'
import { initSearch, search as searchSessions } from '../lib/search'
import SessionCard from '../components/SessionCard'
import SearchBar from '../components/SearchBar'
import FilterBar from '../components/FilterBar'

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

export default function SessionExplorer() {
    const navigate = useNavigate()

    const [sessions, setSessions] = useState<SessionEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchReady, setSearchReady] = useState(false)

    const [query, setQuery] = useState('')
    const [project, setProject] = useState('')
    const [sort, setSort] = useState<SortKey>('date')

    // Load sessions + search index in parallel on mount
    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                const [sessionsRes, searchRes] = await Promise.all([
                    fetch('/sessions.json'),
                    fetch('/search_index.json'),
                ])

                if (!sessionsRes.ok) throw new Error(`Failed to load sessions: ${sessionsRes.status}`)
                if (!searchRes.ok) throw new Error(`Failed to load search index: ${searchRes.status}`)

                const sessionsData: SessionEntry[] = await sessionsRes.json()
                const searchData: SearchEntry[] = await searchRes.json()

                if (cancelled) return

                setSessions(sessionsData)
                await initSearch(searchData)
                setSearchReady(true)
            } catch (e) {
                if (!cancelled) setError((e as Error).message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [])

    const matchIds = useMemo(() => {
        if (!searchReady) return null
        return searchSessions(query)
    }, [query, searchReady])

    const filtered = useMemo(() => {
        let list = sessions

        // Search filter
        if (matchIds !== null) {
            list = list.filter(s => matchIds.has(s.id))
        }

        // Project filter
        if (project) {
            list = list.filter(s => s.project === project)
        }

        // Sort
        if (sort === 'date') {
            list = [...list].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
        } else {
            list = [...list].sort((a, b) => b.file_size_bytes - a.file_size_bytes)
        }

        return list
    }, [sessions, matchIds, project, sort])

    const handleOpen = useCallback((id: string) => {
        navigate(`/session/${id}`)
    }, [navigate])

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
                        onProjectChange={setProject}
                        onSortChange={setSort}
                        currentSort={sort}
                        currentProject={project}
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
                            {(query || project) && (
                                <span> &mdash; {query && <span>"{query}"</span>}{query && project && ', '}{project && <span>project: {project}</span>}</span>
                            )}
                        </div>
                        <div className="session-grid">
                            {filtered.map((session, idx) => (
                                <div
                                    key={session.id}
                                    style={{ animationDelay: `${Math.min(idx, 20) * 30}ms` }}
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
                                        onClick={() => handleOpen(session.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}
