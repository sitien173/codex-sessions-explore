import MiniSearch from 'minisearch'
import type { SearchEntry } from './types'

let miniSearch: MiniSearch<SearchEntry> | null = null
let loadedSessionIds: Set<string> = new Set()

export async function initSearch(entries: SearchEntry[]): Promise<void> {
    miniSearch = new MiniSearch<SearchEntry>({
        fields: ['text'],
        storeFields: ['session_id', 'text'],
        idField: 'session_id',
        searchOptions: {
            boost: { text: 1 },
            fuzzy: 0.2,
            prefix: true,
        },
    })
    miniSearch.addAll(entries)
    loadedSessionIds = new Set(entries.map(e => e.session_id))
}

/** Returns matching session IDs (all if query is empty) */
export function search(query: string): Set<string> | null {
    if (!miniSearch) return null
    if (!query.trim()) return null   // null means "show all"
    const results = miniSearch.search(query)
    return new Set(results.map(r => r.session_id as string))
}

export function isSearchReady(): boolean {
    return miniSearch !== null && loadedSessionIds.size > 0
}
