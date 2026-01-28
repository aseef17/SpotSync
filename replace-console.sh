#!/bin/bash

# Script to replace console statements with logger across the codebase
# This will add logger imports and replace console.log/error/warn/info/debug

echo "Starting console -> logger replacement..."

# Find all TypeScript/JavaScript files in src directory
find /Users/aseef/Desktop/Google\ Places\ Project/place-lists-app/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) | while read file; do
  # Check if file contains console statements
  if grep -q "console\.\(log\|error\|warn\|info\|debug\)" "$file"; then
    echo "Processing: $file"
    
    # Check if logger is already imported
    if ! grep -q "import.*logger.*from.*logger" "$file"; then
      # Determine the correct relative path to logger.ts
      # Count directory depth
      depth=$(echo "$file" | sed 's|/Users/aseef/Desktop/Google Places Project/place-lists-app/src/||' | tr -cd '/' | wc -c)
      
      # Build relative path
      if [ $depth -eq 0 ]; then
        import_path="./utils/logger"
      else
        import_path=$(printf '../%.0s' $(seq 1 $depth))
        import_path="${import_path}utils/logger"
      fi
      
      # Add import after the last import statement
      sed -i '' "/^import /a\\
import { logger } from '$import_path';
" "$file"
    fi
    
    # Replace console statements
    sed -i '' 's/console\.error(/logger.error(/g' "$file"
    sed -i '' 's/console\.warn(/logger.warn(/g' "$file"
    sed -i '' 's/console\.info(/logger.info(/g' "$file"
    sed -i '' 's/console\.debug(/logger.debug(/g' "$file"
    sed -i '' 's/console\.log(/logger.debug(/g' "$file"  # log -> debug
  fi
done

echo "Replacement complete!"
echo "Note: Please review the changes and adjust import paths if needed."
