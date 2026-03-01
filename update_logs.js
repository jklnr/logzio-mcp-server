const fs = require('fs');

function updateFile(file, importAnchor) {
  let content = fs.readFileSync(file, 'utf8');
  
  const startStr = '/**\n * Extract key information from log entry for summary\n */';
  const endStr = '  return formatted;\n}\n';
  
  const startIndex = content.indexOf(startStr);
  let endIndex = content.indexOf(endStr, startIndex);
  if (startIndex !== -1 && endIndex !== -1) {
    endIndex += endStr.length;
    const toReplace = content.substring(startIndex, endIndex);
    content = content.replace(toReplace, '');
    
    // Add import
    const importStr = "import { formatLogEntry } from '../utils/logs.js';\n";
    content = content.replace(importAnchor, importStr + importAnchor);
    
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`Could not find block in ${file}`);
  }
}

updateFile('src/tools/search.ts', "import { parseTimeRange }");
updateFile('src/tools/query.ts', "import { buildLuceneQuery }");
