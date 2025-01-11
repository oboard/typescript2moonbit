export interface GeneratorState {
  generatedEnums: Set<string>;
  enumDefinitions: string;
  generatedTypeAliases: Set<string>;
  typeAliasDefinitions: string;
} 