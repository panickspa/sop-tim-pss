'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Page, FlowNode } from '@/lib/types';
import { parseSOPData, shortPageName } from '@/lib/parseSOP';
import PageNav from '@/components/PageNav';
import FlowchartCanvas from '@/components/FlowchartCanvas';
import NodeDetail from '@/components/NodeDetail';
import SearchBar from '@/components/SearchBar';

export default function Home() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // Fetch and parse data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/parsed_data.json');
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const raw = await res.json();
        const parsed = parseSOPData(raw);
        setPages(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const currentPage = pages[activePage] || null;
  const pageNames = useMemo(() => pages.map((p) => p.name), [pages]);

  const handleNodeClick = useCallback((node: FlowNode) => {
    setSelectedNode(node);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleSearchSelect = useCallback((pageIndex: number, node: FlowNode) => {
    setActivePage(pageIndex);
    setHighlightedNodeId(node.id);
    setSelectedNode(node);
    // Scroll to show the highlighted node
    setTimeout(() => {
      const el = document.querySelector(`[title="${node.text}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
    // Auto-clear highlight after 3 seconds
    setTimeout(() => setHighlightedNodeId(null), 3000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Memuat data SOP...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="bg-bg-card rounded-xl p-8 border border-border-primary max-w-md text-center">
          <svg className="w-12 h-12 text-accent-red mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Gagal Memuat Data</h2>
          <p className="text-text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex-shrink-0 bg-bg-secondary border-b border-border-primary">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-base md:text-lg font-bold text-text-primary tracking-tight">
                Tata Kelola Pelatihan Tim Sensus Survei
              </h1>
              <p className="text-xs md:text-sm text-text-muted mt-0.5">
                SOP Interaktif — Badan Pusat Statistik
              </p>
            </div>
            <SearchBar
              allPages={pages}
              onSelectNode={handleSearchSelect}
            />
          </div>
        </div>
      </header>

      {/* Navigation tabs */}
      <PageNav
        pageNames={pageNames}
        activeIndex={activePage}
        onSelect={setActivePage}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
        {currentPage ? (
          <FlowchartCanvas
            key={activePage}
            page={currentPage}
            onNodeClick={handleNodeClick}
            highlightedNodeId={highlightedNodeId}
          />
        ) : (
          <div className="flex items-center justify-center flex-1 text-text-muted">
            <p>Halaman tidak ditemukan</p>
          </div>
        )}
      </main>

      {/* Node detail panel */}
      <NodeDetail
        node={selectedNode}
        onClose={handleCloseDetail}
      />

      {/* Footer info */}
      <footer className="flex-shrink-0 bg-bg-secondary border-t border-border-primary py-2 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-text-muted">
          <span>
            Halaman {activePage + 1} dari {pages.length}
          </span>
          <span>
            {currentPage
              ? `${currentPage.nodes.length} langkah · ${currentPage.edges.length} koneksi`
              : ''}
          </span>
        </div>
      </footer>
    </div>
  );
}
