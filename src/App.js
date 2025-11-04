import React, { useState, useEffect } from 'react';
import './App.css';
import FileUpload from './components/FileUpload';
import FieldsViewer from './components/FieldsViewer';
import ComparisonView from './components/ComparisonView';
import Statistics from './components/Statistics';
import { parseXML, extractFields, createFieldTree, compareFields } from './utils/xmlParser';

// Tooltip component for file names
const FileNameTooltip = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const wrapperRef = React.useRef(null);

  const handleMouseEnter = () => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setTooltipStyle({
        position: 'fixed',
        top: `${rect.top - 8}px`,
        left: `${rect.left}px`,
        transform: 'translateY(-100%)',
      });
    }
    setIsVisible(true);
  };

  return (
    <span
      ref={wrapperRef}
      className="file-name-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <span className="file-name-tooltip" style={tooltipStyle}>
          {text}
        </span>
      )}
    </span>
  );
};

function App() {
  const [files, setFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('single');
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(err => {
        console.log('Service Worker registration failed:', err);
      });
    }
  }, []);

  const handleFilesAdded = (newFiles) => {
    const updatedFiles = [...files];

    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const xmlString = e.target.result;
          const xmlDoc = parseXML(xmlString);
          const fields = extractFields(xmlDoc);
          const tree = createFieldTree(xmlDoc);

          const fileData = {
            id: Date.now() + Math.random(),
            filename: file.name,
            xmlString: xmlString,
            xmlDoc: xmlDoc,
            fields: fields,
            tree: tree,
            stats: {
              totalFields: fields.length,
              uniqueFieldNames: new Set(fields.map(f => f.name)).size,
              maxDepth: Math.max(...fields.map(f => f.depth), 0),
              nestedFields: fields.filter(f => f.isNested).length,
            },
          };

          updatedFiles.push(fileData);
          setFiles([...updatedFiles]);
        } catch (error) {
          alert(`Error parsing ${file.name}: ${error.message}`);
        }
      };
      reader.readAsText(file);
    });
  };

  const handleRemoveFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    if (selectedFileIndex >= newFiles.length && selectedFileIndex > 0) {
      setSelectedFileIndex(selectedFileIndex - 1);
    }
  };

  const currentFile = files[selectedFileIndex];
  const comparison = files.length > 1 ? compareFields(files) : null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>XML Field Analyzer</h1>
          <div className="header-subtitle-row">
            <p className="subtitle">Analyze, compare, and export XML structures</p>
            <p className="local-processing">🔒 All processing is done locally on your device</p>
          </div>
        </div>
      </header>

      <div className="app-container">
        <aside className="sidebar">
          <FileUpload onFilesAdded={handleFilesAdded} />

          <div className="files-list">
            <h3>Loaded Files ({files.length})</h3>
            {files.length === 0 ? (
              <p className="empty-message">No files loaded yet</p>
            ) : (
              <ul>
                {files.map((file, index) => (
                  <li
                    key={file.id}
                    className={`file-item ${selectedFileIndex === index ? 'active' : ''}`}
                    onClick={() => setSelectedFileIndex(index)}
                  >
                    <FileNameTooltip text={file.filename}>
                      <span className="file-name">{file.filename}</span>
                    </FileNameTooltip>
                    <span className="file-fields">{file.fields.length} fields</span>
                    <button
                      className="remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(index);
                      }}
                      title="Remove file"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="main-content">
          {files.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <h2>No XML Files Loaded</h2>
              <p>Upload one or more XML files to get started</p>
            </div>
          ) : (
            <>
              <div className="tabs">
                <button
                  className={`tab ${activeTab === 'single' ? 'active' : ''}`}
                  onClick={() => setActiveTab('single')}
                >
                  Single File Analysis
                </button>
                {files.length > 1 && (
                  <button
                    className={`tab ${activeTab === 'comparison' ? 'active' : ''}`}
                    onClick={() => setActiveTab('comparison')}
                  >
                    Compare Files
                  </button>
                )}
              </div>

              {activeTab === 'single' && currentFile && (
                <div className="content-section">
                  <Statistics file={currentFile} />
                  <FieldsViewer file={currentFile} />
                </div>
              )}

              {activeTab === 'comparison' && comparison && (
                <ComparisonView comparison={comparison} files={files} />
              )}
            </>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <div className="footer-content">
          <p className="footer-text">
            Another project created with 🧡 by{' '}
            <a href="https://weihong.dev" target="_blank" rel="noopener noreferrer" className="footer-link">
              Wei Hong
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
