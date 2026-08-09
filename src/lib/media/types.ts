export interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  folderCount?: number;
  imageCount?: number;
}

export interface MediaImage {
  id: string;
  folderId: string | null;
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  createdAt: string;
}

export interface Crumb {
  id: string;
  name: string;
}
