/**
 * XML Parser and Analysis Utility
 * Handles parsing, field detection, nesting analysis, and comparison
 */

import * as XLSX from 'xlsx';

/**
 * Check if content contains XML elements
 * @param {string} content - The content to check
 * @returns {boolean} True if XML content is detected
 */
export function hasXMLContent(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  // Check for XML declaration
  if (content.indexOf('<?xml') !== -1) {
    return true;
  }

  // Check for valid XML tag start (< followed by letter, underscore, or colon)
  const tagStartRegex = /<[a-zA-Z_:]/;
  return tagStartRegex.test(content);
}

/**
 * Extract XML content from a string that may contain leading non-XML text
 * Looks for XML declaration (<?xml) or first valid XML tag start (<)
 * @param {string} content - The raw content that may contain leading text
 * @returns {string} Clean XML content starting from the XML declaration or first tag
 */
export function extractXMLContent(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // First, try to find the XML declaration (<?xml)
  const xmlDeclarationIndex = content.indexOf('<?xml');
  if (xmlDeclarationIndex !== -1) {
    return content.substring(xmlDeclarationIndex);
  }

  // If no XML declaration, look for the first '<' character that starts a valid tag
  // A valid XML tag starts with '<' followed by a letter, underscore, or colon
  const tagStartRegex = /<[a-zA-Z_:]/;
  const match = content.match(tagStartRegex);
  if (match && match.index !== undefined) {
    return content.substring(match.index);
  }

  // If we can't find a valid XML start, return the original content
  // (let the parser handle the error)
  return content;
}

/**
 * Parse XML string and extract field information
 * @param {string} xmlString - The XML content as a string (may contain leading non-XML text)
 * @returns {Object} Parsed XML data with field information
 */
export function parseXML(xmlString) {
  try {
    // Extract clean XML content, ignoring any leading non-XML text
    const cleanXMLString = extractXMLContent(xmlString);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleanXMLString, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid XML format');
    }

    return xmlDoc;
  } catch (error) {
    throw new Error(`XML Parse Error: ${error.message}`);
  }
}

/**
 * Extract all fields from an XML document with nesting information
 * @param {XMLDocument} xmlDoc - Parsed XML document
 * @returns {Array} Array of field objects with nesting info
 */
export function extractFields(xmlDoc) {
  const fields = [];
  const fieldMap = new Map();
  const parentOrderCounters = new Map(); // Track order counter per parent path

  function traverseNode(node, depth = 0, parentPath = '') {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const nodeName = node.nodeName;
      const path = parentPath ? `${parentPath} > ${nodeName}` : nodeName;

      // Create field key for deduplication
      const fieldKey = `${nodeName}|${depth}`;

      if (!fieldMap.has(fieldKey)) {
        // Get or create order counter for this parent
        if (!parentOrderCounters.has(parentPath)) {
          parentOrderCounters.set(parentPath, 0);
        }
        const orderIndex = parentOrderCounters.get(parentPath);
        parentOrderCounters.set(parentPath, orderIndex + 1);
        
        const field = {
          name: nodeName,
          depth: depth,
          path: path,
          isNested: depth > 0,
          hasChildren: node.children.length > 0,
          childCount: node.children.length,
          hasText: node.textContent && node.textContent.trim().length > 0,
          textContent: node.textContent ? node.textContent.trim() : '',
          attributes: Array.from(node.attributes || []).map(attr => attr.name),
          occurrences: 1,
          orderIndex: orderIndex, // Track order of first appearance under this parent
          parentPath: parentPath, // Store parent path for ordering children
        };

        fieldMap.set(fieldKey, field);
        fields.push(field);
      } else {
        // Increment occurrence count for duplicate fields
        const existingField = fieldMap.get(fieldKey);
        existingField.occurrences += 1;
      }

      // Traverse children in order
      for (let child of node.children) {
        traverseNode(child, depth + 1, path);
      }
    }
  }

  traverseNode(xmlDoc.documentElement);

  // Sort fields by depth, then by order index (maintaining XML order)
  return fields.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    // If same depth and same parent, sort by order index
    if (a.parentPath === b.parentPath) {
      return (a.orderIndex || 0) - (b.orderIndex || 0);
    }
    // Otherwise maintain alphabetical for different parents at same depth
    return a.name.localeCompare(b.name);
  });
}

/**
 * Create a hierarchical tree structure of XML fields
 * @param {XMLDocument} xmlDoc - Parsed XML document
 * @returns {Object} Tree structure of fields
 */
