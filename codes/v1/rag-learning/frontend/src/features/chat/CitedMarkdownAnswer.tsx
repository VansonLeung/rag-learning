import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ContextPassage } from '../../types/applicationTypes';
import type { PreviewTarget } from '../explorer/DocumentPreviewDrawer';
export function CitedMarkdownAnswer({
  content,
  passages,
  onPreview,
}: {
  content: string;
  passages: ContextPassage[];
  onPreview: (target: PreviewTarget) => void;
}) {
  const transformed = content.replace(/\[(\d+)\](?!\()/g, (original, id) =>
    passages.some((passage) => passage.citation === Number(id))
      ? `[${id}](#source-${id})`
      : original,
  );
  return (
    <div className="markdown-answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const match = href?.match(/^#source-(\d+)$/);
            const passage = match
              ? passages.find((passage) => passage.citation === Number(match[1]))
              : undefined;
            return passage ? (
              <button
                className="citation-link"
                title={passage.path}
                onClick={() =>
                  onPreview({
                    documentId: passage.documentId,
                    startOffset: passage.startOffset,
                    endOffset: passage.endOffset,
                  })
                }
              >
                {children}
              </button>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {transformed}
      </ReactMarkdown>
    </div>
  );
}
