---
title: Files and images
description: Uploaded files and images, where they are kept and how they are served.
---

- [File fields](/reference/files/#what-the-column-holds): A text column holds an uploaded file, with limits on type and size.
- [File storage](/reference/files/#providers): Files are kept on disk, or in a bucket of your own.
- [S3-compatible buckets](/reference/files/#s3-compatible-buckets) (beta): Files are kept in any bucket that speaks the S3 API, when the app runs on Bun.
- [Type detection](/reference/files/#how-the-type-is-decided): An upload's type is decided from its content, and a disguised file is refused.
- [Signed downloads](/reference/files/#downloads): Private files open through short-lived links that stop working once the record no longer holds the file.
- [Derived fields](/reference/files/#derived-fields): Width, height, size and type of each upload are written to other fields.
- [Image variants and placeholders](/reference/files/#image-variants-and-placeholders): Resized copies of uploaded images, and a blurred placeholder while they load.
- [External URLs](/reference/files/#external-urls): A file field can hold a link to a file on another site.
- [Image referrers](/reference/files/#image-referrers): Images from other sites load without telling them which page showed them.
- [File cleanup](/reference/files/#deleting-files): Replaced and cleared files are deleted later on a schedule, so a database restore still finds its files.
