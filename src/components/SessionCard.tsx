function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface SessionCardProps {
    id: string
    title: string
    project: string
    model: string
    cli_version: string
    git_branch: string
    created_at: string
    file_size_bytes: number
    onClick: () => void
}

export default function SessionCard({
    title,
    project,
    model,
    cli_version,
    git_branch,
    created_at,
    file_size_bytes,
    onClick,
}: SessionCardProps) {
    return (
        <div className="session-card" onClick={onClick} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}>

            <div className="session-card__header">
                <span className="session-card__project" title={project}>
                    {project.length > 24 ? project.slice(0, 22) + '…' : project}
                </span>
                <span className="session-card__date">{formatDate(created_at)}</span>
            </div>

            <p className="session-card__title">{title}</p>

            <div className="session-card__meta">
                <span className="chip chip--model">
                    <span>⬡</span> {model}
                </span>
                {git_branch && (
                    <span className="chip chip--branch">
                        <span>⎇</span> {git_branch}
                    </span>
                )}
                <span className="chip chip--size">{formatBytes(file_size_bytes)}</span>
                {cli_version && (
                    <span className="chip chip--cli">v{cli_version}</span>
                )}
            </div>
        </div>
    )
}
