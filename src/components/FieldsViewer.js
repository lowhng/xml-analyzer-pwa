import React, { useState, useMemo, useRef, useEffect } from 'react';
import { fieldsToCSV, removePrefixFromFieldName, removePrefixFromPath } from '../utils/xmlParser';

// Tooltip component
const Tooltip = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const wrapperRef = useRef(null);

  const handleMouseEnter = () => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setTooltipStyle({
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 8}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
        zIndex: 99999,
      });
    }
    setIsVisible(true);
  };

  return (
    <span
      ref={wrapperRef}
      className="tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && <span className="tooltip" style={tooltipStyle}>{text}</span>}
    </span>
  );
};

// Header with tooltip helper
const HeaderWithTooltip = ({ title, tooltip, width, onResize, columnIndex }) => {
  const [isResizing, setIsResizing] = useState(false);
  const headerRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(100, startWidthRef.current + diff);
      onResize(columnIndex, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, columnIndex, onResize]);

  const handleMouseDown = (e) => {
    if (headerRef.current) {
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width || 150;
    }
  };

  return (
    <th ref={headerRef} style={{ width: width || 'auto', position: 'relative' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {title}
        <Tooltip text={tooltip}>
          <span className="tooltip-icon">?</span>
        </Tooltip>
      </span>
      <div
        className="column-resizer"
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          zIndex: 1,
        }}
      />
    </th>
  );
};

