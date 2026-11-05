"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

export function MarkdownArticleEditor({
  name,
  defaultValue = "",
  maxLength = 100000,
  rows = 18,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
}) {
  const [content, setContent] = useState(defaultValue);
  return (
    <div className="markdown-article-editor">
      <textarea
        name={name}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        required
      />
      <details className="markdown-preview">
        <summary>Preview formatting</summary>
        <div className="journal-article-content">
          {content ? <ReactMarkdown>{content}</ReactMarkdown> : <p>Your formatted story preview will appear here.</p>}
        </div>
      </details>
    </div>
  );
}