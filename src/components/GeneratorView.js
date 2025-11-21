import React, { useState, useMemo, useEffect } from 'react';
import { mergeFieldsFromFiles } from '../utils/xmlParser';

function GeneratorView({ files, comparison }) {
    const [sourceType, setSourceType] = useState('merged'); // 'merged', 'common', or fileId
    const [fields, setFields] = useState([]);
    const [generatedXML, setGeneratedXML] = useState('');

    // Prepare source options
    const sourceOptions = useMemo(() => {
        const options = [
            { id: 'merged', label: 'Merged Fields (All Files)' },
            { id: 'common', label: 'Common Fields (Intersection)' },
        ];
        files.forEach(file => {
            options.push({ id: file.id, label: `File: ${file.filename}` });
        });
        return options;
    }, [files]);

    // Initialize fields based on selection
    useEffect(() => {
        let initialFields = [];
        if (sourceType === 'merged') {
            initialFields = mergeFieldsFromFiles(files);
        } else if (sourceType === 'common') {
            // For common fields, we need to map them to a structure similar to merged fields
            // but only including those in comparison.commonFields
            if (comparison && comparison.commonFields) {
                initialFields = comparison.commonFields.map(f => ({
                    ...f,
                    // Ensure we have necessary properties for editing
                    enabled: true,
                    customValue: '',
                    // If it's a string (legacy support), convert to object
                    ...(typeof f === 'string' ? { name: f, path: f, depth: 0 } : {})
                }));
            }
        } else {
            // Specific file
            const file = files.find(f => f.id === sourceType);
            if (file) {
                initialFields = file.fields.map(f => ({
                    ...f,
                    enabled: true,
                    customValue: f.textContent || ''
                }));
            }
        }

        // Add UI state properties
        const fieldsWithState = initialFields.map(f => ({
            ...f,
            enabled: true,
            customValue: f.textContent || '',
            // Ensure unique ID for React keys if not present
            uiId: f.path || Math.random().toString(36).substr(2, 9)
        }));

        setFields(fieldsWithState);
    }, [sourceType, files, comparison]);

    const handleFieldChange = (path, updates) => {
        setFields(prev => prev.map(f =>
            f.path === path ? { ...f, ...updates } : f
        ));
    };

    const updateFieldPath = (field, newParentPath, newDepth) => {
        const newPath = newParentPath ? `${newParentPath} > ${field.name}` : field.name;

        return {
            ...field,
            path: newPath,
            parentPath: newParentPath,
            depth: newDepth
        };
    };

    const handleIndent = (index) => {
        if (index === 0) return; // Can't indent first item

        const field = fields[index];
        const prevField = fields[index - 1];

        // Logic: Make 'field' a child of 'prevField'
        // New parent path is prevField.path
        // New depth is prevField.depth + 1

        const newParentPath = prevField.path;
        const newDepth = prevField.depth + 1;

        // We need to update this field AND all its children
        const oldPathPrefix = field.path;

        setFields(prev => {
            const newFields = [...prev];

            // Update the indented field
            newFields[index] = updateFieldPath(field, newParentPath, newDepth);

            // Update all children (fields that start with the old path)
            for (let i = 0; i < newFields.length; i++) {
                if (i === index) continue;

                if (newFields[i].path.startsWith(oldPathPrefix + ' > ')) {
                    const suffix = newFields[i].path.substring(oldPathPrefix.length);
                    const childNewPath = newFields[index].path + suffix;
                    const childNewParentPath = childNewPath.substring(0, childNewPath.lastIndexOf(' > '));

                    newFields[i] = {
                        ...newFields[i],
                        path: childNewPath,
                        parentPath: childNewParentPath,
                        depth: newFields[i].depth + 1 // Increase depth by 1
                    };
                }
            }

            return newFields;
        });
    };

    const getFieldBlock = (startIndex, allFields) => {
        const field = allFields[startIndex];
        let endIndex = startIndex;
        // Find the end of this block (all subsequent fields with greater depth)
        for (let i = startIndex + 1; i < allFields.length; i++) {
            if (allFields[i].depth <= field.depth) {
                break;
            }
            endIndex = i;
        }
        return { start: startIndex, end: endIndex };
    };

    const handleMoveUp = (index) => {
        if (index === 0) return;
        const field = fields[index];

        // Find previous sibling
        let prevSiblingIndex = -1;
        for (let i = index - 1; i >= 0; i--) {
            if (fields[i].depth === field.depth) {
                prevSiblingIndex = i;
                break;
            }
            if (fields[i].depth < field.depth) {
                break; // Hit parent
            }
        }

        if (prevSiblingIndex === -1) return; // No previous sibling

        // Get blocks
        const currentBlock = getFieldBlock(index, fields);
        const prevBlock = getFieldBlock(prevSiblingIndex, fields);

        setFields(prev => {
            const newFields = [...prev];
            const block1 = newFields.slice(prevBlock.start, prevBlock.end + 1);
            const block2 = newFields.slice(currentBlock.start, currentBlock.end + 1);

            const partBefore = newFields.slice(0, prevBlock.start);
            const partAfter = newFields.slice(currentBlock.end + 1);

            return [...partBefore, ...block2, ...block1, ...partAfter];
        });
    };

    const handleMoveDown = (index) => {
        const field = fields[index];
        const currentBlock = getFieldBlock(index, fields);

        if (currentBlock.end >= fields.length - 1) return;

        let nextSiblingIndex = -1;
        const candidateIndex = currentBlock.end + 1;
        if (candidateIndex < fields.length && fields[candidateIndex].depth === field.depth) {
            nextSiblingIndex = candidateIndex;
        }

        if (nextSiblingIndex === -1) return;

        const nextBlock = getFieldBlock(nextSiblingIndex, fields);

        setFields(prev => {
            const newFields = [...prev];
            const block1 = newFields.slice(currentBlock.start, currentBlock.end + 1);
            const block2 = newFields.slice(nextBlock.start, nextBlock.end + 1);

            const partBefore = newFields.slice(0, currentBlock.start);
            const partAfter = newFields.slice(nextBlock.end + 1);

            return [...partBefore, ...block2, ...block1, ...partAfter];
        });
    };

    const handleOutdent = (index) => {
        const field = fields[index];
        if (field.depth === 0) return; // Can't outdent root

        // Logic: Make 'field' a sibling of its current parent
        // New parent path is the parent of the current parent

        const currentParentPath = field.parentPath || '';
        const lastSep = currentParentPath.lastIndexOf(' > ');
        const newParentPath = lastSep !== -1 ? currentParentPath.substring(0, lastSep) : '';
        const newDepth = field.depth - 1;

        const oldPathPrefix = field.path;

        setFields(prev => {
            const newFields = [...prev];

            // Update the outdented field
            newFields[index] = updateFieldPath(field, newParentPath, newDepth);

            // Update all children
            for (let i = 0; i < newFields.length; i++) {
                if (i === index) continue;

                if (newFields[i].path.startsWith(oldPathPrefix + ' > ')) {
                    const suffix = newFields[i].path.substring(oldPathPrefix.length);
                    const childNewPath = newFields[index].path + suffix;
                    const childNewParentPath = childNewPath.substring(0, childNewPath.lastIndexOf(' > '));

                    newFields[i] = {
                        ...newFields[i],
                        path: childNewPath,
                        parentPath: childNewParentPath,
                        depth: newFields[i].depth - 1 // Decrease depth by 1
                    };
                }
            }

            return newFields;
        });
    };
    const generateXML = () => {
        // Filter enabled fields
        const enabledFields = fields.filter(f => f.enabled);

        if (enabledFields.length === 0) {
            setGeneratedXML('<!-- No fields enabled -->');
            return;
        }

        // Build tree structure from flat fields
        // We need to reconstruct the hierarchy based on paths
        const root = { children: [] };
        const pathMap = new Map();
        pathMap.set('', root);

        // Sort fields by depth to ensure parents are processed before children
        const sortedFields = [...enabledFields].sort((a, b) => a.depth - b.depth);

        sortedFields.forEach(field => {
            const parentPath = field.parentPath || '';
            let parentNode = pathMap.get(parentPath);

            // If parent doesn't exist (maybe disabled?), try to find the nearest enabled ancestor
            if (!parentNode) {
                // Fallback: attach to root if parent is missing/disabled
                // This might break structure but ensures field is included
                // Better approach: find nearest enabled ancestor
                let currentPath = parentPath;
                while (currentPath && !pathMap.has(currentPath)) {
                    const lastSep = currentPath.lastIndexOf(' > ');
                    if (lastSep === -1) currentPath = '';
                    else currentPath = currentPath.substring(0, lastSep);
                }
                parentNode = pathMap.get(currentPath) || root;
            }

            const node = {
                name: field.name,
                text: field.customValue,
                children: [],
                attributes: field.attributes || []
            };

            parentNode.children.push(node);
            pathMap.set(field.path, node);
        });

        // Recursive function to build XML string
        const buildXMLString = (node, indentLevel = 0) => {
            const indent = '  '.repeat(indentLevel);
            let xml = '';

            node.children.forEach(child => {
                xml += `${indent}<${child.name}`;

                // Add attributes if any (placeholder for now as we don't have attribute editing yet)
                // if (child.attributes && child.attributes.length > 0) { ... }

                xml += '>';

                if (child.children.length > 0) {
                    xml += '\n';
                    xml += buildXMLString(child, indentLevel + 1);
                    xml += `${indent}</${child.name}>\n`;
                } else {
                    if (child.text) {
                        xml += `${child.text}`;
                    }
                    xml += `</${child.name}>\n`;
                }
            });

            return xml;
        };

        const xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + buildXMLString(root);
        setGeneratedXML(xmlContent);
    };

    const handleDownload = () => {
        const blob = new Blob([generatedXML], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);
    const [activeTab, setActiveTab] = useState('config'); // 'config' or 'preview'

    // ... (existing code) ...

    const handleKeyDown = (e) => {
        if (!selectedFieldId) return;

        const index = fields.findIndex(f => f.uiId === selectedFieldId);
        if (index === -1) return;

        // Prevent default scrolling for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }

        const isCmdOrCtrl = e.metaKey || e.ctrlKey;

        if (isCmdOrCtrl) {
            // Actions
            if (e.key === 'ArrowUp') handleMoveUp(index);
            if (e.key === 'ArrowDown') handleMoveDown(index);
            if (e.key === 'ArrowRight') handleIndent(index);
            if (e.key === 'ArrowLeft') handleOutdent(index);
        } else {
            // Navigation
            if (e.key === 'ArrowUp') {
                const prevIndex = index > 0 ? index - 1 : index;
                setSelectedFieldId(fields[prevIndex].uiId);
            }
            if (e.key === 'ArrowDown') {
                const nextIndex = index < fields.length - 1 ? index + 1 : index;
                setSelectedFieldId(fields[nextIndex].uiId);
            }
        }
    };

    // Drag and Drop Handlers
    const onDragStart = (e, index) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Set transparent drag image or custom one if needed
        // e.dataTransfer.setDragImage(e.target, 0, 0);
    };

    const onDragOver = (e, index) => {
        e.preventDefault();
        // Optional: Add visual feedback for drop target here if not using CSS :hover
    };

    const onDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;

        // Reorder fields
        // We need to move the dragged BLOCK (field + children) to the new position
        // For simplicity, let's just move the single field for now, OR handle blocks if we want to be robust.
        // Let's reuse the block logic for robustness.

        const draggedBlock = getFieldBlock(draggedItemIndex, fields);

        // If dropping INSIDE the dragged block, ignore
        if (dropIndex >= draggedBlock.start && dropIndex <= draggedBlock.end) return;

        setFields(prev => {
            const newFields = [...prev];
            const block = newFields.slice(draggedBlock.start, draggedBlock.end + 1);

            // Remove block from old position
            const fieldsWithoutBlock = [
                ...newFields.slice(0, draggedBlock.start),
                ...newFields.slice(draggedBlock.end + 1)
            ];

            // Calculate new insertion index
            // We need to adjust dropIndex because removing the block might shift indices
            let insertionIndex = dropIndex;
            if (dropIndex > draggedBlock.start) {
                insertionIndex -= block.length;
            }

            // Insert block at new position
            // If dropping on an item, insert AFTER it (or before? let's say after for now)
            // Actually, standard DnD usually inserts BEFORE the target if dragging up, AFTER if dragging down.
            // Let's stick to "Insert Before" logic for simplicity or "Insert After" based on direction.

            // Simplified: Insert AT the drop index (pushing current item down)

            return [
                ...fieldsWithoutBlock.slice(0, insertionIndex),
                ...block,
                ...fieldsWithoutBlock.slice(insertionIndex)
            ];
        });

        setDraggedItemIndex(null);
    };

    return (
        <div className="generator-view" onKeyDown={handleKeyDown} tabIndex={0}>
            <div className="generator-header">
                <h2>XML Generator</h2>
                <div className="generator-controls">
                    <div className="source-selector">
                        <label>Source:</label>
                        <select
                            value={sourceType}
                            onChange={(e) => setSourceType(e.target.value)}
                        >
                            {sourceOptions.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="view-tabs">
                        <button
                            className={`view-tab ${activeTab === 'config' ? 'active' : ''}`}
                            onClick={() => setActiveTab('config')}
                        >
                            Configuration
                        </button>
                        <button
                            className={`view-tab ${activeTab === 'preview' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab('preview');
                                generateXML(); // Auto-generate when switching to preview
                            }}
                        >
                            Preview
                        </button>
                    </div>
                </div>
            </div>

            <div className="generator-content">
                {activeTab === 'config' && (
                    <div className="fields-editor full-width">
                        <h3>Field Configuration <span style={{ fontSize: '0.8em', fontWeight: 'normal', color: '#666' }}>(Drag to reorder, Cmd+Arrows to move/indent)</span></h3>
                        <div className="fields-list-container">
                            <ul className="field-list">
                                {fields.map((field, index) => (
                                    <li
                                        key={field.uiId}
                                        style={{ paddingLeft: `${field.depth * 20}px` }}
                                        className={`field-item ${selectedFieldId === field.uiId ? 'selected' : ''} ${draggedItemIndex === index ? 'dragging' : ''}`}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, index)}
                                        onDragOver={(e) => onDragOver(e, index)}
                                        onDrop={(e) => onDrop(e, index)}
                                        onClick={() => setSelectedFieldId(field.uiId)}
                                    >
                                        <div className="field-row">
                                            <div className="drag-handle" style={{ cursor: 'grab', marginRight: '10px', color: '#ccc' }}>
                                                ☰
                                            </div>
                                            <label className="field-label">
                                                <input
                                                    type="checkbox"
                                                    checked={field.enabled}
                                                    onChange={(e) => handleFieldChange(field.path, { enabled: e.target.checked })}
                                                />
                                                <span className="field-name">{field.name}</span>
                                            </label>
                                            {field.hasText && (
                                                <input
                                                    type="text"
                                                    className="field-value-input"
                                                    value={field.customValue}
                                                    onChange={(e) => handleFieldChange(field.path, { customValue: e.target.value })}
                                                    placeholder="Value"
                                                    disabled={!field.enabled}
                                                    onClick={(e) => e.stopPropagation()} // Prevent selecting row when clicking input
                                                />
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {activeTab === 'preview' && (
                    <div className="preview-panel full-width">
                        <div className="preview-header">
                            <h3>XML Preview</h3>
                            <div className="preview-actions">
                                <button className="primary-btn" onClick={generateXML}>Refresh</button>
                                {generatedXML && (
                                    <button className="secondary-btn" onClick={handleDownload}>Download</button>
                                )}
                            </div>
                        </div>
                        <pre className="xml-preview">
                            <code>{generatedXML || "Click 'Refresh' to generate XML"}</code>
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}

export default GeneratorView;
