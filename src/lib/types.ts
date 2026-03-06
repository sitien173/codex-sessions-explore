// ============================================================
// Raw JSONL Event Types
// ============================================================

/** Line 1 of every session file */
export interface SessionMetaEvent {
    type: 'session_meta'
    payload: {
        id: string
        timestamp: string        // ISO 8601
        cwd: string
        originator?: string
        cli_version: string
        source?: string
        model_provider: string
        base_instructions?: { text: string }
        git?: {
            commit_hash?: string
            branch?: string
            repository_url?: string
        }
    }
}

/** User or assistant messages in the conversation */
export interface EventMsg {
    type: 'event_msg'
    payload: {
        type:
        | 'user_message'
        | 'agent_message'
        | 'agent_reasoning'
        | 'token_count'
        | string
        message?: string   // present for user_message and agent_message
        text?: string      // present for agent_reasoning
        images?: unknown[]
        local_images?: unknown[]
        // token_count fields
        info?: unknown
        rate_limits?: unknown
    }
}

/** OpenAI-style response items stored alongside agent turns */
export interface ResponseItem {
    type: 'response_item'
    payload: {
        type: 'message' | 'reasoning' | 'function_call' | 'function_call_output' | string
        role?: 'user' | 'assistant' | 'developer' | string
        content?: Array<{ type: string; text?: string }>
        name?: string        // function name for function_call
        arguments?: string   // JSON string for function_call
        output?: string      // result for function_call_output
        call_id?: string
        summary?: Array<{ type: string; text?: string }>  // for reasoning
    }
}

/** Context snapshot at the start of each agent turn */
export interface TurnContext {
    type: 'turn_context'
    payload: {
        cwd: string
        approval_policy?: string
        sandbox_policy?: unknown
        collaboration_mode?: string
        model?: string
        effort?: string
    }
}

/** Union of all known JSONL line types */
export type RawEvent = SessionMetaEvent | EventMsg | ResponseItem | TurnContext | { type: string; payload?: unknown }

// ============================================================
// Index / Derived Types
// ============================================================

/** One entry in public/sessions.json */
export interface SessionEntry {
    /** UUID extracted from the JSONL filename — always unique per file */
    id: string
    /** Original session_meta.payload.id — may be shared by continuation sessions */
    session_meta_id: string
    title: string           // text of the first user_message
    project: string         // basename of cwd
    cwd: string
    model: string           // model_provider
    cli_version: string
    git_branch: string
    git_repo: string
    created_at: string      // ISO 8601 (from session_meta.payload.timestamp)
    file: string            // relative path from workspace root, e.g. "2026/03/06/rollout-….jsonl"
    file_size_bytes: number
}

/** One entry in public/search_index.json */
export interface SearchEntry {
    session_id: string
    text: string            // first user message text (used for MiniSearch)
}