export function createFieldTree(xmlDoc) {
  const tree = {
    name: xmlDoc.documentElement.nodeName,
    children: [],
    isRoot: true,
  };

  function buildTree(node, parentNode) {
    for (let child of node.children) {
      const childNode = {
        name: child.nodeName,
        children: [],
        hasText: child.textContent && child.textContent.trim().length > 0,
        textContent: child.textContent ? child.textContent.trim().substring(0, 50) : '',
        attributes: Array.from(child.attributes || []).map(attr => ({
          name: attr.name,
          value: attr.value,
        })),
      };

      parentNode.children.push(childNode);
      buildTree(child, childNode);
    }
  }

  buildTree(xmlDoc.documentElement, tree);
  return tree;
}

/**
 * Compare fields from multiple XML files
 * @param {Array} fileDataArray - Array of {filename, fields} objects
 * @returns {Object} Comparison results
 */
export function compareFields(fileDataArray) {
  if (fileDataArray.length === 0) {
    return {
      commonFields: [],
      uniqueFields: {},
      fieldDifferences: {},
    };
  }

  // Get all unique field names
  const allFieldNames = new Set();
  fileDataArray.forEach(fileData => {
    fileData.fields.forEach(field => {
      allFieldNames.add(field.name);
    });
  });

  // Find common fields (present in all files) - using paths to ensure exact hierarchy match
  // First, get all unique field paths across all files
  const allFieldPaths = new Set();
  fileDataArray.forEach(fileData => {
    fileData.fields.forEach(field => {
      allFieldPaths.add(field.path);
    });
  });

  // Find common field paths (paths that exist in ALL files with same structure)
  const commonFieldPaths = Array.from(allFieldPaths).filter(fieldPath => {
    return fileDataArray.every(fileData =>
      fileData.fields.some(f => f.path === fieldPath)
    );
  });

  // Track structural differences: fields with same name but different paths
  const structuralDifferences = new Map(); // fieldName -> { paths: Set, files: Map }
  
  // Build a map of field names to their paths in each file
  const fieldNameToPaths = new Map();
  allFieldNames.forEach(fieldName => {
    const pathsInFiles = new Map();
    fileDataArray.forEach(fileData => {
      const matchingFields = fileData.fields.filter(f => f.name === fieldName);
      if (matchingFields.length > 0) {
        pathsInFiles.set(fileData.filename, matchingFields.map(f => f.path));
      }
    });
    
    // Check if this field name appears in all files
    if (pathsInFiles.size === fileDataArray.length) {
      // Check if all files have the same path(s) for this field
      const allPaths = new Set();
      pathsInFiles.forEach(paths => {
        paths.forEach(path => allPaths.add(path));
      });
      
      // If field exists in all files but has different paths, it's a structural difference
      if (allPaths.size > 1) {
        structuralDifferences.set(fieldName, {
          paths: Array.from(allPaths),
          files: pathsInFiles
        });
      }
    }
    
    fieldNameToPaths.set(fieldName, pathsInFiles);
  });

  // Build common fields using reference file structure
  // Include fields that exist in all files (by name), using reference file structure for display
  const referenceFile = fileDataArray[0];
  
  // First, get all field names that exist in ALL files
  const commonFieldNames = Array.from(allFieldNames).filter(fieldName => {
    return fileDataArray.every(fileData =>
      fileData.fields.some(f => f.name === fieldName)
    );
  });

  // Build common fields from reference file structure
  // Include all fields from reference file that have the same name in all files
  const commonFields = referenceFile.fields
    .filter(field => commonFieldNames.includes(field.name))
    .map(field => {
      // Check if this field has structural differences (same name, different paths)
      const hasStructuralDiff = structuralDifferences.has(field.name);
      const structuralInfo = hasStructuralDiff ? structuralDifferences.get(field.name) : null;
      
      // Verify this exact path exists in all files
      const pathExistsInAllFiles = fileDataArray.every(fileData =>
        fileData.fields.some(f => f.path === field.path)
      );
      
      // Build alternative paths with file information
      let alternativePathsWithFiles = [];
      if (structuralInfo) {
        const currentPath = field.path;
        structuralInfo.paths.forEach(altPath => {
          if (altPath !== currentPath) {
            // Find which files have this alternative path
            const filesWithPath = [];
            structuralInfo.files.forEach((paths, filename) => {
              if (paths.includes(altPath)) {
                filesWithPath.push(filename);
              }
            });
            alternativePathsWithFiles.push({
              path: altPath,
              files: filesWithPath
            });
          }
        });
      }
      
      return {
        name: field.name,
        path: field.path,
        depth: field.depth,
        hasChildren: field.hasChildren,
        childCount: field.childCount,
        structuralDifference: hasStructuralDiff,
        pathExistsInAllFiles: pathExistsInAllFiles,
        alternativePaths: structuralInfo ? structuralInfo.paths.filter(p => p !== field.path) : [],
        alternativePathsWithFiles: alternativePathsWithFiles,
        orderIndex: field.orderIndex !== undefined ? field.orderIndex : 999999,
        parentPath: field.parentPath || ''
      };
    });
  // Don't sort here - preserve the original XML order from reference file

  // Find unique fields for each file (fields that exist ONLY in that file, not in any other file)
  const uniqueFields = {};
  fileDataArray.forEach(fileData => {
    const fileFieldPaths = new Set(fileData.fields.map(f => f.path));
    const fileFieldNames = new Set(fileData.fields.map(f => f.name));
    
    // Find fields that are unique to this file (present in this file but not in any other file)
    const uniqueToThisFile = fileData.fields.filter(field => {
      // Check if this field path exists in any other file
      const existsInOtherFile = fileDataArray.some(otherFile => {
        if (otherFile.filename === fileData.filename) return false; // Skip self
        return otherFile.fields.some(f => f.path === field.path);
      });
      return !existsInOtherFile;
    });
    
    uniqueFields[fileData.filename] = uniqueToThisFile.map(f => ({
      name: f.name,
      path: f.path,
      depth: f.depth
    }));
  });

  // Detailed field differences
  const fieldDifferences = {};
  allFieldNames.forEach(fieldName => {
    const differences = {
      fieldName: fieldName,
      presentIn: [],
      absentIn: [],
      depthVariations: {},
      nestingVariations: {},
    };

    fileDataArray.forEach(fileData => {
      const fieldData = fileData.fields.find(f => f.name === fieldName);
      if (fieldData) {
        differences.presentIn.push(fileData.filename);
        if (!differences.depthVariations[fieldData.depth]) {
          differences.depthVariations[fieldData.depth] = [];
        }
        differences.depthVariations[fieldData.depth].push(fileData.filename);
      } else {
        differences.absentIn.push(fileData.filename);
      }
    });

    fieldDifferences[fieldName] = differences;
  });

  return {
    commonFields,
    uniqueFields,
    fieldDifferences,
    structuralDifferences: Object.fromEntries(structuralDifferences),
    totalUniqueFields: allFieldNames.size,
  };
}

