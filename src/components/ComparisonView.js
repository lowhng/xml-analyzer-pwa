import React, { useState, useMemo } from 'react';
import { comparisonToExcel } from '../utils/xmlParser';

// Component to render hierarchical field list
function HierarchicalFieldList({ fields, expandedPaths, setExpandedPaths, type, totalFiles }) {
  const toggleExpand = (path) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  // Build a tree structure from flat field list
  const fieldTree = useMemo(() => {
    const tree = [];
    const fieldMap = new Map();
    const rootNodes = new Set();

    // First pass: create all nodes and identify root nodes
    // Preserve original order from fields array
    fields.forEach(field => {
      const node = {
        ...field,
        children: []
      };
      fieldMap.set(field.path, node);
      rootNodes.add(field.path);
    });

    // Second pass: build parent-child relationships
    // Process fields in their original order to maintain XML structure
    fields.forEach(field => {
      const node = fieldMap.get(field.path);
      // Find parent path (everything before the last " > ")
      const lastSeparator = field.path.lastIndexOf(' > ');
      if (lastSeparator !== -1) {
        const parentPath = field.path.substring(0, lastSeparator);
        const parent = fieldMap.get(parentPath);
        if (parent) {
          // Parent exists in this list, add as child and remove from root
          parent.children.push(node);
          rootNodes.delete(field.path);
        }
        // If parent doesn't exist, keep as root node
      }
      // If no separator, it's already a root node
    });

    // Build tree from root nodes - maintain order using orderIndex
    const rootArray = Array.from(rootNodes).map(path => fieldMap.get(path));
    rootArray.sort((a, b) => {
      const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
      const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
      return orderA - orderB;
    });
    tree.push(...rootArray);

    // Sort function for nodes - maintain XML order using orderIndex
    // orderIndex is relative to parent, so we compare it for siblings (same parentPath)
    const sortNodes = (nodes) => {
      return nodes.sort((a, b) => {
        // If they have the same parent, sort by orderIndex (XML order)
        if (a.parentPath === b.parentPath) {
          const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
          const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
          if (orderA !== orderB) return orderA - orderB;
        }
        // If different parents or same orderIndex, sort by depth first
        if (a.depth !== b.depth) return a.depth - b.depth;
        // Final fallback: path comparison
        return a.path.localeCompare(b.path);
      }).map(node => {
        if (node.children.length > 0) {
          node.children = sortNodes(node.children);
        }
        return node;
      });
    };

    return sortNodes(tree);
  }, [fields]);

  const renderField = (field, depth = 0) => {
    const isExpanded = expandedPaths.has(field.path);
    const hasChildren = field.children && field.children.length > 0;
    const indent = depth * 24; // Code-like indentation (24px per level)

    return (
      <React.Fragment key={field.path}>
        <li className={`field-list-item ${type}`} style={{ paddingLeft: `${indent}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {hasChildren && (
              <button
                onClick={() => toggleExpand(field.path)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
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
            <code>{field.name}</code>
            {field.presentInFiles && totalFiles && field.presentInFiles.length < totalFiles && (
              <span 
                style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  color: 'var(--primary-color)', 
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  marginLeft: '0.5rem',
                  cursor: 'help',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  display: 'inline-block'
                }}
                title={`Present in: ${field.presentInFiles.join(', ')}`}
              >
                {field.presentInFiles.length}/{totalFiles} files
              </span>
            )}
            {field.structuralDifference && (
              <span 
                style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--warning-color)', 
                  fontWeight: 'bold',
                  marginLeft: '0.25rem',
                  cursor: 'help'
                }}
                title={(() => {
                  const parts = [];
                  parts.push('Structural difference: This field exists in all files but at different paths.');
                  if (field.alternativePathsWithFiles && field.alternativePathsWithFiles.length > 0) {
                    parts.push('\n\nAlternative paths:');
                    field.alternativePathsWithFiles.forEach(({ path, files }) => {
                      parts.push(`\n  • ${path} (in: ${files.join(', ')})`);
                    });
                  }
                  return parts.join('');
                })()}
              >
                ⚠️
              </span>
            )}
            {field.path !== field.name && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                ({field.path})
              </span>
            )}
          </div>
        </li>
        {hasChildren && isExpanded && field.children.map(child => renderField(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <ul className="field-list">
      {fieldTree.map(field => renderField(field, 0))}
    </ul>
  );
}

function ComparisonView({ comparison, files }) {
  const [activeTab, setActiveTab] = useState('common');
  const [expandedPaths, setExpandedPaths] = useState(new Set());

  // Merge all fields from all files, grouping by similar structure
  // For each parent path, show all unique field names from all files
  const mergedFields = useMemo(() => {
    if (files.length === 0) return [];

    // Track all unique field names under each parent path
    // parentPath -> Map of fieldName -> { field info, presentInFiles }
    const parentFieldMap = new Map();
    
    // First pass: collect all fields grouped by parent path and field name
    files.forEach(file => {
      file.fields.forEach(field => {
        const parentPath = field.parentPath || '';
        const fieldName = field.name;
        
        if (!parentFieldMap.has(parentPath)) {
          parentFieldMap.set(parentPath, new Map());
        }
        
        const fieldsAtParent = parentFieldMap.get(parentPath);
        if (!fieldsAtParent.has(fieldName)) {
          // First time seeing this field name under this parent
          fieldsAtParent.set(fieldName, {
            name: fieldName,
            path: field.path,
            depth: field.depth,
            parentPath: parentPath,
            hasChildren: field.hasChildren,
            childCount: field.childCount,
            orderIndex: field.orderIndex !== undefined ? field.orderIndex : 999999,
            presentInFiles: [file.filename],
            isNested: field.isNested,
            hasText: field.hasText,
            textContent: field.textContent,
            attributes: field.attributes,
            occurrences: field.occurrences,
          });
        } else {
          // Field name already exists under this parent, just add to presentInFiles
          const existing = fieldsAtParent.get(fieldName);
          if (!existing.presentInFiles.includes(file.filename)) {
            existing.presentInFiles.push(file.filename);
          }
          // Update hasChildren if this file has children (field has children if any file has children)
          if (field.hasChildren) {
            existing.hasChildren = true;
          }
        }
      });
    });

    // Second pass: build the merged field list maintaining structure
    // Use reference file (first file) to determine the order and structure
    const merged = [];
    const processedFieldKeys = new Set(); // Track parentPath + fieldName combinations
    
    // Build a function to recursively process fields
    const processFieldsAtDepth = (depth, parentPath) => {
      const fieldsAtParent = parentFieldMap.get(parentPath) || new Map();
      const fieldEntries = Array.from(fieldsAtParent.entries());
      
      // Sort by order index from reference file if available
      fieldEntries.sort(([nameA, fieldA], [nameB, fieldB]) => {
        // Try to get order from reference file
        const refFile = files[0];
        const refFieldA = refFile.fields.find(f => 
          f.name === nameA && (f.parentPath || '') === parentPath
        );
        const refFieldB = refFile.fields.find(f => 
          f.name === nameB && (f.parentPath || '') === parentPath
        );
        
        const orderA = refFieldA?.orderIndex ?? fieldA.orderIndex;
        const orderB = refFieldB?.orderIndex ?? fieldB.orderIndex;
        
        if (orderA !== orderB) return orderA - orderB;
        return nameA.localeCompare(nameB);
      });
      
      fieldEntries.forEach(([fieldName, fieldInfo]) => {
        const key = `${parentPath}|${fieldName}`;
        if (!processedFieldKeys.has(key)) {
          processedFieldKeys.add(key);
          merged.push(fieldInfo);
          
          // Recursively process children if this field has children
          if (fieldInfo.hasChildren) {
            processFieldsAtDepth(depth + 1, fieldInfo.path);
          }
        }
      });
    };
    
    // Start processing from root (empty parent path)
    processFieldsAtDepth(0, '');
    
    return merged;
  }, [files]);

  const handleExportComparison = () => {
    const blob = comparisonToExcel(comparison, mergedFields);
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'comparison_report.xlsx');
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
          📊 Export to Excel
        </button>
      </div>

      <div className="tabs" style={{ borderBottom: '1px solid var(--border-color)', padding: '0 1rem', margin: 0 }}>
        <button
          className={`tab ${activeTab === 'merged' ? 'active' : ''}`}
          onClick={() => setActiveTab('merged')}
          style={{ borderBottom: activeTab === 'merged' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Merged View ({mergedFields.length})
        </button>
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
        {activeTab === 'merged' && (
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Merged View: All Fields from All Files
              </h3>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Fields are grouped by similar structure. If fields share the same parent path, they are shown together.
              </span>
            </div>
            {mergedFields.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No fields to display</p>
            ) : (
              <>
                <div style={{ 
                  padding: '0.75rem', 
                  backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                  border: '1px solid var(--primary-color)', 
                  borderRadius: '0.5rem', 
                  marginBottom: '1rem',
                  fontSize: '0.875rem'
                }}>
                  <strong style={{ color: 'var(--primary-color)' }}>ℹ️ Note:</strong> This view shows all unique fields from all files, grouped by their parent structure. 
                  Fields marked with (X/Y files) appear in X out of Y files. 
                  Hover over the file count to see which files contain each field.
                </div>
                <HierarchicalFieldList
                  fields={mergedFields}
                  expandedPaths={expandedPaths}
                  setExpandedPaths={setExpandedPaths}
                  type="merged"
                  totalFiles={files.length}
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'common' && (
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Fields present in all {files.length} files
              </h3>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                (Structure shown from: {files[0]?.filename})
              </span>
            </div>
            {comparison.commonFields.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No common fields found</p>
            ) : (
              <>
                {Object.keys(comparison.structuralDifferences || {}).length > 0 && (
                  <div style={{ 
                    padding: '0.75rem', 
                    backgroundColor: 'rgba(245, 158, 11, 0.1)', 
                    border: '1px solid var(--warning-color)', 
                    borderRadius: '0.5rem', 
                    marginBottom: '1rem',
                    fontSize: '0.875rem'
                  }}>
                    <strong style={{ color: 'var(--warning-color)' }}>⚠️ Note:</strong> Some fields have structural differences. 
                    Fields marked with ⚠️ exist in all files but at different paths/positions. 
                    Hover over the warning icon to see alternative paths.
                  </div>
                )}
                <HierarchicalFieldList
                  fields={comparison.commonFields}
                  expandedPaths={expandedPaths}
                  setExpandedPaths={setExpandedPaths}
                  type="common"
                />
              </>
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
              Fields unique to each file (not present in any other file)
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
                    <HierarchicalFieldList
                      fields={comparison.uniqueFields[file.filename]}
                      expandedPaths={expandedPaths}
                      setExpandedPaths={setExpandedPaths}
                      type="unique"
                    />
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
