import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Minimal prose styling via ReactMarkdown's component overrides, rather than
// pulling in @tailwindcss/typography for one feature — Ask Mojo's replies
// and drafted documents are the only place in the app that render markdown.
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold text-gray-900 mt-3 mb-1.5 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="leading-relaxed mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 pl-3 italic text-gray-600 mb-3 last:mb-0">{children}</blockquote>
        ),
        code: ({ children }) => <code className="bg-gray-100 rounded px-1 py-0.5 text-[0.85em] font-mono">{children}</code>,
        hr: () => <hr className="my-4 border-gray-200" />,
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3 last:mb-0">
            <table className="min-w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
