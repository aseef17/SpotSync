import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { logger } from '@/utils/logger';
import { storage } from '@/lib/firebase';

export class PhotoService {
  static async compressImage(
    file: File,
    maxWidth: number = 1920,
    quality: number = 0.8
  ): Promise<File> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.src = URL.createObjectURL(file);
    });
  }

  static async uploadPhoto(file: File, path: string): Promise<string> {
    try {
      const compressedFile = await this.compressImage(file);

      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      return downloadURL;
    } catch (error) {
      logger.error('Error uploading photo:', error);
      throw error;
    }
  }

  static async uploadPlacePhoto(file: File, listId: string, placeId: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `${timestamp}_${file.name}`;
    const path = `places/${listId}/${placeId}/${filename}`;

    return this.uploadPhoto(file, path);
  }

  static async uploadProfilePhoto(file: File, userId: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `${timestamp}_${file.name}`;
    const path = `profiles/${userId}/${filename}`;

    return this.uploadPhoto(file, path);
  }

  static async deletePhoto(url: string): Promise<void> {
    try {
      const urlParts = url.split('/o/')[1];
      if (!urlParts) throw new Error('Invalid Firebase Storage URL');

      const path = decodeURIComponent(urlParts.split('?')[0]);
      const storageRef = ref(storage, path);

      await deleteObject(storageRef);
    } catch (error) {
      logger.error('Error deleting photo:', error);
      throw error;
    }
  }

  static validateImageFile(file: File): { valid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'Please select a valid image file (JPEG, PNG, or WebP)',
      };
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'Image file size must be less than 10MB',
      };
    }

    return { valid: true };
  }

  static async createThumbnail(file: File, size: number = 300): Promise<File> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = size;
        canvas.height = size;

        const minDimension = Math.min(img.width, img.height);
        const x = (img.width - minDimension) / 2;
        const y = (img.height - minDimension) / 2;

        ctx?.drawImage(img, x, y, minDimension, minDimension, 0, 0, size, size);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const thumbnailFile = new File([blob], `thumb_${file.name}`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(thumbnailFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.8
        );
      };

      img.src = URL.createObjectURL(file);
    });
  }
}
