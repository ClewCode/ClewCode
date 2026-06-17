import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js';
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js';

export const PROMPT = `A tool for querying, validating, formatting, and minifying JSON data. Use this tool when you need to extract specific values from JSON, validate JSON structure, or transform JSON for storage/transmission.

## When to Use This Tool

1. **Query JSON** - Extract specific values, keys, or paths from JSON data using JSONPath expressions
2. **Validate JSON** - Check if JSON data matches an expected schema or structure
3. **Format JSON** - Pretty-print JSON with configurable indentation
4. **Minify JSON** - Compact JSON to remove unnecessary whitespace
5. **Convert to/from JSON** - Parse stringified JSON or stringify objects

## Features

- **query**: Extract data using JSONPath or key paths (e.g., "user.address.city", "items[0].name")
- **validate**: Validate JSON structure and optionally check against expected shape
- **format**: Pretty-print with custom indent (2, 4, or tab)
- **minify**: Remove all whitespace for compact storage
- **stringify**: Convert JavaScript object to JSON string
- **parse**: Convert JSON string to object (with optional validation)

## Examples

<example>
User: What's the email address in this JSON?
Assistant: *Uses json_path with query to extract the email*
\`\`\`json
{
  "user": {
    "name": "John",
    "email": "john@example.com"
  }
}
\`\`\`

<example>
User: Validate that this data has required fields
Assistant: *Uses json_path with validate to check structure*
Validates presence of required fields like "id", "name", "email"

<example>
User: Make this JSON compact for storage
Assistant: *Uses json_path with minify*
Removes all unnecessary whitespace

<example>
User: I have a JSON string, parse it
Assistant: *Uses json_path with parse*
Converts string to object for further processing
</example>

## Notes

- Use ${FILE_READ_TOOL_NAME} to get JSON content from files first
- Use ${FILE_WRITE_TOOL_NAME} to save processed JSON to files
- Supports nested key paths (dot notation) and array indices
- Query results can return multiple matches as arrays
`;

export const DESCRIPTION = 'Query, validate, format, and minify JSON data';
