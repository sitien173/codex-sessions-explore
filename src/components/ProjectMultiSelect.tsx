import { useState, useRef, useEffect, useCallback } from 'react'

interface ProjectMultiSelectProps {
    projects: string[]        // all available options
    selected: string[]        // currently selected
    onChange: (selected: string[]) => void
}

export default function ProjectMultiSelect({ projects, selected, onChange }: ProjectMultiSelectProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
                setSearch('')
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const filtered = search.trim()
        ? projects.filter(p => p.toLowerCase().includes(search.toLowerCase()))
        : projects

    const toggle = useCallback((project: string) => {
        onChange(
            selected.includes(project)
                ? selected.filter(p => p !== project)
                : [...selected, project]
        )
    }, [selected, onChange])

    const remove = useCallback((project: string, e: React.MouseEvent) => {
        e.stopPropagation()
        onChange(selected.filter(p => p !== project))
    }, [selected, onChange])

    const clearAll = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        onChange([])
        setSearch('')
    }, [onChange])

    function handleOpen() {
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 0)
    }

    const hasSelection = selected.length > 0

    return (
        <div
            ref={containerRef}
            className={`pms ${open ? 'pms--open' : ''}`}
            aria-label="Filter by project"
        >
            {/* Trigger / pill display */}
            <div
                className="pms__trigger"
                onClick={handleOpen}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleOpen() }}
            >
                {!hasSelection && (
                    <span className="pms__placeholder">All projects</span>
                )}
                {selected.map(p => (
                    <span key={p} className="pms__pill">
                        {p.split(/[/\\]/).pop()}
                        <button
                            className="pms__pill-remove"
                            onClick={e => remove(p, e)}
                            aria-label={`Remove ${p}`}
                            tabIndex={-1}
                        >
                            ✕
                        </button>
                    </span>
                ))}
                <span className="pms__arrow">{open ? '▴' : '▾'}</span>
                {hasSelection && (
                    <button
                        className="pms__clear"
                        onClick={clearAll}
                        aria-label="Clear project filter"
                        title="Clear all"
                        tabIndex={-1}
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {open && (
                <div className="pms__dropdown" role="listbox" aria-multiselectable="true">
                    <div className="pms__search-wrap">
                        <input
                            ref={inputRef}
                            className="pms__search"
                            type="text"
                            placeholder="Search projects…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setSearch('') } }}
                            aria-label="Search projects"
                        />
                    </div>

                    <div className="pms__options">
                        {filtered.length === 0 && (
                            <div className="pms__no-results">No projects match</div>
                        )}
                        {filtered.map(p => {
                            const isSelected = selected.includes(p)
                            return (
                                <button
                                    key={p}
                                    className={`pms__option ${isSelected ? 'pms__option--selected' : ''}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => toggle(p)}
                                    title={p}
                                >
                                    <span className="pms__check">{isSelected ? '✓' : ''}</span>
                                    <span className="pms__option-label">{p.split(/[/\\]/).pop()}</span>
                                    <span className="pms__option-full">{p}</span>
                                </button>
                            )
                        })}
                    </div>

                    {hasSelection && (
                        <div className="pms__footer">
                            <button className="pms__deselect-all" onClick={clearAll}>
                                Clear {selected.length} selected
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
