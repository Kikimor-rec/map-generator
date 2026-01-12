import { useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'

interface MarkdownEditorProps {
    value: string
    onChange: (value: string) => void
    height?: string
}

export function MarkdownEditor({ value, onChange, height = 'h-32' }: MarkdownEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const insertFormatting = (prefix: string, suffix: string = '') => {
        if (!textareaRef.current) return

        const start = textareaRef.current.selectionStart
        const end = textareaRef.current.selectionEnd
        const text = textareaRef.current.value

        const before = text.substring(0, start)
        const selection = text.substring(start, end)
        const after = text.substring(end)

        const newText = before + prefix + selection + suffix + after
        onChange(newText)

        // Restore focus and selection
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus()
                const newCursorPos = start + prefix.length
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos + selection.length)
            }
        }, 0)
    }

    return (
        <div className="flex flex-col border border-space-600 rounded bg-space-900 overflow-hidden">
            {/* Toolbar */}
            <div className="flex gap-1 p-1 bg-space-800 border-b border-space-700 overflow-x-auto">
                <button
                    onClick={() => insertFormatting('**', '**')}
                    className="p-1 min-w-[24px] rounded hover:bg-space-700 text-space-300 hover:text-white font-bold text-xs"
                    title="Bold"
                >
                    B
                </button>
                <button
                    onClick={() => insertFormatting('*', '*')}
                    className="p-1 min-w-[24px] rounded hover:bg-space-700 text-space-300 hover:text-white italic text-xs"
                    title="Italic"
                >
                    I
                </button>
                <div className="w-[1px] bg-space-600 mx-1 self-stretch" />
                <button
                    onClick={() => insertFormatting('## ')}
                    className="p-1 min-w-[24px] rounded hover:bg-space-700 text-space-300 hover:text-white font-bold text-xs"
                    title="Heading 2"
                >
                    H2
                </button>
                <button
                    onClick={() => insertFormatting('### ')}
                    className="p-1 min-w-[24px] rounded hover:bg-space-700 text-space-300 hover:text-white font-bold text-xs"
                    title="Heading 3"
                >
                    H3
                </button>
                <div className="w-[1px] bg-space-600 mx-1 self-stretch" />
                <button
                    onClick={() => insertFormatting('- ')}
                    className="p-1 min-w-[24px] rounded hover:bg-space-700 text-space-300 hover:text-white text-xs"
                    title="List"
                >
                    • List
                </button>
                <button
                    onClick={() => insertFormatting('[', '](url)')}
                    className="p-1 min-w-[24px] rounded hover:bg-space-700 text-space-300 hover:text-white text-xs"
                    title="Link"
                >
                    🔗 Link
                </button>
            </div>

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                className={`w-full bg-space-900 text-space-200 p-2 text-sm ${height} resize-y border-none focus:outline-none`}
                placeholder="Type here..."
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    )
}
