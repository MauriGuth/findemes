import { type Receipt, type ReceiptUpload } from '@findemes/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { ApiError, apiPost } from './api';

/** CLAUDE.md: max 1600 px on the long side, JPEG 80. */
const MAX_SIDE = 1600;

export type PhotoSource = 'camera' | 'library';

/** Opens the camera or the gallery; null when the user cancels. */
export async function pickPhoto(source: PhotoSource): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new ApiError(
        0,
        'Necesitamos la cámara para sacarle foto al ticket. Activala en Ajustes.',
      );
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0] ?? null);
}

/** Shrinks the photo on the phone before it travels: less data and faster reading. */
async function compress(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/** Compresses, uploads with a presigned URL and registers the ticket; Claude reads it next. */
export async function uploadReceipt(asset: ImagePicker.ImagePickerAsset): Promise<Receipt> {
  const uri = await compress(asset);
  const upload = await apiPost<ReceiptUpload>('/receipts/upload-url');
  const blob = await (await fetch(uri)).blob();
  const put = await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!put.ok) throw new ApiError(put.status, 'No pudimos subir la foto. Probá de nuevo.');
  return apiPost<Receipt>('/receipts', { key: upload.key });
}
