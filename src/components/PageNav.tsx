'use client';

import { shortPageName } from '@/lib/parseSOP';

interface PageNavProps {
  pageNames: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export default function PageNav({ pageNames, activeIndex, onSelect }: PageNavProps) {
  return (
    <nav className="w-full overflow-x-auto border-b border-border-primary bg-bg-secondary">
      <div className="flex min-w-max px-2">
        {pageNames.map((name, i) => {
          const shortName = shortPageName(name, i);
          const isActive = i === activeIndex;
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`
                flex-shrink-0 px-3 md:px-4 py-3 text-xs md:text-sm font-medium
                transition-colors duration-150 whitespace-nowrap
                tab-underline
                ${isActive
                  ? 'text-accent-primary border-b-2 border-accent-primary bg-bg-tertiary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }
              `}
            >
              {shortName}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
