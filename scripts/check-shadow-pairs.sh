#!/bin/bash
# Guard against .ts/.js shadow pairs regression in src/
# Fails if any .ts file has a matching .js sibling (indicates shadow reconciliation regression)
# Exit code 0 = no shadows found, 1 = shadows detected

set -euo pipefail

SHADOW_DIR="${1:-src}"

if [ ! -d "$SHADOW_DIR" ]; then
  echo "Error: directory '$SHADOW_DIR' not found"
  exit 1
fi

# Find all .ts files and check if a .js twin exists
SHADOWS=()
while IFS= read -r ts_file; do
  js_file="${ts_file%.ts}.js"
  if [ -f "$js_file" ]; then
    SHADOWS+=("$ts_file" "$js_file")
  fi
done < <(find "$SHADOW_DIR" -name "*.ts" -type f)

if [ ${#SHADOWS[@]} -eq 0 ]; then
  echo "✓ No .ts/.js shadow pairs found in $SHADOW_DIR"
  exit 0
fi

echo "✗ Shadow pairs detected (regression - .ts and .js twins in src/):"
# Print pairs grouped
for ((i = 0; i < ${#SHADOWS[@]}; i += 2)); do
  ts_file="${SHADOWS[i]}"
  js_file="${SHADOWS[i+1]}"
  echo "  PAIR: $ts_file"
  echo "        $js_file"
done
echo ""
echo "All .js shadows should have been removed from src/."
echo "See CLAUDE.md: 'JS Shadow Reconciliation Complete'"
exit 1
