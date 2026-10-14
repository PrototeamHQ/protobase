import type { FieldAccess } from './access/types'
import { Field, type FieldMeta } from './field'
import { checkedAccept, checkedProvider, checkedVariant, checkedVariants, parseSize, type FileOptions, type FileProcessor, type ImageVariant, type ImageVariantOptions } from './files/file-options'

/** `f.file()`: a text column holding a file's URI, uploaded through `:upload`. See [Files](website/src/content/docs/reference/files.mdx). */
export class FileField<V> extends Field<V> {
  /** Allowed types, checked against the type detected from the content: `['image/*', 'application/pdf']`. */
  accept(types: readonly string[]) {
    return this.withFile({ accept: checkedAccept(types) })
  }

  /** The largest upload, as bytes or text such as `10 MB`; default 50 MB. */
  maxSize(size: number | string) {
    return this.withFile({ maxSize: parseSize(size) })
  }

  /** Stored with the `public` provider, at a permanent URL anyone with it may open. */
  public() {
    return this.storage('public')
  }

  /** Stored with this provider of `files.providers`; default `private`. */
  storage(provider: string) {
    return this.withFile({ provider: checkedProvider(provider) })
  }

  /**
   * Values computed from each upload, written to other fields of the resource (read-only ones) in the same write as the
   * file: `{ image_width: imageSize('width') }`. Clearing the file clears them.
   */
  derive(processors: Record<string, FileProcessor>) {
    return this.withFile({ derive: { ...this.meta.file!.derive, ...processors } })
  }

  /**
   * Computes a ThumbHash of each image into a read-only text field (`photo_placeholder`), which the admin app shows
   * while the image loads. Other files leave it null.
   */
  placeholder(field: string) {
    return this.withFile({ placeholder: field })
  }

  /**
   * Resized copies of each image, stored beside it under these names: `{ card: { width: 640, height: 480, fit: 'cover',
   * format: 'webp' } }`. `{ original }` stores that image instead of the upload. Other files get none.
   */
  variants(variants: Record<string, ImageVariant>, options: ImageVariantOptions = {}) {
    return this.withFile({
      variants: { ...this.meta.file!.variants, ...checkedVariants(variants) },
      ...(options.original && { original: checkedVariant('The original', options.original) }),
    })
  }

  /**
   * Also takes an https URL of a file elsewhere, such as `https://images.example.com/photos/42.jpg`, stored as it is:
   * never uploaded, without variants, and drawn from that address. See
   * [External URLs](website/src/content/docs/reference/files.mdx#external-urls).
   */
  externalUrls() {
    return this.withFile({ external: true })
  }

  /** The column is nullable: the field may hold no file. */
  override optional() {
    return this.with({ nullable: true }) as unknown as FileField<V | null>
  }

  /** Never written through the API. */
  override readOnly() {
    return this.with({ readOnly: true })
  }

  /** The column, when it is not the snake_case of the field's name. */
  override column(name: string) {
    return this.with({ column: name })
  }

  /** Role-based rules for reading and writing the file; uploading needs write access to the field. */
  override access(rules: FieldAccess) {
    return this.with({ access: { ...this.meta.access, ...rules } })
  }

  /** A copy of the field with `patch` applied, which every option returns. */
  protected override with(patch: Partial<FieldMeta>): FileField<V> {
    return new FileField<V>(this.def, { ...this.meta, ...patch })
  }

  private withFile(patch: Partial<FileOptions>) {
    return this.with({ file: { ...this.meta.file!, ...patch } })
  }
}
