import { ref, uploadBytes, getDownloadURL, deleteObject, getMetadata } from 'firebase/storage';
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
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^/.]+$/, '') + '.webp',
                {
                  type: 'image/webp',
                  lastModified: Date.now(),
                }
              );
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/webp',
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
      const metadata = {
        cacheControl: 'public, max-age=31536000',
      };
      const snapshot = await uploadBytes(storageRef, compressedFile, metadata);
      const downloadURL = await getDownloadURL(snapshot.ref);

      return downloadURL;
    } catch (error) {
      logger.error('Error uploading photo:', error);
      throw error;
    }
  }

  static async getSharedPlacePhotoUrl(
    googlePlaceId: string,
    photoId: string
  ): Promise<string | null> {
    const webpPath = `places/shared/${googlePlaceId}/photo_${photoId}.webp`;
    const webpRef = ref(storage, webpPath);

    try {
      await getMetadata(webpRef);
      return await getDownloadURL(webpRef);
    } catch {
      try {
        const legacyRef = ref(storage, `places/shared/${googlePlaceId}/photo_1.jpg`);
        await getMetadata(legacyRef);
        return await getDownloadURL(legacyRef);
      } catch {
        return null;
      }
    }
  }

  /**
   * Returns true when the remote photo URL returns loadable image data.
   * Uses the browser Cache API (`places-photo-cache`) when available.
   */
  static async remotePhotoUrlLoads(fetchUrl: string, photoCache: Cache | null): Promise<boolean> {
    if (photoCache) {
      const cached = await photoCache.match(fetchUrl);
      if (cached?.ok) {
        return true;
      }
    }

    try {
      const headResponse = await fetch(fetchUrl, { method: 'HEAD' });
      if (headResponse.ok) {
        return true;
      }
    } catch {
      // HEAD is often blocked cross-origin; fall through to GET.
    }

    try {
      const response = await fetch(fetchUrl);
      if (response.ok) {
        if (photoCache) {
          await photoCache.put(fetchUrl, response.clone());
        }
        return true;
      }
    } catch (error) {
      logger.debug('Photo URL validation failed:', error);
    }

    return false;
  }

  /**
   * Fetch image bytes for upload. Reuses cache when the URL was validated earlier.
   */
  static async fetchPhotoBlob(fetchUrl: string, photoCache: Cache | null): Promise<Blob | null> {
    if (photoCache) {
      const cached = await photoCache.match(fetchUrl);
      if (cached?.ok) {
        return cached.blob();
      }
    }

    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        return null;
      }
      if (photoCache) {
        await photoCache.put(fetchUrl, response.clone());
      }
      return response.blob();
    } catch (error) {
      logger.debug('Photo fetch failed:', error);
      return null;
    }
  }

  static async uploadSharedPlacePhoto(
    file: File,
    googlePlaceId: string,
    photoId: string
  ): Promise<string> {
    const path = `places/shared/${googlePlaceId}/photo_${photoId}.webp`;
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
              const thumbnailFile = new File(
                [blob],
                `thumb_${file.name.replace(/\.[^/.]+$/, '')}.webp`,
                {
                  type: 'image/webp',
                  lastModified: Date.now(),
                }
              );
              resolve(thumbnailFile);
            } else {
              resolve(file);
            }
          },
          'image/webp',
          0.8
        );
      };

      img.src = URL.createObjectURL(file);
    });
  }
}
