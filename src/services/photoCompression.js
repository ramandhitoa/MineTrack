const MAX_GALLERY_PHOTO_BYTES = 100 * 1024;
const JPEG_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Foto tidak dapat diproses.'));
      }
    };
    reader.onerror = () => reject(new Error('Foto tidak dapat diproses.'));
    reader.readAsDataURL(blob);
  });
}

export async function compressGalleryPhoto(file) {
  if (!file || (file.type && !file.type.startsWith('image/'))) {
    throw new Error('File yang dipilih bukan gambar yang valid.');
  }

  let imageUrl;

  try {
    imageUrl = URL.createObjectURL(file);
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('File yang dipilih bukan gambar yang valid.'));
      image.src = imageUrl;
    });

    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error('File yang dipilih bukan gambar yang valid.');
    }

    const maxDimension = 1600;
    if (Math.max(width, height) > maxDimension) {
      const ratio = maxDimension / Math.max(width, height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      throw new Error('Browser tidak mendukung pemrosesan foto.');
    }

    while (true) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      for (const quality of JPEG_QUALITIES) {
        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        });

        if (blob && blob.type === 'image/jpeg' && blob.size <= MAX_GALLERY_PHOTO_BYTES) {
          return await blobToDataUrl(blob);
        }
      }

      if (width === 1 && height === 1) break;

      width = Math.max(1, Math.floor(width * 0.75));
      height = Math.max(1, Math.floor(height * 0.75));
    }

    throw new Error(
      'Foto tidak dapat dikompres sampai maksimal 100 KB. Silakan pilih foto lain.'
    );
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('File yang dipilih bukan gambar yang valid.');
  } finally {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }
}