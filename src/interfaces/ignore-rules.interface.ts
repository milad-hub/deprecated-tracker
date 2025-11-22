export interface IgnoreRules {
  files: string[];
  methods: { [filePath: string]: string[] };
  methodsGlobal?: string[];
}
