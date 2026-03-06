interface SearchBarProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
}

export default function SearchBar({ value, onChange, placeholder = 'Search sessions…' }: SearchBarProps) {
    return (
        <div className="search-wrapper">
            <span className="search-icon" aria-hidden>⌕</span>
            <input
                id="session-search"
                type="search"
                className="search-input"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
            />
        </div>
    )
}
