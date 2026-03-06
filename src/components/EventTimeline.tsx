import { useState } from 'react'
import type { RawEvent, EventMsg, ResponseItem } from '../lib/types'

interface EventTimelineProps {
    events: RawEvent[]
}

function formatTimestamp(ts: string | undefined): string {
    if (!ts) return ''
    try {
        return new Date(ts).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
    } catch {
        return ''
    }
}

function ReasoningBlock({ text }: { text: string }) {
    const [open, setOpen] = useState(false)
    const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text
    return (
        <div>
            <button className="reasoning-toggle" onClick={() => setOpen(o => !o)}>
                {open ? '▾' : '▸'} Thinking: {preview}
            </button>
            {open && <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{text}</p>}
        </div>
    )
}

function FunctionCallBlock({ name, args }: { name: string; args: string }) {
    let pretty = args
    try { pretty = JSON.stringify(JSON.parse(args), null, 2) } catch { /* keep raw */ }
    return (
        <div>
            <div className="event-role event-role--tool" style={{ display: 'inline-flex', marginBottom: 8 }}>
                ⚙ {name}
            </div>
            <pre className="fn-call">{pretty}</pre>
        </div>
    )
}

interface TimelineEventCardProps {
    event: RawEvent
    index: number
    isLast: boolean
}

function TimelineEventCard({ event, index, isLast }: TimelineEventCardProps) {
    const ts = (event as { timestamp?: string }).timestamp
    const delay = `${Math.min(index, 30) * 25}ms`

    // ── event_msg ─────────────────────────────────────────────
    if (event.type === 'event_msg') {
        const ev = event as EventMsg
        const p = ev.payload

        if (p.type === 'user_message' && p.message) {
            return (
                <div className="timeline-event" style={{ animationDelay: delay }}>
                    <div className="timeline-event__spine">
                        <div className="timeline-event__dot timeline-event__dot--user" />
                        {!isLast && <div className="timeline-event__line" />}
                    </div>
                    <div className="timeline-event__body">
                        <div className="timeline-event__header">
                            <span className="event-role event-role--user">User</span>
                            <span className="event-time">{formatTimestamp(ts)}</span>
                        </div>
                        <div className="event-bubble event-bubble--user">{p.message}</div>
                    </div>
                </div>
            )
        }

        if (p.type === 'agent_message' && p.message) {
            return (
                <div className="timeline-event" style={{ animationDelay: delay }}>
                    <div className="timeline-event__spine">
                        <div className="timeline-event__dot timeline-event__dot--assistant" />
                        {!isLast && <div className="timeline-event__line" />}
                    </div>
                    <div className="timeline-event__body">
                        <div className="timeline-event__header">
                            <span className="event-role event-role--assistant">Assistant</span>
                            <span className="event-time">{formatTimestamp(ts)}</span>
                        </div>
                        <div className="event-bubble event-bubble--assistant">{p.message}</div>
                    </div>
                </div>
            )
        }

        if (p.type === 'agent_reasoning' && p.text) {
            return (
                <div className="timeline-event" style={{ animationDelay: delay }}>
                    <div className="timeline-event__spine">
                        <div className="timeline-event__dot timeline-event__dot--reasoning" />
                        {!isLast && <div className="timeline-event__line" />}
                    </div>
                    <div className="timeline-event__body">
                        <div className="timeline-event__header">
                            <span className="event-role event-role--reasoning">Thinking</span>
                            <span className="event-time">{formatTimestamp(ts)}</span>
                        </div>
                        <div className="event-bubble event-bubble--reasoning">
                            <ReasoningBlock text={p.text} />
                        </div>
                    </div>
                </div>
            )
        }

        return null
    }

    // ── response_item ─────────────────────────────────────────
    if (event.type === 'response_item') {
        const ev = event as ResponseItem
        const p = ev.payload

        if (p.type === 'function_call' && p.name) {
            return (
                <div className="timeline-event" style={{ animationDelay: delay }}>
                    <div className="timeline-event__spine">
                        <div className="timeline-event__dot timeline-event__dot--tool" />
                        {!isLast && <div className="timeline-event__line" />}
                    </div>
                    <div className="timeline-event__body">
                        <div className="timeline-event__header">
                            <span className="event-role event-role--tool">Tool</span>
                            <span className="event-time">{formatTimestamp(ts)}</span>
                        </div>
                        <div className="event-bubble event-bubble--tool">
                            <FunctionCallBlock name={p.name} args={p.arguments ?? '{}'} />
                        </div>
                    </div>
                </div>
            )
        }

        if (p.type === 'function_call_output' && p.output) {
            const preview = p.output.length > 800
                ? p.output.slice(0, 800) + '\n…[truncated]'
                : p.output
            return (
                <div className="timeline-event" style={{ animationDelay: delay }}>
                    <div className="timeline-event__spine">
                        <div className="timeline-event__dot timeline-event__dot--tool" />
                        {!isLast && <div className="timeline-event__line" />}
                    </div>
                    <div className="timeline-event__body">
                        <div className="timeline-event__header">
                            <span className="event-role event-role--tool">Output</span>
                            <span className="event-time">{formatTimestamp(ts)}</span>
                        </div>
                        <div className="event-bubble event-bubble--tool">
                            <pre>{preview}</pre>
                        </div>
                    </div>
                </div>
            )
        }

        if (p.type === 'message' && p.role === 'assistant') {
            const text = p.content
                ?.map((c: { type: string; text?: string }) => c.text ?? '')
                .join('\n') ?? ''
            if (!text.trim()) return null
            return (
                <div className="timeline-event" style={{ animationDelay: delay }}>
                    <div className="timeline-event__spine">
                        <div className="timeline-event__dot timeline-event__dot--assistant" />
                        {!isLast && <div className="timeline-event__line" />}
                    </div>
                    <div className="timeline-event__body">
                        <div className="timeline-event__header">
                            <span className="event-role event-role--assistant">Assistant</span>
                            <span className="event-time">{formatTimestamp(ts)}</span>
                        </div>
                        <div className="event-bubble event-bubble--assistant">{text}</div>
                    </div>
                </div>
            )
        }

        return null
    }

    return null
}

export default function EventTimeline({ events }: EventTimelineProps) {
    if (events.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state__icon">◌</div>
                <p className="empty-state__title">No events to display</p>
            </div>
        )
    }

    // Filter noisy/structural events before rendering
    const rendered = events.filter(e => {
        if (e.type === 'session_meta') return false
        if (e.type === 'turn_context') return false
        if (e.type === 'event_msg') {
            const ptype = ((e as EventMsg).payload).type
            if (ptype === 'token_count') return false
        }
        return true
    })

    return (
        <div className="timeline" role="list" aria-label="Session event timeline">
            {rendered.map((event, idx) => (
                <TimelineEventCard
                    key={idx}
                    event={event}
                    index={idx}
                    isLast={idx === rendered.length - 1}
                />
            ))}
        </div>
    )
}
