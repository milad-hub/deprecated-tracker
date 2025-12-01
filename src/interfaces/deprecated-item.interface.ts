export type DeprecatedItemKind =
  | 'method'
  | 'property'
  | 'class'
  | 'interface'
  | 'function'
  | 'usage';

export interface DeprecatedItem {
  name: string;
  fileName: string;
  filePath: string;
  line: number;
  character: number;
  kind: DeprecatedItemKind;
  deprecatedDeclaration?: {
    name: string;
    filePath: string;
    fileName: string;
    line: number;
  };
  severity?: 'info' | 'warning' | 'error';
  deprecationReason?: string;
}
