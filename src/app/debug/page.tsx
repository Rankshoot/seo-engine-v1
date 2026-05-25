"use client";

import { useState } from "react";

export default function DebugPage() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("/api/v1/projects");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    data: unknown;
    time: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    const startTime = Date.now();

    try {
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (method !== "GET" && method !== "HEAD") {
        try {
          if (body.trim()) {
            options.body = JSON.stringify(JSON.parse(body));
          }
        } catch {
          throw new Error("Invalid JSON body");
        }
      }

      const res = await fetch(url, options);
      const endTime = Date.now();
      
      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        data,
        time: endTime - startTime,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="pb-4 border-b border-border-subtle">
        <h1 className="text-[24px] font-semibold text-text-primary">API Debugger</h1>
        <p className="text-text-tertiary text-[14px] mt-1">Test your local API endpoints directly with your session auth.</p>
      </div>

      <div className="space-y-4 bg-surface-elevated p-6 rounded-[16px] border border-border-subtle shadow-sm">
        <div className="flex gap-4">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2 text-[14px] text-text-primary outline-none focus:border-brand-action font-mono"
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/api/v1/..."
            className="flex-1 rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2 text-[14px] text-text-primary outline-none focus:border-brand-action font-mono"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="rounded-[8px] bg-brand-primary px-6 py-2 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Request"}
          </button>
        </div>

        {method !== "GET" && method !== "HEAD" && (
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">Request Body (JSON)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="{\n  \n}"
              rows={6}
              className="w-full rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2 text-[14px] text-text-primary outline-none focus:border-brand-action font-mono resize-y"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-brand-coral/10 border border-brand-coral/20 rounded-[8px] text-brand-coral text-[14px]">
          <strong>Error: </strong> {error}
        </div>
      )}

      {response && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-[14px]">
            <span className={`font-mono font-bold ${response.status >= 200 && response.status < 300 ? 'text-[#10b981]' : 'text-brand-coral'}`}>
              {response.status} {response.statusText}
            </span>
            <span className="text-text-tertiary">
              {response.time}ms
            </span>
          </div>
          
          <div className="relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => navigator.clipboard.writeText(typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2))}
                className="bg-surface-elevated border border-border-subtle px-2 py-1 rounded-[4px] text-[12px] text-text-secondary hover:text-text-primary"
              >
                Copy
              </button>
            </div>
            <pre className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-[8px] overflow-auto max-h-[500px] text-[13px] font-mono leading-relaxed shadow-inner">
              {typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
