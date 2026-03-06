'use client';

import { useState } from 'react';
import BenchmarkResults from '@/components/argument/BenchmarkResults';
import BaselineComparison from '@/components/argument/BaselineComparison';
import { DATASETS, type Dataset, type BatchResult, type BatchMetrics, type QuestionResult } from '@/lib/argument/benchmarks/types';

export default function BenchmarkPage() {
  const [dataset, setDataset] = useState<Dataset>('mmlu');
  const [questionCount, setQuestionCount] = useState(10);
  const [running, setRunning] = useState(false);
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null);
  const [questions, setQuestions] = useState<QuestionResult[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setMetrics(null);
    setQuestions([]);
    setError(null);
    setStatusMessage('Starting benchmark...');

    try {
      const res = await fetch('/api/argument/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, questionCount }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error: ${res.status} ${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const json = trimmed.slice(6);
          if (json === '[DONE]') continue;

          try {
            const event = JSON.parse(json);
            switch (event.type) {
              case 'status':
                setStatusMessage(event.message);
                break;
              case 'condition_complete':
                setStatusMessage(
                  `${event.condition}: ${(event.accuracy * 100).toFixed(1)}% accuracy`,
                );
                break;
              case 'batch_complete': {
                const result = event.result as BatchResult;
                setMetrics(result.metrics);
                setQuestions(result.questions);
                setStatusMessage(null);
                break;
              }
              case 'error':
                setError(event.message);
                break;
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">ARGORA Benchmark</h1>
        <p className="mt-2 text-muted">
          Evaluate ARGORA against direct prompting baselines on standard datasets.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-8 flex flex-wrap items-end gap-4 rounded-lg border border-card-border bg-card-bg p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Dataset</label>
          <select
            value={dataset}
            onChange={(e) => setDataset(e.target.value as Dataset)}
            disabled={running}
            className="rounded border border-card-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            {DATASETS.map((d) => (
              <option key={d} value={d}>
                {d.toUpperCase().replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Questions</label>
          <input
            type="number"
            value={questionCount}
            onChange={(e) => setQuestionCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={running}
            min={1}
            max={500}
            className="w-24 rounded border border-card-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          />
        </div>

        <button
          onClick={handleRun}
          disabled={running}
          className="rounded bg-accent px-6 py-2 text-sm font-semibold text-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run Benchmark'}
        </button>
      </div>

      {/* Status / Error */}
      {statusMessage && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          {running && (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
          {statusMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="space-y-8">
        <BenchmarkResults metrics={metrics} loading={running && !metrics} />

        {questions.length > 0 && <BaselineComparison questions={questions} />}
      </div>
    </div>
  );
}
