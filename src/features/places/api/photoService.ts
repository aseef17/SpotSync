import { ref, uploadBytes, getDownloadURL, deleteObject, getMetadata } from 'firebase/storage';
import { logger } from '@/utils/logger';
import { storage } from '@/lib/firebase';

function isGooglePlacesPhotoRef(url: string): boolean {
  return (
    url.includes('places.googleapis.com/v1/') ||
    url.startsWith('places/') ||
    url.includes('/photos/')
  );
}

function parseGooglePhotoMediaName(urlOrName: string): string | null {
  const stripped = urlOrName.split('?')[0];
  const fromPath = stripped.match(/places\/[^/]+\/photos\/[^/]+/);
  if (fromPath) {
    return `${fromPath[0]}/media`;
  }
  return null;
}

export class PhotoService {
  /**
   * Places photo /media redirects are CORS-blocked in fetch(); skipHttpRedirect returns JSON
   * with a short-lived photoUri that we can download separately.
   */
  /** Returns false when Google rejects the photo resource (expired or wrong place id in path). */
  static async isGooglePhotoRefValid(urlOrName: string): Promise<boolean> {
    const mediaName = parseGooglePhotoMediaName(urlOrName);
    if (!mediaName) {
      return false;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!apiKey) {
      return false;
    }

    try {
      const params = new URLSearchParams({
        skipHttpRedirect: 'true',
        maxHeightPx: '120',
        maxWidthPx: '120',
        key: apiKey,
      });
      const response = await fetch(
        `https://places.googleapis.com/v1/${mediaName}?${params.toString()}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private static async resolveGooglePhotoUri(urlOrName: string): Promise<string | null> {
    const mediaName = parseGooglePhotoMediaName(urlOrName);
    if (!mediaName) {
      return null;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!apiKey) {
      logger.warn('Missing API key for Google photo URI resolution');
      return null;
    }

    try {
      const params = new URLSearchParams({
        skipHttpRedirect: 'true',
        maxHeightPx: '1200',
        maxWidthPx: '1200',
        key: apiKey,
      });
      const response = await fetch(
        `https://places.googleapis.com/v1/${mediaName}?${params.toString()}`
      );
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn('Google photo URI resolution failed:', response.status, body.slice(0, 200));
        return null;
      }
      const data = (await response.json()) as { photoUri?: string };
      return data.photoUri ?? null;
    } catch (error) {
      logger.debug('Google photo URI resolution error:', error);
      return null;
    }
  }

  private static async fetchBlobFromUrl(url: string): Promise<Blob | null> {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.blob();
      }
    } catch (error) {
      logger.debug('Direct photo URL fetch failed:', error);
    }
    return this.fetchPhotoBlobViaImage(url);
  }

  private static async fetchGooglePhotoBlob(
    urlOrName: string,
    rawRef?: string
  ): Promise<Blob | null> {
    const candidates = [rawRef, urlOrName].filter(
      (value, index, array): value is string =>
        typeof value === 'string' && value.length > 0 && array.indexOf(value) === index
    );

    for (const candidate of candidates) {
      const photoUri = await this.resolveGooglePhotoUri(candidate);
      if (photoUri) {
        const fromUri = await this.fetchBlobFromUrl(photoUri);
        if (fromUri) {
          return fromUri;
        }
      }
    }

    for (const candidate of candidates) {
      const fromImage = await this.fetchPhotoBlobViaImage(candidate);
      if (fromImage) {
        return fromImage;
      }
    }

    return null;
  }

  /** True when a Firebase Storage download URL returns image data (404 => false). */
  static async storageUrlExists(url: string): Promise<boolean> {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch (error) {
      logger.debug('Firebase storage URL check failed:', error);
      return false;
    }
  }
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
  private static probeImageLoads(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  private static fetchPhotoBlobViaImage(url: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            (blob) => resolve(blob),
            'image/jpeg',
            0.92
          );
        } catch (error) {
          logger.debug('Canvas export failed for photo URL:', error);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  static async remotePhotoUrlLoads(fetchUrl: string, photoCache: Cache | null): Promise<boolean> {
    if (photoCache) {
      const cached = await photoCache.match(fetchUrl);
      if (cached?.ok) {
        return true;
      }
    }

    if (isGooglePlacesPhotoRef(fetchUrl)) {
      const photoUri = await this.resolveGooglePhotoUri(fetchUrl);
      if (photoUri) {
        return this.probeImageLoads(photoUri);
      }
      return this.probeImageLoads(fetchUrl);
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
  static async fetchPhotoBlob(
    fetchUrl: string,
    photoCache: Cache | null,
    rawRef?: string
  ): Promise<Blob | null> {
    if (photoCache) {
      const cached = await photoCache.match(fetchUrl);
      if (cached?.ok) {
        return cached.blob();
      }
    }

    if (isGooglePlacesPhotoRef(fetchUrl) || (rawRef && isGooglePlacesPhotoRef(rawRef))) {
      const blob = await this.fetchGooglePhotoBlob(fetchUrl, rawRef);
      if (blob && photoCache) {
        await photoCache.put(fetchUrl, new Response(blob));
      }
      return blob;
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
