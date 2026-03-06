import { useMemo } from 'react'
import type { SessionEntry } from '../lib/types'

interface FilterBarProps {
    sessions: SessionEntry[]
    onProjectChange: (value: string) => void
    onSortChange: (value: 'date' | 'size') => void
    currentSort: 'date' | 'size'
    currentProject: string
}

export default function FilterBar({
    sessions,
    onProjectChange,
    onSortChange,
    currentSort,
    currentProject,
}: FilterBarProps) {
    const projects = useMemo(() => {
        const set = new Set(sessions.map(s => s.project))
        return Array.from(set).sort()
    }, [sessions])

    return (
        <div className="filter-group">
            <select
                id="project-filter"
                className="filter-select"
                value={currentProject}
                onChange={e => onProjectChange(e.target.value)}
                aria-label="Filter by project"
            >
                <option value="">All projects</option>
                {projects.map(p => (
                    <option key={p} value={p}>{p}</option>
                ))}
            </select>

            <button
                id="sort-date"
                className={`sort-btn ${currentSort === 'date' ? 'active' : ''}`}
                onClick={() => onSortChange('date')}
            >
                ↓ Newest
            </button>
            <button
                id="sort-size"
                className={`sort-btn ${currentSort === 'size' ? 'active' : ''}`}
                onClick={() => onSortChange('size')}
            >
                ↓ Largest
            </button>
        </div>
    )
}
