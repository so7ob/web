import snapshot from './schema-v1.json' with { type: 'json' };
export interface ColumnDefinition {
  type: 'String' | 'Boolean' | 'DateTime' | 'Int' | 'Float';
  nullable: boolean; primary: boolean; unique: boolean; updated: boolean; indexed: boolean;
  default: { kind: string; value?: string | number | boolean } | null;
}
export interface RelationDefinition {
  model: string; many: boolean; nullable: boolean; tag: string | null;
  fields: string[]; references: string[]; onDelete: string;
  inverseFields?: string[]; localReferences?: string[];
}
export interface ModelDefinition {
  table: string; columns: Record<string, ColumnDefinition>;
  relations: Record<string, RelationDefinition>; indexes: string[][]; uniques: string[][];
}
// This snapshot is immutable. Future schema changes require a new migration.
export const schema = snapshot as Record<string, ModelDefinition>;
export function identifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error('Invalid database identifier');
  return `\`${name}\``;
}
