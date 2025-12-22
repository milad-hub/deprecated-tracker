export interface CustomTag {
  id: string;
  tag: string;
  label: string;
  description: string;
  enabled: boolean;
  color: string;
  createdAt: number;
}

export interface CustomTagsConfig {
  tags: CustomTag[];
  version: string;
}
