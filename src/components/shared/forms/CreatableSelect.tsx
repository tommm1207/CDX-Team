import { useState, useEffect, useRef, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isUUID } from '@/utils/helpers';

export const CreatableSelect = ({
  label,
  value,
  options,
  onChange,
  onCreate,
  placeholder = '-- Chọn --',
  required = false,
  disabled = false,
  className = '',
  labelClassName = 'text-[10px] font-bold text-gray-400 uppercase',
  selectClassName = 'w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white',
  allowCreate = true,
  compact = false,
}: {
  label?: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
  onCreate?: (name: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  allowCreate?: boolean;
  compact?: boolean;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rawId = useId();
  const portalId = `creatable-portal-${rawId.replace(/:/g, '')}`;
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, isAbove: false });

  const selectedOption = options.find((opt) => opt.id === value);

  useEffect(() => {
    if (!isOpen) {
      if (selectedOption) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSearchTerm(selectedOption.name);
      } else if (allowCreate && value && !isUUID(value)) {
        setSearchTerm(value);
      } else if (!value) {
        setSearchTerm('');
      }
    }
  }, [value, selectedOption, isOpen, allowCreate]);

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const updateDropdownPos = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const dropdownMaxHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const shouldRenderAbove = spaceBelow < dropdownMaxHeight && rect.top > dropdownMaxHeight;

      setDropdownPos({
        top: shouldRenderAbove ? Math.max(8, rect.top - dropdownMaxHeight - 4) : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        width: Math.min(rect.width, window.innerWidth - 16),
        isAbove: shouldRenderAbove,
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updateDropdownPos();
    }
  }, [isOpen, searchTerm]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => {
      updateDropdownPos();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  // Commit text if user typed something and clicked outside or pressed enter
  const commitSearchTerm = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange('');
      setSearchTerm('');
      return;
    }

    const match = options.find((opt) => opt.name.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      onChange(match.id);
      setSearchTerm(match.name);
    } else if (allowCreate) {
      if (onCreate) {
        onCreate(trimmed);
      } else {
        onChange(trimmed);
      }
    } else if (selectedOption) {
      setSearchTerm(selectedOption.name);
    } else {
      setSearchTerm('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleInteractionOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const portalEl = document.getElementById(portalId);
        if (portalEl && portalEl.contains(event.target as Node)) return;

        setIsOpen(false);
        commitSearchTerm(searchTerm);
      }
    };
    document.addEventListener('mousedown', handleInteractionOutside);
    document.addEventListener('touchstart', handleInteractionOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleInteractionOutside);
      document.removeEventListener('touchstart', handleInteractionOutside);
    };
  }, [isOpen, selectedOption, value, searchTerm, options, allowCreate, portalId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = searchTerm.trim();
      if (!trimmed) return;

      const exactMatch = options.find((opt) => opt.name.toLowerCase() === trimmed.toLowerCase());
      if (exactMatch) {
        onChange(exactMatch.id);
        setSearchTerm(exactMatch.name);
        setIsOpen(false);
      } else if (filteredOptions.length > 0) {
        onChange(filteredOptions[0].id);
        setSearchTerm(filteredOptions[0].name);
        setIsOpen(false);
      } else if (allowCreate) {
        commitSearchTerm(trimmed);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen;

  const dropdownContent = (
    <AnimatePresence>
      {showDropdown && (
        <motion.div
          key="creatable-select-dropdown"
          initial={{ opacity: 0, y: dropdownPos.isAbove ? 6 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: dropdownPos.isAbove ? 6 : -6 }}
          transition={{ duration: 0.15 }}
          id={portalId}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 99999,
          }}
          className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden"
        >
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {filteredOptions.length === 0 && !searchTerm && (
              <div className="px-4 py-3 text-sm text-gray-500 italic text-center">
                Không có dữ liệu. {allowCreate && 'Hãy gõ để thêm mới.'}
              </div>
            )}
            {filteredOptions.length === 0 && searchTerm && !allowCreate && (
              <div className="px-4 py-3 text-sm text-gray-500 italic text-center">
                Không tìm thấy kết quả.
              </div>
            )}
            {filteredOptions.map((opt) => (
              <div
                key={opt.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt.id);
                  setSearchTerm(opt.name);
                  setIsOpen(false);
                }}
                className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/5 transition-colors ${value === opt.id ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700'}`}
              >
                {opt.name}
              </div>
            ))}

            {allowCreate &&
              searchTerm &&
              !options.find((opt) => opt.name.toLowerCase() === searchTerm.toLowerCase()) && (
                <div
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    commitSearchTerm(searchTerm);
                    setIsOpen(false);
                  }}
                  className="px-4 py-3 border-t border-gray-50 bg-gray-50/50 cursor-pointer hover:bg-primary/5 transition-colors flex items-center gap-2 text-primary font-bold text-sm"
                >
                  <Plus size={16} />
                  <span>Thêm mới: "{searchTerm}"</span>
                </div>
              )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className={labelClassName}>
          {label} {required && '*'}
        </label>
      )}
      <div className="relative mt-1">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={searchTerm}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            data-1p-ignore
            data-lpignore="true"
            onKeyDown={handleKeyDown}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
              if (e.target.value === '') onChange('');
            }}
            onFocus={() => !disabled && setIsOpen(true)}
            className={`${selectClassName} ${compact ? 'pr-6 pl-2 text-xs' : 'pr-14'} ${disabled ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''}`}
          />
          <div
            className={`absolute ${compact ? 'right-1.5' : 'right-3'} top-1/2 -translate-y-1/2 flex items-center ${compact ? 'gap-0 bg-transparent' : 'gap-0.5 bg-white pl-1'}`}
          >
            {searchTerm && !disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                  onChange('');
                }}
                className={`${compact ? 'p-0.5' : 'p-1.5'} hover:bg-gray-100 rounded-full text-gray-400 cursor-pointer z-10`}
              >
                <X size={compact ? 10 : 12} />
              </button>
            )}
            <ChevronDown
              size={compact ? 12 : 16}
              className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {createPortal(dropdownContent, document.body)}
      </div>
    </div>
  );
};
