export interface IgnoreRules {
  files: string[];
  methods: { [filePath: string]: string[] };
  filePatterns?: string[];
  methodPatterns?: string[];
}
