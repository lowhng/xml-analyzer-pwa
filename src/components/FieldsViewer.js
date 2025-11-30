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
  const [showXMLPreview, setShowXMLPreview] = useState(false);
  const [formattedXML, setFormattedXML] = useState('');
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

  // Format XML with proper indentation
  const formatXML = (xmlString) => {
    try {
      // Parse the XML to ensure it's valid
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      
      // Check for parsing errors
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        return xmlString; // Return original if parsing fails
      }

      // Format the XML with indentation
      const formatNode = (node, indent = 0) => {
        const indentStr = '  '.repeat(indent);
        let result = '';

        if (node.nodeType === Node.ELEMENT_NODE) {
          // Build opening tag with attributes
          let tag = `${indentStr}<${node.nodeName}`;
          
          // Add attributes
          if (node.attributes && node.attributes.length > 0) {
            Array.from(node.attributes).forEach(attr => {
              tag += ` ${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`;
            });
          }
          
          // Check if node has element children
          const hasElementChildren = node.children.length > 0;
          
          // Get text content (only direct text nodes, not from nested elements)
          const directTextNodes = Array.from(node.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent.trim())
            .filter(t => t.length > 0);

          if (hasElementChildren) {
            // Has element children - format with newlines
            tag += '>\n';
            
            // Process all child nodes (both elements and text)
            let childrenResult = '';
            Array.from(node.childNodes).forEach(child => {
              if (child.nodeType === Node.ELEMENT_NODE) {
                childrenResult += formatNode(child, indent + 1);
              } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                childrenResult += `${indentStr}  ${child.textContent.trim()}\n`;
              }
            });
            
            result = tag + childrenResult + `${indentStr}</${node.nodeName}>\n`;
          } else if (directTextNodes.length > 0) {
            // Only text content, no element children
            result = tag + `>${directTextNodes.join(' ')}</${node.nodeName}>\n`;
          } else {
            // Empty element
            result = tag + '/>\n';
          }
          
          return result;
        }
        
        return '';
      };

      // Format the document element
      let formatted = '';
      // Preserve XML declaration if present
      if (xmlString.trim().startsWith('<?xml')) {
        const declarationMatch = xmlString.match(/<\?xml[^>]*\?>/);
        if (declarationMatch) {
          formatted = declarationMatch[0] + '\n';
        }
      } else {
        formatted = '<?xml version="1.0" encoding="UTF-8"?>\n';
      }
      formatted += formatNode(xmlDoc.documentElement, 0);
      
      return formatted;
    } catch (error) {
      // If formatting fails, return original XML
      return xmlString;
    }
  };

  const handleShowXMLPreview = () => {
    if (file.xmlString) {
      const formatted = formatXML(file.xmlString);
      setFormattedXML(formatted);
      setShowXMLPreview(true);
    }
  };

  const handleDownloadXML = () => {
    if (formattedXML) {
      const blob = new Blob([formattedXML], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename.endsWith('.xml') ? file.filename : `${file.filename}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
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
          <button className="export-btn" onClick={handleShowXMLPreview}>
            👁️ Preview XML
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

      {showXMLPreview && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowXMLPreview(false);
            }
          }}
        >
          <div 
            style={{
              backgroundColor: 'var(--surface-color)',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              width: '100%',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-color)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                XML Preview - {file.filename}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="primary-btn"
                  onClick={handleDownloadXML}
                  style={{
                    backgroundColor: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Download
                </button>
                <button
                  onClick={() => setShowXMLPreview(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-color)',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <pre 
              style={{
                flex: 1,
                padding: '1rem',
                margin: 0,
                border: 'none',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                lineHeight: '1.5',
                color: 'var(--text-primary)',
                backgroundColor: '#f8fafc',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflow: 'auto',
                maxHeight: 'calc(90vh - 80px)',
              }}
            >
              <code>{formattedXML || 'Loading...'}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default FieldsViewer;
