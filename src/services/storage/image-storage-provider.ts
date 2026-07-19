export type StoredImage = {
  id: string;
  originalUrl: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
};

export interface ImageStorageProvider {
  upload(file: File, onProgress?: (progress: number) => void): Promise<StoredImage>;
  delete(imageId: string): Promise<void>;
}

export const localPreviewStorage: ImageStorageProvider = {
  async upload(file, onProgress) {
    onProgress?.(100);
    return { id: crypto.randomUUID(), originalUrl: URL.createObjectURL(file), width: 0, height: 0 };
  },
  async delete() {
    return Promise.resolve();
  },
};
