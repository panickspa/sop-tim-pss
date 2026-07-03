'use client';

import { useState, useRef, useEffect } from 'react';
import { FlowNode } from '@/lib/types';
import { shortPageName } from '@/lib/parseSOP';

interface SearchBarProps {
  allPages: { name: string; nodes: FlowNode[] }[];
  onSelectNode: (pageIndex: number, node: FlowNode) => void;
}

export default function SearchBar({ allPages, onSelectNode }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<{ pageIndex: number; pageName: string; node: FlowNode }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const q = query.toLowerCase();
    const matches: { pageIndex: number; pageName: string; node: FlowNode }[] = [];

    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];
      for (const node of page.nodes) {
        if (
          node.text.toLowerCase().includes(q) &&
          !['connector', 'offpage'].includes(node.type)
        ) {
          matches.push({
            pageIndex: i,
            pageName: page.name,
            node,
          });
        }
      }
    }

    // Limit results
    setResults(matches.slice(0, 20));
    setIsOpen(matches.length > 0);
  }, [query, allPages]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (pageIndex: number, node: FlowNode) => {
    setQuery('');
    setIsOpen(false);
    onSelectNode(pageIndex, node);
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && results.length > 0 && setIsOpen(true)}
          placeholder="Cari langkah di seluruh halaman..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-bg-tertiary border border-border-primary
                     text-text-primary text-sm placeholder:text-text-muted
                     focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/50
                     transition-colors"
        />
      </div>

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 z-50 max-h-80 overflow-y-auto
                     rounded-lg border border-border-primary bg-bg-card shadow-xl"
        >
          {results.map((r, i) => (
            <button
              key={`${r.node.id}-${i}`}
              onClick={() => handleSelect(r.pageIndex, r.node)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg-hover transition-colors
                         border-b border-border-primary/50 last:border-b-0"
            >
              <span className="block text-text-primary leading-snug line-clamp-2">
                {r.node.text}
              </span>
              <span className="block text-xs text-text-muted mt-0.5">
                {shortPageName(r.pageName, r.pageIndex)} — {r.node.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
