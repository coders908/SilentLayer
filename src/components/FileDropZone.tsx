import { useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { ChevronDownIcon, LayersIcon, PaperclipIcon } from './Icons';

interface FileDropZoneProps {
  accept: string;
  title: string;
  hint: string;
  selectedFileName?: string | null;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  compact?: boolean;
  icon?: 'image' | 'file';
}

function FileDropZone({
  accept,
  title,
  hint,
  selectedFileName,
  onFileSelected,
  disabled = false,
  compact = false,
  icon = 'image',
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const takeFirstFile = (fileList: FileList | null) => {
    const firstFile = fileList?.[0];
    if (firstFile) {
      onFileSelected(firstFile);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    if (disabled) {
      return;
    }

    takeFirstFile(event.dataTransfer.files);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!disabled) {
        inputRef.current?.click();
      }
    }
  };

  const dropZoneClassName = [
    'drop-zone',
    isDragOver ? 'drop-zone--active' : '',
    disabled ? 'drop-zone--disabled' : '',
    compact ? 'drop-zone--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={dropZoneClassName}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) {
          inputRef.current?.click();
        }
      }}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="drop-zone__icon">
        {icon === 'file' ? (
          <PaperclipIcon size={compact ? 18 : 22} />
        ) : (
          <LayersIcon size={compact ? 18 : 22} />
        )}
      </span>
      <span className="drop-zone__title">{title}</span>
      <span className="drop-zone__hint">{hint}</span>

      {selectedFileName ? (
        <span className="drop-zone__file mono" dir="ltr">
          {selectedFileName}
        </span>
      ) : null}

      {!selectedFileName && !disabled ? (
        <span className="drop-zone__chevron" aria-hidden="true">
          <ChevronDownIcon size={14} />
        </span>
      ) : null}

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          takeFirstFile(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}

export default FileDropZone;
