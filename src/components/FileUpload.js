import React, { useRef, useState } from 'react';

function FileUpload({ onFilesAdded }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'text/xml' || 
              file.name.endsWith('.xml') || 
              file.name.endsWith('.txt')
    );

    if (files.length > 0) {
      onFilesAdded(files);
    } else {
      alert('Please drop XML or TXT files only');
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onFilesAdded(files);
    }
  };

  return (
    <div className="file-upload">
      <div
        className={`upload-area ${isDragOver ? 'dragover' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="upload-icon">📤</div>
        <p className="upload-text">
          Drag and drop XML or TXT files here or click to select
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xml,.txt,text/xml,text/plain"
          onChange={handleFileChange}
          className="upload-input"
        />
      </div>
    </div>
  );
}

export default FileUpload;
