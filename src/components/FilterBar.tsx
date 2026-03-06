import { useMemo } from 'react'
import type { SessionEntry } from '../lib/types'
import ProjectMultiSelect from './ProjectMultiSelect'

export interface DateRange {
    from: string   // YYYY-MM-DD
    to: string     // YYYY-MM-DD
}

interface FilterBarProps {
    sessions: SessionEntry[]
    selectedProjects: string[]
    onProjectsChange: (projects: string[]) => void
    currentModel: string
    onModelChange: (value: string) => void
    dateRange: DateRange
    onDateRangeChange: (range: DateRange) => void
    currentSort: 'date' | 'size'
    onSortChange: (value: 'date' | 'size') => void
    grouped: boolean
    onGroupedChange: (value: boolean) => void
    showEmpty: boolean
    onShowEmptyChange: (value: boolean) => void
}

export default function FilterBar({
    sessions,
    selectedProjects,
    onProjectsChange,
    currentModel,
    onModelChange,
    dateRange,
    onDateRangeChange,
    currentSort,
    onSortChange,
    grouped,
    onGroupedChange,
    showEmpty,
    onShowEmptyChange,
}: FilterBarProps) {
    const projects = useMemo(() => {
        const set = new Set(sessions.map(s => s.project))
        return Array.from(set).sort()
    }, [sessions])

    const models = useMemo(() => {
        const set = new Set(sessions.map(s => s.model).filter(Boolean))
        return Array.from(set).sort()
    }, [sessions])

    return (
        <div className="filter-group">
            {/* Project multi-select */}
            <ProjectMultiSelect
                projects={projects}
                selected={selectedProjects}
                onChange={onProjectsChange}
            />

            {/* Model filter */}
            <select
                id="model-filter"
                className="filter-select"
                value={currentModel}
                onChange={e => onModelChange(e.target.value)}
                aria-label="Filter by model"
            >
                <option value="">All models</option>
                {models.map(m => (
                    <option key={m} value={m}>{m}</option>
                ))}
            </select>

            {/* Date range */}
            <div className="filter-date-range" role="group" aria-label="Date range filter">
                <input
                    id="date-from"
                    type="date"
                    className="filter-date"
                    value={dateRange.from}
                    onChange={e => onDateRangeChange({ ...dateRange, from: e.target.value })}
                    aria-label="From date"
                />
                <span className="filter-date-sep">→</span>
                <input
                    id="date-to"
                    type="date"
                    className="filter-date"
                    value={dateRange.to}
                    onChange={e => onDateRangeChange({ ...dateRange, to: e.target.value })}
                    aria-label="To date"
                />
                {(dateRange.from || dateRange.to) && (
                    <button
                        className="filter-clear-btn"
                        onClick={() => onDateRangeChange({ from: '', to: '' })}
                        aria-label="Clear date range"
                        title="Clear date filter"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Sort controls */}
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

            {/* Grouping toggle */}
            <label className="filter-checkbox" htmlFor="group-by-project">
                <input
                    id="group-by-project"
                    type="checkbox"
                    checked={grouped}
                    onChange={e => onGroupedChange(e.target.checked)}
                />
                Group by project
            </label>

            {/* Empty sessions toggle */}
            <label className="filter-checkbox" htmlFor="show-empty-sessions">
                <input
                    id="show-empty-sessions"
                    type="checkbox"
                    checked={showEmpty}
                    onChange={e => onShowEmptyChange(e.target.checked)}
                />
                Show empty
            </label>
        </div>
    )
}
