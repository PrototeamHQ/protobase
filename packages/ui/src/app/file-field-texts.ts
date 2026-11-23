import { Camera, Paperclip, Upload } from 'lucide-react'
import type { FieldModel } from '@protobase/schema'
import { useMediaQuery } from '../lib/use-media-query'
import { text as appText } from './messages'

// Browsers that open the camera for `capture` (phones and tablets) have the property; desktop browsers ignore the attribute
const capturable = () => typeof HTMLInputElement !== 'undefined' && 'capture' in HTMLInputElement.prototype

/**
 * What a file field says: a capture field on a touch device that opens the camera offers a photo to take, with the
 * phone's own chooser beside it for a photo taken before; elsewhere it picks an image file.
 */
export const useFileFieldTexts = (field: FieldModel, label: string) => {
  const touch = useMediaQuery('(pointer: coarse)')
  if (!field.file?.capture) {
    return { drop: appText('dropFile'), dropIcon: Upload, choose: appText('chooseFile'), chooseFor: appText('chooseFileFor', { label }), replace: appText('replace'), icon: Paperclip, camera: undefined }
  }
  const desktop = { drop: appText('dropPhoto'), dropIcon: Upload, choose: appText('choosePhoto'), chooseFor: appText('choosePhotoFor', { label }), replace: appText('replace'), icon: Camera, camera: undefined }
  if (!touch || !capturable()) return desktop
  return { ...desktop, drop: appText('noPhoto'), dropIcon: undefined, camera: { take: appText('takePhoto'), takeFor: appText('takePhotoFor', { label }), retake: appText('retake') } }
}
