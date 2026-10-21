
import { useRef, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

type Source = {
  source: string;
  page: number | string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type DocumentInfo = {
  id: string;
  filename: string;
  pages: number;
  chunks: number;
};

export default function App() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hey! I'm Nitris Jr. Upload a PDF and ask me anything about its contents. I'll find relevant information and show you the source pages.",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadPDF(file?: File) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${API_URL}/api/documents/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "PDF upload failed.");
      }

      setDocuments((previous) => {
        const updated = previous.filter(
          (doc) => doc.id !== data.document_id,
        );

        return [
          {
            id: data.document_id,
            filename: data.filename,
            pages: data.pages_extracted,
            chunks: data.chunks_indexed,
          },
          ...updated,
        ];
      });

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `Successfully indexed ${data.filename}. Extracted ${data.pages_extracted} pages and indexed ${data.chunks_indexed} chunks. You can now ask questions!`,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the backend.",
      );
    } finally {
      setUploading(false);

      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();

    const text = question.trim();

    if (!text || asking) return;

    setQuestion("");
    setError("");

    setMessages((previous) => [
      ...previous,
      { role: "user", content: text },
    ]);

    setAsking(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not generate an answer.");
      }

      const uniqueSources: Source[] = [];
      const seen = new Set<string>();

      for (const source of data.sources ?? []) {
        const key = `${source.source}:${source.page}`;

        if (!seen.has(key)) {
          seen.add(key);
          uniqueSources.push(source);
        }
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: data.answer,
          sources: uniqueSources,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the backend.",
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">N</div>
          <div>
            <h1>Nitris Jr.</h1>
            <p>PDF knowledge assistant</p>
          </div>
        </div>

        <button
          className="new-chat"
          onClick={() => {
            setMessages([
              {
                role: "assistant",
                content: "New conversation started. What would you like to know?",
              },
            ]);
            setError("");
          }}
        >
          <span>＋</span> New conversation
        </button>

        <div className="sidebar-section">
          <div className="section-heading">
            <span>Your documents</span>
            <span className="count">{documents.length}</span>
          </div>

          <button
            className="upload-card"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            <span className="upload-icon">↑</span>
            <span>
              <strong>{uploading ? "Indexing PDF..." : "Upload a PDF"}</strong>
              <small>PDF files only</small>
            </span>
          </button>

          <input
            ref={fileInput}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(event) => uploadPDF(event.target.files?.[0])}
          />

          <div className="document-list">
            {documents.map((doc) => (
              <div className="document-item" key={doc.id}>
                <span className="pdf-icon">PDF</span>
                <div className="document-info">
                  <strong title={doc.filename}>{doc.filename}</strong>
                  <small>
                    {doc.pages} pages · {doc.chunks} chunks
                  </small>
                </div>
                <span className="ready-dot" title="Indexed" />
              </div>
            ))}

            {documents.length === 0 && (
              <p className="empty-documents">
                Your uploaded documents will appear here.
              </p>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>Local AI backend</span>
          <span className="status-label">Prototype</span>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <span className="topbar-title">Workspace</span>
            <span className="topbar-divider">/</span>
            <span className="topbar-current">Chat with your PDFs</span>
          </div>
          <div className="model-label">
            <span className="status-dot" />
            Ollama · Qwen 2.5
          </div>
        </header>

        <section className="chat-area">
          <div className="chat-heading">
            <div className="eyebrow">YOUR PERSONAL KNOWLEDGE BASE</div>
            <h2>Ask. Discover. Understand.</h2>
            <p>
              Get answers from your documents, backed by relevant source pages.
            </p>
          </div>

          {documents.length === 0 && (
            <div className="welcome-card">
              <div className="welcome-icon">✳</div>
              <h3>Start with a document</h3>
              <p>
                Upload a PDF to index its content, then ask questions in
                natural language.
              </p>
              <button
                className="primary-button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Indexing..." : "↑  Choose a PDF"}
              </button>
              <div className="feature-row">
                <span>✓ Semantic search</span>
                <span>✓ Page references</span>
                <span>✓ Local AI</span>
              </div>
            </div>
          )}

          <div className="messages">
            {messages.map((message, index) => (
              <article
                className={`message ${message.role}`}
                key={`${index}-${message.role}`}
              >
                <div className="avatar">
                  {message.role === "assistant" ? "N" : "Y"}
                </div>

                <div className="message-body">
                  <div className="message-author">
                    {message.role === "assistant" ? "Nitris Jr." : "You"}
                    {message.role === "assistant" && (
                      <span className="ai-badge">AI</span>
                    )}
                  </div>

                  <div className="message-content">
                    {message.content}
                  </div>

                  {message.sources && message.sources.length > 0 && (
                    <div className="sources">
                      <div className="sources-heading">
                        <span>↗</span> Sources used
                      </div>
                      <div className="source-list">
                        {message.sources.map((source, sourceIndex) => (
                          <div
                            className="source-chip"
                            key={`${source.source}-${source.page}-${sourceIndex}`}
                          >
                            <span className="source-file-icon">PDF</span>
                            <span>{source.source}</span>
                            <span className="source-page">
                              Page {source.page}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}

            {asking && (
              <article className="message assistant">
                <div className="avatar">N</div>
                <div className="message-body">
                  <div className="message-author">Nitris Jr.</div>
                  <div className="typing">
                    <span />
                    <span />
                    <span />
                    <small>Searching documents and generating an answer...</small>
                  </div>
                </div>
              </article>
            )}
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>!</span>
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
        </section>

        <footer className="composer-area">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask anything about your documents..."
              rows={2}
              disabled={asking}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-bottom">
              <span>Enter to send · Shift + Enter for a new line</span>
              <button
                className="send-button"
                type="submit"
                disabled={asking || !question.trim()}
                aria-label="Send message"
              >
                {asking ? "…" : "↑"}
              </button>
            </div>
          </form>
          <p className="disclaimer">
            AI-generated answers can be inaccurate. Verify important details
            against the cited document pages.
          </p>
        </footer>
      </section>
    </main>
  );
}