function FieldsViewer({ file, prefixToRemove = '' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [columnWidths, setColumnWidths] = useState({
    0: 250, // Field Name
    1: 80,  // Depth
    2: 120, // Children
    3: 100, // Has Content
    4: 200, // Data
    5: 150, // Attributes
    6: 100, // Occurrences
  });

  const toggleExpand = (path) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const handleColumnResize = (columnIndex, newWidth) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnIndex]: newWidth,
    }));
  };

  // Get all visible fields for counting
  const allVisibleFields = useMemo(() => {
    const visible = [];
    
    function collectVisible(fields, depth = 0) {
      fields.forEach(field => {
        const normalizedName = removePrefixFromFieldName(field.name, prefixToRemove);
        const matchesSearch = normalizedName.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (matchesSearch) {
          visible.push(field);
        }
        
        // If field is expanded or has no children, check descendants
        const isExpanded = expandedPaths.has(field.path);
        if (isExpanded || !field.hasChildren) {
          const children = file.fields.filter(child => 
            child.path.startsWith(field.path + ' > ') && 
            child.depth === depth + 1
          );
          collectVisible(children, depth + 1);
        }
      });
    }
    
    const rootFields = file.fields.filter(f => f.depth === 0);
    collectVisible(rootFields);
    
    return visible;
  }, [file.fields, searchTerm, expandedPaths, prefixToRemove]);

  const handleExportCSV = () => {
    const csv = fieldsToCSV(file.fields, file.filename, prefixToRemove);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${file.filename.replace('.xml', '')}_fields.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render fields recursively
  const renderFieldRows = (fields, depth = 0) => {
    return fields.map(field => {
      const isExpanded = expandedPaths.has(field.path);
      const hasChildren = field.hasChildren;
      
      // Get direct children and sort by order index (XML order)
      const children = file.fields
        .filter(f => 
          f.path.startsWith(field.path + ' > ') && 
          f.depth === depth + 1
        )
        .sort((a, b) => {
          // Sort by orderIndex to maintain XML order
          const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
          const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
          return orderA - orderB;
        });

      const normalizedName = removePrefixFromFieldName(field.name, prefixToRemove);
      const matchesSearch = normalizedName.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Check if this field or any of its descendants match
      const hasMatchingDescendants = children.some(child => {
        const childNormalizedName = removePrefixFromFieldName(child.name, prefixToRemove);
        return childNormalizedName.toLowerCase().includes(searchTerm.toLowerCase());
      }) || (hasChildren && file.fields.some(f => 
        f.path.startsWith(field.path + ' > ') && 
        removePrefixFromFieldName(f.name, prefixToRemove).toLowerCase().includes(searchTerm.toLowerCase())
      ));

      if (!matchesSearch && !hasMatchingDescendants) {
        return null;
      }

      const indent = depth * 24; // Code-like indentation (16px per level)

      return (
        <React.Fragment key={field.path}>
          {matchesSearch && (
            <tr className="field-row" style={{ backgroundColor: depth % 2 === 0 ? 'var(--surface-color)' : 'rgba(0,0,0,0.02)' }}>
              <td style={{ width: columnWidths[0] }}>
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: `${indent}px` }}>
                  {hasChildren && children.length > 0 && (
                    <button
                      className="expand-toggle"
                      onClick={() => toggleExpand(field.path)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        marginRight: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--text-secondary)',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => e.target.style.color = 'var(--primary-color)'}
                      onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <span style={{ fontSize: '0.75rem', userSelect: 'none', width: '12px', display: 'inline-block' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    </button>
                  )}
                  {!hasChildren && <span style={{ width: '1.75rem', display: 'inline-block' }} />}
                  <code style={{ backgroundColor: 'var(--bg-color)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
                    {normalizedName}
                  </code>
                </div>
              </td>
              <td style={{ width: columnWidths[1] }}>
                <span className="nesting-indicator">{field.depth}</span>
              </td>
              <td style={{ width: columnWidths[2] }}>
                {field.hasChildren && (
                  <span className="field-badge badge-children">{field.childCount} child{field.childCount !== 1 ? 'ren' : ''}</span>
                )}
              </td>
              <td style={{ width: columnWidths[3], textAlign: 'center' }}>
                {field.hasText && <span style={{ fontSize: '1.2rem', color: 'var(--secondary-color)' }}>✓</span>}
              </td>
              <td style={{ width: columnWidths[4], maxWidth: columnWidths[4], overflow: 'hidden' }}>
                {field.hasChildren ? (
                  '—'
                ) : field.textContent ? (
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                      maxWidth: '100%',
                    }}
                    title={field.textContent}
                  >
                    {field.textContent}
                  </div>
                ) : (
                  '—'
                )}
              </td>
              <td style={{ width: columnWidths[5] }}>
                {field.attributes.length > 0 ? field.attributes.join(', ') : '—'}
              </td>
              <td style={{ width: columnWidths[6] }}>{field.occurrences}</td>
            </tr>
          )}
          {hasChildren && isExpanded && children.length > 0 && renderFieldRows(children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  // Get root fields and sort by order index (XML order)
  const rootFields = file.fields
    .filter(f => f.depth === 0)
    .sort((a, b) => {
      const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
      const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
      return orderA - orderB;
    });
  const renderedRows = renderFieldRows(rootFields, 0);

  return (
    <div className="fields-viewer">
      <div className="fields-header">
        <h2>Fields ({allVisibleFields.length})</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="export-btn"
            onClick={() => {
              // Expand all when showing all
              const allPaths = new Set(file.fields.filter(f => f.hasChildren).map(f => f.path));
              setExpandedPaths(allPaths);
            }}
            style={{ 
              backgroundColor: 'var(--primary-color)',
              fontSize: '0.75rem',
              padding: '0.5rem 0.75rem',
            }}
          >
            Expand All
          </button>
          <button
            className="export-btn"
            onClick={() => setExpandedPaths(new Set())}
            style={{ 
              backgroundColor: 'var(--text-secondary)',
              fontSize: '0.75rem',
              padding: '0.5rem 0.75rem',
            }}
          >
            Collapse All
          </button>
          <button className="export-btn" onClick={handleExportCSV}>
            📥 Export to CSV
          </button>
        </div>
      </div>

      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
        <input
          type="text"
          placeholder="Search fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid var(--border-color)',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
          }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="fields-table">
          <thead>
            <tr>
              <HeaderWithTooltip
                title="Field Name"
                tooltip="The name of the XML element."
                width={columnWidths[0]}
                onResize={handleColumnResize}
                columnIndex={0}
              />
              <HeaderWithTooltip
                title="Depth"
                tooltip="The nesting level of this field in the XML hierarchy. Root elements have depth 0, their children have depth 1, and so on."
                width={columnWidths[1]}
                onResize={handleColumnResize}
                columnIndex={1}
              />
              <HeaderWithTooltip
                title="Children"
                tooltip="Shows the number of direct child elements this field contains."
                width={columnWidths[2]}
                onResize={handleColumnResize}
                columnIndex={2}
              />
              <HeaderWithTooltip
                title="Has Content"
                tooltip="Indicates whether this field contains text content (not just child elements)."
                width={columnWidths[3]}
                onResize={handleColumnResize}
                columnIndex={3}
              />
              <HeaderWithTooltip
                title="Data"
                tooltip="The text content of this field. Hover for three seconds to see full content if truncated."
                width={columnWidths[4]}
                onResize={handleColumnResize}
                columnIndex={4}
              />
              <HeaderWithTooltip
                title="Attributes"
                tooltip="Lists any XML attributes defined on this field (e.g., id, class, type)."
                width={columnWidths[5]}
                onResize={handleColumnResize}
                columnIndex={5}
              />
              <HeaderWithTooltip
                title="Occurrences"
                tooltip="The total number of times this field appears in the XML document."
                width={columnWidths[6]}
                onResize={handleColumnResize}
                columnIndex={6}
              />
            </tr>
          </thead>
          <tbody>
            {renderedRows}
          </tbody>
        </table>
      </div>

      {allVisibleFields.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No fields match your search criteria
        </div>
      )}
    </div>
  );
}

export default FieldsViewer;
