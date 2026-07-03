'use client';

import { FlowNode } from '@/lib/types';

interface NodeDetailProps {
  node: FlowNode | null;
  onClose: () => void;
}

export default function NodeDetail({ node, onClose }: NodeDetailProps) {
  if (!node) return null;

  const typeLabels: Record<string, { label: string; color: string }> = {
    process: { label: 'Proses', color: 'bg-accent-primary' },
    decision: { label: 'Keputusan', color: 'bg-accent-gold' },
    start: { label: 'Mulai', color: 'bg-accent-green' },
    end: { label: 'Selesai', color: 'bg-accent-red' },
    offpage: { label: 'Konektor', color: 'bg-purple-600' },
    connector: { label: 'Penghubung', color: 'bg-slate-500' },
  };

  const info = typeLabels[node.type] || { label: node.type, color: 'bg-slate-500' };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-full max-w-md z-50
          bg-bg-card border-l border-border-primary shadow-2xl
          detail-panel-enter
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary bg-bg-secondary">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${info.color}`} />
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              {info.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            Detail Langkah
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                ID Node
              </label>
              <p className="text-sm text-text-secondary font-mono bg-bg-tertiary rounded-lg px-3 py-2 break-all">
                {node.id}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                Teks Lengkap
              </label>
              <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-3 leading-relaxed whitespace-pre-wrap">
                {node.text || <span className="italic text-text-muted">(tidak ada teks)</span>}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                  Posisi X
                </label>
                <p className="text-sm text-text-secondary font-mono">{Math.round(node.x)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                  Posisi Y
                </label>
                <p className="text-sm text-text-secondary font-mono">{Math.round(node.y)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                  Lebar
                </label>
                <p className="text-sm text-text-secondary font-mono">{Math.round(node.width)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                  Tinggi
                </label>
                <p className="text-sm text-text-secondary font-mono">{Math.round(node.height)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
