import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiPath = path.resolve(__dirname, '../../../contracts/openapi.yaml');
const outputPath = path.resolve(__dirname, '../src/types.gen.ts');

async function generate() {
  console.log(`Generating types from: ${openApiPath}`);
  if (!fs.existsSync(openApiPath)) {
    console.error(`Error: OpenAPI spec not found at ${openApiPath}`);
    process.exit(1);
  }

  const ast = await openapiTS(new URL(`file://${openApiPath}`));
  const contents = astToString(ast);
  fs.writeFileSync(outputPath, contents, 'utf8');
  console.log(`Successfully generated types to: ${outputPath}`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