/**
 * Export fields to CSV format
 * @param {Array} fields - Array of field objects
 * @param {string} filename - Output filename
 * @returns {string} CSV content
 */
export function fieldsToCSV(fields, filename = 'fields.csv') {
  const headers = [
    'Field Name',
    'Depth',
    'Path',
    'Is Nested',
    'Has Children',
    'Child Count',
    'Has Text',
    'Text Content',
    'Attributes',
    'Occurrences',
  ];

  const rows = fields.map(field => [
    field.name,
    field.depth,
    field.path,
    field.isNested ? 'Yes' : 'No',
    field.hasChildren ? 'Yes' : 'No',
    field.childCount,
    field.hasText ? 'Yes' : 'No',
    `"${field.textContent.replace(/"/g, '""')}"`,
    field.attributes.join('; '),
    field.occurrences,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Export comparison results to CSV
 * @param {Object} comparison - Comparison results from compareFields
 * @param {Array} mergedFields - Optional merged fields array from all files
 * @returns {string} CSV content
 */
export function comparisonToCSV(comparison, mergedFields = null) {
  let csvContent = 'Field Comparison Report\n\n';

  // Merged View section (if provided)
  if (mergedFields && mergedFields.length > 0) {
    csvContent += 'Merged View (All Fields from All Files)\n';
    csvContent += 'Field Name,Path,Depth,Present In Files,Files Count\n';
    mergedFields.forEach(field => {
      const fieldName = field.name || '';
      const fieldPath = field.path || '';
      const fieldDepth = field.depth !== undefined ? field.depth : 0;
      const presentInFiles = field.presentInFiles ? field.presentInFiles.join('; ') : '';
      const filesCount = field.presentInFiles ? `${field.presentInFiles.length}` : '0';
      csvContent += `"${fieldName}","${fieldPath}",${fieldDepth},"${presentInFiles}","${filesCount}"\n`;
    });
    csvContent += '\n\n';
  }

  // Common fields section
  csvContent += 'Common Fields (Present in All Files)\n';
  csvContent += 'Field Name,Path,Depth,Structural Difference,Alternative Paths\n';
  comparison.commonFields.forEach(field => {
    const fieldName = typeof field === 'string' ? field : field.name;
    const fieldPath = typeof field === 'string' ? field : field.path;
    const fieldDepth = typeof field === 'string' ? 0 : field.depth;
    const hasStructuralDiff = typeof field === 'object' && field.structuralDifference ? 'Yes' : 'No';
    const altPaths = typeof field === 'object' && field.alternativePaths ? field.alternativePaths.join('; ') : '';
    csvContent += `"${fieldName}","${fieldPath}",${fieldDepth},"${hasStructuralDiff}","${altPaths}"\n`;
  });

  csvContent += '\n\nUnique Fields\n';
  csvContent += 'File Name,Field Name,Path,Depth\n';
  Object.entries(comparison.uniqueFields).forEach(([filename, fields]) => {
    fields.forEach(field => {
      const fieldName = typeof field === 'string' ? field : field.name;
      const fieldPath = typeof field === 'string' ? field : field.path;
      const fieldDepth = typeof field === 'string' ? 0 : field.depth;
      csvContent += `"${filename}","${fieldName}","${fieldPath}",${fieldDepth}\n`;
    });
  });

  csvContent += '\n\nField Differences\n';
  csvContent += 'Field Name,Present In,Absent In\n';

  Object.values(comparison.fieldDifferences).forEach(diff => {
    csvContent += `"${diff.fieldName}","${diff.presentIn.join('; ')}","${diff.absentIn.join('; ')}"\n`;
  });

  return csvContent;
}

/**
 * Export comparison results to Excel with multiple sheets
 * @param {Object} comparison - Comparison results from compareFields
 * @param {Array} mergedFields - Optional merged fields array from all files
 * @returns {Blob} Excel file blob
 */
export function comparisonToExcel(comparison, mergedFields = null) {
  const workbook = XLSX.utils.book_new();

  // Helper function to create a worksheet from array of objects
  const createWorksheet = (data, sheetName) => {
    if (!data || data.length === 0) {
      // Create empty sheet with headers
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  };

  // Merged View sheet
  if (mergedFields && mergedFields.length > 0) {
    const mergedData = mergedFields.map(field => ({
      'Field Name': field.name || '',
      'Path': field.path || '',
      'Depth': field.depth !== undefined ? field.depth : 0,
      'Present In Files': field.presentInFiles ? field.presentInFiles.join('; ') : '',
      'Files Count': field.presentInFiles ? field.presentInFiles.length : 0,
    }));
    createWorksheet(mergedData, 'Merged View');
  }

  // Common Fields sheet
  const commonData = comparison.commonFields.map(field => ({
    'Field Name': typeof field === 'string' ? field : field.name,
    'Path': typeof field === 'string' ? field : field.path,
    'Depth': typeof field === 'string' ? 0 : field.depth,
    'Structural Difference': typeof field === 'object' && field.structuralDifference ? 'Yes' : 'No',
    'Alternative Paths': typeof field === 'object' && field.alternativePaths ? field.alternativePaths.join('; ') : '',
  }));
  createWorksheet(commonData, 'Common Fields');

  // Unique Fields sheet
  const uniqueData = [];
  Object.entries(comparison.uniqueFields).forEach(([filename, fields]) => {
    fields.forEach(field => {
      uniqueData.push({
        'File Name': filename,
        'Field Name': typeof field === 'string' ? field : field.name,
        'Path': typeof field === 'string' ? field : field.path,
        'Depth': typeof field === 'string' ? 0 : field.depth,
      });
    });
  });
  createWorksheet(uniqueData, 'Unique Fields');

  // Field Differences sheet
  const differencesData = Object.values(comparison.fieldDifferences).map(diff => ({
    'Field Name': diff.fieldName,
    'Present In': diff.presentIn.join('; '),
    'Absent In': diff.absentIn.join('; '),
  }));
  createWorksheet(differencesData, 'Field Differences');

  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Get statistics about XML structure
 * @param {Array} fields - Array of field objects
 * @returns {Object} Statistics
 */
export function getXMLStatistics(fields) {
  const stats = {
    totalFields: fields.length,
    uniqueFieldNames: new Set(fields.map(f => f.name)).size,
    maxDepth: Math.max(...fields.map(f => f.depth), 0),
    nestedFields: fields.filter(f => f.isNested).length,
    fieldsWithChildren: fields.filter(f => f.hasChildren).length,
    fieldsWithText: fields.filter(f => f.hasText).length,
    fieldsWithAttributes: fields.filter(f => f.attributes.length > 0).length,
  };

  return stats;
}
