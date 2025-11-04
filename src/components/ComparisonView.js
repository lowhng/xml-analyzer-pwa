import React, { useState } from 'react';
import { comparisonToCSV } from '../utils/xmlParser';

function ComparisonView({ comparison, files }) {
  const [activeTab, setActiveTab] = useState('common');

  const handleExportComparison = () => {
    const csv = comparisonToCSV(comparison);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'comparison_report.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fields-viewer">
      <div className="fields-header">
        <h2>File Comparison</h2>
        <button className="export-btn" onClick={handleExportComparison}>
          📥 Export Report
        </button>
      </div>

      <div className="tabs" style={{ borderBottom: '1px solid var(--border-color)', padding: '0 1rem', margin: 0 }}>
        <button
          className={`tab ${activeTab === 'common' ? 'active' : ''}`}
          onClick={() => setActiveTab('common')}
          style={{ borderBottom: activeTab === 'common' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Common Fields ({comparison.commonFields.length})
        </button>
        <button
          className={`tab ${activeTab === 'differences' ? 'active' : ''}`}
          onClick={() => setActiveTab('differences')}
          style={{ borderBottom: activeTab === 'differences' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Differences
        </button>
        <button
          className={`tab ${activeTab === 'unique' ? 'active' : ''}`}
          onClick={() => setActiveTab('unique')}
          style={{ borderBottom: activeTab === 'unique' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Unique Fields
        </button>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {activeTab === 'common' && (
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
              Fields present in all {files.length} files
            </h3>
            {comparison.commonFields.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No common fields found</p>
            ) : (
              <ul className="field-list">
                {comparison.commonFields.map((field, index) => (
                  <li key={index} className="field-list-item common">
                    <code>{field}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'differences' && (
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
              Field variations across files
            </h3>
            {Object.entries(comparison.fieldDifferences).length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No differences found</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {Object.entries(comparison.fieldDifferences).map(([fieldName, diff]) => {
                  // Only show fields that have differences
                  if (diff.absentIn.length === 0) return null;

                  return (
                    <div
                      key={fieldName}
                      style={{
                        padding: '1rem',
                        backgroundColor: 'var(--bg-color)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                        <code>{fieldName}</code>
                      </h4>
                      <div style={{ fontSize: '0.875rem', display: 'grid', gap: '0.5rem' }}>
                        {diff.presentIn.length > 0 && (
                          <p>
                            <strong>Present in:</strong> {diff.presentIn.join(', ')}
                          </p>
                        )}
                        {diff.absentIn.length > 0 && (
                          <p style={{ color: 'var(--danger-color)' }}>
                            <strong>Missing from:</strong> {diff.absentIn.join(', ')}
                          </p>
                        )}
                        {Object.keys(diff.depthVariations).length > 1 && (
                          <p style={{ color: 'var(--warning-color)' }}>
                            <strong>Depth variations:</strong>{' '}
                            {Object.entries(diff.depthVariations)
                              .map(([depth, files]) => `Depth ${depth}: ${files.join(', ')}`)
                              .join('; ')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'unique' && (
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
              Fields unique to each file
            </h3>
            <div className="comparison-container">
              {files.map((file) => (
                <div key={file.id}>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    {file.filename}
                  </h4>
                  {comparison.uniqueFields[file.filename].length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      No unique fields
                    </p>
                  ) : (
                    <ul className="field-list">
                      {comparison.uniqueFields[file.filename].map((field, index) => (
                        <li key={index} className="field-list-item unique">
                          <code>{field}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ComparisonView;
