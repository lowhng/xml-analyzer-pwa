/**
 * XML Parser and Analysis Utility
 * Handles parsing, field detection, nesting analysis, and comparison
 */

/**
 * Parse XML string and extract field information
 * @param {string} xmlString - The XML content as a string
 * @returns {Object} Parsed XML data with field information
 */
export function parseXML(xmlString) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

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

  function traverseNode(node, depth = 0, parentPath = '') {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const nodeName = node.nodeName;
      const path = parentPath ? `${parentPath} > ${nodeName}` : nodeName;

      // Create field key for deduplication
      const fieldKey = `${nodeName}|${depth}`;

      if (!fieldMap.has(fieldKey)) {
        const field = {
          name: nodeName,
          depth: depth,
          path: path,
          isNested: depth > 0,
          hasChildren: node.children.length > 0,
          childCount: node.children.length,
          hasText: node.textContent && node.textContent.trim().length > 0,
          textContent: node.textContent ? node.textContent.trim().substring(0, 100) : '',
          attributes: Array.from(node.attributes || []).map(attr => attr.name),
          occurrences: 1,
        };

        fieldMap.set(fieldKey, field);
        fields.push(field);
      } else {
        // Increment occurrence count for duplicate fields
        const existingField = fieldMap.get(fieldKey);
        existingField.occurrences += 1;
      }

      // Traverse children
      for (let child of node.children) {
        traverseNode(child, depth + 1, path);
      }
    }
  }

  traverseNode(xmlDoc.documentElement);

  // Sort fields by depth and name
  return fields.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
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

  // Find common fields (present in all files)
  const commonFields = Array.from(allFieldNames).filter(fieldName => {
    return fileDataArray.every(fileData =>
      fileData.fields.some(f => f.name === fieldName)
    );
  });

  // Find unique fields for each file
  const uniqueFields = {};
  fileDataArray.forEach(fileData => {
    const fileFieldNames = new Set(fileData.fields.map(f => f.name));
    uniqueFields[fileData.filename] = Array.from(allFieldNames).filter(
      fieldName => !fileFieldNames.has(fieldName)
    );
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
 * @returns {string} CSV content
 */
export function comparisonToCSV(comparison) {
  let csvContent = 'Field Comparison Report\n\n';

  // Common fields section
  csvContent += 'Common Fields (Present in All Files)\n';
  csvContent += 'Field Name\n';
  comparison.commonFields.forEach(field => {
    csvContent += `${field}\n`;
  });

  csvContent += '\n\nField Differences\n';
  csvContent += 'Field Name,Present In,Absent In\n';

  Object.values(comparison.fieldDifferences).forEach(diff => {
    csvContent += `"${diff.fieldName}","${diff.presentIn.join('; ')}","${diff.absentIn.join('; ')}"\n`;
  });

  return csvContent;
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
