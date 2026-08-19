import { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const selectedOption = options.find((opt) => opt.id === value);

  useEffect(() => {
    if (!isOpen) {
      if (selectedOption) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSearchTerm(selectedOption.name);
      } else if (allowCreate && value && !isUUID(value)) {
        setSearchTerm(value);
      } else {
        setSearchTerm('');
      }
    }
  }, [value, selectedOption, isOpen, allowCreate]);

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Recalculate dropdown position when open
  useLayoutEffect(() => {
    if (isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Also check if clicked element is inside our portal dropdown
        const portalEl = document.getElementById('creatable-select-portal');
        if (portalEl && portalEl.contains(event.target as Node)) return;
        setIsOpen(false);
        if (selectedOption) {
          setSearchTerm(selectedOption.name);
        } else if (allowCreate && value && !isUUID(value)) {
          setSearchTerm(value);
        } else {
          setSearchTerm('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedOption, value]);

  // Close on scroll of any ancestor (helps with modals)
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const showDropdown =
    isOpen &&
    (filteredOptions.length > 0 ||
      (allowCreate &&
        searchTerm &&
        !options.find((opt) => opt.name.toLowerCase() === searchTerm.toLowerCase())));

  const dropdownContent = showDropdown ? (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      id="creatable-select-portal"
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 99999,
      }}
      className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
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
          onCreate &&
          searchTerm &&
          !options.find((opt) => opt.name.toLowerCase() === searchTerm.toLowerCase()) && (
            <div
              onClick={() => {
                onCreate(searchTerm);
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
  ) : null;

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
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
              if (e.target.value === '') onChange('');
            }}
            onFocus={() => !disabled && setIsOpen(true)}
            className={`${selectClassName} pr-14 ${disabled ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''}`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-white pl-1">
            {searchTerm && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                  onChange('');
                }}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 cursor-pointer z-10"
              >
                <X size={12} />
              </button>
            )}
            <ChevronDown
              size={16}
              className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        <AnimatePresence>
          {dropdownContent && createPortal(dropdownContent, document.body)}
        </AnimatePresence>
      </div>
      {required && !value && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ opacity: 0, height: 0, width: 0, position: 'absolute' }}
          required
        />
      )}
    </div>
  );
};
