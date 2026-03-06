import { useState, useEffect, useRef } from 'react'

export interface TocEntry {
    index: number      // sequential user-message count (1-based)
    eventIndex: number // position in rendered events array
    text: string       // user message content
    anchor: string     // id to scroll to
}

interface TableOfContentsProps {
    entries: TocEntry[]
}

export default function TableOfContents({ entries }: TableOfContentsProps) {
    const [active, setActive] = useState<string | null>(null)
    const [open, setOpen] = useState(true)
    const observerRef = useRef<IntersectionObserver | null>(null)

    // Track which user-message anchor is currently in view
    useEffect(() => {
        if (entries.length === 0) return

        observerRef.current?.disconnect()

        const candidates = entries.map(e => document.getElementById(e.anchor)).filter(Boolean) as HTMLElement[]
        if (candidates.length === 0) return

        // Use IntersectionObserver to light up the active heading
        observerRef.current = new IntersectionObserver(
            (records) => {
                for (const rec of records) {
                    if (rec.isIntersecting) {
                        setActive(rec.target.id)
                        break
                    }
                }
            },
            { rootMargin: '-10% 0px -75% 0px', threshold: 0 }
        )

        candidates.forEach(el => observerRef.current!.observe(el))
        return () => observerRef.current?.disconnect()
    }, [entries])

    if (entries.length === 0) return null

    function scrollTo(anchor: string) {
        const el = document.getElementById(anchor)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            setActive(anchor)
        }
    }

    return (
        <nav className={`toc ${open ? '' : 'toc--collapsed'}`} aria-label="Table of contents">
            <div className="toc__header">
                <span className="toc__title">
                    ☰ {entries.length} message{entries.length !== 1 ? 's' : ''}
                </span>
                <button
                    className="toc__toggle"
                    onClick={() => setOpen(o => !o)}
                    aria-label={open ? 'Collapse table of contents' : 'Expand table of contents'}
                    title={open ? 'Collapse' : 'Expand'}
                >
                    {open ? '‹' : '›'}
                </button>
            </div>

            {open && (
                <ol className="toc__list" role="list">
                    {entries.map(entry => (
                        <li key={entry.anchor}>
                            <button
                                className={`toc__item ${active === entry.anchor ? 'toc__item--active' : ''}`}
                                onClick={() => scrollTo(entry.anchor)}
                                title={entry.text}
                            >
                                <span className="toc__num">{entry.index}</span>
                                <span className="toc__text">{entry.text}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            )}
        </nav>
    )
}
